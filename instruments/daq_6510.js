import { syslogPanelHTML, fmt, dateStr } from './_utils.js';

// ── Module-level state (reset on each launch) ─────────────────────────────────
let S = null;

function init() {
  S = {
    running: false,
    scanTimer: null,
    rows: [],
    channels: [],   // [{slot, ch, chId, name, selected}]
    wire: 4,
    currentTab: 'table',
  };
}

// helper
const t = k => app?.t(k) ?? k;

// ── Channel parsing ───────────────────────────────────────────────────────────
function parseRange(str, slot) {
  if (!str?.trim()) return [];
  const m = str.trim().match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return [];
  const start = parseInt(m[1]), end = parseInt(m[2] ?? m[1]);
  const chs = [];
  for (let i = start; i <= Math.min(end, 20); i++) {
    const chId = `${slot}${i < 10 ? '0' + i : i}`;
    chs.push({ slot, ch: i, chId, name: `CH${chId}`, selected: true });
  }
  return chs;
}

function buildChannels() {
  const s1 = document.getElementById('daq_s1')?.value || '';
  const s2 = document.getElementById('daq_s2')?.value || '';
  const prev = {};
  S.channels.forEach(c => { prev[c.chId] = { name: c.name, selected: c.selected }; });
  S.channels = [...parseRange(s1, 1), ...parseRange(s2, 2)];
  S.channels.forEach(c => {
    if (prev[c.chId]) { c.name = prev[c.chId].name; c.selected = prev[c.chId].selected; }
  });
}

// ── Channel list rendering (inside graph tabs) ────────────────────────────────
function renderChList(slot) {
  const el = document.getElementById(`daqS${slot}ChList`);
  if (!el) return;
  const slotChs = S.channels.filter(c => c.slot === slot);
  const allChk = document.getElementById(`daqS${slot}All`);
  if (allChk) allChk.checked = slotChs.length > 0 && slotChs.every(c => c.selected);

  const lastRow = S.rows[S.rows.length - 1];
  el.innerHTML = slotChs.map((c) => {
    const gi = S.channels.indexOf(c);
    const val = lastRow?.values?.[gi];
    const valStr = (val !== undefined && !isNaN(val)) ? fmt(val) : '—';
    return `<div class="daq-ch-row">
      <input type="checkbox" class="daq-ch-chk" ${c.selected ? 'checked' : ''}
             onchange="app.instr.onChkChange(${slot}, ${gi}, this.checked)">
      <input type="text" class="daq-ch-nameinp" value="${c.name.replace(/"/g, '&quot;')}"
             oninput="app.instr.setChName(${gi}, this.value)"
             onchange="app.instr.applyChNameChange()">
      <span class="daq-ch-curval">${valStr}</span>
      <span class="daq-ch-unit">Ω</span>
    </div>`;
  }).join('');
}

function onChkChange(slot, gi, checked) {
  if (S.channels[gi]) S.channels[gi].selected = checked;
  const slotChs = S.channels.filter(c => c.slot === slot);
  const allChk = document.getElementById(`daqS${slot}All`);
  if (allChk) allChk.checked = slotChs.every(c => c.selected);
  drawChart(slot);
}

function toggleSlotAll(slot, checked) {
  S.channels.filter(c => c.slot === slot).forEach(c => c.selected = checked);
  renderChList(slot);
  drawChart(slot);
}

function setChName(gi, name) {
  if (S.channels[gi]) S.channels[gi].name = name;
}

function applyChNameChange() {
  buildTableHeader();
}

// ── Data table ────────────────────────────────────────────────────────────────
const TH = 'white-space:nowrap;padding:8px 10px;background:var(--panel-2);color:var(--text-dim);font-size:11px;border-bottom:1px solid var(--border);text-align:right;position:sticky;top:0;z-index:1;';

function buildTableHeader() {
  const head = document.getElementById('daqTableHead');
  if (!head) return;
  head.innerHTML = `<th style="${TH};text-align:left;">Time</th>` +
    S.channels.map((c, i) => `<th style="${TH}" data-ci="${i}">${c.name}</th>`).join('');
}

function appendTableRow(row) {
  const tbody = document.getElementById('daqTableBody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  const td0 = document.createElement('td');
  td0.style.cssText = 'white-space:nowrap;padding:5px 10px;font-family:var(--mono);font-size:11.5px;color:var(--text-dim);border-bottom:1px solid var(--border);';
  td0.textContent = row.time;
  tr.appendChild(td0);
  row.values.forEach(v => {
    const td = document.createElement('td');
    td.style.cssText = 'text-align:right;padding:5px 10px;font-family:var(--mono);font-size:12px;color:var(--cyan);border-bottom:1px solid var(--border);border-left:1px solid var(--border);';
    td.textContent = isNaN(v) ? '—' : fmt(v);
    tr.appendChild(td);
  });
  tbody.appendChild(tr);
  const wrap = tbody.closest('.table-wrap');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

// ── Chart ─────────────────────────────────────────────────────────────────────
function drawChart(slotFilter) {
  [1, 2].forEach(slot => {
    if (slotFilter !== undefined && slot !== slotFilter) return;
    const canvas  = document.getElementById(`daqChart${slot}`);
    const emptyEl = document.getElementById(`daqChart${slot}Empty`);
    if (!canvas || canvas.closest('[hidden]')) return;

    canvas.width  = canvas.offsetWidth  || 400;
    canvas.height = canvas.offsetHeight || 240;
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const slotChs = S.channels.filter(c => c.slot === slot && c.selected);
    const scanMode = document.getElementById('daq_scanmode')?.value || 'full3m';
    const rows = scanMode === 'realtime' ? S.rows.slice(-1000) : S.rows;

    if (!slotChs.length || !rows.length) { if (emptyEl) emptyEl.style.display = ''; return; }
    if (emptyEl) emptyEl.style.display = 'none';

    const chIdx = slotChs.map(c => S.channels.indexOf(c));
    const colors = ['#3fb6e8','#2b8fff','#22b06a','#f59e0b','#e8554e','#a78bfa','#fb7185','#34d399','#fbbf24','#60a5fa'];
    const allVals = rows.flatMap(r => chIdx.map(ci => r.values[ci]).filter(v => !isNaN(v)));
    if (!allVals.length) { if (emptyEl) emptyEl.style.display = ''; return; }

    const mn = Math.min(...allVals), mx = Math.max(...allVals), span = mx - mn || 1;
    const padT = 16, padB = 32, padL = 60, padR = 12;
    const cH = H - padT - padB, cW = W - padL - padR;
    const toY = v => padT + (1 - (v - mn) / span) * cH;
    const toX = i => padL + (i / (rows.length - 1 || 1)) * cW;

    const textMut = getComputedStyle(document.body).getPropertyValue('--text-mut').trim() || '#5e7790';
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border').trim() || 'rgba(31,59,86,.5)';
    ctx.lineWidth = 1;
    [mn, (mn + mx) / 2, mx].forEach(v => {
      const y = toY(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = textMut; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
      ctx.fillText(fmt(v), padL - 3, y + 4);
    });

    slotChs.forEach((c, ci) => {
      const gi = chIdx[ci];
      const color = colors[ci % colors.length];
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([]);
      ctx.beginPath();
      let started = false;
      rows.forEach((r, ri) => {
        const v = r.values[gi];
        if (isNaN(v)) { started = false; return; }
        if (!started) { ctx.moveTo(toX(ri), toY(v)); started = true; }
        else ctx.lineTo(toX(ri), toY(v));
      });
      ctx.stroke();

      const lx = padL + ci * 72;
      if (lx + 60 < W) {
        ctx.fillStyle = color; ctx.fillRect(lx, H - padB + 9, 12, 2);
        ctx.fillStyle = textMut; ctx.font = '10px Inter'; ctx.textAlign = 'left';
        ctx.fillText(c.name, lx + 16, H - padB + 13);
      }
    });
  });
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function showTab(tab) {
  ['table', 'slot1', 'slot2'].forEach(id => {
    const el  = document.getElementById(`daqTabContent_${id}`);
    const btn = document.getElementById(`daqTabBtn_${id}`);
    if (el)  el.hidden = (id !== tab);
    if (btn) btn.classList.toggle('active', id === tab);
  });
  S.currentTab = tab;
  if (tab === 'slot1') { renderChList(1); drawChart(1); }
  if (tab === 'slot2') { renderChList(2); drawChart(2); }
}

// ── Channel name modal ────────────────────────────────────────────────────────
function showChNamesModal() {
  buildChannels();
  window._daqTmpN = S.channels.map(c => c.name);
  const html = S.channels.length
    ? S.channels.map((c, i) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="font-size:11px;color:var(--text-mut);width:50px;font-family:var(--mono);">${c.chId}</span>
        <input class="inp" style="flex:1;" type="text" value="${c.name.replace(/"/g,'&quot;')}"
               oninput="_daqTmpN[${i}]=this.value">
      </div>`)
      .join('')
    : `<p style="color:var(--text-dim);text-align:center;padding:20px;">${t('daq_ch_modal_no_slot')}</p>`;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay'; modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-box" style="width:340px;">
      <div class="modal-title ok">${t('daq_ch_modal_title')}</div>
      <div style="max-height:340px;overflow-y:auto;">${html}</div>
      <button class="big-btn green" style="margin-top:12px;"
              onclick="app.instr.applyChNamesModal(); this.closest('.modal-overlay').remove();">${t('daq_ch_ok')}</button>
      <button class="big-btn" style="margin-top:4px;"
              onclick="this.closest('.modal-overlay').remove();">${t('daq_ch_cancel')}</button>
    </div>`;
  document.body.appendChild(modal);
}

function applyChNamesModal() {
  (window._daqTmpN || []).forEach((name, i) => {
    if (S.channels[i]) S.channels[i].name = name;
  });
  window._daqTmpN = null;
  buildTableHeader();
  renderChList(1); renderChList(2);
}

function updateRightPanel() {}

// ── Wire mode ─────────────────────────────────────────────────────────────────
function setWire(n) {
  S.wire = n;
  document.getElementById('daq_wire2')?.classList.toggle('active', n === 2);
  document.getElementById('daq_wire4')?.classList.toggle('active', n === 4);
}

// ── Start / Stop ──────────────────────────────────────────────────────────────
function start() {
  if (!app.serial.isConnected) { alert(t('daq_connect_first')); return; }
  buildChannels();
  S.rows = []; app.count = 0; app._updateCount();
  buildTableHeader();
  document.getElementById('daqTableBody').innerHTML = '';
  renderChList(1); renderChList(2);

  const scanMode  = document.getElementById('daq_scanmode')?.value || 'full3m';
  const intervalMs = scanMode === 'realtime' ? 1000 : 180_000;
  const func = S.wire === 4 ? 'FRES' : 'RES';
  const chs  = S.channels.map(c => c.chId);

  app.serial.sendCmd('*RST\r\n');
  setTimeout(() => app.serial.sendCmd('SYST:REM\r\n'), 300);
  setTimeout(() => {
    if (chs.length) {
      app.serial.sendCmd(`SENS:FUNC "${func}", (@${chs.join(',')})\r\n`);
      setTimeout(() => app.serial.sendCmd(`ROUT:SCAN (@${chs.join(',')})\r\n`), 300);
    }
  }, 600);

  setTimeout(() => {
    S.running = true;
    document.getElementById('daq_btnStart').disabled = true;
    document.getElementById('daq_btnStop').disabled  = false;
    const disp = document.getElementById('daq_statusDisp');
    if (disp) disp.textContent = scanMode === 'realtime' ? t('daq_rt_running') : t('daq_full_running');
    app._setDisplay('— — —', 'Ω', 'ready', 'LOGGING');
    S.scanTimer = setInterval(() => {
      if (app.serial.isConnected) app.serial.sendCmd(':READ?\r\n');
    }, intervalMs);
    const modeStr = scanMode === 'realtime' ? t('daq_start_log_rt') : t('daq_start_log_full');
    app.log(`${t('daq_start_log')} ${modeStr}  CH: ${chs.join(', ')}`, 'ok');
  }, 1200);
}

function stop() {
  clearInterval(S.scanTimer); S.scanTimer = null; S.running = false;
  app.serial.sendCmd('ROUT:SCAN:LSEL NONE\r\n');
  document.getElementById('daq_btnStart').disabled = false;
  document.getElementById('daq_btnStop').disabled  = true;
  const disp = document.getElementById('daq_statusDisp');
  if (disp) disp.textContent = t('daq_stopped');
  app._setDisplay('STOP', '', 'off', 'STOPPED');
  app.log(t('daq_stop_log'), 'warn');
}

// ── Line handler ──────────────────────────────────────────────────────────────
function onLine(line) {
  if (!S?.running) return;
  const parts = line.split(',').map(s => {
    const m = s.match(/([+-]?\d+\.?\d*[Ee][+-]?\d+)/);
    return m ? parseFloat(m[1]) : NaN;
  });
  if (!parts.some(v => !isNaN(v))) return;

  const ts  = new Date().toTimeString().slice(0, 8);
  const row = { time: ts, values: parts };
  S.rows.push(row);
  app.count++; app._updateCount();
  appendTableRow(row);

  if (S.currentTab === 'slot1') { renderChList(1); drawChart(1); }
  if (S.currentTab === 'slot2') { renderChList(2); drawChart(2); }

  const v = parts.find(x => !isNaN(x));
  if (v !== undefined) app._setDisplay(fmt(v), 'Ω');
}

// ── Export / Clear ────────────────────────────────────────────────────────────
function exportCSV() {
  if (!S.rows.length) { app.log(t('daq_no_data_log'), 'warn'); return; }
  const cols = ['Time', ...S.channels.map(c => c.name)];
  const rows = [cols, ...S.rows.map(r => [r.time, ...r.values.map(v => isNaN(v) ? '' : v.toExponential(4))])];
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })),
    download: `DAQ6510_${dateStr()}.csv`,
  });
  a.click(); URL.revokeObjectURL(a.href);
  app.log(t('daq_csv_ok'), 'ok');
}

function clearData() {
  if (!confirm(t('daq_clear_confirm'))) return;
  S.rows = []; app.count = 0; app._updateCount();
  document.getElementById('daqTableBody').innerHTML = '';
  renderChList(1); renderChList(2);
  app.log(t('daq_cleared'));
}

// ── Slot graph tab HTML ───────────────────────────────────────────────────────
function slotTabHTML(slot) {
  return `
    <div style="display:flex;flex:1;min-height:0;gap:0;">
      <!-- Left: channel list -->
      <div class="daq-chpanel" style="max-height:none;flex-shrink:0;width:220px;border-bottom:none;border-right:1px solid var(--border);display:flex;flex-direction:column;">
        <div class="daq-ch-hdr">
          <label class="daq-ch-allsel">
            <input type="checkbox" id="daqS${slot}All" checked
                   onchange="app.instr.toggleSlotAll(${slot}, this.checked)">
            ${t('daq_select_all')}
          </label>
        </div>
        <div id="daqS${slot}ChList" class="daq-chlist" style="flex:1;overflow-y:auto;"></div>
      </div>
      <!-- Right: graph -->
      <div class="graph-area" style="flex:1;min-width:0;min-height:0;position:relative;">
        <canvas id="daqChart${slot}"></canvas>
        <div class="graph-empty" id="daqChart${slot}Empty">${t('daq_no_chart')}</div>
      </div>
    </div>`;
}

// ── Exported instrument module ────────────────────────────────────────────────
export default {
  name: 'DAQ-6510',
  icon: 'assets/Daq_6510.png',
  category: 'Instrument',
  viewType: 'custom',
  serial: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },

  buildSidebar(el) {
    init();
    el.innerHTML = `<div class="sidebar-top">
      <div class="panel">
        <div class="field-label">${t('daq_visa_label')}</div>
        <select id="portSelect" class="inp port-sel">
          <option value="USB0::0x05E6::0x6510::04632710::INSTR">${t('daq_visa_opt1')}</option>
          <option value="USB0::0x05E6::0x6510::04544808::INSTR">${t('daq_visa_opt2')}</option>
        </select>
        <div id="connStatus" class="conn-status-lbl" style="margin-top:6px;">Disconnected</div>
        <button id="btnConnect" class="big-btn" onclick="app.toggleConnection()">${t('conn_btn')}</button>
      </div>

      <div class="panel">
        <div class="panel-title">${t('daq_config_section')}</div>
        <label class="fl" style="margin-top:0;">${t('daq_filename')}</label>
        <input type="text" id="daq_filename" class="inp" value="DAQ_Data.csv">
        <label class="fl">${t('daq_total_time')}</label>
        <input type="text" id="daq_totaltime" class="inp" value="90h" placeholder="90h, 24h">
        <label class="fl">${t('daq_ch_delay')}</label>
        <input type="number" id="daq_delay" class="inp" value="2" min="0" step="1">
        <div class="param-grid" style="margin-top:4px;">
          <div>
            <label class="fl">${t('daq_slot1_ch')}</label>
            <input type="text" id="daq_s1" class="inp" value="1-10" placeholder="1-10">
          </div>
          <div>
            <label class="fl">${t('daq_slot2_ch')}</label>
            <input type="text" id="daq_s2" class="inp" value="" placeholder="${t('daq_slot2_ph')}">
          </div>
        </div>
        <label class="fl">${t('daq_scan_mode')}</label>
        <select id="daq_scanmode" class="inp">
          <option value="realtime">${t('daq_scan_rt')}</option>
          <option value="full3m" selected>${t('daq_scan_full')}</option>
        </select>
        <label class="fl">${t('daq_wire_mode')}</label>
        <div class="toggle-row">
          <button class="toggle-btn" id="daq_wire2" onclick="app.instr.setWire(2)">2-Wire</button>
          <button class="toggle-btn active" id="daq_wire4" onclick="app.instr.setWire(4)">4-Wire</button>
        </div>
        <button class="manage-btn" style="margin-top:8px;" onclick="app.instr.showChNamesModal()">${t('daq_ch_names_btn')}</button>
      </div>

      <div class="panel">
        <div id="daq_statusDisp" class="ag-timer-disp" style="margin:0 0 8px;">${t('daq_wait')}</div>
        <button id="daq_btnStart" class="big-btn green" onclick="app.instr.start()">${t('daq_start_btn')}</button>
        <button id="daq_btnStop" class="big-btn danger" onclick="app.instr.stop()" disabled>${t('daq_stop_btn')}</button>
      </div>
    </div>${syslogPanelHTML()}`;
  },

  buildCenter(el) {
    el.innerHTML = `
      <div class="display-bar">
        <div class="disp-value"><span id="liveValue">— — —</span><span class="disp-unit" id="liveUnit">Ω</span></div>
        <div class="disp-meta">
          <span id="liveStatus" class="disp-status off">${t('disconnected')}</span>
          <span class="meas-count">${t('daq_rec_count')} <b id="measCount">0</b></span>
        </div>
      </div>
      <div class="daq-tabbar">
        <button class="daq-tab active" id="daqTabBtn_table" onclick="app.instr.showTab('table')">${t('daq_data_tab')}</button>
        <button class="daq-tab" id="daqTabBtn_slot1"  onclick="app.instr.showTab('slot1')">${t('daq_slot1_tab')}</button>
        <button class="daq-tab" id="daqTabBtn_slot2"  onclick="app.instr.showTab('slot2')">${t('daq_slot2_tab')}</button>
        <div style="margin-left:auto;display:flex;gap:6px;">
          <button class="sbtn green" onclick="app.instr.exportCSV()">${t('btn_csv')}</button>
          <button class="sbtn red"   onclick="app.instr.clearData()">${t('btn_clear')}</button>
        </div>
      </div>

      <!-- Table tab -->
      <div id="daqTabContent_table" class="panel grow" style="min-height:0;">
        <div class="table-wrap" style="flex:1;overflow:auto;border:1px solid var(--border);border-radius:8px;">
          <table id="daqTable" style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr id="daqTableHead"></tr></thead>
            <tbody id="daqTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Slot 1 graph tab -->
      <div id="daqTabContent_slot1" class="panel grow" style="min-height:0;display:flex;flex-direction:row;padding:0;overflow:hidden;" hidden>
        ${slotTabHTML(1)}
      </div>

      <!-- Slot 2 graph tab -->
      <div id="daqTabContent_slot2" class="panel grow" style="min-height:0;display:flex;flex-direction:row;padding:0;overflow:hidden;" hidden>
        ${slotTabHTML(2)}
      </div>`;
  },

  buildRightPanel(el) {
    el.innerHTML = '';
    el.style.display = 'none';
    const layout = document.getElementById('layout');
    if (layout) layout.style.gridTemplateColumns = 'var(--sidebar-w) 1fr';
  },

  onLine,
  onDisconnect() {
    if (S?.running) stop();
    const rp = document.getElementById('rightpanel');
    if (rp) rp.style.display = '';
    const layout = document.getElementById('layout');
    if (layout) layout.style.gridTemplateColumns = '';
  },

  // Exposed for inline onclick handlers
  setWire, start, stop, showTab, showChNamesModal, applyChNamesModal,
  onChkChange, toggleSlotAll, setChName, applyChNameChange, exportCSV, clearData,
};
