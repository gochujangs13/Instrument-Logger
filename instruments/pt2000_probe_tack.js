/* ============================================================
   PT-2000 Probe Tack Tester — integrated module
   WebHID: Microchip mTouch2 (VID 0x04D8 / PID 0xF47E)
   Protocol: P(poll force) / Q(data ready) / h+^(curve download)
   NOTE: this device speaks WebHID, not WebSerial — it manages its
   own navigator.hid connection independently of app.serial.
   ============================================================ */
import { dateStr, syslogPanelHTML } from './_utils.js';

const t = k => app?.t(k) ?? k;
const $ = id => document.getElementById(id);
const escAttr = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
const escHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const PALETTE = ['#4da3ff','#2bd4a0','#ffb454','#ff6b8a','#b48cff','#3fe0d4','#f0d24d','#ff8a5c'];
const VID = 0x04D8, PID = 0xF47E;

// ── Module-level state (reset on each launch) ────────────────────────────────
let S = null;
function init() {
  S = {
    results: [], nextNo: 1, curGroup: null, curIdx: 0,
    hidDevice: null, hidPollTimer: null, hidWatchdog: null, hidLastRx: 0,
    hidPending: null,
    importing: false, autoImport: true, lastAutoImport: 0,
    awaitingProceed: false, proceedTimer: null, saveTime: 0, sendSaveSeq: true,
  };
}

// ── Connection status display ─────────────────────────────────────────────────
function setStatus(connected, name = '') {
  app._connBadge(connected);
  app._setBtnState(connected);
  if (connected) {
    app._setDisplay('--', 'gf', 'ready', 'READY');
    app.log(`${t('pt_dev_connected')}: ${name || 'PT-2000'}`, 'ok');
  } else {
    app._setDisplay('--', 'gf', 'off', t('disconnected'));
    S.awaitingProceed = false;
    updateProceedUI();
  }
}
function setLiveValue(f) {
  app._setDisplay(f === null ? '--' : f.toFixed(1), 'gf');
}

// ── WebHID protocol ───────────────────────────────────────────────────────────
const POLL = (() => { const a = new Uint8Array(64); a[0] = 0x50; return a; })();

async function sendPoll() { if (!S.hidDevice) return; try { await S.hidDevice.sendReport(0, POLL); } catch (_) {} }
function startPolling() {
  stopPolling();
  S.hidLastRx = Date.now(); sendPoll();
  S.hidPollTimer = setInterval(sendPoll, 250);
  S.hidWatchdog  = setInterval(() => { if (Date.now() - S.hidLastRx > 1500) sendPoll(); }, 1000);
}
function stopPolling() {
  if (S.hidPollTimer) { clearInterval(S.hidPollTimer); S.hidPollTimer = null; }
  if (S.hidWatchdog)  { clearInterval(S.hidWatchdog);  S.hidWatchdog  = null; }
}
function hidCommand(cmd, timeout = 400) {
  return new Promise(async (resolve) => {
    if (!S.hidDevice) { resolve(null); return; }
    const to = setTimeout(() => { if (S.hidPending) { S.hidPending = null; resolve(null); } }, timeout);
    S.hidPending = (d) => { clearTimeout(to); resolve(d); };
    const a = new Uint8Array(64); a[0] = cmd;
    try { await S.hidDevice.sendReport(0, a); }
    catch (e) { clearTimeout(to); S.hidPending = null; resolve(null); }
  });
}
function parseForce(dv) {
  const b = new Uint8Array(dv.buffer);
  if (b.length < 4 || b[0] !== 0x86) return null;
  let s = '';
  for (let i = 2; i < b.length; i++) { if (b[i] === 0x0d) break; if (b[i] === 0) continue; s += String.fromCharCode(b[i]); }
  if (s.charAt(0) === 'P') s = s.slice(1);
  const v = parseFloat(s); return isNaN(v) ? null : v;
}
function onInputReport(e) {
  S.hidLastRx = Date.now();
  if (S.hidPending) { const cb = S.hidPending; S.hidPending = null; cb(e.data); return; }
  const b = new Uint8Array(e.data.buffer);
  if (b[0] === 0x86 && b[2] === 0x51) {   // 'Q' = data ready -> auto download
    if (S.autoImport && !S.importing && Date.now() - S.lastAutoImport > 2000) {
      app.log(t('pt_q_detected'));
      importTest(true);
    }
    return;
  }
  const f = parseForce(e.data);
  if (f === null) return;
  setLiveValue(f);
}

async function toggleConnection() {
  if (!S.hidDevice) {
    if (!('hid' in navigator)) { alert(t('pt_webhid_unsupported')); return; }
    try {
      let dev = (await navigator.hid.getDevices()).find(d => d.vendorId === VID && d.productId === PID);
      if (!dev) {
        const ds = await navigator.hid.requestDevice({ filters: [{ vendorId: VID, productId: PID }] });
        if (!ds.length) return;
        dev = ds.find(d => d.vendorId === VID && d.productId === PID) || ds[0];
      }
      if (!dev.opened) await dev.open();
      S.hidDevice = dev;
      dev.addEventListener('inputreport', onInputReport);
      setStatus(true, dev.productName || 'PT-2000');
      startPolling();
    } catch (err) {
      app.log(`${t('pt_conn_failed')}: ${err.message}`, 'err');
      alert(`${t('pt_conn_failed')}: ${err.message}`);
    }
  } else {
    stopPolling();
    if (S.hidDevice) {
      try { S.hidDevice.removeEventListener('inputreport', onInputReport); await S.hidDevice.close(); } catch (_) {}
      S.hidDevice = null;
    }
    setStatus(false);
    app.log(t('pt_dev_disconnected'));
  }
}

// ── Curve download ────────────────────────────────────────────────────────────
async function downloadCurve() {
  stopPolling();
  await new Promise(r => setTimeout(r, 60));

  let acc = '';
  let chunks = 0, miss = 0, started = false, done = false, emptyRun = 0;
  try {
    await hidCommand(0x68);
    S.saveTime = Date.now();
    await new Promise(r => setTimeout(r, 30));
    let n = 0;
    while (n++ < 12000) {
      const d = await hidCommand(0x5E, 800);
      if (!d) {
        miss++;
        if (!started && miss >= 15) break;
        if (started && miss >= 40) break;
        await new Promise(r => setTimeout(r, 8));
        continue;
      }
      const b = new Uint8Array(d.buffer);
      if (b[0] === 0x86 && b[2] === 0x5E) {
        started = true; chunks++; miss = 0;
        const ln = b[1];
        let got = 0;
        for (let i = 3; i < 2 + ln && i < b.length; i++) {
          if (b[i] !== 0) { acc += String.fromCharCode(b[i]); got++; }
        }
        if (got === 0) { if (++emptyRun >= 6) { done = true; break; } }
        else emptyRun = 0;
      } else if (b[0] === 0x86 && started) {
        done = true; break;
      } else {
        miss++;
        if (!started && miss >= 15) break;
      }
    }
  } finally {
    startPolling();
  }
  const vals = [];
  for (const s of acc.split('\r')) { const tt = s.trim(); if (!tt) continue; const v = parseFloat(tt); if (!isNaN(v)) vals.push(v); }
  const lastT = ((vals.length - 1) * 0.001).toFixed(2);
  app.log(`${t('pt_download_log')}: ${t('pt_chunks')} ${chunks} → ${t('pt_points')} ${vals.length} (${lastT}s)${done ? '' : ' ⚠' + t('pt_early_stop')}`, vals.length > 1500 ? 'ok' : 'err');
  return vals;
}

async function sendToken(cmdByte, text) {
  const a = new Uint8Array(64);
  a[0] = cmdByte;
  const s = String(text);
  a[1] = s.length;
  for (let i = 0; i < s.length && i < 61; i++) a[2 + i] = s.charCodeAt(i);
  return new Promise((resolve) => {
    if (!S.hidDevice) { resolve(null); return; }
    const to = setTimeout(() => { if (S.hidPending) { S.hidPending = null; resolve(null); } }, 400);
    S.hidPending = (d) => { clearTimeout(to); resolve(d); };
    S.hidDevice.sendReport(0, a).catch(() => { clearTimeout(to); S.hidPending = null; resolve(null); });
  });
}

async function sendCompletionSequence(m) {
  if (!S.hidDevice || !S.sendSaveSeq) return;
  stopPolling();
  await new Promise(r => setTimeout(r, 40));
  try {
    await sendToken(0x55, m.min.toFixed(1));
    await sendToken(0x56, m.peak.toFixed(1));
    await sendToken(0x57, m.avg.toFixed(6));
    await sendToken(0x58, m.variance.toFixed(6));
    await sendToken(0x59, m.stdev.toFixed(6));
    await sendToken(0x5a, m.work.toExponential(6));
    await sendToken(0x63, '');
    app.log(t('pt_save_done'), 'ok');
  } finally {
    startPolling();
  }
  S.awaitingProceed = true;
  updateProceedUI();
}

const PROCEED_MIN_MS = 20000;

async function sendProceed() {
  if (!S.hidDevice) { S.awaitingProceed = false; updateProceedUI(); return; }
  if (!S.awaitingProceed) return;
  const elapsed = Date.now() - S.saveTime;
  if (elapsed < PROCEED_MIN_MS) await new Promise(r => setTimeout(r, PROCEED_MIN_MS - elapsed));
  stopPolling();
  await new Promise(r => setTimeout(r, 40));
  try {
    await sendToken(0x62, '');
    app.log(t('pt_proceed_sent'), 'ok');
  } finally {
    startPolling();
  }
  S.awaitingProceed = false;
  updateProceedUI();
}

function updateProceedUI() {
  if (!S.awaitingProceed) { const m = $('pt_proceedModal'); if (m && !m.dataset.abort) m.style.display = 'none'; }
}

// ── Result / abort modal ──────────────────────────────────────────────────────
function showCollectingModal() {
  const modal = $('pt_proceedModal'); if (!modal) return;
  modal.dataset.abort = '';
  $('pt_modalTitle').innerHTML = '📡 ' + t('pt_collecting');
  $('pt_modalTitle').className = 'modal-title pt-collecting';
  $('pt_modalResult').innerHTML =
    `<div class="pt-mr-row"><span>${t('pt_sample')}</span><b>—</b></div>` +
    `<div class="pt-mr-row"><span>Peak / Max</span><b>—</b></div>` +
    `<div class="pt-mr-row"><span>Avg</span><b>—</b></div>` +
    `<div class="pt-mr-row"><span>Std Dev</span><b>—</b></div>`;
  $('pt_modalWarn').style.display = 'none';
  const btn = $('pt_modalBtn');
  if (S.proceedTimer) { clearInterval(S.proceedTimer); S.proceedTimer = null; }
  btn.disabled = true;
  btn.textContent = t('pt_collecting');
  btn.className = 'pt-modal-proceed';
  btn.onclick = null;
  setTimeout(() => {
    const el = $('pt_modalResult');
    if (el && el.innerHTML.includes('—')) {
      el.innerHTML = `<div style="text-align:center;padding:12px 0;color:#7eb8f7;font-size:14px;line-height:1.7;">${t('pt_swap_hint')}</div>`;
    }
  }, 2000);
  modal.style.display = 'flex';
}

function showProceedModal(m, label) {
  const modal = $('pt_proceedModal'); if (!modal) return;
  modal.dataset.abort = '';
  $('pt_modalTitle').innerHTML = '✅ ' + t('pt_meas_done');
  $('pt_modalTitle').className = 'modal-title ok';
  $('pt_modalResult').innerHTML =
    `<div class="pt-mr-row"><span>${t('pt_sample')}</span><b>${escHtml(label)}</b></div>` +
    `<div class="pt-mr-row"><span>Peak / Max</span><b>${m.peak.toFixed(1)} gf</b></div>` +
    `<div class="pt-mr-row"><span>Avg</span><b>${m.avg.toFixed(2)} gf</b></div>` +
    `<div class="pt-mr-row"><span>Std Dev</span><b>${m.stdev.toFixed(3)}</b></div>`;
  $('pt_modalWarn').style.display = 'block';
  $('pt_modalWarn').innerHTML = t('pt_auto_close_hint');
  const btn = $('pt_modalBtn');
  btn.className = 'pt-modal-proceed';
  btn.onclick = confirmProceed;
  if (S.proceedTimer) { clearInterval(S.proceedTimer); S.proceedTimer = null; }
  const tick = () => {
    const left = Math.ceil((PROCEED_MIN_MS - (Date.now() - S.saveTime)) / 1000);
    if (left > 0) {
      btn.disabled = true;
      btn.textContent = `▶ ${t('pt_proceed_btn')} (${left}${t('pt_sec_auto')})`;
    } else {
      clearInterval(S.proceedTimer); S.proceedTimer = null;
      confirmProceed();
    }
  };
  tick(); S.proceedTimer = setInterval(tick, 200);
  modal.style.display = 'flex';
}

function showAbortModal(points, peak) {
  const modal = $('pt_proceedModal'); if (!modal) return;
  modal.dataset.abort = '1';
  $('pt_modalTitle').innerHTML = '⚠ ' + t('pt_aborted');
  $('pt_modalTitle').className = 'modal-title err';
  $('pt_modalResult').innerHTML =
    `<div class="pt-mr-row"><span>${t('pt_status')}</span><b>${t('pt_aborted_status')}</b></div>` +
    `<div class="pt-mr-row"><span>${t('pt_points')}</span><b>${points}</b></div>` +
    `<div class="pt-mr-row"><span>Peak</span><b>${peak.toFixed(1)} gf</b></div>`;
  $('pt_modalWarn').style.display = 'block';
  $('pt_modalWarn').innerHTML = t('pt_abort_guide');
  const btn = $('pt_modalBtn');
  if (S.proceedTimer) { clearInterval(S.proceedTimer); S.proceedTimer = null; }
  btn.disabled = false;
  btn.textContent = t('pt_confirm');
  btn.className = 'pt-modal-proceed neutral';
  btn.onclick = closeModal;
  modal.style.display = 'flex';
}

function closeModal() {
  const modal = $('pt_proceedModal'); if (!modal) return;
  modal.dataset.abort = '';
  modal.style.display = 'none';
}
function confirmProceed() { sendProceed(); }

// ── Metrics ───────────────────────────────────────────────────────────────────
function computeMetrics(data) {
  const speed = parseFloat($('pt_speed')?.value || 10);
  const dt = 0.001;
  const n = data.length;
  const f = data.map(d => d.f);

  const min = Math.min(...f);
  const peak = Math.max(...f);
  let sumPos = 0, sumSqPos = 0;
  for (const x of f) if (x > 0) { sumPos += x; sumSqPos += x * x; }
  const avg = sumPos / n;
  const variance = Math.max(0, sumSqPos / n - avg * avg);
  const stdev = Math.sqrt(variance);

  const T = n * dt;
  const work = avg * 9.81e-3 * (T * speed / 1000);

  let pi = 0; for (let i = 0; i < n; i++) if (f[i] > f[pi]) pi = i;
  let fi = n - 1; for (let i = pi + 1; i < n; i++) { if (f[i] < 3) { fi = i; break; } }
  const disp = (data[fi].t - data[pi].t) * speed;
  const mode = disp < 1.0 ? t('pt_mode_interface') : (disp < 3.0 ? t('pt_mode_cohesive') : t('pt_mode_transfer'));

  return { min, peak, avg, variance, stdev, work, disp, mode };
}

// ── Import / table ────────────────────────────────────────────────────────────
async function importTest(auto = false) {
  if (!S.hidDevice) { if (!auto) alert(t('pt_connect_first')); return; }
  if (S.importing) return;
  S.importing = true;

  let reNo = null;
  const chk = getChecked();
  if (chk.length === 1) reNo = chk[0];
  else if (chk.length > 1 && !auto) { alert(t('pt_remeasure_one')); S.importing = false; return; }

  showCollectingModal();
  app.log(t('pt_test_done_detected'));

  let vals = [];
  try { vals = await downloadCurve(); }
  catch (err) { app.log(`${t('pt_download_err')}: ${err.message}`, 'err'); }

  if (!vals || vals.length < 10) {
    app._setDisplay('--', 'gf', 'ready', 'READY');
    S.lastAutoImport = Date.now(); S.importing = false;
    if (!auto) alert(t('pt_no_curve'));
    app.log(t('pt_no_data'), 'err');
    return;
  }

  const data = vals.map((f, i) => ({ t: i * 0.001, f }));
  const m = computeMetrics(data);
  const sampleName = $('pt_sample')?.value || 'Sample';

  const ABORT_MIN_POINTS = 1000;
  const ABORT_PEAK_MIN = 1.0;
  if (vals.length < ABORT_MIN_POINTS || m.peak < ABORT_PEAK_MIN) {
    app._setDisplay('--', 'gf', 'ready', 'READY');
    S.lastAutoImport = Date.now(); S.importing = false;
    S.awaitingProceed = false; updateProceedUI();
    app.log(`${t('pt_abort_detected')} — ${t('pt_points')} ${vals.length}, Peak ${m.peak.toFixed(1)} gf`, 'err');
    showAbortModal(vals.length, m.peak);
    return;
  }

  await sendCompletionSequence(m);

  let lastLabel;
  if (reNo !== null) {
    const r = S.results.find(x => x.no === reNo);
    if (r) { r.data = data; Object.assign(r, m); r.time = new Date().toLocaleString('ko-KR') + ` (${t('pt_remeasured')})`; lastLabel = r.label; }
    app.log(`${t('pt_remeasure_done')} (${reNo})  Peak ${m.peak.toFixed(1)} gf`, 'ok');
  } else {
    const repeat = Math.max(1, parseInt($('pt_repeatCount')?.value || '1') || 1);
    if (sampleName !== S.curGroup) { S.curGroup = sampleName; S.curIdx = 1; }
    else S.curIdx++;
    let label;
    if (repeat === 1) {
      label = `${sampleName}-${S.curIdx}`;
    } else {
      const groupNo = Math.ceil(S.curIdx / repeat);
      const subNo = ((S.curIdx - 1) % repeat) + 1;
      label = `${sampleName}-${groupNo}-${subNo}`;
    }
    lastLabel = label;
    const color = PALETTE[S.results.length % PALETTE.length];
    S.results.push({
      no: S.nextNo++, label, group: sampleName, idx: S.curIdx,
      time: new Date().toLocaleString('ko-KR'), color, data, ...m,
    });
    app.log(`${t('pt_meas_added')}: ${label}  Peak ${m.peak.toFixed(1)} gf`, 'ok');
  }
  if (S.awaitingProceed) {
    if (S.proceedTimer) { clearInterval(S.proceedTimer); S.proceedTimer = null; }
    showProceedModal(m, lastLabel);
  }
  document.querySelectorAll('.pt-row-chk').forEach(c => c.checked = false);
  const sa = $('pt_selectAll'); if (sa) sa.checked = false;
  renderTable(); updateCount(); drawGraph();

  app._setDisplay('--', 'gf', 'ready', 'READY');
  S.lastAutoImport = Date.now(); S.importing = false;
}

function getChecked() { return Array.from(document.querySelectorAll('.pt-row-chk:checked')).map(c => parseInt(c.value, 10)); }

function computeOutliers() {
  const tol = (parseFloat($('pt_tol')?.value) || 20) / 100;
  const groups = {};
  S.results.forEach(r => { (groups[r.group] = groups[r.group] || []).push(r); });
  const outliers = new Set();
  const median = arr => { const s = [...arr].sort((a, b) => a - b), n = s.length, m = n >> 1; return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  for (const g in groups) {
    const arr = groups[g];
    const med = median(arr.map(r => r.peak));
    if (arr.length >= 4 && med > 0) {
      for (const r of arr) if (Math.abs(r.peak - med) > med * tol) outliers.add(r.no);
    }
  }
  return outliers;
}

function renderTable() {
  const tb = $('pt_resultsBody'); if (!tb) return;
  const outliers = computeOutliers();
  tb.innerHTML = S.results.map(r => `
    <tr ${outliers.has(r.no) ? 'class="outlier"' : ''}>
      <td class="cchk"><input type="checkbox" class="pt-row-chk" value="${r.no}" onchange="app.instr.onSelChange()"></td>
      <td class="num"><span class="pt-no-dot" style="background:${r.color}"></span>${r.no}</td>
      <td><input class="pt-name-inp" value="${escAttr(r.label)}" onchange="app.instr.renameResult(${r.no}, this.value)"></td>
      <td class="num accent">${r.peak.toFixed(1)}</td>
      <td class="num">${r.avg.toFixed(2)}</td>
      <td class="num">${r.min.toFixed(1)}</td>
      <td class="num">${r.stdev.toFixed(3)}</td>
      <td class="num">${r.work.toExponential(2)}</td>
      <td>${r.mode}</td>
    </tr>`).join('');
}
function renameResult(no, name) {
  const r = S.results.find(x => x.no === no);
  if (r) { r.label = name; renderTable(); drawGraph(); app.log(`${t('pt_label_changed')} (No.${no}) → ${name}`); }
}
function onSelChange() {
  const all = document.querySelectorAll('.pt-row-chk');
  const chk = document.querySelectorAll('.pt-row-chk:checked');
  const sa = $('pt_selectAll'); if (sa) sa.checked = all.length > 0 && all.length === chk.length;
  drawGraph();
}
function toggleAll(cb) {
  document.querySelectorAll('.pt-row-chk').forEach(c => c.checked = cb.checked);
  drawGraph();
}
function deleteSelected() {
  const chk = getChecked();
  if (chk.length === 0) { alert(t('pt_select_to_delete')); return; }
  if (!confirm(`${t('pt_confirm_delete_n')} ${chk.length}${t('pt_items')}?`)) return;
  S.results = S.results.filter(r => !chk.includes(r.no));
  renderTable(); updateCount(); drawGraph();
  app.log(`${chk.length}${t('pt_items_deleted')}`);
}
function clearData() {
  if (S.results.length === 0) return;
  if (!confirm(t('pt_clear_confirm'))) return;
  S.results = []; S.nextNo = 1; S.curGroup = null; S.curIdx = 0;
  renderTable(); updateCount(); drawGraph();
  app.log(t('pt_cleared'));
}
function updateCount() { app.count = S.results.length; app._updateCount(); }

// ── Export / copy ─────────────────────────────────────────────────────────────
function resultsToRows() {
  const head = ['No', t('pt_sample'), 'Max/Peak(gf)', 'Avg(gf)', 'Min(gf)', 'Std Dev', 'Work(J)', t('pt_failure_mode')];
  const rows = S.results.map(r => [r.no, r.label, r.peak.toFixed(1), r.avg.toFixed(4), r.min.toFixed(1), r.stdev.toFixed(4), r.work.toExponential(4), r.mode]);
  return [head, ...rows];
}
function exportCSV() {
  if (!S.results.length) { app.log(t('pt_no_export_data'), 'warn'); return; }
  const csv = resultsToRows().map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })),
    download: `PT2000_${dateStr()}.csv`,
  });
  a.click(); URL.revokeObjectURL(a.href);
  app.log(t('pt_csv_ok'), 'ok');
}
async function copyData() {
  if (!S.results.length) { app.log(t('pt_no_copy_data'), 'warn'); return; }
  const tsv = resultsToRows().map(r => r.join('\t')).join('\n');
  try {
    await navigator.clipboard.writeText(tsv);
    app.log(t('pt_copy_ok'), 'ok');
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = tsv; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      app.log(t('pt_copy_ok'), 'ok');
    } catch (_) {
      app.log(t('pt_copy_fail'), 'err');
    }
  }
}

// ── Force-displacement curve graph ────────────────────────────────────────────
function drawGraph() {
  const canvas = $('pt_graphCanvas'), empty = $('pt_graphEmpty'), legend = $('pt_graphLegend');
  if (!canvas) return;
  const checked = getChecked();
  let curves = S.results.filter(r => checked.includes(r.no));
  if (curves.length === 0 && S.results.length) curves = [S.results[S.results.length - 1]];

  if (curves.length === 0) {
    if (empty) empty.style.display = 'flex';
    canvas.style.display = 'none';
    if (legend) legend.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  canvas.style.display = 'block';

  const speed = parseFloat($('pt_speed')?.value || 10);
  const xOf = d => d.t * speed;

  const w = canvas.clientWidth, h = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const pad = { l: 50, r: 14, t: 14, b: 30 };

  const cs = getComputedStyle(document.body);
  const gridCol = cs.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.06)';
  const textCol = cs.getPropertyValue('--chart-text').trim() || 'rgba(255,255,255,0.4)';
  const text2Col = cs.getPropertyValue('--chart-text2').trim() || 'rgba(255,255,255,0.5)';

  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  curves.forEach(r => r.data.forEach(d => {
    const x = xOf(d);
    if (x < xmin) xmin = x; if (x > xmax) xmax = x;
    if (d.f < ymin) ymin = d.f; if (d.f > ymax) ymax = d.f;
  }));
  if (xmin === xmax) xmax = xmin + 1;
  const yp = (ymax - ymin) * 0.1 || 1; ymin -= yp; ymax += yp;
  const X = x => pad.l + (x - xmin) / (xmax - xmin) * (w - pad.l - pad.r);
  const Y = y => pad.t + (1 - (y - ymin) / (ymax - ymin)) * (h - pad.t - pad.b);

  ctx.lineWidth = 1; ctx.font = '10px Inter';
  for (let i = 0; i <= 5; i++) {
    const gy = pad.t + (h - pad.t - pad.b) * i / 5;
    ctx.strokeStyle = gridCol; ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(w - pad.r, gy); ctx.stroke();
    ctx.fillStyle = textCol; ctx.textAlign = 'right'; ctx.fillText((ymax - (ymax - ymin) * i / 5).toFixed(0), pad.l - 6, gy + 3);
  }
  for (let i = 0; i <= 5; i++) {
    const gx = pad.l + (w - pad.l - pad.r) * i / 5;
    ctx.strokeStyle = gridCol; ctx.beginPath(); ctx.moveTo(gx, pad.t); ctx.lineTo(gx, h - pad.b); ctx.stroke();
    ctx.fillStyle = textCol; ctx.textAlign = 'center'; ctx.fillText((xmin + (xmax - xmin) * i / 5).toFixed(1), gx, h - pad.b + 14);
  }
  if (ymin < 0 && ymax > 0) {
    ctx.strokeStyle = textCol; ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(w - pad.r, Y(0)); ctx.stroke();
  }
  ctx.fillStyle = text2Col; ctx.textAlign = 'center';
  ctx.fillText('Displacement (mm)', (pad.l + w - pad.r) / 2, h - 4);
  ctx.save(); ctx.translate(13, (pad.t + h - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Force (gf)', 0, 0); ctx.restore();

  curves.forEach(r => {
    ctx.strokeStyle = r.color; ctx.lineWidth = 1.6; ctx.beginPath();
    r.data.forEach((d, i) => { const x = X(xOf(d)), y = Y(d.f); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  });
  if (legend) legend.innerHTML = curves.map(r => `<span class="pt-leg"><span class="pt-leg-dot" style="background:${r.color}"></span>${escHtml(r.label)} <b>${r.peak.toFixed(1)} gf</b></span>`).join('');
}

function resetSelection() {
  document.querySelectorAll('.pt-row-chk').forEach(c => c.checked = false);
  const sa = $('pt_selectAll'); if (sa) sa.checked = false;
  drawGraph();
}

window.addEventListener('resize', () => { if (S) drawGraph(); });

// ── Lifecycle ─────────────────────────────────────────────────────────────────
function onConnect() {} // connection is self-managed via toggleConnection (WebHID)
function onDisconnect() {
  stopPolling();
  if (S?.hidDevice) {
    try { S.hidDevice.removeEventListener('inputreport', onInputReport); S.hidDevice.close(); } catch (_) {}
    S.hidDevice = null;
  }
  if (S?.proceedTimer) { clearInterval(S.proceedTimer); S.proceedTimer = null; }
  closeModal();
  app._connBadge(false);
  app._setBtnState(false);
}

// ── Exported instrument module ────────────────────────────────────────────────
export default {
  name: 'PT-2000 Probe Tack',
  icon: 'assets/pt2000.png',
  category: 'Instrument',
  viewType: 'custom',
  noAutoConnect: true,   // WebHID device — connection is self-managed (not app.serial)

  buildSidebar(el) {
    init();
    el.innerHTML = `<div class="sidebar-top">
      <div class="panel">
        <div class="field-label">${t('pt_conn_label')}</div>
        <div id="connStatus" class="conn-status-lbl">${t('disconnected')}</div>
        <button id="btnConnect" class="big-btn" onclick="app.instr.toggleConnection()">${t('conn_btn')}</button>
      </div>
      <div class="panel">
        <div class="panel-title">${t('pt_test_settings')}</div>
        <div class="notice">${t('pt_notice')}</div>
        <label class="fl" style="margin-top:0;">${t('pt_sample_name')}</label>
        <input id="pt_sample" class="inp" type="text" value="Sample A">
        <div class="param-grid">
          <div>
            <label class="fl">${t('pt_speed_label')}</label>
            <input id="pt_speed" class="inp" type="number" value="10" min="1" max="50" step="1">
          </div>
          <div>
            <label class="fl">${t('pt_dwell_label')}</label>
            <input id="pt_dwell" class="inp" type="number" value="1.0" min="0.5" max="30" step="0.1">
          </div>
        </div>
        <label class="fl">${t('pt_loadcell_label')}</label>
        <select id="pt_loadcell" class="inp">
          <option>500 g</option>
          <option selected>2000 g</option>
          <option>5000 g</option>
        </select>
        <label class="fl">${t('pt_tol_label')}</label>
        <input id="pt_tol" class="inp" type="number" value="20" min="1" max="100" step="1" onchange="app.instr.renderTable()">
        <div class="pt-hint-sm">${t('pt_tol_hint')}</div>
      </div>
    </div>${syslogPanelHTML()}`;
  },

  buildCenter(el) {
    el.innerHTML = `
      <div class="display-bar">
        <div class="disp-value"><span id="liveValue">--</span><span class="disp-unit" id="liveUnit">gf</span></div>
        <div class="disp-meta">
          <span id="liveStatus" class="disp-status off">${t('disconnected')}</span>
          <span class="meas-count">${t('meas_count_lbl')} <b id="measCount">0</b></span>
        </div>
      </div>
      <div class="panel datalog-head-bar">
        <div class="panel-title">${t('data_panel_title')}</div>
        <div class="datalog-actions">
          <span class="pt-count-label" title="${t('pt_repeat_hint')}">
            <label class="fl" style="margin:0;white-space:nowrap;">${t('pt_repeat_label')}</label>
            <input type="number" id="pt_repeatCount" class="pt-count-inp" value="1" min="1" max="99" step="1">
          </span>
          <button class="sbtn" onclick="app.instr.copyData()">${t('btn_copy')}</button>
          <button class="sbtn green" onclick="app.instr.exportCSV()">${t('btn_csv')}</button>
          <button class="sbtn red" onclick="app.instr.deleteSelected()">${t('pt_del_sel')}</button>
          <button class="sbtn red-o" onclick="app.instr.clearData()">${t('btn_clear')}</button>
        </div>
      </div>
      <div class="panel grow" style="min-height:0;">
        <div class="pt-table-wrap">
          <table id="ptTable">
            <thead><tr>
              <th class="cchk"><input type="checkbox" id="pt_selectAll" onchange="app.instr.toggleAll(this)"></th>
              <th>No</th>
              <th>${t('pt_sample')}</th>
              <th>Peak/Max (gf)</th>
              <th>Avg (gf)</th>
              <th>Min (gf)</th>
              <th>Std Dev</th>
              <th>Work (J)</th>
              <th>${t('pt_failure_mode')}</th>
            </tr></thead>
            <tbody id="pt_resultsBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Completion / abort modal -->
      <div id="pt_proceedModal" class="modal-overlay" style="display:none;">
        <div class="modal-box">
          <div class="modal-title" id="pt_modalTitle">✅ ${t('pt_meas_done')}</div>
          <div class="pt-modal-result" id="pt_modalResult"></div>
          <div class="pt-modal-warn" id="pt_modalWarn">${t('pt_proceed_warn')}</div>
          <button class="pt-modal-proceed" id="pt_modalBtn" onclick="app.instr.confirmProceed()">▶ ${t('pt_proceed_btn')} (Clean Probe)</button>
        </div>
      </div>`;
  },

  buildRightPanel(el) {
    el.innerHTML = `
      <div class="panel grow">
        <div class="graph-head"><div class="panel-title">${t('pt_graph_title')}</div></div>
        <div class="graph-hint">${t('pt_graph_hint')}</div>
        <div class="graph-area">
          <canvas id="pt_graphCanvas"></canvas>
          <div class="graph-empty" id="pt_graphEmpty">${t('pt_graph_empty')}</div>
        </div>
        <div id="pt_graphLegend" class="pt-legend"></div>
      </div>`;
  },

  onConnect, onDisconnect,
  toggleConnection,

  // Exposed for inline onclick handlers
  copyData, exportCSV, clearData, deleteSelected, renderTable,
  toggleAll, onSelChange, renameResult, confirmProceed, resetSelection,
};
