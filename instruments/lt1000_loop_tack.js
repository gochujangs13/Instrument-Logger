import { syslogPanelHTML, dateStr } from './_utils.js';

// ── Module-level state ────────────────────────────────────────────────────────
let S = null;

const LT_SK = 'lt1000_settings';
function saveLtSettings() {
  localStorage.setItem(LT_SK, JSON.stringify({
    sample:      document.getElementById('lt_sample')?.value      ?? 'Sample A',
    tol:         document.getElementById('lt_tol')?.value         ?? '20',
    repeatCount: document.getElementById('lt_repeatCount')?.value ?? '1',
  }));
}

function init() {
  const sv = JSON.parse(localStorage.getItem(LT_SK) || '{}');
  S = {
    results:    [],
    nextNo:     1,
    curGroup:   null,
    curIdx:     0,
    importing:  false,
    rxBuffer:   '',
    eotTimer:   null,
    repeatCount: parseInt(sv.repeatCount || '1') || 1,
    _yMin: null, _yMax: null, _yMaxInp: null, _yMinInp: null, _yResetBtn: null,
  };
}

// ── Y-axis overlay helper ─────────────────────────────────────────────────────
function _attachYOverlay(graphAreaEl, redrawFn) {
  if (!graphAreaEl) return;
  const overlay = document.createElement('div');
  overlay.className = 'y-overlay';
  graphAreaEl.appendChild(overlay);
  const make = cls => {
    const inp = document.createElement('input');
    inp.type = 'number'; inp.step = 'any'; inp.placeholder = t('y_axis_auto');
    inp.className = `y-axis-inp ${cls}`;
    overlay.appendChild(inp);
    return inp;
  };
  S._yMaxInp = make('y-axis-max');
  S._yMinInp = make('y-axis-min');
  const resetBtn = document.createElement('button');
  resetBtn.className = 'y-reset-btn'; resetBtn.title = t('y_axis_auto'); resetBtn.textContent = '↺';
  resetBtn.style.display = 'none';
  overlay.appendChild(resetBtn);
  S._yResetBtn = resetBtn;
  const apply = () => {
    S._yMin = S._yMinInp.value !== '' ? parseFloat(S._yMinInp.value) : null;
    S._yMax = S._yMaxInp.value !== '' ? parseFloat(S._yMaxInp.value) : null;
    resetBtn.style.display = (S._yMin !== null || S._yMax !== null) ? '' : 'none';
    redrawFn();
  };
  for (const inp of [S._yMaxInp, S._yMinInp]) {
    inp.addEventListener('change', apply);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); apply(); } });
  }
  resetBtn.onclick = () => {
    S._yMin = null; S._yMax = null;
    S._yMaxInp.value = ''; S._yMinInp.value = '';
    resetBtn.style.display = 'none';
    redrawFn();
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SAMPLE_RATE = 400;
const DT          = 1 / SAMPLE_RATE;
const SPEED_MM_S  = 5.08;
const DX_MM       = SPEED_MM_S * DT;
const EOT_SILENCE = 800;
const MIN_POINTS  = 100;
const MIN_PEAK_GF = 2.0;

const PALETTE = ['#4da3ff','#2bd4a0','#ffb454','#ff6b8a','#b48cff','#3fe0d4','#f0d24d','#ff8a5c'];

// ── Helpers ───────────────────────────────────────────────────────────────────
const t   = k => app?.t(k) ?? k;
const $id = id => document.getElementById(id);

function fmtF(gf, dec) { return gf.toFixed(dec !== undefined ? dec : 1); }
function escAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── EOT / receive handling ────────────────────────────────────────────────────
// SerialController splits by \r\n and calls onLine() per line.
// LT-1000 sends one float per line; we accumulate and use 800ms silence to
// detect end-of-transmission instead of acting on each individual line.
function clearEotTimer() {
  if (S.eotTimer) { clearTimeout(S.eotTimer); S.eotTimer = null; }
}

function onLine(line) {
  if (!line.trim()) return;
  S.rxBuffer += line + '\n';

  const pts = S.rxBuffer.trim().split(/\s+/).filter(s => s).length;
  // 큰 값 표시는 그대로 두고 상태 텍스트만 업데이트
  const st = document.getElementById('liveStatus');
  if (st) { st.textContent = `수신 중... (${pts}pt)`; st.className = 'disp-status collecting'; }

  clearEotTimer();
  S.eotTimer = setTimeout(onEndOfTransmission, EOT_SILENCE);
}

function onEndOfTransmission() {
  const raw = S.rxBuffer.trim();
  S.rxBuffer = '';
  clearEotTimer();
  app._setDisplay('— — —', 'gf', 'ready', 'READY');

  if (!raw) return;

  const tokens = raw.split(/[\s,\r\n]+/);
  const allVals = [];
  for (const tok of tokens) {
    const v = parseFloat(tok);
    if (!isNaN(v)) allVals.push(v);
  }
  if (!allVals.length) { app.log(t('lt_log_no_parse'), 'err'); return; }

  const { header, curve } = splitHeaderAndCurve(allVals);
  if (header.length > 0) {
    const testNum = Math.round(header[0]);
    app.log(`${t('lt_log_header')} — P${testNum} (${header.length})`);
    if (testNum >= 20) showMemFullModal();
  }
  app.log(`${t('lt_log_curve')}: ${curve.length}pt`);

  const devicePeak = header.length >= 2 ? header[1] : null;
  importTest(curve, true, devicePeak);
}

function splitHeaderAndCurve(vals) {
  const ZERO_THRESH = 0.1, ZERO_RUN = 3;
  for (let i = 0; i <= Math.min(vals.length - ZERO_RUN, 20); i++) {
    if (vals.slice(i, i + ZERO_RUN).every(v => Math.abs(v) < ZERO_THRESH))
      return { header: vals.slice(0, i), curve: vals.slice(i) };
  }
  return { header: [], curve: vals };
}

// ── Metrics ───────────────────────────────────────────────────────────────────
function computeMetrics(f) {
  const n = f.length;
  const peak = Math.max(...f), min = Math.min(...f);
  let sumPos = 0, sumSqPos = 0;
  for (const x of f) { if (x > 0) { sumPos += x; sumSqPos += x * x; } }
  const avg      = sumPos / n;
  const variance = Math.max(0, sumSqPos / n - avg * avg);
  const stdev    = Math.sqrt(variance);
  const workMJ   = f.reduce((s, v) => s + Math.max(0, v), 0) * 9.81e-6 * DX_MM * 1000;
  let peakIdx = 0;
  for (let i = 0; i < n; i++) if (f[i] > f[peakIdx]) peakIdx = i;
  const ratio = peakIdx / n;
  const mode  = ratio < 0.3 ? t('lt_mode_snap') : ratio < 0.6 ? t('lt_mode_std') : t('lt_mode_creep');
  return { min, peak, avg, variance, stdev, workMJ, mode, peakIdx };
}

// ── Import ────────────────────────────────────────────────────────────────────
function importTest(vals, auto = false, devicePeak = null) {
  if (S.importing) return;
  S.importing = true;
  try {
    const peak = Math.max(...vals), n = vals.length;
    if (n < MIN_POINTS || peak <= MIN_PEAK_GF) {
      app.log(`${t('lt_abort_log')} ${n}, Peak: ${peak.toFixed(1)} gf ${t('lt_abort_below')}`, 'err');
      showAbortModal(n, peak); return;
    }
    const m = computeMetrics(vals);

    // ── 체크박스 재측정 확인 ──
    const chkd = getChecked();
    if (chkd.length > 1 && !auto) { alert(t('pt_remeasure_one')); return; }
    const reNo = chkd.length === 1 ? chkd[0] : null;

    if (reNo !== null) {
      const r = S.results.find(x => x.no === reNo);
      if (r) { r.data = vals; Object.assign(r, m); r.time = new Date().toLocaleString('ko-KR') + ' (재측정)'; }
      if (devicePeak !== null)
        app.log(`Device Peak: ${devicePeak.toFixed(1)} gf  /  Calc Peak: ${m.peak.toFixed(1)} gf`);
      app.log(`재측정 완료 (No.${reNo})  Peak ${m.peak.toFixed(1)} gf  Work ${m.workMJ.toFixed(3)} mJ`, 'ok');
      app._setDisplay(fmtF(m.peak, 1), 'gf');
      document.querySelectorAll('.lt-row-chk').forEach(c => c.checked = false);
      const sa0 = $id('lt_selectAll'); if (sa0) sa0.checked = false;
      renderTable(); drawGraph();
      return;
    }

    // ── 신규 측정 추가 ──
    const sampleName = $id('lt_sample')?.value || 'Sample';
    const repeat = Math.max(1, parseInt($id('lt_repeatCount')?.value || '1') || 1);
    if (sampleName !== S.curGroup) { S.curGroup = sampleName; S.curIdx = 1; }
    else S.curIdx++;

    let label;
    if (repeat === 1) {
      label = `${sampleName}-${S.curIdx}`;
    } else {
      const groupNo = Math.ceil(S.curIdx / repeat);
      const subNo   = ((S.curIdx - 1) % repeat) + 1;
      label = `${sampleName}-${groupNo}-${subNo}`;
    }

    const color = PALETTE[S.results.length % PALETTE.length];
    S.results.push({ no: S.nextNo++, label, group: sampleName, idx: S.curIdx,
      time: new Date().toLocaleString('ko-KR'), color, data: vals, ...m });

    if (devicePeak !== null)
      app.log(`Device Peak: ${devicePeak.toFixed(1)} gf  /  Calc Peak: ${m.peak.toFixed(1)} gf`);
    app.log(`${t('lt_log_added')}: ${label}  Peak ${m.peak.toFixed(1)} gf  Work ${m.workMJ.toFixed(3)} mJ`, 'ok');

    app._setDisplay(fmtF(m.peak, 1), 'gf');
    app.count = S.results.length; app._updateCount();

    document.querySelectorAll('.lt-row-chk').forEach(c => c.checked = false);
    const sa = $id('lt_selectAll'); if (sa) sa.checked = false;
    renderTable(); drawGraph();

    const wrap = document.querySelector('.pt-table-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;

  } finally {
    S.importing = false;
  }
}

// ── Outlier detection ─────────────────────────────────────────────────────────
function computeOutliers() {
  const tol = (parseFloat($id('lt_tol')?.value) || 20) / 100;
  const groups = {};
  S.results.forEach(r => { (groups[r.group] = groups[r.group] || []).push(r); });
  const outliers = new Set();
  const median = arr => {
    const s = [...arr].sort((a, b) => a - b), n = s.length, m = n >> 1;
    return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  for (const g in groups) {
    const arr = groups[g];
    if (arr.length < 4) continue;
    const med = median(arr.map(r => r.peak));
    if (med <= 0) continue;
    for (const r of arr) if (Math.abs(r.peak - med) > med * tol) outliers.add(r.no);
  }
  return outliers;
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderTable() {
  const tb = $id('lt_resultsBody'); if (!tb) return;
  const outliers = computeOutliers();
  const u = 'gf' || 'gf';
  tb.innerHTML = S.results.map(r => `
    <tr ${outliers.has(r.no) ? 'class="outlier"' : ''}>
      <td class="cchk"><input type="checkbox" class="lt-row-chk" value="${r.no}" onchange="app.instr.onSelChange()"></td>
      <td class="num"><span class="pt-no-dot" style="background:${r.color}"></span>${r.no}</td>
      <td><input class="pt-name-inp" value="${escAttr(r.label)}" onchange="app.instr.renameResult(${r.no}, this.value)"></td>
      <td class="num accent">${fmtF(r.peak, 1)}</td>
      <td class="num">${fmtF(r.avg, 2)}</td>
      <td class="num">${fmtF(r.min, 1)}</td>
      <td class="num">${r.stdev.toFixed(3)}</td>
      <td class="num">${r.workMJ.toFixed(4)}</td>
      <td>${r.mode}</td>
    </tr>`).join('');
  updateTableHeaders();
}

function updateTableHeaders() {
  const th = id => { const el = $id(id); if (el) el.textContent = `${el.dataset.base} (gf)`; };
  th('lt_th_peak'); th('lt_th_avg'); th('lt_th_min');
}

function renameResult(no, name) {
  const r = S.results.find(x => x.no === no);
  if (r) { r.label = name; renderTable(); drawGraph(); app.log(`${t('lt_rename_log')} (No.${no}) → ${name}`); }
}

function onSelChange() {
  const all = document.querySelectorAll('.lt-row-chk');
  const chk = document.querySelectorAll('.lt-row-chk:checked');
  const sa = $id('lt_selectAll'); if (sa) sa.checked = all.length > 0 && all.length === chk.length;
  drawGraph();
}

function toggleAll(cb) {
  document.querySelectorAll('.lt-row-chk').forEach(c => c.checked = cb.checked);
  drawGraph();
}

function getChecked() {
  return Array.from(document.querySelectorAll('.lt-row-chk:checked')).map(c => parseInt(c.value, 10));
}

function deleteSelected() {
  const chk = getChecked();
  if (!chk.length) { alert(t('lt_del_none')); return; }
  if (!confirm(`${t('lt_del_confirm_n')} ${chk.length}${t('lt_del_confirm_items')}`)) return;
  S.results = S.results.filter(r => !chk.includes(r.no));
  app.count = S.results.length; app._updateCount();
  renderTable(); drawGraph();
  app.log(`${chk.length} ${t('lt_del_done_items')}`);
}

function clearData() {
  if (!S.results.length) return;
  if (!confirm(t('lt_clear_confirm'))) return;
  S.results = []; S.nextNo = 1; S.curGroup = null; S.curIdx = 0;
  app.count = 0; app._updateCount();
  renderTable(); drawGraph();
  app.log(t('lt_cleared'));
}


// ── Export / Copy ─────────────────────────────────────────────────────────────
function resultsToRows() {
  const u = 'gf' || 'gf';
  return [
    ['No', t('lt_th_sample'), `Peak (${u})`, `Avg (${u})`, `Min (${u})`, 'Std Dev', 'Work (mJ)', t('lt_th_mode')],
    ...S.results.map(r => [r.no, r.label,
      fmtF(r.peak,4), fmtF(r.avg,4), fmtF(r.min,4),
      r.stdev.toFixed(4), r.workMJ.toFixed(6), r.mode,
    ]),
  ];
}

function exportCSV() {
  if (!S.results.length) { app.log(t('lt_no_export'), 'warn'); return; }
  const csv = resultsToRows()
    .map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })),
    download: `LT1000_${dateStr()}.csv`,
  });
  a.click(); URL.revokeObjectURL(a.href);
  app.log(t('lt_csv_ok'), 'ok');
}

async function copyData() {
  if (!S.results.length) { app.log(t('lt_no_copy'), 'warn'); return; }
  const tsv = resultsToRows().map(r => r.join('\t')).join('\n');
  try {
    await navigator.clipboard.writeText(tsv);
    app.log(t('lt_copy_ok'), 'ok');
  } catch (_) {
    const ta = Object.assign(document.createElement('textarea'),
      { value: tsv, style: 'position:fixed;opacity:0' });
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    app.log(t('lt_copy_ok'), 'ok');
  }
}

// ── Graph ─────────────────────────────────────────────────────────────────────
function _ltBoxQ(sorted, q) {
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const pos = q * (n - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function _drawGroupBoxPlot() {
  const canvas = $id('lt_graphCanvas'), empty = $id('lt_graphEmpty'), legend = $id('lt_graphLegend');
  if (!canvas) return;
  const repeat = Math.max(1, parseInt($id('lt_repeatCount')?.value || '1') || 1);

  // 전체 그룹 구성 → 최근 3개만 표시
  const allGroups = [];
  for (let i = 0; i < S.results.length; i += repeat) {
    const chunk = S.results.slice(i, i + repeat);
    const peaks = chunk.map(r => r.peak).sort((a, b) => a - b);
    allGroups.push({ peaks, n: chunk.length, groupNo: allGroups.length + 1 });
  }
  const groups = allGroups.slice(-3);

  if (!groups.length) { if (empty) empty.style.display = 'flex'; canvas.style.display = 'none'; if (legend) legend.innerHTML = ''; return; }
  if (empty) empty.style.display = 'none';
  canvas.style.display = 'block';

  const w = canvas.clientWidth || 360, h = canvas.clientHeight || 300;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const allPeaks = S.results.map(r => r.peak);
  const autoYmin = Math.max(0, Math.min(...allPeaks) * 0.85);
  const autoYmax = Math.max(...allPeaks) * 1.20 || 1;
  const ymin = S._yMin !== null ? S._yMin : autoYmin;
  const ymax = S._yMax !== null ? S._yMax : autoYmax;
  if (S._yMaxInp && S._yMax === null) S._yMaxInp.placeholder = autoYmax.toFixed(0);
  if (S._yMinInp && S._yMin === null) S._yMinInp.placeholder = autoYmin.toFixed(0);
  const pad = { l: 52, r: 14, t: 28, b: 36 };
  if (S._yMaxInp) { S._yMaxInp.style.top = `${pad.t - 9}px`; S._yMaxInp.style.left = '3px'; }
  if (S._yMinInp) { S._yMinInp.style.top = `${h - pad.b - 9}px`; S._yMinInp.style.left = '3px'; }
  if (S._yResetBtn) { S._yResetBtn.style.top = '6px'; S._yResetBtn.style.right = '6px'; }
  const yspan = ymax - ymin || 1;
  const cH = h - pad.t - pad.b, totalW = w - pad.l - pad.r;
  const toY = v => pad.t + (1 - (v - ymin) / yspan) * cH;

  const cs = getComputedStyle(document.body);
  const C = {
    text:    cs.getPropertyValue('--chart-text').trim()    || '#5e7790',
    grid:    cs.getPropertyValue('--chart-grid').trim()    || 'rgba(31,59,86,.5)',
    boxFill: cs.getPropertyValue('--chart-box-fill').trim()|| 'rgba(43,143,255,.12)',
    boxStr:  cs.getPropertyValue('--chart-box-str').trim() || '#2b8fff',
    accent:  cs.getPropertyValue('--accent').trim()        || '#2b8fff',
  };

  ctx.font = '10px Inter'; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const gy = pad.t + cH * i / 4;
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(w - pad.r, gy); ctx.stroke();
    if (!S._yMaxInp || (i > 0 && i < 4)) {
      ctx.fillStyle = C.text;
      ctx.fillText((ymax - yspan * i / 4).toFixed(1), pad.l - 5, gy + 3);
    }
  }
  ctx.fillStyle = C.text; ctx.textAlign = 'center';
  ctx.fillText('Peak (gf)', (pad.l + w - pad.r) / 2, h - 4);

  const colW = totalW / groups.length;
  const bW = Math.max(16, Math.min(colW * 0.55, 72));

  const BOX_PALETTE = [
    { stroke: '#4da3ff', fill: 'rgba(77, 163, 255, 0.15)' },  // Blue
    { stroke: '#2bd4a0', fill: 'rgba(43, 212, 160, 0.15)' },  // Teal
    { stroke: '#ffb454', fill: 'rgba(255, 180, 84, 0.15)' },  // Orange
    { stroke: '#ff6b8a', fill: 'rgba(255, 107, 138, 0.15)' }, // Rose
    { stroke: '#b48cff', fill: 'rgba(180, 140, 255, 0.15)' }, // Purple
    { stroke: '#3fe0d4', fill: 'rgba(6, 224, 212, 0.15)' },  // Cyan
    { stroke: '#f0d24d', fill: 'rgba(240, 210, 77, 0.15)' },  // Yellow
    { stroke: '#ff8a5c', fill: 'rgba(255, 138, 92, 0.15)' }   // Coral
  ];

  groups.forEach((g, gi) => {
    const cx = pad.l + (gi + 0.5) * colW;
    const { peaks } = g;
    const wMin = peaks[0], wMax = peaks[peaks.length - 1];
    const q1 = _ltBoxQ(peaks, 0.25), med = _ltBoxQ(peaks, 0.5), q3 = _ltBoxQ(peaks, 0.75);
    const yQ1 = toY(q1), yQ3 = toY(q3), yMed = toY(med);
    const mean = peaks.reduce((a, b) => a + b, 0) / peaks.length;

    const colorObj = BOX_PALETTE[(g.groupNo - 1) % BOX_PALETTE.length];
    const boxStr = colorObj.stroke;
    const boxFill = colorObj.fill;

    ctx.fillStyle = boxFill; ctx.strokeStyle = boxStr; ctx.lineWidth = 1.5;
    ctx.fillRect(cx - bW/2, yQ3, bW, yQ1 - yQ3);
    ctx.strokeRect(cx - bW/2, yQ3, bW, yQ1 - yQ3);
    ctx.beginPath(); ctx.moveTo(cx - bW/2, yMed); ctx.lineTo(cx + bW/2, yMed); ctx.stroke();
    const cap = bW * 0.22;
    ctx.beginPath();
    ctx.moveTo(cx, yQ1); ctx.lineTo(cx, toY(wMin));
    ctx.moveTo(cx - cap, toY(wMin)); ctx.lineTo(cx + cap, toY(wMin));
    ctx.moveTo(cx, yQ3); ctx.lineTo(cx, toY(wMax));
    ctx.moveTo(cx - cap, toY(wMax)); ctx.lineTo(cx + cap, toY(wMax));
    ctx.stroke();
    peaks.forEach(p => {
      ctx.beginPath(); ctx.arc(cx, toY(p), 3, 0, Math.PI * 2);
      ctx.fillStyle = boxStr; ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1;
    });

    // 평균값 레이블 — 상단 수염 위, 기울여서 표시
    ctx.save();
    ctx.translate(cx, toY(wMax) - 7);
    ctx.rotate(-Math.PI / 5.5);
    ctx.font = 'bold 9px Inter'; ctx.textAlign = 'left'; ctx.fillStyle = boxStr;
    ctx.fillText(`${mean.toFixed(1)} gf`, 0, 0);
    ctx.restore();

    // X축: 실제 그룹 번호 표시
    ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.font = '10px Inter';
    ctx.fillText(`#${g.groupNo}`, cx, h - pad.b + 13);
    if (g.n < repeat) {
      ctx.fillStyle = boxStr; ctx.font = '9px Inter';
      ctx.fillText(`${g.n}/${repeat}`, cx, h - pad.b + 24); ctx.font = '10px Inter';
    }
  });

  if (legend) {
    const mean = allPeaks.reduce((a, b) => a + b, 0) / allPeaks.length;
    const sd = Math.sqrt(allPeaks.reduce((s, p) => s + (p - mean) ** 2, 0) / allPeaks.length);
    const note = allGroups.length > 3 ? `<span class="pt-leg" style="color:var(--accent);">최근 3그룹 표시 (전체 ${allGroups.length}그룹)</span>` : '';
    legend.innerHTML = `<span class="pt-leg">n <b>${allPeaks.length}</b></span>
      <span class="pt-leg">Mean <b>${mean.toFixed(1)} gf</b></span>
      <span class="pt-leg">σ <b>${sd.toFixed(1)}</b></span>${note}`;
  }
}

function drawGraph() {
  const repeat = Math.max(1, parseInt($id('lt_repeatCount')?.value || '1') || 1);
  if (repeat > 1 && S.results.length > 0) { _drawGroupBoxPlot(); return; }

  const canvas = $id('lt_graphCanvas');
  const empty  = $id('lt_graphEmpty');
  const legend = $id('lt_graphLegend');
  if (!canvas) return;

  const checked = getChecked();
  let curves = S.results.filter(r => checked.includes(r.no));
  if (!curves.length && S.results.length) curves = [S.results[S.results.length - 1]];

  if (!curves.length) {
    if (empty)  empty.style.display  = 'flex';
    canvas.style.display = 'none';
    if (legend) legend.innerHTML = '';
    return;
  }
  if (empty)  empty.style.display  = 'none';
  canvas.style.display = 'block';

  const w = canvas.clientWidth || 360, h = canvas.clientHeight || 300;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const pad = { l:52, r:14, t:14, b:32 };
  const cs = getComputedStyle(document.body);
  const gridCol  = cs.getPropertyValue('--border').trim()    || 'rgba(31,59,86,.5)';
  const textCol  = cs.getPropertyValue('--text-mut').trim()  || '#5e7790';
  const text2Col = cs.getPropertyValue('--text-dim').trim()  || '#8aa3bd';

  const curveData = curves.map(r => ({
    ...r, pts: r.data.map((gf, i) => ({ x: i * DX_MM, y: gf })),
  }));

  let xmin=Infinity, xmax=-Infinity, ymin=Infinity, ymax=-Infinity;
  curveData.forEach(r => r.pts.forEach(p => {
    if (p.x < xmin) xmin=p.x; if (p.x > xmax) xmax=p.x;
    if (p.y < ymin) ymin=p.y; if (p.y > ymax) ymax=p.y;
  }));
  if (xmin === xmax) xmax = xmin + 1;
  const yp = (ymax - ymin) * 0.1 || 1; ymin -= yp; ymax += yp;

  const X = x => pad.l + (x - xmin) / (xmax - xmin) * (w - pad.l - pad.r);
  const Y = y => pad.t + (1 - (y - ymin) / (ymax - ymin)) * (h - pad.t - pad.b);

  ctx.lineWidth = 1; ctx.font = '10px Inter';
  for (let i = 0; i <= 5; i++) {
    const gy = pad.t + (h - pad.t - pad.b) * i / 5;
    ctx.strokeStyle = gridCol; ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(w - pad.r, gy); ctx.stroke();
    ctx.fillStyle = textCol; ctx.textAlign = 'right';
    ctx.fillText((ymax - (ymax - ymin) * i / 5).toFixed(0), pad.l - 5, gy + 3);
  }
  for (let i = 0; i <= 5; i++) {
    const gx = pad.l + (w - pad.l - pad.r) * i / 5;
    ctx.strokeStyle = gridCol; ctx.beginPath(); ctx.moveTo(gx, pad.t); ctx.lineTo(gx, h - pad.b); ctx.stroke();
    ctx.fillStyle = textCol; ctx.textAlign = 'center';
    ctx.fillText((xmin + (xmax - xmin) * i / 5).toFixed(2), gx, h - pad.b + 13);
  }
  if (ymin < 0 && ymax > 0) {
    ctx.strokeStyle = textCol; ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(w - pad.r, Y(0)); ctx.stroke();
  }

  const u = 'gf' || 'gf';
  ctx.fillStyle = text2Col; ctx.textAlign = 'center';
  ctx.fillText('Displacement (mm)', (pad.l + w - pad.r) / 2, h - 3);
  ctx.save(); ctx.translate(12, (pad.t + h - pad.b) / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText(`Force (${u})`, 0, 0); ctx.restore();

  curveData.forEach(r => {
    ctx.strokeStyle = r.color; ctx.lineWidth = 1.6; ctx.beginPath();
    r.pts.forEach((p, i) => {
      const x = X(p.x), y = Y(p.y);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  if (legend) {
    legend.innerHTML = curves.map(r =>
      `<span class="pt-leg"><span class="pt-leg-dot" style="background:${r.color}"></span>${escHtml(r.label)} <b>${fmtF(r.peak,1)} ${u}</b></span>`
    ).join('');
  }
}

// ── Modals ────────────────────────────────────────────────────────────────────
function showConnGuide() {
  $id('lt_modal_guide0').style.display = 'flex';
}

function showProceedModal(m, label) {
  const u = 'gf' || 'gf';
  const box = $id('lt_resultModal'); if (!box) return;
  box.querySelector('.modal-title').className  = 'modal-title ok';
  box.querySelector('.modal-title').textContent = '✅ 측정 완료';
  box.querySelector('.lt-modal-body').innerHTML =
    `<div class="pt-mr-row"><span>${t('lt_th_sample')}</span><b>${escHtml(label)}</b></div>
     <div class="pt-mr-row"><span>Peak</span><b>${fmtF(m.peak,1)} ${u}</b></div>
     <div class="pt-mr-row"><span>Avg</span><b>${fmtF(m.avg,2)} ${u}</b></div>
     <div class="pt-mr-row"><span>Std Dev</span><b>${m.stdev.toFixed(3)}</b></div>
     <div class="pt-mr-row"><span>Work</span><b>${m.workMJ.toFixed(4)} mJ</b></div>
     <div class="pt-mr-row"><span>${t('lt_th_mode')}</span><b>${escHtml(m.mode)}</b></div>`;
  box.querySelector('.lt-modal-warn').style.display = 'none';
  box.style.display = 'flex';
}

function showAbortModal(points, peak) {
  const box = $id('lt_resultModal'); if (!box) return;
  box.querySelector('.modal-title').className  = 'modal-title err';
  box.querySelector('.modal-title').textContent = t('lt_result_abort');
  box.querySelector('.lt-modal-body').innerHTML =
    `<div class="pt-mr-row"><span>${t('lt_modal_pts')}</span><b>${points}</b></div>
     <div class="pt-mr-row"><span>Peak</span><b>${peak.toFixed(1)} gf</b></div>
     <div class="pt-mr-row"><span>${t('lt_modal_verdict')}</span><b>${t('lt_modal_below_min')}</b></div>`;
  const w = box.querySelector('.lt-modal-warn');
  w.style.display = 'block';
  w.innerHTML = `${t('lt_min_criteria')} ${MIN_POINTS} ${t('lt_min_and_peak')} ${MIN_PEAK_GF} gf`;
  box.style.display = 'flex';
}

function showMemFullModal() {
  const box = $id('lt_memFullModal'); if (!box) return;
  box.style.display = 'flex';
}

function closeModal(id) {
  const box = $id(id); if (box) box.style.display = 'none';
}

// ── Mock test ─────────────────────────────────────────────────────────────────
function runMockTest() {
  if (S.importing) { app.log('이미 처리 중입니다.', 'warn'); return; }
  const peakForce = 150 + Math.random() * 450;
  const total = 600 + Math.floor(Math.random() * 200);
  const data = [];
  for (let i = 0; i < total; i++) {
    let f;
    if      (i < 200) f = peakForce * Math.sin(i / 200 * Math.PI / 2) + (Math.random()-.5)*peakForce*.05;
    else if (i < 300) f = peakForce * (0.9 + Math.random() * 0.2);
    else if (i < 600) f = (peakForce-5)*Math.exp(-(i-300)/300*4)+5+(Math.random()-.5)*3;
    else              f = 5 + (Math.random()-.5)*2;
    data.push(Math.max(0, f));
  }
  app.log(`Mock 데이터: ${data.length}포인트, Peak ${Math.max(...data).toFixed(1)} gf`);
  importTest(data, false);
}

// ── HTML builders ─────────────────────────────────────────────────────────────
function buildSidebar(el) {
  if (!S) init();
  const sv = JSON.parse(localStorage.getItem(LT_SK) || '{}');
  const btnSty = 'width:100%;margin-top:18px;font-family:var(--ui);font-size:16px;font-weight:700;cursor:pointer;padding:14px;border-radius:10px;';
  const stepSty = 'background:var(--panel-3);border:1px solid var(--border-2);border-radius:7px;padding:6px 12px;font-family:var(--mono);font-size:13px;';
  const arrSty = 'color:var(--text-mut);';
  const ledSty = `${stepSty}display:inline-flex;align-items:center;gap:6px;`;
  const redLed = '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#ef4444;box-shadow:0 0 5px 1px rgba(239,68,68,.7);flex-shrink:0;"></span>';
  el.innerHTML = `
    <div class="sidebar-top">
      <div class="panel">
        <div class="field-label">${t('lt_conn_label')}</div>
        <div id="connStatus" class="conn-status-lbl">${t('disconnected')}</div>
        <button id="btnConnect" class="big-btn" style="margin-top:4px;"
                onclick="app.toggleConnection()">${t('lt_conn_btn')}</button>
      </div>

      <div class="panel">
        <div class="panel-title">${t('lt_test_settings')}</div>
        <button class="btn-outline" style="width:100%;margin-bottom:6px;font-size:13px;padding:8px 12px;"
                onclick="document.getElementById('lt_modal_calib').style.display='flex'">
          ⚖️ ${t('lt_calib_btn')}
        </button>
        <button class="btn-outline" style="width:100%;margin-bottom:6px;font-size:13px;padding:8px 12px;"
                onclick="document.getElementById('lt_modal_howto').style.display='flex'">
          📋 ${t('lt_howto_btn')}
        </button>
        <button class="btn-outline" style="width:100%;margin-bottom:10px;font-size:13px;padding:8px 12px;"
                onclick="document.getElementById('lt_modal_stfull').style.display='flex'">
          ⚠️ ${t('lt_stfull_btn')}
        </button>
        <label class="fl">${t('lt_sample_label')}</label>
        <input id="lt_sample" class="inp" type="text" value="${sv.sample ?? 'Sample A'}">
        <label class="fl">${t('lt_tol_label')}</label>
        <input id="lt_tol" class="inp" type="number" value="${sv.tol ?? '20'}" min="1" max="100" step="1"
               onchange="app.instr.renderTable();app.instr._saveLtSettings()">

        <div style="margin-top:10px;background:rgba(43,143,255,.06);border:1px solid var(--border);border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;justify-content:space-between;font-size:11.5px;">
            <span style="color:var(--text-mut);">${t('lt_speed_label')}</span>
            <span style="color:var(--cyan);font-family:var(--mono);font-size:11px;">12 in/min (5.08 mm/s)</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11.5px;">
            <span style="color:var(--text-mut);">${t('lt_sampling_label')}</span>
            <span style="color:var(--cyan);font-family:var(--mono);font-size:11px;">400 Hz (2.5 ms/pt)</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11.5px;">
            <span style="color:var(--text-mut);">${t('lt_probe_label')}</span>
            <span style="color:var(--cyan);font-family:var(--mono);font-size:11px;">1" Loop</span>
          </div>
        </div>
      </div>
    </div>
    ${syslogPanelHTML()}

    <!-- ── Calibration guide modal ── -->
    <div id="lt_modal_calib" class="modal-overlay" style="display:none;">
      <div class="modal-box" style="max-width:500px;">
        <div class="modal-title">⚖️ ${t('lt_calib_title')}</div>

        <!-- ① 준비 -->
        <div style="font-size:11px;color:var(--text-mut);margin:0 0 5px 2px;">${t('lt_calib_prep')}</div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;">
          <span style="${stepSty}">${t('lt_calib_prep_s1')}</span>
          <span style="${arrSty}">→</span>
          <span style="${stepSty}">${t('lt_calib_prep_s2')}</span>
        </div>

        <!-- ② 모드 진입 -->
        <div style="font-size:11px;color:var(--text-mut);margin:0 0 5px 2px;">${t('lt_calib_enter')}</div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;">
          <span style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.5);border-radius:7px;padding:6px 12px;font-family:var(--mono);font-size:13px;color:var(--log-warn-col);text-align:center;">Select+Enter<br><span style="font-size:11px;">3s+</span></span>
          <span style="${arrSty}">→</span>
          <span style="${ledSty}">${redLed}Setup</span>
          <span style="${arrSty}">→</span>
          <span style="${stepSty}">Enter</span>
        </div>

        <!-- ③ 영점 교정 -->
        <div style="font-size:11px;color:var(--text-mut);margin:0 0 5px 2px;">${t('lt_calib_zero')}</div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;">
          <span style="${stepSty}">${t('lt_calib_zero_check')}</span>
          <span style="${arrSty}">→</span>
          <span style="${stepSty}">Enter</span>
        </div>

        <!-- ④ 스팬 교정 -->
        <div style="font-size:11px;color:var(--text-mut);margin:0 0 5px 2px;">${t('lt_calib_span')}</div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;">
          <span style="${stepSty}">${t('lt_calib_span_show')}</span>
          <span style="${arrSty}">→</span>
          <span style="background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.4);border-radius:7px;padding:6px 12px;font-family:var(--mono);font-size:13px;color:#3b82f6;">${t('lt_calib_span_place')}</span>
          <span style="${arrSty}">→</span>
          <span style="${stepSty}">Enter</span>
        </div>
        <div style="text-align:center;margin-bottom:10px;">
          <img src="assets/LT-1000 1kg.png" alt="${escAttr(t('lt_calib_img_alt'))}"
               style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--border);object-fit:contain;">
          <div style="font-size:11px;color:var(--text-mut);margin-top:4px;">${t('lt_calib_img_cap')}</div>
        </div>

        <!-- ⑤ 완료 -->
        <div style="font-size:11px;color:var(--text-mut);margin:0 0 5px 2px;">${t('lt_calib_done')}</div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px;">
          <span style="${stepSty}">${t('lt_calib_done_s1')}</span>
          <span style="${arrSty}">→</span>
          <span style="${stepSty}">${t('lt_calib_done_s2')}</span>
          <span style="${arrSty}">→</span>
          <span style="${stepSty}">${t('lt_calib_done_s3')}</span>
          <span style="${arrSty}">→</span>
          <span style="${stepSty}">${t('lt_calib_done_s4')}</span>
        </div>

        <button style="${btnSty}background:var(--panel-3);color:var(--text);border:1px solid var(--border-2);"
                onclick="document.getElementById('lt_modal_calib').style.display='none'">${t('lt_guide1_btn') || 'OK'}</button>
      </div>
    </div>

    <!-- ── ST FULL fix modal ── -->
    <div id="lt_modal_stfull" class="modal-overlay" style="display:none;">
      <div class="modal-box" style="max-width:480px;">
        <div class="modal-title" style="color:var(--log-warn-col);">⚠️ ${t('lt_stfull_title')}</div>
        <div style="font-size:13.5px;color:var(--text-dim);line-height:1.8;margin-bottom:14px;">
          ${t('lt_stfull_body')}
        </div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:14px;">
          <span style="${stepSty}">Select</span><span style="${arrSty}">→</span>
          <span style="${ledSty}">${redLed}Print</span><span style="${arrSty}">→</span>
          <span style="${stepSty}">▲ ×2</span><span style="${arrSty}">→</span>
          <span style="${stepSty}">DL</span><span style="${arrSty}">→</span>
          <span style="${stepSty}">Enter</span><span style="${arrSty}">→</span>
          <span style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.5);border-radius:7px;padding:6px 12px;font-family:var(--mono);font-size:13px;color:var(--log-warn-col);text-align:center;">Select+Enter<br><span style="font-size:11px;">3s+</span></span>
          <span style="${arrSty}">→</span>
          <span style="background:rgba(34,197,94,.10);border:1px solid rgba(34,197,94,.45);border-radius:7px;padding:6px 12px;font-family:var(--mono);font-size:12px;color:#22c55e;text-align:center;">${t('lt_stfull_done')}</span>
        </div>
        <button style="${btnSty}background:var(--panel-3);color:var(--text);border:1px solid var(--border-2);"
                onclick="document.getElementById('lt_modal_stfull').style.display='none'">${t('lt_guide1_btn') || 'OK'}</button>
      </div>
    </div>

    <!-- ── How-to send data modal ── -->
    <div id="lt_modal_howto" class="modal-overlay" style="display:none;">
      <div class="modal-box" style="max-width:460px;">
        <div class="modal-title">${t('lt_howto_title')}</div>
        <div style="font-size:13.5px;color:var(--text-dim);line-height:1.8;margin-bottom:14px;">
          ${t('lt_howto_body')}
        </div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
          <span style="${stepSty}">Select</span><span style="${arrSty}">→</span>
          <span style="${ledSty}">${redLed}Print</span><span style="${arrSty}">→</span>
          <span style="${stepSty}">Enter</span><span style="${arrSty}">→</span>
          <span style="${stepSty}">Enter</span><span style="${arrSty}">→</span>
          <span style="background:rgba(34,197,94,.10);border:1px solid rgba(34,197,94,.45);border-radius:7px;padding:6px 12px;font-family:var(--mono);font-size:12px;color:#22c55e;text-align:center;">${t('lt_howto_auto')}</span>
        </div>
        <button style="${btnSty}background:var(--panel-3);color:var(--text);border:1px solid var(--border-2);"
                onclick="document.getElementById('lt_modal_howto').style.display='none'">${t('lt_guide1_btn') || 'OK'}</button>
      </div>
    </div>

    <!-- ── Connection guide modals ── -->
    <div id="lt_modal_guide0" class="modal-overlay" style="display:none;">
      <div class="modal-box" style="max-width:460px;">
        <div class="modal-title">${t('lt_guide0_title')}</div>
        <div style="font-size:13.5px;color:var(--text-dim);line-height:1.8;margin-bottom:14px;">
          ${t('lt_guide0_body')}
        </div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-top:10px;">
          <span style="${ledSty}">${redLed}Run</span>
          <span style="${arrSty}">→</span>
          <span style="${stepSty}">Units</span>
          <span style="${arrSty}">→</span>
          <span style="${stepSty}">▲▼ grams</span>
        </div>
        <button style="${btnSty}background:var(--accent);color:#fff;border:1px solid var(--accent-2);"
                onclick="app.instr.closeModal('lt_modal_guide0');app.instr.showGuide1()">${t('lt_guide0_next')}</button>
      </div>
    </div>

    <div id="lt_modal_guide1" class="modal-overlay" style="display:none;">
      <div class="modal-box" style="max-width:460px;">
        <div class="modal-title">${t('lt_guide1_title')}</div>
        <div style="font-size:13.5px;color:var(--text-dim);line-height:1.8;margin-bottom:14px;">
          ${t('lt_guide1_body')}
        </div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
          <span style="${stepSty}">Select</span><span style="${arrSty}">→</span>
          <span style="${ledSty}">${redLed}Print</span><span style="${arrSty}">→</span>
          <span style="${stepSty}">ST → On</span><span style="${arrSty}">→</span>
          <span style="${stepSty}">Enter</span>
        </div>
        <button style="${btnSty}background:var(--accent);color:#fff;border:1px solid var(--accent-2);"
                onclick="app.instr.closeModal('lt_modal_guide1')">${t('lt_guide1_btn') || 'OK'}</button>
      </div>
    </div>

    <!-- ── Memory full modal ── -->
    <div id="lt_memFullModal" class="modal-overlay" style="display:none;">
      <div class="modal-box" style="max-width:460px;">
        <div class="modal-title" style="color:var(--log-warn-col);">${t('lt_memfull_title')}</div>
        <div style="font-size:13.5px;color:var(--text-dim);line-height:1.8;margin-bottom:14px;">
          ${t('lt_memfull_body')}
        </div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
          <span style="${stepSty}">Select</span><span style="${arrSty}">→</span>
          <span style="${ledSty}">${redLed}Print</span><span style="${arrSty}">→</span>
          <span style="${stepSty}">▲ dL</span><span style="${arrSty}">→</span>
          <span style="${stepSty}">Enter</span><span style="${arrSty}">→</span>
          <span style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.5);border-radius:7px;padding:6px 12px;font-family:var(--mono);font-size:13px;color:var(--log-warn-col);text-align:center;">Select+Enter<br><span style="font-size:11px;">3s+</span></span>
          <span style="${arrSty}">→</span>
          <span style="${stepSty}">Delete All</span>
        </div>
        <button style="${btnSty}background:var(--panel-3);color:var(--text);border:1px solid var(--border-2);"
                onclick="app.instr.closeModal('lt_memFullModal')">${t('lt_memfull_btn') || 'OK'}</button>
      </div>
    </div>

    <!-- ── Result modal ── -->
    <div id="lt_resultModal" class="modal-overlay" style="display:none;">
      <div class="modal-box">
        <div class="modal-title ok">${t('lt_result_done')}</div>
        <div class="lt-modal-body pt-modal-result"></div>
        <div class="lt-modal-warn pt-modal-warn" style="display:none;"></div>
        <button style="${btnSty}background:var(--panel-3);color:var(--text);border:1px solid var(--border-2);"
                onclick="app.instr.closeModal('lt_resultModal')">${t('lt_modal_btn') || 'OK'}</button>
      </div>
    </div>`;

  // select 초기값 복원

  // 변경 시 자동 저장
  ['lt_sample'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', saveLtSettings);
    document.getElementById(id)?.addEventListener('change', saveLtSettings);
  });
}

function buildCenter(el) {
  el.innerHTML = `
    <div class="display-bar">
      <div class="disp-value">
        <span id="liveValue">— — —</span><span class="disp-unit" id="liveUnit"></span>
      </div>
      <div style="font-size:12px;color:var(--text-dim);flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:0 16px;">
        <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#ef4444;box-shadow:0 0 5px 1px rgba(239,68,68,.7);flex-shrink:0;"></span>
        ${t('lt_run_hint')}
      </div>
      <div class="disp-meta">
        <span id="liveStatus" class="disp-status off">${t('disconnected')}</span>
        <span class="meas-count">${t('meas_count_lbl')} <b id="measCount">0</b></span>
      </div>
    </div>

    <div class="panel" style="display:flex;align-items:center;padding:10px 14px;flex-shrink:0;">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--text-dim);text-transform:uppercase;">${t('lt_data_title')}</div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-size:12px;color:var(--text-dim);white-space:nowrap;">${t('group_repeat_label')}</span>
        <input id="lt_repeatCount" class="inp" type="number"
               value="${JSON.parse(localStorage.getItem(LT_SK)||'{}').repeatCount ?? '1'}"
               min="1" max="99" step="1"
               style="width:54px;padding:5px 8px;font-size:13px;text-align:center;"
               onchange="app.instr._saveLtSettings(); app.instr._redrawGraph()">
        <button class="sbtn" onclick="app.instr.copyData()">${t('btn_copy')}</button>
        <button class="sbtn green" onclick="app.instr.exportCSV()">${t('btn_csv')}</button>
        <button class="sbtn red-o" onclick="app.instr.deleteSelected()">${t('btn_del_sel')}</button>
        <button class="sbtn red" onclick="app.instr.clearData()">${t('btn_clear')}</button>
      </div>
    </div>

    <div class="panel grow" style="min-height:0;">
      <div class="pt-table-wrap">
        <table id="ltTable" style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr>
            <th class="cchk"><input type="checkbox" id="lt_selectAll" onchange="app.instr.toggleAll(this)"></th>
            <th>No</th>
            <th>${t('lt_th_sample')}</th>
            <th id="lt_th_peak" data-base="Peak">Peak (gf)</th>
            <th id="lt_th_avg"  data-base="Avg">Avg (gf)</th>
            <th id="lt_th_min"  data-base="Min">Min (gf)</th>
            <th>${t('lt_th_stdev')}</th>
            <th>Work (mJ)</th>
            <th>${t('lt_th_mode')}</th>
          </tr></thead>
          <tbody id="lt_resultsBody"></tbody>
        </table>
      </div>
    </div>`;
}

function buildRightPanel(el) {
  // Restore the default 3-column layout (sidebar + center + right panel).
  // Some other instruments (e.g. DAQ-6510) collapse to 2 columns; we need
  // to explicitly reset so the sidebar and graph panel are both visible.
  el.style.display = '';
  const layout = document.getElementById('layout');
  if (layout) layout.style.gridTemplateColumns = '';

  el.innerHTML = `
    <div class="panel grow" style="min-height:0;display:flex;flex-direction:column;">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--text-dim);text-transform:uppercase;margin-bottom:6px;flex-shrink:0;">${t('lt_graph_title')}</div>
      <div style="font-size:11px;color:var(--text-mut);margin-bottom:8px;flex-shrink:0;">${t('lt_graph_hint')}</div>
      <div id="lt_graphArea" style="flex:1;min-height:0;position:relative;background:var(--syslog-bg);border:1px solid var(--border);border-radius:8px;overflow:hidden;">
        <canvas id="lt_graphCanvas" style="width:100%;height:100%;display:block;"></canvas>
        <div id="lt_graphEmpty" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-mut);font-size:13px;text-align:center;padding:20px;pointer-events:none;">
          ${t('lt_graph_empty')}
        </div>
      </div>
      <div id="lt_graphLegend" style="display:flex;flex-wrap:wrap;gap:10px 16px;margin-top:10px;font-size:12px;color:var(--text-dim);flex-shrink:0;"></div>
    </div>`;

  _attachYOverlay(el.querySelector('#lt_graphArea'), () => drawGraph());

  window.addEventListener('resize', () => { if (S?.results?.length) drawGraph(); });
}

function showGuide1() {
  $id('lt_modal_guide1').style.display = 'flex';
}

// ── Export ────────────────────────────────────────────────────────────────────
export default {
  name:     'LT-1000 Loop Tack',
  icon:     'assets/LT-1000.png',
  category: 'Instrument',
  viewType: 'custom',
  serial:   { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' },

  buildSidebar,
  buildCenter,
  buildRightPanel,

  onLine,

  onConnect() {
    // DTR + RTS — many RS232 instruments won't transmit until these are HIGH
    try { app.serial.port?.setSignals?.({ dataTerminalReady: true, requestToSend: true }); } catch (_) {}
    app._setDisplay('— — —', 'gf', 'ready', 'READY');
    showConnGuide();
    app.log(t('lt_log_connected'), 'ok');
  },

  onDisconnect() {
    clearEotTimer();
    S.rxBuffer = '';
  },

  onRebuild() { renderTable(); drawGraph(); },

  // Exposed for inline onclick handlers
  renderTable, drawGraph, onSelChange, toggleAll,
  renameResult, deleteSelected, clearData, exportCSV, copyData,
  closeModal, showGuide1, showMemFullModal,
  _saveLtSettings: saveLtSettings,
  _redrawGraph: drawGraph,
};
