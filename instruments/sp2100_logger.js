import { syslogPanelHTML, dateStr } from './_utils.js';

// ── Module-level state (reset on each launch) ─────────────────────────────────
let S = null;
function init() {
  S = {
    records: [], recId: 0, nCounter: 0,
    liveCfg: {}, prevText: '', frameBuf: [], frameTimer: null,
    lastWaveBytes: null, lastWaveCfg: null, lastRec: null,
  };
}

const t = k => app?.t(k) ?? k;

// ── Display formatting ────────────────────────────────────────────────────────
// Rule: every measured value (Val/SP/Avg/KP/RMS) is rounded to 1 decimal place
// for the table, the main display, and TXT/CSV export. (see MANUAL.md §3)
function fmt1(v) {
  return (v === null || v === undefined || isNaN(v)) ? '-' : (+v).toFixed(1);
}
function fmt2(v) {
  return (v === null || v === undefined || isNaN(v)) ? '-' : (+v).toFixed(2);
}

const TH = 'white-space:nowrap;padding:8px 10px;background:var(--panel-2);color:var(--text-dim);' +
           'font-size:11px;border-bottom:1px solid var(--border);text-align:center;position:sticky;top:0;z-index:1;';

// ── Line parsing ──────────────────────────────────────────────────────────────
// Rule (see docs/SP2100_PROTOCOL_REFERENCE.md §3): a line is only treated as a
// measurement if it carries the device's own field labels — config/handshake
// lines (POINTS/SCALE/OFFSET/SPEED/TRAVEL/T2 ...) must NOT be recorded.
//
// SP-2100: line must contain "AVG" or "PEAK"; fields are extracted by NAME via
//          "KEY",value (KEY ∈ PEAK,SP,KP,VAL,AVG,RMS). Recorded Val = AVG ?? PEAK.
// TL-2200: line must match the literal TL-2200 CSV row; fields are POSITIONAL
//          by regex capture group order: SP, KP, VAL, AVG, RMS (MANUAL.md §1).
// Rule (MANUAL.md §2): the device's own "N" value is corrupted by stray control
// characters, so it is ALWAYS ignored — an internal 1-based counter is used instead.
function parseLine(raw, model) {
  const s = (raw || '').replace(/[^\x20-\x7E]/g, ' ').trim();
  if (!s) return null;

  if (model === 'TL-2200') {
    // Format: seq,time,date,vn:...,TL-22OO,sn:...,SP,KP,VAL,AVG(?),RMS,[###],[N],[scale],[WAVEFORM]
    // Step 1: always extract the 5 measurement values (works even without waveform field)
    const mBase = s.match(/TL-22[O0]+,[^,]*,([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+)/i);
    if (!mBase) return null;
    const result = { SP: +mBase[1], KP: +mBase[2], PEAK: +mBase[2],
                     VAL: +mBase[3], AVG: +mBase[4], RMS: +mBase[5], tlWave: null };

    // Step 2: try to extract waveform string (3 fields after RMS, then the waveform)
    // Waveform field contains mostly printable chars that are NOT numeric
    const mWave = s.match(/TL-22[O0]+,[^,]*,[-+]?\d*\.?\d+,[-+]?\d*\.?\d+,[-+]?\d*\.?\d+,[-+]?\d*\.?\d+,[-+]?\d*\.?\d+,[^,]*,[^,]*,[^,]*,\s*([!-~]{10,})/i);
    if (mWave) {
      const waveStr = mWave[1];
      const waveChars = Array.from(waveStr).filter(c => c.charCodeAt(0) >= 33 && c.charCodeAt(0) <= 126);
      if (waveChars.length > 10) result.tlWave = waveChars;
    }
    return result;
  }

  // SP-2100
  if (!/"AVG"/.test(s) && !/"PEAK"/.test(s)) return null;
  const g = k => {
    const m = s.match(new RegExp('"' + k + '"\\s*,\\s*([-+]?\\d*\\.?\\d+)'));
    return m ? parseFloat(m[1]) : null;
  };
  const fields = { PEAK: g('PEAK'), SP: g('SP'), KP: g('KP'), VAL: g('VAL'), AVG: g('AVG'), RMS: g('RMS') };
  const avg = (fields.AVG !== null) ? fields.AVG : fields.PEAK;
  if (avg === null) return null;
  return { PEAK: fields.PEAK, SP: fields.SP, KP: fields.KP, VAL: fields.VAL, AVG: avg, RMS: fields.RMS };
}

// ── Measurement table ─────────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('spTableBody');
  if (!tbody) return;
  tbody.innerHTML = S.records.map((r, idx) => `
    <tr data-id="${r.id}" onclick="app.instr.selectRow(${r.id}, this)" style="cursor:pointer;">
      <td style="text-align:center;padding:5px 8px;border-bottom:1px solid var(--border);">
        <input type="checkbox" ${r.checked ? 'checked' : ''} onchange="app.instr.toggleCheck(${r.id}, this.checked)">
      </td>
      <td class="num" style="text-align:right;padding:5px 10px;font-family:var(--mono);color:var(--text-dim);border-bottom:1px solid var(--border);">${rowLabel(idx)}</td>
      <td style="padding:5px 10px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">
        <input type="text" class="inp nameIn" value="${(r.name || '').replace(/"/g, '&quot;')}" style="width:100%;min-width:60px;"
               onchange="app.instr.setRecName(${r.id}, this.value)">
      </td>
      <td style="text-align:right;padding:5px 10px;font-family:var(--mono);font-weight:700;font-size:13.5px;color:var(--cyan);border-bottom:1px solid var(--border);border-left:1px solid var(--border);">${fmt2(r.AVG)}</td>
      <td style="text-align:right;padding:5px 10px;font-family:var(--mono);border-bottom:1px solid var(--border);border-left:1px solid var(--border);">${fmt1(r.SP)}</td>
      <td style="text-align:right;padding:5px 10px;font-family:var(--mono);border-bottom:1px solid var(--border);border-left:1px solid var(--border);">${fmt1(r.KP)}</td>
      <td style="text-align:right;padding:5px 10px;font-family:var(--mono);border-bottom:1px solid var(--border);border-left:1px solid var(--border);">${fmt1(r.VAL)}</td>
      <td style="text-align:right;padding:5px 10px;font-family:var(--mono);border-bottom:1px solid var(--border);border-left:1px solid var(--border);">${fmt1(r.RMS)}</td>
    </tr>`).join('');
  syncCheckAll();
}

function syncCheckAll() {
  const cb = document.getElementById('spCheckAll');
  if (!cb) return;
  const total = S.records.length, on = S.records.filter(r => r.checked).length;
  cb.checked = total > 0 && on === total;
  cb.indeterminate = on > 0 && on < total;
}

function toggleCheck(id, checked) {
  const r = S.records.find(x => x.id === id);
  if (r) r.checked = checked;
  syncCheckAll();
  drawChart();
}

function toggleCheckAll(checked) {
  S.records.forEach(r => r.checked = checked);
  renderTable();
  drawChart();
}

function groupCount() {
  return Math.max(1, parseInt(document.getElementById('sp_group')?.value, 10) || 5);
}

// rowLabel(i) — group-based auto numbering matching the standalone program:
// "1-1, 1-2, ... 1-<groupCount>, 2-1, ..." based on the row's index in S.records.
function rowLabel(i) {
  const C = groupCount();
  return `${Math.floor(i / C) + 1}-${i % C + 1}`;
}

function renumber() { renderTable(); }

function onGroupChange() { saveSettings(); renumber(); drawChart(); }

// ── Test-condition settings persistence (localStorage) ───────────────────────
const SETTINGS_KEY = 'sp2100_settings';

function saveSettings() {
  const ids = ['sp_model', 'sp_speed', 'sp_delay', 'sp_avg', 'sp_group', 'sp_sample_name'];
  const data = {};
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) data[id] = el.value;
  });
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(data)); } catch (_) {}
}

function loadSettings() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch (_) {}
  if (!data) return;
  Object.keys(data).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = data[id];
  });
}

function saveSettingsAndReplot() {
  saveSettings();
  if (S.lastWaveBytes) plotWaveform(S.lastWaveBytes, S.lastWaveCfg);
}

function setRecName(id, name) {
  const r = S.records.find(x => x.id === id);
  if (r) r.name = name;
}

// ── Comm-settings info line (mirrors the original "통신 설정: xxxx bps · 8-N-1") ─
function refreshCfgLine() {
  const el = document.getElementById('sp_cfgLine');
  if (!el) return;
  const model = document.getElementById('sp_model')?.value || 'TL-2200';
  const baud  = model === 'SP-2100' ? 57600 : 38400;
  el.innerHTML = `${t('sp_comm_label')}: <b>${baud} bps · 8-N-1</b> ${t('sp_comm_auto')}`;
}

function onModelChange() {
  saveSettings();
  refreshCfgLine();
  const model = document.getElementById('sp_model')?.value || 'TL-2200';
  const baud  = model === 'SP-2100' ? 57600 : 38400;
  app.log(`${t('sp_model_changed')}: ${model} (${baud} bps)`);
}

// ── Test-condition settings (recorded as header comments on export) ──────────
function userSettings() {
  return {
    sampleName: document.getElementById('sp_sample_name')?.value || '',
    speed: parseFloat(document.getElementById('sp_speed')?.value) || 0,
    delay: parseFloat(document.getElementById('sp_delay')?.value) || 0,
    avg:   parseFloat(document.getElementById('sp_avg')?.value)   || 0,
  };
}

function csvHeaderComment() {
  const us = userSettings();
  return `# Sample Name: ${us.sampleName}\n# Test Speed: ${us.speed} in/min\n# Initial Delay: ${us.delay} s\n# Averaging Time: ${us.avg} s\n#\n`;
}

// ── Commit a measurement (new row, or overwrite a checked row) ───────────────
// Rule (MANUAL.md §4): if exactly one row is checked when a new measurement
// arrives, it overwrites that row in place (and the checkbox auto-clears)
// instead of appending a new row.
function commitMeasurement(f) {
  const checked = S.records.filter(r => r.checked);
  let rec;
  if (checked.length === 1) {
    rec = checked[0];
    Object.assign(rec, f);
    rec.checked = false;
    app.log(`${t('sp_overwrite_log')} Avg=${fmt1(rec.AVG)} g`, 'ok');
  } else {
    const sampleNameInput = document.getElementById('sp_sample_name')?.value || t('sp_sample_default_val') || '제품';
    const name = sampleNameInput;
    rec = { id: ++S.recId, name, checked: false, ...f };
    S.records.push(rec);
  }
  S.lastRec = rec;
  renderTable();
  app.count = S.records.length;
  app._updateCount();
  app._setDisplay(fmt1(rec.AVG), 'g');
  drawChart();
  const tw = document.getElementById('spTableWrap');
  if (tw) tw.scrollTop = tw.scrollHeight;
}

// ── Delete / clear / export / copy ────────────────────────────────────────────
function deleteChecked() {
  const before = S.records.length;
  S.records = S.records.filter(r => !r.checked);
  if (S.records.length === before) { app.log(t('sp_del_none'), 'warn'); return; }
  renderTable();
  app.count = S.records.length;
  app._updateCount();
  drawChart();
  app.log(t('sp_del_done'), 'warn');
}

function clearData() {
  if (!confirm(t('sp_clear_confirm'))) return;
  S.records = []; S.nCounter = 0;
  app.count = 0; app._updateCount();
  renderTable();
  drawChart();
  app.log(t('sp_cleared'), 'warn');
}

function exportCSV() {
  if (!S.records.length) { app.log(t('sp_no_data_log'), 'warn'); return; }
  let csv = csvHeaderComment() + '#,Name,AVG,SP,KP,VAL,RMS\n';
  S.records.forEach((r, idx) => {
    csv += [rowLabel(idx), r.name || '', fmt2(r.AVG), fmt1(r.SP), fmt1(r.KP), fmt1(r.VAL), fmt1(r.RMS)].join(',') + '\n';
  });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })),
    download: `SP2100_${dateStr()}.csv`,
  });
  a.click(); URL.revokeObjectURL(a.href);
  app.log(t('sp_csv_ok'), 'ok');
}

async function copyData() {
  if (!S.records.length) { app.log(t('sp_copy_empty'), 'warn'); return; }
  const us = userSettings();
  let txt = `Sample Name: ${us.sampleName}\tTest Speed: ${us.speed} in/min\tInitial Delay: ${us.delay} s\tAveraging Time: ${us.avg} s\n` +
            '#\tName\tAVG\tSP\tKP\tVAL\tRMS\n';
  S.records.forEach((r, idx) => {
    txt += [rowLabel(idx), r.name || '', fmt2(r.AVG), fmt1(r.SP), fmt1(r.KP), fmt1(r.VAL), fmt1(r.RMS)].join('\t') + '\n';
  });
  try {
    await navigator.clipboard.writeText(txt);
    app.log(t('sp_copy_ok'), 'ok');
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      app.log(t('sp_copy_ok'), 'ok');
    } catch (_) {
      app.log(t('sp_copy_fail'), 'err');
    }
  }
}

// ── AVG distribution chart (box & whisker) ───────────────────────────────────
// Rule (MANUAL.md §5): only a statistics chart of measured AVG values is shown
// — never the raw binary waveform noise.
function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q, b = Math.floor(pos), r = pos - b;
  return sorted[b + 1] !== undefined ? sorted[b] + r * (sorted[b + 1] - sorted[b]) : sorted[b];
}

function drawChart() {
  const cv = document.getElementById('spChart');
  const emptyEl = document.getElementById('spChartEmpty');
  if (!cv || cv.closest('[hidden]')) return;
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return;

  cv.width  = cv.offsetWidth  || 420;
  cv.height = cv.offsetHeight || 260;
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.font = '11px monospace';

  // Theme-aware colours — must read from <body> so body.light overrides resolve.
  const cs = getComputedStyle(document.body);
  const C = {
    text:    cs.getPropertyValue('--chart-text').trim()    || '#5e7790',
    text2:   cs.getPropertyValue('--chart-text2').trim()   || '#8aa3bd',
    grid:    cs.getPropertyValue('--chart-grid').trim()    || 'rgba(31,59,86,.5)',
    boxFill: cs.getPropertyValue('--chart-box-fill').trim()|| 'rgba(43,143,255,.12)',
    boxStr:  cs.getPropertyValue('--chart-box-str').trim() || '#2b8fff',
    med:     cs.getPropertyValue('--chart-med').trim()     || '#3fb6e8',
    dot:     cs.getPropertyValue('--chart-dot').trim()     || 'rgba(63,182,232,.55)',
  };

  const C_ = groupCount();
  const anyChecked = S.records.some(r => r.checked);
  const groups = {}; const used = [];
  if (anyChecked) {
    const vals = S.records.filter(r => r.checked && !isNaN(r.AVG)).map(r => +r.AVG);
    if (vals.length) { groups[t('sp_selected')] = vals; used.push(...vals); }
  } else {
    S.records.forEach((r, idx) => {
      if (r.AVG == null || isNaN(r.AVG)) return;
      const g = Math.floor(idx / C_) + 1;
      (groups[g] = groups[g] || []).push(+r.AVG);
      used.push(+r.AVG);
    });
  }
  let names = Object.keys(groups).sort((a, b) =>
    (a === t('sp_selected') || b === t('sp_selected')) ? 0 : (Number(a) - Number(b)));
  if (!names.length) { if (emptyEl) emptyEl.style.display = ''; return; }
  names = names.slice(-3);
  if (emptyEl) emptyEl.style.display = 'none';

  let mn = Math.min(...used, 0), mx = Math.max(...used, 0);
  if (mn === mx) { mn -= 1; mx += 1; }
  const m = (mx - mn) * 0.15 || 1; mn -= m; mx += m;
  const pad = 46;
  const Y = v => H - pad - ((v - mn) / (mx - mn)) * (H - pad - 20);

  ctx.strokeStyle = C.grid; ctx.fillStyle = C.text;
  for (let g = 0; g <= 4; g++) {
    const v = mn + (mx - mn) * g / 4, y = Y(v);
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - 14, y); ctx.stroke();
    ctx.fillText(v.toFixed(1), 4, y + 3);
  }
  if (mn < 0 && mx > 0) {
    ctx.strokeStyle = C.text; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(W - 14, Y(0)); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = C.text; ctx.fillText('AVG (g)', -18, 0); ctx.restore();

  const BOX_PALETTE = [
    { stroke: '#2b8fff', fill: 'rgba(43, 143, 255, 0.15)' }, // Blue
    { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.15)' }, // Emerald
    { stroke: '#a855f7', fill: 'rgba(168, 85, 247, 0.15)' }, // Purple
    { stroke: '#f97316', fill: 'rgba(249, 115, 22, 0.15)' }, // Orange
    { stroke: '#f43f5e', fill: 'rgba(244, 63, 94, 0.15)' }, // Rose
    { stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.15)' },  // Cyan
    { stroke: '#eab308', fill: 'rgba(234, 179, 8, 0.15)' },   // Yellow
    { stroke: '#ec4899', fill: 'rgba(236, 72, 153, 0.15)' }   // Pink
  ];

  const plotW = W - pad - 20, bw = Math.min(70, plotW / names.length * 0.5);
  names.forEach((gid, idx) => {
    const cx = pad + plotW * (idx + 0.5) / names.length;
    const vals = groups[gid].slice().sort((a, b) => a - b);
    const lo = vals[0], hi = vals[vals.length - 1];
    const q1 = quantile(vals, 0.25), md = quantile(vals, 0.5), q3 = quantile(vals, 0.75);

    const isNum = typeof gid === 'number' || !isNaN(gid);
    const groupNum = isNum ? parseInt(gid, 10) : (gid === t('sp_selected') ? 5 : 1);
    const colorObj = BOX_PALETTE[(groupNum - 1) % BOX_PALETTE.length];
    const boxStr = colorObj.stroke;
    const boxFill = colorObj.fill;

    ctx.strokeStyle = boxStr; ctx.fillStyle = boxFill; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx, Y(lo)); ctx.lineTo(cx, Y(hi)); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - bw / 3, Y(lo)); ctx.lineTo(cx + bw / 3, Y(lo));
    ctx.moveTo(cx - bw / 3, Y(hi)); ctx.lineTo(cx + bw / 3, Y(hi));
    ctx.stroke();
    const yt = Y(q3), yb = Y(q1);
    ctx.fillRect(cx - bw / 2, yt, bw, Math.max(1, yb - yt));
    ctx.strokeRect(cx - bw / 2, yt, bw, Math.max(1, yb - yt));

    ctx.strokeStyle = boxStr; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - bw / 2, Y(md)); ctx.lineTo(cx + bw / 2, Y(md)); ctx.stroke();

    ctx.fillStyle = boxStr + '88';
    vals.forEach(v => { ctx.beginPath(); ctx.arc(cx + bw / 2 + 6, Y(v), 2, 0, 7); ctx.fill(); });

    // 평균값 레이블 — 상단 수염 위, 기울여서 표시
    const meanG = vals.reduce((a, b) => a + b, 0) / vals.length;
    ctx.save();
    ctx.translate(cx, Y(hi) - 7);
    ctx.rotate(-Math.PI / 5.5);
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = boxStr;
    ctx.fillText(`${meanG.toFixed(2)} g`, 0, 0);
    ctx.restore();

    ctx.fillStyle = C.text2; ctx.textAlign = 'center';
    ctx.font = '9px monospace';
    const labelText = isNum ? `#${gid} (${gid}-1~${gid}-${C_})` : gid;
    ctx.fillText(labelText, cx, H - pad + 15);
    ctx.fillText(`n=${vals.length} · ${md.toFixed(1)}`, cx, H - pad + 28);
    ctx.textAlign = 'left';
  });
}

// ── Live config from device handshake/config strings (POINTS/SCALE/...) ──────
function parseConfig(text) {
  const num  = k => { const m = text.match(new RegExp('"' + k + '"\\s*,\\s*([-+]?\\d*\\.?\\d+)')); return m ? parseFloat(m[1]) : null; };
  const num2 = k => { const m = text.match(new RegExp('"' + k + '"\\s*,\\s*[-+]?\\d*\\.?\\d+\\s*,\\s*([-+]?\\d*\\.?\\d+)')); return m ? parseFloat(m[1]) : null; };
  return { POINTS: num('POINTS'), SCALE: num('SCALE'), FACTOR: num('FACTOR'), OFFSET: num('OFFSET'),
           PEAK: num('PEAK'), SPEED: num('SPEED'), TRAVEL: num('TRAVEL'), T2S: num('T2'), T2T: num2('T2') };
}
function mergeCfg(c) {
  for (const k in c) if (c[k] != null && !isNaN(c[k])) S.liveCfg[k] = c[k];
}

// ── Raw-byte waveform capture (mirrors standalone captureByte/processFrame) ──
function onByte(b) {
  S.frameBuf.push(b);
  clearTimeout(S.frameTimer);
  S.frameTimer = setTimeout(processFrame, 400);
}

function processFrame() {
  const arr = S.frameBuf; S.frameBuf = [];
  if (arr.length < 8) return;

  const fullText = arr.map(b => String.fromCharCode(b & 0x7F)).join('');
  const model    = document.getElementById('sp_model')?.value || 'TL-2200';

  // Count high-bit bytes for diagnostics
  const highBit = arr.filter(b => b > 127).length;
  app.log(`[FRAME] ${arr.length}바이트 수신 · 상위비트 ${highBit}개(${Math.round(highBit/arr.length*100)}%) · 모델 ${model}`);

  // Parse all lines; find one with measurement values (and possibly TL-2200 waveform)
  let parsedMeas = null;
  const lines = fullText.split(/[\r\n]+/);
  for (const line of lines) {
    const f = parseLine(line, model);
    if (f && f.PEAK != null) {
      parsedMeas = f;
      S.liveCfg.PEAK = f.PEAK;
      // SP-2100: take first match. TL-2200: keep scanning to find a line with waveform.
      if (model !== 'TL-2200' || f.tlWave?.length > 10) break;
    }
  }
  mergeCfg(parseConfig(S.prevText + fullText));
  S.prevText = fullText.slice(-220);

  // ── TL-2200: ASCII waveform embedded in the CSV line ──────────────────────
  if (model === 'TL-2200') {
    if (parsedMeas?.tlWave?.length > 10) {
      const chars  = parsedMeas.tlWave;
      const codes  = chars.map(c => c.charCodeAt(0));
      const baseN  = Math.max(1, Math.floor(codes.length * 0.1));
      const base   = codes.slice(0, baseN).reduce((a, b) => a + b, 0) / baseN;
      const zeroed = codes.map(c => c - base);
      const kp     = parsedMeas.KP;
      const maxAbs = Math.max(...zeroed.map(Math.abs)) || 1;
      const scale  = (kp != null && Math.abs(kp) > 0) ? Math.abs(kp) / maxAbs : 1;
      const force  = zeroed.map(v => v * scale);
      app.log(`[TL-2200 WAVE] ${chars.length}샘플 ASCII · KP=${fmt1(kp)}g`);
      plotForce(force, S.liveCfg);
      if (S.lastRec) { S.lastRec.wave = chars.slice(); S.lastRec.waveCfg = { ...S.liveCfg, tlAscii: true }; }
    } else {
      // TL-2200 idle/poll: no waveform data received — do NOT draw anything
      app.log('[TL-2200] 파형 데이터 없음 (idle 응답)');
      clearWaveform();
      if (S.lastRec) { S.lastRec.wave = null; S.lastRec.waveCfg = null; }
    }
    return;
  }

  // ── SP-2100: binary waveform section ──────────────────────────────────────
  // Binary waveform data is received but the exact decode format (SCALE/OFFSET/bit-depth)
  // is unknown without the original sp2100_logger.html source. Drawing with a guessed
  // format produces a misleading noisy shape, so we log receipt and clear the panel.
  const isPrintable = b => (b >= 32 && b < 127) || b === 13 || b === 10 || b === 9;
  let ws = -1;
  for (let i = 0; i + 32 <= arr.length; i++) {
    let p = 0;
    for (let j = 0; j < 32; j++) if (isPrintable(arr[i + j])) p++;
    if (p / 32 < 0.35) { ws = i; break; }
  }
  if (ws >= 0) {
    const waveBytes = arr.length - ws;
    app.log(`[SP-2100] 바이너리 파형 수신 ${waveBytes}바이트 (ws=${ws}) — 디코딩 포맷 미확인으로 미표시`);
  } else {
    app.log('[SP-2100] 바이너리 파형 없음');
  }
  clearWaveform();
  if (S.lastRec) { S.lastRec.wave = null; S.lastRec.waveCfg = null; }
}

function clearWaveform() {
  S.lastWaveBytes = null;
  S.lastWaveCfg = null;
  const cv = document.getElementById('spWaveChart');
  if (cv) {
    const ctx = cv.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, cv.width, cv.height);
  }
  const info = document.getElementById('spWaveInfo');
  if (info) info.innerHTML = t('sp_wave_hint') || '측정을 실행하면 힘-시간 곡선이 표시됩니다.';
  const empty = document.getElementById('spWaveEmpty');
  if (empty) empty.style.display = '';
}

function selectRow(id, tr) {
  const r = S.records.find(x => x.id === id);
  if (!r) return;

  const tbody = document.getElementById('spTableBody');
  if (tbody) {
    Array.from(tbody.getElementsByTagName('tr')).forEach(x => {
      x.style.background = '';
      x.style.boxShadow = '';
    });
  }

  if (tr) {
    tr.style.background = 'rgba(59, 130, 246, 0.1)';
    tr.style.boxShadow = 'inset 3px 0 0 var(--cyan)';
  }

  if (r.wave && r.wave.length > 50) {
    plotWaveform(r.wave, r.waveCfg || S.liveCfg);
  } else {
    clearWaveform();
  }
}

// 8/16-bit candidate decodings; pick the one whose max best matches device PEAK.
// Logic mirrors the original standalone sp2100_logger.html exactly.
function decodeWave(B, cfg) {
  const SC = cfg.SCALE || 0.07106;
  const FA = cfg.FACTOR || 1;
  const OF = (cfg.OFFSET != null) ? cfg.OFFSET : 0;
  const peak = cfg.PEAK;
  const cands = [];

  // 8-bit: (byte - 128) * SCALE * FACTOR
  cands.push({ name: '8bit·128', f: B.map(b => (b - 128) * SC * FA) });

  // 16-bit: alignment(0/1) × endian(LE/BE) × sign(U/S) + OFFSET
  for (const al of [0, 1]) {
    for (const be of [false, true]) {
      for (const sg of [false, true]) {
        const f = [];
        for (let i = al; i + 1 < B.length; i += 2) {
          let raw = be ? ((B[i] << 8) | B[i + 1]) : (B[i] | (B[i + 1] << 8));
          if (sg && raw > 32767) raw -= 65536;
          f.push((raw + OF) * SC * FA);
        }
        cands.push({ name: `16bit·${be ? 'BE' : 'LE'}·${sg ? 'S' : 'U'}·a${al}`, f });
      }
    }
  }

  // Default to 16bit·LE·U·a0; if PEAK known, pick candidate whose max is closest to PEAK
  let best = cands.find(c => c.name === '16bit·LE·U·a0') || cands[0];
  if (peak != null && !isNaN(peak)) {
    let bestErr = Infinity;
    for (const c of cands) {
      if (c.f.length < 10) continue;
      const mx = Math.max(...c.f);
      if (!isFinite(mx)) continue;
      const err = Math.abs(mx - peak) / Math.max(Math.abs(peak), 1e-6);
      if (err < bestErr) { bestErr = err; best = c; }
    }
    // Rescale amplitude so the waveform max matches the device PEAK value.
    // This corrects for wrong SCALE (the shape is always from raw bytes; only amplitude is adjusted).
    const rawMax = Math.max(...best.f);
    if (rawMax > 0 && isFinite(rawMax)) {
      const ratio = peak / rawMax;
      best = { name: best.name, f: best.f.map(v => v * ratio) };
    }
  }

  return best;
}

function waveColors() {
  const cs = getComputedStyle(document.body);
  return {
    accent: cs.getPropertyValue('--chart-box-str').trim() || '#2b8fff',
    line:   cs.getPropertyValue('--chart-grid').trim()    || 'rgba(31,59,86,.5)',
    sub:    cs.getPropertyValue('--chart-text').trim()    || '#5e7790',
  };
}

// plotForce: draw an already-decoded force[] array (used by TL-2200 ASCII path)
function plotForce(force, cfg) {
  S.lastWaveBytes = null; S.lastWaveCfg = cfg;
  const us  = userSettings();
  const N   = force.length;
  let tMax  = null;
  if (us && (us.delay || us.avg)) tMax = (us.delay || 0) + (us.avg || 0);
  drawCurve(force, tMax, us);
  const peakF = N ? Math.max(...force) : 0;
  const info  = document.getElementById('spWaveInfo');
  if (info) {
    info.innerHTML = `${t('sp_wave_samples') || '샘플'} <b>${N}</b>개 · TL-2200 ASCII · KP <b>${(cfg.PEAK ?? '?')} g</b>` +
      ` · max <b>${peakF.toFixed(2)} g</b>` +
      (tMax ? ` · 0~<b>${tMax.toFixed(1)} s</b>` : '');
  }
  const empty = document.getElementById('spWaveEmpty');
  if (empty) empty.style.display = 'none';
}

function plotWaveform(bytes, cfg) {
  S.lastWaveBytes = bytes; S.lastWaveCfg = cfg;
  if (S.lastRec && cfg) {
    if (S.lastRec.PEAK != null) cfg.PEAK = S.lastRec.PEAK;
    else if (S.lastRec.KP != null) cfg.PEAK = S.lastRec.KP;
  }
  const dec = decodeWave(bytes, cfg);
  const force = dec.f;
  const us = userSettings();
  const N = force.length;
  let tMax = null;
  if (cfg.TRAVEL && us.speed) tMax = cfg.TRAVEL / us.speed * 60;
  else if (cfg.TRAVEL && cfg.SPEED) tMax = cfg.TRAVEL / cfg.SPEED * 60;
  else if (cfg.T2S && cfg.T2T && N) tMax = cfg.T2T * N / cfg.T2S;
  else if (cfg.T2T) tMax = cfg.T2T;
  
  if (!tMax && us && (us.delay || us.avg)) {
    tMax = (us.delay || 0) + (us.avg || 0);
  }
  drawCurve(force, tMax, us);

  const peakF = force.length ? Math.max(...force) : 0;
  const info = document.getElementById('spWaveInfo');
  if (info) {
    info.innerHTML = `${t('sp_wave_samples') || '샘플'} <b>${force.length}</b>개 · ${t('sp_wave_decode') || '디코딩'} <b>${dec.name}</b> · SCALE ${cfg.SCALE || 0.07106} · OFFSET ${cfg.OFFSET ?? '?'}` +
      (tMax ? ` · 0~<b>${tMax.toFixed(2)} s</b> (${t('sp_speed_label')} ${us.speed} in/min)` : '') +
      ` · delay ${us.delay}s · avg ${us.avg}s · max <b>${peakF.toFixed(2)} g</b> · PEAK <b>${cfg.PEAK ?? '?'} g</b>`;
  }
  const empty = document.getElementById('spWaveEmpty');
  if (empty) empty.style.display = 'none';
}

function drawCurve(force, tMax, us) {
  const cv = document.getElementById('spWaveChart');
  if (!cv || cv.closest('[hidden]')) return;
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return;
  cv.width  = cv.offsetWidth  || 600;
  cv.height = cv.offsetHeight || 160;
  const W = cv.width, H = cv.height, pad = 40;
  const { accent, line, sub } = waveColors();
  ctx.clearRect(0, 0, W, H);

  const n = force.length;
  let mn = Math.min(...force), mx = Math.max(...force);
  if (mn === mx) { mn -= 1; mx += 1; }
  const pp = (mx - mn) * 0.1 || 1; mn -= pp; mx += pp;
  const X  = i   => pad + (i / (n - 1)) * (W - pad - 14);
  const Y  = v   => H - pad - ((v - mn) / (mx - mn)) * (H - pad - 16);
  const Xt = sec => pad + ((tMax ? sec / tMax : 0)) * (W - pad - 14);

  if (tMax && us) {
    if (us.delay > 0) { ctx.fillStyle = 'rgba(123,138,158,.16)'; ctx.fillRect(pad, 16, Math.max(0, Xt(Math.min(us.delay, tMax)) - pad), H - pad - 16); }
    if (us.avg > 0) {
      const a = Math.min(us.delay, tMax), b = Math.min(us.delay + us.avg, tMax);
      ctx.fillStyle = 'rgba(54,224,192,.13)'; ctx.fillRect(Xt(a), 16, Math.max(0, Xt(b) - Xt(a)), H - pad - 16);
    }
  }

  ctx.font = '11px monospace'; ctx.lineWidth = 1; ctx.strokeStyle = line; ctx.fillStyle = sub;
  for (let g = 0; g <= 4; g++) { const v = mn + (mx - mn) * g / 4, y = Y(v); ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - 14, y); ctx.stroke(); ctx.fillText(v.toFixed(1), 4, y + 3); }
  for (let g = 0; g <= 5; g++) {
    const i = Math.round((n - 1) * g / 5), x = X(i);
    ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(x, H - pad); ctx.lineTo(x, 16); ctx.stroke();
    ctx.fillStyle = sub; ctx.fillText((tMax != null) ? (tMax * g / 5).toFixed(1) : String(i), x - 8, H - pad + 15);
  }
  if (mn < 0 && mx > 0) { ctx.strokeStyle = sub; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(W - 14, Y(0)); ctx.stroke(); ctx.setLineDash([]); }

  if (tMax && us) {
    ctx.setLineDash([4, 3]); ctx.fillStyle = sub;
    if (us.delay > 0) {
      ctx.strokeStyle = sub; ctx.beginPath(); ctx.moveTo(Xt(Math.min(us.delay, tMax)), 16); ctx.lineTo(Xt(Math.min(us.delay, tMax)), H - pad); ctx.stroke();
      ctx.fillText('delay', Xt(Math.min(us.delay, tMax)) - 14, 28);
    }
    if (us.avg > 0) {
      const b = Math.min(us.delay + us.avg, tMax);
      ctx.strokeStyle = accent; ctx.beginPath(); ctx.moveTo(Xt(b), 16); ctx.lineTo(Xt(b), H - pad); ctx.stroke();
      ctx.fillStyle = accent; ctx.fillText('avg window', Xt(Math.min(us.delay, tMax)) + 4, 28);
    }
    ctx.setLineDash([]);
  }

  ctx.fillStyle = sub; ctx.fillText(tMax != null ? (app?.lang === 'ko' ? '시간 (초)' : 'time (s)') : 'sample #', W / 2 - 22, H - 6);
  ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(app?.lang === 'ko' ? 'g' : 'force (g)', -22, 0); ctx.restore();

  ctx.strokeStyle = accent; ctx.lineWidth = 1.3; ctx.beginPath();
  for (let i = 0; i < n; i++) { const x = X(i), y = Y(force[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
}

// ── Serial line handler ───────────────────────────────────────────────────────
function onLine(line) {
  const model = document.getElementById('sp_model')?.value || 'TL-2200';
  const f = parseLine(line, model);
  if (!f) return;
  app.log(`RX  SP=${fmt1(f.SP)} KP=${fmt1(f.KP)} Val=${fmt1(f.VAL)} Avg=${fmt1(f.AVG)} RMS=${fmt1(f.RMS)} g`);
  S.liveCfg.PEAK = f.KP;
  commitMeasurement(f);

  // TL-2200: ASCII waveform is embedded in the CSV line — plot it immediately
  if (model === 'TL-2200' && f.tlWave && f.tlWave.length > 10) {
    const codes  = f.tlWave.map(c => c.charCodeAt(0));
    const baseN  = Math.max(1, Math.floor(codes.length * 0.1));
    const base   = codes.slice(0, baseN).reduce((a, b) => a + b, 0) / baseN;
    const zeroed = codes.map(c => c - base);
    const kp     = f.KP;
    const maxAbs = Math.max(...zeroed.map(Math.abs)) || 1;
    const scale  = (kp != null && Math.abs(kp) > 0) ? Math.abs(kp) / maxAbs : 1;
    const force  = zeroed.map(v => v * scale);
    app.log(`[TL-2200 WAVE] ${f.tlWave.length}샘플 ASCII, KP=${fmt1(kp)}g`);
    plotForce(force, S.liveCfg);
    if (S.lastRec) { S.lastRec.wave = f.tlWave.slice(); S.lastRec.waveCfg = { ...S.liveCfg, tlAscii: true }; }
  }
}

function onConnect() {
  const model = document.getElementById('sp_model')?.value || 'TL-2200';
  const baud  = model === 'SP-2100' ? 57600 : 38400;
  S.liveCfg = {}; S.prevText = ''; S.frameBuf = [];
  clearTimeout(S.frameTimer); S.frameTimer = null;
  app.log(`${t('sp_conn_log')}: ${model} (${baud} bps)`, 'ok');
}

function onDisconnect() {
  clearTimeout(S.frameTimer); S.frameTimer = null; S.frameBuf = [];
}

// ── Exported instrument module ────────────────────────────────────────────────
export default {
  name: 'SP-2100 / TL-2200',
  icon: 'assets/sp2100.png',
  category: 'Instrument',
  viewType: 'custom',

  // Rule (MANUAL.md §5): Baud rate must default to 38400 (TL-2200). The model
  // dropdown can switch to SP-2100 (57600) before connecting.
  get serial() {
    const model = document.getElementById('sp_model')?.value || 'TL-2200';
    return model === 'SP-2100'
      ? { baudRate: 57600, dataBits: 8, parity: 'none', stopBits: 1 }
      : { baudRate: 38400, dataBits: 8, parity: 'none', stopBits: 1 };
  },

  pollCmd: 'R\r',
  pollInterval: 300,

  buildSidebar(el) {
    if (!S) init();
    el.innerHTML = `<div class="sidebar-top">
      <div class="panel">
        <div class="field-label">${t('sp_model_label')}</div>
        <select id="sp_model" class="inp" onchange="app.instr.onModelChange()">
          <option value="TL-2200">TL-2200</option>
          <option value="SP-2100">SP-2100 (Peel/Force)</option>
        </select>
        <div id="sp_cfgLine" class="cfgline" style="font-family:var(--mono);font-size:12px;color:var(--cyan);
             background:var(--panel-2);border:1px solid var(--border);border-radius:8px;padding:9px 11px;margin:10px 0;"></div>
        <div id="connStatus" class="conn-status-lbl">Disconnected</div>
        <button id="btnConnect" class="big-btn" onclick="app.toggleConnection()">${t('conn_btn')}</button>
      </div>
      <div class="panel">
      <div class="panel-title">${t('sp_test_section')}</div>
      <label class="fl" style="margin-top:0;">${t('sp_sample_name_label') || '샘플명'}</label>
      <input type="text" id="sp_sample_name" class="inp" value="${t('sp_sample_default_val') || '제품'}" style="width:100%;margin-bottom:10px;" onchange="app.instr.saveSettings()">
      <label class="fl">${t('sp_speed_label')}</label>
      <div style="display:flex;align-items:center;gap:6px;">
        <input type="number" id="sp_speed" class="inp" value="90" step="1" min="0" onchange="app.instr.saveSettingsAndReplot()">
          <span style="font-size:11px;color:var(--text-mut);width:48px;">in/min</span>
        </div>
        <label class="fl">${t('sp_delay_label')}</label>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="number" id="sp_delay" class="inp" value="0.5" step="0.1" min="0" onchange="app.instr.saveSettingsAndReplot()">
          <span style="font-size:11px;color:var(--text-mut);width:48px;">s</span>
        </div>
        <label class="fl">${t('sp_avg_label')}</label>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="number" id="sp_avg" class="inp" value="5" step="0.5" min="0" onchange="app.instr.saveSettingsAndReplot()">
          <span style="font-size:11px;color:var(--text-mut);width:48px;">s</span>
        </div>
        <div style="font-size:11px;color:var(--text-mut);margin-top:6px;line-height:1.5;">${t('sp_test_hint')}</div>
      </div>
    </div>${syslogPanelHTML()}`;
    loadSettings();
    refreshCfgLine();
  },

  buildCenter(el) {
    el.innerHTML = `
      <div class="display-bar">
        <div class="disp-value"><span id="liveValue">— — —</span><span class="disp-unit" id="liveUnit">g</span></div>
        <div class="disp-meta">
          <span id="liveStatus" class="disp-status off">${t('disconnected')}</span>
          <span class="meas-count">${t('meas_count_lbl')} <b id="measCount">0</b></span>
        </div>
      </div>
      <div class="panel datalog-head-bar">
        <div class="panel-title">${t('sp_table_title')}</div>
        <div class="datalog-actions">
          <span style="display:flex;align-items:center;gap:6px;margin-right:4px;" title="${t('sp_group_hint')}">
            <label class="fl" style="margin:0;white-space:nowrap;">${t('sp_group_label')}</label>
            <input type="number" id="sp_group" class="inp" style="width:64px;" value="5" min="1" step="1" onchange="app.instr.onGroupChange()">
          </span>
          <button class="sbtn" onclick="app.instr.copyData()">${t('btn_copy')}</button>
          <button class="sbtn green" onclick="app.instr.exportCSV()">${t('btn_csv')}</button>
          <button class="sbtn red-o" onclick="app.instr.deleteChecked()">${t('btn_del_sel')}</button>
          <button class="sbtn red" onclick="app.instr.clearData()">${t('btn_clear')}</button>
        </div>
      </div>
      <div class="panel grow" style="min-height:0;">
        <div id="spTableWrap" class="table-wrap" style="flex:1;overflow:auto;border:1px solid var(--border);border-radius:8px;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr>
              <th style="${TH}text-align:center;"><input type="checkbox" id="spCheckAll" onchange="app.instr.toggleCheckAll(this.checked)"></th>
              <th style="${TH}">#</th>
              <th style="${TH}">${t('sp_name_label') || '이름'}</th>
              <th style="${TH}color:var(--cyan);">AVG</th>
              <th style="${TH}">SP</th>
              <th style="${TH}">KP</th>
              <th style="${TH}">VAL</th>
              <th style="${TH}">RMS</th>
            </tr></thead>
            <tbody id="spTableBody"></tbody>
          </table>
        </div>
      </div>`;
  },

  buildRightPanel(el) {
    el.innerHTML = `
      <div class="panel" style="margin-bottom:10px;">
        <div class="graph-head"><div class="panel-title">${t('sp_wave_title') || '현재 파형 그래프 (힘-시간)'}</div></div>
        <div class="graph-hint" id="spWaveInfo">${t('sp_wave_hint') || '측정을 실행하면 힘-시간 곡선이 표시됩니다.'}</div>
        <div class="graph-area" style="min-height:160px;">
          <canvas id="spWaveChart"></canvas>
          <div class="graph-empty" id="spWaveEmpty">${t('sp_wave_hint') || '측정을 실행하면 힘-시간 곡선이 표시됩니다.'}</div>
        </div>
      </div>
      <div class="panel grow">
        <div class="graph-head"><div class="panel-title">${t('sp_dist_title')}</div></div>
        <div class="graph-hint">${t('sp_dist_hint')}</div>
        <div class="graph-area">
          <canvas id="spChart"></canvas>
          <div class="graph-empty" id="spChartEmpty">${t('chart_empty')}</div>
        </div>
      </div>`;
  },

  onLine,
  onByte,
  onConnect,
  onDisconnect,
  onRebuild() { renderTable(); },

  // Exposed for inline onclick handlers
  copyData, exportCSV, clearData, deleteChecked,
  toggleCheck, toggleCheckAll, onGroupChange, onModelChange,
  setRecName, saveSettings, saveSettingsAndReplot, selectRow,
};
