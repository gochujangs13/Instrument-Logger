/* ============================================================
   GW Instek PST-3202 — 3채널 DC 전원공급기
   Serial: 9600 8N1, SCPI, 명령 끝 \n, 응답 끝 \n
   UI: standalone PST-3202 Controller와 동일 구조
   ============================================================ */

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CH_MAX_V = { 1: 32, 2: 32, 3: 6 };
const CH_MAX_I = { 1: 2, 2: 2, 3: 5 };
const CH3_SYNC_MAX_I = 2; // 3채널 동기화 시 최대 전류 (스팩은 5A지만 동기화 제한)
const GV = ['#3fb6e8', '#f59e0b', '#e8554e'];
const GI = ['#22b06a', '#9b7fe8', '#4da3ff'];
const TRACK_LABEL = { 0: '독립', 1: '병렬', 2: '직렬' };
const TRACK_IMAGE = {
  0: 'assets/Independent.png',
  1: 'assets/Parallel.png',
  2: 'assets/Series.png'
};
const LS_EVALS = 'pst3202_evals';

let S = null;
let _pendingCb = null;

// ── Serial ────────────────────────────────────────────────────────────────────
function send(cmd) {
  app.serial.sendCmd(cmd.endsWith('\n') ? cmd : cmd + '\n');
}

function _runSeq(steps, onDone) {
  let i = 0;
  function next() {
    if (!app?.serial?.isConnected) { onDone?.(); return; }
    if (i >= steps.length) { onDone?.(); return; }
    const [cmd, cb] = steps[i++];
    if (cmd.trim().endsWith('?')) {
      _pendingCb = r => { cb?.(r); next(); };
      send(cmd);
    } else {
      send(cmd);
      cb?.();
      next();
    }
  }
  next();
}

// ── Logging ───────────────────────────────────────────────────────────────────
function pstLog(msg, type = 'info') {
  const el = $('pstSysLog');
  if (!el) return;
  const ts = new Date().toTimeString().slice(0, 8);
  const d = document.createElement('div');
  d.className = `pst-log-line pst-${type}`;
  d.textContent = `[${ts}] ${msg}`;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

// ── State ─────────────────────────────────────────────────────────────────────
const TAB_LOCK_KEY = 'pst3202_tab_lock';
const TAB_LOCK_HEARTBEAT_MS = 1000;
const TAB_LOCK_STALE_MS = 3000;
const myTabId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
let tabLockInterval = null;

function readTabLock() {
  try {
    const raw = localStorage.getItem(TAB_LOCK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function writeTabLock() {
  try { localStorage.setItem(TAB_LOCK_KEY, JSON.stringify({ tabId: myTabId, ts: Date.now() })); } catch (e) { }
}

function releaseTabLock() {
  const cur = readTabLock();
  if (cur && cur.tabId === myTabId) {
    try { localStorage.removeItem(TAB_LOCK_KEY); } catch (e) { }
  }
}

function initTabLock() {
  const existing = readTabLock();
  if (existing && (Date.now() - existing.ts) < TAB_LOCK_STALE_MS && existing.tabId !== myTabId) {
    const modal = $('pstTabLockModal');
    if (modal) modal.style.display = 'flex';
    return;
  }
  writeTabLock();
  if (tabLockInterval) clearInterval(tabLockInterval);
  tabLockInterval = setInterval(writeTabLock, TAB_LOCK_HEARTBEAT_MS);
  window.addEventListener('beforeunload', releaseTabLock);
}

function isProtectionErrorText(errStr) {
  if (!errStr) return false;
  const s = errStr.trim();
  if (s.startsWith('0')) return false;
  return /protection/i.test(s);
}

function showProtectionModal(msg) {
  const modal = $('pstProtectionModal'); if (!modal) return;
  const msgEl = $('pstProtectionModalMsg'); if (msgEl) msgEl.textContent = msg;
  modal.style.display = 'flex';
  S.outputActive = false;
  updateOutUI();
  pstLog(`⚠️ 보호 모드 발동: ${msg}`, 'err');
}

function hideProtectionModal() {
  const modal = $('pstProtectionModal'); if (modal) modal.style.display = 'none';
}

function clearProtectionFromModal() {
  clearProtection();
  hideProtectionModal();
}

function showTrackImageModal(mode) {
  const modal = $('pstTrackImageModal'); if (!modal) return;
  const img = $('pstTrackImageModalImg'); if (img) img.src = TRACK_IMAGE[mode];
  modal.style.display = 'flex';
}

function hideTrackImageModal() {
  const modal = $('pstTrackImageModal'); if (modal) modal.style.display = 'none';
}

function showWarningModal(msg, title = '입력 범위 초과') {
  const modal = $('pstWarningModal'); if (!modal) return;
  const tEl = $('pstWarningModalTitle'); if (tEl) tEl.textContent = title;
  const mEl = $('pstWarningModalMsg'); if (mEl) mEl.textContent = msg;
  modal.style.display = 'flex';
}

function closeWarningModal() {
  const modal = $('pstWarningModal'); if (modal) modal.style.display = 'none';
}

function showInfoModal(msg, title = '완료') {
  const modal = $('pstInfoModal'); if (!modal) return;
  const tEl = $('pstInfoModalTitle'); if (tEl) tEl.textContent = title;
  const mEl = $('pstInfoModalMsg'); if (mEl) mEl.textContent = msg;
  modal.style.display = 'flex';
}

function closeInfoModal() {
  const modal = $('pstInfoModal'); if (modal) modal.style.display = 'none';
}

function init() {
  S = {
    ch: [1, 2, 3].map(() => ({
      measV: 0, measI: 0, ctrlMode: 'CV', mode: 'fixed', ocpOn: false, ovpVal: null,
    })),
    trackMode: 0,
    outputActive: false,
    selectedCh: 1,
    pollTimer: null,
    outputStartTime: null,
    autoStopOnZero: true,
    editorCh: 1,
    cycleStartType: null,
    cySteps: [[], [], []],
    cyState: [1, 2, 3].map(() => ({ running: false, timer: null, stepIdx: 0, loopCount: 1, remaining: 0 })),
    evalRecords: [],
    nextEvalId: 1,
    viewingEvalId: null,
    evalFilters: { track: 'all', mode: 'all', date: 'all', stress: 'all', aging: 'all' },
    gData: { ts: [], v: [[], [], []], i: [[], [], []] },
    syncCh1Ch2: false,
    syncCh3: false,
  };
  loadEvalRecords();
}

// ── Polling ───────────────────────────────────────────────────────────────────
function isChUsed(ch) {
  if (S.trackMode !== 0) return ch <= 2 || (S.trackMode === 1 && ($('pstCh3Use')?.checked ?? false));
  const toggle = $(`pstCh${ch}Use`);
  return !toggle || toggle.checked;
}

function isChannelActive(ch) {
  if (!isChUsed(ch)) return false;
  if (ch === S.selectedCh) return true;
  if (S.cyState[ch - 1].running) return true;
  if (S.trackMode !== 0) return ch <= 2;
  const v = parseFloat($(`pstVset${ch}`)?.value) || 0;
  const i = parseFloat($(`pstIset${ch}`)?.value) || 0;
  return v > 0 || i > 0;
}

function doPoll() {
  if (!S || !app?.serial?.isConnected || !S.outputActive) return;
  if (_pendingCb) { S.pollTimer = setTimeout(doPoll, 300); return; }
  const chs = [1, 2, 3].filter(isChannelActive);
  const steps = [];
  chs.forEach(c => {
    steps.push([`:CHANnel${c}:MEASure:VOLTage?`, r => {
      S.ch[c - 1].measV = parseFloat(r) || 0;
    }]);
    steps.push([`:CHANnel${c}:MEASure:CURRent?`, r => {
      S.ch[c - 1].measI = parseFloat(r) || 0;
      handleCurrentMeas(c);
    }]);
  });

  steps.push([`:SYSTem:ERRor?`, r => {
    if (isProtectionErrorText(r)) {
      showProtectionModal(r);
    }
  }]);

  _runSeq(steps, () => {
    updateAllMeasDisplay();
    if (S.editorCh && S.ch) {
      const c = S.editorCh;
      if ($('pstCeLiveV')) $('pstCeLiveV').textContent = `${S.ch[c - 1].measV.toFixed(3)} V`;
      if ($('pstCeLiveI')) $('pstCeLiveI').textContent = `${S.ch[c - 1].measI.toFixed(3)} A`;
    }
    recordGraphData();
    if (app?.serial?.isConnected) S.pollTimer = setTimeout(doPoll, 500);
  });
}

function stopPoll() {
  clearTimeout(S?.pollTimer);
  if (S) S.pollTimer = null;
}

// ── UI Updates ────────────────────────────────────────────────────────────────
function updateAllMeasDisplay() {
  [1, 2, 3].forEach(c => {
    const v = $(`pstV${c}`); if (v) v.textContent = `${S.ch[c - 1].measV.toFixed(3)} V`;
    const i = $(`pstI${c}`); if (i) i.textContent = `${S.ch[c - 1].measI.toFixed(3)} A`;
  });
}

function _sidebarBtnLocked() {
  // 어느 채널이든 사이클 모드면 사이드바 버튼 잠금
  return [1, 2, 3].some(ch => S.ch[ch - 1].mode === 'cycle');
}

function updateOutUI() {
  const btn = $('pstBtnOutput');
  if (!btn) return;
  if (_sidebarBtnLocked()) {
    btn.textContent = '⚡ 시작';
    btn.classList.add('green');
    btn.classList.remove('danger');
    btn.disabled = true;
    $('pstCenter')?.classList.toggle('pst-output-off', !S.outputActive);
    return;
  }
  if (S.outputActive) {
    btn.textContent = '⚡ 정지';
    btn.classList.add('danger');
    btn.classList.remove('green');
    $('pstCenter')?.classList.remove('pst-output-off');
  } else {
    btn.textContent = '⚡ 시작';
    btn.classList.add('green');
    btn.classList.remove('danger');
    $('pstCenter')?.classList.add('pst-output-off');
  }
  updateOutputButtonState();
}

function updateOutputButtonState() {
  const btn = $('pstBtnOutput');
  if (!btn) return;
  if (!app?.serial?.isConnected) { btn.disabled = true; return; }
  btn.disabled = _sidebarBtnLocked();
}

function updateTrackModeUI() {
  [0, 1, 2].forEach(m => {
    const r = $(`pstTm${m}`); if (r) r.checked = S.trackMode === m;
  });
  const syncCol = $('pstSyncCol');
  if (syncCol) {
    const isIndep = S.trackMode === 0;
    syncCol.style.display = isIndep ? 'flex' : 'none';
    if (!isIndep && S.syncCh1Ch2) setSyncCh1Ch2(false);
  }
  const ch3Card = $('pstCh3');
  if (ch3Card) {
    const isTracking = S.trackMode !== 0;
    ch3Card.classList.toggle('pst-ch-disabled', isTracking);
    ch3Card.querySelectorAll('input, button, select').forEach(el => { el.disabled = isTracking; });
    if (isTracking && S.selectedCh === 3) selCh(1);
  }
  syncTrackingSettings();
}

function setNeedsConn(on) {
  document.querySelectorAll('.pst-needs-conn').forEach(el => { el.disabled = !on; });
  const outBtn = $('pstBtnOutput');
  if (outBtn) { outBtn.disabled = !on; }
}

// ── Channel Selection ─────────────────────────────────────────────────────────
function selCh(ch) {
  [1, 2, 3].forEach(c => $(`pstCh${c}`)?.classList.toggle('pst-sel', c === ch));
  S.selectedCh = ch;
  if ($('pstCeLiveCh')) $('pstCeLiveCh').textContent = ch;
  updateGraphLegend();
  drawGraph();
}

// ── Mode ──────────────────────────────────────────────────────────────────────
function setMode(ch, mode) {
  S.ch[ch - 1].mode = mode;
  const fix = $(`pstFix${ch}`);
  if (fix) fix.style.display = mode === 'fixed' ? '' : 'none';
  $(`pstTf${ch}`)?.classList.toggle('active', mode === 'fixed');
  $(`pstTc${ch}`)?.classList.toggle('active', mode === 'cycle');
  // 동기화 ON + 독립 모드 + CH1 변경 시 → CH2/CH3도 동일 모드로 전환
  if (S.syncCh1Ch2 && S.trackMode === 0 && ch === 1) {
    S.ch[1].mode = mode;
    const fix2 = $('pstFix2'); if (fix2) fix2.style.display = mode === 'fixed' ? '' : 'none';
    $('pstTf2')?.classList.toggle('active', mode === 'fixed');
    $('pstTc2')?.classList.toggle('active', mode === 'cycle');
  }
  if (S.syncCh3 && S.trackMode === 0 && ch === 1) {
    S.ch[2].mode = mode;
    const fix3 = $('pstFix3'); if (fix3) fix3.style.display = mode === 'fixed' ? '' : 'none';
    $('pstTf3')?.classList.toggle('active', mode === 'fixed');
    $('pstTc3')?.classList.toggle('active', mode === 'cycle');
  }
  updateCycleEditor();
  updateGraphLegend();
  drawGraph();
  updateOutputButtonState();
}

function setCtrlMode(ch, mode) {
  S.ch[ch - 1].ctrlMode = mode;
  refreshCtrlModeUI(ch);
  if (S.syncCh1Ch2 && S.trackMode === 0 && ch === 1) {
    S.ch[1].ctrlMode = mode;
    refreshCtrlModeUI(2);
  }
  if (S.syncCh3 && S.trackMode === 0 && ch === 1) {
    S.ch[2].ctrlMode = mode;
    refreshCtrlModeUI(3);
  }
}

function refreshCtrlModeUI(ch) {
  const m = S.ch[ch - 1].ctrlMode;
  $(`pstCv${ch}`)?.classList.toggle('active', m === 'CV');
  $(`pstCc${ch}`)?.classList.toggle('active', m === 'CC');
  const vRow = $(`pstVRow${ch}`);
  if (vRow) vRow.style.display = m === 'CV' ? '' : 'none';
  const ccN = $(`pstCcNotice${ch}`);
  if (ccN) ccN.style.display = m === 'CC' ? '' : 'none';
  const iLbl = $(`pstILabel${ch}`);
  if (iLbl) iLbl.textContent = m === 'CC' ? '목표 전류' : '전류 제한';
  if (S.editorCh === ch) {
    $('pstCeCVTab')?.classList.toggle('active', m === 'CV');
    $('pstCeCCTab')?.classList.toggle('active', m === 'CC');
    const ceVF = $('pstCeVField');
    if (ceVF) ceVF.style.display = m === 'CV' ? '' : 'none';
    const ceCcN = $('pstCeCcNotice');
    if (ceCcN) ceCcN.style.display = m === 'CC' ? '' : 'none';
    const ceFields = $('pstCeFields');
    if (ceFields) ceFields.style.gridTemplateColumns = m === 'CV' ? '1fr 1fr 1fr' : '1fr 1fr';
  }
}

// ── Tracking / Sync ───────────────────────────────────────────────────────────
function syncTrackingSettings() {
  const tm = S.trackMode;
  const ch1Used = tm === 0 ? ($('pstCh1Use')?.checked ?? true) : true;
  const ch2Used = tm === 0 ? ($('pstCh2Use')?.checked ?? true) : true;
  const ch3Used = (tm === 0 || tm === 1) ? ($('pstCh3Use')?.checked ?? true) : false;

  const useRowVis = (ch, show) => { const r = $(`pstCh${ch}UseRow`); if (r) r.style.display = show ? 'flex' : 'none'; };
  useRowVis(1, tm === 0);
  useRowVis(2, tm === 0);
  useRowVis(3, tm === 0 || tm === 1);

  const v1 = $('pstVset1')?.value || '0.00';
  const i1 = $('pstIset1')?.value || '0.000';
  const v2 = $('pstVset2')?.value || '0.00';
  const i2 = $('pstIset2')?.value || '0.000';

  function lockCh(ch, lock, vVal, iVal) {
    const ve = $(`pstVset${ch}`), ie = $(`pstIset${ch}`);
    if (!ve || !ie) return;
    ve.disabled = lock; ie.disabled = lock;
    if (lock && vVal !== undefined) ve.value = vVal;
    if (lock && iVal !== undefined) ie.value = iVal;
  }

  if (!ch1Used) lockCh(1, true, '0.00', '0.000');
  else if (tm === 2) {
    lockCh(1, true, v2, i2); // Series: CH1 tracks CH2
    const ocp1 = $('pstOcp1'), ocp2 = $('pstOcp2');
    if (ocp1 && ocp2) {
      ocp1.checked = ocp2.checked;
      ocp1.disabled = true;
    }
    S.ch[0].ocpOn = S.ch[1].ocpOn;
  }
  else {
    const ocp1 = $('pstOcp1'); if (ocp1) ocp1.disabled = false;
    lockCh(1, false);
  }

  if (!ch2Used) lockCh(2, true, '0.00', '0.000');
  else if (tm === 1) {
    lockCh(2, true, v1, i1); // Parallel: CH2 tracks CH1
    const ocp1 = $('pstOcp1'), ocp2 = $('pstOcp2');
    if (ocp1 && ocp2) {
      ocp2.checked = ocp1.checked;
      ocp2.disabled = true;
    }
    S.ch[1].ocpOn = S.ch[0].ocpOn;
  }
  else {
    const ocp2 = $('pstOcp2'); if (ocp2) ocp2.disabled = false;
    lockCh(2, false);
  }

  if (!ch3Used) lockCh(3, true, '0.00', '0.000');
  else lockCh(3, false);

  [1, 2, 3].forEach(ch => {
    const locked = $(`pstVset${ch}`)?.disabled;
    const ccBtn = $(`pstCc${ch}`); if (ccBtn) ccBtn.disabled = locked;
    if (locked && S.ch[ch - 1].ctrlMode === 'CC') setCtrlMode(ch, 'CV');
  });

  updateGraphLegend();
}

// ── Cycle Editor ──────────────────────────────────────────────────────────────
function updateCycleEditor() {
  const cycleChs = [1, 2, 3].filter(c => S.ch[c - 1].mode === 'cycle');
  const ed = $('pstCycleEditor');
  if (!ed) return;
  ed.style.display = cycleChs.length ? '' : 'none';
  if (!cycleChs.length) return;

  const tabs = $('pstCeTabs');
  if (tabs) {
    tabs.innerHTML = '';
    cycleChs.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'pst-ce-ch-tab' + (c === S.editorCh ? ' active' : '');
      btn.textContent = `CH ${c}`;
      btn.onclick = () => switchEditorCh(c);
      tabs.appendChild(btn);
    });
    if (!cycleChs.includes(S.editorCh)) S.editorCh = cycleChs[0];
  }
  renderEditor();
}

function switchEditorCh(ch) {
  S.editorCh = ch;
  document.querySelectorAll('.pst-ce-ch-tab').forEach((b, i) => {
    const c = [1, 2, 3].filter(x => S.ch[x - 1].mode === 'cycle')[i];
    b.classList.toggle('active', c === ch);
  });
  renderEditor();
}

// 사이클 편집 시 유효 전압 최대값 — CH3 동기화 ON이면 6V로 제한
function _effMaxV(ch) {
  if (ch === 1 && S?.syncCh3 && S.trackMode === 0) return CH_MAX_V[3];
  return CH_MAX_V[ch];
}

function renderEditor() {
  const ch = S.editorCh;
  const lv = $('pstCeVLabel'), li = $('pstCeILabel');
  const effV = _effMaxV(ch);
  if (lv) lv.textContent = `전압 (0–${effV}V)`;
  if (li) li.textContent = `전류 (0–${CH_MAX_I[ch]}A)`;
  const cev = $('pstCeV'), cei = $('pstCeI');
  if (cev) {
    cev.max = effV;
    // 기존 입력값이 새 유효 최대값을 초과하면 자동 교정
    const curV = parseFloat(cev.value);
    if (!isNaN(curV) && curV > effV) cev.value = effV.toFixed(2);
  }
  if (cei) cei.max = CH_MAX_I[ch];
  const chLbl = $('pstCeChLabel');
  if (chLbl) chLbl.textContent = `— CH ${ch} 편집 중`;
  if ($('pstCeLiveCh')) $('pstCeLiveCh').textContent = ch;
  refreshCtrlModeUI(ch);
  renderStepTable();
  updateEditorControls();
  // 경고 문구 재검증 (라벨·max 변경 후)
  validateCeField('V');
  validateCeField('I');
  updateTotalDuration();
}

function renderStepTable() {
  const ch = S.editorCh;
  const steps = S.cySteps[ch - 1];
  const st = S.cyState[ch - 1];
  const tbody = $('pstStepTbody');
  if (!tbody) return;
  updateTotalDuration();
  if (!steps.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="pst-empty-steps">단계가 없습니다. 왼쪽에서 단계를 추가하세요.</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  steps.forEach((s, idx) => {
    const active = st.running && st.stepIdx === idx;
    const tr = document.createElement('tr');
    if (active) tr.className = 'pst-active-step';
    tr.innerHTML = `
      <td><span class="pst-step-num">${idx + 1}</span></td>
      <td><input type="number" class="pst-step-edit-inp pst-v" value="${s.v.toFixed(2)}" min="0" max="${CH_MAX_V[ch]}" step="0.01" ${st.running ? 'disabled' : ''} onchange="app.instr.editStep(${idx},'v',this.value)"></td>
      <td><input type="number" class="pst-step-edit-inp pst-i" value="${s.i.toFixed(3)}" min="0" max="${CH_MAX_I[ch]}" step="0.001" ${st.running ? 'disabled' : ''} onchange="app.instr.editStep(${idx},'i',this.value)"></td>
      <td><input type="number" class="pst-step-edit-inp pst-t" value="${s.t}" min="1" step="1" ${st.running ? 'disabled' : ''} onchange="app.instr.editStep(${idx},'t',this.value)"></td>
      <td><button class="sbtn" onclick="app.instr.delStep(${idx})" ${st.running ? 'disabled' : ''} style="font-size:11px;padding:3px 8px;color:var(--red);border-color:var(--red);">삭제</button></td>`;
    tbody.appendChild(tr);
  });
}

function updateEditorControls() {
  const anyRunning = [0, 1, 2].some(i => S.cyState[i].running);
  if (!anyRunning) S.cycleStartType = null;

  const btnStart = $('pstBtnStart');
  const btnStartAll = $('pstBtnStartAll');
  const st = S.cyState[S.editorCh - 1];

  if (btnStart) {
    btnStart.textContent = st.running ? '■ CH중지' : '▶ CH시작';
    btnStart.className = `big-btn${st.running ? ' danger' : ' green'}`;
  }
  if (btnStartAll) {
    btnStartAll.textContent = anyRunning ? '■ 전체 중지' : '▶ 전체 시작';
    btnStartAll.className = `sbtn${anyRunning ? ' red' : ''}`;
  }

  const connected = app?.serial?.isConnected;
  if (!connected) {
    if (btnStart) btnStart.disabled = true;
    if (btnStartAll) btnStartAll.disabled = true;
  } else {
    if (S.cycleStartType === 'all') {
      if (btnStart) btnStart.disabled = true;
      if (btnStartAll) btnStartAll.disabled = false;
    } else if (S.cycleStartType === 'single') {
      if (btnStart) btnStart.disabled = false;
      if (btnStartAll) btnStartAll.disabled = true;
    } else {
      if (btnStart) btnStart.disabled = false;
      if (btnStartAll) btnStartAll.disabled = false;
    }
  }

  updateOutputButtonState();

  const allStatusWrap = $('pstAllStatusWrap');
  if (allStatusWrap) allStatusWrap.style.display = anyRunning ? 'flex' : 'none';
  const loops = parseInt($('pstCeLoops')?.value) || 1;
  [1, 2, 3].forEach(c => {
    const el = $(`pstCeStatus${c}`);
    if (!el) return;
    const s = S.cyState[c - 1];
    if (!s.running) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.textContent = `CH${c} ▶ 단계 ${s.stepIdx + 1}/${S.cySteps[c - 1].length} | 남은 시간 ${s.remaining}초 | 사이클 ${s.loopCount}/${loops}`;
  });
}

function updateTotalDuration() {
  const ch = S.editorCh;
  const loops = parseInt($('pstCeLoops')?.value) || 1;
  const total = S.cySteps[ch - 1].reduce((a, s) => a + s.t, 0) * loops;
  const el = $('pstTotalDuration');
  if (!el) return;
  if (total >= 3600) { const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60; el.textContent = `${h}시간 ${m}분 ${s}초`; }
  else if (total >= 60) { const m = Math.floor(total / 60), s = total % 60; el.textContent = `${m}분 ${s}초`; }
  else el.textContent = `${total}초`;
}

// ── Step CRUD ─────────────────────────────────────────────────────────────────
function validateCeField(field) {
  const ch = S.editorCh;
  let val, max, min, warn;
  if (field === 'V') {
    val = parseFloat($('pstCeV')?.value);
    max = _effMaxV(ch); min = 0;
    warn = $('pstCeVWarn');
  } else if (field === 'I') {
    val = parseFloat($('pstCeI')?.value);
    max = CH_MAX_I[ch]; min = 0;
    warn = $('pstCeIWarn');
  } else {
    val = parseInt($('pstCeT')?.value);
    max = 99999; min = 1;
    warn = $('pstCeTWarn');
  }
  if (!warn) return;
  if ($('pstCeV')?.value === '' && field === 'V') { warn.textContent = ''; return; }
  if ($('pstCeI')?.value === '' && field === 'I') { warn.textContent = ''; return; }
  if ($('pstCeT')?.value === '' && field === 'T') { warn.textContent = ''; return; }
  if (isNaN(val) || val < min || val > max) {
    warn.textContent = `⚠ 허용 범위: ${min} ~ ${max}${field === 'T' ? '초' : field === 'V' ? 'V' : 'A'}`;
  } else {
    warn.textContent = '';
  }
}

function validateFixedField(ch, field) {
  const warnEl = $(field === 'v' ? `pstFixWarnV${ch}` : `pstFixWarnI${ch}`);
  if (!warnEl) return;
  const inputEl = $(field === 'v' ? `pstVset${ch}` : `pstIset${ch}`);
  if (!inputEl || inputEl.value === '') { warnEl.textContent = ''; return; }
  const val = parseFloat(inputEl.value);
  if (isNaN(val)) { warnEl.textContent = ''; return; }
  if (field === 'v') {
    const physMax = CH_MAX_V[ch];
    const syncMax = (ch === 1 && S?.syncCh3 && S.trackMode === 0) ? CH_MAX_V[3] : physMax;
    if (val > physMax) {
      // 채널 물리 최대값 초과 → 즉시 자동 교정 + 안내
      inputEl.value = physMax.toFixed(2);
      warnEl.textContent = `↩ 최대 ${physMax}V로 자동 조정됨`;
      warnEl.style.color = '#60a5fa';
    } else if (val > syncMax) {
      warnEl.style.color = '#60a5fa';
      warnEl.textContent = `↩ 3채널 최대 전압(${syncMax}V)으로 조정됩니다`;
    } else if (val < 0) {
      warnEl.style.color = '#f87171';
      warnEl.textContent = '⚠ 0V 이상 입력';
    } else {
      warnEl.textContent = '';
    }
  } else {
    const max = CH_MAX_I[ch];
    if (val > max) {
      // 채널 물리 최대값 초과 → 즉시 자동 교정 + 안내
      inputEl.value = max.toFixed(3);
      warnEl.textContent = `↩ 최대 ${max}A로 자동 조정됨`;
      warnEl.style.color = '#60a5fa';
    } else if (val < 0) {
      warnEl.style.color = '#f87171';
      warnEl.textContent = '⚠ 0A 이상 입력';
    } else {
      warnEl.textContent = '';
    }
  }
}

function addStep() {
  const ch = S.editorCh;
  const i = parseFloat($('pstCeI')?.value);
  const t = parseInt($('pstCeT')?.value);
  let v;
  const effV = _effMaxV(ch);
  if (S.ch[ch - 1].ctrlMode === 'CC') {
    v = effV;
  } else {
    v = parseFloat($('pstCeV')?.value);
    if (isNaN(v) || v < 0 || v > effV) { showWarningModal(`전압 허용치 범위를 초과했습니다.\n허용 범위: 0 ~ ${effV} V`); return; }
  }
  if (isNaN(i) || i < 0 || i > CH_MAX_I[ch]) { showWarningModal(`전류 허용치 범위를 초과했습니다.\n허용 범위: 0 ~ ${CH_MAX_I[ch]} A`); return; }
  if (isNaN(t) || t < 1) { showWarningModal('시간 허용치 범위를 초과했습니다.\n허용 범위: 최소 1초 이상'); return; }
  S.cySteps[ch - 1].push({ v, i, t });
  if (S.syncCh1Ch2 && S.trackMode === 0 && ch === 1) S.cySteps[1].push({ v, i, t });
  if (S.syncCh3 && S.trackMode === 0 && ch === 1) S.cySteps[2].push({ v: Math.min(v, CH_MAX_V[3]), i: Math.min(i, CH3_SYNC_MAX_I), t });
  const cev = $('pstCeV'), cei = $('pstCeI');
  if (cev) { cev.value = ''; cev.focus(); } if (cei) cei.value = '';
  renderStepTable();
}

function delStep(idx) {
  const ch = S.editorCh;
  if (S.cyState[ch - 1].running) return;
  S.cySteps[ch - 1].splice(idx, 1);
  if (S.syncCh1Ch2 && S.trackMode === 0 && ch === 1) S.cySteps[1].splice(idx, 1);
  if (S.syncCh3 && S.trackMode === 0 && ch === 1) S.cySteps[2].splice(idx, 1);
  renderStepTable();
}

function editStep(idx, field, val) {
  const ch = S.editorCh;
  if (S.cyState[ch - 1].running) return;
  const s = S.cySteps[ch - 1][idx];
  if (!s) return;
  const num = field === 't' ? parseInt(val) : parseFloat(val);
  if (field === 'v' && (isNaN(num) || num < 0 || num > _effMaxV(ch))) {
    showWarningModal(`전압 허용치 범위를 초과했습니다.\n허용 범위: 0 ~ ${_effMaxV(ch)} V`); renderStepTable(); return;
  }
  if (field === 'i' && (isNaN(num) || num < 0 || num > CH_MAX_I[ch])) {
    showWarningModal(`전류 허용치 범위를 초과했습니다.\n허용 범위: 0 ~ ${CH_MAX_I[ch]} A`); renderStepTable(); return;
  }
  if (field === 't' && (isNaN(num) || num < 1)) {
    showWarningModal('시간 허용치 범위를 초과했습니다.\n허용 범위: 최소 1초 이상'); renderStepTable(); return;
  }
  s[field] = num;
  if (S.syncCh1Ch2 && S.trackMode === 0 && ch === 1) {
    const s2 = S.cySteps[1][idx]; if (s2) s2[field] = num;
  }
  if (S.syncCh3 && S.trackMode === 0 && ch === 1) {
    const s3 = S.cySteps[2][idx];
    if (s3) {
      if (field === 'v') s3[field] = Math.min(num, CH_MAX_V[3]);
      else if (field === 'i') s3[field] = Math.min(num, CH3_SYNC_MAX_I);
      else s3[field] = num;
    }
  }
  renderStepTable();
}

// ── Cycle Execution ───────────────────────────────────────────────────────────
function toggleCycle() {
  if (S.cyState[S.editorCh - 1].running) stopCycle(); else startCycle();
}

function toggleStartAllCycles() {
  const anyRunning = [0, 1, 2].some(i => S.cyState[i].running);
  if (anyRunning) stopAllCycles(); else startAllCycles();
}

function startCycle() {
  if (!app?.serial?.isConnected) { showWarningModal('장치를 먼저 연결해 주세요.', '연결 필요'); return; }
  const ch = S.editorCh;
  if (!S.cySteps[ch - 1].length) { showWarningModal(`CH${ch}에 설정된 사이클 단계가 없습니다.\n왼쪽 필드에서 단계를 추가해주세요.`, '단계 없음'); return; }
  S.cycleStartType = 'single';
  if (!S.outputActive) { pstLog(`[사이클] CH${ch}: 출력 자동 ON`, 'info'); _startOutputThenCh(ch); return; }
  _startCh(ch);
}

function stopCycle() {
  _stopCh(S.editorCh);
  checkAndAutoStopOutput();
}

function startAllCycles() {
  if (!app?.serial?.isConnected) { showWarningModal('장치를 먼저 연결해 주세요.', '연결 필요'); return; }
  const cycleChs = [1, 2, 3].filter(c => S.ch[c - 1].mode === 'cycle' && S.cySteps[c - 1].length > 0);
  if (!cycleChs.length) { showWarningModal('사이클로 동작시킬 채널의 단계가 없습니다.\n먼저 단계를 구성해 주세요.', '단계 없음'); return; }
  S.cycleStartType = 'all';
  if (!S.outputActive) {
    pstLog('[사이클] 출력 자동 ON', 'info');
    _startOutputSeq(() => cycleChs.forEach(ch => _startCh(ch)));
    return;
  }
  cycleChs.forEach(ch => _startCh(ch));
}

function stopAllCycles() {
  [1, 2, 3].forEach(c => { if (S.cyState[c - 1].running) _stopCh(c); });
  checkAndAutoStopOutput();
}

function _startOutputThenCh(ch) {
  _startOutputSeq(() => _startCh(ch));
}

function _startOutputSeq(after) {
  const apSteps = buildApplySteps();
  apSteps.push([`:OUTPut:STATe 1`, () => {
    S.outputActive = true;
    S.outputStartTime = Date.now();
    updateOutUI();
    viewLiveGraph();
    clearGraph();
    doPoll();
  }]);
  _runSeq(apSteps, () => { after?.(); });
}

function _startCh(ch) {
  const st = S.cyState[ch - 1];
  if (st.timer) { clearInterval(st.timer); st.timer = null; }
  Object.assign(st, { running: true, stepIdx: 0, loopCount: 1, remaining: 0 });
  updateEditorControls();
  updateGraphLegend();
  _runStep(ch);
}

function _stopCh(ch) {
  const st = S.cyState[ch - 1];
  if (!st.running && !st.timer) return;
  st.running = false;
  if (st.timer) { clearInterval(st.timer); st.timer = null; }
  updateGraphLegend();
  pstLog(`[사이클] CH${ch} 중지`, 'warn');
  updateEditorControls();
  if (S.editorCh === ch) renderStepTable();
}

function _runStep(ch) {
  const st = S.cyState[ch - 1];
  if (!st.running) return;
  const steps = S.cySteps[ch - 1];
  const s = steps[st.stepIdx];
  st.remaining = s.t;
  pstLog(`[사이클] CH${ch} 단계 ${st.stepIdx + 1}: ${s.v.toFixed(2)}V ${s.i.toFixed(3)}A (${s.t}초)`, 'ok');
  const cmdSteps = [
    [`:CHANnel${ch}:VOLTage ${s.v.toFixed(3)}`],
    [`:CHANnel${ch}:CURRent ${s.i.toFixed(3)}`],
  ];
  if (S.trackMode === 1 && ch === 1) {
    cmdSteps.push([`:CHANnel2:VOLTage ${s.v.toFixed(3)}`]);
    cmdSteps.push([`:CHANnel2:CURRent ${s.i.toFixed(3)}`]);
  } else if (S.trackMode === 2 && ch === 2) {
    cmdSteps.push([`:CHANnel1:VOLTage ${s.v.toFixed(3)}`]);
    cmdSteps.push([`:CHANnel1:CURRent ${s.i.toFixed(3)}`]);
  }
  _runSeq(cmdSteps, () => {
    if (S.editorCh === ch) renderStepTable();
    updateEditorControls();
    st.timer = setInterval(() => {
      if (!st.running) { clearInterval(st.timer); st.timer = null; return; }
      st.remaining--;
      updateEditorControls();
      if (st.remaining <= 0) {
        clearInterval(st.timer); st.timer = null;
        st.stepIdx++;
        if (st.stepIdx >= S.cySteps[ch - 1].length) {
          st.stepIdx = 0; st.loopCount++;
          const loops = parseInt($('pstCeLoops')?.value) || 1;
          if (st.loopCount > loops) {
            pstLog(`[사이클] CH${ch} 완료`, 'ok');
            _stopCh(ch);
            checkAndAutoStopOutput();
            return;
          }
        }
        _runStep(ch);
      }
    }, 1000);
  });
}

function checkAndAutoStopOutput() {
  const anyRunning = [0, 1, 2].some(i => S.cyState[i].running);
  if (!anyRunning && S.outputActive) {
    pstLog('[사이클] 모든 채널 사이클 완료 — 출력 자동 정지', 'ok');
    _stopOutputSeq();
  }
}

// ── Output Control ────────────────────────────────────────────────────────────
function buildApplySteps() {
  const steps = [];
  syncTrackingSettings();
  for (let ch = 1; ch <= 3; ch++) {
    if (S.ch[ch - 1].mode === 'cycle') continue;
    if (S.trackMode === 1 && ch === 3 && !($('pstCh3Use')?.checked ?? true)) continue;
    const vval = $(`pstVset${ch}`)?.value ?? '';
    const ival = $(`pstIset${ch}`)?.value ?? '';
    if (S.ch[ch - 1].ctrlMode === 'CC') {
      if (ival !== '') {
        const iset = parseFloat(ival) || 0;
        steps.push([`:CHANnel${ch}:VOLTage ${CH_MAX_V[ch].toFixed(3)}`]);
        steps.push([`:CHANnel${ch}:CURRent ${iset.toFixed(3)}`]);
      }
    } else {
      if (vval !== '') {
        const vset = parseFloat(vval) || 0;
        steps.push([`:CHANnel${ch}:VOLTage ${vset.toFixed(3)}`]);
      }
      if (ival !== '') {
        const iset = parseFloat(ival) || 0;
        steps.push([`:CHANnel${ch}:CURRent ${iset.toFixed(3)}`]);
      }
    }
  }
  return steps;
}

function toggleOutput() {
  if (!app?.serial?.isConnected) return;
  if (!S.outputActive) {
    const steps = buildApplySteps();
    steps.push([`:OUTPut:STATe 1`, () => {
      S.outputActive = true;
      S.outputStartTime = Date.now();
      updateOutUI();
      viewLiveGraph();
      clearGraph();
      if ($('pstTestElapsed')) $('pstTestElapsed').textContent = '0초';
      doPoll();
    }]);
    _runSeq(steps);
    pstLog('TX: :OUTPut:STATe 1 (apply all → ON)', 'tx');
  } else {
    _stopOutputSeq();
  }
}

function _stopOutputSeq() {
  _runSeq([[`:OUTPut:STATe 0`, () => {
    S.outputActive = false;
    S.outputStartTime = null;
    stopPoll();
    updateOutUI();
    stopAllCycles();
    createEvalRecord();
  }]]);
  pstLog('TX: :OUTPut:STATe 0', 'tx');
}

function setAutoStopToggle(on) {
  S.autoStopOnZero = on;
  pstLog(`0A 자동 정지 ${on ? '켜짐' : '꺼짐'}`, 'info');
}

function handleCurrentMeas(c) {
  if (!S.autoStopOnZero || !S.outputActive || !S.outputStartTime) return;
  if (Date.now() - S.outputStartTime < 2000) return;
  const active = [1, 2, 3].filter(ch => {
    const v = parseFloat($(`pstVset${ch}`)?.value) || 0;
    const i = parseFloat($(`pstIset${ch}`)?.value) || 0;
    return v > 0 || i > 0 || S.ch[ch - 1].mode === 'cycle';
  });
  if (!active.includes(c)) return;
  const allZero = active.every(ch => S.ch[ch - 1].measI.toFixed(3) === '0.000');
  if (allZero) {
    pstLog('시작 2초 경과 후 모든 채널 전류 0.000A — 출력 자동 정지', 'warn');
    _stopOutputSeq();
  }
}

// ── Tracking / Protection ─────────────────────────────────────────────────────
function setTM(mode) {
  S.trackMode = +mode;
  if (app?.serial?.isConnected) {
    _runSeq([[`:OUTPut:COUPle:TRACking ${S.trackMode}`]]);
    pstLog(`TX: :OUTPut:COUPle:TRACking ${S.trackMode} (${TRACK_LABEL[S.trackMode]})`, 'tx');
  }
  if (S.trackMode === 0) {
    const toggle2 = $('pstCh2Use'); if (toggle2) toggle2.checked = false;
    const toggle3 = $('pstCh3Use'); if (toggle3) toggle3.checked = false;
  }
  updateTrackModeUI();
  updateGraphLegend();
  drawGraph();
  showTrackImageModal(S.trackMode);
}

function setOCP(ch, on) {
  S.ch[ch - 1].ocpOn = on;
  const cmdSteps = [[`:CHANnel${ch}:PROTection:CURRent ${on ? 1 : 0}`]];
  if (ch === 1 && S.trackMode === 1) {
    cmdSteps.push([`:CHANnel2:PROTection:CURRent ${on ? 1 : 0}`]);
    const ocp2 = $('pstOcp2'); if (ocp2) ocp2.checked = on;
    S.ch[1].ocpOn = on;
  } else if (ch === 2 && S.trackMode === 2) {
    cmdSteps.push([`:CHANnel1:PROTection:CURRent ${on ? 1 : 0}`]);
    const ocp1 = $('pstOcp1'); if (ocp1) ocp1.checked = on;
    S.ch[0].ocpOn = on;
  } else if (ch === 1 && S.syncCh1Ch2 && S.trackMode === 0) {
    cmdSteps.push([`:CHANnel2:PROTection:CURRent ${on ? 1 : 0}`]);
    const ocp2 = $('pstOcp2'); if (ocp2) ocp2.checked = on;
    S.ch[1].ocpOn = on;
  }
  if (ch === 1 && S.syncCh3 && S.trackMode === 0) {
    cmdSteps.push([`:CHANnel3:PROTection:CURRent ${on ? 1 : 0}`]);
    const ocp3 = $('pstOcp3'); if (ocp3) ocp3.checked = on;
    S.ch[2].ocpOn = on;
  }
  _runSeq(cmdSteps);
  const syncNote = [ch===1&&S.syncCh1Ch2&&S.trackMode===0?'CH2':null, ch===1&&S.syncCh3&&S.trackMode===0?'CH3':null].filter(Boolean);
  pstLog(`TX: CH${ch} OCP ${on ? 'ON' : 'OFF'}${syncNote.length?' → '+syncNote.join('/')+' 동기화':''}`, 'tx');
}

let _ovpCh = 1;
function setOVP(ch) {
  _ovpCh = ch;
  const cur = S.ch[ch - 1].measV || 0;
  const modal = $('pstOvpModal'); if (!modal) return;
  const title = $('pstOvpModalTitle'); if (title) title.textContent = `CH${ch} OVP 설정`;
  const maxV = CH_MAX_V[ch];
  const hint = $('pstOvpModalHint'); if (hint) hint.textContent = `허용 범위: 0 ~ ${maxV} V`;
  const inp = $('pstOvpInp');
  if (inp) { inp.value = cur.toFixed(2); inp.max = maxV; inp.placeholder = `0 ~ ${maxV}`; }
  modal.style.display = 'flex';
  setTimeout(() => inp?.focus(), 50);
}

function applyOvp() {
  const inp = $('pstOvpInp'); if (!inp) return;
  const val = parseFloat(inp.value);
  const maxV = CH_MAX_V[_ovpCh];
  if (isNaN(val) || val < 0 || val > maxV) {
    showWarningModal(`유효한 OVP 값을 입력하세요.\n허용 범위: 0 ~ ${maxV} V`, '입력 범위 초과');
    return;
  }
  closeOvpModal();
  S.ch[_ovpCh - 1].ovpVal = val;
  const cmdSteps = [[`:CHANnel${_ovpCh}:PROTection:VOLTage ${val.toFixed(3)}`]];
  if (_ovpCh === 1 && S.trackMode === 1) cmdSteps.push([`:CHANnel2:PROTection:VOLTage ${val.toFixed(3)}`]);
  else if (_ovpCh === 2 && S.trackMode === 2) cmdSteps.push([`:CHANnel1:PROTection:VOLTage ${val.toFixed(3)}`]);
  else if (_ovpCh === 1 && S.syncCh1Ch2 && S.trackMode === 0) {
    S.ch[1].ovpVal = val;
    cmdSteps.push([`:CHANnel2:PROTection:VOLTage ${val.toFixed(3)}`]);
  }
  if (_ovpCh === 1 && S.syncCh3 && S.trackMode === 0) {
    const ovp3 = Math.min(val, CH_MAX_V[3]);
    S.ch[2].ovpVal = ovp3;
    cmdSteps.push([`:CHANnel3:PROTection:VOLTage ${ovp3.toFixed(3)}`]);
  }
  _runSeq(cmdSteps);
  const syncNote = [_ovpCh===1&&S.syncCh1Ch2&&S.trackMode===0?'CH2':null, _ovpCh===1&&S.syncCh3&&S.trackMode===0?'CH3':null].filter(Boolean);
  pstLog(`TX: CH${_ovpCh} OVP = ${val.toFixed(3)} V${syncNote.length?' → '+syncNote.join('/')+' 동기화':''}`, 'tx');
}

function closeOvpModal() {
  const modal = $('pstOvpModal'); if (modal) modal.style.display = 'none';
}

function clearProtection() {
  _runSeq([[':OUTPut:PROTection:CLEar']]);
  pstLog('TX: :OUTPut:PROTection:CLEar', 'tx');
}

function setSyncCh1Ch2(on) {
  S.syncCh1Ch2 = on;
  const col = $('pstSyncCol'); if (col) col.classList.toggle('pst-sync-on', on);
  const chk = $('pstSyncCh'); if (chk) chk.checked = on;
  if (on) {
    // CH2 사용 토글이 꺼져 있으면 자동으로 켜기
    const ch2UseEl = $('pstCh2Use');
    if (ch2UseEl && !ch2UseEl.checked) {
      ch2UseEl.checked = true;
      syncTrackingSettings();
    }
    const cmdSteps = [];
    // 전압 동기화
    const v1 = parseFloat($('pstVset1')?.value);
    if (!isNaN(v1)) { const el = $('pstVset2'); if (el) el.value = v1.toFixed(2); cmdSteps.push([`:CHANnel2:VOLTage ${v1.toFixed(3)}`]); }
    // 전류 동기화
    const i1 = parseFloat($('pstIset1')?.value);
    if (!isNaN(i1)) {
      const el1 = $('pstIset1'); if (el1) el1.value = i1.toFixed(3);
      const el = $('pstIset2'); if (el) el.value = i1.toFixed(3);
      cmdSteps.push([`:CHANnel2:CURRent ${i1.toFixed(3)}`]);
    }
    // OCP 동기화
    const ocp1 = $('pstOcp1');
    if (ocp1) {
      const ocp2 = $('pstOcp2'); if (ocp2) ocp2.checked = ocp1.checked;
      S.ch[1].ocpOn = ocp1.checked;
      cmdSteps.push([`:CHANnel2:PROTection:CURRent ${ocp1.checked ? 1 : 0}`]);
    }
    // OVP 동기화 (CH1에 설정값이 있을 때만)
    if (S.ch[0].ovpVal != null) {
      S.ch[1].ovpVal = S.ch[0].ovpVal;
      cmdSteps.push([`:CHANnel2:PROTection:VOLTage ${S.ch[0].ovpVal.toFixed(3)}`]);
    }
    if (cmdSteps.length) _runSeq(cmdSteps);
    pstLog('CH1→CH2 동기화 ON: 전압/전류/OCP/OVP 일괄 적용', 'info');
  } else {
    if (S.syncCh3) setSyncCh3(false);
    pstLog('CH1→CH2 설정 동기화 OFF', 'info');
  }
  // CH3 행 표시/숨김
  const ch3Row = $('pstSyncCh3Row');
  if (ch3Row) ch3Row.style.display = on ? '' : 'none';
  // CH2 입력 잠금/해제 (사용 토글은 제외)
  const ch2Card = $('pstCh2');
  if (ch2Card) ch2Card.classList.toggle('pst-sync-lock', on);
  ['pstVset2', 'pstIset2'].forEach(id => { const el = $(id); if (el) el.disabled = on; });
  // 사이클 편집기 열려 있으면 라벨 갱신
  if ($('pstCycleEditor')?.style.display !== 'none') renderEditor();
}

function setSyncCh3(on) {
  S.syncCh3 = on;
  const chk = $('pstSyncCh3Chk'); if (chk) chk.checked = on;
  if (on) {
    // CH3 사용 토글이 꺼져 있으면 자동으로 켜기
    const ch3UseEl = $('pstCh3Use');
    if (ch3UseEl && !ch3UseEl.checked) {
      ch3UseEl.checked = true;
      syncTrackingSettings();
    }
    const cmdSteps = [];
    // 전압 동기화 (max 6V) — CH1 현재값이 6V 초과면 CH1/CH2도 6V로 일괄 낮춤
    const v1 = parseFloat($('pstVset1')?.value);
    if (!isNaN(v1)) {
      const vCap = Math.min(v1, CH_MAX_V[3]);
      if (v1 > CH_MAX_V[3]) {
        // CH1 강제 조정
        const el1 = $('pstVset1'); if (el1) el1.value = vCap.toFixed(2);
        cmdSteps.push([`:CHANnel1:VOLTage ${vCap.toFixed(3)}`]);
        // CH2도 동기화 중이면 함께 조정
        if (S.syncCh1Ch2) {
          const el2 = $('pstVset2'); if (el2) el2.value = vCap.toFixed(2);
          cmdSteps.push([`:CHANnel2:VOLTage ${vCap.toFixed(3)}`]);
        }
        // CH1 경고 표시
        const wEl = $('pstFixWarnV1');
        if (wEl) { wEl.textContent = `↩ 3채널 최대 전압(${CH_MAX_V[3]}V)으로 전체 채널 조정됩니다`; wEl.style.color = '#60a5fa'; }
      }
      const el = $('pstVset3'); if (el) el.value = vCap.toFixed(2);
      cmdSteps.push([`:CHANnel3:VOLTage ${vCap.toFixed(3)}`]);
    }
    // 전류 동기화 (max 2A)
    const i1 = parseFloat($('pstIset1')?.value);
    if (!isNaN(i1)) {
      const i3 = Math.min(i1, CH3_SYNC_MAX_I);
      const el1 = $('pstIset1'); if (el1) el1.value = i1.toFixed(3);
      if (S.syncCh1Ch2) { const el2 = $('pstIset2'); if (el2) el2.value = i1.toFixed(3); }
      const el = $('pstIset3'); if (el) el.value = i3.toFixed(3);
      cmdSteps.push([`:CHANnel3:CURRent ${i3.toFixed(3)}`]);
    }
    // OCP 동기화
    const ocp1 = $('pstOcp1');
    if (ocp1) {
      const ocp3 = $('pstOcp3'); if (ocp3) ocp3.checked = ocp1.checked;
      S.ch[2].ocpOn = ocp1.checked;
      cmdSteps.push([`:CHANnel3:PROTection:CURRent ${ocp1.checked ? 1 : 0}`]);
    }
    // OVP 동기화 (CH1 설정값이 있을 때, max 6V)
    if (S.ch[0].ovpVal != null) {
      const ovp3 = Math.min(S.ch[0].ovpVal, CH_MAX_V[3]);
      S.ch[2].ovpVal = ovp3;
      cmdSteps.push([`:CHANnel3:PROTection:VOLTage ${ovp3.toFixed(3)}`]);
    }
    // 제어 모드 동기화
    S.ch[2].ctrlMode = S.ch[0].ctrlMode;
    refreshCtrlModeUI(3);
    // 모드 동기화
    const m = S.ch[0].mode;
    S.ch[2].mode = m;
    const fix3 = $('pstFix3'); if (fix3) fix3.style.display = m === 'fixed' ? '' : 'none';
    $('pstTf3')?.classList.toggle('active', m === 'fixed');
    $('pstTc3')?.classList.toggle('active', m === 'cycle');
    // 사이클 동기화
    S.cySteps[2] = S.cySteps[0].map(s => ({
      v: Math.min(s.v, CH_MAX_V[3]),
      i: Math.min(s.i, CH3_SYNC_MAX_I),
      t: s.t,
    }));
    if ($('pstCycleEditor')?.style.display !== 'none') renderStepTable();
    if (cmdSteps.length) _runSeq(cmdSteps);
    pstLog('CH1→CH3 동기화 ON: 전압(≤6V)/전류(≤2A)/OCP/OVP/모드 일괄 적용', 'info');
  } else {
    pstLog('CH1→CH3 설정 동기화 OFF', 'info');
  }
  // CH3 입력 잠금/해제 (사용 토글은 제외)
  const ch3Card = $('pstCh3');
  if (ch3Card) ch3Card.classList.toggle('pst-sync-lock', on);
  ['pstVset3', 'pstIset3'].forEach(id => { const el = $(id); if (el) el.disabled = on; });
  // CH3 스팩 라벨 업데이트
  const spec3 = $('pstCh3Spec');
  if (spec3) spec3.textContent = on ? '0–6V / 0–2A (동기화)' : '0–6V / 0–5A';
  // 사이클 편집기 열려 있으면 라벨 갱신
  if ($('pstCycleEditor')?.style.display !== 'none') renderEditor();
}

function setV(ch) {
  let val = parseFloat($(`pstVset${ch}`)?.value);
  if (isNaN(val) || val < 0) return;
  // 채널 물리 최대값 초과 시 자동 클램핑
  if (val > CH_MAX_V[ch]) {
    val = CH_MAX_V[ch];
    const el = $(`pstVset${ch}`); if (el) el.value = val.toFixed(2);
  }
  // CH3 동기화 ON 시 CH1 전압도 CH3 최대값(6V)으로 클램핑 후 전체 적용
  if (ch === 1 && S.syncCh3 && S.trackMode === 0 && val > CH_MAX_V[3]) {
    val = CH_MAX_V[3];
    const el = $(`pstVset${ch}`); if (el) el.value = val.toFixed(2);
    const wEl = $(`pstFixWarnV${ch}`);
    if (wEl) { wEl.textContent = `↩ 3채널 최대 전압(${CH_MAX_V[3]}V)으로 조정됩니다`; wEl.style.color = '#60a5fa'; }
  } else {
    const wEl = $(`pstFixWarnV${ch}`); if (wEl) { wEl.textContent = ''; wEl.style.color = ''; }
  }
  const steps = [[`:CHANnel${ch}:VOLTage ${val.toFixed(3)}`]];
  const syncNote = [];
  if (ch === 1 && S.syncCh1Ch2 && S.trackMode === 0) {
    const el = $('pstVset2'); if (el) el.value = val.toFixed(2);
    steps.push([`:CHANnel2:VOLTage ${val.toFixed(3)}`]);
    syncNote.push('CH2');
  }
  if (ch === 1 && S.syncCh3 && S.trackMode === 0) {
    const el = $('pstVset3'); if (el) el.value = val.toFixed(2);
    steps.push([`:CHANnel3:VOLTage ${val.toFixed(3)}`]);
    syncNote.push('CH3');
  }
  _runSeq(steps);
  pstLog(`TX: CH${ch} V = ${val.toFixed(3)} V${syncNote.length ? ' → '+syncNote.join('/')+' 동기화' : ''}`, 'tx');
}

function setI(ch) {
  let val = parseFloat($(`pstIset${ch}`)?.value);
  if (isNaN(val) || val < 0) return;
  // 채널 물리 최대값 초과 시 자동 클램핑
  if (val > CH_MAX_I[ch]) {
    val = CH_MAX_I[ch];
    const el = $(`pstIset${ch}`); if (el) el.value = val.toFixed(3);
  }
  // 입력창 소수점 3자리로 정규화 (예: "2" → "2.000")
  const inputElI = $(`pstIset${ch}`); if (inputElI) inputElI.value = val.toFixed(3);
  const wElI = $(`pstFixWarnI${ch}`); if (wElI) { wElI.textContent = ''; wElI.style.color = ''; }
  const steps = [[`:CHANnel${ch}:CURRent ${val.toFixed(3)}`]];
  const syncNote = [];
  if (ch === 1 && S.syncCh1Ch2 && S.trackMode === 0) {
    const el = $('pstIset2'); if (el) el.value = val.toFixed(3);
    steps.push([`:CHANnel2:CURRent ${val.toFixed(3)}`]);
    syncNote.push('CH2');
  }
  if (ch === 1 && S.syncCh3 && S.trackMode === 0) {
    const i3 = Math.min(val, CH3_SYNC_MAX_I);
    const el = $('pstIset3'); if (el) el.value = i3.toFixed(3);
    steps.push([`:CHANnel3:CURRent ${i3.toFixed(3)}`]);
    syncNote.push('CH3');
  }
  if (ch === 2 && S.trackMode === 2) {
    steps.push([`:CHANnel1:CURRent ${val.toFixed(3)}`]);
    const i1 = $('pstIset1'); if (i1) i1.value = val.toFixed(3);
  }
  _runSeq(steps);
  pstLog(`TX: CH${ch} I = ${val.toFixed(3)} A${syncNote.length ? ' → '+syncNote.join('/')+' 동기화' : ''}`, 'tx');
}

// ── Graph ─────────────────────────────────────────────────────────────────────
function activeGraphChannels() {
  const s = new Set();
  [1, 2, 3].forEach(c => {
    if (S.cyState[c - 1].running || S.ch[c - 1].mode === 'cycle') s.add(c);
    else if (isChUsed(c)) s.add(c);
  });
  return [...s].sort((a, b) => a - b);
}

function updateGraphLegend() {
  const active = new Set(activeGraphChannels());
  document.querySelectorAll('.pst-gli').forEach(el => {
    el.style.display = active.has(parseInt(el.dataset.ch)) ? '' : 'none';
  });
}

function clearGraph() {
  S.gData = { ts: [], v: [[], [], []], i: [[], [], []] };
  const c = $('pstChart'), ctx = c?.getContext('2d');
  if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
}

function recordGraphData() {
  if (!S.outputActive) return;
  const now = Date.now();
  S.gData.ts.push(now);
  [0, 1, 2].forEach(i => {
    S.gData.v[i].push(S.ch[i].measV);
    S.gData.i[i].push(S.ch[i].measI);
  });
  const elapsed = (now - S.gData.ts[0]) / 1000;
  const el = $('pstTestElapsed');
  if (el) {
    const m = Math.floor(elapsed / 60), s = Math.floor(elapsed % 60);
    el.textContent = m > 0 ? `${m}분 ${s}초` : `${Math.floor(elapsed)}초`;
  }
  drawGraph();
}

function graphSource() {
  if (S.viewingEvalId !== null) {
    const rec = S.evalRecords.find(r => r.id === S.viewingEvalId);
    if (rec) {
      const v = rec.raw?.v || [[], [], []];
      const i = rec.raw?.i || [[], [], []];
      const ts = rec.raw?.ts || [];
      const activeChs = activeChannelsOfRecord(rec);
      return { ts, v, i, chIdxs: activeChs.map(c => c - 1) };
    }
  }
  return { ts: S.gData.ts, v: S.gData.v, i: S.gData.i, chIdxs: activeGraphChannels().map(c => c - 1) };
}

function drawGraph() {
  const canvas = $('pstChart');
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext('2d');
  const P = { t: 10, r: 48, b: 28, l: 52 };
  const cw = W - P.l - P.r, ch = H - P.t - P.b;
  const isLight = document.body.classList.contains('light');
  const T = {
    bg:     isLight ? '#edf2f7' : '#060e17',
    grid:   isLight ? 'rgba(0,0,0,0.07)'   : 'rgba(255,255,255,0.06)',
    border: isLight ? 'rgba(80,110,140,.4)' : 'rgba(31,59,86,.9)',
    axis:   isLight ? 'rgba(60,90,120,0.6)' : 'rgba(138,163,189,0.5)',
  };
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  const src = graphSource();
  const n = src.ts.length; if (n < 2) return;
  const tMin = src.ts[0], tMax = src.ts[n - 1];
  const chIdxs = src.chIdxs;
  let vVals = [], iVals = [];
  chIdxs.forEach(i => { vVals.push(...src.v[i]); iVals.push(...src.i[i]); });
  const yMaxV = Math.max(...vVals.filter(v => isFinite(v)), 0.5) * 1.15 || 1;
  const yMaxI = Math.max(...iVals.filter(v => isFinite(v)), 0.05) * 1.15 || 1;
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let g = 0; g <= 5; g++) {
    const y = P.t + ch * (1 - g / 5);
    ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(P.l + cw, y); ctx.stroke();
    ctx.fillStyle = GV[0]; ctx.font = '10px Inter'; ctx.textAlign = 'right';
    ctx.fillText((yMaxV * g / 5).toFixed(1), P.l - 4, y + 4);
    ctx.fillStyle = GI[0]; ctx.textAlign = 'left';
    ctx.fillText((yMaxI * g / 5).toFixed(3), P.l + cw + 6, y + 4);
  }
  ctx.fillStyle = T.axis; ctx.font = '10px Inter'; ctx.textAlign = 'center';
  for (let g = 0; g <= 4; g++) {
    const x = P.l + cw * g / 4;
    ctx.fillText(`${((tMax - tMin) / 1000 * (g / 4)).toFixed(0)}s`, x, H - P.b + 14);
  }
  ctx.save(); ctx.beginPath(); ctx.rect(P.l, P.t, cw, ch); ctx.clip();
  const toX = t => P.l + cw * (t - tMin) / (tMax - tMin);
  const toYv = v => P.t + ch * (1 - v / yMaxV);
  const toYi = v => P.t + ch * (1 - v / yMaxI);
  chIdxs.forEach(idx => {
    ctx.strokeStyle = GV[idx]; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath(); let s = false;
    src.ts.forEach((t, j) => {
      if (t < tMin) return; const x = toX(t), y = toYv(src.v[idx][j] || 0);
      if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
    }); ctx.stroke();
    ctx.strokeStyle = GI[idx]; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
    ctx.beginPath(); s = false;
    src.ts.forEach((t, j) => {
      if (t < tMin) return; const x = toX(t), y = toYi(src.i[idx][j] || 0);
      if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
    }); ctx.stroke();
  });
  ctx.restore(); ctx.setLineDash([]);
  ctx.strokeStyle = T.border; ctx.lineWidth = 1; ctx.strokeRect(P.l, P.t, cw, ch);
  ctx.fillStyle = GV[0]; ctx.font = '9px Inter'; ctx.textAlign = 'left'; ctx.fillText('V', P.l - 4, P.t - 2);
  ctx.fillStyle = GI[0]; ctx.fillText('A', P.l + cw + 6, P.t - 2);
}

function viewEval(id) {
  S.viewingEvalId = id;
  const badge = $('pstViewingBadge'); if (badge) badge.style.display = '';
  renderEvalTable();
  drawGraph();
}

function viewLiveGraph() {
  S.viewingEvalId = null;
  const badge = $('pstViewingBadge'); if (badge) badge.style.display = 'none';
  renderEvalTable();
  drawGraph();
}

function resetGraph() {
  if (S.gData.ts.length && !confirm('그래프 데이터를 초기화하시겠습니까?')) return;
  clearGraph();
  const el = $('pstTestElapsed'); if (el) el.textContent = '0초';
  pstLog('그래프 데이터 초기화됨', 'info');
}

// ── Eval Records ──────────────────────────────────────────────────────────────
function activeChannelsOfRecord(rec) {
  const v = rec.raw?.v || [[], [], []], i = rec.raw?.i || [[], [], []];
  const isActive = idx => (v[idx] && v[idx].some(x => x !== 0)) || (i[idx] && i[idx].some(x => x !== 0));
  if (rec.trackMode === 1) { const chs = [1, 2]; if (isActive(2)) chs.push(3); return chs; }
  if (rec.trackMode === 2) return [1, 2];
  const cycle = [1, 2, 3].filter(ch => rec.chData[ch]?.mode === 'cycle');
  if (cycle.length) return cycle;
  const active = [1, 2, 3].filter(ch => isActive(ch - 1));
  return active.length ? active : [1];
}

function buildChData() {
  const chData = {};
  [1, 2, 3].forEach(ch => {
    const tracked = (ch === 1 && S.trackMode !== 0);
    if (S.ch[ch - 1].mode === 'cycle') {
      chData[ch] = { mode: 'cycle', steps: S.cySteps[ch - 1].map(s => ({ ...s })), tracked };
    } else {
      chData[ch] = {
        mode: 'fixed', v: parseFloat($(`pstVset${ch}`)?.value) || 0,
        i: parseFloat($(`pstIset${ch}`)?.value) || 0, tracked
      };
    }
  });
  return chData;
}

function createEvalRecord() {
  if (!S.gData.ts.length) {
    const now = Date.now();
    S.gData.ts.push(now);
    [0, 1, 2].forEach(i => { S.gData.v[i].push(S.ch[i].measV); S.gData.i[i].push(S.ch[i].measI); });
  }
  const raw = {
    ts: [...S.gData.ts],
    v: [S.gData.v[0].slice(), S.gData.v[1].slice(), S.gData.v[2].slice()],
    i: [S.gData.i[0].slice(), S.gData.i[1].slice(), S.gData.i[2].slice()],
  };
  const chData = buildChData();

  const checked = S.evalRecords.filter(r => r.checked);
  if (checked.length === 1) {
    const rec = checked[0];
    Object.assign(rec, { trackMode: S.trackMode, chData, raw, timestamp: Date.now(), checked: false });
    rec.maxCurrent = computeMaxCurrent(rec);
    pstLog(`평가 기록 덮어씀: ${rec.name} (최대 전류 ${rec.maxCurrent.toFixed(3)}A)`, 'ok');
    renderEvalTable();
    saveEvalRecords();
    return;
  }

  const id = S.nextEvalId++;
  const rec = {
    id, name: '샘플', checked: false, trackMode: S.trackMode, chData, raw,
    timestamp: Date.now(), stressCondition: '', agingTime: ''
  };
  rec.maxCurrent = computeMaxCurrent(rec);
  S.evalRecords.push(rec);
  renderEvalTable();
  pstLog(`평가 기록 저장됨: ${rec.name} (최대 전류 ${rec.maxCurrent.toFixed(3)}A)`, 'ok');
  saveEvalRecords();
}

function computeMaxCurrent(rec) {
  let max = 0;
  const i = rec.raw?.i || [[], [], []];
  [0, 1, 2].forEach(idx => { (i[idx] || []).forEach(v => { if (v > max) max = v; }); });
  if (rec.trackMode !== 0) {
    const ts = rec.raw?.ts || [];
    for (let j = 0; j < ts.length; j++) {
      const tot = (i[0]?.[j] || 0) + (i[1]?.[j] || 0);
      if (tot > max) max = tot;
    }
  }
  return max;
}

function evalConditionText(rec) {
  const lines = [];
  [1, 2, 3].forEach(ch => {
    const cd = rec.chData?.[ch];
    if (!cd) return;
    if (cd.mode === 'cycle') {
      if (!cd.steps?.length) return;
      lines.push(`CH${ch}(사이클): ${cd.steps.map((s, i) => `#${i + 1} ${s.v.toFixed(2)}V/${s.i.toFixed(3)}A/${s.t}s`).join(', ')}`);
    } else {
      if (cd.v <= 0 && cd.i <= 0 && !cd.tracked) return;
      const vTxt = cd.tracked ? 'CH2 트래킹' : `${cd.v.toFixed(2)}V`;
      lines.push(`CH${ch}(고정): ${vTxt} / ${cd.i.toFixed(3)}A`);
    }
  });
  return lines.join('  |  ') || '(설정값 없음)';
}

function evalModeOf(rec) {
  return Object.values(rec.chData || {}).some(c => c.mode === 'cycle') ? 'cycle' : 'fixed';
}

function evalDateStr(rec) {
  const d = new Date(rec.timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function evalNumbering() {
  const counts = {}, numbers = {};
  S.evalRecords.forEach(rec => {
    const key = `${rec.name}||${evalConditionText(rec)}`;
    counts[key] = (counts[key] || 0) + 1;
    numbers[rec.id] = counts[key];
  });
  return numbers;
}

function setEvalFilter() {
  S.evalFilters.track = $('pstEvalFilterTrack')?.value || 'all';
  S.evalFilters.mode = $('pstEvalFilterMode')?.value || 'all';
  S.evalFilters.date = $('pstEvalFilterDate')?.value || 'all';
  S.evalFilters.stress = $('pstEvalFilterStress')?.value || 'all';
  S.evalFilters.aging = $('pstEvalFilterAging')?.value || 'all';
  renderEvalTable();
}

function updateDynFilter(selId, values) {
  const sel = $(selId); if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = `<option value="all">전체</option>` +
    values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  sel.value = values.includes(prev) ? prev : 'all';
}

function updateEvalOptionLists() {
  const stressVals = [...new Set(S.evalRecords.map(r => r.stressCondition).filter(Boolean))].sort();
  const agingVals = [...new Set(S.evalRecords.map(r => r.agingTime).filter(Boolean))].sort();

  const dlStress = $('stressConditionOptions');
  if (dlStress) dlStress.innerHTML = stressVals.map(v => `<option value="${esc(v)}">`).join('');
  const dlAging = $('agingTimeOptions');
  if (dlAging) dlAging.innerHTML = agingVals.map(v => `<option value="${esc(v)}">`).join('');

  updateDynFilter('pstEvalFilterStress', stressVals);
  updateDynFilter('pstEvalFilterAging', agingVals);
}

function renderEvalTable() {
  const tbody = $('pstEvalTbody'); if (!tbody) return;
  const dates = [...new Set(S.evalRecords.map(evalDateStr))].sort();
  updateDynFilter('pstEvalFilterDate', dates);
  updateEvalOptionLists();

  const filters = S.evalFilters;
  const filtered = S.evalRecords.filter(rec =>
    (filters.track === 'all' || String(rec.trackMode) === filters.track) &&
    (filters.mode === 'all' || evalModeOf(rec) === filters.mode) &&
    (filters.date === 'all' || evalDateStr(rec) === filters.date) &&
    (filters.stress === 'all' || (rec.stressCondition || '') === filters.stress) &&
    (filters.aging === 'all' || (rec.agingTime || '') === filters.aging)
  );

  if (!S.evalRecords.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="pst-empty-steps">완료된 평가가 없습니다. "정지"를 눌러 측정을 마치면 여기에 기록됩니다.</td></tr>`;
    return;
  }
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="pst-empty-steps">필터 조건에 맞는 평가 기록이 없습니다.</td></tr>`;
    return;
  }

  const numbers = evalNumbering();
  tbody.innerHTML = '';
  filtered.forEach(rec => {
    const tr = document.createElement('tr');
    if (rec.id === S.viewingEvalId) tr.className = 'pst-viewing';
    tr.innerHTML = `
      <td onclick="event.stopPropagation()"><input type="checkbox" ${rec.checked ? 'checked' : ''} onchange="app.instr.toggleEvalCheck(${rec.id},this.checked)"></td>
      <td class="pst-eval-date">${evalDateStr(rec)}</td>
      <td onclick="event.stopPropagation()"><input type="text" class="pst-eval-name-inp" value="${esc(rec.name)}" onchange="app.instr.renameEval(${rec.id},this.value)"></td>
      <td class="pst-eval-num">${numbers[rec.id]}</td>
      <td>${TRACK_LABEL[rec.trackMode]}</td>
      <td>${evalModeOf(rec) === 'cycle' ? '사이클' : '고정값'}</td>
      <td onclick="event.stopPropagation()"><input type="text" class="pst-eval-name-inp" list="stressConditionOptions" value="${esc(rec.stressCondition || '')}" onchange="app.instr.setEvalStressCondition(${rec.id},this.value)"></td>
      <td onclick="event.stopPropagation()"><input type="text" class="pst-eval-name-inp" list="agingTimeOptions" value="${esc(rec.agingTime || '')}" onchange="app.instr.setEvalAgingTime(${rec.id},this.value)"></td>
      <td class="pst-eval-cond">${esc(evalConditionText(rec))}</td>
      <td class="pst-eval-imax">${rec.maxCurrent.toFixed(3)} A</td>`;
    tr.onclick = () => viewEval(rec.id);
    tbody.appendChild(tr);
  });
}

function renameEval(id, name) {
  const rec = S.evalRecords.find(r => r.id === id);
  if (rec) rec.name = name.trim() || rec.name;
  renderEvalTable();
  saveEvalRecords();
}

function setEvalStressCondition(id, val) {
  const rec = S.evalRecords.find(r => r.id === id);
  if (rec) rec.stressCondition = val.trim();
  renderEvalTable();
  saveEvalRecords();
}

function setEvalAgingTime(id, val) {
  const rec = S.evalRecords.find(r => r.id === id);
  if (rec) rec.agingTime = val.trim();
  renderEvalTable();
  saveEvalRecords();
}

function toggleEvalCheck(id, checked) {
  const rec = S.evalRecords.find(r => r.id === id);
  if (rec) rec.checked = checked;
}

function toggleAllEvals(checked) {
  S.evalRecords.forEach(r => r.checked = checked);
  renderEvalTable();
}

let confirmResolver = null;
function showConfirm(msg) {
  const modal = $('pstConfirmModal'); if (!modal) return Promise.resolve(false);
  const msgEl = $('pstConfirmModalMsg'); if (msgEl) msgEl.textContent = msg;
  modal.style.display = 'flex';
  return new Promise(resolve => {
    confirmResolver = resolve;
  });
}

function closeConfirmModal(result) {
  const modal = $('pstConfirmModal'); if (modal) modal.style.display = 'none';
  if (confirmResolver) {
    confirmResolver(result);
    confirmResolver = null;
  }
}

async function deleteSelectedEvals() {
  const toDelete = S.evalRecords.filter(r => r.checked);
  pstLog(`선택 삭제 클릭됨 (체크된 항목 수: ${toDelete.length})`, 'info');
  if (!toDelete.length) { alert('삭제할 항목을 체크해 주세요.'); return; }
  const ok = await showConfirm(`${toDelete.length}개 평가 기록을 삭제하시겠습니까?`);
  if (!ok) {
    pstLog('삭제 취소됨', 'info');
    return;
  }
  pstLog(`${toDelete.length}개 항목 삭제 진행 중...`, 'info');
  const deletingViewed = toDelete.some(r => r.id === S.viewingEvalId);
  toDelete.forEach(r => { const idx = S.evalRecords.indexOf(r); if (idx >= 0) S.evalRecords.splice(idx, 1); });
  if (deletingViewed) viewLiveGraph(); else renderEvalTable();
  saveEvalRecords();
}

function addNameMerges(ws, blocks) {
  ws['!merges'] = ws['!merges'] || [];
  blocks.forEach(b => {
    if (b.headers.length <= 1) return;
    ws['!merges'].push({ s: { r: 0, c: b.startCol }, e: { r: 0, c: b.startCol + b.headers.length - 1 } });
    (b.meta || []).forEach((_, m) => {
      ws['!merges'].push({ s: { r: 1 + m, c: b.startCol }, e: { r: 1 + m, c: b.startCol + b.headers.length - 1 } });
    });
  });
}

function evalRecordBlocks(rec, number) {
  let v = rec.raw?.v || [[], [], []];
  let i = rec.raw?.i || [[], [], []];
  let ts = rec.raw?.ts || [];
  if (!Array.isArray(v[0])) v = [[], [], []];
  if (!Array.isArray(i[0])) i = [[], [], []];

  const activeChs = activeChannelsOfRecord(rec);
  const idxs = activeChs.map(ch => ch - 1);
  const t0 = ts[0] || Date.now();

  const nameLabel = `${rec.name} #${number}`;
  const meta = [
    `트래킹모드: ${TRACK_LABEL[rec.trackMode]}`,
    `모드: ${evalModeOf(rec) === 'cycle' ? '사이클' : '고정값'}`,
    `강압 조건: ${rec.stressCondition || '-'}`,
    `에이징시간: ${rec.agingTime || '-'}`,
    `조건: ${evalConditionText(rec)}`,
  ];

  const headers1 = ['시간(s)'];
  idxs.forEach(chIdx => headers1.push(`CH${chIdx + 1}_전압(V)`, `CH${chIdx + 1}_전류(A)`));
  const rows1 = ts.map((t, j) => {
    const row = [((t - t0) / 1000).toFixed(1)];
    idxs.forEach(chIdx => {
      const valV = (v[chIdx]?.[j]) || 0;
      const valI = (i[chIdx]?.[j]) || 0;
      row.push(valV.toFixed(3), valI.toFixed(3));
    });
    return row;
  });

  const headers2 = ['시간(s)', '전압(합계,V)', '전류(합계,A)'];
  const rows2 = ts.map((t, j) => {
    let vsum, isum;
    const valV0 = (v[0]?.[j]) || 0;
    const valV1 = (v[1]?.[j]) || 0;
    const valI0 = (i[0]?.[j]) || 0;
    const valI1 = (i[1]?.[j]) || 0;
    if (rec.trackMode === 1) { // Parallel
      vsum = valV0;
      isum = valI0 + valI1;
    } else if (rec.trackMode === 2) { // Series
      vsum = valV0 + valV1;
      isum = valI0;
    } else {
      vsum = 0; isum = 0;
      idxs.forEach(chIdx => {
        vsum += (v[chIdx]?.[j]) || 0;
        isum += (i[chIdx]?.[j]) || 0;
      });
    }
    return [((t - t0) / 1000).toFixed(1), vsum.toFixed(3), isum.toFixed(3)];
  });

  return {
    perCh: { name: nameLabel, meta, headers: headers1, rows: rows1 },
    combined: { name: nameLabel, meta, headers: headers2, rows: rows2 },
  };
}

function blocksToAOA(blocks) {
  const GAP = 1;
  let col = 0;
  blocks.forEach(b => { b.startCol = col; col += b.headers.length + GAP; });
  const totalCols = blocks.length ? blocks[blocks.length - 1].startCol + blocks[blocks.length - 1].headers.length : 0;
  const maxMeta = Math.max(0, ...blocks.map(b => (b.meta || []).length));
  const maxRows = Math.max(0, ...blocks.map(b => b.rows.length));
  const aoa = [];

  const nameRow = new Array(totalCols).fill('');
  blocks.forEach(b => { nameRow[b.startCol] = b.name; });
  aoa.push(nameRow);

  for (let m = 0; m < maxMeta; m++) {
    const row = new Array(totalCols).fill('');
    blocks.forEach(b => { if (b.meta && b.meta[m] !== undefined) row[b.startCol] = b.meta[m]; });
    aoa.push(row);
  }

  aoa.push(new Array(totalCols).fill(''));

  const headerRow = new Array(totalCols).fill('');
  blocks.forEach(b => { b.headers.forEach((h, k) => { headerRow[b.startCol + k] = h; }); });
  aoa.push(headerRow);

  for (let r = 0; r < maxRows; r++) {
    const row = new Array(totalCols).fill('');
    blocks.forEach(b => { if (r < b.rows.length) b.rows[r].forEach((v, k) => { row[b.startCol + k] = v; }); });
    aoa.push(row);
  }
  return aoa;
}

async function exportSelectedRawData() {
  const selected = S.evalRecords.filter(r => r.checked);
  if (!selected.length) { alert('내보낼 평가 항목을 체크박스로 선택해 주세요.'); return; }

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `PST3202_rawdata_${stamp}.xlsx`;

  const numbers = evalNumbering();
  const perChBlocks = [], combinedBlocks = [];
  selected.forEach(rec => {
    const b = evalRecordBlocks(rec, numbers[rec.id]);
    perChBlocks.push(b.perCh);
    combinedBlocks.push(b.combined);
  });

  try {
    const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(blocksToAOA(perChBlocks));
    addNameMerges(ws1, perChBlocks);
    XLSX.utils.book_append_sheet(wb, ws1, '채널별');

    const hasSeries = selected.some(rec => rec.trackMode === 2);
    if (hasSeries) {
      const ws2 = XLSX.utils.aoa_to_sheet(blocksToAOA(combinedBlocks));
      addNameMerges(ws2, combinedBlocks);
      XLSX.utils.book_append_sheet(wb, ws2, '합산');
    }

    const arrBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'X-Filename': filename, 'Content-Type': 'application/octet-stream' },
        body: arrBuf,
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || '저장 실패');
      pstLog(`Excel로 ${selected.length}개 평가 내보냄 (프로그램 폴더에 저장됨): ${filename}`, 'ok');
      showInfoModal(`엑셀 파일이 프로그램 폴더에 성공적으로 저장되었습니다!\n파일명: ${filename}`, '📊 엑셀 내보내기 완료');
    } catch (e) {
      pstLog(`로컬 서버 저장 실패, 브라우저 다운로드로 대체합니다: ${e.message}`, 'err');
      XLSX.writeFile(wb, filename);
    }
  } catch (err) {
    pstLog(`엑셀 내보내기 실패: ${err.message}`, 'err');
    alert(`엑셀 내보내기 실패: ${err.message}`);
  }
}

async function manualSaveRecords() {
  try {
    await saveEvalRecords();
    pstLog('평가 기록 수동 저장 완료', 'ok');
    showInfoModal('데이터 테이블의 현재 상태가 성공적으로 디스크에 저장되었습니다!', '💾 저장 완료');
  } catch (e) {
    pstLog(`평가 기록 저장 실패: ${e.message}`, 'err');
    alert(`저장 중 오류가 발생했습니다: ${e.message}`);
  }
}

async function saveEvalRecords() {
  try {
    const res = await fetch('/api/evaldata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(S.evalRecords),
    });
    if (!res.ok) throw new Error(`서버 응답 오류 (HTTP ${res.status})`);
  } catch (e) {
    pstLog(`평가 기록 저장 실패: ${e.message}`, 'err');
  }
}

async function loadEvalRecords() {
  try {
    const res = await fetch('/api/evaldata');
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      S.evalRecords = data;
      S.nextEvalId = Math.max(0, ...S.evalRecords.map(r => r.id)) + 1;
      renderEvalTable();
      pstLog(`이전 평가 기록 ${S.evalRecords.length}개를 불러왔습니다.`, 'info');
    }
  } catch (e) {
    pstLog('이전 평가 기록을 불러오지 못했습니다.', 'info');
  }
}

// ── onConnect / onDisconnect ───────────────────────────────────────────────────
function onConnect() {
  if (!S) init();
  _runSeq([
    ['*CLS'],
    [':OUTPut:PROTection:CLEar'],
    ['*IDN?', r => pstLog(`IDN: ${r}`, 'rx')],
    [':OUTPut:COUPle:TRACking 0'],
    [':OUTPut:STATe?', r => {
      S.outputActive = r.trim() === '1';
      updateOutUI();
    }],
    [':CHANnel1:VOLTage?', r => { const el = $('pstVset1'); if (el) el.value = parseFloat(r).toFixed(2); }],
    [':CHANnel1:CURRent?', r => { const el = $('pstIset1'); if (el) el.value = parseFloat(r).toFixed(3); }],
    [':CHANnel2:VOLTage?', r => { const el = $('pstVset2'); if (el) el.value = parseFloat(r).toFixed(2); }],
    [':CHANnel2:CURRent?', r => { const el = $('pstIset2'); if (el) el.value = parseFloat(r).toFixed(3); }],
    [':CHANnel3:VOLTage?', r => { const el = $('pstVset3'); if (el) el.value = parseFloat(r).toFixed(2); }],
    [':CHANnel3:CURRent?', r => { const el = $('pstIset3'); if (el) el.value = parseFloat(r).toFixed(3); }],
  ], () => {
    S.trackMode = 0;
    updateTrackModeUI();
    setNeedsConn(true);
    pstLog('연결 완료. 트래킹 모드: 독립', 'ok');
    doPoll(); // 이미 출력 ON 상태였다면 폴링 시작 (outputActive 확인 후 시작됨)
  });
}

function onDisconnect() {
  stopPoll();
  _pendingCb = null;
  stopAllCycles();
  if (S) {
    S.outputActive = false;
    updateOutUI();
  }
  setNeedsConn(false);
  pstLog('장치 연결이 끊어졌습니다.', 'warn');
  const rp = $('rightpanel');
  if (rp) rp.style.display = '';
  const layout = $('layout');
  if (layout) layout.classList.remove('pst-layout-no-right');
}

// ── HTML 생성 ──────────────────────────────────────────────────────────────────
function chCardHTML(ch) {
  const maxV = CH_MAX_V[ch], maxI = CH_MAX_I[ch];
  return `
    <div class="pst-ch-card${ch === 1 ? ' pst-sel' : ''}" id="pstCh${ch}" onclick="app.instr.selCh(${ch})">
      <div class="pst-ch-hdr">
        <div class="pst-ch-name">CHANNEL ${ch} <span class="pst-sel-badge">선택됨</span></div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="pst-ch-spec" id="pstCh${ch}Spec">0–${maxV}V / 0–${maxI}A</span>
          <div id="pstCh${ch}UseRow" style="display:none;align-items:center;" onclick="event.stopPropagation()">
            <label class="pst-switch-lbl" style="font-size:10px;">
              <span class="pst-toggle-sw" style="width:28px;height:16px;">
                <input type="checkbox" id="pstCh${ch}Use" ${ch === 1 ? 'checked' : ''} onchange="app.instr.syncTrackingSettings()">
                <span class="pst-toggle-sl"></span>
              </span>
              <span style="font-size:10px;margin-left:4px;color:var(--text-dim);">사용</span>
            </label>
          </div>
        </div>
      </div>
      <div class="pst-led-display">
        <div class="pst-led-row"><span class="pst-led-lbl">VOLTAGE</span><span class="pst-led-val pst-v" id="pstV${ch}">0.000 V</span></div>
        <div class="pst-led-row"><span class="pst-led-lbl">CURRENT</span><span class="pst-led-val pst-i" id="pstI${ch}">0.000 A</span></div>
      </div>
      <div class="pst-ch-fixed" id="pstFix${ch}" onclick="event.stopPropagation()">
        <div class="pst-ctrl-tabs">
          <button class="pst-ctrl-tab active" id="pstCv${ch}" onclick="app.instr.setCtrlMode(${ch},'CV')">⚡ 전압 제어</button>
          <button class="pst-ctrl-tab" id="pstCc${ch}" class="pst-needs-conn" disabled onclick="app.instr.setCtrlMode(${ch},'CC')">🔋 전류 제어</button>
        </div>
        <div id="pstVRow${ch}">
          <div class="flabel" style="margin-top:0;">전압 설정</div>
          <div class="pst-sp-row"><input type="number" id="pstVset${ch}" class="inp" placeholder="0.000" min="0" max="${maxV}" step="0.01" onkeydown="if(event.key==='Enter')app.instr.setV(${ch})" oninput="app.instr.validateFixedField(${ch},'v')"></div>
          <span class="pst-fix-warn" id="pstFixWarnV${ch}"></span>
        </div>
        <div id="pstCcNotice${ch}" style="display:none;font-size:11px;color:var(--text-mut);padding:2px 0 10px;">🔋 전류 제어 모드: 전압을 채널 최댓값(${maxV}V)으로 걸어두고 전류만 목표값으로 유지합니다</div>
        <div class="flabel" id="pstILabel${ch}" style="margin-top:4px;">전류 제한</div>
        <div class="pst-sp-row"><input type="number" id="pstIset${ch}" class="inp" placeholder="0.000" min="0" max="${maxI}" step="0.001" onkeydown="if(event.key==='Enter')app.instr.setI(${ch})" oninput="app.instr.validateFixedField(${ch},'i')"></div>
        <span class="pst-fix-warn" id="pstFixWarnI${ch}"></span>
        <div class="pst-prot-row">
          <label class="pst-switch-lbl" title="과전류 보호 (OCP)&#10;측정 전류가 설정한 전류 한계치를 초과하면&#10;출력을 자동으로 차단합니다."><input type="checkbox" id="pstOcp${ch}" class="pst-needs-conn" disabled onchange="app.instr.setOCP(${ch},this.checked)"><span>OCP 보호</span></label>
          <button id="pstOvp${ch}btn" class="pst-aply pst-needs-conn" disabled onclick="app.instr.setOVP(${ch})" title="과전압 보호 (OVP)&#10;측정 전압이 설정한 전압 한계치를 초과하면&#10;출력을 자동으로 차단합니다.&#10;클릭하면 한계값을 입력할 수 있습니다.">OVP 설정</button>
        </div>
      </div>
      <div class="pst-mode-tabs" onclick="event.stopPropagation()">
        <button class="pst-mode-tab active" id="pstTf${ch}" onclick="app.instr.setMode(${ch},'fixed')">📌 고정값</button>
        <button class="pst-mode-tab" id="pstTc${ch}" onclick="app.instr.setMode(${ch},'cycle')">🔄 사이클</button>
      </div>
    </div>`;
}

function buildSidebar(el) {
  if (!S) init();
  el.innerHTML = `
    <div class="sidebar-top">
      <div class="panel">
        <div class="panel-title">장비 연결 (Web Serial)</div>
        <div id="connStatus" class="conn-status-lbl">연결 안됨</div>
        <button id="btnConnect" class="big-btn" onclick="app.toggleConnection()">디바이스 연결</button>
      </div>
      <div class="panel">
        <div class="panel-title">전원 출력 제어</div>
        <button id="pstBtnOutput" class="big-btn green" onclick="app.instr.toggleOutput()" disabled>⚡ 시작</button>
        <label class="pst-switch-lbl" style="margin-top:4px;" title="시작 후 2초가 지났는데도 모든 채널 전류가 0.000A면 출력을 자동 정지합니다.">
          <span class="pst-toggle-sw pst-toggle-sw-lg"><input type="checkbox" id="pstAutoStop" checked onchange="app.instr.setAutoStopToggle(this.checked)"><span class="pst-toggle-sl"></span></span>
          <span>0A 자동 정지</span>
        </label>
      </div>
      <div class="panel">
        <div class="panel-title">트래킹 모드</div>
        <div class="pst-radio-col">
          <label class="pst-radio-lbl" title="독립 모드: 각 채널을 독립적으로 설정·측정합니다."><input type="radio" id="pstTm0" name="pstTm" value="0" checked onchange="app.instr.setTM(0)"><span>독립 (Independent)</span></label>
          <label class="pst-radio-lbl" title="⚠️ CH1·CH2 단자를 실제로 병렬 결선해야 합니다.&#10;두 채널이 하나의 회로로 묶이므로 채널별 독립 측정 불가.&#10;용도: 전류 공급 능력을 2배(최대 4A)로 확장할 때."><input type="radio" id="pstTm1" name="pstTm" value="1" onchange="app.instr.setTM(1)"><span>병렬 트래킹 (Parallel) ⚠️</span></label>
          <label class="pst-radio-lbl" title="⚠️ CH1·CH2 단자를 실제로 직렬 결선해야 합니다.&#10;두 채널이 하나의 회로로 묶이므로 채널별 독립 측정 불가.&#10;용도: 전압 범위를 2배(최대 64V)로 확장할 때."><input type="radio" id="pstTm2" name="pstTm" value="2" onchange="app.instr.setTM(2)"><span>직렬 트래킹 (Series) ⚠️</span></label>
        </div>
      </div>
    </div>
    <div class="pst-syslog-panel">
      <div class="pst-syslog-head">
        <span style="font-weight:700;font-size:11px;color:var(--text-dim);">시스템 로그</span>
        <button class="logbar-toggle" onclick="document.getElementById('pstSysLog').innerHTML=''">Clear</button>
      </div>
      <div class="pst-syslog" id="pstSysLog"></div>
    </div>`;
}

function buildCenter(el) {
  if (!S) init();
  el.innerHTML = `
    <div id="pstCenter" class="pst-output-off" style="flex:1;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:14px;padding:14px;">

      <!-- Channel Cards -->
      <div class="pst-ch-grid">
        ${chCardHTML(1)}
        <div class="pst-sync-col" id="pstSyncCol" onclick="app.instr.setSyncCh1Ch2(!S.syncCh1Ch2)" title="1번채널을 입력하면 전압/전류값이 2번 채널에도 동일하게 적용됩니다.\n3채널 포함 시: 전압 최대 6V, 전류 최대 2A 범위 내에서 동기화됩니다.">
          <div class="pst-sync-labels">
            <span class="pst-sync-ch-tag" style="color:var(--cyan);">CH 1</span>
            <div class="pst-sync-arrows">
              <span class="pst-sync-dot"></span>
              <span class="pst-sync-dot"></span>
              <span class="pst-sync-dot"></span>
            </div>
            <span class="pst-sync-ch-tag" style="color:var(--accent-2);">CH 2</span>
          </div>
          <label class="pst-switch-lbl pst-sync-sw-lbl" onclick="event.stopPropagation()">
            <span class="pst-toggle-sw" style="width:28px;height:16px;">
              <input type="checkbox" id="pstSyncCh" onchange="app.instr.setSyncCh1Ch2(this.checked)">
              <span class="pst-toggle-sl"></span>
            </span>
          </label>
          <span class="pst-sync-txt">동기화</span>
          <div class="pst-sync-ch3-row" id="pstSyncCh3Row" style="display:none;" onclick="event.stopPropagation()" title="3채널 포함 (전압 ≤6V / 전류 ≤2A)">
            <label class="pst-switch-lbl pst-sync-sw-lbl" onclick="event.stopPropagation()" style="margin:0;">
              <span class="pst-toggle-sw" style="width:24px;height:14px;">
                <input type="checkbox" id="pstSyncCh3Chk" onchange="app.instr.setSyncCh3(this.checked)">
                <span class="pst-toggle-sl"></span>
              </span>
            </label>
            <span style="font-size:10px;color:var(--accent-3);">+CH3</span>
            <span style="font-size:9px;color:var(--text-mut);margin-left:2px;">≤6V/2A</span>
          </div>
        </div>
        ${chCardHTML(2)}${chCardHTML(3)}
      </div>

      <!-- Cycle Editor -->
      <div id="pstCycleEditor" class="pst-cycle-editor" style="display:none;">
        <div class="pst-ce-header">
          <span class="pst-ce-title">🔄 사이클 시퀀스 편집기 <span id="pstCeChLabel" style="color:var(--accent-2);margin-left:4px;font-size:12px;"></span></span>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="pst-ce-tabs" id="pstCeTabs"></div>
            <button class="sbtn" id="pstBtnStartAll" onclick="app.instr.toggleStartAllCycles()" style="padding:7px 16px;font-size:12px;" disabled>▶ 전체 시작</button>
          </div>
        </div>
        <div class="pst-ce-body">
          <div class="pst-ce-form">
            <div class="pst-ce-form-title">단계 추가</div>
            <div class="pst-ctrl-tabs">
              <button class="pst-ctrl-tab active" id="pstCeCVTab" onclick="app.instr.setCycleCtrlMode('CV')">⚡ 전압 제어</button>
              <button class="pst-ctrl-tab" id="pstCeCCTab" onclick="app.instr.setCycleCtrlMode('CC')">🔋 전류 제어</button>
            </div>
            <div id="pstCeCcNotice" style="display:none;font-size:11px;color:var(--text-mut);margin:-4px 0 10px;">🔋 전류 제어: 각 단계마다 전압은 채널 최댓값으로 자동 설정됩니다</div>
            <div class="pst-ce-fields" id="pstCeFields">
              <div class="pst-ce-field" id="pstCeVField">
                <label class="flabel" id="pstCeVLabel">전압 (0~32V)</label>
                <input type="number" id="pstCeV" class="inp" placeholder="0.00" min="0" step="0.1" onkeydown="if(event.key==='Enter')app.instr.addStep()" oninput="app.instr.validateCeField('V')">
                <span class="pst-ce-warn" id="pstCeVWarn"></span>
              </div>
              <div class="pst-ce-field">
                <label class="flabel" id="pstCeILabel">전류 (0~2A)</label>
                <input type="number" id="pstCeI" class="inp" placeholder="0.000" min="0" step="0.1" onkeydown="if(event.key==='Enter')app.instr.addStep()" oninput="app.instr.validateCeField('I')">
                <span class="pst-ce-warn" id="pstCeIWarn"></span>
              </div>
              <div class="pst-ce-field">
                <label class="flabel">시간 (초)</label>
                <input type="number" id="pstCeT" class="inp" placeholder="초" min="1" value="10" onkeydown="if(event.key==='Enter')app.instr.addStep()" oninput="app.instr.validateCeField('T')">
                <span class="pst-ce-warn" id="pstCeTWarn"></span>
              </div>
            </div>
            <button class="pst-ce-add-btn" onclick="app.instr.addStep()">➕ 단계 추가</button>
            <div style="height:1px;background:var(--border);"></div>
            <div class="pst-ce-loops">
              <span class="flabel" style="margin:0;">반복 횟수</span>
              <input type="number" id="pstCeLoops" class="inp" value="1" min="1" oninput="app.instr.updateTotalDuration()">
            </div>
            <div style="font-size:11.5px;color:var(--text-dim);margin:3px 0 6px;display:flex;justify-content:space-between;">
              <span>⏱️ 예상 소요 시간:</span>
              <span id="pstTotalDuration" style="font-weight:700;color:var(--cyan);font-family:var(--mono);">0초</span>
            </div>
            <div style="margin-top:4px;">
              <button class="big-btn green" id="pstBtnStart" onclick="app.instr.toggleCycle()" style="font-size:12px;padding:9px;" disabled>▶ CH시작</button>
            </div>
          </div>
          <div class="pst-ce-table-wrap">
            <div class="pst-ce-live">
              <div class="pst-ce-live-cell">
                <div class="pst-led-lbl">실시간 전압 (CH<span id="pstCeLiveCh">1</span>)</div>
                <div class="pst-led-val pst-v" id="pstCeLiveV">0.000 V</div>
              </div>
              <div class="pst-ce-live-cell">
                <div class="pst-led-lbl">실시간 전류</div>
                <div class="pst-led-val pst-i" id="pstCeLiveI">0.000 A</div>
              </div>
            </div>
            <div class="pst-step-table-scroll">
              <table class="pst-step-table">
                <thead><tr>
                  <th>#</th><th>목표 전압</th><th>목표 전류</th><th>대기 시간</th><th>삭제</th>
                </tr></thead>
                <tbody id="pstStepTbody"></tbody>
              </table>
            </div>
            <div id="pstAllStatusWrap" style="display:none;flex-direction:column;gap:6px;padding:10px 14px;border-top:1px solid var(--border);">
              <div id="pstCeStatus1" class="pst-ce-status" style="display:none;"></div>
              <div id="pstCeStatus2" class="pst-ce-status" style="display:none;"></div>
              <div id="pstCeStatus3" class="pst-ce-status" style="display:none;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Graph -->
      <div class="pst-graph-section">
        <div class="pst-gh">
          <span class="pst-gtitle">📈 실시간 그래프</span>
          <div class="pst-gleg">
            <span class="pst-gli" data-ch="1"><span class="pst-gld" style="background:#3fb6e8;"></span>CH1 V</span>
            <span class="pst-gli" data-ch="1"><span class="pst-gld" style="background:#22b06a;"></span>CH1 I</span>
            <span class="pst-gli" data-ch="2" style="display:none;"><span class="pst-gld" style="background:#f59e0b;"></span>CH2 V</span>
            <span class="pst-gli" data-ch="2" style="display:none;"><span class="pst-gld" style="background:#9b7fe8;"></span>CH2 I</span>
            <span class="pst-gli" data-ch="3" style="display:none;"><span class="pst-gld" style="background:#e8554e;"></span>CH3 V</span>
            <span class="pst-gli" data-ch="3" style="display:none;"><span class="pst-gld" style="background:#4da3ff;"></span>CH3 I</span>
          </div>
          <div class="pst-gctrls">
            <span id="pstViewingBadge" style="display:none;font-size:11px;font-weight:700;color:#06121c;background:var(--accent-2);padding:3px 8px;border-radius:5px;">📌 기록 보기 중</span>
            <span style="font-size:11px;color:var(--text-dim);display:flex;align-items:center;gap:6px;">
              테스트 시간 <span id="pstTestElapsed" style="font-family:var(--mono);font-weight:700;color:var(--cyan);">0초</span>
            </span>
            <button class="sbtn" onclick="app.instr.resetGraph()" style="font-size:11px;color:var(--red);border-color:var(--red);">🔄 그래프 초기화</button>
          </div>
        </div>
        <div class="pst-graph-canvas-wrap"><canvas id="pstChart"></canvas></div>
      </div>

      <!-- Data Table -->
      <div class="pst-eval-panel">
        <div class="pst-gh">
          <span class="pst-gtitle">📋 Data Table</span>
          <div class="pst-gctrls">
            <button class="sbtn" id="pstBtnExport" onclick="app.instr.exportSelectedRawData()" style="font-size:11px;">📥 Raw Data (xlsx)</button>
            <button class="sbtn" onclick="app.instr.manualSaveRecords()" style="font-size:11px;color:var(--cyan);border-color:var(--cyan);">💾 저장</button>
            <button class="sbtn" onclick="app.instr.deleteSelectedEvals()" style="font-size:11px;color:var(--red);border-color:var(--red);">🗑️ 선택 삭제</button>
          </div>
        </div>
        <div class="pst-eval-table-scroll">
          <table class="pst-eval-table">
            <thead>
              <tr>
                <th style="width:34px;"><input type="checkbox" onchange="app.instr.toggleAllEvals(this.checked)"></th>
                <th style="width:90px;"><span class="pst-th-label">날짜</span><select class="pst-th-filter" id="pstEvalFilterDate" onchange="app.instr.setEvalFilter()"><option value="all">전체</option></select></th>
                <th style="width:200px;">제품명</th>
                <th style="width:40px;">번호</th>
                <th style="width:100px;"><span class="pst-th-label">트래킹모드</span><select class="pst-th-filter" id="pstEvalFilterTrack" onchange="app.instr.setEvalFilter()"><option value="all">전체</option><option value="0">독립</option><option value="1">병렬</option><option value="2">직렬</option></select></th>
                <th style="width:80px;"><span class="pst-th-label">모드</span><select class="pst-th-filter" id="pstEvalFilterMode" onchange="app.instr.setEvalFilter()"><option value="all">전체</option><option value="fixed">고정값</option><option value="cycle">사이클</option></select></th>
                <th style="width:110px;"><span class="pst-th-label">강압 조건</span><select class="pst-th-filter" id="pstEvalFilterStress" onchange="app.instr.setEvalFilter()"><option value="all">전체</option></select></th>
                <th style="width:90px;"><span class="pst-th-label">에이징시간</span><select class="pst-th-filter" id="pstEvalFilterAging" onchange="app.instr.setEvalFilter()"><option value="all">전체</option></select></th>
                <th>전압 / 전류 / 시간 조건</th>
                <th style="width:100px;">전류 최대값</th>
              </tr>
            </thead>
            <tbody id="pstEvalTbody">
              <tr><td colspan="10" class="pst-empty-steps">완료된 평가가 없습니다.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Autocomplete Datalists -->
      <datalist id="stressConditionOptions"></datalist>
      <datalist id="agingTimeOptions"></datalist>

      <!-- Protection trip warning modal -->
      <div id="pstProtectionModal" class="pst-modal-overlay" style="display:none;z-index:9999;">
        <div class="pst-modal-box">
          <div class="pst-modal-icon">⚠️</div>
          <div class="pst-modal-title err">보호 모드 발동</div>
          <div class="pst-modal-msg" id="pstProtectionModalMsg"></div>
          <button class="big-btn danger" onclick="app.instr.clearProtectionFromModal()" style="width:100%;">❌ 보호 모드 해제 및 닫기</button>
        </div>
      </div>

      <!-- Custom confirm modal -->
      <div id="pstConfirmModal" class="pst-modal-overlay" style="display:none;z-index:10000;">
        <div class="pst-modal-box" style="border-color:var(--accent);">
          <div class="pst-modal-icon">❓</div>
          <div class="pst-modal-title" style="color:var(--accent-2);">평가 기록 삭제</div>
          <div class="pst-modal-msg" id="pstConfirmModalMsg">정말로 선택한 평가 기록을 삭제하시겠습니까?</div>
          <div style="display:flex;gap:12px;margin-top:20px;">
            <button class="big-btn" id="pstBtnConfirmCancel" style="flex:1;background:var(--panel-3);border:1px solid var(--border-2);color:var(--text);" onclick="app.instr.closeConfirmModal(false)">취소</button>
            <button class="big-btn danger" id="pstBtnConfirmOk" style="flex:1;" onclick="app.instr.closeConfirmModal(true)">삭제</button>
          </div>
        </div>
      </div>

      <!-- Single-tab lock overlay -->
      <div id="pstTabLockModal" class="pst-modal-overlay" style="display:none;z-index:20000;">
        <div class="pst-modal-box" style="border-color:var(--warn);">
          <div class="pst-modal-icon">🪟</div>
          <div class="pst-modal-title" style="color:var(--warn);">이미 다른 탭/창에서 실행 중</div>
          <div class="pst-modal-msg">PST-3202 컨트롤러는 한 번에 하나의 탭에서만 사용할 수 있습니다.
(장치 COM 포트 충돌 및 데이터 저장 충돌 방지)

다른 탭/창을 닫은 뒤 아래 버튼을 눌러 새로고침 해주세요.</div>
          <button class="big-btn" onclick="location.reload()" style="width:100%;">🔄 새로고침</button>
        </div>
      </div>

      <!-- Track image modal -->
      <div id="pstTrackImageModal" class="pst-modal-overlay" style="display:none;z-index:30000;cursor:pointer;" onclick="app.instr.hideTrackImageModal()">
        <img id="pstTrackImageModalImg" src="" alt="트래킹 결선 이미지" style="max-width:60vw;max-height:60vh;border-radius:10px;box-shadow:0 24px 70px rgba(0,0,0,.55);">
      </div>

      <!-- Warning modal for input limits -->
      <div id="pstWarningModal" class="pst-modal-overlay" style="display:none;z-index:31000;" onclick="app.instr.closeWarningModal()">
        <div class="pst-modal-box" style="border-color:var(--warn);" onclick="event.stopPropagation()">
          <div class="pst-modal-icon">⚠️</div>
          <div class="pst-modal-title" style="color:var(--warn);" id="pstWarningModalTitle">입력 범위 초과</div>
          <div class="pst-modal-msg" id="pstWarningModalMsg" style="white-space:pre-wrap;text-align:center;"></div>
          <button class="big-btn" onclick="app.instr.closeWarningModal()" style="width:100%;background:var(--panel-3);border:1px solid var(--border-2);color:var(--text);margin-top:16px;">확인</button>
        </div>
      </div>

      <!-- OVP input modal -->
      <div id="pstOvpModal" class="pst-modal-overlay" style="display:none;z-index:33000;" onclick="if(event.target===this)app.instr.closeOvpModal()">
        <div class="pst-modal-box" style="border-color:var(--accent);" onclick="event.stopPropagation()">
          <div class="pst-modal-icon">🛡️</div>
          <div class="pst-modal-title" style="color:var(--accent-2);" id="pstOvpModalTitle">OVP 설정</div>
          <div class="pst-modal-msg" id="pstOvpModalHint" style="margin-bottom:14px;"></div>
          <input type="number" id="pstOvpInp" class="inp" min="0" step="0.1" style="width:100%;font-size:18px;text-align:center;padding:10px;margin-bottom:16px;" onkeydown="if(event.key==='Enter')app.instr.applyOvp()">
          <div style="display:flex;gap:12px;">
            <button class="big-btn" style="flex:1;background:var(--panel-3);border:1px solid var(--border-2);color:var(--text);" onclick="app.instr.closeOvpModal()">취소</button>
            <button class="big-btn green" style="flex:1;" onclick="app.instr.applyOvp()">적용</button>
          </div>
        </div>
      </div>

      <!-- Info modal for save/export success -->
      <div id="pstInfoModal" class="pst-modal-overlay" style="display:none;z-index:32000;" onclick="app.instr.closeInfoModal()">
        <div class="pst-modal-box" style="border-color:var(--cyan);" onclick="event.stopPropagation()">
          <div class="pst-modal-icon">✅</div>
          <div class="pst-modal-title" style="color:var(--cyan);" id="pstInfoModalTitle">완료</div>
          <div class="pst-modal-msg" id="pstInfoModalMsg" style="white-space:pre-wrap;text-align:center;"></div>
          <button class="big-btn" onclick="app.instr.closeInfoModal()" style="width:100%;background:var(--panel-3);border:1px solid var(--border-2);color:var(--text);margin-top:16px;">확인</button>
        </div>
      </div>

    </div>`;

  ['pstVset1', 'pstIset1', 'pstVset2', 'pstIset2', 'pstVset3', 'pstIset3'].forEach(id => {
    $(id)?.addEventListener('input', syncTrackingSettings);
  });
  ['pstVset1', 'pstIset1'].forEach(id => {
    $(id)?.addEventListener('input', () => {
      const val = parseFloat($(id)?.value);
      if (S?.syncCh1Ch2 && S.trackMode === 0) {
        const target = $(id.replace('set1', 'set2'));
        if (target) target.value = $(id).value;
      }
      if (S?.syncCh3 && S.trackMode === 0) {
        const isV = id.includes('Vset');
        const el3 = $(isV ? 'pstVset3' : 'pstIset3');
        if (el3 && !isNaN(val)) {
          const max3 = isV ? CH_MAX_V[3] : CH3_SYNC_MAX_I;
          el3.value = Math.min(val, max3).toFixed(isV ? 2 : 3);
        }
      }
    });
  });
  syncTrackingSettings();
  initTabLock();
}

function buildRightPanel(el) {
  el.innerHTML = '';
  el.style.display = 'none';
  const layout = $('layout');
  if (layout) layout.classList.add('pst-layout-no-right');
}

function setCycleCtrlMode(mode) {
  S.ch[S.editorCh - 1].ctrlMode = mode;
  refreshCtrlModeUI(S.editorCh);
}

function onRebuild() {
  renderEvalTable();
  updateAllMeasDisplay();
  updateOutUI();
  updateTrackModeUI();
  updateCycleEditor();
  drawGraph();
}

export default {
  name: 'PST-3202',
  icon: 'assets/PST-3202.png',
  popupImage: 'assets/PST-3202.png',
  cat: '전원공급기',
  viewType: 'custom',
  serial: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },

  onConnect, onDisconnect,

  onLine(line) {
    line = line.trim();
    if (!line || !_pendingCb) return;
    const cb = _pendingCb; _pendingCb = null; cb(line);
  },

  buildSidebar, buildCenter, buildRightPanel, onRebuild,

  selCh, setMode, setCtrlMode, setCycleCtrlMode,
  syncTrackingSettings, setAutoStopToggle,
  validateCeField, validateFixedField, addStep, delStep, editStep, updateTotalDuration,
  toggleCycle, toggleStartAllCycles,
  toggleOutput, setTM, clearProtection, setOCP, setOVP, setV, setI, setSyncCh1Ch2, setSyncCh3,
  drawGraph, resetGraph, viewEval, viewLiveGraph,
  renameEval, setEvalStressCondition, setEvalAgingTime,
  toggleEvalCheck, toggleAllEvals, deleteSelectedEvals,
  exportSelectedRawData, manualSaveRecords,
  setEvalFilter, clearProtectionFromModal, closeConfirmModal, hideTrackImageModal,
  showWarningModal, closeWarningModal, showInfoModal, closeInfoModal,
  applyOvp, closeOvpModal,
};
