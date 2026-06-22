import { syslogPanelHTML, fmt, dateStr } from './_utils.js';

// ── Module-level state (reset on each launch) ─────────────────────────────────
let S = null;

function init() {
  S = {
    running: false,
    scanTimer: null,       // FRONT setInterval 핸들
    autoStopTimer: null,
    rows: [],
    channels: [],          // [{slot, ch, chId, name, selected}]
    wire: 4,
    terminal: 'REAR',      // 'FRONT' | 'REAR'
    currentTab: 'table',
    _waitForData: false,   // FRONT READ? 응답 대기 중 플래그
    _chList: '',
    _nCh: 0,
    // ── REAR 스캔 (ROUT:SCAN + INIT + TRAC:ACT? 폴링 + TRAC:DATA?) ──
    _scanRow: [],          // 한 사이클 값 누적
    _graphLastAt: 0,       // 마지막 그래프 렌더 시각 (Date.now())
    _startTime: 0,         // 측정 시작 시각 (Date.now())
    _waitingData: false,   // 최종 TRAC:DATA? 응답 대기 (폴링 미사용 시)
    _polling: false,       // TRAC:ACT? 폴링 진행 중
    _pollPhase: '',        // 'act' | 'data'
    _pollCount: 0,         // 현재까지 버퍼에 쌓인 채널 수
    _pollTimer: null,      // 다음 폴링 setTimeout 핸들
    _cycleTimer: null,     // 다음 사이클 setTimeout 핸들
    _scanWaitTimer: null,  // INIT 후 첫 폴링까지 대기 타이머
    _displayCycleTimer: null,
    _cycleStartTime: 0,    // 현재 사이클 시작 시각
    _stopping: false,      // ABOR~*CLS 구간 플래그 (잔여 에러 로그 억제용)
    _stopPending: false,   // 사이클 완료 후 정지 예약 플래그
    _pendingStart: false,  // start() 대기 중 플래그 — stop()이 취소 가능
    _startupPhase: 0,      // 0=idle, 1=*RST 후 *OPC? 대기 중
    _startupOpcTimer: null,// *OPC? 타임아웃 폴백 핸들
    _savedFunc: '',        // _finishRearSetup 에서 쓸 저장값
    _savedDelayS: 2,
    _slotDetecting: 0,     // 0=없음, 1=SYST:CARDn:IDN? 응답 대기
    _slotTimeout: null,    // detectSlots 타임아웃 핸들
    _hasSlot1: false,      // 슬롯1 카드 감지 여부
    _hasSlot2: false,      // 슬롯2 카드 감지 여부
  };
}

// helper
const t = k => app?.t(k) ?? k;

// 채널 info 패널 갱신 헬퍼
function _updateLivePanel(ch, v) {
  app._setDisplay(isFinite(v) ? fmt(v) : 'OL', 'Ω');
  const slotEl = document.getElementById('daq_liveSlot');
  const chEl   = document.getElementById('daq_liveCh');
  const nameEl = document.getElementById('daq_liveName');
  if (slotEl) slotEl.textContent = `SLOT ${ch.slot}`;
  if (chEl)   chEl.textContent   = `CH ${ch.chId}`;
  if (nameEl) nameEl.textContent = ch.name || `CH${ch.chId}`;
}

// TRAC:ACT? 로 버퍼 내 읽기 수를 확인 → 새 채널 있으면 TRAC:DATA? 로 값 수신
function _doPollAct() {
  if (!S?.running) return;
  S._polling   = true;
  S._pollPhase = 'act';
  app.serial.sendCmd('TRAC:ACT? "defbuffer1"\r\n');
}

// 스캔 사이클 완료 처리: 테이블 추가 + 그래프 + 다음 사이클 스케줄
function _finalizeScanCycle(vals) {
  S._polling = false;
  S._pollPhase = '';
  const scanModeNow = document.getElementById('daq_scanmode')?.value || 'full3m';

  const ts  = new Date().toTimeString().slice(0, 8);
  const hrs = (Date.now() - (S._startTime || Date.now())) / 3600000;
  const row = { time: ts, hrs, values: vals };
  S.rows.push(row);
  app.count++; app._updateCount();
  appendTableRow(row);

  // 그래프 갱신:
  // - realtime: 매 사이클 갱신 (최근 1000개는 drawChart 내에서 slice)
  // - full3m: 3분마다만 갱신
  const nowMs = Date.now();
  const graphEveryMs = scanModeNow === 'full3m' ? 180000 : 0;
  if (nowMs - S._graphLastAt >= graphEveryMs) {
    S._graphLastAt = nowMs;
    if (S.currentTab === 'slot1') { renderChList(1); drawChart(1); }
    if (S.currentTab === 'slot2') { renderChList(2); drawChart(2); }
  }
  app.log(`[DAQ] 사이클 완료 | ${vals.map((v, i) => `CH${S.channels[i]?.chId ?? i}: ${isFinite(v) ? fmt(v) + 'Ω' : 'OL'}`).join(' / ')}`, 'ok');

  // 정지 예약된 경우 → 사이클 완료 후 안전 정지
  if (S._stopPending) {
    _doStop();
    return;
  }

  // 두 모드 모두 즉시 다음 사이클 시작 (1초 대기)
  S._cycleTimer = setTimeout(doScanCycle, 1000);
}

// REAR 스캔 사이클: TRAC:CLE → INIT → TRAC:ACT? 폴링으로 채널별 실시간 표시
function doScanCycle() {
  if (!S?.running || !app.serial.isConnected) return;
  const nCh = S.channels.length;
  if (!nCh) return;

  clearTimeout(S._displayCycleTimer);
  clearTimeout(S._pollTimer);
  S._scanRow       = new Array(nCh).fill(Infinity);
  S._pollCount     = 0;
  S._polling       = false;
  S._pollPhase     = '';
  S._pollTargetIdx = -1;
  S._waitingData   = false;
  S._cycleStartTime = Date.now();

  const infoEl = document.getElementById('daq_liveInfo');
  if (infoEl) infoEl.style.display = 'flex';
  const slotEl = document.getElementById('daq_liveSlot');
  const chEl   = document.getElementById('daq_liveCh');
  const nameEl = document.getElementById('daq_liveName');
  if (slotEl) slotEl.textContent = 'SCANNING';
  if (chEl)   chEl.textContent   = `${nCh}ch`;
  if (nameEl) nameEl.textContent = '';

  const delayMs = Math.round((S._savedDelayS || 2) * 1000);

  app.serial.sendCmd('TRAC:CLE "defbuffer1"\r\n');
  setTimeout(() => {
    if (!S?.running) return;
    app.serial.sendCmd('INIT\r\n');
    // 첫 채널 완료 예상 직후에 첫 ACT? 폴링 시작
    S._scanWaitTimer = setTimeout(_doPollAct, delayMs + 100);
  }, 200);
}

// ── Channel parsing ───────────────────────────────────────────────────────────
function parseRange(str, slot) {
  if (!str?.trim()) return [];
  const chs = [];
  const seen = new Set();
  for (const part of str.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const start = parseInt(m[1]), end = parseInt(m[2] ?? m[1]);
    if (start < 1 || end < 1) continue;
    for (let i = start; i <= Math.min(end, 20); i++) {
      if (seen.has(i)) continue;
      seen.add(i);
      const chId = `${slot}${i < 10 ? '0' + i : i}`;
      chs.push({ slot, ch: i, chId, name: `CH${chId}`, selected: true });
    }
  }
  return chs;
}

function buildChannels() {
  const el1 = document.getElementById('daq_s1');
  const el2 = document.getElementById('daq_s2');
  // disabled = 카드 없음 → 해당 슬롯 채널 제외
  const s1 = (!el1 || el1.disabled) ? '' : (el1.value || '');
  const s2 = (!el2 || el2.disabled) ? '' : (el2.value || '');
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

    canvas.width  = canvas.offsetWidth  || 600;
    canvas.height = canvas.offsetHeight || 300;
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const slotChs = S.channels.filter(c => c.slot === slot && c.selected);
    const scanModeChart = document.getElementById('daq_scanmode')?.value || 'full3m';
    const rows = scanModeChart === 'realtime' ? S.rows.slice(-1000) : S.rows;

    if (!slotChs.length || !rows.length) { if (emptyEl) emptyEl.style.display = ''; return; }
    if (emptyEl) emptyEl.style.display = 'none';

    const chIdx = slotChs.map(c => S.channels.indexOf(c));
    const colors = ['#3fb6e8','#2b8fff','#22b06a','#f59e0b','#e8554e','#a78bfa','#fb7185','#34d399','#fbbf24','#60a5fa'];
    const allVals = rows.flatMap(r => chIdx.map(ci => r.values[ci]).filter(v => isFinite(v)));
    if (!allVals.length) { if (emptyEl) emptyEl.style.display = ''; return; }

    const mn = Math.min(...allVals), mx = Math.max(...allVals), span = mx - mn || 1;
    const padT = 20, padB = 44, padL = 80, padR = 20;
    const cH = H - padT - padB, cW = W - padL - padR;

    // X축: 동적 스케일
    // - 1000행 미만: 실제 데이터 범위에 맞춤 (초기 데이터가 잘 보이도록)
    // - 1000행 이상: 1시간 단위 ceiling으로 성장 (0→1h→2h→...)
    const lastHrs = rows.length > 0 ? (rows[rows.length - 1].hrs || 0) : 0;
    const xMaxHrs = rows.length < 1000
      ? Math.max(lastHrs * 1.05, 1 / 60)          // auto-fit + 5% 여백, 최소 1분
      : Math.max(Math.ceil(lastHrs), 1);            // 1시간 단위 ceiling
    const toY = v => padT + (1 - (v - mn) / span) * cH;
    const toX = row => padL + ((row.hrs || 0) / xMaxHrs) * cW;

    const textMut = getComputedStyle(document.body).getPropertyValue('--text-mut').trim() || '#5e7790';
    const borderCol = getComputedStyle(document.body).getPropertyValue('--border').trim() || 'rgba(31,59,86,.5)';

    // Y축 그리드 + 라벨
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    const numY = 4;
    for (let i = 0; i <= numY; i++) {
      const v = mn + (span / numY) * i;
      const y = toY(v);
      ctx.strokeStyle = borderCol;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = textMut; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
      ctx.fillText(fmt(v), padL - 5, y + 4);
    }

    // X축 그리드 + 시간/분 라벨
    const numX = Math.min(8, Math.max(2, xMaxHrs < 1 ? 6 : Math.ceil(xMaxHrs)));
    const xStep = xMaxHrs / numX;
    ctx.textAlign = 'center';
    for (let i = 0; i <= numX; i++) {
      const h = xStep * i;
      const x = padL + (h / xMaxHrs) * cW;
      ctx.strokeStyle = borderCol;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
      ctx.fillStyle = textMut; ctx.font = '10px JetBrains Mono';
      const lbl = xMaxHrs < 1
        ? `${(h * 60).toFixed(0)}m`
        : `${h.toFixed(h < 10 && xStep < 1 ? 1 : 0)}h`;
      ctx.fillText(lbl, x, H - padB + 14);
    }
    ctx.setLineDash([]);

    // Y축 단위 라벨
    ctx.save();
    ctx.translate(13, padT + cH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = textMut; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'center';
    ctx.fillText('Resistance (Ω)', 0, 0);
    ctx.restore();

    // 데이터 선
    slotChs.forEach((c, ci) => {
      const gi = chIdx[ci];
      const color = colors[ci % colors.length];
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([]);
      ctx.beginPath();
      let started = false;
      rows.forEach(r => {
        const v = r.values[gi];
        if (!isFinite(v)) { started = false; return; }
        const x = toX(r), y = toY(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // 범례
      const lx = padL + ci * 84;
      if (lx + 72 < W) {
        ctx.fillStyle = color; ctx.fillRect(lx, H - padB + 24, 14, 2);
        ctx.fillStyle = textMut; ctx.font = '10px Inter'; ctx.textAlign = 'left';
        ctx.fillText(c.name, lx + 18, H - padB + 28);
      }
    });
  });
}

// ── Front single-channel chart ────────────────────────────────────────────────
function drawChartFront() {
  const canvas  = document.getElementById('daqChartFront');
  const emptyEl = document.getElementById('daqChartFrontEmpty');
  if (!canvas || canvas.closest('[hidden]')) return;

  canvas.width  = canvas.offsetWidth  || 800;
  canvas.height = canvas.offsetHeight || 300;
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const scanModeFront = document.getElementById('daq_scanmode')?.value || 'full3m';
  const rows = scanModeFront === 'realtime' ? S.rows.slice(-1000) : S.rows;
  const allVals = rows.map(r => r.values[0]).filter(v => isFinite(v));
  if (!allVals.length) { if (emptyEl) emptyEl.style.display = ''; return; }
  if (emptyEl) emptyEl.style.display = 'none';

  const mn = Math.min(...allVals), mx = Math.max(...allVals), span = mx - mn || 1;
  const padT = 20, padB = 44, padL = 80, padR = 20;
  const cH = H - padT - padB, cW = W - padL - padR;

  const lastHrsFront = rows.length > 0 ? (rows[rows.length - 1].hrs || 0) : 0;
  const xMaxHrsFront = rows.length < 1000
    ? Math.max(lastHrsFront * 1.05, 1 / 60)
    : Math.max(Math.ceil(lastHrsFront), 1);
  const toY = v => padT + (1 - (v - mn) / span) * cH;
  const toX = r => padL + ((r.hrs || 0) / xMaxHrsFront) * cW;

  const textMut = getComputedStyle(document.body).getPropertyValue('--text-mut').trim() || '#5e7790';
  const borderCol = getComputedStyle(document.body).getPropertyValue('--border').trim() || 'rgba(31,59,86,.5)';

  // Y축 그리드
  ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
  const numY = 4;
  for (let i = 0; i <= numY; i++) {
    const v = mn + (span / numY) * i;
    const y = toY(v);
    ctx.strokeStyle = borderCol;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = textMut; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
    ctx.fillText(fmt(v), padL - 5, y + 4);
  }

  // X축 그리드 + 시간/분 라벨
  const numX = Math.min(8, Math.max(2, xMaxHrsFront < 1 ? 6 : Math.ceil(xMaxHrsFront)));
  const xStep = xMaxHrsFront / numX;
  ctx.textAlign = 'center';
  for (let i = 0; i <= numX; i++) {
    const h = xStep * i;
    const x = padL + (h / xMaxHrsFront) * cW;
    ctx.strokeStyle = borderCol;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
    ctx.fillStyle = textMut; ctx.font = '10px JetBrains Mono';
    const lbl = xMaxHrsFront < 1
      ? `${(h * 60).toFixed(0)}m`
      : `${h.toFixed(h < 10 && xStep < 1 ? 1 : 0)}h`;
    ctx.fillText(lbl, x, H - padB + 14);
  }
  ctx.setLineDash([]);

  // Y축 단위 라벨
  ctx.save();
  ctx.translate(13, padT + cH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = textMut; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'center';
  ctx.fillText('Resistance (Ω)', 0, 0);
  ctx.restore();

  // 데이터 라인
  ctx.strokeStyle = '#3fb6e8'; ctx.lineWidth = 1.8; ctx.setLineDash([]);
  ctx.beginPath();
  let started = false;
  rows.forEach(r => {
    const v = r.values[0];
    if (!isFinite(v)) { started = false; return; }
    const x = toX(r), y = toY(v);
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // 마지막 값 표시
  const lastRow = [...rows].reverse().find(r => isFinite(r.values[0]));
  if (lastRow) {
    const lv = lastRow.values[0];
    ctx.fillStyle = '#3fb6e8'; ctx.textAlign = 'left'; ctx.font = 'bold 11px JetBrains Mono';
    ctx.fillText(fmt(lv) + ' Ω', Math.min(toX(lastRow) + 4, W - padR - 60), toY(lv) - 4);
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function showTab(tab) {
  ['table', 'slot1', 'slot2', 'front'].forEach(id => {
    const el  = document.getElementById(`daqTabContent_${id}`);
    const btn = document.getElementById(`daqTabBtn_${id}`);
    if (el)  el.hidden = (id !== tab);
    if (btn) btn.classList.toggle('active', id === tab);
  });
  S.currentTab = tab;
  if (tab === 'slot1') { renderChList(1); requestAnimationFrame(() => drawChart(1)); }
  if (tab === 'slot2') { renderChList(2); requestAnimationFrame(() => drawChart(2)); }
  if (tab === 'front') requestAnimationFrame(drawChartFront);
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


// ── Total-time parser ─────────────────────────────────────────────────────────
// Parses strings like "90h", "2h", "120m", "3600s" → milliseconds.
// Returns 0 if unrecognised.
function parseTotalMs(str) {
  const s = (str || '').trim().toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([hms]?)$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (m[2] === 'h' || m[2] === '') return n * 3600000;
  if (m[2] === 'm') return n * 60000;
  if (m[2] === 's') return n * 1000;
  return 0;
}

// ── Wire mode ─────────────────────────────────────────────────────────────────
function setWire(n) {
  S.wire = n;
  document.getElementById('daq_wire2')?.classList.toggle('active', n === 2);
  document.getElementById('daq_wire4')?.classList.toggle('active', n === 4);
  const s = JSON.parse(localStorage.getItem('daq6510_settings') || '{}');
  s.wire = n; localStorage.setItem('daq6510_settings', JSON.stringify(s));
}

// ── 슬롯 카드 감지 (Rear 선택 시) ───────────────────────────────────────────
// SYST:CARD1:IDN? → 카드 있으면 IDN 문자열, 없으면 "" 반환
// 비어있는 응답("")을 core.js가 필터하므로 타임아웃 2초 후 Slot2 자동 진행
function _setSlotOpacity(id, hasCard) {
  const el = document.getElementById(id);
  if (el) { el.disabled = !hasCard; el.style.opacity = hasCard ? '1' : '0.4'; }
}

function detectSlots() {
  if (!app.serial?.isConnected) return;
  if (S?.running) return;  // 스캔 진행 중엔 감지 금지 (TRAC:ACT? 응답 혼선 방지)
  clearTimeout(S._slotTimeout);
  S._slotDetecting = 1;
  // 감지 중: 두 입력 반투명(활성화 유지)
  ['daq_s1', 'daq_s2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = false; el.style.opacity = '0.5'; }
  });
  app.log('[슬롯 감지] SYST:CARD1:IDN? 전송...', 'ok');
  app.serial.sendCmd('SYST:CARD1:IDN?\r\n');
  // 2초 안에 응답 없으면 Slot1=없음으로 처리 후 Slot2 조회
  S._slotTimeout = setTimeout(() => _advanceSlot(1, null), 2000);
}

// 슬롯 응답 도착 또는 타임아웃 시 공통 처리
function _advanceSlot(slot, line) {
  clearTimeout(S._slotTimeout);
  if (S?.running) { S._slotDetecting = 0; return; }  // 스캔 중 슬롯 감지 결과 무시

  // "Empty Slot", "", "" 등은 카드 없음으로 판정
  const isNoCard = l => !l || /^[+-]?\d+\s*,\s*"/.test(l) ||
    l.trim() === '""' || l.trim() === '' || /empty\s*slot/i.test(l.trim()) ||
    /^\s*[+-]?\d+\s*$/.test(l);  // 순수 정수(TRAC:ACT? 등) → 카드 없음으로 처리

  if (slot === 1) {
    const has1 = !isNoCard(line);
    S._hasSlot1 = has1;
    _setSlotOpacity('daq_s1', has1);
    app.log(`[슬롯 감지] Slot1: ${has1 ? `카드 감지 (${line?.trim()})` : '없음'}`, 'ok');

    // Slot2 조회
    S._slotDetecting = 2;
    app.log('[슬롯 감지] SYST:CARD2:IDN? 전송...', 'ok');
    app.serial.sendCmd('SYST:CARD2:IDN?\r\n');
    S._slotTimeout = setTimeout(() => _advanceSlot(2, null), 2000);

  } else if (slot === 2) {
    S._slotDetecting = 0;
    const has2 = !isNoCard(line);
    S._hasSlot2 = has2;
    _setSlotOpacity('daq_s2', has2);
    document.querySelector('#daq_slotGroup .manage-btn')?.removeAttribute('disabled');
    app.log(`[슬롯 감지] Slot2: ${has2 ? `카드 감지 (${line?.trim()})` : '없음'}`, 'ok');
    _updateSlotTabs();
  }
}

// 슬롯 감지 결과에 따라 그래프 탭 표시/숨김 갱신
function _updateSlotTabs() {
  if (S.terminal === 'FRONT') return;  // FRONT 모드는 setTerminal이 관리
  const btn1 = document.getElementById('daqTabBtn_slot1');
  const btn2 = document.getElementById('daqTabBtn_slot2');
  if (btn1) btn1.style.display = S._hasSlot1 ? '' : 'none';
  if (btn2) btn2.style.display = S._hasSlot2 ? '' : 'none';

  // 현재 탭이 숨겨진 경우 → 보이는 탭으로 자동 이동
  if (S.currentTab === 'slot1' && !S._hasSlot1) {
    showTab(S._hasSlot2 ? 'slot2' : 'table');
  } else if (S.currentTab === 'slot2' && !S._hasSlot2) {
    showTab(S._hasSlot1 ? 'slot1' : 'table');
  }
}

// onLine()에서 호출 — SYST:CARDn:IDN? 응답 처리
function handleSlotResponse(line) {
  _advanceSlot(S._slotDetecting, line);
}

// 터미널 전환 안내 팝업
function _showTerminalNotice(msg) {
  const existing = document.getElementById('daq_terminal_notice');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'daq_terminal_notice';
  el.style.cssText = [
    'position:fixed', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
    'background:var(--card,#1a2b3c)', 'border:1px solid var(--border)',
    'border-radius:12px', 'padding:28px 36px', 'z-index:9999',
    'box-shadow:0 8px 32px rgba(0,0,0,.6)', 'text-align:center', 'min-width:300px',
  ].join(';');
  el.innerHTML = `
    <div style="font-size:15px;line-height:1.7;margin-bottom:20px;">${msg}</div>
    <button onclick="document.getElementById('daq_terminal_notice').remove()"
      style="padding:8px 28px;background:var(--accent,#3fb6e8);border:none;
             border-radius:6px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">확인</button>`;
  document.body.appendChild(el);
}

// ── Terminal mode (Front / Rear) ──────────────────────────────────────────────
function setTerminal(term) {
  const prev = S.terminal;
  S.terminal = term;
  const isFront = term === 'FRONT';

  // 연결된 상태에서 터미널 변경 시 스위치 안내 팝업
  if (app.serial?.isConnected && prev !== term) {
    if (term === 'FRONT') {
      _showTerminalNotice('장비 전면에 있는 Terminals 스위치를<br><b>Front</b>로 변경하세요.');
    } else {
      _showTerminalNotice('장비 전면에 있는 Terminals 스위치를<br><b>Rear</b>로 변경하세요.');
    }
  }

  document.getElementById('daq_termFront')?.classList.toggle('active', isFront);
  document.getElementById('daq_termRear')?.classList.toggle('active', !isFront);

  // Front: 슬롯 전체 비활성화 / Rear: 감지 전까지 활성화 유지
  const slotGroup = document.getElementById('daq_slotGroup');
  if (slotGroup) slotGroup.style.opacity = isFront ? '0.35' : '1';
  if (isFront) {
    ['daq_s1', 'daq_s2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.disabled = true; el.style.opacity = ''; }
    });
    const nameBtn = document.querySelector('#daq_slotGroup .manage-btn');
    if (nameBtn) nameBtn.disabled = true;
  } else {
    detectSlots(); // 연결된 경우 슬롯 자동 감지
  }

  const scanSel = document.getElementById('daq_scanmode');
  const scanLbl = document.getElementById('daq_scanmode_label');
  if (scanSel) { scanSel.disabled = isFront; scanSel.style.opacity = isFront ? '0.35' : '1'; }
  if (scanLbl) scanLbl.style.opacity = isFront ? '0.35' : '1';

  // 탭 표시 전환
  const frontBtn = document.getElementById('daqTabBtn_front');
  const slot1Btn = document.getElementById('daqTabBtn_slot1');
  const slot2Btn = document.getElementById('daqTabBtn_slot2');
  if (frontBtn) frontBtn.style.display = isFront ? '' : 'none';
  // REAR: 슬롯 감지 결과에 따라 개별 표시
  if (slot1Btn) slot1Btn.style.display = isFront ? 'none' : (S._hasSlot1 ? '' : 'none');
  if (slot2Btn) slot2Btn.style.display = isFront ? 'none' : (S._hasSlot2 ? '' : 'none');

  if (isFront && (S.currentTab === 'slot1' || S.currentTab === 'slot2')) showTab('front');
  else if (!isFront && S.currentTab === 'front') showTab('table');

  const sv = JSON.parse(localStorage.getItem('daq6510_settings') || '{}');
  sv.terminal = term; localStorage.setItem('daq6510_settings', JSON.stringify(sv));
}

// ── Start / Stop ──────────────────────────────────────────────────────────────
function start() {
  if (!app.serial.isConnected) { alert(t('daq_connect_first')); return; }

  // 즉시 버튼 비활성화 — 5초 대기 중 중복 클릭 방지
  document.getElementById('daq_btnStart').disabled = true;
  document.getElementById('daq_btnStop').disabled  = false;

  const func     = S.wire === 4 ? 'FRES' : 'RES';
  const isFront  = S.terminal === 'FRONT';
  const scanMode = document.getElementById('daq_scanmode')?.value || 'full3m';
  const delayS   = Math.max(1, parseInt(document.getElementById('daq_delay')?.value || '1', 10));
  // FRONT 전용: READ? 반복 간격 (REAR는 onLine에서 체이닝)
  const intervalMs = isFront ? delayS * 1000 : 0;

  S.rows = []; app.count = 0; app._updateCount();

  if (isFront) {
    // ── Front terminal: 단일 채널 직접 측정, 스캐너 불필요 ─────────────────
    S.channels = [{ slot: 0, ch: 0, chId: 'FRONT', name: 'Front', selected: true }];
    buildTableHeader();
    document.getElementById('daqTableBody').innerHTML = '';

    app.serial.sendCmd('*RST\r\n');
    setTimeout(() => app.serial.sendCmd(`SENS:FUNC "${func}"\r\n`),             3200);
    setTimeout(() => app.serial.sendCmd(`SENS:${func}:RANG 0.1\r\n`),           3500); // 100mΩ 레인지 고정
    setTimeout(() => app.serial.sendCmd(`SENS:${func}:NPLC 5\r\n`),             3800);
    setTimeout(() => app.serial.sendCmd(`SENS:${func}:AZER:STAT ON\r\n`),       4100);
    if (func === 'FRES')
      setTimeout(() => app.serial.sendCmd('SENS:FRES:OCOM ON\r\n'),              4400); // 열기전력 제거

  } else {
    // ── Rear terminal: 스캐너 카드 채널 스캔 ──────────────────────────────
    buildChannels();
    const chs = S.channels.map(c => c.chId);
    if (!chs.length) {
      alert(t('daq_no_ch_alert'));
      document.getElementById('daq_btnStart').disabled = false;
      document.getElementById('daq_btnStop').disabled  = true;
      return;
    }

    // 4-Wire FRES 채널 페어링 충돌 경고 (manual §3.2)
    if (S.wire === 4) {
      const conflict = chs.filter(id => parseInt(id, 10) % 100 > 10);
      if (conflict.length) {
        const warn = t('daq_4wire_warn').replace('{chs}', conflict.join(', '));
        if (!confirm(warn)) {
          document.getElementById('daq_btnStart').disabled = false;
          document.getElementById('daq_btnStop').disabled  = true;
          return;
        }
      }
    }

    buildTableHeader();
    document.getElementById('daqTableBody').innerHTML = '';
    renderChList(1); renderChList(2);

    S._nCh      = chs.length;
    S._chList   = `(@${chs.join(',')})`;
    S._savedFunc   = func;
    S._savedDelayS = delayS;

    // *RST → *OPC?(RST 완료 확인 쿼리) → onLine('1') → _finishRearSetup()
    // *RST 완료 전에 ROUT:SCAN:CRE를 보내면 스캔 리스트가 사라져 1135 발생
    app.serial.sendCmd('ABOR\r\n');
    setTimeout(() => {
      if (!S._pendingStart) return;
      app.log('[DAQ] *RST 전송 — RST 완료 대기 중...', 'ok');
      app.serial.sendCmd('*RST\r\n');
      setTimeout(() => {
        if (!S._pendingStart) return;
        S._startupPhase = 1;
        // *OPC?는 query → Python이 RST 완료 응답("1")까지 블로킹 대기
        app.serial.sendCmd('*OPC?\r\n');
      }, 300);
    }, 200);

    // 폴백: 10초 안에 *OPC? 응답 없으면 강제 진행
    S._startupOpcTimer = setTimeout(() => {
      if (S._startupPhase !== 1) return;
      app.log('[DAQ] *RST *OPC? 10s 타임아웃 — 강제 설정 진행', 'warn');
      S._startupPhase = 0;
      _finishRearSetup();
    }, 10500);
  }

  S._pendingStart = true;

  if (isFront) {
    // FRONT: 6초 대기 후 시작
    setTimeout(() => {
      if (!S._pendingStart) return;
      S._pendingStart = false;
      _startMeasuring(isFront, func, scanMode, intervalMs);
    }, 6000);
  }
  // REAR: _finishRearSetup() 가 *OPC? 응답 후 _startMeasuring()을 호출
}

// RST 완료 확인(*OPC? = "1") 후 스캔 설정 및 측정 시작
function _finishRearSetup() {
  if (!S._pendingStart) return;
  clearTimeout(S._startupOpcTimer);
  S._startupOpcTimer = null;

  const chList  = S._chList;
  const func    = S._savedFunc;
  const delayS  = S._savedDelayS;

  app.log(`[DAQ] RST 완료. 스캔 설정 전송: ${chList}`, 'ok');
  app.serial.sendCmd(`ROUT:SCAN:CRE ${chList}\r\n`);
  setTimeout(() => app.serial.sendCmd(`SENS:FUNC "${func}", ${chList}\r\n`),      300);
  // SENS:FRES:OCOM ON 제거 — 7700 카드 미지원으로 -113 발생
  setTimeout(() => app.serial.sendCmd(`SENS:${func}:NPLC 1, ${chList}\r\n`),     600);
  setTimeout(() => app.serial.sendCmd(`ROUT:CHAN:DEL ${delayS}, ${chList}\r\n`),  900);
  setTimeout(() => app.serial.sendCmd('TRAC:CLE "defbuffer1"\r\n'),              1200);
  setTimeout(() => app.serial.sendCmd('*CLS\r\n'),                               1500); // 에러 큐 클리어

  setTimeout(() => {
    if (!S._pendingStart) return;
    S._pendingStart = false;
    _startMeasuring(false, func, document.getElementById('daq_scanmode')?.value || 'full3m', 0);
  }, 1900);
}

function _startMeasuring(isFront, func, scanMode, intervalMs) {
  S.running = true;
  S._startTime = Date.now();
  const disp = document.getElementById('daq_statusDisp');
  if (disp) {
    if (isFront) {
      disp.textContent = 'Front 측정 중...';
    } else {
      const nCh = S.channels.length;
      const cycSec = Math.round((nCh * (S._savedDelayS + 0.15) + 1.5));
      disp.textContent = scanMode === 'realtime'
        ? `실시간 측정 중... (사이클 ~${cycSec}초)`
        : t('daq_full_running');
    }
  }
  app._setDisplay('— — —', 'Ω', 'ready', 'LOGGING');

  const totalMs = parseTotalMs(document.getElementById('daq_totaltime')?.value || '90h');
  const endEl = document.getElementById('daq_endTime');
  if (totalMs > 0) {
    const endTime = new Date(Date.now() + totalMs);
    const p2 = n => String(n).padStart(2, '0');
    const endStr = `${endTime.getMonth()+1}/${p2(endTime.getDate())} ${p2(endTime.getHours())}:${p2(endTime.getMinutes())}`;
    if (endEl) { endEl.textContent = `${t('daq_end_time')}: ${endStr}`; endEl.style.display = ''; }
    S.autoStopTimer = setTimeout(() => { app.log(`${t('daq_end_time')} — ${t('daq_stopped')}`, 'ok'); stop(); }, totalMs);
  } else {
    if (endEl) endEl.style.display = 'none';
  }

  S._waitForData = false;

  if (isFront) {
    const doScan = () => {
      if (!S.running || !app.serial.isConnected || S._waitForData) return;
      S._waitForData = true;
      app.serial.sendCmd('READ?\r\n');
    };
    doScan();
    S.scanTimer = setInterval(doScan, intervalMs);
  } else {
    S._scanRow = [];
    S._waitingData = false;
    S._graphLastAt = Date.now();
    doScanCycle();
  }
  app.log(`${t('daq_start_log')} [${isFront ? 'FRONT' : 'REAR'}/${func}/${scanMode}]  ${isFront ? '' : 'CH: ' + S.channels.map(c=>c.chId).join(', ')}`, 'ok');
}

// 스캔 중 정지 버튼: REAR 스캔 진행 중이면 사이클 완료 후 정지 예약
function stop() {
  // 시작 대기/설정 단계면 즉시 취소
  if (S._pendingStart || S._startupPhase > 0) {
    S._pendingStart = false;
    S._startupPhase = 0;
    clearTimeout(S._startupOpcTimer); S._startupOpcTimer = null;
    _doStop();
    return;
  }
  // REAR 스캔 폴링 진행 중 → 현재 사이클 완료 후 정지
  if (S.running && S.terminal === 'REAR' && S._polling) {
    S._stopPending = true;
    clearTimeout(S.autoStopTimer); S.autoStopTimer = null;
    const disp = document.getElementById('daq_statusDisp');
    if (disp) disp.textContent = t('daq_stop_pending') || '사이클 완료 후 정지...';
    document.getElementById('daq_btnStop').disabled = true;
    return;
  }
  _doStop();
}

// 실제 정지 처리 (즉시)
function _doStop() {
  S._stopPending = false;
  S._pendingStart = false;
  S._startupPhase = 0;
  clearTimeout(S._startupOpcTimer); S._startupOpcTimer = null;
  clearInterval(S.scanTimer); S.scanTimer = null;
  clearTimeout(S.autoStopTimer); S.autoStopTimer = null;
  clearTimeout(S._cycleTimer); S._cycleTimer = null;
  clearTimeout(S._scanWaitTimer); S._scanWaitTimer = null;
  clearTimeout(S._pollTimer); S._pollTimer = null;
  clearTimeout(S._displayCycleTimer); S._displayCycleTimer = null;
  S._waitingData   = false;
  S._polling       = false;
  S._pollPhase     = '';
  S._pollTargetIdx = -1;
  S._pollCount     = 0;
  S.running   = false;
  S._stopping = true;
  if (app.serial.isConnected) {
    app.serial.sendCmd('ABOR\r\n');
    setTimeout(() => {
      app.serial.sendCmd('*CLS\r\n');
      if (S) S._stopping = false;
    }, 400);
  } else {
    S._stopping = false;
  }
  document.getElementById('daq_btnStart').disabled = false;
  document.getElementById('daq_btnStop').disabled  = true;
  const disp = document.getElementById('daq_statusDisp');
  if (disp) disp.textContent = t('daq_stopped');
  const endEl = document.getElementById('daq_endTime');
  if (endEl) endEl.style.display = 'none';
  const infoEl = document.getElementById('daq_liveInfo');
  if (infoEl) infoEl.style.display = 'none';
  app._setDisplay('STOP', '', 'off', 'STOPPED');
  app.log(t('daq_stop_log'), 'warn');
}

// ── Line handler ──────────────────────────────────────────────────────────────
const OVERFLOW_THRESHOLD = 1e30;

function onLine(line) {
  // 슬롯 감지 응답 처리 (SYST:CARD1/2:IDN? 응답) — 스캔 중엔 무시
  if (S?._slotDetecting && !S?.running) { handleSlotResponse(line); return; }
  if (S?._slotDetecting && S?.running) { S._slotDetecting = 0; }  // 잔류 감지 상태 초기화

  // *RST 완료 대기: *OPC? 응답 '1' 수신 시 스캔 설정 진행
  if (S?._startupPhase === 1) {
    const v = line.trim();
    if (v === '1' || v === '+1') {
      app.log('[DAQ] *RST 완료 확인 (*OPC?=1). 스캔 설정 시작.', 'ok');
      S._startupPhase = 0;
      _finishRearSetup();
    } else {
      app.log(`[DAQ] *RST *OPC? 응답: "${v}" (대기 중...)`, 'ok');
    }
    return;
  }

  const errMatch = line.match(/^([+-]?\d+)\s*,\s*"([^"]*)"/);
  if (errMatch) {
    const code = parseInt(errMatch[1], 10);
    if (code !== 0) {
      // 정지 직후(ABOR~*CLS) 잔여 에러 → 조용히 무시
      if (S?._stopping) return;
      // 폴링 중 에러 → 사이클 재시작 없이 500ms 후 재시도
      if (S?.running && S._polling) {
        S._pollTimer = setTimeout(_doPollAct, 500);
        return;
      }
      app.log(`DAQ-6510 SCPI 오류 (${code}): ${errMatch[2]}`, 'err');
      if (S) {
        S._waitForData = false;
        if (S.running && S.terminal === 'REAR') {
          S._waitingData = false;
          clearTimeout(S._cycleTimer);
          S._cycleTimer = setTimeout(doScanCycle, 5000);
        }
      }
    }
    return;
  }

  if (!S?.running) return;

  // ── REAR: TRAC:ACT? / TRAC:DATA? 폴링 응답 ──────────────────────────────
  if (S.terminal === 'REAR' && S._polling) {
    const nCh     = S.channels.length;
    const delayMs = Math.round((S._savedDelayS || 2) * 1000);

    if (S._pollPhase === 'act') {
      // TRAC:ACT? 응답: 버퍼에 쌓인 채널 수 (정수)
      const count = parseInt(line.trim(), 10);
      if (isNaN(count) || count < 0) {
        S._pollTimer = setTimeout(_doPollAct, 300);
        return;
      }
      if (count > S._pollCount) {
        // 새 채널 있음 → 새로 쌓인 것만 가져오기
        S._pollPhase = 'data';
        const from = S._pollCount + 1;
        app.serial.sendCmd(`TRAC:DATA? ${from},${count},"defbuffer1",READ\r\n`);
      } else {
        // 아직 새 채널 없음 → 빠른 재시도 (500ms)
        S._pollTimer = setTimeout(_doPollAct, 500);
      }

    } else if (S._pollPhase === 'data') {
      // TRAC:DATA? 응답: 쉼표 구분 값들
      S._pollPhase = '';
      const newVals = line.split(',').map(s => {
        const f = parseFloat(s.trim());
        return isNaN(f) || Math.abs(f) >= OVERFLOW_THRESHOLD ? Infinity : f;
      });
      const startIdx = S._pollCount;
      newVals.forEach((v, i) => { S._scanRow[startIdx + i] = v; });
      S._pollCount = startIdx + newVals.length;

      // 가장 마지막으로 측정된 채널 디스플레이 갱신
      const lastCh = S.channels[S._pollCount - 1];
      if (lastCh) _updateLivePanel(lastCh, newVals[newVals.length - 1]);

      if (S._pollCount >= nCh) {
        // 전 채널 완료
        S._polling = false;
        S._pollPhase = '';
        S._pollTargetIdx = -1;
        _finalizeScanCycle([...S._scanRow]);
      } else {
        // 다음 채널 완료 직전에 ACT? 도착하도록 타이밍
        // ACT?+DATA? 두 번 HTTP 왕복(~400ms) 포함 총 delayMs 맞추기
        S._pollTimer = setTimeout(_doPollAct, Math.max(100, delayMs - 400));
      }
    }
    return;
  }

  // ── FRONT: 단일 채널, setInterval 방식 ──────────────────────────────────
  if (S.terminal !== 'FRONT') return;   // REAR에서 예상외 라인 차단
  const m = line.match(/([+-]?\d+\.?\d*[Ee][+-]?\d+)/);
  if (!m) return;
  const raw = parseFloat(m[1]);
  const v = Math.abs(raw) >= OVERFLOW_THRESHOLD ? Infinity : raw;
  S._waitForData = false;

  const ts  = new Date().toTimeString().slice(0, 8);
  const hrs = (Date.now() - (S._startTime || Date.now())) / 3600000;
  const row = { time: ts, hrs, values: [v] };
  S.rows.push(row);
  app.count++; app._updateCount();
  appendTableRow(row);
  if (S.currentTab === 'front') drawChartFront();
  app._setDisplay(isFinite(v) ? fmt(v) : 'OL', 'Ω');
}

// ── Export / Clear ────────────────────────────────────────────────────────────
function exportCSV() {
  if (!S.rows.length) { app.log(t('daq_no_data_log'), 'warn'); return; }
  const cols = ['Time', ...S.channels.map(c => c.name)];
  const rows = [cols, ...S.rows.map(r => [r.time, ...r.values.map(v =>
    isNaN(v) ? '' : !isFinite(v) ? 'OL' : v.toExponential(4)
  )])];
  const rawName = document.getElementById('daq_filename')?.value?.trim();
  const filename = rawName
    ? (rawName.toLowerCase().endsWith('.csv') ? rawName : rawName + '.csv')
    : `DAQ6510_${dateStr()}.csv`;
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['\ufeff' + rows.map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })),
    download: filename,
  });
  a.click(); URL.revokeObjectURL(a.href);
  app.log(`${t('daq_csv_ok')} → ${filename}`, 'ok');
}

function clearData() {
  if (!confirm(t('daq_clear_confirm'))) return;
  S.rows = []; app.count = 0; app._updateCount();
  document.getElementById('daqTableBody').innerHTML = '';
  renderChList(1); renderChList(2);
  app.log(t('daq_cleared'));
}

function renderAllRows() {
  buildTableHeader();
  const tbody = document.getElementById('daqTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  S.rows.forEach(r => appendTableRow(r));
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
      <div class="graph-area" style="flex:1;min-width:0;min-height:200px;position:relative;overflow:hidden;">
        <canvas id="daqChart${slot}" style="position:absolute;top:0;left:0;width:100%;height:100%;display:block;"></canvas>
        <div class="graph-empty" id="daqChart${slot}Empty">${t('daq_no_chart')}</div>
      </div>
    </div>`;
}

function addManualVisaPort() {
  const inp = document.getElementById('manualVisaAddr');
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) return;
  const sel = document.getElementById('portSelect');
  if (!sel) return;

  // Check if option already exists
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === val) {
      sel.selectedIndex = i;
      inp.value = '';
      return;
    }
  }

  // Create and prepend new option
  const opt = document.createElement('option');
  opt.value = val;
  opt.textContent = val;
  if (sel.options.length > 0 && sel.options[0].value === "") {
    sel.insertBefore(opt, sel.options[1]);
  } else {
    sel.insertBefore(opt, sel.options[0]);
  }
  sel.value = val;
  inp.value = '';
}

// ── Exported instrument module ────────────────────────────────────────────────
export default {
  name: 'DAQ-6510',
  icon: 'assets/Daq_6510.png',
  category: 'Instrument',
  viewType: 'custom',
  serial: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },

  buildSidebar(el) {
    if (!S) init();
    const SK = 'daq6510_settings';
    const sv = JSON.parse(localStorage.getItem(SK) || '{}');
    const saveDaq = () => {
      const s = {
        filename:  document.getElementById('daq_filename')?.value  ?? 'DAQ_Data.csv',
        totaltime: document.getElementById('daq_totaltime')?.value ?? '90h',
        delay:     document.getElementById('daq_delay')?.value     ?? '2',
        s1:        document.getElementById('daq_s1')?.value        ?? '1-10',
        s2:        document.getElementById('daq_s2')?.value        ?? '',
        scanmode:  document.getElementById('daq_scanmode')?.value  ?? 'full3m',
        wire:      S.wire,
        terminal:  S.terminal,
      };
      localStorage.setItem(SK, JSON.stringify(s));
    };

    el.innerHTML = `<div class="sidebar-top">
      <div class="panel">
        <div class="field-label">${t('ag_conn_section') || '장비 연결'}</div>
        <div class="conn-row">
          <select id="portSelect" class="inp port-sel">
            <option value="USB0::0x05E6::0x6510::04632710::INSTR">${t('daq_visa_opt1') || 'USB (04632710) — 1,2번 오븐'}</option>
            <option value="USB0::0x05E6::0x6510::04544808::INSTR">${t('daq_visa_opt2') || 'USB (04544808) — 3,4번 오븐'}</option>
          </select>
          <button class="icon-btn" onclick="app.refreshPorts()" title="${t('refresh_tip') || '새로고침'}">↻</button>
        </div>
        <div class="conn-row" style="margin-top:6px;gap:4px;">
          <input type="text" id="manualVisaAddr" class="inp" style="flex:1;font-size:11px;" placeholder="USB0::0x05E6::0x6510::...::INSTR">
          <button class="sbtn green" onclick="app.instr.addManualVisaPort()" style="padding:0 8px;height:28px;line-height:28px;font-size:11px;">${t('btn_add')}</button>
        </div>
        <div id="connStatus" class="conn-status-lbl" style="margin-top:6px;">Disconnected</div>
        <button id="btnConnect" class="big-btn" onclick="app.toggleConnection()">${t('conn_btn')}</button>
      </div>

      <div class="panel">
        <div class="panel-title">${t('daq_config_section')}</div>
        <label class="fl" style="margin-top:0;">${t('daq_filename')}</label>
        <input type="text" id="daq_filename" class="inp" value="${sv.filename ?? 'DAQ_Data.csv'}">
        <label class="fl">${t('daq_total_time')}</label>
        <input type="text" id="daq_totaltime" class="inp" value="${sv.totaltime ?? '90h'}" placeholder="90h, 24h">
        <label class="fl">${t('daq_ch_delay')}</label>
        <input type="number" id="daq_delay" class="inp" value="${sv.delay ?? '2'}" min="0" step="1">
        <label class="fl">${t('daq_wire_mode')}</label>
        <div class="toggle-row">
          <button class="toggle-btn" id="daq_wire2" onclick="app.instr.setWire(2)">2-Wire</button>
          <button class="toggle-btn active" id="daq_wire4" onclick="app.instr.setWire(4)">4-Wire</button>
        </div>
        <label class="fl" style="margin-top:8px;">${t('daq_terminal_lbl')}</label>
        <div class="toggle-row">
          <button class="toggle-btn" id="daq_termFront" onclick="app.instr.setTerminal('FRONT')">Front</button>
          <button class="toggle-btn active" id="daq_termRear"  onclick="app.instr.setTerminal('REAR')">Rear</button>
        </div>
        <div id="daq_slotGroup">
          <div class="param-grid" style="margin-top:4px;">
            <div>
              <label class="fl">${t('daq_slot1_ch')}</label>
              <input type="text" id="daq_s1" class="inp" value="${sv.s1 ?? '1-10'}" placeholder="1-10">
            </div>
            <div>
              <label class="fl">${t('daq_slot2_ch')}</label>
              <input type="text" id="daq_s2" class="inp" value="${sv.s2 ?? ''}" placeholder="${t('daq_slot2_ph')}">
            </div>
          </div>
          <button class="manage-btn" style="margin-top:8px;" onclick="app.instr.showChNamesModal()">${t('daq_ch_names_btn')}</button>
        </div>
        <label class="fl" style="margin-top:8px;" id="daq_scanmode_label">${t('daq_scan_mode')}</label>
        <select id="daq_scanmode" class="inp">
          <option value="realtime">${t('daq_scan_rt')}</option>
          <option value="full3m">${t('daq_scan_full')}</option>
        </select>
      </div>

      <div class="panel">
        <div id="daq_statusDisp" class="ag-timer-disp" style="margin:0 0 8px;">${t('daq_wait')}</div>
        <button id="daq_btnStart" class="big-btn green" onclick="app.instr.start()">${t('daq_start_btn')}</button>
        <button id="daq_btnStop" class="big-btn danger" onclick="app.instr.stop()" disabled>${t('daq_stop_btn')}</button>
      </div>
    </div>${syslogPanelHTML()}`;

    // 저장된 값 복원
    const scanSel = document.getElementById('daq_scanmode');
    if (scanSel && sv.scanmode) scanSel.value = sv.scanmode;
    if (sv.wire === 2) setWire(2);
    if (sv.terminal === 'FRONT') setTerminal('FRONT');

    // 변경 시 자동 저장
    ['daq_filename','daq_totaltime','daq_delay','daq_s1','daq_s2'].forEach(id =>
      document.getElementById(id)?.addEventListener('input', saveDaq));
    document.getElementById('daq_scanmode')?.addEventListener('change', saveDaq);
  },

  buildCenter(el) {
    el.innerHTML = `
      <div class="display-bar" style="display:flex;align-items:center;padding:0;overflow:hidden;">
        <!-- 좌측: 슬롯/채널/이름 (측정 중만 표시) -->
        <div id="daq_liveInfo" style="
          display:none;flex-shrink:0;width:130px;
          align-self:stretch;flex-direction:column;
          align-items:center;justify-content:center;
          border-right:1px solid var(--border);
          padding:0 12px;text-align:center;
        ">
          <div id="daq_liveSlot" style="font-size:11px;font-weight:700;color:var(--text-dim);letter-spacing:1px;text-transform:uppercase;"></div>
          <div id="daq_liveCh"   style="font-size:18px;color:var(--cyan);font-family:var(--mono);font-weight:700;margin-top:4px;"></div>
          <div id="daq_liveName" style="font-size:11px;color:var(--text-mut);margin-top:3px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>
        </div>
        <!-- 중앙: 측정값 (남은 공간 전부) -->
        <div class="disp-value" style="flex:1;text-align:center;"><span id="liveValue">— — —</span><span class="disp-unit" id="liveUnit">Ω</span></div>
        <!-- 우측: 상태/카운트 -->
        <div class="disp-meta" style="flex-shrink:0;">
          <span id="liveStatus" class="disp-status off">${t('disconnected')}</span>
          <span class="meas-count">${t('daq_rec_count')} <b id="measCount">0</b></span>
          <span id="daq_endTime" style="font-size:11px;color:var(--text-mut);white-space:nowrap;display:none;"></span>
        </div>
      </div>
      <div class="daq-tabbar">
        <button class="daq-tab active" id="daqTabBtn_table" onclick="app.instr.showTab('table')">${t('daq_data_tab')}</button>
        <button class="daq-tab" id="daqTabBtn_slot1"  onclick="app.instr.showTab('slot1')" style="display:none;">${t('daq_slot1_tab')}</button>
        <button class="daq-tab" id="daqTabBtn_slot2"  onclick="app.instr.showTab('slot2')" style="display:none;">${t('daq_slot2_tab')}</button>
        <button class="daq-tab" id="daqTabBtn_front"  onclick="app.instr.showTab('front')" style="display:none;">${t('daq_front_tab')}</button>
        <div style="margin-left:auto;display:flex;gap:6px;">
          <button class="sbtn green" onclick="app.instr.exportCSV()">${t('btn_csv')}</button>
          <button class="sbtn red" onclick="app.instr.clearData()">${t('btn_clear')}</button>
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

      <!-- Front single graph tab -->
      <div id="daqTabContent_front" class="panel grow" style="min-height:0;position:relative;padding:8px;" hidden>
        <canvas id="daqChartFront" style="width:100%;height:100%;display:block;"></canvas>
        <div class="graph-empty" id="daqChartFrontEmpty">${t('daq_no_chart')}</div>
      </div>

      <!-- Slot 1 graph tab -->
      <div id="daqTabContent_slot1" class="panel grow" style="min-height:0;display:flex;flex-direction:row;padding:0;overflow:hidden;" hidden>
        ${slotTabHTML(1)}
      </div>

      <!-- Slot 2 graph tab -->
      <div id="daqTabContent_slot2" class="panel grow" style="min-height:0;display:flex;flex-direction:row;padding:0;overflow:hidden;" hidden>
        ${slotTabHTML(2)}
      </div>`;

    // 그래프 영역 크기 변경 시 자동 재렌더
    const ro = new ResizeObserver(() => {
      if (!S) return;
      if (S.currentTab === 'slot1') drawChart(1);
      if (S.currentTab === 'slot2') drawChart(2);
      if (S.currentTab === 'front') drawChartFront();
    });
    el.querySelectorAll('.graph-area').forEach(ga => ro.observe(ga));
    const frontArea = document.getElementById('daqTabContent_front');
    if (frontArea) ro.observe(frontArea);
  },

  buildRightPanel(el) {
    el.innerHTML = '';
    el.style.display = 'none';
    const layout = document.getElementById('layout');
    if (layout) layout.style.gridTemplateColumns = 'var(--sidebar-w) 1fr';
  },

  onLine,
  onRebuild() {
    renderAllRows();
    renderChList(1); renderChList(2);
    setTerminal(S.terminal); // 테마/언어 변경 후 Front/Rear 상태 및 슬롯 탭 가시성 복원
    if (S.currentTab === 'slot1') drawChart(1);
    else if (S.currentTab === 'slot2') drawChart(2);
    else if (S.currentTab === 'front') drawChartFront();
    showTab(S.currentTab || 'table');
  },
  isRunning() { return S?.running || false; },
  onConnect() {
    if (S.terminal !== 'FRONT') detectSlots();
  },
  onDisconnect() {
    if (S?.running) stop();
    const rp = document.getElementById('rightpanel');
    if (rp) rp.style.display = '';
    const layout = document.getElementById('layout');
    if (layout) layout.style.gridTemplateColumns = '';
  },

  // Exposed for inline onclick handlers
  setWire, setTerminal, start, stop, showTab, showChNamesModal, applyChNamesModal,
  onChkChange, toggleSlotAll, setChName, applyChNameChange, exportCSV, clearData,
  addManualVisaPort, detectSlots,
};