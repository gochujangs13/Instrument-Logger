import { syslogPanelHTML, dateStr } from './_utils.js';
import { fillSP2100Template } from './sp2100_xlsx.js';

// ── Module-level state (reset on each launch) ─────────────────────────────────
let S = null;
function init() {
  S = {
    records: [], recId: 0, nCounter: 0,
    liveCfg: {}, prevText: '', frameBuf: [], frameTimer: null,
    lastWaveBytes: null, lastWaveCfg: null, lastRec: null,
    lastRawFrame: null, rawFrameCount: 0,
    _yMin: null, _yMax: null, _yMaxInp: null, _yMinInp: null, _yResetBtn: null,
    _waveYMin: null, _waveYMax: null, _waveYMaxInp: null, _waveYMinInp: null, _waveYResetBtn: null,
    waveSegments: [],         // Array of { id, startIdx, endIdx }
    activeDragSegment: null,  // { startIdx, endIdx, active, startX }
    multiSegmentMode: false,  // Toggle for adding multiple segments
    activeRecId: null,        // Currently active / viewed record ID
    _cachedWave: null,        // { force, tMax, us }
  };
}

const t = k => app?.t(k) ?? k;

// ── Y-axis overlay helpers ────────────────────────────────────────────────────
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

function _attachWaveYOverlay(graphAreaEl, redrawFn) {
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
  S._waveYMaxInp = make('y-axis-max');
  S._waveYMinInp = make('y-axis-min');
  const resetBtn = document.createElement('button');
  resetBtn.className = 'y-reset-btn'; resetBtn.title = t('y_axis_auto'); resetBtn.textContent = '↺';
  resetBtn.style.display = 'none';
  overlay.appendChild(resetBtn);
  S._waveYResetBtn = resetBtn;
  const apply = () => {
    S._waveYMin = S._waveYMinInp.value !== '' ? parseFloat(S._waveYMinInp.value) : null;
    S._waveYMax = S._waveYMaxInp.value !== '' ? parseFloat(S._waveYMaxInp.value) : null;
    resetBtn.style.display = (S._waveYMin !== null || S._waveYMax !== null) ? '' : 'none';
    redrawFn();
  };
  for (const inp of [S._waveYMaxInp, S._waveYMinInp]) {
    inp.addEventListener('change', apply);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); apply(); } });
  }
  resetBtn.onclick = () => {
    S._waveYMin = null; S._waveYMax = null;
    S._waveYMaxInp.value = ''; S._waveYMinInp.value = '';
    resetBtn.style.display = 'none';
    redrawFn();
  };
}

function setWaveYScale() {
  const minEl = document.getElementById('spWaveYMinInp');
  const maxEl = document.getElementById('spWaveYMaxInp');
  S._waveYMin = minEl && minEl.value !== '' ? parseFloat(minEl.value) : null;
  S._waveYMax = maxEl && maxEl.value !== '' ? parseFloat(maxEl.value) : null;
  if (S?._cachedWave) {
    drawCurve(S._cachedWave.force, S._cachedWave.tMax, S._cachedWave.us);
  }
}

function resetWaveYScale() {
  const minEl = document.getElementById('spWaveYMinInp');
  const maxEl = document.getElementById('spWaveYMaxInp');
  if (minEl) minEl.value = '';
  if (maxEl) maxEl.value = '';
  S._waveYMin = null;
  S._waveYMax = null;
  if (S?._cachedWave) {
    drawCurve(S._cachedWave.force, S._cachedWave.tMax, S._cachedWave.us);
  }
}

function setChartYScale() {
  const minEl = document.getElementById('spChartYMinInp');
  const maxEl = document.getElementById('spChartYMaxInp');
  S._yMin = minEl && minEl.value !== '' ? parseFloat(minEl.value) : null;
  S._yMax = maxEl && maxEl.value !== '' ? parseFloat(maxEl.value) : null;
  drawChart();
}

function resetChartYScale() {
  const minEl = document.getElementById('spChartYMinInp');
  const maxEl = document.getElementById('spChartYMaxInp');
  if (minEl) minEl.value = '';
  if (maxEl) maxEl.value = '';
  S._yMin = null;
  S._yMax = null;
  drawChart();
}

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

  // SP-2100: robust named labels parsing (supports "KEY",val or KEY:val or KEY=val or KEY val)
  // 시리즈 통계 요약 라인(MEANS, STDEV, COV, END SERIES)은 개별 측정값이 아니므로 제외
  if (/["']?(?:MEANS|STDEV|COV|END SERIES)["']?/i.test(s)) return null;

  const g = k => {
    // Matches: "AVG",71.5 | "AVG":71.5 | AVG,71.5 | AVG: 71.5 | AVG=71.5 | AVG 71.5
    const m = s.match(new RegExp('(?:\"' + k + '\"|\\b' + k + '\\b)\\s*[:=,\\s]\\s*([-+]?\\d*\\.?\\d+)', 'i'));
    return m ? parseFloat(m[1]) : null;
  };
  const fields = { PEAK: g('PEAK'), SP: g('SP'), KP: g('KP'), VAL: g('VAL'), AVG: g('AVG'), RMS: g('RMS') };
  const avg = (fields.AVG !== null) ? fields.AVG : (fields.PEAK !== null ? fields.PEAK : fields.VAL);
  if (avg === null) return null;
  const peak = fields.PEAK ?? fields.KP ?? avg;
  return { PEAK: peak, SP: fields.SP, KP: fields.KP ?? peak, VAL: fields.VAL, AVG: avg, RMS: fields.RMS };
}

// ── Measurement table ─────────────────────────────────────────────────────────
function setRecField(id, field, val) {
  const r = S.records.find(x => x.id === id);
  if (!r) return;
  const num = parseFloat(val);
  const newNum = isNaN(num) ? null : num;
  if (!r._orig) {
    r._orig = { AVG: r.AVG, KP: r.KP, SP: r.SP, VAL: r.VAL, RMS: r.RMS };
  }
  if (r[field] !== newNum) {
    r[field] = newNum;
    r._isModified = true;
  }
  if (field === 'AVG') {
    drawChart();
    if (S.lastRec && S.lastRec.id === id) {
      app._setDisplay(fmt1(r.AVG), 'g');
    }
  }
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('spTableBody');
  if (!tbody) return;

  const cellInp = (id, field, val, isCyan = false, decimals = 1, isModified = false) => {
    const formatted = (val !== null && val !== undefined && !isNaN(val)) ? (+val).toFixed(decimals) : '';
    const isLight = document.body.classList.contains('light');
    let color = isCyan ? (isLight ? 'color:#0284c7;font-weight:700;font-size:13.5px;' : 'color:var(--cyan);font-weight:700;font-size:13.5px;') : 'color:inherit;';
    if (isModified && field === 'AVG') {
      color = isLight ? 'color:#b45309;font-weight:800;font-size:13.5px;' : 'color:#fbbf24;font-weight:800;font-size:13.5px;';
    }
    return `<input type="number" step="any" class="inp" value="${formatted}"
             style="width:72px;text-align:right;font-family:var(--mono);background:transparent;border:1px solid transparent;padding:2px 4px;${color}"
             onfocus="this.style.background='var(--panel)';this.style.borderColor='var(--border)'"
             onblur="this.style.background='transparent';this.style.borderColor='transparent'"
             onchange="app.instr.setRecField(${id}, '${field}', this.value)"
             onclick="event.stopPropagation()">`;
  };

  tbody.innerHTML = S.records.map((r, idx) => {
    const isSelected = r.id === S.activeRecId;
    const origAvg = r._orig?.AVG != null ? fmt1(r._orig.AVG) : '';
    return `
    <tr data-id="${r.id}" onclick="app.instr.selectRow(${r.id}, this)" style="cursor:pointer;${isSelected ? 'background:rgba(59, 130, 246, 0.1);box-shadow:inset 3px 0 0 var(--cyan);' : ''}">
      <td style="text-align:center;padding:5px 8px;border-bottom:1px solid var(--border);">
        <input type="checkbox" ${r.checked ? 'checked' : ''} onchange="app.instr.toggleCheck(${r.id}, this.checked)">
      </td>
      <td class="num" style="text-align:right;padding:5px 8px;font-family:var(--mono);color:var(--text-dim);border-bottom:1px solid var(--border);white-space:nowrap;">
        <span>${rowLabel(idx)}</span>
        ${r._isModified ? `<button class="sbtn orange" style="padding:1px 5px;font-size:10px;margin-left:4px;line-height:1.2;vertical-align:middle;" title="${app?.lang === 'ko' ? `구간 적용됨 (클릭 시 원본 복구: ${origAvg}g)` : `Segment applied (click to restore: ${origAvg}g)`}" onclick="event.stopPropagation(); app.instr.restoreOriginalTableData(${r.id})">수정 ↺</button>` : ''}
      </td>
      <td style="padding:5px 10px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">
        <input type="text" class="inp nameIn" value="${(r.name || '').replace(/"/g, '&quot;')}" style="width:100%;min-width:60px;"
               onchange="app.instr.setRecName(${r.id}, this.value)" onclick="event.stopPropagation()">
      </td>
      <td style="text-align:right;padding:3px 6px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);" title="${r._isModified ? (app?.lang === 'ko' ? `구간 적용값 (장비 원본: ${origAvg} g)` : `Modified value (Original: ${origAvg} g)`) : ''}">${cellInp(r.id, 'AVG', r.AVG, true, 2, r._isModified)}</td>
      <td style="text-align:right;padding:3px 6px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">${cellInp(r.id, 'SP', r.SP, false, 1)}</td>
      <td style="text-align:right;padding:3px 6px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">${cellInp(r.id, 'KP', r.KP, false, 1)}</td>
      <td style="text-align:right;padding:3px 6px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">${cellInp(r.id, 'VAL', r.VAL, false, 1)}</td>
      <td style="text-align:right;padding:3px 6px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);">${cellInp(r.id, 'RMS', r.RMS, false, 1)}</td>
    </tr>`;
  }).join('');
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
  const ids = ['sp_model', 'sp_baud', 'sp_speed', 'sp_delay', 'sp_avg', 'sp_group', 'sp_sample_name'];
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
    if (el) {
      if (id === 'sp_baud' && !['57600', '38400'].includes(String(data[id]))) {
        el.value = '57600';
      } else {
        el.value = data[id];
      }
    }
  });
}

function saveSettingsAndReplot() {
  saveSettings();
  const us = userSettings();
  // 1. 현재 화면의 최근 파형 곡선 즉시 재렌더 (Delay 및 Averaging window 구간 실시간 갱신)
  if (S._cachedWave?.force?.length) {
    plotForce(S._cachedWave.force, S._cachedWave.cfg || S.liveCfg);
  } else if (S.lastWaveBytes) {
    plotWaveform(S.lastWaveBytes, S.lastWaveCfg);
  }
  // 2. 직전 측정된 최근 레코드(S.lastRec)의 설정 메타데이터에도 최신 설정 즉시 반영
  if (S.lastRec) {
    if (!S.lastRec.waveCfg) S.lastRec.waveCfg = {};
    Object.assign(S.lastRec.waveCfg, us);
  }
}

function setRecName(id, name) {
  const r = S.records.find(x => x.id === id);
  if (r) r.name = name;
}

// ── Comm-settings info line (mirrors the original "통신 설정: xxxx bps · 8-N-1") ─
function refreshCfgLine() {
  const el = document.getElementById('sp_cfgLine');
  if (!el) return;
  const baud = parseInt(document.getElementById('sp_baud')?.value, 10) || 57600;
  el.innerHTML = `${t('sp_comm_label')}: <b>${baud} bps · 8-N-1</b>`;
}

function onModelChange() {
  const model = document.getElementById('sp_model')?.value || 'SP-2100';
  const baudSel = document.getElementById('sp_baud');
  if (baudSel) {
    baudSel.value = (model === 'SP-2100') ? '57600' : '38400';
  }
  saveSettings();
  refreshCfgLine();
  const baud = parseInt(document.getElementById('sp_baud')?.value, 10) || (model === 'SP-2100' ? 57600 : 38400);
  app.log(`${t('sp_model_changed')}: ${model} (${baud} bps)`);
}

function onBaudChange() {
  saveSettings();
  refreshCfgLine();
  const baud = parseInt(document.getElementById('sp_baud')?.value, 10) || 57600;
  app.log(`${t('sp_baud_changed') || '통신 속도 변경'}: ${baud} bps`);
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
  if (!f || f.AVG == null) return;
  const now = Date.now();
  // 1.5초 이내 동일한 AVG/KP 측정값 수신 시 중복 등록 방지
  if (S.lastRec && (now - (S._lastCommitTime || 0) < 1500)) {
    if (Math.abs(S.lastRec.AVG - f.AVG) < 0.05 && Math.abs(S.lastRec.KP - f.KP) < 0.05) {
      Object.assign(S.lastRec, f);
      return;
    }
  }
  S._lastCommitTime = now;

  const checked = S.records.filter(r => r.checked);
  let rec;
  if (checked.length === 1) {
    rec = checked[0];
    Object.assign(rec, f);
    rec.checked = false;
    rec._orig = { AVG: rec.AVG, KP: rec.KP, SP: rec.SP, VAL: rec.VAL, RMS: rec.RMS };
    rec._isModified = false;
    rec._appliedSegments = null;
    S.activeRecId = rec.id;
    app.log(`${t('sp_overwrite_log')} Avg=${fmt1(rec.AVG)} g`, 'ok');
  } else {
    const sampleNameInput = document.getElementById('sp_sample_name')?.value || t('sp_sample_default_val') || '제품';
    const name = sampleNameInput;
    rec = {
      id: ++S.recId,
      name,
      checked: false,
      ...f,
      _orig: { AVG: f.AVG, KP: f.KP, SP: f.SP, VAL: f.VAL, RMS: f.RMS },
      _isModified: false,
      _appliedSegments: null,
    };
    S.records.push(rec);
    S.activeRecId = rec.id;
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
  S.lastRec = null;
  app.count = 0; app._updateCount();
  renderTable();
  drawChart();
  clearWaveform();
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

async function saveBytes(filename, bytes, contentType) {
  try {
    const response = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': contentType, 'X-Filename': encodeURIComponent(filename) },
      body: bytes,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json().catch(() => ({}));
    app.log(`[SP2100] ${t('saved') || '저장 완료'}: ${data.path || filename}`, 'ok');
  } catch (_) {
    const blob = new Blob([bytes], { type: contentType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    app.log(`[SP2100] ${t('fallback') || '다운로드 완료'}: ${filename}`, 'ok');
  }
}

async function exportXLSX() {
  const anyChecked = S.records.some(r => r.checked);
  const targetRecords = anyChecked ? S.records.filter(r => r.checked) : S.records;
  if (!targetRecords.length) {
    app.log(t('sp_no_data_log') || '저장할 측정 데이터가 없습니다.', 'warn');
    return;
  }

  const us = userSettings();
  const runs = targetRecords.map((r, idx) => {
    const wave = r.wave || [];
    const N = wave.length;
    const cfg = r.waveCfg || {};
    let tMax = null;
    if (cfg?.T2T && cfg?.T2S && N) tMax = (cfg.T2T * N / cfg.T2S);
    else if (cfg?.TRAVEL && cfg?.SPEED) tMax = (cfg.TRAVEL / cfg.SPEED * 60);
    else if (us.delay != null && us.avg != null && (us.delay + us.avg) > 0) tMax = us.delay + us.avg;
    else tMax = 6.0;

    const rawRows = wave.map((f, i) => ({
      time: N > 1 ? +(i * tMax / (N - 1)).toFixed(4) : 0,
      force: +f.toFixed(2),
    }));

    const origIdx = S.records.indexOf(r);
    const label = origIdx >= 0 ? rowLabel(origIdx) : `${idx + 1}`;

    return {
      label,
      name: r.name || `제품 ${label}`,
      avg: r.AVG != null ? +Number(r.AVG).toFixed(2) : null,
      sp: r.SP != null ? +Number(r.SP).toFixed(1) : null,
      kp: r.KP != null ? +Number(r.KP).toFixed(1) : null,
      val: r.VAL != null ? +Number(r.VAL).toFixed(1) : null,
      rms: r.RMS != null ? +Number(r.RMS).toFixed(1) : null,
      speed: cfg.SPEED ?? us.speed,
      delay: cfg.DELAY ?? us.delay,
      avgTime: cfg.AVGTIME ?? us.avg,
      rawRows,
    };
  });

  const model = { runs };

  try {
    app.log('[SP2100] XLSX 생성 중...', 'info');
    const templateUrl = new URL('../assets/sp2100_export_template.xlsx', import.meta.url);
    const response = await fetch(templateUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`템플릿 로드 실패 (${response.status})`);
    const templateBytes = await response.arrayBuffer();

    const bytes = await fillSP2100Template(templateBytes, model, app?.lang === 'en' ? 'en' : 'ko');
    const selectedCount = anyChecked ? targetRecords.length : 0;
    const scope = selectedCount ? `selected_${selectedCount}` : 'all';
    const filename = `SP2100_Dashboard_${scope}_${dateStr()}_${new Date().toTimeString().slice(0, 8).replaceAll(':', '')}.xlsx`;
    await saveBytes(filename, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    app.log(t('sp_xlsx_ok') || '대시보드 XLSX 저장 완료.', 'ok');
  } catch (err) {
    console.error('XLSX export failed:', err);
    app.log(`[SP2100] XLSX export failed: ${err.message}`, 'err');
  }
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

  const autoMn0 = Math.min(...used, 0), autoMx0 = Math.max(...used, 0);
  let autoMn = autoMn0, autoMx = autoMx0;
  if (autoMn === autoMx) { autoMn -= 1; autoMx += 1; }
  const m = (autoMx - autoMn) * 0.15 || 1; autoMn -= m; autoMx += m;
  const mn = S._yMin !== null ? S._yMin : autoMn;
  const mx = S._yMax !== null ? S._yMax : autoMx;
  if (S._yMaxInp && S._yMax === null) S._yMaxInp.placeholder = autoMx.toFixed(1);
  if (S._yMinInp && S._yMin === null) S._yMinInp.placeholder = autoMn.toFixed(1);
  const chartMinEl = document.getElementById('spChartYMinInp');
  const chartMaxEl = document.getElementById('spChartYMaxInp');
  if (chartMinEl && S._yMin === null) chartMinEl.placeholder = autoMn.toFixed(1);
  if (chartMaxEl && S._yMax === null) chartMaxEl.placeholder = autoMx.toFixed(1);
  const pad = 42, padTop = 8, padBot = 22;
  const Y = v => H - padBot - ((v - mn) / (mx - mn)) * (H - padBot - padTop);
  if (S._yMaxInp) { S._yMaxInp.style.top = '4px'; S._yMaxInp.style.left = '3px'; }
  if (S._yMinInp) { S._yMinInp.style.top = `${H - padBot - 10}px`; S._yMinInp.style.left = '3px'; }
  if (S._yResetBtn) { S._yResetBtn.style.top = '4px'; S._yResetBtn.style.left = '58px'; }

  ctx.strokeStyle = C.grid;
  for (let g = 0; g <= 4; g++) {
    const v = mn + (mx - mn) * g / 4, y = Y(v);
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - 12, y); ctx.stroke();
    ctx.fillStyle = C.text;
    ctx.fillText(v.toFixed(1), pad - 4, y + 4);
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
           PEAK: num('PEAK'), SPEED: num('SPEED'), TRAVEL: num('TRAVEL'), DELAY: num('DELAY'), AVGTIME: num('AVGTIME'),
           T2S: num('T2'), T2T: num2('T2') };
}
function mergeCfg(c) {
  for (const k in c) if (c[k] != null && !isNaN(c[k])) S.liveCfg[k] = c[k];
}

// ── Raw-byte waveform capture (mirrors standalone captureByte/processFrame) ──
function onByte(b) {
  S.frameBuf.push(b);
  clearTimeout(S.frameTimer);
  S.frameTimer = setTimeout(processFrame, 800);
}

function processFrame() {
  const arr = S.frameBuf; S.frameBuf = [];
  if (arr.length < 50) return;

  // Preserve full 8-bit character stream (Latin1): 0xBA~0xFE encode negative deltas in TL-2200!
  const fullText = arr.map(b => String.fromCharCode(b)).join('');
  const model    = document.getElementById('sp_model')?.value || 'TL-2200';

  // Count high-bit bytes for diagnostics
  const highBit = arr.filter(b => b > 127).length;
  app.log(`[FRAME] ${arr.length}바이트 수신 · 상위비트 ${highBit}개(${Math.round(highBit/arr.length*100)}%) · 모델 ${model}`);

  // Preserve the exact bytes before any text conversion. SP-2100 sends a
  // proprietary ComLink frame, not a file that the web server can open.
  S.lastRawFrame = Uint8Array.from(arr);
  S.rawFrameCount += 1;
  const rawBtn = document.getElementById('spSaveRawBtn');
  if (rawBtn) rawBtn.disabled = false;

  // Always preserve raw frame to disk
  S.lastRawFrame = Uint8Array.from(arr);
  exportRawFrameAuto(S.lastRawFrame);

  let parsedMeas = null;
  let decoded = null;

  // ──────────────────────────────────────────────────────────────────────────
  // A) TL-2200 전용 처리 파이프라인 (다중 라인 CSV 및 ASCII 델타 스트림)
  // ──────────────────────────────────────────────────────────────────────────
  if (model === 'TL-2200') {
    const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // 1. 헤더 추출
    for (const l of lines) {
      if (l.includes('TL-22') || l.includes('TL22')) {
        const m = l.match(/TL-22[O0]+,[^,]*,([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+)/i);
        if (m) {
          parsedMeas = { SP: +m[1], KP: +m[2], PEAK: +m[2], VAL: +m[3], AVG: +m[4], RMS: +m[5] };
          break;
        }
      }
    }
    if (parsedMeas && parsedMeas.PEAK != null) S.liveCfg.PEAK = parsedMeas.PEAK;

    // 2. 다중 파형 섹션 (Delay Line 978개 + Avg Line 4882개) 추출
    let delayLine = '', avgLine = '';
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.includes('TL-22') || l.includes('TL22')) continue; // 헤더 라인 제외
      const mCnt = l.match(/^(\d{3,6})\s*,\s*([-+]?\d*\.?\d+)/); // 최소 100 이상 샘플수만 매칭
      if (mCnt && i + 1 < lines.length) {
        const count = parseInt(mCnt[1], 10);
        const dataStr = lines[i + 1];
        if (count < 2000 && !delayLine) delayLine = dataStr;
        else if (count >= 2000 && !avgLine) avgLine = dataStr;
      }
    }

    const combined = (delayLine + avgLine);
    if (combined && combined.length > 50) {
      let acc = 0;
      const raw = [];
      for (let i = 0; i < combined.length; i++) {
        const b = combined.charCodeAt(i);
        if (b === 0x20 || b === 0x2d) continue;
        let val = 0;
        if (b === 0x2a) {
          val = 0; // '*' = 변화량 0 (힘 유지)
        } else if (b >= 0xba && b <= 0xfe) {
          val = -(b - 0xb9); // 음수 감분 (-1 ~ -69) — 반드시 양수보다 먼저 검사!
        } else if (b >= 0x3a && b <= 0x7e) {
          val = b - 0x39; // 양수 증분 (+1 ~ +69)
        } else {
          val = 0;
        }
        acc += val;
        raw.push(acc);
      }

      if (raw.length > 50) {
        // 초기 1초(Delay 구간, 약 978개)의 평균을 오프셋 베이스라인으로 적용
        const delayLen = delayLine.length || Math.floor(raw.length * 0.16);
        const base = raw.slice(0, delayLen).reduce((a, b) => a + b, 0) / delayLen;
        const zeroed = raw.map(v => v - base);
        const kp = parsedMeas?.KP ?? parsedMeas?.AVG ?? 1;
        const curMax = Math.max(...zeroed) || 1;
        const scale = (kp != null && curMax > 0) ? kp / curMax : 1;
        const force = zeroed.map(v => v * scale);
        decoded = { force, PEAK: Math.max(...force), AVG: parsedMeas?.AVG, KP: kp };
        app.log(`[TL-2200 WAVE] 전체 파형 복원 성공 · ${force.length}샘플 (Delay+Avg) · KP=${fmt1(kp)}g`, 'ok');
      }
    }
  }
  // ──────────────────────────────────────────────────────────────────────────
  // B) SP-2100 전용 처리 파이프라인 (라벨 기반 헤더 및 ComLink 바이너리 프레임)
  // ──────────────────────────────────────────────────────────────────────────
  else {
    // 시리즈 종료 요약 수신 시 (END SERIES / MEANS)
    if (/END SERIES|["']MEANS["']/i.test(fullText)) {
      const g = k => {
        const m = fullText.match(new RegExp('(?:\"' + k + '\"|\\b' + k + '\\b)\\s*[:=,\\s]\\s*([-+]?\\d*\\.?\\d+)', 'i'));
        return m ? parseFloat(m[1]) : null;
      };
      const meanAvg = g('AVG');
      const meanKp  = g('KP');
      const runs    = g('RUN');
      app.log(`[SP-2100] 시리즈 통계 요약 수신 — 전체 평균(MEAN): ${fmt1(meanAvg)} g, 피크(KP): ${fmt1(meanKp)} g (총 ${runs != null ? runs : '?'}회)`, 'ok');
      return; // 개별 시험 측정 행으로 등록하지 않음
    }

    parsedMeas = parseLine(fullText, 'SP-2100');
    if (!parsedMeas) {
      const lines = fullText.split(/[\r\n]+/);
      for (const line of lines) {
        const f = parseLine(line, 'SP-2100');
        if (f && f.AVG != null) { parsedMeas = f; break; }
      }
    }
    if (parsedMeas && parsedMeas.PEAK != null) S.liveCfg.PEAK = parsedMeas.PEAK;
    mergeCfg(parseConfig(S.prevText + fullText));
    S.prevText = fullText.slice(-220);

    decoded = decodeComlinkFrame(arr, S.liveCfg);
  }

  // 3) 측정값 단 1회 등록 (파형 안전 바인딩 포함)
  if (parsedMeas && parsedMeas.AVG != null) {
    app.log(`RX  SP=${fmt1(parsedMeas.SP)} KP=${fmt1(parsedMeas.KP)} Val=${fmt1(parsedMeas.VAL)} Avg=${fmt1(parsedMeas.AVG)} RMS=${fmt1(parsedMeas.RMS)} g`, 'ok');
    if (decoded && decoded.force.length > 10) {
      parsedMeas.wave = decoded.force.slice();
      parsedMeas.waveCfg = { ...S.liveCfg, tlFull: (model === 'TL-2200') };
    } else {
      parsedMeas.wave = null;
    }
    commitMeasurement(parsedMeas);
  }

  // 4) 파형 플롯 및 S.lastRec 연동
  if (decoded && decoded.force.length > 10) {
    app.log(`[${model} WAVE] 파형 디코딩 성공 · ${decoded.force.length}샘플`, 'ok');
    plotForce(decoded.force, S.liveCfg);
    if (S.lastRec && (!S.lastRec.wave || !S.lastRec.wave.length)) {
      S.lastRec.wave = decoded.force.slice();
      S.lastRec.waveCfg = { ...S.liveCfg, comlink: true };
    }
  } else {
    // 파형이 포함되지 않은 프레임 수신 시: 이미 화면에 표시된 유효한 파형 유지
    if (!S._cachedWave?.force?.length) {
      const info = document.getElementById('spWaveInfo');
      if (info) info.innerHTML = app?.lang === 'ko'
        ? `장비 원시 데이터 <b>${arr.length.toLocaleString()}바이트</b>를 받았습니다.`
        : `Received <b>${arr.length.toLocaleString()} raw bytes</b>.`;
      const empty = document.getElementById('spWaveEmpty');
      if (empty) empty.style.display = 'none';
    }
    app.log(`[${model}] 상태/원시 프레임 ${arr.length}바이트 수신 (파형 화면 유지)`);
  }
}

// ── Genuine SP-2100 Peel Force Waveform Decoder ──────────────────────────────
function decodeComlinkFrame(arr, cfg = {}) {
  if (!arr || arr.length < 50) return null;

  // 1. Locate start of waveform payload
  let startPos = -1;
  let isEscStream = false;

  // A) Look for standard "T2" marker and following newline
  const stripped = Array.from(arr.slice(0, Math.min(arr.length, 1200))).map(b => String.fromCharCode(b & 0x7F)).join('');
  const t2Idx = stripped.indexOf('"T2"');
  if (t2Idx !== -1) {
    const nlIdx = stripped.indexOf('\n', t2Idx);
    if (nlIdx !== -1 && nlIdx + 1 < arr.length) {
      startPos = nlIdx + 1;
    }
  }

  // B) Look for ESC 2 (0x1B, 0x32) ComLink stream header
  if (startPos === -1) {
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] === 0x1b && ((arr[i + 1] & 0x7f) === 0x32)) {
        startPos = i + 2;
        isEscStream = true;
        break;
      }
    }
  }

  // C) Fallback: search for first non-printable dense region
  if (startPos === -1) {
    for (let i = 0; i + 32 <= arr.length; i++) {
      let p = 0;
      for (let j = 0; j < 32; j++) {
        const b = arr[i + j] & 0x7F;
        if ((b >= 32 && b < 127) || b === 13 || b === 10 || b === 9) p++;
      }
      if (p / 32 < 0.35) { startPos = i; break; }
    }
  }

  if (startPos === -1 || startPos >= arr.length - 10) return null;

  const rawSamples = [];
  let acc = 0;

  if (isEscStream) {
    // ComLink 3.0 공식 누적 디코더
    for (let i = startPos; i < arr.length; i++) {
      const b = arr[i];
      if (b === 0x20 || b === 0x2d) continue; // 공백, 하이픈 무시
      const c7 = b & 0x7f;
      if (c7 === 0x2a) { acc = 0; continue; } // '*' accumulator reset
      if (b === 0x1b && i + 1 < arr.length && ((arr[i + 1] & 0x7f) === 0x31)) break; // ESC 1 종료
      let val = null;
      if (c7 >= 0x3a && c7 <= 0x7e) val = c7 - 0x39;
      else if (b >= 0xba && b <= 0xfe) val = b - 0xb9;
      if (val !== null) { acc += val; rawSamples.push(acc); }
    }
    // Baseline zeroing (첫 5% 평균을 기준 0점으로 처리)
    if (rawSamples.length >= 10) {
      const baseN = Math.max(1, Math.floor(rawSamples.length * 0.05));
      const base = rawSamples.slice(0, baseN).reduce((a, b) => a + b, 0) / baseN;
      for (let i = 0; i < rawSamples.length; i++) rawSamples[i] -= base;
    }
  } else {
    // 표준 SP-2100 T2 미분 누적 디코더
    const points = cfg.POINTS || (arr.length - startPos);
    const maxSamples = Math.min(arr.length - startPos, points);
    for (let i = 0; i < maxSamples; i++) {
      const b = arr[startPos + i];
      // 노이즈/프레이밍 이상치 필터링 (800Hz 샘플링 기준 유효 델타: -70 ~ +70)
      let diff = 0;
      if (b >= 30 && b <= 230) {
        diff = b - 128;
      }
      acc += diff;
      rawSamples.push(acc);
    }
  }

  if (rawSamples.length < 10) return null;

  // 3. Scale using device parameter: SCALE (default 0.07106 from calibration)
  const SC = cfg.SCALE || 0.07106;
  const FA = cfg.FACTOR || 1;
  let force = rawSamples.map(v => v * SC * FA);

  // 4. Averaging Window (T1 / Initial Delay ~ T2 / Averaging Window)
  const us = userSettings();
  const totalTime = ((us.delay || 0) + (us.avg || 0)) || 6.0;
  const delaySec = us.delay || (cfg.DELAY != null ? cfg.DELAY : 1.0);
  const avgSec = us.avg || (cfg.AVGTIME != null ? cfg.AVGTIME : 5.0);

  const startIdx = Math.max(0, Math.min(force.length - 1, Math.round((delaySec / totalTime) * (force.length - 1))));
  const endIdx = Math.max(startIdx, Math.min(force.length - 1, Math.round(((delaySec + avgSec) / totalTime) * (force.length - 1))));

  // 5. Baseline & Peak Alignment using genuine device measurements (Ground Truth)
  // SP-2100 하드웨어가 직접 산출한 공식 AVG/PEAK가 존재할 경우 파형의 오프셋과 피크를 정합
  if (cfg.AVG != null && !isNaN(cfg.AVG)) {
    const avgSlice = force.slice(startIdx, endIdx + 1);
    const curAvg = avgSlice.length ? (avgSlice.reduce((a, b) => a + b, 0) / avgSlice.length) : (force.reduce((a, b) => a + b, 0) / force.length);
    const offsetAdj = cfg.AVG - curAvg;
    force = force.map(v => v + offsetAdj);

    if (cfg.PEAK != null && !isNaN(cfg.PEAK) && cfg.PEAK > cfg.AVG) {
      const curMax = Math.max(...force);
      if (curMax > cfg.AVG) {
        const ratio = (cfg.PEAK - cfg.AVG) / (curMax - cfg.AVG);
        const clampedRatio = Math.max(0.4, Math.min(2.5, ratio));
        force = force.map(v => cfg.AVG + (v - cfg.AVG) * clampedRatio);
      }
    }
  } else if (cfg.PEAK != null && cfg.PEAK > 0) {
    const curMax = Math.max(...force);
    if (curMax > 0) {
      const ratio = cfg.PEAK / curMax;
      force = force.map(v => v * ratio);
    }
  }

  const avgSlice = force.slice(startIdx, endIdx + 1);
  const avg = avgSlice.length ? (avgSlice.reduce((a, b) => a + b, 0) / avgSlice.length) : (force.reduce((a, b) => a + b, 0) / force.length);
  const rms = avgSlice.length ? Math.sqrt(avgSlice.reduce((a, b) => a + b * b, 0) / avgSlice.length) : 0;
  const peak = Math.max(...force);
  const sp = force[startIdx];
  const val = Math.min(...avgSlice);

  return { force, PEAK: peak, AVG: avg, KP: peak, VAL: val, SP: sp, RMS: rms };
}

async function exportRawFrameAuto(bytes) {
  if (!bytes || bytes.length < 50) return;
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const name = `SP2100_raw_${stamp}.bin`;
  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': name },
      body: bytes,
    });
    if (res.ok) {
      app.log(`[RAW AUTO-SAVE] ${name} 저장 완료 (${bytes.length.toLocaleString()} bytes)`, 'ok');
    }
  } catch (e) {
    console.warn('Auto-save raw failed:', e);
  }
}

async function exportRawFrame() {
  const bytes = S?.lastRawFrame;
  if (!bytes?.length) {
    alert(app?.lang === 'ko' ? '먼저 SP-2100 측정을 실행해 원시 데이터를 수신하세요.' : 'Run an SP-2100 test first.');
    return;
  }
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const name = `SP2100_raw_${stamp}.bin`;
  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': name },
      body: bytes,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const out = await res.json();
    alert(app?.lang === 'ko' ? `원시 데이터가 저장되었습니다.\n${out.path || name}` : `Raw data saved.\n${out.path || name}`);
  } catch (_) {
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    alert(app?.lang === 'ko' ? `브라우저 다운로드 폴더에 저장했습니다.\n${name}` : `Saved to the browser download folder.\n${name}`);
  }
}

function clearWaveform() {
  S.lastWaveBytes = null;
  S.lastWaveCfg = null;
  S.waveSegments = [];
  S.activeDragSegment = null;
  S._cachedWave = null;
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
  S.activeRecId = id;

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

  if (r._appliedSegments && Array.isArray(r._appliedSegments) && r._appliedSegments.length > 0) {
    S.waveSegments = JSON.parse(JSON.stringify(r._appliedSegments));
  } else {
    S.waveSegments = [];
  }
  S.activeDragSegment = null;

  if (r.AVG != null) app._setDisplay(fmt1(r.AVG), 'g');

  if (r.wave && r.wave.length > 10) {
    if (r.waveCfg?.tlAscii) {
      const codes = r.wave.map(c => typeof c === 'string' ? c.charCodeAt(0) : c);
      const baseN = Math.max(1, Math.floor(codes.length * 0.1));
      const base = codes.slice(0, baseN).reduce((a, b) => a + b, 0) / baseN;
      const zeroed = codes.map(c => c - base);
      const kp = r.KP ?? r.AVG;
      const maxAbs = Math.max(...zeroed.map(Math.abs)) || 1;
      const scale = (kp != null && Math.abs(kp) > 0) ? Math.abs(kp) / maxAbs : 1;
      const force = zeroed.map(v => v * scale);
      plotForce(force, r.waveCfg, true);
    } else {
      plotForce(r.wave, r.waveCfg || S.liveCfg, true);
    }
  } else {
    // 이 행에 저장된 파형이 없을 경우 화면 초기화
    const cv = document.getElementById('spWaveChart');
    if (cv) {
      const ctx = cv.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, cv.width, cv.height);
    }
    const info = document.getElementById('spWaveInfo');
    if (info) {
      info.innerHTML = `<span style="color:var(--text-mut);">${app?.lang === 'ko' ? '선택한 측정 행에는 수신된 파형 데이터가 없습니다.' : 'No waveform data for this record.'}</span>`;
    }
    const empty = document.getElementById('spWaveEmpty');
    if (empty) {
      empty.textContent = app?.lang === 'ko' ? '저장된 파형 데이터가 없습니다' : 'No waveform data';
      empty.style.display = '';
    }
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

const SEG_COLORS = [
  { fill: 'rgba(56, 189, 248, 0.22)', border: '#38bdf8', borderDark: '#0284c7', textLight: '#0369a1' },
  { fill: 'rgba(245, 158, 11, 0.22)', border: '#f59e0b', borderDark: '#d97706', textLight: '#b45309' },
  { fill: 'rgba(168, 85, 247, 0.22)', border: '#a855f7', borderDark: '#9333ea', textLight: '#7e22ce' },
  { fill: 'rgba(16, 185, 129, 0.22)', border: '#10b981', borderDark: '#059669', textLight: '#047857' },
  { fill: 'rgba(236, 72, 153, 0.22)', border: '#ec4899', borderDark: '#db2777', textLight: '#be185d' },
];

function getWaveSegmentsStats(segments, force, tMax) {
  if (!force || !force.length || !segments || !segments.length) return null;
  const n = force.length;

  const segDetails = segments.map((seg, idx) => {
    const i1 = Math.max(0, Math.min(seg.startIdx, seg.endIdx));
    const i2 = Math.min(n - 1, Math.max(seg.startIdx, seg.endIdx));
    const slice = force.slice(i1, i2 + 1);
    const avg = slice.length ? (slice.reduce((a, b) => a + b, 0) / slice.length) : 0;
    const min = slice.length ? Math.min(...slice) : 0;
    const max = slice.length ? Math.max(...slice) : 0;
    const t1 = tMax != null ? (tMax * i1 / Math.max(1, n - 1)) : null;
    const t2 = tMax != null ? (tMax * i2 / Math.max(1, n - 1)) : null;
    const dt = (t1 != null && t2 != null) ? (t2 - t1) : null;
    return {
      id: seg.id,
      index: idx + 1,
      i1, i2,
      sliceLen: slice.length,
      avg, min, max,
      t1, t2, dt,
      isActiveDrag: !!seg.isActiveDrag,
    };
  });

  const indices = new Set();
  for (const seg of segments) {
    const i1 = Math.max(0, Math.min(seg.startIdx, seg.endIdx));
    const i2 = Math.min(n - 1, Math.max(seg.startIdx, seg.endIdx));
    for (let i = i1; i <= i2; i++) {
      if (i >= 0 && i < n) indices.add(i);
    }
  }

  if (indices.size === 0) return null;

  let sum = 0, combMin = Infinity, combMax = -Infinity;
  for (const idx of indices) {
    const val = force[idx];
    sum += val;
    if (val < combMin) combMin = val;
    if (val > combMax) combMax = val;
  }
  const combAvg = sum / indices.size;

  return {
    segments: segDetails,
    count: segments.length,
    totalPoints: indices.size,
    combAvg,
    combMin: combMin === Infinity ? 0 : combMin,
    combMax: combMax === -Infinity ? 0 : combMax,
  };
}

function clearWaveSelection() {
  if (S) {
    S.waveSegments = [];
    S.activeDragSegment = null;
  }
  if (S?._cachedWave) {
    const { force, tMax, us } = S._cachedWave;
    drawCurve(force, tMax, us);
    const peakF = force.length ? Math.max(...force) : 0;
    const cfg = S.lastWaveCfg || {};
    const info = document.getElementById('spWaveInfo');
    if (info) {
      info.innerHTML = `${t('sp_wave_samples') || '샘플'} <b>${force.length}</b>개 · ${cfg.tlAscii ? 'TL-2200 ASCII' : (cfg.decName || 'SP-2100')} · ` +
        `max <b>${peakF.toFixed(2)} g</b> · PEAK <b>${cfg.PEAK ?? '?'} g</b>` +
        (tMax ? ` · 0~<b>${tMax.toFixed(1)} s</b>` : '') +
        ` <span style="color:var(--text-dim);margin-left:8px;font-size:11px;">(${app?.lang === 'ko' ? '다중 선택시 마우스로 구간을 드래그하여 선택하세요.' : 'Drag across the chart to select multiple segments.'})</span>`;
    }
  }
}

function removeWaveSegment(segId) {
  if (!S || !S.waveSegments) return;
  S.waveSegments = S.waveSegments.filter(s => s.id !== segId);
  if (S._cachedWave) {
    drawCurve(S._cachedWave.force, S._cachedWave.tMax, S._cachedWave.us);
  }
}

function toggleMultiSegmentMode() {
  if (!S) return;
  S.multiSegmentMode = !S.multiSegmentMode;
  if (S._cachedWave) {
    drawCurve(S._cachedWave.force, S._cachedWave.tMax, S._cachedWave.us);
  }
}

function applySegmentsToTable() {
  if (!S || !S._cachedWave?.force?.length) return;
  if (!S.waveSegments || S.waveSegments.length === 0) {
    alert(app?.lang === 'ko' ? '먼저 파형 그래프에서 드래그하여 구간을 1개 이상 선택하세요.' : 'Select at least one segment first.');
    return;
  }

  const stats = getWaveSegmentsStats(S.waveSegments, S._cachedWave.force, S._cachedWave.tMax);
  if (!stats) return;

  let rec = null;
  if (S.activeRecId) rec = S.records.find(r => r.id === S.activeRecId);
  if (!rec && S.records.length > 0) {
    const checked = S.records.filter(r => r.checked);
    if (checked.length === 1) rec = checked[0];
    else rec = S.records[S.records.length - 1];
  }

  if (!rec) {
    alert(app?.lang === 'ko' ? '적용할 측정 데이터 행이 없습니다.' : 'No record found to apply.');
    return;
  }

  if (!rec._orig) {
    rec._orig = {
      AVG: rec.AVG,
      KP: rec.KP,
      SP: rec.SP,
      VAL: rec.VAL,
      RMS: rec.RMS,
    };
  }

  const recIdx = S.records.indexOf(rec);
  const label = recIdx >= 0 ? rowLabel(recIdx) : `#${rec.id}`;
  const prevAvg = rec.AVG;

  rec.AVG = parseFloat(stats.combAvg.toFixed(2));
  rec.KP = parseFloat(stats.combMax.toFixed(2));
  rec.VAL = parseFloat(stats.combMin.toFixed(2));
  rec._isModified = true;
  rec._appliedSegments = JSON.parse(JSON.stringify(S.waveSegments));
  S.activeRecId = rec.id;

  renderTable();
  drawChart();
  app._setDisplay(fmt1(rec.AVG), 'g');
  app.log(`[구간 적용] ${label}행 AVG: ${fmt1(prevAvg)}g → ${fmt1(rec.AVG)}g (구간 ${stats.count}개 반영)`, 'ok');

  if (S._cachedWave) {
    drawCurve(S._cachedWave.force, S._cachedWave.tMax, S._cachedWave.us);
  }
}

function restoreOriginalTableData(recId) {
  if (!S) return;
  const targetId = recId || S.activeRecId;
  const rec = S.records.find(r => r.id === targetId);
  if (!rec) return;

  if (!rec._orig) {
    alert(app?.lang === 'ko' ? '복구할 원본 측정 데이터가 없습니다.' : 'No original data to restore.');
    return;
  }

  const recIdx = S.records.indexOf(rec);
  const label = recIdx >= 0 ? rowLabel(recIdx) : `#${rec.id}`;

  rec.AVG = rec._orig.AVG;
  rec.KP = rec._orig.KP;
  rec.SP = rec._orig.SP;
  rec.VAL = rec._orig.VAL;
  rec.RMS = rec._orig.RMS;
  rec._isModified = false;
  rec._appliedSegments = null;
  S.waveSegments = [];
  S.activeDragSegment = null;

  renderTable();
  drawChart();
  app._setDisplay(fmt1(rec.AVG), 'g');
  app.log(`[원본 복구] ${label}행이 장비 원본 측정값(AVG ${fmt1(rec.AVG)}g)으로 복구되었습니다.`, 'warn');

  if (S._cachedWave) {
    drawCurve(S._cachedWave.force, S._cachedWave.tMax, S._cachedWave.us);
  }
}

function loadDemoWave() {
  const n = 1200;
  const force = [];
  for (let i = 0; i < n; i++) {
    const t = i / n * 6.0;
    const base = 8 + 3 * Math.sin(t * 2) + ((t > 2.2 && t < 3.8) ? 14 * Math.sin((t - 2.2) / 1.6 * Math.PI) : 0);
    force.push(parseFloat((base + (Math.random() - 0.5) * 1.2).toFixed(2)));
  }
  const f = {
    AVG: 11.45,
    KP: 23.8,
    SP: 7.2,
    VAL: 5.1,
    RMS: 1.8,
    wave: force,
    waveCfg: { TRAVEL: 12, SPEED: 120, PEAK: 23.8, decName: 'SP-2100 DEMO' },
  };
  commitMeasurement(f);
  plotForce(force, f.waveCfg);
}

function _attachWaveEvents(cv) {
  if (!cv || cv._waveEventsAttached) return;
  cv._waveEventsAttached = true;

  let isDown = false;
  let startX = 0;

  const getIdxFromX = (clientX) => {
    if (!S?._cachedWave?.force?.length) return null;
    const rect = cv.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const canvasX = (clientX - rect.left) * (cv.width / rect.width);
    const n = S._cachedWave.force.length;
    const pad = 46;
    const plotW = cv.width - pad - 12;
    if (plotW <= 0) return null;
    const ratio = Math.max(0, Math.min(1, (canvasX - pad) / plotW));
    return Math.round(ratio * (n - 1));
  };

  cv.addEventListener('mousedown', e => {
    if (!S?._cachedWave?.force?.length) return;
    if (e.button !== 0) return; // 좌클릭만
    isDown = true;
    const rect = cv.getBoundingClientRect();
    startX = e.clientX - rect.left;
    const idx = getIdxFromX(e.clientX);
    if (idx !== null) {
      S.activeDragSegment = { startIdx: idx, endIdx: idx, active: true, startX, currentX: startX };
      drawCurve(S._cachedWave.force, S._cachedWave.tMax, S._cachedWave.us);
    }
  });

  window.addEventListener('mousemove', e => {
    if (!isDown || !S?.activeDragSegment?.active) return;
    const rect = cv.getBoundingClientRect();
    const curX = e.clientX - rect.left;
    const idx = getIdxFromX(e.clientX);
    if (idx !== null) {
      S.activeDragSegment.endIdx = idx;
      S.activeDragSegment.currentX = curX;
      drawCurve(S._cachedWave.force, S._cachedWave.tMax, S._cachedWave.us);
    }
  });

  window.addEventListener('mouseup', e => {
    if (!isDown) return;
    isDown = false;
    if (S?.activeDragSegment) {
      S.activeDragSegment.active = false;
      const rect = cv.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const dist = Math.abs(endX - startX);
      const i1 = Math.min(S.activeDragSegment.startIdx, S.activeDragSegment.endIdx);
      const i2 = Math.max(S.activeDragSegment.startIdx, S.activeDragSegment.endIdx);

      if (dist < 5 || i1 === i2) {
        // 단일 클릭: 기존 선택된 다중 구간들을 그대로 유지하고 드래그 활성 상태만 취소
        S.activeDragSegment = null;
        drawCurve(S._cachedWave.force, S._cachedWave.tMax, S._cachedWave.us);
      } else {
        // 마우스 구간 드래그: 새 구간을 누적 추가
        if (!Array.isArray(S.waveSegments)) S.waveSegments = [];
        S.waveSegments.push({
          id: Date.now() + Math.floor(Math.random() * 1000),
          startIdx: i1,
          endIdx: i2,
        });
        S.activeDragSegment = null;
        drawCurve(S._cachedWave.force, S._cachedWave.tMax, S._cachedWave.us);
      }
    }
  });

  cv.addEventListener('dblclick', () => {
    clearWaveSelection();
  });
}

// plotForce: draw an already-decoded force[] array (used by TL-2200 ASCII path & SP-2100)
function plotForce(force, cfg, keepSegments = false) {
  S.lastWaveBytes = null; S.lastWaveCfg = cfg;
  if (!keepSegments) {
    S.waveSegments = [];
    S.activeDragSegment = null;
  }
  const us  = userSettings();
  const N   = force.length;
  let tMax  = null;
  if (cfg?.T2T && cfg?.T2S && N) tMax = (cfg.T2T * N / cfg.T2S);
  else if (cfg?.TRAVEL && cfg?.SPEED) tMax = (cfg.TRAVEL / cfg.SPEED * 60);
  else if (us && (us.delay || us.avg)) tMax = (us.delay || 0) + (us.avg || 0);
  else tMax = 6.0;
  drawCurve(force, tMax, us);
  const peakF = N ? Math.max(...force) : 0;
  const info  = document.getElementById('spWaveInfo');
  if (info && (!S.waveSegments || S.waveSegments.length === 0)) {
    const model = document.getElementById('sp_model')?.value || 'SP-2100';
    info.innerHTML = `${t('sp_wave_samples') || '샘플'} <b>${N}</b>개 · ${model}` +
      ` · max <b>${peakF.toFixed(1)} g</b>` +
      (tMax ? ` · 0~<b>${tMax.toFixed(1)} s</b>` : '') +
      ` <span style="color:var(--text-dim);margin-left:6px;font-size:11px;">(${app?.lang === 'ko' ? '다중 선택시 마우스로 구간을 드래그하여 선택하세요.' : 'Drag across the chart to select multiple segments.'})</span>`;
  }
  const empty = document.getElementById('spWaveEmpty');
  if (empty) empty.style.display = 'none';
}

function plotWaveform(bytes, cfg) {
  S.lastWaveBytes = bytes; S.lastWaveCfg = cfg;
  S.waveSegments = [];
  S.activeDragSegment = null;
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
    info.innerHTML = `${t('sp_wave_samples') || '샘플'} <b>${force.length}</b>개 · ${dec.name}` +
      (tMax ? ` · 0~<b>${tMax.toFixed(1)} s</b>` : '') +
      ` · max <b>${peakF.toFixed(1)} g</b> · PEAK <b>${cfg.PEAK ?? '?'} g</b>` +
      ` <span style="color:var(--text-dim);margin-left:6px;font-size:11px;">(${app?.lang === 'ko' ? '다중 선택시 마우스로 구간을 드래그하여 선택하세요.' : 'Drag across the chart to select multiple segments.'})</span>`;
  }
  const empty = document.getElementById('spWaveEmpty');
  if (empty) empty.style.display = 'none';
}

function drawCurve(force, tMax, us) {
  const cv = document.getElementById('spWaveChart');
  if (!cv || cv.closest('[hidden]')) return;
  _attachWaveEvents(cv);
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return;
  const pEl = cv.parentElement || cv.closest('.graph-area');
  const pW = pEl ? pEl.clientWidth : 0;
  const pH = pEl ? pEl.clientHeight : 0;
  cv.width  = pW || cv.offsetWidth  || 600;
  cv.height = pH || cv.offsetHeight || 160;
  const W = cv.width, H = cv.height, pad = 46, padTop = 8, padBot = 22;
  const { accent, line, sub } = waveColors();
  ctx.clearRect(0, 0, W, H);

  S._cachedWave = { force, tMax, us };

  const n = force.length;
  if (!n) return;
  const autoMn0 = Math.min(...force), autoMx0 = Math.max(...force);
  let autoMn = Math.min(-5, autoMn0), autoMx = autoMx0;
  if (autoMn === autoMx) { autoMn -= 1; autoMx += 1; }
  const pp = (autoMx - autoMn) * 0.08 || 1; autoMn -= pp; autoMx += pp;
  if (autoMn < autoMn0 - pp) autoMn = autoMn0 - pp;
  const mn = S._waveYMin !== null ? S._waveYMin : autoMn;
  const mx = S._waveYMax !== null ? S._waveYMax : autoMx;
  if (S._waveYMaxInp && S._waveYMax === null) S._waveYMaxInp.placeholder = autoMx.toFixed(1);
  if (S._waveYMinInp && S._waveYMin === null) S._waveYMinInp.placeholder = autoMn.toFixed(1);
  const waveMinEl = document.getElementById('spWaveYMinInp');
  const waveMaxEl = document.getElementById('spWaveYMaxInp');
  if (waveMinEl && S._waveYMin === null) waveMinEl.placeholder = autoMn.toFixed(1);
  if (waveMaxEl && S._waveYMax === null) waveMaxEl.placeholder = autoMx.toFixed(1);
  if (S._waveYMaxInp) { S._waveYMaxInp.style.top = '4px'; S._waveYMaxInp.style.left = '3px'; }
  if (S._waveYMinInp) { S._waveYMinInp.style.top = `${H - padBot - 10}px`; S._waveYMinInp.style.left = '3px'; }
  if (S._waveYResetBtn) { S._waveYResetBtn.style.top = '4px'; S._waveYResetBtn.style.left = '58px'; }

  const X  = i   => pad + (i / Math.max(1, n - 1)) * (W - pad - 12);
  const Y  = v   => H - padBot - ((v - mn) / (mx - mn)) * (H - padBot - padTop);
  const Xt = sec => pad + ((tMax ? sec / tMax : 0)) * (W - pad - 12);

  // 음영 영역 (Delay / Avg Window)
  if (tMax && us) {
    if (us.delay > 0) { ctx.fillStyle = 'rgba(123,138,158,.16)'; ctx.fillRect(pad, padTop, Math.max(0, Xt(Math.min(us.delay, tMax)) - pad), H - padBot - padTop); }
    if (us.avg > 0) {
      const a = Math.min(us.delay, tMax), b = Math.min(us.delay + us.avg, tMax);
      ctx.fillStyle = 'rgba(54,224,192,.13)'; ctx.fillRect(Xt(a), padTop, Math.max(0, Xt(b) - Xt(a)), H - padBot - padTop);
    }
  }

  // Y 그리드 & 축 눈금 (5개 눈금)
  ctx.font = '11px monospace'; ctx.lineWidth = 1; ctx.strokeStyle = line; ctx.fillStyle = sub;
  ctx.textAlign = 'right';
  for (let g = 0; g <= 4; g++) {
    const v = mn + (mx - mn) * g / 4, y = Y(v);
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - 12, y); ctx.stroke();
    ctx.fillText(v.toFixed(1), pad - 4, y + 4);
  }
  // X 그리드 & 축 눈금 (사용자 요청: 6초인 경우 1 2 3 4 5 6 단위로 정수 표시)
  ctx.textAlign = 'center';
  ctx.fillStyle = sub;
  if (tMax != null && tMax > 0) {
    let step = 1;
    if (tMax > 40) step = 10;
    else if (tMax > 20) step = 5;
    else if (tMax > 12) step = 2;
    else step = 1;

    for (let sec = 0; sec <= tMax + 1e-4; sec += step) {
      const x = Xt(sec);
      if (x > W - 8) continue;
      ctx.strokeStyle = line;
      ctx.beginPath(); ctx.moveTo(x, H - padBot); ctx.lineTo(x, padTop); ctx.stroke();
      const lbl = Number(sec.toFixed(2)).toString();
      ctx.fillText(lbl, x, H - 4);
    }
    const hasBottomActions = (S?.waveSegments?.length > 0) || !!S?.activeDragSegment?.active;
    const timeX = hasBottomActions ? (W - 130) : (W - 12);
    ctx.textAlign = 'right';
    ctx.fillText(app?.lang === 'ko' ? '시간(초)' : 'time(s)', timeX, H - 4);
  } else {
    for (let g = 0; g <= 5; g++) {
      const i = Math.round((n - 1) * g / 5), x = X(i);
      ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(x, H - padBot); ctx.lineTo(x, padTop); ctx.stroke();
      ctx.fillText(String(i), x, H - 4);
    }
    const hasBottomActions = (S?.waveSegments?.length > 0) || !!S?.activeDragSegment?.active;
    const timeX = hasBottomActions ? (W - 130) : (W - 12);
    ctx.textAlign = 'right';
    ctx.fillText('sample #', timeX, H - 4);
  }
  ctx.textAlign = 'left';
  if (mn < 0 && mx > 0) { ctx.strokeStyle = sub; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(W - 12, Y(0)); ctx.stroke(); ctx.setLineDash([]); }

  if (tMax && us) {
    ctx.setLineDash([4, 3]); ctx.fillStyle = sub;
    const delaySec = (us.delay != null && !isNaN(us.delay)) ? us.delay : 1.0;
    const avgSec = (us.avg != null && !isNaN(us.avg)) ? us.avg : 5.0;
    const xDelay = Xt(Math.min(delaySec, tMax));
    const xEnd = Xt(Math.min(delaySec + avgSec, tMax));

    if (delaySec > 0 && xDelay > pad + 10) {
      ctx.strokeStyle = sub;
      ctx.beginPath(); ctx.moveTo(xDelay, padTop); ctx.lineTo(xDelay, H - padBot); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText('delay', xDelay - 6, padTop + 16);
    }
    if (avgSec > 0 && xEnd > xDelay + 10) {
      ctx.strokeStyle = accent;
      ctx.beginPath(); ctx.moveTo(xEnd, padTop); ctx.lineTo(xEnd, H - padBot); ctx.stroke();
      const midX = (xDelay + xEnd) / 2;
      ctx.fillStyle = accent;
      ctx.textAlign = 'center';
      ctx.fillText('avg window', midX, padTop + 16);
    }
    ctx.textAlign = 'left';
    ctx.setLineDash([]);
  }

  ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(app?.lang === 'ko' ? 'g' : 'force (g)', -22, 0); ctx.restore();

  // 힘-시간 파형 곡선
  ctx.strokeStyle = accent; ctx.lineWidth = 1.3; ctx.beginPath();
  for (let i = 0; i < n; i++) { const x = X(i), y = Y(force[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();

  // ── 마우스 드래그 다중 선택 구간 하이라이트 및 통계 렌더링 ───────────────────
  const segmentsToDraw = [...(S.waveSegments || [])];
  if (S.activeDragSegment && S.activeDragSegment.startIdx !== null && S.activeDragSegment.endIdx !== null) {
    segmentsToDraw.push({
      id: 'active_drag',
      startIdx: Math.min(S.activeDragSegment.startIdx, S.activeDragSegment.endIdx),
      endIdx: Math.max(S.activeDragSegment.startIdx, S.activeDragSegment.endIdx),
      isActiveDrag: true,
    });
  }

  // Active record resolution
  let activeRec = null;
  if (S.activeRecId) activeRec = S.records.find(r => r.id === S.activeRecId);
  if (!activeRec && S.records.length > 0) activeRec = S.records[S.records.length - 1];
  const activeIdx = activeRec ? S.records.indexOf(activeRec) : -1;
  const activeLabel = activeIdx >= 0 ? rowLabel(activeIdx) : null;
  const isModified = !!activeRec?._isModified;

  const isLight = document.body.classList.contains('light');

  if (segmentsToDraw.length > 0) {
    // 1. Draw each segment background & dashed borders
    segmentsToDraw.forEach((seg, sIdx) => {
      const c = SEG_COLORS[sIdx % SEG_COLORS.length];
      const segBorder = isLight ? (c.borderDark || c.border) : c.border;
      const i1 = Math.max(0, Math.min(seg.startIdx, seg.endIdx));
      const i2 = Math.min(n - 1, Math.max(seg.startIdx, seg.endIdx));
      const x1 = X(i1), x2 = X(i2);
      const boxW = Math.max(2, x2 - x1);
      const topY = padTop, boxH = H - padBot - padTop;

      // Fill
      ctx.fillStyle = c.fill;
      ctx.fillRect(x1, topY, boxW, boxH);

      // Dashed vertical boundaries
      ctx.strokeStyle = segBorder;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, topY); ctx.lineTo(x1, topY + boxH);
      ctx.moveTo(x2, topY); ctx.lineTo(x2, topY + boxH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Segment label tag at top
      ctx.fillStyle = segBorder;
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`#${sIdx + 1}`, Math.max(pad + 4, x1 + 4), topY + 12);
    });

    // 2. Statistics calculation
    const stats = getWaveSegmentsStats(segmentsToDraw, force, tMax);
    if (stats) {
      // Floating canvas badge
      let badgeText = '';
      if (stats.count === 1) {
        const s0 = stats.segments[0];
        badgeText = (s0.t1 != null)
          ? `구간 [#1 ${s0.t1.toFixed(2)}~${s0.t2.toFixed(2)}s] · 평균: ${s0.avg.toFixed(2)}g · 최소: ${s0.min.toFixed(2)}g · 최대: ${s0.max.toFixed(2)}g (N=${s0.sliceLen})`
          : `구간 [#1] · 평균: ${s0.avg.toFixed(2)}g · 최소: ${s0.min.toFixed(2)}g · 최대: ${s0.max.toFixed(2)}g (N=${s0.sliceLen})`;
      } else {
        badgeText = `[구간 ${stats.count}개 선택] 통합 평균: ${stats.combAvg.toFixed(2)}g · 최소: ${stats.combMin.toFixed(2)}g · 최대: ${stats.combMax.toFixed(2)}g (총 N=${stats.totalPoints}P)`;
      }

      ctx.font = 'bold 11px monospace';
      const textW = ctx.measureText(badgeText).width;
      const cardW = textW + 18, cardH = 22;
      const cardX = Math.max(pad + 2, Math.min(W - cardW - 14, (W - cardW) / 2));
      const cardY = 18;

      if (isLight) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 4);
        else ctx.rect(cardX, cardY, cardW, cardH);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0369a1';
        ctx.fillText(badgeText, cardX + 9, cardY + 15);
      } else {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 4);
        else ctx.rect(cardX, cardY, cardW, cardH);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.fillText(badgeText, cardX + 9, cardY + 15);
      }

      // Update spWaveInfo control bar
      const info = document.getElementById('spWaveInfo');
      if (info) {
        const segChipsHtml = stats.segments.map((s, idx) => {
          const c = SEG_COLORS[idx % SEG_COLORS.length];
          const tagCol = isLight ? (c.textLight || c.borderDark || c.border) : c.border;
          const rangeStr = s.t1 != null ? `${s.t1.toFixed(2)}~${s.t2.toFixed(2)}s` : `#${s.i1}~#${s.i2}`;
          return `<span class="sp-seg-chip">` +
            `<b style="color:${tagCol};">#${s.index}</b> ` +
            `<span class="chip-range">${rangeStr}</span> ` +
            `<span class="chip-avg">${s.avg.toFixed(2)}g</span>` +
            (!s.isActiveDrag ? `<button class="chip-del" onclick="event.stopPropagation(); app.instr.removeWaveSegment(${s.id})" title="이 구간 삭제">✕</button>` : '') +
            `</span>`;
        }).join('');

        info.innerHTML = `
          <div class="sp-wave-toolbar">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
              <span class="sp-wave-title">📍 구간 분석(${stats.count}개):</span>
              ${segChipsHtml}
              <span class="sp-wave-guide-text">${app?.lang === 'ko' ? '다중 선택시 마우스로 구간을 드래그하여 선택하세요.' : 'Drag across the chart to select multiple segments.'}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span class="sp-comb-avg-wrap">
                통합 평균: <b class="sp-comb-avg-val">${stats.combAvg.toFixed(2)} g</b>
                <span class="sp-comb-avg-pts">(N=${stats.totalPoints})</span>
              </span>
              <button class="sp-clear-btn" onclick="app.instr.clearWaveSelection()" title="모든 구간 선택 해제">
                ✕ 해제
              </button>
            </div>
          </div>
        `;
      }

      // ── 그래프 우측 하단 적용하기 플로팅 액션 바 ──────────────────────────────
      let bottomActions = document.getElementById('spWaveBottomActions');
      if (!bottomActions) {
        const area = cv.closest('.graph-area');
        if (area) {
          bottomActions = document.createElement('div');
          bottomActions.id = 'spWaveBottomActions';
          bottomActions.className = 'sp-bottom-apply-wrap';
          area.appendChild(bottomActions);
        }
      }
      if (bottomActions) {
        bottomActions.style.display = 'flex';
        bottomActions.innerHTML = `
          <button class="sp-bottom-apply-btn" onclick="app.instr.applySegmentsToTable()" title="${app?.lang === 'ko' ? '선택한 구간의 평균값을 현재 측정 데이터 행에 적용합니다' : 'Apply selected segment stats to active row'}">
            ✓ ${app?.lang === 'ko' ? '적용하기' : 'Apply'}
          </button>
          ${isModified ? `
            <button class="sp-bottom-restore-btn" onclick="app.instr.restoreOriginalTableData(${activeRec?.id})" title="${app?.lang === 'ko' ? `장비 원본 측정값으로 복구 (${activeRec._orig?.AVG?.toFixed(2)} g)` : 'Restore original device values'}">
              ↺ ${app?.lang === 'ko' ? '원본 복구' : 'Restore'}
            </button>
          ` : ''}
        `;
      }
    }
  } else {
    // No segments selected
    const bottomActions = document.getElementById('spWaveBottomActions');
    if (bottomActions) {
      bottomActions.style.display = 'none';
      bottomActions.innerHTML = '';
    }

    const info = document.getElementById('spWaveInfo');
    if (info) {
      const peakF = force.length ? Math.max(...force) : 0;
      const cfg = S.lastWaveCfg || {};
      info.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span>
              ${t('sp_wave_samples') || '샘플'} <b>${force.length}</b>개 · ${cfg.tlAscii ? 'TL-2200 ASCII' : (cfg.decName || 'SP-2100')} · ` +
              `max <b>${peakF.toFixed(2)} g</b> · PEAK <b>${cfg.PEAK ?? '?'} g</b>` +
              (tMax ? ` · 0~<b>${tMax.toFixed(1)} s</b>` : '') +
            `</span>
            <span class="sp-wave-guide-text">(${app?.lang === 'ko' ? '다중 선택시 마우스로 구간을 드래그하여 선택하세요.' : 'Drag across the chart to select multiple segments.'})</span>
          </div>
          ${isModified ? `
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:11px;color:${isLight ? '#b45309' : '#f59e0b'};background:${isLight ? '#fffbeb' : 'rgba(245,158,11,0.1)'};padding:1px 6px;border-radius:4px;border:1px solid ${isLight ? '#fcd34d' : 'rgba(245,158,11,0.3)'};">
                ${activeLabel}행 구간 수정됨 (원본: ${activeRec._orig?.AVG?.toFixed(2)}g)
              </span>
              <button class="sp-restore-btn" style="padding:2px 8px;font-size:10px;line-height:1.4;" onclick="app.instr.restoreOriginalTableData(${activeRec?.id})">
                ↺ 원본 복구
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }
  }
}

// ── Serial line handler ───────────────────────────────────────────────────────
function onLine(line) {
  const model = document.getElementById('sp_model')?.value || 'SP-2100';
  const f = parseLine(line, model);
  if (!f) return;
  app.log(`RX  SP=${fmt1(f.SP)} KP=${fmt1(f.KP)} Val=${fmt1(f.VAL)} Avg=${fmt1(f.AVG)} RMS=${fmt1(f.RMS)} g`);
  if (f.KP != null) S.liveCfg.PEAK = f.KP;

  // SP-2100 and TL-2200 both commit exclusively in processFrame after waveform is assembled.
  // Do NOT commit in onLine to prevent duplicate record insertion!
}

function ensure2ColLayout() {
  const layout = document.getElementById('layout');
  if (layout) layout.classList.add('sp2100-layout-no-right');
  const rp = document.getElementById('rightpanel');
  if (rp) {
    rp.style.setProperty('display', 'none', 'important');
    rp.innerHTML = '';
  }
}

function onConnect() {
  const model = document.getElementById('sp_model')?.value || 'SP-2100';
  const baud  = parseInt(document.getElementById('sp_baud')?.value, 10) || 57600;
  S.liveCfg = {}; S.prevText = ''; S.frameBuf = [];
  S.lastRawFrame = null; S.rawFrameCount = 0;
  clearTimeout(S.frameTimer); S.frameTimer = null;
  ensure2ColLayout();
  app.log(`${t('sp_conn_log')}: ${model} (${baud} bps)`, 'ok');
}

function onDisconnect() {
  clearTimeout(S.frameTimer); S.frameTimer = null; S.frameBuf = [];
  ensure2ColLayout();
}

// ── Exported instrument module ────────────────────────────────────────────────
export default {
  name: 'SP-2100 / TL-2200',
  icon: 'assets/sp2100.png',
  category: 'Instrument',
  viewType: 'custom',

  // ComLink III and the 2026-09-03 real-device capture both use 38400 8-N-1
  // by default. Other listed rates remain selectable for differently configured units.
  get serial() {
    const baud = parseInt(document.getElementById('sp_baud')?.value, 10) || 57600;
    return { baudRate: baud, dataBits: 8, parity: 'none', stopBits: 1 };
  },

  get pollCmd() {
    const model = document.getElementById('sp_model')?.value || 'TL-2200';
    return model === 'SP-2100' ? null : 'R\r';
  },
  pollInterval: 300,

  buildSidebar(el) {
    if (!S) init();
    ensure2ColLayout();

    el.innerHTML = `<div class="sidebar-top">
      <div class="panel">
        <div class="field-label">${t('sp_model_label')}</div>
        <select id="sp_model" class="inp" onchange="app.instr.onModelChange()">
          <option value="SP-2100">SP-2100 (Peel/Force)</option>
          <option value="TL-2200">TL-2200</option>
        </select>
        <div class="field-label" style="margin-top:8px;">${t('sp_baud_label') || '통신 속도 (Baud Rate)'}</div>
        <select id="sp_baud" class="inp" onchange="app.instr.onBaudChange()">
          <option value="57600" selected>57600 bps (SP-2100 표준 권장)</option>
          <option value="38400">38400 bps (TL-2200 / ComLink)</option>
        </select>
        <div id="sp_cfgLine" class="cfgline" style="font-family:var(--mono);font-size:12px;color:var(--cyan);
             background:var(--panel-2);border:1px solid var(--border);border-radius:8px;padding:9px 11px;margin:10px 0;"></div>
        <div id="connStatus" class="conn-status-lbl">Disconnected</div>
        <button id="btnConnect" class="big-btn" onclick="app.toggleConnection()">${t('conn_btn')}</button>
      </div>
      <div class="panel">
      <div class="panel-title">${t('sp_test_section')}</div>
      <label class="fl" style="margin-top:0;">${t('sp_sample_name_label') || '샘플명'}</label>
      <input type="text" id="sp_sample_name" class="inp" value="${t('sp_sample_default_val') || '제품'}" style="width:100%;margin-bottom:10px;" oninput="app.instr.saveSettings()" onchange="app.instr.saveSettings()">
      <label class="fl">${t('sp_speed_label')}</label>
      <div style="display:flex;align-items:center;gap:6px;">
        <input type="number" id="sp_speed" class="inp" value="90" step="1" min="0" oninput="app.instr.saveSettingsAndReplot()" onchange="app.instr.saveSettingsAndReplot()">
        <span style="font-size:11px;color:var(--text-mut);width:48px;">in/min</span>
      </div>
      <label class="fl">${t('sp_delay_label')}</label>
      <div style="display:flex;align-items:center;gap:6px;">
        <input type="number" id="sp_delay" class="inp" value="1" step="0.1" min="0" oninput="app.instr.saveSettingsAndReplot()" onchange="app.instr.saveSettingsAndReplot()">
        <span style="font-size:11px;color:var(--text-mut);width:48px;">s</span>
      </div>
      <label class="fl">${t('sp_avg_label')}</label>
      <div style="display:flex;align-items:center;gap:6px;">
        <input type="number" id="sp_avg" class="inp" value="5" step="0.5" min="0" oninput="app.instr.saveSettingsAndReplot()" onchange="app.instr.saveSettingsAndReplot()">
        <span style="font-size:11px;color:var(--text-mut);width:48px;">s</span>
      </div>
        <div style="font-size:11px;color:var(--text-mut);margin-top:6px;line-height:1.5;">${t('sp_test_hint')}</div>
      </div>
    </div>${syslogPanelHTML()}`;
    loadSettings();
    refreshCfgLine();
  },

  buildCenter(el) {
    ensure2ColLayout();
    el.innerHTML = `
      <!-- 1. Live display bar -->
      <div class="display-bar">
        <div class="disp-value"><span id="liveValue">— — —</span><span class="disp-unit" id="liveUnit">g</span></div>
        <div class="disp-meta">
          <span id="liveStatus" class="disp-status off">${t('disconnected')}</span>
          <span class="meas-count">${t('meas_count_lbl')} <b id="measCount">0</b></span>
        </div>
      </div>

      <!-- 2. Charts grid: Waveform (left, 70%) and AVG distribution (right, 30%) -->
      <div class="sp-charts-grid" style="display:grid;grid-template-columns:7fr 3fr;gap:10px;margin-bottom:8px;flex:none;">
        <div class="panel" style="margin-bottom:0;display:flex;flex-direction:column;flex:none;padding:10px 12px;">
          <div class="graph-head" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="panel-title">${t('sp_wave_title') || '현재 파형 그래프 (힘-시간)'}</div>
              <button class="sbtn" style="padding:1px 7px;font-size:10.5px;line-height:1.3;" onclick="app.instr.loadDemoWave && app.instr.loadDemoWave()" title="시뮬레이션 테스트용 샘플 파형을 불러옵니다">📊 샘플 파형</button>
            </div>
            <span style="font-size:11px;color:var(--text-mut);background:rgba(245, 158, 11, 0.1);border:1px solid rgba(245, 158, 11, 0.3);color:#d97706;border-radius:4px;padding:2px 8px;font-weight:500;">
              ℹ️ ${app?.lang === 'ko' ? '드래그 구간 분석은 참고용이며, 공식 판정은 하단 장비 측정값(AVG)을 사용하세요' : 'Drag stats are for reference only. Use device AVG below for official results.'}
            </span>
          </div>
          <div class="graph-hint" id="spWaveInfo" style="min-height:18px;line-height:1.3;white-space:normal;word-break:break-word;margin-bottom:6px;">${t('sp_wave_hint') || '측정을 실행하면 힘-시간 곡선이 표시됩니다.'}</div>
          <div class="graph-area" style="flex:none;height:190px;min-height:190px;position:relative;">
            <canvas id="spWaveChart" style="width:100%;height:100%;display:block;"></canvas>
            <div class="graph-empty" id="spWaveEmpty" style="pointer-events:auto;cursor:pointer;" onclick="app.instr.loadDemoWave && app.instr.loadDemoWave()">${t('sp_wave_hint') || '측정을 실행하면 힘-시간 곡선이 표시됩니다.'}</div>
            <div id="spWaveBottomActions" class="sp-bottom-apply-wrap" style="display:none;"></div>
          </div>
        </div>
        <div class="panel" style="margin-bottom:0;display:flex;flex-direction:column;flex:none;padding:10px 12px;">
          <div class="graph-head">
            <div class="panel-title">${t('sp_dist_title') || 'AVG 분포'}</div>
          </div>
          <div class="graph-hint" style="min-height:18px;line-height:1.3;white-space:normal;word-break:break-word;margin-bottom:6px;">${t('sp_dist_hint') || '체크한 행(또는 그룹별)의 AVG 값 분포를 박스-수염 차트로 표시합니다.'}</div>
          <div class="graph-area" style="flex:none;height:190px;min-height:190px;position:relative;">
            <canvas id="spChart"></canvas>
            <div class="graph-empty" id="spChartEmpty">${t('chart_empty') || '측정 데이터가 없습니다'}</div>
          </div>
        </div>
      </div>

      <!-- 3. Measurement data log -->
      <div class="panel datalog-head-bar" style="margin-bottom:6px;flex:none;">
        <div class="panel-title">${t('sp_table_title')}</div>
        <div class="datalog-actions">
          <span style="display:flex;align-items:center;gap:6px;margin-right:4px;" title="${t('sp_group_hint')}">
            <label class="fl" style="margin:0;white-space:nowrap;">${t('sp_group_label')}</label>
            <input type="number" id="sp_group" class="inp" style="width:64px;" value="5" min="1" step="1" onchange="app.instr.onGroupChange()">
          </span>
          <button class="sbtn" onclick="app.instr.copyData()">${t('btn_copy')}</button>
          <button class="sbtn green" onclick="app.instr.exportXLSX()">${t('btn_xlsx') || 'XLSX 저장'}</button>
          <button class="sbtn red-o" onclick="app.instr.deleteChecked()">${t('btn_del_sel')}</button>
          <button class="sbtn red" onclick="app.instr.clearData()">${t('btn_clear')}</button>
        </div>
      </div>
      <div class="panel grow" style="flex:1;min-height:220px;display:flex;flex-direction:column;overflow:hidden;padding:8px;">
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

    // Attach Y-axis overlays to both charts
    _attachYOverlay(el.querySelector('#spChart').closest('.graph-area'), () => drawChart());
    _attachWaveYOverlay(el.querySelector('#spWaveChart').closest('.graph-area'), () => {
      if (S?._cachedWave) drawCurve(S._cachedWave.force, S._cachedWave.tMax, S._cachedWave.us);
    });

    const waveArea = el.querySelector('#spWaveChart')?.closest('.graph-area');
    if (waveArea && window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        if (S?._cachedWave) drawCurve(S._cachedWave.force, S._cachedWave.tMax, S._cachedWave.us);
      });
      ro.observe(waveArea);
    }
  },

  buildRightPanel(el) {
    ensure2ColLayout();
    if (el) {
      el.style.setProperty('display', 'none', 'important');
      el.innerHTML = '';
    }
  },

  onLine,
  onByte,
  onConnect,
  onDisconnect,
  onRebuild() {
    renderTable();
    drawChart();
    if (S?._cachedWave) drawCurve(S._cachedWave.force, S._cachedWave.tMax, S._cachedWave.us);
  },

  // Exposed for inline onclick handlers
  copyData, exportCSV, exportXLSX, clearData, deleteChecked,
  toggleCheck, toggleCheckAll, onGroupChange, onModelChange, onBaudChange,
  setRecName, setRecField, saveSettings, saveSettingsAndReplot, selectRow, clearWaveSelection, exportRawFrame,
  setWaveYScale, resetWaveYScale, setChartYScale, resetChartYScale,
  removeWaveSegment, toggleMultiSegmentMode, applySegmentsToTable, restoreOriginalTableData,
  commitMeasurement, plotForce, loadDemoWave,
};
