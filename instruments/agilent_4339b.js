import { syslogPanelHTML, fmt, dateStr } from './_utils.js';

// ── Module-level state ────────────────────────────────────────────────────────
let S = null;

function init() {
  S = {
    mode: 'VOL',
    running: false,
    timer: null,
    latestVal: null,
    latestOL: false,
    rows: [],
    currentIlimIdx: 0,
    autoEscalating: false,
    autoVolt: true,   // auto voltage based on thickness
  };
}

// ── I-Lim auto-escalation config ──────────────────────────────────────────────
const ILIM_STEPS  = ['500uA', '1mA', '2mA', '5mA', '10mA'];
const ILIM_CMDS   = ['500E-6', '1E-3', '2E-3', '5E-3', '10E-3'];

// OL threshold: Agilent returns +9.9E+37 on overflow
const OL_THRESHOLD = 9e+36;

// helper
const t = k => app?.t(k) ?? k;

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
}

function calcAutoVoltage() {
  if (!S.autoVolt) return;
  const thick = parseFloat(document.getElementById('ag_thickness')?.value) || 1.0;
  const voltSel = document.getElementById('ag_voltage');
  if (voltSel) voltSel.value = thick <= 0.1 ? '100' : '500';
}

// ── Measurement ───────────────────────────────────────────────────────────────
function startMeas() {
  if (!app.serial.isConnected) { alert(t('connect_first')); return; }
  if (S.running) return;

  const voltage    = parseInt(document.getElementById('ag_voltage')?.value)    || 500;
  const chargeT    = parseInt(document.getElementById('ag_charge')?.value)     || 60;
  const dischargeT = parseInt(document.getElementById('ag_discharge')?.value)  || 0;

  if (S.mode === 'VOL') {
    S.currentIlimIdx = 0;
    S.autoEscalating = false;
    const ilSel = document.getElementById('ag_ilimit');
    if (ilSel) ilSel.value = ILIM_STEPS[0];
  }

  _doStartCycle(voltage, chargeT, dischargeT);
}

function _doStartCycle(voltage, chargeT, dischargeT) {
  S.running = true; S.latestVal = null; S.latestOL = false;
  document.getElementById('ag_btnStart').disabled = true;
  document.getElementById('ag_btnStop').disabled  = false;

  const ilimIdx = S.mode === 'VOL' ? S.currentIlimIdx : 0;
  const ilimCmd = S.mode === 'VOL' ? ILIM_CMDS[ilimIdx] : ILIM_CMDS[0];
  const ilimLbl = S.mode === 'VOL' ? ILIM_STEPS[ilimIdx] : ILIM_STEPS[0];
  if (S.mode === 'VOL') {
    const ilSel = document.getElementById('ag_ilimit');
    if (ilSel) ilSel.value = ILIM_STEPS[ilimIdx];
  }

  app.serial.sendCmd(S.mode === 'SURF' ? ':SENS:MODE SURF\r\n' : ':SENS:MODE VOL\r\n');
  setTimeout(() => app.serial.sendCmd(`:SOUR:VOLT ${voltage}\r\n`), 200);
  setTimeout(() => app.serial.sendCmd(`:SENS:CURR:RANG:UPP ${ilimCmd}\r\n`), 350);
  setTimeout(() => app.serial.sendCmd(':INIT\r\n'), 500);

  let elapsed = 0;
  const disp = () => document.getElementById('ag_timerDisp');
  if (disp()) disp().textContent = `${t('ag_charging')} 0 / ${chargeT}s  [${ilimLbl}]`;
  app._setDisplay('⚡ CHARGING', 'V', 'stabilizing', 'CHARGING');

  S.timer = setInterval(() => {
    elapsed++;
    const d = disp();
    if (d) d.textContent = `${t('ag_charging')} ${elapsed} / ${chargeT}s  [${ilimLbl}]`;
    if (elapsed >= chargeT) { clearInterval(S.timer); doMeasure(voltage, chargeT, dischargeT); }
  }, 1000);
}

function doMeasure(voltage, chargeT, dischargeT) {
  if (!S.running) return;
  const d = document.getElementById('ag_timerDisp');
  const ilimLbl = S.mode === 'VOL' ? ILIM_STEPS[S.currentIlimIdx] : ILIM_STEPS[0];
  if (d) d.textContent = `${t('ag_measuring')} [${ilimLbl}]`;
  app._setDisplay('📏 MEAS', '', 'stabilizing', 'MEASURING');
  app.serial.sendCmd(':MEAS:RES?\r\n');

  let waited = 0;
  const poll = setInterval(() => {
    waited += 200;
    if (S.latestVal !== null || waited > 5000) {
      clearInterval(poll);
      const raw = S.latestVal; S.latestOL = S.latestVal === null || (raw !== null && raw > OL_THRESHOLD);
      S.latestVal = null;

      if (S.mode === 'VOL' && S.latestOL) {
        if (S.currentIlimIdx < ILIM_STEPS.length - 1) {
          S.currentIlimIdx++;
          S.autoEscalating = true;
          app.log(`${t('ag_ol_escalate')} ${ILIM_STEPS[S.currentIlimIdx - 1]} → ${ILIM_STEPS[S.currentIlimIdx]}`, 'warn');
          S.running = false;
          doDischarge(dischargeT, () => { _doStartCycle(voltage, chargeT, dischargeT); });
          return;
        } else {
          app.log(t('ag_ol_maxed'), 'err');
        }
      }

      if (S.autoEscalating && !S.latestOL) {
        app.log(`${ILIM_STEPS[S.currentIlimIdx]} ${t('ag_valid_ok')}`, 'ok');
        S.autoEscalating = false;
      }

      logResult(raw, voltage, chargeT);
      doDischarge(dischargeT);
    }
  }, 200);
}

function logResult(raw, voltage, chargeT) {
  const thickness  = parseFloat(document.getElementById('ag_thickness')?.value) || 1.0;
  const ilimLbl    = S.mode === 'VOL' ? ILIM_STEPS[S.currentIlimIdx] : (document.getElementById('ag_ilimit')?.value || '500uA');
  const sample     = document.getElementById('ag_sample')?.value || 'Sample';
  const electrode  = 50; // mm (fixed)
  let resistivity  = null, unit = '';
  const isOL       = raw === null || (raw !== null && raw > OL_THRESHOLD);

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

  S.rows.push({
    no: S.rows.length + 1, sample,
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
    app.log(`${t('ag_meas_done')} Raw=${raw?.toExponential(3) ?? 'N/A'} Ω  ρ=${resistivity?.toExponential(3) ?? 'N/A'} ${unit}  [${ilimLbl}]`, 'ok');
  }
}

function doDischarge(dischargeT, onDone) {
  app.serial.sendCmd(':OUTP OFF\r\n');
  if (dischargeT <= 0) { (onDone ?? finishOne)(); return; }
  let elapsed = 0;
  app._setDisplay('🔋 DISCH', '', 'stabilizing', 'DISCHARGING');
  S.timer = setInterval(() => {
    elapsed++;
    const d = document.getElementById('ag_timerDisp');
    if (d) d.textContent = `${t('ag_discharging')} ${elapsed} / ${dischargeT}s`;
    if (elapsed >= dischargeT) { clearInterval(S.timer); (onDone ?? finishOne)(); }
  }, 1000);
}

function finishOne() {
  S.running = false;
  document.getElementById('ag_btnStart').disabled = false;
  document.getElementById('ag_btnStop').disabled  = true;
  const d = document.getElementById('ag_timerDisp');
  if (d) d.textContent = t('ag_done_wait');
  app._setDisplay('DONE', '', 'ready', 'READY');
}

function stopMeas() {
  clearInterval(S.timer); S.timer = null; S.running = false;
  S.autoEscalating = false;
  app.serial.sendCmd(':OUTP OFF\r\n');
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
  const cols = ['No','Sample','Mode','Volt','I-Lim','Charge(s)','Thick(mm)','Raw(Ω)','Resistivity','Unit','OL'];
  const lines = [cols.join('\t'), ...S.rows.map(r => [
    r.no, r.sample, r.mode, r.volt, r.ilim, r.charge, r.thick,
    r.raw ?? '', r.resistivity?.toExponential(3) ?? '', r.unit, r.ol ? 'OL' : '',
  ].join('\t'))];
  navigator.clipboard.writeText(lines.join('\n')).then(() => app.log(t('clipboard_ok'), 'ok'));
}

function exportCSV() {
  const cols = ['No','Sample','Mode','Volt','I-Lim','Charge(s)','Thick(mm)','Raw(Ohm)','Resistivity','Unit','OL'];
  const rows = [cols, ...S.rows.map(r => [
    r.no, r.sample, r.mode, r.volt, r.ilim, r.charge, r.thick,
    r.raw ?? '', r.resistivity?.toExponential(3) ?? '', r.unit, r.ol ? 'OL' : '',
  ])];
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })),
    download: `Agilent4339B_${dateStr()}.csv`,
  });
  a.click(); URL.revokeObjectURL(a.href);
  app.log(t('csv_ok'), 'ok');
}

function renderTable() {
  const tbody = document.getElementById('agBody');
  if (!tbody) return;
  tbody.innerHTML = S.rows.map((r, i) => `<tr class="${r.ol ? 'ag-row-ol' : ''}">
    <td class="cchk"><input type="checkbox" class="ag-row-chk" data-idx="${i}"></td>
    <td class="num">${r.no}</td><td>${r.sample}</td><td>${r.mode}</td>
    <td class="num">${r.volt}</td><td>${r.ilim}</td>
    <td class="num">${r.charge}</td><td class="num">${r.thick}</td>
    <td class="num accent">${r.ol ? '<span style="color:var(--warn);">OL</span>' : (r.raw?.toExponential(3) ?? '—')}</td>
    <td class="num accent">${r.resistivity?.toExponential(3) ?? '—'}</td>
    <td>${r.unit}</td>
  </tr>`).join('');
  const wrap = tbody.closest('.table-wrap');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
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
  const vals = S.rows.filter(r => r.resistivity !== null && !r.ol).map(r => r.resistivity);
  if (!vals.length) { if (emptyEl) emptyEl.style.display = ''; return; }
  if (emptyEl) emptyEl.style.display = 'none';
  const logs   = vals.map(v => Math.log10(Math.abs(v)));
  const minLog = Math.floor(Math.min(...logs)) - 0.5;
  const maxLog = Math.ceil(Math.max(...logs))  + 0.5;
  const spanLog = maxLog - minLog || 1;
  const padT = 20, padB = 40, padL = 54, padR = 16;
  const cH = H - padT - padB, totalW = W - padL - padR;
  const bW = Math.max(8, Math.min(28, totalW / (vals.length + 1) - 4));
  const toY = v => padT + (1 - (v - minLog) / spanLog) * cH;
  const cs = getComputedStyle(document.body);
  const C = {
    text:    cs.getPropertyValue('--chart-text').trim()    || '#5e7790',
    grid:    cs.getPropertyValue('--chart-grid').trim()    || 'rgba(31,59,86,.5)',
    boxFill: cs.getPropertyValue('--chart-box-fill').trim()|| 'rgba(43,143,255,.12)',
    boxStr:  cs.getPropertyValue('--chart-box-str').trim() || '#2b8fff',
  };
  ctx.fillStyle = C.text;
  ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
  for (let e = Math.ceil(minLog); e <= Math.floor(maxLog); e++) {
    const y = toY(e);
    ctx.fillText(`10^${e}`, padL - 4, y + 4);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
  }
  vals.forEach((v, i) => {
    const lv = Math.log10(Math.abs(v));
    const x  = padL + (i + 0.5) * totalW / vals.length - bW / 2;
    // bar fill: use accent with some opacity
    ctx.fillStyle = C.boxFill.replace(',.12)', ',.6)').replace(',.10)', ',.5)');
    ctx.strokeStyle = C.boxStr; ctx.lineWidth = 1;
    ctx.fillRect(x, toY(lv), bW, toY(minLog) - toY(lv));
    ctx.strokeRect(x, toY(lv), bW, toY(minLog) - toY(lv));
    ctx.fillStyle = C.text; ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x + bW / 2, H - padB + 14);
  });
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd   = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  if (statsEl) statsEl.innerHTML = [
    ['n', vals.length], ['Min', vals[0].toExponential(2)],
    ['Max', vals[vals.length - 1].toExponential(2)],
    ['Mean', mean.toExponential(2)], ['σ', sd.toExponential(2)],
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
    init();
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
          <button class="sbtn" onclick="app.instr.copyData()">${t('btn_copy')}</button>
          <button class="sbtn green" onclick="app.instr.exportCSV()">${t('btn_csv')}</button>
          <button class="sbtn red" onclick="app.instr.deleteSel()">DELETE SEL</button>
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
  },

  onLine(line) {
    if (!S) return;
    if (/OL|9\.9[0-9]*E\+37/i.test(line)) {
      S.latestVal = 9.9e37;
      return;
    }
    const m = line.match(/([+-]?\d+\.?\d*[Ee][+-]?\d+)/);
    if (m) {
      const v = parseFloat(m[1]);
      app._setDisplay(v.toExponential(3), 'Ω');
      S.latestVal = v;
    }
  },

  onDisconnect() { if (S?.running) stopMeas(); },

  // Exposed for inline onclick handlers
  showModeModal, applyMode, showSOPModal,
  onAutoVoltChange, calcAutoVoltage,
  startMeas, stopMeas,
  toggleAll, deleteSel, clearData, copyData, exportCSV,
};
