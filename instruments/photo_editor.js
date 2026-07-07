// Photo Editor — 촬영/업로드 → 크롭(메인뷰) → Step2 그룹 미리보기 → 엑셀 내보내기

const t = k => app?.t(k) ?? k;
const tf = (k, repl) => Object.entries(repl).reduce((s, [p, v]) => s.replaceAll(`{${p}}`, v), t(k));

const SETTINGS_KEY = 'ai_photo_editor_settings';
const CROP_KEY = 'ai_crop_v1';
const USB_CROP_KEY = 'ai_usb_crop_v1';

let S = null;
let _liveTimer = null;
let _liveRunning = false;
let _liveConnected = false;
let _cropPct = null;   // { x1, y1, x2, y2 } — 0..1 비율
let _cropDrag = null;
let _keyBound = false;
let _liveNatW = 0, _liveNatH = 0; // 마지막으로 로드된 프레임 실제 크기

// USB 크롭
let _usbCropPct = null;   // { x1, y1, x2, y2 } — videoWidth/Height 기준 0..1
let _usbCropDrag = null;
let _usbCropEditing = false;
let _usbCropResizeOb = null;

// ── settings ──────────────────────────────────────────────────────────────────
function defaultSettings() { return { outW: 1.5, outH: 1.5, perRow: 6 }; }
function loadSettings() {
  try { const r = localStorage.getItem(SETTINGS_KEY); if (r) return Object.assign(defaultSettings(), JSON.parse(r)); } catch(e) {}
  return defaultSettings();
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ outW: S.outW, outH: S.outH, perRow: S.perRow })); } catch(e) {}
}
function loadCropPct() {
  try { const r = JSON.parse(localStorage.getItem(CROP_KEY)); if (r && 'x1' in r) return r; } catch(e) {}
  return { x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9 };
}
function saveCropPct() {
  try { localStorage.setItem(CROP_KEY, JSON.stringify(_cropPct)); } catch(e) {}
}

// ── init ──────────────────────────────────────────────────────────────────────
function init() {
  const cfg = loadSettings();
  S = {
    files: [], selIdx: -1, step: 1,
    outW: cfg.outW, outH: cfg.outH, perRow: cfg.perRow,
    showCamera: true,
    overwriteIdx: -1,
    phoneSync: false, phoneLast: 0, phonePoll: null,
    usbStream: null,
  };
  _cropPct = loadCropPct();
}

// ── helpers ───────────────────────────────────────────────────────────────────
function outPx() { return { w: Math.max(1, Math.round(S.outW * 96)), h: Math.max(1, Math.round(S.outH * 96)) }; }

function rotatedCroppedCanvas(f, outW, outH) {
  const rot = (f.rotation || 0) * Math.PI / 180;
  const iw = f.img.naturalWidth, ih = f.img.naturalHeight;
  const cos = Math.abs(Math.cos(rot)), sin = Math.abs(Math.sin(rot));
  const rw = iw * cos + ih * sin, rh = iw * sin + ih * cos;
  const tmp = document.createElement('canvas');
  tmp.width = Math.ceil(rw); tmp.height = Math.ceil(rh);
  const tc = tmp.getContext('2d');
  tc.translate(rw / 2, rh / 2);
  tc.rotate(rot);
  tc.drawImage(f.img, -iw / 2, -ih / 2);
  const cp = f.fromCamera ? { x1: 0, y1: 0, x2: 1, y2: 1 } : (_cropPct || { x1: 0, y1: 0, x2: 1, y2: 1 });
  const sx = cp.x1 * rw, sy = cp.y1 * rh, sw = (cp.x2 - cp.x1) * rw, sh = (cp.y2 - cp.y1) * rh;
  const out = document.createElement('canvas');
  out.width = outW; out.height = outH;
  const oc = out.getContext('2d');
  oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = 'high';
  oc.drawImage(tmp, sx, sy, Math.max(1, sw), Math.max(1, sh), 0, 0, outW, outH);
  return out;
}

// ── file loading ──────────────────────────────────────────────────────────────
function handleFiles(fileList) {
  const arr = Array.from(fileList).filter(f => /^image\//.test(f.type));
  arr.forEach(file => {
    const img = new Image();
    img.onload = () => {
      S.files.push({ name: file.name, size: file.size, img, rotation: 0, checked: false });
      if (S.selIdx < 0) S.selIdx = 0;
      renderSidebarList();
      updateMainView();
    };
    img.src = URL.createObjectURL(file);
  });
}

// ── CSS injection ─────────────────────────────────────────────────────────────
function ensureStyles() {
  if (document.getElementById('ai-photo-styles')) return;
  const s = document.createElement('style');
  s.id = 'ai-photo-styles';
  s.textContent = `
/* 2-column layout: sidebar + center (no right panel) */
#layout.ai-noright { grid-template-columns: var(--sidebar-w) minmax(0,1fr) !important; }
#layout.ai-noright #rightpanel { display:none !important; }
#layout.ai-s2 { grid-template-columns: 1fr !important; }
#layout.ai-s2 #sidebar, #layout.ai-s2 #rightpanel { display:none !important; }

/* sidebar list */
.ai-list-hdr { display:flex; align-items:center; gap:4px; padding:4px 0; flex-wrap:wrap; }
.ai-fi { display:flex; align-items:center; gap:6px; padding:5px 4px; border-radius:6px; cursor:pointer; border:1px solid transparent; font-size:12px; user-select:none; }
.ai-fi:hover { background:var(--panel-3); }
.ai-fi.active { border-color:var(--accent); background:rgba(43,143,255,.1); }
.ai-fi.ai-dragging { opacity:0.35; }
.ai-fi.ai-drag-over { outline:2px solid var(--accent); }
.ai-fi input[type=checkbox] { flex:0 0 auto; cursor:pointer; width:14px; height:14px; accent-color:var(--accent); }
.ai-drag-handle { cursor:grab; color:var(--text-mut); font-size:14px; flex:0 0 auto; }
.ai-fi-thumb { width:36px; height:28px; object-fit:cover; border-radius:3px; flex:0 0 auto; }
.ai-fi-info { flex:1; min-width:0; }
.ai-fi-name { font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text); }
.ai-fi-del { flex:0 0 auto; background:none; border:none; color:var(--text-mut); cursor:pointer; font-size:14px; padding:0 2px; }
.ai-fi-del:hover { color:var(--red); }

/* center layout */
.ai-center-wrap { display:flex; flex-direction:column; height:100%; gap:6px; padding:8px; }
.ai-topbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:6px 10px;
  background:var(--panel); border-radius:var(--radius); border:1px solid var(--border); font-size:13px; flex-shrink:0; }
.ai-topbar label { color:var(--text-dim); font-size:12px; }
.ai-topbar input[type=number] { width:68px; padding:3px 6px; border-radius:6px;
  border:1px solid var(--border-2); background:var(--panel-3); color:var(--text); text-align:center; font-size:13px; }
.ai-topbar .spacer { flex:1; }
#aiMainView { flex:1; position:relative; background:#060e18; border-radius:var(--radius);
  overflow:hidden; min-height:0; border:1px solid var(--border); }
#aiCameraLive { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; display:block; }
#aiCropCanvas { position:absolute; inset:0; width:100%; height:100%; cursor:crosshair; }
#aiPhotoPreview { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; display:none; }
#aiCamOverlay { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:var(--text-dim); font-size:14px; pointer-events:none; }
.ai-rot-row { display:flex; align-items:center; gap:6px; padding:4px 8px;
  background:var(--panel); border-radius:var(--radius); border:1px solid var(--border); font-size:12px; flex-shrink:0; }
.ai-rot-row label { color:var(--text-dim); }
.ai-rot-row input[type=range] { flex:1; accent-color:var(--accent); }
.ai-bottombar { display:flex; align-items:center; gap:8px; padding:4px 0; flex-shrink:0; }
.ai-bottombar span { font-size:12px; color:var(--text-dim); }
.ai-shoot-btn { padding:10px 24px; background:var(--green); border:1px solid var(--green-2);
  border-radius:var(--radius); color:#fff; font-size:15px; font-weight:700; cursor:pointer; transition:background .15s; }
.ai-shoot-btn:hover { background:var(--green-2); }
#aiOverwriteHint { color:var(--warn); font-weight:600; }

/* focus ring */
.ai-focus-ring {
  position:absolute; width:58px; height:58px;
  transform:translate(-50%,-50%);
  border:2px solid #fff; border-radius:4px;
  box-shadow:0 0 0 1px rgba(0,0,0,.4);
  pointer-events:none;
  animation:ai-focus-in .18s ease-out forwards;
}
.ai-focus-ring.locked { border-color:var(--warn); box-shadow:0 0 0 1px rgba(0,0,0,.4),0 0 10px rgba(245,158,11,.6); }
.ai-focus-ring.fade { opacity:0; transition:opacity .4s; }
@keyframes ai-focus-in { from{transform:translate(-50%,-50%) scale(1.5);opacity:.4} to{transform:translate(-50%,-50%) scale(1);opacity:1} }

/* step2 */
.ai-s2-wrap { padding:12px; height:100%; overflow-y:auto; }
.ai-s2-hdr { display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
.ai-s2-hdr input[type=number] { width:52px; padding:3px 5px; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--fg); text-align:center; font-size:13px; }
.ai-s2-grid { display:flex; gap:8px; }
.ai-s2-col { display:flex; flex-direction:column; gap:4px; }
.ai-s2-col-hdr { text-align:center; font-size:11px; color:#6366f1; font-weight:700; padding:2px 0; }
.ai-s2-thumb { border-radius:4px; object-fit:cover; cursor:pointer; border:2px solid transparent; }
.ai-s2-thumb:hover { border-color:#6366f1; }
`;
  document.head.appendChild(s);
}

// ── main view update ──────────────────────────────────────────────────────────
function updateMainView() {
  const liveEl = document.getElementById('aiCameraLive');
  const preEl  = document.getElementById('aiPhotoPreview');
  const ovEl   = document.getElementById('aiCamOverlay');
  const rotRow = document.getElementById('aiRotRow');
  if (!liveEl) return;

  // USB 비디오는 카메라 모드일 때만 표시
  const usbVid  = document.getElementById('aiUsbVideo');
  const usbCrop = document.getElementById('aiUsbCropCanvas');
  const usbActive = S.showCamera && !!S.usbStream;
  if (usbVid)  usbVid.style.display  = usbActive ? 'block' : 'none';
  if (usbCrop) usbCrop.style.display = usbActive ? 'block' : 'none';

  if (S.showCamera) {
    liveEl.style.display = S.usbStream ? 'none' : 'block';
    preEl.style.display = 'none';
    // 사진 편집 크롭 캔버스는 카메라 모드에서 숨김
    const cropCvs = document.getElementById('aiCropCanvas');
    if (cropCvs) cropCvs.style.display = 'none';
    if (ovEl) ovEl.style.display = (S.usbStream || _liveConnected) ? 'none' : 'flex';
    if (rotRow) rotRow.style.display = 'none';
    document.getElementById('aiBackToCam')?.style && (document.getElementById('aiBackToCam').style.display = 'none');
  } else {
    liveEl.style.display = 'none';
    const f = S.files[S.selIdx];
    if (f) {
      preEl.src = f.img.src;
      preEl.style.display = 'block';
      if (ovEl) ovEl.style.display = 'none';
      if (rotRow) {
        rotRow.style.display = 'flex';
        const sl = document.getElementById('aiRotSlider');
        const rv = document.getElementById('aiRotVal');
        if (sl) sl.value = f.rotation || 0;
        if (rv) rv.textContent = (f.rotation || 0).toFixed(1) + '°';
      }
      document.getElementById('aiBackToCam') && (document.getElementById('aiBackToCam').style.display = '');
      renderCropOverlay();
    } else {
      preEl.style.display = 'none';
      if (ovEl) ovEl.style.display = 'flex';
      if (rotRow) rotRow.style.display = 'none';
    }
  }
  // overwrite hint
  const hint = document.getElementById('aiOverwriteHint');
  if (hint) hint.style.display = S.overwriteIdx >= 0 ? '' : 'none';
}

// ── sidebar list ──────────────────────────────────────────────────────────────
function renderSidebarList() {
  const el = document.getElementById('aiFileList');
  if (!el) return;

  // 헤더 버튼 (buildSidebar에서 이미 DOM이 만들어진 경우 내용만 갱신)
  // 파일 수 업데이트
  const countEl = document.getElementById('aiFileCount');
  if (countEl) countEl.textContent = `${S.files.length}${t('ai_file_count')}`;

  el.innerHTML = '';
  S.files.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = 'ai-fi' + (i === S.selIdx ? ' active' : '');
    item.draggable = true;
    item.dataset.idx = i;

    const thumb = document.createElement('img');
    thumb.className = 'ai-fi-thumb';
    thumb.src = f.img.src;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!f.checked;
    cb.addEventListener('change', () => {
      S.files[i].checked = cb.checked;
      updateOverwriteHint();
    });

    const handle = document.createElement('span');
    handle.className = 'ai-drag-handle';
    handle.textContent = '⠿';

    const info = document.createElement('div');
    info.className = 'ai-fi-info';
    info.innerHTML = `<div class="ai-fi-name">${f.name}</div>`;

    const del = document.createElement('button');
    del.className = 'ai-fi-del';
    del.textContent = '×';
    del.addEventListener('click', e => { e.stopPropagation(); deleteFile(i); });

    item.append(cb, handle, thumb, info, del);

    // click → select & show preview
    item.addEventListener('click', e => {
      if (e.target === cb || e.target === del) return;
      S.selIdx = i;
      S.showCamera = false;
      _cropPct = null; // 사진마다 크롭을 초기화 (이전 잔재 방지)
      renderSidebarList();
      updateMainView();
    });

    // drag-to-reorder
    item.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', String(i));
      setTimeout(() => item.classList.add('ai-dragging'), 0);
    });
    item.addEventListener('dragend', () => item.classList.remove('ai-dragging'));
    item.addEventListener('dragover', e => { e.preventDefault(); item.classList.add('ai-drag-over'); });
    item.addEventListener('dragleave', () => item.classList.remove('ai-drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault(); item.classList.remove('ai-drag-over');
      const from = parseInt(e.dataTransfer.getData('text/plain'));
      if (isNaN(from) || from === i) return;
      const selected = S.selIdx >= 0 ? S.files[S.selIdx] : null;
      const dragged = S.files.splice(from, 1)[0];
      const to = from < i ? i - 1 : i;
      S.files.splice(to, 0, dragged);
      if (selected) S.selIdx = S.files.indexOf(selected);
      renderSidebarList();
      updateMainView();
    });

    el.appendChild(item);
  });

  updateOverwriteHint();
}

function updateOverwriteHint() {
  const checked = S.files.map((f, i) => f.checked ? i : -1).filter(i => i >= 0);
  S.overwriteIdx = checked.length === 1 ? checked[0] : -1;
  const hint = document.getElementById('aiOverwriteHint');
  if (hint) hint.style.display = S.overwriteIdx >= 0 ? '' : 'none';
}

function deleteFile(i) {
  S.files.splice(i, 1);
  if (S.selIdx >= S.files.length) S.selIdx = S.files.length - 1;
  renderSidebarList();
  updateMainView();
}

// ── crop overlay ──────────────────────────────────────────────────────────────
function renderCropOverlay() {
  const cvs = document.getElementById('aiCropCanvas');
  if (!cvs) return;
  const f = S.files[S.selIdx];
  if (!f || S.showCamera) { cvs.style.display = 'none'; return; }
  cvs.style.display = 'block';
  const W = cvs.offsetWidth, H = cvs.offsetHeight;
  cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (!_cropPct) return;
  const { x1, y1, x2, y2 } = _cropPct;
  const px1 = x1 * W, py1 = y1 * H, px2 = x2 * W, py2 = y2 * H;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, W, py1);
  ctx.fillRect(0, py2, W, H - py2);
  ctx.fillRect(0, py1, px1, py2 - py1);
  ctx.fillRect(px2, py1, W - px2, py2 - py1);
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 2;
  ctx.strokeRect(px1, py1, px2 - px1, py2 - py1);
  const hs = 7;
  [[px1, py1], [px2, py1], [px1, py2], [px2, py2]].forEach(([hx, hy]) => {
    ctx.fillStyle = '#6366f1';
    ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
  });
}

function setupCropDrag() {
  const cvs = document.getElementById('aiCropCanvas');
  if (!cvs || cvs._cropDragBound) return;
  cvs._cropDragBound = true;
  const hs = 10;
  function getPos(e) {
    const r = cvs.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return [cx / r.width, cy / r.height];
  }
  function hitTest(fx, fy) {
    const { x1, y1, x2, y2 } = _cropPct;
    const W = cvs.offsetWidth, H = cvs.offsetHeight;
    const hf = hs / W, vf = hs / H;
    if (Math.abs(fx - x1) < hf && Math.abs(fy - y1) < vf) return 'tl';
    if (Math.abs(fx - x2) < hf && Math.abs(fy - y1) < vf) return 'tr';
    if (Math.abs(fx - x1) < hf && Math.abs(fy - y2) < vf) return 'bl';
    if (Math.abs(fx - x2) < hf && Math.abs(fy - y2) < vf) return 'br';
    if (fx > x1 && fx < x2 && fy > y1 && fy < y2) return 'move';
    return 'new';
  }
  function onDown(e) {
    if (e.button === 2 || e.button === 1) return;
    const [fx, fy] = getPos(e);
    const hit = hitTest(fx, fy);
    _cropDrag = { hit, sx: fx, sy: fy, cp: { ..._cropPct } };
    e.preventDefault();
  }
  function onMove(e) {
    if (!_cropDrag) return;
    const [fx, fy] = getPos(e);
    const dx = fx - _cropDrag.sx, dy = fy - _cropDrag.sy;
    const cp = { ..._cropDrag.cp };
    const { hit } = _cropDrag;
    if (hit === 'new') {
      _cropPct = { x1: Math.min(_cropDrag.sx, fx), y1: Math.min(_cropDrag.sy, fy), x2: Math.max(_cropDrag.sx, fx), y2: Math.max(_cropDrag.sy, fy) };
    } else if (hit === 'move') {
      const w = cp.x2 - cp.x1, h = cp.y2 - cp.y1;
      _cropPct = { x1: Math.max(0, Math.min(1 - w, cp.x1 + dx)), y1: Math.max(0, Math.min(1 - h, cp.y1 + dy)), x2: 0, y2: 0 };
      _cropPct.x2 = _cropPct.x1 + w; _cropPct.y2 = _cropPct.y1 + h;
    } else {
      if (hit.includes('l')) cp.x1 = Math.max(0, Math.min(cp.x2 - 0.02, cp.x1 + dx));
      if (hit.includes('r')) cp.x2 = Math.min(1, Math.max(cp.x1 + 0.02, cp.x2 + dx));
      if (hit.includes('t')) cp.y1 = Math.max(0, Math.min(cp.y2 - 0.02, cp.y1 + dy));
      if (hit.includes('b')) cp.y2 = Math.min(1, Math.max(cp.y1 + 0.02, cp.y2 + dy));
      _cropPct = cp;
    }
    renderCropOverlay();
    e.preventDefault();
  }
  function onUp() { if (_cropDrag) { saveCropPct(); _cropDrag = null; } }
  cvs.addEventListener('mousedown', onDown);
  cvs.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);
}

// ── keyboard ──────────────────────────────────────────────────────────────────
function ensureKeyListener() {
  if (_keyBound) return;
  _keyBound = true;
  document.addEventListener('keydown', e => {
    if (!document.getElementById('aiMainView')) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Enter') { e.preventDefault(); app.instr.doCapture(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); app.instr.selectNext(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); app.instr.selectPrev(); }
  });
}

// ── phone polling ─────────────────────────────────────────────────────────────
function startPhonePolling() {
  if (S.phonePoll) return;
  S.phoneSync = true;
  let _prevKey = null;

  function poll() {
    if (!S.phoneSync) return;
    fetch('/api/photos').then(r => r.json()).then(list => {
      if (!list || !list.length) return;
      const last = list[list.length - 1];
      const key = last.id + '|' + last.name;
      if (key === _prevKey) return;
      const cnt = list.length;
      const prevLen = _prevKey ? 1 : 0;
      _prevKey = key;
      return fetch('/api/photo/' + last.id).then(r => r.json()).then(d => {
        const img = new Image();
        img.onload = () => {
          const f = { name: last.name, size: 0, img, rotation: 0, checked: false };
          if (S.overwriteIdx >= 0 && S.overwriteIdx < S.files.length && prevLen > 0) {
            S.files[S.overwriteIdx] = f;
            S.selIdx = S.overwriteIdx;
            S.overwriteIdx = -1;
            S.files.forEach(ff => ff.checked = false);
          } else {
            S.files.push(f);
            S.selIdx = S.files.length - 1;
          }
          S.showCamera = false;
          renderSidebarList();
          updateMainView();
        };
        img.src = d.dataUrl;
      });
    }).catch(() => {}).finally(() => {
      S.phonePoll = setTimeout(poll, 800);
    });
  }
  S.phonePoll = setTimeout(poll, 800);
}

function stopPhonePolling() {
  S.phoneSync = false;
  if (S.phonePoll) { clearTimeout(S.phonePoll); S.phonePoll = null; }
}

// ── live camera poll ──────────────────────────────────────────────────────────
function startLivePoll() {
  if (_liveRunning) return;
  _liveRunning = true;

  function loadNext() {
    if (!_liveRunning) return;
    const el = document.getElementById('aiCameraLive');
    if (!el) { _liveRunning = false; return; }
    el.src = '/api/camera/preview?_=' + Date.now();
  }

  const el = document.getElementById('aiCameraLive');
  if (!el) { _liveRunning = false; return; }

  el.onload = () => {
    if (el.naturalWidth > 0) { _liveNatW = el.naturalWidth; _liveNatH = el.naturalHeight; }
    _liveConnected = true;
    const ov = document.getElementById('aiCamOverlay');
    if (ov) ov.style.display = 'none';
    const dot = document.getElementById('aiCamDot');
    if (dot && dot.style.color !== '#10b981') { dot.textContent = '●'; dot.style.color = '#10b981'; }
    if (_liveRunning) loadNext();
  };
  el.onerror = () => {
    _liveConnected = false;
    if (_liveRunning) _liveTimer = setTimeout(loadNext, 100);
  };

  loadNext();
}

function stopLivePoll() {
  _liveRunning = false;
  if (_liveTimer) { clearTimeout(_liveTimer); _liveTimer = null; }
}

// ── focus control (click = 초점, longpress = 고정) ────────────────────────────
function setupFocusControl() {
  const mv = document.getElementById('aiMainView');
  if (!mv || mv._focusBound) return;
  mv._focusBound = true;

  let pressTimer = null;
  let pressPos = null;

  function getImgCoords(e) {
    if (!S.showCamera) return null;
    const mvEl = document.getElementById('aiMainView');
    if (!mvEl) return null;

    // offsetX/Y: e.target 기준 좌표. aiCameraLive가 inset:0이므로 aiMainView와 동일 원점
    let px, py;
    if (e.touches) {
      const r = mvEl.getBoundingClientRect();
      px = e.touches[0].clientX - r.left;
      py = e.touches[0].clientY - r.top;
    } else {
      // e.target이 aiCameraLive(position:absolute;inset:0)이면 offsetX/Y = aiMainView 기준
      // e.target이 aiMainView 자체이거나 다른 child이면 offsetLeft/Top 보정
      let el = e.target, ox = e.offsetX, oy = e.offsetY;
      while (el && el !== mvEl) { ox += el.offsetLeft; oy += el.offsetTop; el = el.offsetParent; }
      px = ox; py = oy;
    }

    // object-fit:contain 내 실제 이미지 영역 계산
    const cw = mvEl.offsetWidth, ch = mvEl.offsetHeight;
    const natW = _liveNatW || 640, natH = _liveNatH || 360;
    const scale = Math.min(cw / natW, ch / natH);
    const sw = natW * scale, sh = natH * scale;
    const ox2 = (cw - sw) / 2, oy2 = (ch - sh) / 2;

    const x = Math.max(0, Math.min(1, (px - ox2) / sw));
    const y = Math.max(0, Math.min(1, (py - oy2) / sh));
    return { x, y, px, py };
  }

  function showFocusRing(px, py, locked) {
    let ring = document.getElementById('aiFocusRing');
    if (!ring) { ring = document.createElement('div'); ring.id = 'aiFocusRing'; mv.appendChild(ring); }
    ring.className = 'ai-focus-ring' + (locked ? ' locked' : '');
    ring.style.left = px + 'px'; ring.style.top = py + 'px';
    clearTimeout(ring._t);
    if (!locked) { ring._t = setTimeout(() => { ring.classList.add('fade'); ring._t = setTimeout(() => ring.remove(), 400); }, 1200); }
  }

  function sendFocus(x, y, lock) {
    fetch('/api/camera/focus', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y, lock }) }).catch(() => {});
  }

  function onDown(e) {
    if (!S.showCamera) return;
    const pos = getImgCoords(e);
    if (!pos) return;
    pressPos = pos;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      showFocusRing(pos.px, pos.py, true);
      sendFocus(pos.x, pos.y, true);
    }, 600);
    e.preventDefault();
  }

  function onUp(e) {
    if (pressTimer) {
      clearTimeout(pressTimer); pressTimer = null;
      if (pressPos) { showFocusRing(pressPos.px, pressPos.py, false); sendFocus(pressPos.x, pressPos.y, false); }
    }
    pressPos = null;
  }

  function onLeave() { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }

  mv.addEventListener('mousedown', onDown);
  mv.addEventListener('mouseup', onUp);
  mv.addEventListener('mouseleave', onLeave);
  mv.addEventListener('touchstart', onDown, { passive: false });
  mv.addEventListener('touchend', onUp);
}

// ── USB camera ────────────────────────────────────────────────────────────────
async function startUSBCam(deviceId) {
  stopUSBCam();
  stopLivePoll();
  const constraints = { video: deviceId ? { deviceId: { ideal: deviceId } } : true, audio: false };
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    S.usbStream = stream;
    const vid = document.getElementById('aiUsbVideo');
    const img = document.getElementById('aiCameraLive');
    if (vid) { vid.srcObject = stream; vid.style.display = 'block'; vid.play(); }
    if (img) img.style.display = 'none';
    const ov = document.getElementById('aiCamOverlay');
    if (ov) ov.style.display = 'none';
    const dot = document.getElementById('aiCamDot');
    if (dot) { dot.textContent = '●'; dot.style.color = '#10b981'; }
    const status = document.getElementById('aiCamStatus');
    if (status) status.textContent = t('ai_status_usb_connected');
    const zoomRow = document.getElementById('aiUsbZoomRow');
    if (zoomRow) zoomRow.style.display = 'flex';
    const zoomSlider = document.getElementById('aiUsbZoom');
    if (zoomSlider) { zoomSlider.value = 1; setUSBZoom(1); }
    const cropSection = document.getElementById('aiUsbCropSection');
    if (cropSection) cropSection.style.display = 'flex';
    // 비디오 메타데이터 로드 후 크롭 캔버스 초기화 (vid는 위에서 이미 선언됨)
    const initCrop = () => { setupUSBCropCanvas(); vid.removeEventListener('loadedmetadata', initCrop); };
    if (vid.videoWidth) setupUSBCropCanvas();
    else vid.addEventListener('loadedmetadata', initCrop);
  } catch(e) {
    alert(t('ai_usb_cam_fail') + e.message);
  }
}

function stopUSBCam() {
  if (S.usbStream) {
    S.usbStream.getTracks().forEach(t => t.stop());
    S.usbStream = null;
  }
  const vid = document.getElementById('aiUsbVideo');
  const img = document.getElementById('aiCameraLive');
  if (vid) { vid.srcObject = null; vid.style.display = 'none'; }
  if (img) img.style.display = 'block';
}

async function listUSBCams() {
  // 권한 요청 후 즉시 스트림 닫기 (내장 카메라 점유 방지)
  const tmp = await navigator.mediaDevices.getUserMedia({ video: true }).catch(() => null);
  if (tmp) tmp.getTracks().forEach(t => t.stop());
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'videoinput');
}

// 내장 카메라 키워드 (USB 현미경 제외용)
const BUILTIN_CAM_KEYWORDS = ['integrated', 'built-in', 'internal', 'webcam', 'facetime', 'front', 'ir camera', 'hd camera'];
function isBuiltinCam(label) {
  const l = (label || '').toLowerCase();
  return BUILTIN_CAM_KEYWORDS.some(k => l.includes(k));
}

async function usbCamConnect() {
  const cams = await listUSBCams();
  const sel = document.getElementById('aiUsbSel');
  if (!sel) return;
  sel.innerHTML = cams.map((c, i) => `<option value="${c.deviceId}">${c.label || (t('ai_camera_btn').replace('📷 ', '') + ' ' + i)}</option>`).join('');
  sel.style.display = 'block';
  // 내장 카메라가 아닌 첫 번째 카메라를 자동 선택
  const preferred = cams.find(c => !isBuiltinCam(c.label));
  if (preferred) sel.value = preferred.deviceId;
  const deviceId = sel.value;
  await startUSBCam(deviceId);
  const btn = document.getElementById('aiUsbBtn');
  if (btn) btn.textContent = t('ai_usb_disconnect_btn');
  btn.onclick = () => {
    stopUSBCam();
    sel.style.display = 'none';
    const zr = document.getElementById('aiUsbZoomRow'); if (zr) zr.style.display = 'none';
    const cs = document.getElementById('aiUsbCropSection'); if (cs) cs.style.display = 'none';
    const cc = document.getElementById('aiUsbCropCanvas'); if (cc) { cc.style.display = 'none'; cc.getContext('2d').clearRect(0,0,cc.width,cc.height); }
    _usbCropEditing = false;
    btn.textContent = t('ai_usb_connect_btn'); btn.onclick = usbCamConnect;
    const status = document.getElementById('aiCamStatus'); if (status) status.textContent = t('ai_status_idle');
  };
}

function setUSBZoom(v) {
  const vid = document.getElementById('aiUsbVideo');
  if (vid) vid.style.transform = `scale(${v})`;
  const lbl = document.getElementById('aiUsbZoomVal');
  if (lbl) lbl.textContent = v.toFixed(1) + '×';
}

// ── USB 크롭 ──────────────────────────────────────────────────────────────────
function _loadUSBCrop() {
  try { const r = JSON.parse(localStorage.getItem(USB_CROP_KEY)); if (r && 'x1' in r) return r; } catch(e) {}
  return null;
}
function _saveUSBCropLS() {
  try { _usbCropPct ? localStorage.setItem(USB_CROP_KEY, JSON.stringify(_usbCropPct)) : localStorage.removeItem(USB_CROP_KEY); } catch(e) {}
}
function _getVidDisplayRect(canvas) {
  const vid = document.getElementById('aiUsbVideo');
  const vw = vid?.videoWidth || 1920, vh = vid?.videoHeight || 1080;
  const cw = canvas.width, ch = canvas.height;
  const scale = Math.min(cw / vw, ch / vh);
  const dw = vw * scale, dh = vh * scale;
  return { x: (cw - dw) / 2, y: (ch - dh) / 2, w: dw, h: dh };
}
function _drawUSBCropOverlay() {
  const canvas = document.getElementById('aiUsbCropCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!_usbCropPct) return;
  const { x, y, w, h } = _getVidDisplayRect(canvas);
  const x1 = x + _usbCropPct.x1 * w, y1 = y + _usbCropPct.y1 * h;
  const x2 = x + _usbCropPct.x2 * w, y2 = y + _usbCropPct.y2 * h;
  ctx.fillStyle = 'rgba(0,0,0,0.48)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.clearRect(x1, y1, x2 - x1, y2 - y1);
  ctx.strokeStyle = _usbCropEditing ? '#f59e0b' : '#10b981';
  ctx.lineWidth = 2;
  ctx.setLineDash(_usbCropEditing ? [6, 3] : []);
  ctx.strokeRect(x1 + 1, y1 + 1, x2 - x1 - 2, y2 - y1 - 2);
  ctx.setLineDash([]);
  const hs = 5;
  ctx.fillStyle = _usbCropEditing ? '#f59e0b' : '#10b981';
  [[x1,y1],[x2,y1],[x1,y2],[x2,y2]].forEach(([hx,hy]) => ctx.fillRect(hx-hs, hy-hs, hs*2, hs*2));
}
function _usbCropUI() {
  const st = document.getElementById('aiUsbCropStatus');
  const clr = document.getElementById('aiUsbCropClearBtn');
  const btn = document.getElementById('aiUsbCropBtn');
  if (st) { st.textContent = _usbCropPct ? t('ai_crop_set') : t('ai_crop_unset'); st.style.color = _usbCropPct ? '#10b981' : 'var(--text-dim)'; }
  if (clr) clr.style.display = _usbCropPct ? '' : 'none';
  if (btn) { btn.textContent = _usbCropEditing ? t('ai_crop_done_btn') : t('ai_crop_set_btn'); btn.style.background = _usbCropEditing ? 'rgba(245,158,11,0.25)' : ''; }
  const canvas = document.getElementById('aiUsbCropCanvas');
  if (canvas) canvas.style.cursor = _usbCropEditing ? 'crosshair' : 'default';
}
function toggleUSBCropMode() {
  _usbCropEditing = !_usbCropEditing;
  if (!_usbCropEditing) _saveUSBCropLS();
  _usbCropUI();
  _drawUSBCropOverlay();
}
function clearUSBCrop() {
  _usbCropPct = null; _usbCropEditing = false;
  _saveUSBCropLS(); _usbCropUI(); _drawUSBCropOverlay();
}
function setupUSBCropCanvas() {
  const canvas = document.getElementById('aiUsbCropCanvas');
  if (!canvas) return;
  _usbCropPct = _loadUSBCrop();
  function resize() {
    const mv = document.getElementById('aiMainView');
    if (!mv) return;
    canvas.width = mv.clientWidth; canvas.height = mv.clientHeight;
    _drawUSBCropOverlay();
  }
  resize();
  if (_usbCropResizeOb) _usbCropResizeOb.disconnect();
  _usbCropResizeOb = new ResizeObserver(resize);
  _usbCropResizeOb.observe(document.getElementById('aiMainView'));
  canvas.style.display = 'block';
  canvas.addEventListener('mousedown', e => {
    if (!_usbCropEditing) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    _usbCropDrag = {
      sx: (e.clientX - r.left) * (canvas.width / r.width),
      sy: (e.clientY - r.top) * (canvas.height / r.height)
    };
  });
  canvas.addEventListener('mousemove', e => {
    if (!_usbCropDrag) return;
    const r = canvas.getBoundingClientRect();
    const ex = (e.clientX - r.left) * (canvas.width / r.width);
    const ey = (e.clientY - r.top) * (canvas.height / r.height);
    const vr = _getVidDisplayRect(canvas);
    const x1 = Math.max(vr.x, Math.min(_usbCropDrag.sx, ex));
    const y1 = Math.max(vr.y, Math.min(_usbCropDrag.sy, ey));
    const x2 = Math.min(vr.x + vr.w, Math.max(_usbCropDrag.sx, ex));
    const y2 = Math.min(vr.y + vr.h, Math.max(_usbCropDrag.sy, ey));
    _usbCropPct = { x1:(x1-vr.x)/vr.w, y1:(y1-vr.y)/vr.h, x2:(x2-vr.x)/vr.w, y2:(y2-vr.y)/vr.h };
    _drawUSBCropOverlay();
  });
  const endDrag = () => { _usbCropDrag = null; };
  canvas.addEventListener('mouseup', endDrag);
  canvas.addEventListener('mouseleave', endDrag);
  _usbCropUI();
}

async function captureUSBFrame() {
  const vid = document.getElementById('aiUsbVideo');
  if (!vid || !S.usbStream) return null;
  const vw = vid.videoWidth || 1920, vh = vid.videoHeight || 1080;
  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (_usbCropPct) {
    sx = Math.round(_usbCropPct.x1 * vw);
    sy = Math.round(_usbCropPct.y1 * vh);
    sw = Math.round((_usbCropPct.x2 - _usbCropPct.x1) * vw);
    sh = Math.round((_usbCropPct.y2 - _usbCropPct.y1) * vh);
  }
  const canvas = document.createElement('canvas');
  canvas.width = sw; canvas.height = sh;
  canvas.getContext('2d').drawImage(vid, sx, sy, sw, sh, 0, 0, sw, sh);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
}

// ── capture ───────────────────────────────────────────────────────────────────
let _capturing = false;
async function doCapture() {
  if (_capturing) return;
  _capturing = true;
  const btn = document.querySelector('.ai-shoot-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  try {
  const checked = S.files.map((f, i) => f.checked ? i : -1).filter(i => i >= 0);
  S.overwriteIdx = checked.length === 1 ? checked[0] : -1;
  S.showCamera = true;
  updateMainView();

  if (S.usbStream) {
    const blob = await captureUSBFrame();
    if (!blob) return;
    const perRow = S.perRow || 6;
    const idx = S.files.length;
    const groupNum = Math.floor(idx / perRow) + 1;
    const posNum = (idx % perRow) + 1;
    const file = new File([blob], `${groupNum}-${posNum}.jpg`, { type: 'image/jpeg' });
    const img = new Image();
    img.onload = () => {
      S.files.push({ name: file.name, size: file.size, img, rotation: 0, checked: false, fromCamera: true });
      if (S.selIdx < 0) S.selIdx = 0;
      renderSidebarList();
      updateMainView();
    };
    img.src = URL.createObjectURL(file);
    return;
  }

  try {
    await fetch('/api/camera/trigger', { method: 'POST' });
  } catch(_) {
    if (window.app?.log) app.log(t('ai_capture_signal_fail'));
  }
  } finally {
    _capturing = false;
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
  }
}

// ── Step 2 ────────────────────────────────────────────────────────────────────
function renderStep2() {
  const layout = document.getElementById('layout');
  if (layout) { layout.className = (layout.className || '').replace(/\bai-\S+/g, '').trim() + ' ai-s2'; }
  const center = document.getElementById('center');
  console.log('[renderStep2] center:', !!center, 'files:', S.files.length);
  if (!center) return;

  const { w: ow, h: oh } = outPx();
  const perRow = S.perRow || 6;

  center.innerHTML = `
    <div class="ai-s2-wrap">
      <div class="ai-s2-hdr">
        <button class="sbtn" onclick="app.instr.backToStep1()">${t('ai_back')}</button>
        <span style="color:#9fb0c4;font-size:13px;">${t('ai_output_size')}: ${S.outW}×${S.outH}″</span>
        <span style="color:#9fb0c4;font-size:13px;">${t('ai_s2_per_col')}: ${perRow}${t('ai_unit_sheets')}</span>
        <div style="flex:1"></div>
        <button id="aiJpegBtn" style="padding:6px 14px;border:none;border-radius:6px;background:#1f9d57;color:#fff;cursor:pointer;font-size:13px;font-weight:700;">${t('ai_jpeg_save_btn')}</button>
        <button id="aiExportBtn" style="padding:6px 14px;border:none;border-radius:6px;background:#6366f1;color:#fff;cursor:pointer;font-size:13px;font-weight:700;">${t('ai_export_excel')}</button>
      </div>
      <div class="ai-s2-grid" id="aiS2Grid"></div>
    </div>
  `;

  document.getElementById('aiExportBtn').addEventListener('click', exportExcel);
  document.getElementById('aiJpegBtn').addEventListener('click', exportJpegs);

  const grid = document.getElementById('aiS2Grid');
  const numCols = Math.ceil(S.files.length / perRow);
  for (let c = 0; c < numCols; c++) {
    const col = document.createElement('div');
    col.className = 'ai-s2-col';
    const hdr = document.createElement('div');
    hdr.className = 'ai-s2-col-hdr';
    hdr.textContent = '#' + (c + 1);
    col.appendChild(hdr);
    for (let r = 0; r < perRow; r++) {
      const idx = c * perRow + r;
      if (idx >= S.files.length) break;
      const f = S.files[idx];
      const cvs = rotatedCroppedCanvas(f, ow, oh);
      const img = document.createElement('img');
      img.className = 'ai-s2-thumb';
      img.src = cvs.toDataURL();
      img.style.width = Math.round(ow * 0.7) + 'px';
      img.style.height = Math.round(oh * 0.7) + 'px';
      col.appendChild(img);
    }
    grid.appendChild(col);
  }
}

function backToStep1() {
  const layout = document.getElementById('layout');
  if (layout) layout.className = (layout.className || '').replace(/\bai-\S+/g, '').trim() + ' ai-noright';
  S.step = 1;
  buildCenterStep1(document.getElementById('center'));

  // buildCenterStep1()이 HTML을 새로 그리므로 살아있는 USB 스트림을 새 video 요소에 재연결
  if (S.usbStream) {
    const vid = document.getElementById('aiUsbVideo');
    if (vid) {
      vid.srcObject = S.usbStream;
      vid.play().catch(() => {});
    }
    const zoomRow = document.getElementById('aiUsbZoomRow');
    if (zoomRow) zoomRow.style.display = 'flex';
    const cropSection = document.getElementById('aiUsbCropSection');
    if (cropSection) cropSection.style.display = 'flex';
    if (vid && vid.videoWidth) {
      setupUSBCropCanvas();
    } else if (vid) {
      vid.addEventListener('loadedmetadata', function once() {
        vid.removeEventListener('loadedmetadata', once);
        setupUSBCropCanvas();
      });
    }
  }

  updateMainView();
  renderSidebarList();
}

function backToStep1FromS2() {
  backToStep1();
}

// ── Excel export ──────────────────────────────────────────────────────────────
async function exportJpegs() {
  const btn = document.getElementById('aiJpegBtn');
  const files = S.files;
  if (!files.length) { alert(t('ai_no_photos_to_save')); return; }
  if (btn) { btn.textContent = t('ai_zipping'); btn.disabled = true; }
  try {
    const jzMod = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
    const JSZip = jzMod.default || jzMod.JSZip || jzMod;
    const zip = new JSZip();
    const { w: ow, h: oh } = outPx();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const cvs = rotatedCroppedCanvas(f, ow, oh);
      const blob = await new Promise(res => cvs.toBlob(res, 'image/jpeg', 0.95));
      const name = f.name || `photo_${String(i+1).padStart(3,'0')}.jpg`;
      zip.file(name, blob);
      await new Promise(res => setTimeout(res, 0)); // UI 블로킹 방지
    }
    const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = 'photos.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch(e) {
    alert(t('ai_save_fail') + e.message);
  } finally {
    if (btn) { btn.textContent = t('ai_jpeg_save_btn'); btn.disabled = false; }
  }
}

async function exportExcel() {
  const btn = document.getElementById('aiExportBtn');
  if (btn) { btn.textContent = t('ai_generating'); btn.disabled = true; }
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/+esm');
    const Workbook = mod.Workbook || mod.default?.Workbook || mod.default;
    if (typeof Workbook !== 'function') throw new Error('ExcelJS load failed — check your internet connection or use JPEG export.');
    const wb = new Workbook();
    const ws = wb.addWorksheet('Photos');

    const { w: ow, h: oh } = outPx();
    const outW = S.outW || 1.5;  // inches
    const outH = S.outH || 1.5;  // inches
    const perRow = S.perRow || 6;
    // 그룹 수 = 사진 수 ÷ 그룹 개수 (올림)
    const numCols = Math.ceil(S.files.length / perRow);

    // 열 너비: 1인치 = 96px, 1글자 ≈ 7px
    const colW = outW * 96 / 7;
    // 행 높이: 1인치 = 72pt (Excel 포인트 단위)
    const rowH = outH * 72;

    // 헤더 행
    ws.getRow(1).height = 14;
    for (let c = 0; c < numCols; c++) {
      ws.getColumn(c + 1).width = colW;
      const cell = ws.getCell(1, c + 1);
      cell.value = tf('ai_group_num', { n: c + 1 });
      cell.alignment = { horizontal: 'center' };
    }

    // 데이터 행 높이 (perRow 행 + 여유 1행)
    for (let r = 0; r < perRow + 1; r++) {
      ws.getRow(r + 2).height = rowH;
    }

    // 이미지 삽입: 열 = 그룹, 행 = 그룹 내 순번
    for (let c = 0; c < numCols; c++) {
      for (let r = 0; r < perRow; r++) {
        const idx = c * perRow + r;
        if (idx >= S.files.length) break;
        const f = S.files[idx];
        const cvs = rotatedCroppedCanvas(f, ow, oh);
        const b64 = cvs.toDataURL('image/png').split(',')[1];
        const imgId = wb.addImage({ base64: b64, extension: 'png' });
        // tl/br 셀 기반 배치 — 픽셀/포인트 단위 혼선 없음
        ws.addImage(imgId, {
          tl: { col: c, row: r + 1 },
          br: { col: c + 1, row: r + 2 },
          editAs: 'oneCell',
        });
        await new Promise(res => setTimeout(res, 0));
      }
    }

    let buf = await wb.xlsx.writeBuffer();

    // drawing XML 후처리: 각 그룹의 이미지를 Excel 네이티브 그룹(<xdr:grpSp>)으로 묶기
    buf = await _groupImagesInXlsx(buf, perRow, numCols, outW, outH);

    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'photos.xlsx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch(e) {
    alert(t('ai_export_fail') + e.message);
  } finally {
    if (btn) { btn.textContent = t('ai_export_excel'); btn.disabled = false; }
  }
}

async function _groupImagesInXlsx(buf, perRow, numCols, outW, outH) {
  let JSZip;
  try {
    const jzMod = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
    JSZip = jzMod.default || jzMod.JSZip || jzMod;
    if (typeof JSZip.loadAsync !== 'function') throw new Error('JSZip 로드 실패');
  } catch(e) {
    console.warn('[PhotoEditor] JSZip 로드 실패, 그룹 미적용:', e.message);
    return buf; // 그룹화 실패해도 xlsx 자체는 반환
  }

  const zip = await JSZip.loadAsync(buf);
  const drawFile = zip.file('xl/drawings/drawing1.xml');
  if (!drawFile) return buf;
  const xml = await drawFile.async('text');

  const IMW = Math.round(outW * 914400); // 이미지 너비 (EMU)
  const IMH = Math.round(outH * 914400); // 이미지 높이 (EMU)

  // ExcelJS가 생성한 개별 앵커 블록 추출
  const blocks = [];
  const re = /<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g;
  let m;
  while ((m = re.exec(xml)) !== null) blocks.push(m[0]);
  if (!blocks.length) return buf;

  const headerEnd = xml.indexOf('<xdr:twoCellAnchor');
  const xmlHeader = xml.slice(0, headerEnd);

  let newContent = '';
  for (let c = 0; c < numCols; c++) {
    const grp = blocks.slice(c * perRow, Math.min((c + 1) * perRow, blocks.length));
    if (!grp.length) break;
    const cnt = grp.length;

    // 각 <xdr:pic>을 그룹 내 EMU 좌표로 재배치
    const pics = grp.map((block, r) => {
      const picMatch = block.match(/<xdr:pic>([\s\S]*?)<\/xdr:pic>/);
      if (!picMatch) return '';
      const inner = picMatch[1].replace(
        /<a:xfrm>[\s\S]*?<\/a:xfrm>/,
        `<a:xfrm><a:off x="0" y="${r * IMH}"/><a:ext cx="${IMW}" cy="${IMH}"/></a:xfrm>`
      );
      return `<xdr:pic>${inner}</xdr:pic>`;
    }).join('');

    // 그룹 전체를 하나의 twoCellAnchor + grpSp로 감싸기
    newContent += `<xdr:twoCellAnchor>` +
      `<xdr:from><xdr:col>${c}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
      `<xdr:to><xdr:col>${c+1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${1+cnt}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
      `<xdr:grpSp>` +
        `<xdr:nvGrpSpPr>` +
          `<xdr:cNvPr id="${(c+1)*1000}" name="${tf('ai_group_num', { n: c + 1 })}"/>` +
          `<xdr:cNvGrpSpPr/><xdr:nvPr/>` +
        `</xdr:nvGrpSpPr>` +
        `<xdr:grpSpPr>` +
          `<a:xfrm>` +
            `<a:off x="0" y="0"/>` +
            `<a:ext cx="${IMW}" cy="${IMH*cnt}"/>` +
            `<a:chOff x="0" y="0"/>` +
            `<a:chExt cx="${IMW}" cy="${IMH*cnt}"/>` +
          `</a:xfrm>` +
        `</xdr:grpSpPr>` +
        pics +
      `</xdr:grpSp>` +
      `<xdr:clientData/>` +
    `</xdr:twoCellAnchor>\n`;
  }

  zip.file('xl/drawings/drawing1.xml', xmlHeader + newContent + '</xdr:wsDr>');
  return await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

// ── build center (step 1) ─────────────────────────────────────────────────────
function buildCenterStep1(el) {
  el.innerHTML = `
    <div class="ai-center-wrap">
      <div class="ai-topbar">
        <label>${t('ai_output_size')}</label>
        <input type="number" id="aiOutH" min="0.5" max="20" step="0.1" value="${S.outH}" style="width:68px">
        <span style="color:#9fb0c4">×</span>
        <input type="number" id="aiOutW" min="0.5" max="20" step="0.1" value="${S.outW}" style="width:68px">
        <label style="color:#9fb0c4">inch</label>
        <span style="color:#9fb0c4;margin-left:4px">${t('ai_per_row')}</span>
        <input type="number" id="aiPerRow" min="1" max="20" step="1" value="${S.perRow}" style="width:44px">
        <span id="aiBackToCam" style="display:none">
          <button class="sbtn" onclick="app.instr.backToCamera()">${t('ai_camera_btn')}</button>
        </span>
        <div class="spacer"></div>
      </div>
      <div id="aiMainView">
        <img id="aiCameraLive" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;">
        <video id="aiUsbVideo" autoplay playsinline muted style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:none;background:#000;"></video>
        <canvas id="aiUsbCropCanvas" style="position:absolute;inset:0;width:100%;height:100%;display:none;"></canvas>
        <canvas id="aiCropCanvas" style="position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;display:none;"></canvas>
        <img id="aiPhotoPreview" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:none;">
        <div id="aiCamOverlay" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#9fb0c4;font-size:14px;pointer-events:none;">
          <div style="font-size:32px">🔬</div>
          <div>${t('ai_cam_overlay_line1')}</div>
          <div style="font-size:12px">${t('ai_cam_overlay_line2')}</div>
        </div>
      </div>
      <div id="aiRotRow" class="ai-rot-row" style="display:none">
        <label>${t('ai_rotation_label')}</label>
        <button class="sbtn" onclick="app.instr.stepRot(-1)">−0.1°</button>
        <input type="range" id="aiRotSlider" min="-15" max="15" step="0.1" value="0" oninput="app.instr.setRot(parseFloat(this.value))">
        <button class="sbtn" onclick="app.instr.stepRot(1)">+0.1°</button>
        <span id="aiRotVal" style="font-size:12px;color:var(--text-dim);min-width:36px;text-align:center;">0.0°</span>
        <button class="sbtn" onclick="app.instr.setRot(0)">${t('ai_reset_btn')}</button>
      </div>
      <div class="ai-bottombar">
        <span id="aiCamStatus" style="font-size:12px;color:#9fb0c4;">${t('ai_status_idle')}</span>
        <span id="aiOverwriteHint" style="display:none;color:#f59e0b;font-size:12px;font-weight:600;">${t('ai_overwrite_hint')}</span>
        <div style="flex:1"></div>
        <button class="ai-shoot-btn" onclick="app.instr.doCapture()">${t('ai_shoot_btn')}</button>
        <div style="flex:1"></div>
        <button class="sbtn green" onclick="app.instr.goNext()">${t('ai_next')}</button>
      </div>
    </div>
  `;

  // settings binding
  el.querySelector('#aiOutH').addEventListener('change', e => { S.outH = parseFloat(e.target.value) || 1.5; saveSettings(); });
  el.querySelector('#aiOutW').addEventListener('change', e => { S.outW = parseFloat(e.target.value) || 1.5; saveSettings(); });
  el.querySelector('#aiPerRow').addEventListener('change', e => { S.perRow = parseInt(e.target.value) || 6; saveSettings(); });

  setTimeout(() => { setupCropDrag(); }, 0);
}

// ── module export ─────────────────────────────────────────────────────────────
export default {
  name: 'Photo Editor',
  icon: 'assets/photo_editor.png',
  viewType: 'custom',
  serial: null,

  onConnect() {},
  onDisconnect() {},

  buildSidebar(el) {
    ensureStyles();
    if (!S) init();

    el.innerHTML = `
      <div style="padding:8px;display:flex;flex-direction:column;gap:8px;height:100%;min-height:0;overflow-y:auto;">

        <!-- USB 현미경 카드 -->
        <div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:12px;display:flex;flex-direction:column;gap:8px;flex-shrink:0;">
          <div style="font-size:13px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:6px;">
            <span>🔬</span><span>${t('ai_usb_mic_title')}</span>
            <span id="aiCamDot" style="margin-left:auto;font-size:11px;color:var(--text-mut);">●</span>
          </div>
          <button id="aiUsbBtn" class="sbtn green" onclick="app.instr.usbCamConnect()"
            style="width:100%;text-align:center;box-sizing:border-box;">
            ${t('ai_usb_connect_btn')}
          </button>
          <select id="aiUsbSel" style="display:none;width:100%;padding:4px 6px;border-radius:6px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);font-size:12px;"
            onchange="app.instr.startUSBCam(this.value)"></select>
          <div id="aiUsbZoomRow" style="display:none;align-items:center;gap:8px;">
            <span style="font-size:12px;color:var(--text-dim);white-space:nowrap;">${t('ai_zoom_label')}</span>
            <input type="range" id="aiUsbZoom" min="1" max="10" step="0.1" value="1"
              style="flex:1;" oninput="app.instr.setUSBZoom(parseFloat(this.value))">
            <span id="aiUsbZoomVal" style="font-size:12px;color:var(--text);min-width:32px;text-align:right;">1.0×</span>
          </div>
          <div id="aiUsbCropSection" style="display:none;flex-direction:column;gap:6px;border-top:1px solid var(--border);padding-top:8px;">
            <div style="display:flex;align-items:center;gap:4px;">
              <span id="aiUsbCropStatus" style="font-size:12px;color:var(--text-dim);">${t('ai_crop_unset')}</span>
              <div style="flex:1"></div>
              <button id="aiUsbCropClearBtn" class="sbtn" style="font-size:11px;padding:3px 8px;display:none;" onclick="app.instr.clearUSBCrop()">${t('ai_reset_btn')}</button>
            </div>
            <button id="aiUsbCropBtn" class="sbtn" style="width:100%;text-align:center;" onclick="app.instr.toggleUSBCropMode()">${t('ai_crop_set_btn')}</button>
          </div>
        </div>

        <!-- 파일 리스트 카드 -->
        <div style="background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:12px;display:flex;flex-direction:column;gap:6px;flex:1;min-height:0;">
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-size:13px;font-weight:600;color:var(--text);">📁 List</span>
            <div style="flex:1"></div>
            <button class="sbtn" onclick="app.instr.deleteChecked()" style="font-size:12px;padding:4px 10px;">${t('ai_delete_selected')}</button>
            <button class="sbtn red" onclick="app.instr.deleteAll()" style="font-size:12px;padding:4px 10px;">${t('ai_delete_all')}</button>
          </div>
          <div id="aiFileCount" style="font-size:12px;color:var(--text-dim);">0${t('ai_file_count')}</div>
          <!-- 드롭존: 버튼 높이로 고정 -->
          <label id="aiDropZone"
            style="display:flex;align-items:center;justify-content:center;gap:8px;flex-shrink:0;
                   cursor:pointer;border:2px dashed var(--border-2);border-radius:var(--radius);
                   padding:7px 12px;color:var(--text-dim);font-size:13px;">
            <span>${t('ai_drop_zone')}</span>
            <input type="file" id="aiFileInput" multiple accept="image/*" style="display:none">
          </label>
          <!-- 파일 목록 -->
          <div id="aiFileList" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:3px;min-height:0;"></div>
        </div>

      </div>
    `;

    // 파일 선택
    el.querySelector('#aiFileInput').addEventListener('change', e => { handleFiles(e.target.files); });

    // 드롭존
    const dz = el.querySelector('#aiDropZone');
    dz.addEventListener('dragover', e => {
      e.preventDefault();
      dz.style.borderColor = '#6366f1';
      dz.style.background = '#6366f11a';
    });
    dz.addEventListener('dragleave', () => {
      dz.style.borderColor = '';
      dz.style.background = '';
    });
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.style.borderColor = '';
      dz.style.background = '';
      handleFiles(e.dataTransfer.files);
    });

    renderSidebarList();

    // 2-column layout
    const layout = document.getElementById('layout');
    if (layout) {
      layout.className = (layout.className || '').replace(/\bai-\S+/g, '').trim();
      layout.classList.add('ai-noright');
    }
  },

  buildCenter(el) {
    buildCenterStep1(el);
    ensureKeyListener();
    setTimeout(() => { updateMainView(); setupFocusControl(); }, 0);
  },

  buildRightPanel(el) {
    el.style.display = 'none';
  },

  // ── public methods ─────────────────────────────────────────────────────────
  doCapture,
  startUSBCam,
  stopUSBCam,
  usbCamConnect,
  setUSBZoom,
  toggleUSBCropMode,
  clearUSBCrop,

  async openPhone() {
    const btn = document.getElementById('aiPhoneBtn');
    const dot = document.getElementById('aiCamDot');
    const txt = document.getElementById('aiPhoneTxt');
    if (btn) btn.disabled = true;
    if (txt) txt.textContent = t('ai_phone_connecting');
    try {
      const res = await fetch('/api/camera/open-phone', { method: 'POST' });
      const j = await res.json();
      if (j.ok) {
        if (txt) { txt.textContent = t('ai_phone_synced'); txt.style.color = '#10b981'; }
        if (btn) btn.disabled = false;
        if (dot) { dot.textContent = '●'; dot.style.color = '#10b981'; }
      } else {
        const err = j.error || j.msg || t('ai_fail_generic');
        if (txt) { txt.textContent = t('ai_phone_start_txt'); txt.style.color = '#ef4444'; }
        if (btn) btn.disabled = false;
        if (dot) { dot.textContent = '●'; dot.style.color = '#ef4444'; }
        if (err.includes('adb') || err.includes('미설치') || err.toLowerCase().includes('not installed')) {
          const ip = location.hostname;
          alert(tf('ai_adb_missing', { ip }));
        } else {
          alert(t('ai_phone_sync_fail') + err);
        }
        setTimeout(() => { if (txt) txt.style.color = ''; }, 3000);
      }
    } catch(_) {
      if (txt) { txt.textContent = t('ai_phone_start_txt'); txt.style.color = ''; }
      if (btn) btn.disabled = false;
      if (dot) { dot.textContent = '●'; dot.style.color = '#9fb0c4'; }
      alert(t('ai_server_not_running'));
    }
  },

  backToCamera() {
    S.showCamera = true;
    updateMainView();
  },

  selectNext() {
    if (!S.files.length) return;
    S.selIdx = Math.min(S.files.length - 1, S.selIdx + 1);
    S.showCamera = false;
    renderSidebarList();
    updateMainView();
    // scroll sidebar item into view
    const items = document.querySelectorAll('.ai-fi');
    if (items[S.selIdx]) items[S.selIdx].scrollIntoView({ block: 'nearest' });
  },

  selectPrev() {
    if (!S.files.length) return;
    S.selIdx = Math.max(0, S.selIdx - 1);
    S.showCamera = false;
    renderSidebarList();
    updateMainView();
    const items = document.querySelectorAll('.ai-fi');
    if (items[S.selIdx]) items[S.selIdx].scrollIntoView({ block: 'nearest' });
  },

  setRot(val) {
    const f = S.files[S.selIdx];
    if (!f) return;
    f.rotation = val;
    const rv = document.getElementById('aiRotVal');
    if (rv) rv.textContent = val.toFixed(1) + '°';
    renderCropOverlay();
  },

  stepRot(dir) {
    const f = S.files[S.selIdx];
    if (!f) return;
    const sl = document.getElementById('aiRotSlider');
    const newVal = Math.round(((f.rotation || 0) + dir * 0.1) * 10) / 10;
    f.rotation = Math.max(-15, Math.min(15, newVal));
    if (sl) sl.value = f.rotation;
    const rv = document.getElementById('aiRotVal');
    if (rv) rv.textContent = f.rotation.toFixed(1) + '°';
    renderCropOverlay();
  },

  deleteChecked() {
    const before = S.selIdx >= 0 ? S.files[S.selIdx] : null;
    S.files = S.files.filter(f => !f.checked);
    S.selIdx = before && !before.checked ? S.files.indexOf(before) : Math.min(S.selIdx, S.files.length - 1);
    renderSidebarList();
    updateMainView();
  },

  deleteAll() {
    if (!S.files.length) return;
    if (!confirm(t('ai_confirm_delete_all'))) return;
    S.files = []; S.selIdx = -1;
    renderSidebarList();
    updateMainView();
  },

  goNext() {
    if (!S.files.length) { alert(t('ai_upload_first')); return; }
    S.step = 2;
    stopLivePoll();
    const layout = document.getElementById('layout');
    console.log('[goNext] files:', S.files.length, 'layout:', !!layout);
    if (layout) {
      layout.className = (layout.className || '').replace(/\bai-\S+/g, '').trim();
      layout.classList.add('ai-s2');
      console.log('[goNext] layout.className:', layout.className);
    }
    try { renderStep2(); console.log('[goNext] renderStep2 done'); }
    catch(e) { console.error('[goNext] renderStep2 error:', e); }
  },

  backToStep1() {
    backToStep1();
    setTimeout(setupFocusControl, 0);
  },

  onDeactivate() {
    stopLivePoll();
    stopPhonePolling();
    _keyBound = false;
    const layout = document.getElementById('layout');
    if (layout) layout.className = (layout.className || '').replace(/\bai-\S+/g, '').trim();
  },
};
