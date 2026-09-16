import { syslogPanelHTML, fmt, dateStr } from './_utils.js';

// ── Module-level state ────────────────────────────────────────────────────────
let S = null;

const AG_SK = 'agilent4339b_settings';

function saveAgSettings() {
  const s = {
    mode:        S.mode,
    voltage:     document.getElementById('ag_voltage')?.value      ?? '500',
    autoVolt:    document.getElementById('ag_autoVolt')?.checked   ?? true,
    ilimit:      document.getElementById('ag_ilimit')?.value       ?? '500uA',
    charge:      document.getElementById('ag_charge')?.value       ?? '60',
    discharge:   document.getElementById('ag_discharge')?.value    ?? '0',
    thickness:   document.getElementById('ag_thickness')?.value    ?? '1.0',
    sample:      document.getElementById('ag_sample')?.value       ?? '',
    repeatCount: document.getElementById('ag_repeatCount')?.value  ?? '1',
  };
  localStorage.setItem(AG_SK, JSON.stringify(s));
}

function loadAgSettings() {
  return JSON.parse(localStorage.getItem(AG_SK) || '{}');
}

function init() {
  const sv = loadAgSettings();
  S = {
    mode: sv.mode || 'VOL',
    running: false,
    timer: null,
    responsePoll: null,
    pendingTimeouts: new Set(),
    awaitingFetch: false,
    fetchToken: 0,
    latestVal: null,
    latestOL: false,
    lastRaw: null,
    rows: [],
    autoVolt: sv.autoVolt !== undefined ? sv.autoVolt : true,
    curGroup: null,
    curIdx: 0,
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

// ── Current-limit configuration (4339B Operation Manual, SOURce subsystem) ────
// 0.5/1 mA: 0-1000 V, 2 mA: 0-500 V, 5 mA: 0-250 V, 10 mA: 0-100 V.
const ILIM_LEVELS = [
  { label: '500uA', mA: 0.5, maxVoltage: 1000, scpi: '0.5MA' },
  { label: '1mA',   mA: 1,   maxVoltage: 1000, scpi: '1MA' },
  { label: '2mA',   mA: 2,   maxVoltage: 500,  scpi: '2MA' },
  { label: '5mA',   mA: 5,   maxVoltage: 250,  scpi: '5MA' },
  { label: '10mA',  mA: 10,  maxVoltage: 100,  scpi: '10MA' },
];

// OL threshold: Agilent returns +9.9E+37 on overflow
const OL_THRESHOLD = 9e+36;
const FETCH_TIMEOUT_MS = 125000;
const FETCH_POLL_MS = 200;

function parseFetchResponse(rawLine) {
  const line = String(rawLine ?? '').trim();
  if (!line) return null;

  const errorMatch = line.match(/^([+-]\d+)\s*,\s*"([^"]*)"/);
  if (errorMatch) {
    return { kind: 'error', code: parseInt(errorMatch[1]), raw: line };
  }

  if (/^OL(?:\s|$)/i.test(line)) {
    return { kind: 'measurement', statusCode: 1, value: 9.9e37, overload: true, raw: line };
  }

  // Trigger-output response: "+0,+1.234E+09" (status code, measured value).
  const pairMatch = line.match(/^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[Ee][+-]?\d+)?)/);
  if (pairMatch) {
    const statusCode = parseInt(parseFloat(pairMatch[1]));
    const value = parseFloat(pairMatch[2]);
    return {
      kind: 'measurement', statusCode, value,
      overload: statusCode !== 0 || Math.abs(value) > OL_THRESHOLD,
      raw: line,
    };
  }

  // Some 4339B format settings return only the numeric reading. The legacy
  // PyVISA implementation accepted this form, so preserve that compatibility.
  const singleMatch = line.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[Ee][+-]?\d+)?)$/);
  if (singleMatch) {
    const value = parseFloat(singleMatch[1]);
    return {
      kind: 'measurement', statusCode: 0, value,
      overload: Math.abs(value) > OL_THRESHOLD,
      raw: line,
    };
  }

  return null;
}

// helpers
const t = k => app?.t(k) ?? k;
const escAttr = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');

function _schedule(callback, delayMs) {
  const state = S;
  const id = setTimeout(() => {
    state?.pendingTimeouts?.delete(id);
    if (S !== state) return;
    callback();
  }, delayMs);
  state?.pendingTimeouts?.add(id);
  return id;
}

function _clearMeasurementTimers() {
  if (!S) return;
  S.fetchToken++;
  S.awaitingFetch = false;
  if (S.timer !== null) {
    clearInterval(S.timer);
    S.timer = null;
  }
  if (S.responsePoll !== null) {
    clearInterval(S.responsePoll);
    S.responsePoll = null;
  }
  for (const id of S.pendingTimeouts) clearTimeout(id);
  S.pendingTimeouts.clear();
}

// ── Mode selection popup (guide image — click image to close) ─────────────────
function showModeModal(mode) {
  const isVol  = mode === 'VOL';
  const imgSrc = isVol ? 'assets/volume_guide.png' : 'assets/surface_guide.png';
  const title  = isVol ? t('ag_mode_title_vol') : t('ag_mode_title_surf');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay'; modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-box" style="width:560px;padding:12px;cursor:default;">
      <div class="modal-title ok" style="margin-bottom:10px;">${title}</div>
      <div style="font-size:11.5px;color:var(--text-dim);text-align:center;margin-bottom:8px;">${t('ag_mode_click_hint')}</div>
      <img src="${imgSrc}" alt="${title}"
           style="width:100%;border-radius:8px;border:2px solid var(--border);cursor:pointer;transition:border-color .15s;"
           onmouseover="this.style.borderColor='var(--accent)'"
           onmouseout="this.style.borderColor='var(--border)'"
           onclick="app.instr.applyMode('${mode}'); this.closest('.modal-overlay').remove();"
           onerror="this.style.display='none';this.nextElementSibling.style.display=''">
      <div style="display:none;padding:20px;background:var(--panel-2);border-radius:8px;text-align:center;color:var(--text-dim);">
        ※ ${imgSrc}
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

function applyMode(mode) {
  S.mode = mode;
  document.getElementById('ag_modeSurf')?.classList.toggle('active', mode === 'SURF');
  document.getElementById('ag_modeVol')?.classList.toggle('active', mode === 'VOL');
  const lbl = document.getElementById('ag_modeLabel');
  if (lbl) lbl.textContent = mode === 'VOL' ? t('ag_mode_lbl_vol') : t('ag_mode_lbl_surf');
  app.log(`${t('ag_mode_changed')} ${mode === 'VOL' ? t('ag_mode_vol_short') : t('ag_mode_surf_short')}`, 'ok');
  saveAgSettings();
}

// ── SOP Manual popup ──────────────────────────────────────────────────────────
const SOP_STEPS = [
  { file: 'sop_step1',
    ko_t: '1. 전극 클리닝 (Cleaning)',
    ko_d: '아세톤 용액을 묻힌 와이퍼로 전극을 깨끗이 닦으세요.',
    en_t: '1. Electrode Cleaning',
    en_d: 'Clean electrodes with acetone and a lint-free wiper.' },
  { file: 'sop_step2',
    ko_t: '2. 시료 거치 (Placement)',
    ko_d: '내부 전극과 외부 링을 모두 덮도록 시료를 안착시키세요.',
    en_t: '2. Sample Placement',
    en_d: 'Place sample covering both inner electrode and outer ring.' },
  { file: 'sop_step3',
    ko_t: '3. 전극 밀착 (Contact)',
    ko_d: '핸들을 돌려 밀착시키되, 시료 두께 변형에 주의하세요.',
    en_t: '3. Electrode Contact',
    en_d: 'Close electrodes firmly but avoid deforming the sample.' },
  { file: 'sop_step4',
    ko_t: '4. 덮개 폐쇄 및 측정 시작',
    ko_d: '보호 덮개를 완전히 닫고 측정 시작 버튼을 누르세요.',
    en_t: '4. Close Lid & Start Measurement',
    en_d: 'Close the shield box lid completely, then press START.' },
];

function showSOPModal() {
  let current = 0;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay'; modal.style.display = 'flex';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };

  function render() {
    const s = SOP_STEPS[current];
    const isLast = current === SOP_STEPS.length - 1;
    const lang = app?.lang ?? 'ko';
    const titleTxt  = lang === 'ko' ? s.ko_t : s.en_t;
    const descTxt   = lang === 'ko' ? s.ko_d : s.en_d;
    const altTxt    = lang === 'ko' ? s.en_t : s.ko_t;
    const altDesc   = lang === 'ko' ? s.en_d : s.ko_d;
    modal.innerHTML = `
      <div class="modal-box" style="width:680px;padding:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div class="modal-title ok" style="margin:0;">${t('ag_sop_title')}</div>
          <span style="font-size:12px;color:var(--text-dim);">${current + 1} / ${SOP_STEPS.length}</span>
        </div>
        <img src="assets/${s.file}.png" alt="${s.en_t}"
             style="width:66.7%;display:block;margin:0 auto;border-radius:8px;border:1px solid var(--border);"
             onerror="this.style.opacity='.2'">
        <div style="margin-top:10px;padding:10px 12px;background:var(--panel-2);border-radius:8px;border-left:3px solid var(--cyan);">
          <div style="font-size:13.5px;font-weight:700;color:var(--text);margin-bottom:3px;">${titleTxt}</div>
          <div style="font-size:12.5px;color:var(--text-dim);margin-bottom:6px;">${descTxt}</div>
          <div style="font-size:11.5px;color:var(--text-mut);font-style:italic;">${altTxt} — ${altDesc}</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="sbtn" style="flex:1;" ${current === 0 ? 'disabled' : ''}
                  onclick="window._sopStep(${current - 1})">${t('ag_sop_prev')}</button>
          ${isLast
            ? `<button class="big-btn danger" style="flex:2;" onclick="this.closest('.modal-overlay').remove()">${t('ag_sop_close')}</button>`
            : `<button class="big-btn green" style="flex:2;" onclick="window._sopStep(${current + 1})">${t('ag_sop_next')}</button>`}
        </div>
      </div>`;
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
  }

  window._sopStep = idx => { current = idx; render(); };
  render();
  document.body.appendChild(modal);
}

// ── Auto voltage ──────────────────────────────────────────────────────────────
function onAutoVoltChange(checked) {
  S.autoVolt = checked;
  const voltSel = document.getElementById('ag_voltage');
  if (voltSel) voltSel.disabled = checked;
  if (checked) calcAutoVoltage();
  saveAgSettings();
}

function _ilimLevel(label) {
  return ILIM_LEVELS.find(level => level.label === label) || ILIM_LEVELS[0];
}

function _syncIlimitForVoltage(logAdjustment = true) {
  const voltage = parseFloat(document.getElementById('ag_voltage')?.value) || 500;
  const ilimSel = document.getElementById('ag_ilimit');
  if (!ilimSel) return ILIM_LEVELS[0];

  for (const option of ilimSel.options) {
    const level = _ilimLevel(option.value);
    option.disabled = voltage > level.maxVoltage;
  }

  let selected = _ilimLevel(ilimSel.value);
  if (voltage > selected.maxVoltage) {
    const previous = selected.label;
    const allowed = ILIM_LEVELS.filter(level => voltage <= level.maxVoltage);
    selected = allowed[allowed.length - 1] || ILIM_LEVELS[0];
    ilimSel.value = selected.label;
    if (logAdjustment) {
      app.log(`[4339B] ${app.tf('ag_ilim_adjusted', {
        voltage, previous, selected: selected.label,
      })}`, 'warn');
    }
  }

  return selected;
}

function calcAutoVoltage() {
  if (!S.autoVolt) return;
  const thick = parseFloat(document.getElementById('ag_thickness')?.value) || 1.0;
  const voltSel = document.getElementById('ag_voltage');
  if (voltSel) voltSel.value = thick <= 0.1 ? '100' : '500';
  _syncIlimitForVoltage();
}

// ── Measurement ───────────────────────────────────────────────────────────────
function startMeas() {
  if (!app.serial.isConnected) { alert(t('connect_first')); return; }
  if (S.running) return;

  // A quick stop/restart must not allow a delayed command from the previous run
  // to interleave with the new initialization sequence.
  _clearMeasurementTimers();

  const voltage    = parseInt(document.getElementById('ag_voltage')?.value)    || 500;
  const chargeT    = parseInt(document.getElementById('ag_charge')?.value)     || 60;
  const dischargeT = parseInt(document.getElementById('ag_discharge')?.value)  || 0;
  const ilim       = _syncIlimitForVoltage();
  saveAgSettings();

  S.running = true;
  S.latestVal = null;
  document.getElementById('ag_btnStart').disabled = true;
  document.getElementById('ag_btnStop').disabled  = false;

  const d = document.getElementById('ag_timerDisp');
  if (d) d.textContent = t('ag_initializing');
  app._setDisplay('INIT', '', 'stabilizing', 'SETUP');
  app.log(`[4339B] 초기화: *RST → FUNC 'RES' → SOUR:VOLT ${voltage} → SOUR:CURR:LIM ${ilim.scpi} → TRIG:SOUR BUS`, 'ok');

  // 실기 검증된 트리거 시퀀스에 공식 매뉴얼의 current-limit 설정을 추가
  app.serial.sendCmd('*RST\r\n');
  _schedule(() => app.serial.sendCmd('*CLS\r\n'),                       2200);
  _schedule(() => app.serial.sendCmd("FUNC 'RES'\r\n"),                 2500);
  _schedule(() => app.serial.sendCmd(`SOUR:VOLT ${voltage}\r\n`),       2800);
  _schedule(() => app.serial.sendCmd(`SOUR:CURR:LIM ${ilim.scpi}\r\n`), 3100);
  _schedule(() => app.serial.sendCmd('TRIG:SOUR BUS\r\n'),              3400);
  _schedule(() => _doStartCycle(voltage, ilim.label, chargeT, dischargeT), 3700);
}

function _doStartCycle(voltage, ilimLbl, chargeT, dischargeT) {
  if (!S.running) return;
  S.latestVal = null;

  // Python measure() Step 1: OUTP ON → 1s 안정화 후 충전 카운트 시작
  app.log('[4339B] OUTP ON — 충전 시작', 'ok');
  app.serial.sendCmd('OUTP ON\r\n');

  _schedule(() => {
    if (!S.running) return;
    let elapsed = 0;
    const status = document.getElementById('ag_timerDisp');
    if (status) status.textContent = `${t('ag_charging')} [${ilimLbl}]`;
    app._setDisplay(chargeT, 's', 'stabilizing', 'CHARGING');

    S.timer = setInterval(() => {
      if (!S.running) { clearInterval(S.timer); return; }
      elapsed++;
      const remaining = chargeT - elapsed;
      app._setDisplay(remaining, 's', 'stabilizing', 'CHARGING');
      if (elapsed >= chargeT) { clearInterval(S.timer); doMeasure(voltage, ilimLbl, chargeT, dischargeT); }
    }, 1000);
  }, 1000);
}

function doMeasure(voltage, ilimLbl, chargeT, dischargeT) {
  if (!S.running) return;
  const fetchToken = ++S.fetchToken;
  const d = document.getElementById('ag_timerDisp');
  if (d) d.textContent = `${t('ag_measuring')} [${ilimLbl}]`;
  app._setDisplay('📏 MEAS', '', 'stabilizing', 'MEASURING');
  app.log(`[4339B] ABOR → *CLS → INIT → *TRG → ${app.serial.isVisa ? 'READ' : 'FETC?'}`, 'ok');

  // The 4339B queues the measurement automatically after *TRG. On VISA/GPIB,
  // read that queued response directly; another query here causes -410.
  app.serial.sendCmd('ABOR\r\n');
  _schedule(() => app.serial.sendCmd('*CLS\r\n'),  500);
  _schedule(() => app.serial.sendCmd('INIT\r\n'),  800);
  _schedule(() => app.serial.sendCmd('*TRG\r\n'), 1300);
  _schedule(() => {
    if (!S.running) return;
    void _requestFetch(fetchToken, voltage, ilimLbl, chargeT, dischargeT);
  }, 1800);
}

async function _requestFetch(fetchToken, voltage, ilimLbl, chargeT, dischargeT) {
  if (!S.running || S.fetchToken !== fetchToken) return;
  S.awaitingFetch = true;
  S.latestVal = null;

  const result = app.serial.isVisa
    ? await app.serial.readVisa()
    : await app.serial.sendCmd('FETC?\r\n');
  if (!S.running || S.fetchToken !== fetchToken) return;

  // VISA read() completes only after the trigger response has been consumed.
  // Processing it here prevents OUTP OFF/*CLS from interrupting that read.
  if (app.serial.isVisa) {
    if (!result?.success) {
      _failFetch(fetchToken, result?.error || t('ag_fetch_timeout'), dischargeT);
      return;
    }
    if (S.latestVal !== null) {
      _completeFetch(fetchToken, voltage, ilimLbl, chargeT, dischargeT);
      return;
    }
    const response = String(result.response || t('ag_fetch_empty'));
    _failFetch(fetchToken, `${t('ag_fetch_unparsed')}: ${response}`, dischargeT);
    return;
  }

  // Web Serial/ASRL writes and reads on separate streams, so wait for onLine().
  const startedAt = Date.now();
  const poll = setInterval(() => {
    if (!S.running || S.fetchToken !== fetchToken) {
      clearInterval(poll);
      if (S.responsePoll === poll) S.responsePoll = null;
      return;
    }
    if (S.latestVal !== null) {
      _completeFetch(fetchToken, voltage, ilimLbl, chargeT, dischargeT);
    } else if (Date.now() - startedAt >= FETCH_TIMEOUT_MS) {
      _failFetch(fetchToken, t('ag_fetch_timeout'), dischargeT);
    }
  }, FETCH_POLL_MS);
  S.responsePoll = poll;
}

function _clearResponsePoll() {
  if (S.responsePoll !== null) {
    clearInterval(S.responsePoll);
    S.responsePoll = null;
  }
}

function _completeFetch(fetchToken, voltage, ilimLbl, chargeT, dischargeT) {
  if (!S.running || S.fetchToken !== fetchToken) return;
  _clearResponsePoll();
  S.awaitingFetch = false;
  const raw = S.latestVal;
  S.latestVal = null;
  S.lastRaw = raw;
  logResult(raw, voltage, ilimLbl, chargeT);
  doDischarge(dischargeT);
}

function _failFetch(fetchToken, message, dischargeT) {
  if (!S.running || S.fetchToken !== fetchToken) return;
  _clearResponsePoll();
  S.awaitingFetch = false;
  S.latestVal = null;
  app.log(`[4339B] ${t('ag_fetch_failed')}: ${message}`, 'err');
  const d = document.getElementById('ag_timerDisp');
  if (d) d.textContent = `${t('ag_fetch_failed')}: ${message}`;
  app._setDisplay('GPIB ERR', '', 'off', 'QUERY ERROR');
  doDischarge(dischargeT, () => _finishFetchError(message));
}

function _finishFetchError(message) {
  _clearMeasurementTimers();
  S.running = false;
  document.getElementById('ag_btnStart').disabled = false;
  document.getElementById('ag_btnStop').disabled = true;
  const d = document.getElementById('ag_timerDisp');
  if (d) d.textContent = `${t('ag_fetch_failed')}: ${message}`;
  app._setDisplay('GPIB ERR', '', 'off', 'QUERY ERROR');
}

function logResult(raw, voltage, ilimLbl, chargeT) {
  // ── 체크박스 재측정 확인 ──
  const chkd = [...document.querySelectorAll('.ag-row-chk:checked')];
  if (chkd.length > 1) { app.log('재측정: 1개 행만 선택해주세요.', 'warn'); return; }
  const reIdx = chkd.length === 1 ? +chkd[0].dataset.idx : null;

  const thickness  = parseFloat(document.getElementById('ag_thickness')?.value) || 1.0;
  const sample     = document.getElementById('ag_sample')?.value || 'Sample';
  const repeat     = Math.max(1, parseInt(document.getElementById('ag_repeatCount')?.value || '1') || 1);
  const electrode  = 50;

  let resistivity = null, unit = '';
  const isOL = raw === null || (raw !== null && raw > OL_THRESHOLD);
  if (!isOL && raw !== null && !isNaN(raw)) {
    const r_mm = electrode / 2;
    if (S.mode === 'SURF') {
      resistivity = raw * (2 * Math.PI) / Math.log((r_mm + 1) / r_mm);
      unit = 'Ω/sq';
    } else {
      resistivity = raw * Math.PI * (r_mm / 10) ** 2 / (thickness / 10);
      unit = 'Ω·cm';
    }
  }

  if (reIdx !== null && S.rows[reIdx]) {
    // ── 기존 행 덮어쓰기 ──
    const r = S.rows[reIdx];
    Object.assign(r, {
      mode: S.mode === 'SURF' ? 'Surface' : 'Volume',
      volt: voltage, ilim: ilimLbl, charge: chargeT, thick: thickness,
      raw: isOL ? null : raw, resistivity, unit, ol: isOL,
      time: new Date().toLocaleString('ko-KR') + ' (재측정)',
    });
    document.querySelectorAll('.ag-row-chk').forEach(c => c.checked = false);
    const sa = document.getElementById('ag_selectAll'); if (sa) sa.checked = false;
    renderTable(); drawChart();
    if (isOL) app.log(`재측정 완료 (No.${r.no}) — OL [${ilimLbl}]`, 'warn');
    else app.log(`재측정 완료 (No.${r.no})  Raw=${raw?.toExponential(4)} Ω  ρ=${resistivity?.toExponential(4)} ${unit}`, 'ok');
    return;
  }

  // ── 신규 행 추가 ──
  if (sample !== S.curGroup) { S.curGroup = sample; S.curIdx = 1; }
  else S.curIdx++;
  let label;
  if (repeat === 1) {
    label = `${sample}-${S.curIdx}`;
  } else {
    const groupNo = Math.ceil(S.curIdx / repeat);
    const subNo   = ((S.curIdx - 1) % repeat) + 1;
    label = `${sample}-${groupNo}-${subNo}`;
  }

  S.rows.push({
    no: S.rows.length + 1, sample: label,
    mode: S.mode === 'SURF' ? 'Surface' : 'Volume',
    volt: voltage, ilim: ilimLbl,
    charge: chargeT, thick: thickness,
    raw: isOL ? null : raw, resistivity, unit,
    ol: isOL,
  });
  app.count++; app._updateCount();
  renderTable(); drawChart();

  if (isOL) {
    app.log(`${t('ag_meas_done_ol')} ${ilimLbl}`, 'warn');
  } else {
    app.log(`${t('ag_meas_done')} Raw=${raw?.toExponential(4) ?? 'N/A'} Ω  ρ=${resistivity?.toExponential(4) ?? 'N/A'} ${unit}  [${ilimLbl}]`, 'ok');
  }
}

function doDischarge(dischargeT, onDone) {
  // Python _safe_off(): OUTP OFF → 0.5s → *CLS
  app.serial.sendCmd('OUTP OFF\r\n');
  _schedule(() => app.serial.sendCmd('*CLS\r\n'), 500);

  if (dischargeT <= 0) {
    _schedule(() => (onDone ?? finishOne)(), 700);
    return;
  }
  let elapsed = 0;
  const status = document.getElementById('ag_timerDisp');
  if (status) status.textContent = t('ag_discharging');
  app._setDisplay(dischargeT, 's', 'stabilizing', 'DISCHARGING');
  _schedule(() => {
    S.timer = setInterval(() => {
      elapsed++;
      const remaining = Math.max(0, dischargeT - elapsed);
      app._setDisplay(remaining, 's', 'stabilizing', 'DISCHARGING');
      if (elapsed >= dischargeT) { clearInterval(S.timer); (onDone ?? finishOne)(); }
    }, 1000);
  }, 700);
}

function finishOne() {
  _clearMeasurementTimers();
  S.running = false;
  document.getElementById('ag_btnStart').disabled = false;
  document.getElementById('ag_btnStop').disabled  = true;
  const d = document.getElementById('ag_timerDisp');
  if (d) d.textContent = t('ag_done_wait');
  // 마지막 측정값 유지 (값 덮어쓰지 않고 상태만 READY로 변경)
  const raw = S.lastRaw;
  const isOL = raw === null || (raw !== null && raw > OL_THRESHOLD);
  const dispVal = isOL ? 'OL' : raw.toExponential(4);
  const dispUnit = isOL ? '' : 'Ω';
  app._setDisplay(dispVal, dispUnit, 'ready', 'READY');
}

function stopMeas() {
  _clearMeasurementTimers();
  S.running = false;
  // Python voltage_off(): OUTP OFF → *CLS
  app.serial.sendCmd('OUTP OFF\r\n');
  _schedule(() => app.serial.sendCmd('*CLS\r\n'), 500);
  document.getElementById('ag_btnStart').disabled = false;
  document.getElementById('ag_btnStop').disabled  = true;
  const d = document.getElementById('ag_timerDisp');
  if (d) d.textContent = t('ag_stopped');
  app._setDisplay('STOP', '', 'off', 'STOPPED');
  app.log(t('ag_stopped_log'), 'warn');
}

// ── Table / Chart ─────────────────────────────────────────────────────────────
function toggleAll(cb) {
  document.querySelectorAll('.ag-row-chk').forEach(c => { c.checked = cb.checked; });
}

function deleteSel() {
  const sel = new Set([...document.querySelectorAll('.ag-row-chk:checked')].map(c => +c.dataset.idx));
  if (!sel.size) return;
  S.rows = S.rows.filter((_, i) => !sel.has(i));
  S.rows.forEach((r, i) => r.no = i + 1);
  app.count = S.rows.length; app._updateCount();
  renderTable(); drawChart();
}

function clearData() {
  if (!confirm(t('ag_confirm_clear'))) return;
  S.rows = []; app.count = 0; app._updateCount();
  renderTable(); drawChart();
}

function copyData() {
  const cols = ['No','Sample','Mode','Voltage (V)','I-Lim','Charge (s)','Thickness (mm)','Raw(Ω)','Resistivity','Unit','OL'];
  const lines = [cols.join('\t'), ...S.rows.map(r => [
    r.no, r.sample, r.mode, r.volt, r.ilim, r.charge, r.thick,
    r.raw != null ? r.raw.toExponential(4) : '', r.resistivity?.toExponential(4) ?? '', r.unit, r.ol ? 'OL' : '',
  ].join('\t'))];
  navigator.clipboard.writeText(lines.join('\n')).then(() => app.log(t('clipboard_ok'), 'ok'));
}

function exportCSV() {
  const cols = ['No','Sample','Mode','Voltage (V)','I-Lim','Charge (s)','Thickness (mm)','Raw(Ohm)','Resistivity','Unit','OL'];
  const rows = [cols, ...S.rows.map(r => [
    r.no, r.sample, r.mode, r.volt, r.ilim, r.charge, r.thick,
    r.raw != null ? r.raw.toExponential(4) : '', r.resistivity?.toExponential(4) ?? '', r.unit, r.ol ? 'OL' : '',
  ])];
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })),
    download: `Agilent4339B_${dateStr()}.csv`,
  });
  a.click(); URL.revokeObjectURL(a.href);
  app.log(t('csv_ok'), 'ok');
}

function renameSample(i, val) {
  if (S.rows[i]) S.rows[i].sample = val;
}

function renderTable() {
  const tbody = document.getElementById('agBody');
  if (!tbody) return;
  tbody.innerHTML = S.rows.map((r, i) => `<tr class="${r.ol ? 'ag-row-ol' : ''}">
    <td class="cchk"><input type="checkbox" class="ag-row-chk" data-idx="${i}"></td>
    <td class="num">${r.no}</td>
    <td><input class="pt-name-inp" value="${escAttr(r.sample)}" onchange="app.instr.renameSample(${i}, this.value)"></td>
    <td>${r.mode}</td>
    <td class="num">${r.volt}</td><td>${r.ilim}</td>
    <td class="num">${r.charge}</td><td class="num">${r.thick}</td>
    <td class="num accent">${r.ol ? '<span style="color:var(--warn);">OL</span>' : (r.raw?.toExponential(4) ?? '—')}</td>
    <td class="num accent">${r.resistivity?.toExponential(4) ?? '—'}</td>
    <td>${r.unit}</td>
  </tr>`).join('');
  const wrap = tbody.closest('.table-wrap');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

function _quartile(sorted, q) {
  // Linear interpolation quartile (q: 0~1)
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const pos = q * (n - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function drawChart() {
  const canvas  = document.getElementById('agChart');
  const emptyEl = document.getElementById('agChartEmpty');
  const statsEl = document.getElementById('agStatsPanel');
  if (!canvas) return;
  canvas.width  = canvas.offsetWidth  || 320;
  canvas.height = canvas.offsetHeight || 280;
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const repeat = Math.max(1, parseInt(document.getElementById('ag_repeatCount')?.value || '1') || 1);
  const validRows = S.rows.filter(r => r.resistivity !== null && !r.ol);
  if (!validRows.length) { if (emptyEl) emptyEl.style.display = ''; return; }
  if (emptyEl) emptyEl.style.display = 'none';

  const allLogVals = validRows.map(r => Math.log10(Math.abs(r.resistivity)));
  const autoMinLog = Math.floor(Math.min(...allLogVals)) - 0.5;
  const autoMaxLog = Math.ceil(Math.max(...allLogVals))  + 0.5;
  const minLog = S._yMin !== null ? S._yMin : autoMinLog;
  const maxLog = S._yMax !== null ? S._yMax : autoMaxLog;
  if (S._yMaxInp && S._yMax === null) S._yMaxInp.placeholder = autoMaxLog.toFixed(1);
  if (S._yMinInp && S._yMin === null) S._yMinInp.placeholder = autoMinLog.toFixed(1);
  const spanLog = maxLog - minLog || 1;
  const padT = 30, padB = 40, padL = 54, padR = 16;
  if (S._yMaxInp) { S._yMaxInp.style.top = `${padT - 9}px`; S._yMaxInp.style.left = '3px'; }
  if (S._yMinInp) { S._yMinInp.style.top = `${(canvas.offsetHeight || H) - padB - 9}px`; S._yMinInp.style.left = '3px'; }
  if (S._yResetBtn) { S._yResetBtn.style.top = '6px'; S._yResetBtn.style.right = '6px'; }
  const cH = H - padT - padB, totalW = W - padL - padR;
  const toY = v => padT + (1 - (v - minLog) / spanLog) * cH;

  const cs = getComputedStyle(document.body);
  const C = {
    text:    cs.getPropertyValue('--chart-text').trim()    || '#5e7790',
    grid:    cs.getPropertyValue('--chart-grid').trim()    || 'rgba(31,59,86,.5)',
    boxFill: cs.getPropertyValue('--chart-box-fill').trim()|| 'rgba(43,143,255,.12)',
    boxStr:  cs.getPropertyValue('--chart-box-str').trim() || '#2b8fff',
    accent:  cs.getPropertyValue('--accent').trim()        || '#2b8fff',
  };

  // Y-axis grid
  ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
  const eMin = Math.ceil(minLog), eMax = Math.floor(maxLog);
  for (let e = eMin; e <= eMax; e++) {
    const y = toY(e);
    if (!S._yMaxInp || (e > eMin && e < eMax)) {
      ctx.fillStyle = C.text;
      ctx.fillText(`10^${e}`, padL - 4, y + 4);
    }
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
  }

  const allVals = validRows.map(r => r.resistivity);
  const mean = allVals.reduce((a, b) => a + b, 0) / allVals.length;
  const sd   = Math.sqrt(allVals.reduce((s, v) => s + (v - mean) ** 2, 0) / allVals.length);

  if (repeat > 1) {
    // ── Box-and-whisker mode: group every `repeat` rows — 최근 3그룹만 표시 ──
    const allGroups = [];
    for (let start = 0; start < S.rows.length; start += repeat) {
      const chunk = S.rows.slice(start, start + repeat)
                         .filter(r => r.resistivity !== null && !r.ol);
      if (!chunk.length) continue;
      const logVals = chunk.map(r => Math.log10(Math.abs(r.resistivity))).sort((a, b) => a - b);
      const rawVals = chunk.map(r => r.resistivity);
      allGroups.push({ logVals, rawVals, n: chunk.length, groupNo: allGroups.length + 1 });
    }
    if (!allGroups.length) return;
    const groups = allGroups.slice(-3);

    const colW = totalW / groups.length;
    const bW = Math.max(16, Math.min(colW * 0.55, 72));

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

    groups.forEach((g, gi) => {
      const { logVals, rawVals } = g;
      const cx   = padL + (gi + 0.5) * colW;
      const x1   = cx - bW / 2, x2 = cx + bW / 2;
      const wMin = logVals[0], wMax = logVals[logVals.length - 1];
      const q1   = _quartile(logVals, 0.25);
      const med  = _quartile(logVals, 0.5);
      const q3   = _quartile(logVals, 0.75);
      // 기하평균 (로그평균의 역변환) — 레이블 표시용
      const geoMean = Math.pow(10, logVals.reduce((a, b) => a + b, 0) / logVals.length);

      const colorObj = BOX_PALETTE[(g.groupNo - 1) % BOX_PALETTE.length];
      const boxStr = colorObj.stroke;
      const boxFill = colorObj.fill;

      // Box fill
      ctx.fillStyle = boxFill;
      ctx.strokeStyle = boxStr; ctx.lineWidth = 1.5;
      const yQ1 = toY(q1), yQ3 = toY(q3), yMed = toY(med);
      ctx.fillRect(x1, yQ3, bW, yQ1 - yQ3);
      ctx.strokeRect(x1, yQ3, bW, yQ1 - yQ3);
      // Median line
      ctx.beginPath(); ctx.moveTo(x1, yMed); ctx.lineTo(x2, yMed); ctx.stroke();
      // Whiskers
      const capHalf = bW * 0.22;
      ctx.beginPath();
      ctx.moveTo(cx, yQ1); ctx.lineTo(cx, toY(wMin));
      ctx.moveTo(cx - capHalf, toY(wMin)); ctx.lineTo(cx + capHalf, toY(wMin));
      ctx.moveTo(cx, yQ3); ctx.lineTo(cx, toY(wMax));
      ctx.moveTo(cx - capHalf, toY(wMax)); ctx.lineTo(cx + capHalf, toY(wMax));
      ctx.stroke();
      // Data points
      logVals.forEach(lv => {
        ctx.beginPath(); ctx.arc(cx, toY(lv), 3, 0, Math.PI * 2);
        ctx.fillStyle = boxStr; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
      });
      // 평균값 레이블 — 상단 수염 위, 기울여서 표시
      ctx.save();
      ctx.translate(cx, toY(wMax) - 7);
      ctx.rotate(-Math.PI / 5.5);
      ctx.font = 'bold 9px JetBrains Mono'; ctx.textAlign = 'left'; ctx.fillStyle = boxStr;
      ctx.fillText(geoMean.toExponential(2), 0, 0);
      ctx.restore();
      // X label: 실제 그룹 번호와 범위
      ctx.fillStyle = C.text; ctx.textAlign = 'center';
      ctx.font = '9px JetBrains Mono';
      const labelText = `#${g.groupNo} (${g.groupNo}-1~${g.groupNo}-${repeat})`;
      ctx.fillText(labelText, cx, H - padB + 14);
      if (g.n < repeat) {
        ctx.fillStyle = C.boxStr; ctx.font = '8.5px JetBrains Mono';
        ctx.fillText(`${g.n}/${repeat}`, cx, H - padB + 25);
      }
    });
  } else {
    // ── Bar chart mode (repeat = 1, individual bars) ──
    const vals = validRows.map(r => r.resistivity);
    const colW = totalW / vals.length;
    const bW   = Math.max(12, Math.min(colW * 0.65, 80));
    vals.forEach((v, i) => {
      const lv = Math.log10(Math.abs(v));
      const x  = padL + (i + 0.5) * totalW / vals.length - bW / 2;
      ctx.fillStyle = C.boxFill.replace(',.12)', ',.6)').replace(',.10)', ',.5)');
      ctx.strokeStyle = C.boxStr; ctx.lineWidth = 1;
      ctx.fillRect(x, toY(lv), bW, toY(minLog) - toY(lv));
      ctx.strokeRect(x, toY(lv), bW, toY(minLog) - toY(lv));
      ctx.fillStyle = C.text; ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), x + bW / 2, H - padB + 14);
    });
  }

  if (statsEl) statsEl.innerHTML = [
    ['n', validRows.length], ['Min', Math.min(...allVals).toExponential(4)],
    ['Max', Math.max(...allVals).toExponential(4)],
    ['Mean', mean.toExponential(4)], ['σ', sd.toExponential(4)],
  ].map(([k, v]) => `<div class="stat-chip">${k} <b>${v}</b></div>`).join('');
}

// ── Exported instrument module ────────────────────────────────────────────────
export default {
  name: 'Agilent 4339B',
  icon: 'assets/agilent_4339b.png',
  category: 'Instrument',
  viewType: 'custom',
  serial: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },

  buildSidebar(el) {
    if (!S) init();
    const sv = loadAgSettings();
    el.innerHTML = `<div class="sidebar-top">
      <div class="panel">
        <div class="notice">${t('ag_gpib_notice')}</div>
        <div class="field-label">${t('ag_conn_section')}</div>
        <div class="conn-row">
          <select id="portSelect" class="inp port-sel"></select>
          <button class="icon-btn" onclick="app.refreshPorts()" title="${t('refresh_tip')}">↻</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <label style="font-size:12px;color:var(--text-dim);white-space:nowrap;">GPIB ${t('ag_conn_section')}</label>
          <input type="number" id="ag_gpib" class="inp" value="17" min="0" max="30" style="width:70px;flex-shrink:0;">
        </div>
        <div id="connStatus" class="conn-status-lbl">Disconnected</div>
        <button id="btnConnect" class="big-btn" onclick="app.toggleConnection()">${t('conn_btn')}</button>
      </div>

      <div class="panel">
        <div class="panel-title">${t('ag_meas_section')}</div>
        <div class="field-label">${t('ag_meas_mode')}</div>
        <div class="toggle-row" style="margin-bottom:4px;">
          <button class="toggle-btn" id="ag_modeSurf"
                  onclick="app.instr.showModeModal('SURF')">${t('ag_mode_surf')}</button>
          <button class="toggle-btn active" id="ag_modeVol"
                  onclick="app.instr.showModeModal('VOL')">${t('ag_mode_vol')}</button>
        </div>
        <div id="ag_modeLabel" style="font-size:11px;color:var(--cyan);margin-bottom:8px;text-align:center;">${t('ag_mode_lbl_vol')}</div>
        <label class="fl">${t('ag_electrode')}</label>
        <select id="ag_electrode" class="inp" disabled><option selected>50mm</option></select>
        <label class="fl">${t('ag_thickness')}</label>
        <input type="number" id="ag_thickness" class="inp" value="1.0" step="0.05" min="0.01"
               oninput="app.instr.calcAutoVoltage()">
        <label class="fl">${t('ag_voltage')}</label>
        <div style="display:flex;align-items:center;gap:8px;">
          <select id="ag_voltage" class="inp" style="flex:1;" disabled>
            <option>10</option><option>25</option><option>50</option>
            <option>100</option><option>250</option>
            <option selected>500</option><option>1000</option>
          </select>
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-dim);white-space:nowrap;cursor:pointer;">
            <input type="checkbox" id="ag_autoVolt" checked
                   onchange="app.instr.onAutoVoltChange(this.checked)">
            ${t('ag_auto_volt')}
          </label>
        </div>
        <label class="fl">${t('ag_ilim')}</label>
        <select id="ag_ilimit" class="inp">
          <option selected>500uA</option><option>1mA</option>
          <option>2mA</option><option>5mA</option><option>10mA</option>
        </select>
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px;line-height:1.4;">
          ${t('ag_ilim_note')}
        </div>
        <div class="param-grid" style="margin-top:6px;">
          <div>
            <label class="fl">${t('ag_charge_t')}</label>
            <select id="ag_charge" class="inp">
              <option>10</option><option>30</option>
              <option selected>60</option><option>120</option>
            </select>
          </div>
          <div>
            <label class="fl">${t('ag_discharge_t')}</label>
            <select id="ag_discharge" class="inp">
              <option selected>0</option><option>2</option><option>5</option><option>10</option>
            </select>
          </div>
        </div>
        <button class="manage-btn" style="margin-top:8px;" onclick="app.instr.showSOPModal()">${t('ag_sop_btn')}</button>
      </div>

      <div class="panel">
        <label class="fl" style="margin-top:0;">${t('ag_sample')}</label>
        <input type="text" id="ag_sample" class="inp" placeholder="Sample A">
        <div id="ag_timerDisp" class="ag-timer-disp">${t('ag_wait')}</div>
        <button id="ag_btnStart" class="big-btn green" onclick="app.instr.startMeas()" style="margin-top:8px;">${t('ag_start_btn')}</button>
        <button id="ag_btnStop" class="big-btn danger" onclick="app.instr.stopMeas()" disabled>${t('ag_stop_btn')}</button>
      </div>
    </div>${syslogPanelHTML()}`;

    // 저장된 값 복원
    if (sv.voltage)   { const el = document.getElementById('ag_voltage');   if (el) el.value = sv.voltage; }
    if (sv.ilimit)    { const el = document.getElementById('ag_ilimit');    if (el) el.value = sv.ilimit; }
    if (sv.charge)    { const el = document.getElementById('ag_charge');    if (el) el.value = sv.charge; }
    if (sv.discharge) { const el = document.getElementById('ag_discharge'); if (el) el.value = sv.discharge; }
    if (sv.thickness) { const el = document.getElementById('ag_thickness'); if (el) el.value = sv.thickness; }
    if (sv.sample)    { const el = document.getElementById('ag_sample');    if (el) el.value = sv.sample; }
    if (sv.autoVolt !== undefined) {
      const cb = document.getElementById('ag_autoVolt');
      if (cb) { cb.checked = sv.autoVolt; onAutoVoltChange(sv.autoVolt); }
    }
    if (sv.mode && sv.mode !== 'VOL') applyMode(sv.mode);
    _syncIlimitForVoltage(false);

    // 변경 시 자동 저장
    ['ag_charge','ag_discharge','ag_thickness','ag_sample'].forEach(id =>
      document.getElementById(id)?.addEventListener('change', saveAgSettings));
    document.getElementById('ag_voltage')?.addEventListener('change', () => {
      _syncIlimitForVoltage();
      saveAgSettings();
    });
    document.getElementById('ag_ilimit')?.addEventListener('change', () => {
      _syncIlimitForVoltage();
      saveAgSettings();
    });
    document.getElementById('ag_thickness')?.addEventListener('input', saveAgSettings);
    document.getElementById('ag_sample')?.addEventListener('input', saveAgSettings);
  },

  buildCenter(el) {
    el.innerHTML = `
      <div class="display-bar">
        <div class="disp-value"><span id="liveValue">— — —</span><span class="disp-unit" id="liveUnit"></span></div>
        <div class="disp-meta">
          <span id="liveStatus" class="disp-status off">${t('disconnected')}</span>
          <span class="meas-count">${t('meas_count_lbl')} <b id="measCount">0</b></span>
        </div>
      </div>
      <div class="panel datalog-head-bar">
        <div class="panel-title">${t('data_panel_title')} (Agilent 4339B)</div>
        <div class="datalog-actions">
          <span style="font-size:12px;color:var(--text-dim);white-space:nowrap;">${t('group_repeat_label')}</span>
          <input id="ag_repeatCount" class="inp" type="number"
                 value="${JSON.parse(localStorage.getItem(AG_SK)||'{}').repeatCount ?? '1'}"
                 min="1" max="99" step="1"
                 style="width:54px;padding:5px 8px;font-size:13px;text-align:center;"
                 onchange="app.instr._saveAgSettings(); app.instr._redrawChart()">
          <button class="sbtn" onclick="app.instr.copyData()">${t('btn_copy')}</button>
          <button class="sbtn green" onclick="app.instr.exportCSV()">${t('btn_csv')}</button>
          <button class="sbtn red-o" onclick="app.instr.deleteSel()">${t('btn_del_sel')}</button>
          <button class="sbtn red" onclick="app.instr.clearData()">${t('btn_clear')}</button>
        </div>
      </div>
      <div class="panel grow" style="min-height:0;">
        <div class="table-wrap" style="flex:1;min-height:0;overflow:auto;border:1px solid var(--border);border-radius:8px;">
          <table id="agTable" style="width:100%;border-collapse:collapse;font-size:12.5px;">
            <thead><tr>
              <th class="cchk"><input type="checkbox" id="ag_selectAll" onchange="app.instr.toggleAll(this)"></th>
              <th>No</th><th>${t('ag_sample')}</th><th>${t('ag_meas_mode')}</th>
              <th>${t('ag_voltage')}</th><th>I-Lim</th>
              <th>${t('ag_charge_t')}</th><th>${t('ag_thickness')}</th>
              <th>Raw(Ω)</th><th>ρ</th><th>Unit</th>
            </tr></thead>
            <tbody id="agBody"></tbody>
          </table>
        </div>
      </div>`;
  },

  buildRightPanel(el) {
    el.innerHTML = `
      <div class="panel grow">
        <div class="graph-head"><div class="panel-title">📊 ρ Distribution</div></div>
        <div class="graph-hint">${t('chart_hint')}</div>
        <div class="graph-area">
          <canvas id="agChart"></canvas>
          <div class="graph-empty" id="agChartEmpty">${t('chart_empty')}</div>
        </div>
        <div id="agStatsPanel" class="stats-area"></div>
      </div>`;
    _attachYOverlay(el.querySelector('#agChart').closest('.graph-area'), () => drawChart());
  },

  onLine(line) {
    if (!S) return;
    const parsed = parseFetchResponse(line);
    if (!parsed) return;

    // SCPI 에러 응답 필터: -213,"INIT IGNORED" 등 (따옴표 포함)
    if (parsed.kind === 'error') {
      if (parsed.code !== 0) app.log(`4339B 오류: ${parsed.raw}`, 'err');
      return;
    }
    if (!S.running || !S.awaitingFetch) return;

    // Operation Manual: 0=Normal, 1=Overload, 2=No-Contact, 4=Over-Current.
    const { statusCode, value, overload, raw } = parsed;
    app.log(`[4339B RX] ${raw}`, overload ? 'warn' : 'ok');
    if (overload) {
      const statusLabel = ({ 1: 'Overload', 2: 'No-Contact', 4: 'Over-Current (I-Limit)' })[statusCode]
        || (statusCode !== 0 ? `Measurement Status ${statusCode}` : 'Overload');
      app.log(`[4339B] ${statusLabel}`, 'warn');
      S.latestVal = 9.9e37;
    } else {
      app._setDisplay(value.toExponential(4), 'Ω');
      S.latestVal = value;
    }
  },

  onRebuild() { renderTable(); drawChart(); },
  async onDisconnect() {
    if (!S) return;
    _clearMeasurementTimers();
    S.running = false;
    // core.js awaits this hook before closing Serial/VISA, so OUTP OFF is
    // completed while the transport is still available.
    if (app.serial.isConnected) await app.serial.sendCmd('OUTP OFF\r\n');
  },

  // Exposed for inline onclick handlers
  showModeModal, applyMode, showSOPModal,
  onAutoVoltChange, calcAutoVoltage,
  _syncIlimitForVoltage,
  startMeas, stopMeas,
  toggleAll, deleteSel, clearData, copyData, exportCSV, renameSample,
  _redrawChart: drawChart,
  _saveAgSettings: saveAgSettings,
};

export { parseFetchResponse };
