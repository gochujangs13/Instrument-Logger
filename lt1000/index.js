/* ============================================================
   LT-1000 Loop Tack Tester Logger
   Web Serial API — RS232 9600 8N1
   Protocol: passive receive — device sends ASCII floats,
             end-of-transmission detected by 800ms silence
   Standards: PSTC-16 / ASTM D6195 / TLMI
   ============================================================ */

'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const SAMPLE_RATE   = 400;          // Hz
const DT            = 1 / SAMPLE_RATE;  // 0.0025 s per sample
const SPEED_MM_S    = 5.08;         // fixed: 12 in/min = 5.08 mm/s
const DX_MM         = SPEED_MM_S * DT; // mm per sample = 0.0127 mm
const EOT_SILENCE   = 800;          // ms of silence = end of transmission
const MIN_POINTS    = 100;
const MIN_PEAK_GF   = 2.0;

const SERIAL_CFG = { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' };

const PALETTE = ['#4da3ff','#2bd4a0','#ffb454','#ff6b8a','#b48cff','#3fe0d4','#f0d24d','#ff8a5c'];

// Unit multipliers (from gf)
const UNIT_MUL = { gf: 1, N: 9.81e-3, oz: 0.03527 };
const UNIT_LABEL = { gf: 'gf', N: 'N', oz: 'oz' };

// ── State ─────────────────────────────────────────────────────────────────────
let port = null;
let reader = null;
let readLoopActive = false;
let isConnected = false;

let rxBuffer = '';          // accumulates all received text in current burst
let eotTimer = null;        // 800ms silence timer

let results = [];
let nextNo  = 1;
let curGroup = null;
let curIdx   = 0;
let importing = false;

let currentUnit = 'gf';

// ── DOM helpers ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function syslog(msg, type = '') {
  const box = $('sysLog');
  if (!box) return;
  const ts  = new Date().toTimeString().slice(0, 8);
  const div = document.createElement('div');
  div.className = type ? `log-${type}` : '';
  div.textContent = `[${ts}] ${msg}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function setStatus(statusCls, statusText) {
  const el = $('liveStatus');
  if (el) { el.className = `disp-status ${statusCls}`; el.textContent = statusText; }
}

function setLiveValue(val, unit) {
  const lv = $('liveValue');
  const lu = $('liveUnit');
  if (lv) lv.textContent = val;
  if (lu) lu.textContent = unit ? ` ${unit}` : '';
}

function updateCount() {
  const el = $('measCount');
  if (el) el.textContent = results.length;
}

function toggleLog() {
  const panel = $('syslogPanel');
  const btn   = $('logToggle');
  if (!panel) return;
  const collapsed = panel.classList.toggle('collapsed');
  if (btn) btn.textContent = collapsed ? '▲' : '▼';
}

// ── Unit helpers ──────────────────────────────────────────────────────────────


function onUnitChange() {
  currentUnit = $('lt_unit')?.value || 'gf';
  updateTableHeaders();
  renderTable();
  drawGraph();
}

function updateTableHeaders() {
  const u = UNIT_LABEL[currentUnit] || currentUnit;
  const thPeak = $('th_peak'); if (thPeak) thPeak.textContent = `Peak (${u})`;
  const thAvg  = $('th_avg');  if (thAvg)  thAvg.textContent  = `Avg (${u})`;
  const thMin  = $('th_min');  if (thMin)  thMin.textContent  = `Min (${u})`;
}

function toUnit(gf) {
  return gf * (UNIT_MUL[currentUnit] || 1);
}

function fmtF(gf, decimals) {
  const v = toUnit(gf);
  return v.toFixed(decimals !== undefined ? decimals : (currentUnit === 'gf' ? 1 : 4));
}

// ── Serial connection ─────────────────────────────────────────────────────────
async function toggleConnection() {
  if (isConnected) {
    await doDisconnect();
  } else {
    await doConnect();
  }
}

async function doConnect() {
  if (!navigator.serial) {
    alert('Web Serial API가 지원되지 않습니다.\nChrome 또는 Edge 89+ 를 사용하세요.');
    return;
  }
  try {
    syslog('시리얼 포트 선택 중…');
    port = await navigator.serial.requestPort();
    await port.open(SERIAL_CFG);
    // Assert DTR + RTS — many RS232 instruments won't transmit until these are HIGH
    try { await port.setSignals({ dataTerminalReady: true, requestToSend: true }); }
    catch (_) {}
    isConnected = true;
    $('btnConnect').textContent = '연결 해제';
    $('btnConnect').className   = 'big-btn danger';
    $('connStatus').textContent = '연결됨 (READY)';
    $('connStatus').className   = 'conn-status-lbl ok';
    $('connDot').className      = 'conn-dot on';
    $('connText').textContent   = '연결됨';
    setStatus('ready', 'READY');
    setLiveValue('— — —', UNIT_LABEL[currentUnit]);
    syslog('시리얼 포트 연결됨. 장비에서 Print(P) → Enter로 데이터 전송하세요.', 'ok');
    showConnGuide();
    startReadLoop();
  } catch (e) {
    syslog(`[오류] ${e.message}`, 'err');
    $('connStatus').textContent = '연결 실패';
    $('connStatus').className   = 'conn-status-lbl err';
  }
}

async function doDisconnect() {
  readLoopActive = false;
  clearEotTimer();
  try { reader?.cancel(); } catch (_) {}
  try { await port?.close(); } catch (_) {}
  port = null; reader = null;
  isConnected = false;
  $('btnConnect').textContent = '시리얼 포트 연결';
  $('btnConnect').className   = 'big-btn';
  $('connStatus').textContent = '연결 안됨';
  $('connStatus').className   = 'conn-status-lbl';
  $('connDot').className      = 'conn-dot off';
  $('connText').textContent   = '연결 안됨';
  setStatus('off', '연결 안됨');
  setLiveValue('— — —', '');
  syslog('연결 해제됨.');
}

// ── Guide / step modals ───────────────────────────────────────────────────────
function showConnGuide() {
  $('modal_guide0').style.display = 'flex';
}
function showGuide1() {
  $('modal_guide0').style.display = 'none';
  $('modal_guide1').style.display = 'flex';
}
function showGuide2() {
  $('modal_guide1').style.display = 'none';
  $('modal_guide2').style.display = 'flex';
}
function closeGuide2() {
  $('modal_guide2').style.display = 'none';
}

function onStartTest() {
  $('modal_startStep1').style.display = 'flex';
}
function closeStartStep1() {
  $('modal_startStep1').style.display = 'none';
}
function onStartStep2() {
  $('modal_startStep1').style.display = 'none';
  syslog('데이터 수신 대기 중... 장비에서 Select → P → Enter → Enter', 'ok');
}

function showMemHowTo() {
  $('modal_memHowTo').style.display = 'flex';
}

function showMemFullWarning() {
  $('modal_memFull').style.display = 'flex';
}
function closeMemFull() {
  $('modal_memFull').style.display = 'none';
}

// ── Serial read loop ──────────────────────────────────────────────────────────
function startReadLoop() {
  readLoopActive = true;
  rxBuffer = '';

  (async () => {
    try {
      reader = port.readable
        .pipeThrough(new TextDecoderStream())
        .getReader();

      while (readLoopActive) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        onRxData(value);
      }
    } catch (e) {
      if (readLoopActive) {
        syslog(`[수신 오류] ${e.message}`, 'err');
        await doDisconnect();
      }
    }
  })();
}

function onRxData(chunk) {
  rxBuffer += chunk;

  // Show activity
  const byteCount = rxBuffer.trim().split(/\s+/).filter(s => s).length;
  setStatus('collecting', `수신 중... (${byteCount}pt)`);

  // Reset EOT timer on every received byte
  clearEotTimer();
  eotTimer = setTimeout(() => {
    onEndOfTransmission();
  }, EOT_SILENCE);
}

function clearEotTimer() {
  if (eotTimer) { clearTimeout(eotTimer); eotTimer = null; }
}

function onEndOfTransmission() {
  const raw = rxBuffer.trim();
  rxBuffer = '';
  setStatus('ready', 'READY');

  if (!raw) return;

  // Parse all floats
  const tokens = raw.split(/[\s,\r\n]+/);
  const allVals = [];
  for (const tok of tokens) {
    const v = parseFloat(tok);
    if (!isNaN(v)) allVals.push(v);
  }

  if (allVals.length === 0) {
    syslog('파싱 가능한 데이터가 없습니다.', 'err');
    return;
  }

  // --- Header detection ---
  // LT-1000 sends summary lines before curve data:
  //   [test_num]\r[peak_gf]\r[stat]\r[stat]\r[0\r0\r0... actual curve]
  // Header ends at first block of 3+ consecutive near-zero values (< 0.1)
  const { header, curve } = splitHeaderAndCurve(allVals);

  if (header.length > 0) {
    const testNum = Math.round(header[0]);
    syslog(`헤더 감지 — P${testNum}번 파일 (${header.length}줄): [${header.map(v=>v.toFixed(4)).join(', ')}]`);
  }
  syslog(`곡선 데이터: ${curve.length}포인트, 헤더 제외`);

  // Use curve for import; pass device-reported peak from header (index 1) if present
  const devicePeak = header.length >= 2 ? header[1] : null;

  // Warn when device test number reaches 20 (device memory near full)
  const testNum = header.length >= 1 ? Math.round(header[0]) : null;
  if (testNum !== null && testNum >= 20) {
    showMemFullWarning();
  }

  importTest(curve, true, devicePeak);
}

// Split: header = values before first run of 3+ near-zero values, curve = rest
function splitHeaderAndCurve(vals) {
  const ZERO_THRESH = 0.1;
  const ZERO_RUN   = 3;
  // Only look for header in first 20 values
  for (let i = 0; i <= Math.min(vals.length - ZERO_RUN, 20); i++) {
    if (vals.slice(i, i + ZERO_RUN).every(v => Math.abs(v) < ZERO_THRESH)) {
      return { header: vals.slice(0, i), curve: vals.slice(i) };
    }
  }
  return { header: [], curve: vals };
}

// ── Metrics computation ───────────────────────────────────────────────────────
function computeMetrics(f) {
  const n = f.length;
  const peak = Math.max(...f);
  const min  = Math.min(...f);

  let sumPos = 0, sumSqPos = 0;
  for (const x of f) {
    if (x > 0) { sumPos += x; sumSqPos += x * x; }
  }
  const avg      = sumPos / n;
  const variance = Math.max(0, sumSqPos / n - avg * avg);
  const stdev    = Math.sqrt(variance);

  // Work (J) = sum(max(0,f[i])(gf) * 9.81e-3(N/gf) * dx(mm)*1e-3(m/mm))
  //          = sum(max(0,f[i])) * 9.81e-6 * dx_mm  — negative force = no energy contribution
  const workJ = f.reduce((s, v) => s + Math.max(0, v), 0) * 9.81e-6 * DX_MM;
  const workMJ = workJ * 1000; // convert J to mJ

  // Peak index for failure mode
  let peakIdx = 0;
  for (let i = 0; i < n; i++) if (f[i] > f[peakIdx]) peakIdx = i;

  let mode;
  const ratio = peakIdx / n;
  if (ratio < 0.3)      mode = '즉시 파괴 (Snap)';
  else if (ratio < 0.6) mode = '표준 루프 파괴';
  else                  mode = '지연 파괴 (Creep)';

  return { min, peak, avg, variance, stdev, workMJ, mode, peakIdx };
}

// ── Import test ───────────────────────────────────────────────────────────────
function importTest(vals, auto = false, devicePeak = null) {
  if (importing) return;
  importing = true;

  try {
    const peak = Math.max(...vals);
    const n = vals.length;

    // Validity check
    if (n < MIN_POINTS || peak <= MIN_PEAK_GF) {
      syslog(`시험 중단 — 포인트 수: ${n}, Peak: ${peak.toFixed(1)} gf (유효 기준 미달)`, 'err');
      showAbortModal(n, peak);
      importing = false;
      return;
    }

    const m = computeMetrics(vals);
    const sampleName = $('lt_sample')?.value || 'Sample';

    // Numbering with repeat count
    const repeat = Math.max(1, parseInt($('lt_repeatCount')?.value || '1') || 1);
    if (sampleName !== curGroup) { curGroup = sampleName; curIdx = 1; }
    else curIdx++;

    let label;
    if (repeat === 1) {
      label = `${sampleName}-${curIdx}`;
    } else {
      const groupNo = Math.ceil(curIdx / repeat);
      const subNo   = ((curIdx - 1) % repeat) + 1;
      label = `${sampleName}-${groupNo}-${subNo}`;
    }

    const color = PALETTE[results.length % PALETTE.length];
    results.push({
      no: nextNo++, label, group: sampleName, idx: curIdx,
      time: new Date().toLocaleString('ko-KR'),
      color, data: vals, ...m,
    });

    if (devicePeak !== null) {
      syslog(`장비 보고 Peak: ${devicePeak.toFixed(1)} gf  /  곡선 계산 Peak: ${m.peak.toFixed(1)} gf`);
    }
    syslog(`측정 추가: ${label}  Peak ${m.peak.toFixed(1)} gf  Work ${m.workMJ.toFixed(3)} mJ`, 'ok');

    // Update live display with peak value in current unit
    setLiveValue(fmtF(m.peak, 1), UNIT_LABEL[currentUnit]);

    // Clear selections
    document.querySelectorAll('.lt-row-chk').forEach(c => c.checked = false);
    const sa = $('lt_selectAll'); if (sa) sa.checked = false;

    renderTable();
    updateCount();
    drawGraph();

    // Scroll table to show the newest row
    const wrap = document.querySelector('.pt-table-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;

  } finally {
    importing = false;
  }
}

// ── Outlier detection ─────────────────────────────────────────────────────────
function computeOutliers() {
  const tol = (parseFloat($('lt_tol')?.value) || 20) / 100;
  const groups = {};
  results.forEach(r => { (groups[r.group] = groups[r.group] || []).push(r); });
  const outliers = new Set();
  const median = arr => {
    const s = [...arr].sort((a, b) => a - b);
    const n = s.length, m = n >> 1;
    return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  for (const g in groups) {
    const arr = groups[g];
    if (arr.length < 4) continue;
    const med = median(arr.map(r => r.peak));
    if (med <= 0) continue;
    for (const r of arr) {
      if (Math.abs(r.peak - med) > med * tol) outliers.add(r.no);
    }
  }
  return outliers;
}

// ── Table render ──────────────────────────────────────────────────────────────
function renderTable() {
  const tb = $('lt_resultsBody'); if (!tb) return;
  const outliers = computeOutliers();
  const u = UNIT_LABEL[currentUnit] || 'gf';
  tb.innerHTML = results.map(r => `
    <tr ${outliers.has(r.no) ? 'class="outlier"' : ''}>
      <td class="cchk"><input type="checkbox" class="lt-row-chk" value="${r.no}" onchange="onSelChange()"></td>
      <td class="num"><span class="pt-no-dot" style="background:${r.color}"></span>${r.no}</td>
      <td><input class="pt-name-inp" value="${escAttr(r.label)}" onchange="renameResult(${r.no}, this.value)"></td>
      <td class="num accent">${fmtF(r.peak, 1)}</td>
      <td class="num">${fmtF(r.avg, 2)}</td>
      <td class="num">${fmtF(r.min, 1)}</td>
      <td class="num">${r.stdev.toFixed(3)}</td>
      <td class="num">${r.workMJ.toFixed(4)}</td>
      <td>${r.mode}</td>
    </tr>`).join('');
}

function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function renameResult(no, name) {
  const r = results.find(x => x.no === no);
  if (r) { r.label = name; renderTable(); drawGraph(); syslog(`라벨 변경 (No.${no}) → ${name}`); }
}

function onSelChange() {
  const all = document.querySelectorAll('.lt-row-chk');
  const chk = document.querySelectorAll('.lt-row-chk:checked');
  const sa = $('lt_selectAll'); if (sa) sa.checked = all.length > 0 && all.length === chk.length;
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
  if (chk.length === 0) { alert('삭제할 항목을 선택해 주세요.'); return; }
  if (!confirm(`선택한 ${chk.length}개 항목을 삭제하시겠습니까?`)) return;
  results = results.filter(r => !chk.includes(r.no));
  renderTable(); updateCount(); drawGraph();
  syslog(`${chk.length}개 항목 삭제됨.`);
}

function clearData() {
  if (results.length === 0) return;
  if (!confirm('모든 측정 데이터를 삭제하시겠습니까?')) return;
  results = []; nextNo = 1; curGroup = null; curIdx = 0;
  renderTable(); updateCount(); drawGraph();
  syslog('전체 데이터 초기화.');
}

// ── Export / copy ─────────────────────────────────────────────────────────────
function resultsToRows() {
  const u = UNIT_LABEL[currentUnit] || 'gf';
  const head = ['No', '샘플명', `Peak (${u})`, `Avg (${u})`, `Min (${u})`, 'Std Dev', 'Work (mJ)', '파괴모드'];
  const rows = results.map(r => [
    r.no, r.label,
    fmtF(r.peak, 4), fmtF(r.avg, 4), fmtF(r.min, 4),
    r.stdev.toFixed(4), r.workMJ.toFixed(6), r.mode,
  ]);
  return [head, ...rows];
}

function exportCSV() {
  if (!results.length) { syslog('내보낼 데이터가 없습니다.', 'warn'); return; }
  const csv = resultsToRows()
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })),
    download: `LT1000_${dateStr()}.csv`,
  });
  a.click(); URL.revokeObjectURL(a.href);
  syslog('CSV 내보내기 완료.', 'ok');
}

async function copyData() {
  if (!results.length) { syslog('복사할 데이터가 없습니다.', 'warn'); return; }
  const tsv = resultsToRows().map(r => r.join('\t')).join('\n');
  try {
    await navigator.clipboard.writeText(tsv);
    syslog('표 데이터를 클립보드에 복사했습니다.', 'ok');
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = tsv; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      syslog('표 데이터를 클립보드에 복사했습니다.', 'ok');
    } catch (_) {
      syslog('복사 실패 — 표를 직접 선택해 복사해주세요.', 'err');
    }
  }
}

function dateStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

// ── Modals ────────────────────────────────────────────────────────────────────
function showCollectingModal() {
  $('lt_modalTitle').innerHTML   = '📡 데이터 수신 중...';
  $('lt_modalTitle').className   = 'modal-title collecting';
  $('lt_modalResult').innerHTML  =
    `<div class="pt-mr-row"><span>샘플</span><b>—</b></div>` +
    `<div class="pt-mr-row"><span>Peak / Max</span><b>—</b></div>` +
    `<div class="pt-mr-row"><span>Avg</span><b>—</b></div>`;
  $('lt_modalWarn').style.display = 'none';
  $('lt_modalBtn').textContent = '수신 중...';
  $('lt_modalBtn').className   = 'pt-modal-proceed';
  $('lt_modalBtn').disabled    = true;
  $('lt_modal').style.display  = 'flex';
}

function showProceedModal(m, label) {
  const u = UNIT_LABEL[currentUnit] || 'gf';
  $('lt_modalTitle').innerHTML  = '✅ 측정 완료 · 데이터 저장됨';
  $('lt_modalTitle').className  = 'modal-title ok';
  $('lt_modalResult').innerHTML =
    `<div class="pt-mr-row"><span>샘플</span><b>${escHtml(label)}</b></div>` +
    `<div class="pt-mr-row"><span>Peak</span><b>${fmtF(m.peak, 1)} ${u}</b></div>` +
    `<div class="pt-mr-row"><span>Avg</span><b>${fmtF(m.avg, 2)} ${u}</b></div>` +
    `<div class="pt-mr-row"><span>Std Dev</span><b>${m.stdev.toFixed(3)}</b></div>` +
    `<div class="pt-mr-row"><span>Work</span><b>${m.workMJ.toFixed(4)} mJ</b></div>` +
    `<div class="pt-mr-row"><span>파괴모드</span><b>${escHtml(m.mode)}</b></div>`;
  $('lt_modalWarn').style.display = 'none';
  $('lt_modalBtn').textContent  = '확인';
  $('lt_modalBtn').className    = 'pt-modal-proceed neutral';
  $('lt_modalBtn').disabled     = false;
  $('lt_modalBtn').onclick      = closeModal;
  $('lt_modal').style.display   = 'flex';
}

function showAbortModal(points, peak) {
  $('lt_modalTitle').innerHTML  = '⚠ 시험 중단됨 · 기록 안 함';
  $('lt_modalTitle').className  = 'modal-title err';
  $('lt_modalResult').innerHTML =
    `<div class="pt-mr-row"><span>포인트 수</span><b>${points}</b></div>` +
    `<div class="pt-mr-row"><span>Peak</span><b>${peak.toFixed(1)} gf</b></div>` +
    `<div class="pt-mr-row"><span>판정</span><b>유효 기준 미달</b></div>`;
  $('lt_modalWarn').style.display  = 'block';
  $('lt_modalWarn').innerHTML =
    `유효 기준: 최소 ${MIN_POINTS}포인트 AND Peak > ${MIN_PEAK_GF} gf<br>` +
    `이번 수신 데이터는 이 기준을 충족하지 못합니다.`;
  $('lt_modalBtn').textContent = '확인';
  $('lt_modalBtn').className   = 'pt-modal-proceed neutral';
  $('lt_modalBtn').disabled    = false;
  $('lt_modalBtn').onclick     = closeModal;
  $('lt_modal').style.display  = 'flex';
}

function closeModal() {
  $('lt_modal').style.display = 'none';
}

// ── Mock data generator ───────────────────────────────────────────────────────
function generateMockData() {
  const peakForce = 150 + Math.random() * 450; // 150–600 gf
  const totalSamples = 600 + Math.floor(Math.random() * 200); // 600–800
  const rampEnd   = 200;
  const peakEnd   = 300;
  const decayEnd  = 600;

  const data = [];
  for (let i = 0; i < totalSamples; i++) {
    let f;
    if (i < rampEnd) {
      // Smooth sine-based ramp up from 0 to peakForce
      const t = i / rampEnd; // 0..1
      f = peakForce * Math.sin(t * Math.PI / 2);
      f += (Math.random() - 0.5) * peakForce * 0.05;
    } else if (i < peakEnd) {
      // Peak region with ±20% noise
      f = peakForce * (0.9 + Math.random() * 0.2);
    } else if (i < decayEnd) {
      // Exponential decay from peakForce to ~5 gf
      const t = (i - peakEnd) / (decayEnd - peakEnd); // 0..1
      f = (peakForce - 5) * Math.exp(-t * 4) + 5;
      f += (Math.random() - 0.5) * 3;
    } else {
      // Tail: 5 gf + noise
      f = 5 + (Math.random() - 0.5) * 2;
    }
    data.push(Math.max(0, f));
  }
  return data;
}

function runMockTest() {
  if (importing) { syslog('이미 처리 중입니다.', 'warn'); return; }
  syslog('Mock 테스트 생성 중...', 'ok');
  const vals = generateMockData();
  syslog(`Mock 데이터: ${vals.length}포인트, Peak ${Math.max(...vals).toFixed(1)} gf`);
  importTest(vals, false);
}

// ── Force curve graph ─────────────────────────────────────────────────────────
function drawGraph() {
  const canvas = $('lt_graphCanvas');
  const empty  = $('lt_graphEmpty');
  const legend = $('lt_graphLegend');
  if (!canvas) return;

  const checked = getChecked();
  let curves = results.filter(r => checked.includes(r.no));
  if (curves.length === 0 && results.length) curves = [results[results.length - 1]];

  if (curves.length === 0) {
    if (empty) empty.style.display = 'flex';
    canvas.style.display = 'none';
    if (legend) legend.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  canvas.style.display = 'block';

  const w = canvas.clientWidth || 360;
  const h = canvas.clientHeight || 300;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const pad = { l: 52, r: 14, t: 14, b: 32 };
  const cs = getComputedStyle(document.body);
  const gridCol  = cs.getPropertyValue('--chart-grid').trim()  || 'rgba(31,59,86,.5)';
  const textCol  = cs.getPropertyValue('--chart-text').trim()  || '#5e7790';
  const text2Col = cs.getPropertyValue('--chart-text2').trim() || '#8aa3bd';

  // Convert raw gf data to current unit and x-axis in mm (displacement)
  const curveData = curves.map(r => ({
    ...r,
    pts: r.data.map((gf, i) => ({ x: i * DX_MM, y: toUnit(gf) })),
  }));

  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  curveData.forEach(r => r.pts.forEach(p => {
    if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x;
    if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y;
  }));
  if (xmin === xmax) xmax = xmin + 1;
  const yp = (ymax - ymin) * 0.1 || 1; ymin -= yp; ymax += yp;

  const X = x => pad.l + (x - xmin) / (xmax - xmin) * (w - pad.l - pad.r);
  const Y = y => pad.t + (1 - (y - ymin) / (ymax - ymin)) * (h - pad.t - pad.b);

  // Grid lines
  ctx.lineWidth = 1;
  ctx.font = '10px Inter';
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

  // Zero line
  if (ymin < 0 && ymax > 0) {
    ctx.strokeStyle = textCol; ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(w - pad.r, Y(0)); ctx.stroke();
  }

  // Axis labels
  const u = UNIT_LABEL[currentUnit] || 'gf';
  ctx.fillStyle = text2Col; ctx.textAlign = 'center';
  ctx.fillText('Displacement (mm)', (pad.l + w - pad.r) / 2, h - 3);
  ctx.save(); ctx.translate(12, (pad.t + h - pad.b) / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText(`Force (${u})`, 0, 0); ctx.restore();

  // Curves
  curveData.forEach(r => {
    ctx.strokeStyle = r.color; ctx.lineWidth = 1.6; ctx.beginPath();
    r.pts.forEach((p, i) => {
      const x = X(p.x), y = Y(p.y);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  // Legend
  if (legend) {
    legend.innerHTML = curves.map(r =>
      `<span class="pt-leg"><span class="pt-leg-dot" style="background:${r.color}"></span>${escHtml(r.label)} <b>${fmtF(r.peak, 1)} ${u}</b></span>`
    ).join('');
  }
}

window.addEventListener('resize', () => { if (results.length) drawGraph(); });

// ── Responsive zoom ───────────────────────────────────────────────────────────
(function () {
  const REF_W = 1600;
  const MIN_Z = 0.6, MAX_Z = 1.6;
  function apply() {
    const ratio = window.innerWidth / REF_W;
    const zoom  = Math.max(MIN_Z, Math.min(MAX_Z, ratio));
    document.documentElement.style.zoom = zoom;
  }
  apply();
  window.addEventListener('resize', apply);
})();

// ── Init ──────────────────────────────────────────────────────────────────────
syslog('LT-1000 Loop Tack Logger 준비됨. 시리얼 포트를 연결하세요.', 'ok');
