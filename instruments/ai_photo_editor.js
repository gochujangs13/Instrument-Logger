// Photo Editor — web port (YOLO 학습 기능 제외)
// Step1: 파일 업로드/크롭/줌/팬/회전/자동맞춤/출력 크기 설정
// Step2: 그리드 미리보기 + 보정 + 엑셀(이미지 포함) 내보내기

const SETTINGS_KEY = 'ai_photo_editor_settings';

let S = null;

function defaultSettings() {
  return { outW: 1.5, outH: 1.5, perRow: 6 };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return Object.assign(defaultSettings(), JSON.parse(raw));
  } catch (e) {}
  return defaultSettings();
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ outW: S.outW, outH: S.outH, perRow: S.perRow }));
  } catch (e) {}
}

function init() {
  const cfg = loadSettings();
  S = {
    files: [],     // { name, img, angle, crop:[x,y,w,h] (rotated-canvas coords), _rotCache }
    selIdx: -1,
    step: 1,
    zoom: 1,
    pan: [0, 0],
    outW: cfg.outW,
    outH: cfg.outH,
    perRow: cfg.perRow,
    drag: null,    // active mouse interaction on canvas
    phoneSync: false, phoneLast: 0, phonePoll: null, phoneUrl: '',
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function rotatedCanvas(f) {
  const angle = f.angle || 0;
  if (f._rotCache && f._rotCache.angle === angle) return f._rotCache;
  const img = f.img;
  const w = img.naturalWidth, h = img.naturalHeight;
  const rad = angle * Math.PI / 180;
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  const nw = Math.max(1, Math.round(w * cos + h * sin));
  const nh = Math.max(1, Math.round(w * sin + h * cos));
  const c = document.createElement('canvas');
  c.width = nw; c.height = nh;
  const ctx = c.getContext('2d');
  ctx.translate(nw / 2, nh / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  const out = { angle, canvas: c, w: nw, h: nh };
  f._rotCache = out;
  return out;
}

function ensureCrop(f) {
  const rc = rotatedCanvas(f);
  if (!f.crop) {
    const d = Math.min(rc.w, rc.h) * 0.6;
    f.crop = [(rc.w - d) / 2, (rc.h - d) / 2, d, d];
  }
  // clamp into bounds
  let [x, y, w, h] = f.crop;
  w = Math.min(w, rc.w); h = Math.min(h, rc.h);
  x = Math.max(0, Math.min(x, rc.w - w));
  y = Math.max(0, Math.min(y, rc.h - h));
  f.crop = [x, y, w, h];
  return f.crop;
}

function outPx() {
  return { w: Math.max(1, Math.round(S.outW * 96)), h: Math.max(1, Math.round(S.outH * 96)) };
}

function fileSizeStr(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// ── file loading ───────────────────────────────────────────────────────────

function handleFiles(fileList) {
  const arr = Array.from(fileList).filter(f => /^image\//.test(f.type));
  let loaded = 0;
  arr.forEach(file => {
    const img = new Image();
    img.onload = () => {
      S.files.push({ name: file.name, size: file.size, img, angle: 0, crop: null });
      loaded++;
      if (S.selIdx === -1) S.selIdx = 0;
      renderCenter();
    };
    img.src = URL.createObjectURL(file);
  });
}

// ── 폰 카메라 연동 (서버 폴링) ───────────────────────────────────────────────

async function updatePhoneInfo() {
  const info = document.getElementById('aiPhoneInfo');
  if (!info) return;
  if (!S.phoneUrl) {
    try {
      const r = await fetch('/api/info');
      const j = await r.json();
      S.phoneUrl = j.phoneUrl || '';
    } catch (e) { S.phoneUrl = ''; }
  }
  if (S.phoneSync) {
    info.innerHTML = `🟢 연동 중 — 폰에서 촬영하면 자동 등록됩니다.<br>
      폰 주소(같은 와이파이):<br><b style="color:#60a5fa;word-break:break-all">${S.phoneUrl || '서버(server.py) 실행 필요'}</b>`;
  } else {
    info.innerHTML = `폰을 같은 와이파이에 연결하고 아래 주소를 열어 촬영하세요.<br>
      <b style="color:#60a5fa;word-break:break-all">${S.phoneUrl || 'server.py 로 실행해야 사용 가능'}</b><br>
      <span style="color:#f0a">※ http.server가 아닌 <b>python server.py</b>로 실행해야 합니다.</span>`;
  }
}

function startPhoneSync() {
  if (S.phoneSync) return;
  S.phoneSync = true;
  const btn = document.getElementById('aiPhoneBtn');
  if (btn) btn.textContent = '⏹ 폰 연동 중지';
  updatePhoneInfo();
  pollPhone();
  S.phonePoll = setInterval(pollPhone, 2000);
  app.log?.('📱 폰 연동 시작 — 폰에서 촬영을 기다립니다.');
}

function stopPhoneSync() {
  if (S.phonePoll) { clearInterval(S.phonePoll); S.phonePoll = null; }
  if (!S.phoneSync) return;
  S.phoneSync = false;
  const btn = document.getElementById('aiPhoneBtn');
  if (btn) btn.textContent = '▶ 폰 연동 시작';
  updatePhoneInfo();
}

async function pollPhone() {
  let list;
  try {
    const r = await fetch('/api/photos?since=' + S.phoneLast);
    list = await r.json();
  } catch (e) { return; }
  if (!list || !list.photos || !list.photos.length) return;
  for (const p of list.photos) {
    await addPhonePhoto(p);
    S.phoneLast = Math.max(S.phoneLast, p.id);
  }
  if (S.selIdx === -1 && S.files.length) S.selIdx = 0;
  renderCenter();
  app.log?.(`📷 폰 사진 ${list.photos.length}장 등록 (총 ${S.files.length}장)`);
}

function addPhonePhoto(p) {
  return new Promise(resolve => {
    fetch('/api/photo/' + p.id)
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { S.files.push({ name: p.name, size: blob.size, img, angle: 0, crop: null }); resolve(); };
        img.onerror = () => resolve();
        img.src = url;
      })
      .catch(() => resolve());
  });
}

// ── module export ──────────────────────────────────────────────────────────

export default {
  name: 'Photo Editor',
  icon: 'assets/ai_photo_editor.png',
  category: 'Tool',
  viewType: 'custom',

  onConnect() {},
  onDisconnect() { setStep2Layout(false); stopPhoneSync(); },
  onLine() {},

  buildSidebar(el) {
    if (!S) init();
    const t = k => app.t(k);
    el.innerHTML = `
      <div class="panel">
        <div class="panel-title" style="margin-bottom:6px">${t('ai_phone_title')}</div>
        <button id="aiPhoneBtn" class="sbtn" style="width:100%" onclick="app.instr.togglePhoneSync()">${S.phoneSync ? t('ai_phone_stop') : t('ai_phone_start')}</button>
        <div id="aiPhoneInfo" style="margin-top:8px;font-size:11px;color:var(--text-dim);line-height:1.6"></div>
      </div>
      <div class="panel" style="display:flex;flex-direction:column;min-height:0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
          <div class="panel-title" style="margin:0">${t('ai_file_list')}</div>
          <button class="sbtn red" style="padding:2px 8px;font-size:11px;width:auto" onclick="app.instr.deleteAllFiles()">${t('ai_delete_all')}</button>
        </div>
        <div style="font-size:12px;color:var(--text-dim);margin:2px 0 8px"><b id="aiFileCount">${S.files.length}</b>${t('ai_file_count')}</div>
        <div id="aiDropZone">${t('ai_drop_hint')}</div>
        <input id="aiFileInput" type="file" accept="image/*" multiple style="display:none">
        <div id="aiSidebarList"></div>
      </div>`;
    updatePhoneInfo();

    const dz = document.getElementById('aiDropZone');
    const fi = document.getElementById('aiFileInput');
    dz.onclick = () => fi.click();
    fi.onchange = e => { handleFiles(e.target.files); e.target.value = ''; };
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); });
    renderSidebarList();
  },

  buildCenter(el) {
    if (!S) init();
    // 테마 전환 시 CSS 변수가 자동 반영되도록 항상 최신 스타일로 갱신
    let aiStyle = document.getElementById('aiPhotoStyle');
    if (!aiStyle) { aiStyle = document.createElement('style'); aiStyle.id = 'aiPhotoStyle'; document.head.appendChild(aiStyle); }
    aiStyle.textContent = `
      /* 사이드바 드롭존 + 파일목록 */
      #aiDropZone{border:2px dashed var(--border-2);border-radius:12px;min-height:90px;display:flex;align-items:center;justify-content:center;
        text-align:center;font-size:12px;color:var(--text-dim);cursor:pointer;line-height:1.6;padding:8px;transition:.15s}
      #aiDropZone:hover,#aiDropZone.drag{border-color:#6366f1;background:rgba(99,102,241,.12);color:#c7caff}
      #aiSidebarList{margin-top:10px;display:flex;flex-direction:column;gap:3px;overflow-y:auto;max-height:calc(100vh - 320px)}
      .ai-fileitem{display:flex;align-items:center;gap:8px;padding:6px;border-radius:8px;cursor:pointer;background:transparent;font-size:12px}
      .ai-fileitem:hover{background:var(--panel-3)}
      .ai-fileitem.active{background:var(--panel-2);outline:1px solid var(--border-2)}
      .ai-fileitem img{width:36px;height:36px;object-fit:cover;border-radius:4px;flex:0 0 36px}
      .ai-fileitem .col{flex:1;min-width:0;display:flex;flex-direction:column}
      .ai-fileitem .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
      .ai-fileitem .sz{font-size:10px;color:var(--text-dim)}
      .ai-fileitem .del{flex:0 0 auto;background:none;border:none;color:#ef4444;cursor:pointer;font-size:15px;font-weight:bold;line-height:1}

      /* 작업영역 */
      .ai-ws{display:flex;flex-direction:column;gap:10px;height:100%;min-height:560px}
      .ai-hdr{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:10px 15px}
      .ai-fname{font-size:18px;font-weight:bold;color:var(--text)}
      .ai-meta{font-size:12px;color:var(--text-dim);margin-top:2px}
      .ai-hdr-size{display:flex;flex-direction:column;align-items:flex-end}
      .ai-sizelbl{color:#3b82f6;font-size:11px;font-weight:bold;margin-bottom:3px}
      .ai-sublbl{font-size:11px;color:var(--text-dim);text-align:center}
      .ai-hdr-size input{width:62px;text-align:center;background:var(--bg);border:1px solid var(--border-2);border-radius:6px;color:var(--text);padding:4px}
      .ai-canvas-box{flex:1;position:relative;background:var(--panel-3);border-radius:12px;overflow:hidden;min-height:340px;padding:4px}
      .ai-canvas-box canvas{width:100%;height:100%;display:block;cursor:crosshair}
      .ai-footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .ai-rot{display:flex;align-items:center;gap:6px;padding:0 8px}
      .ai-rot label{font-size:12px;color:var(--text-dim)}
      .ai-rotbtn{width:28px;height:26px;border:1px solid var(--border-2);background:var(--panel-3);color:var(--text);border-radius:6px;cursor:pointer}
      .ai-rotbtn:hover{border-color:var(--accent,#4f46e5);color:var(--text)}
      .ai-btn{border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;color:#fff}
      .ai-btn.gray{background:var(--panel-3);color:var(--text);border:1px solid var(--border-2)}
      .ai-btn.gray:hover{border-color:var(--border)}
      .ai-btn.blue{background:#3b82f6}.ai-btn.blue:hover{background:#2563eb}
      .ai-btn.indigo{background:#4f46e5}.ai-btn.indigo:hover{background:#6366f1}
      .ai-btn.green{background:#10b981}.ai-btn.green:hover{background:#059669}

      /* Step2 */
      .ai-hdr2{display:flex;align-items:center;gap:12px;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:10px 15px}
      .ai-title{font-size:18px;font-weight:bold;color:var(--text)}
      .ai-sub{font-size:12px;color:var(--text-dim);margin-top:2px}
      .ai-hdr2 input{width:54px;text-align:center;background:var(--bg);border:1px solid var(--border-2);border-radius:6px;color:var(--text);padding:5px}
      .ai-grid{display:grid;gap:10px;overflow:auto;flex:1;align-content:start;padding:4px}
      .ai-colhdr{font-size:16px;font-weight:bold;color:#60a5fa;text-align:center;padding:6px 0 4px}
      .ai-thumb{border-radius:8px;overflow:hidden;cursor:pointer;background:var(--panel);border:1px solid var(--border);display:flex;flex-direction:column}
      .ai-thumb:hover{outline:2px solid #4f46e5}
      .ai-thumb canvas{width:100%;display:block}
      .ai-thumb .hdr{font-size:10px;text-align:center;padding:4px;color:var(--text-dim)}
      .ai-fixmodal{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center}
      .ai-fixbox{background:var(--panel);border:1px solid var(--border-2);border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:12px;align-items:center}
      .ai-fixbox canvas{background:#111;border-radius:6px}

      /* Step2: 사이드바·우측 안내 숨기고 미리보기만 전체 폭 */
      #layout.ai-step2{grid-template-columns:1fr !important}
      #layout.ai-step2 #sidebar,#layout.ai-step2 #rightpanel{display:none !important}
    `;

    if (S.step === 1) renderStep1(el);
    else renderStep2(el);
  },

  buildRightPanel(el) {
    const t = k => app.t(k);
    el.innerHTML = `<div class="panel"><div class="panel-title">${t('ai_guide_title')}</div>
      <div style="font-size:12px;line-height:1.6;color:var(--text-dim)">
        ${t('ai_guide_step1')}<br>
        ${t('ai_guide_auto')}<br>
        ${t('ai_guide_step2')}
      </div></div>`;
  },

  // exposed actions (called from inline handlers)
  selectFile(idx) { S.selIdx = idx; S.zoom = 1; S.pan = [0, 0]; renderCenter(); },
  deleteFile(idx) {
    S.files.splice(idx, 1);
    if (S.selIdx >= S.files.length) S.selIdx = S.files.length - 1;
    renderCenter();
  },
  deleteAllFiles() { S.files = []; S.selIdx = -1; renderCenter(); },
  onRotateSlider(v) {
    const f = S.files[S.selIdx]; if (!f) return;
    f.angle = parseFloat(v);
    document.getElementById('aiAngleLabel').textContent = f.angle.toFixed(1) + '°';
    renderCanvas();
  },
  stepRotate(delta) {
    const f = S.files[S.selIdx]; if (!f) return;
    f.angle = Math.max(-15, Math.min(15, (f.angle || 0) + delta));
    const sl = document.getElementById('aiAngleSlider');
    if (sl) sl.value = f.angle;
    document.getElementById('aiAngleLabel').textContent = f.angle.toFixed(1) + '°';
    renderCanvas();
  },
  resetCrop() {
    const f = S.files[S.selIdx]; if (!f) return;
    f.crop = null;
    ensureCrop(f);
    renderCanvas();
  },
  autoAlign() { autoAlign(); },
  goNext() { S.step = 2; renderCenter(); },
  goBack() { S.step = 1; renderCenter(); },
  openFixDialog(idx) { openFixDialog(idx); },
  exportExcel() { exportExcel(); },
  togglePhoneSync() { S.phoneSync ? stopPhoneSync() : startPhoneSync(); },
};

// ── render: shared ─────────────────────────────────────────────────────────

function renderCenter() {
  const el = document.getElementById('center');
  if (!el) return;
  if (S.step === 1) renderStep1(el);
  else renderStep2(el);
  renderSidebarList();
}

// ── Step1 ─────────────────────────────────────────────────────────────────

function setStep2Layout(on) {
  const layout = document.getElementById('layout');
  if (layout) layout.classList.toggle('ai-step2', on);
}

function renderStep1(el) {
  setStep2Layout(false);
  const f = S.files[S.selIdx];
  const t = k => app.t(k);
  const noFile = app.lang === 'ko' ? '선택된 파일 없음' : 'No file selected';
  el.innerHTML = `
    <div class="ai-ws">
      <div class="ai-hdr">
        <div>
          <div class="ai-fname">${f ? f.name : noFile}</div>
          <div class="ai-meta">${f ? `${fileSizeStr(f.size)}  |  ${f.img.naturalWidth} × ${f.img.naturalHeight} px` : '0 KB  |  0 × 0 px'}</div>
        </div>
        <div class="ai-hdr-size">
          <div class="ai-sizelbl">${t('ai_size_label')}</div>
          <div style="display:flex;gap:8px">
            <div><div class="ai-sublbl">${t('ai_size_h')}</div><input id="aiOutH" type="number" step="0.1" min="0.1" value="${S.outH}"></div>
            <div><div class="ai-sublbl">${t('ai_size_w')}</div><input id="aiOutW" type="number" step="0.1" min="0.1" value="${S.outW}"></div>
          </div>
        </div>
      </div>
      <div class="ai-canvas-box"><canvas id="aiCanvas"></canvas></div>
      <div class="ai-footer">
        <button class="ai-btn gray" onclick="app.instr.resetCrop()">🔄 ${t('ai_reset_crop')}</button>
        <div class="ai-rot">
          <label>${t('ai_rot_label')}</label>
          <button class="ai-rotbtn" onclick="app.instr.stepRotate(-0.1)">↻</button>
          <input id="aiAngleSlider" type="range" min="-15" max="15" step="0.1" value="${f ? (f.angle || 0) : 0}" style="width:150px" oninput="app.instr.onRotateSlider(this.value)">
          <button class="ai-rotbtn" onclick="app.instr.stepRotate(0.1)">↺</button>
          <span id="aiAngleLabel" style="width:38px;text-align:right;font-size:12px">${f ? (f.angle || 0).toFixed(1) : '0.0'}°</span>
        </div>
        <button class="ai-btn blue" onclick="app.instr.autoAlign()">🤖 ${t('ai_auto_align')}</button>
        <span style="flex:1"></span>
        <button class="ai-btn indigo" onclick="app.instr.goNext()">${t('ai_next')}</button>
      </div>
    </div>`;

  document.getElementById('aiOutH').onchange = e => { S.outH = parseFloat(e.target.value) || 1.5; saveSettings(); };
  document.getElementById('aiOutW').onchange = e => { S.outW = parseFloat(e.target.value) || 1.5; saveSettings(); };

  renderSidebarList();
  setupCanvas();
  renderCanvas();
}

// 사이드바 파일 목록 렌더 (썸네일 + 이름 + 용량 + 삭제)
function renderSidebarList() {
  const list = document.getElementById('aiSidebarList');
  if (!list) return;
  list.innerHTML = '';
  S.files.forEach((file, i) => {
    const item = document.createElement('div');
    item.className = 'ai-fileitem' + (i === S.selIdx ? ' active' : '');
    item.innerHTML = `<img src="${file.img.src}"><div class="col"><span class="nm">${file.name}</span><span class="sz">${fileSizeStr(file.size)}</span></div><button class="del">×</button>`;
    item.querySelector('.del').onclick = e => { e.stopPropagation(); app.instr.deleteFile(i); };
    item.onclick = () => app.instr.selectFile(i);
    list.appendChild(item);
  });
  const cnt = document.getElementById('aiFileCount');
  if (cnt) cnt.textContent = S.files.length;
}

// ── Step1 canvas: view transform ─────────────────────────────────────────

function viewTransform(canvas, rc) {
  const cw = canvas.width, ch = canvas.height;
  const base = Math.min(cw / rc.w, ch / rc.h);
  const scale = base * S.zoom;
  const fw = rc.w * scale, fh = rc.h * scale;
  const ox = (cw - fw) / 2 + S.pan[0];
  const oy = (ch - fh) / 2 + S.pan[1];
  return { scale, ox, oy, fw, fh };
}

function canvasToImg(canvas, rc, ex, ey) {
  const t = viewTransform(canvas, rc);
  return [(ex - t.ox) / t.scale, (ey - t.oy) / t.scale];
}

function renderCanvas() {
  const canvas = document.getElementById('aiCanvas');
  if (!canvas) return;
  const box = canvas.parentElement;
  // 화면 픽셀 배율(HiDPI)에 맞춰 백버퍼를 키워 또렷하게 렌더
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(box.clientWidth * dpr));
  canvas.height = Math.max(1, Math.round(box.clientHeight * dpr));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const f = S.files[S.selIdx];

  // 파일 없음: 테마에 맞는 빈 상태 안내
  if (!f) {
    const isLight = document.body.classList.contains('light');
    ctx.fillStyle = isLight ? '#e8eef5' : '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = isLight ? '#8aa3bd' : '#4a5568';
    ctx.font = `${Math.round(canvas.height * 0.04 / dpr)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const msg = app.lang === 'ko' ? '← 사진을 업로드하거나 드래그하세요' : '← Upload or drag photos here';
    ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
    return;
  }

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const rc = rotatedCanvas(f);
  const t = viewTransform(canvas, rc);
  ctx.drawImage(rc.canvas, 0, 0, rc.w, rc.h, t.ox, t.oy, t.fw, t.fh);

  // crop overlay
  const [cx, cy, cw, ch] = ensureCrop(f);
  const sx = t.ox + cx * t.scale, sy = t.oy + cy * t.scale;
  const sw = cw * t.scale, sh = ch * t.scale;

  // dim outside crop
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(t.ox, t.oy, t.fw, sy - t.oy); // top
  ctx.fillRect(t.ox, sy + sh, t.fw, (t.oy + t.fh) - (sy + sh)); // bottom
  ctx.fillRect(t.ox, sy, sx - t.ox, sh); // left
  ctx.fillRect(sx + sw, sy, (t.ox + t.fw) - (sx + sw), sh); // right

  ctx.strokeStyle = '#4f46e5';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx, sy, sw, sh);

  // 중앙 십자 점선 (원본과 동일)
  ctx.save();
  ctx.strokeStyle = '#4f46e5';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(sx + sw / 2, sy); ctx.lineTo(sx + sw / 2, sy + sh);
  ctx.moveTo(sx, sy + sh / 2); ctx.lineTo(sx + sw, sy + sh / 2);
  ctx.stroke();
  ctx.restore();

  // handles
  const hs = 8;
  ctx.fillStyle = '#4f46e5';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  [[sx, sy], [sx + sw, sy], [sx, sy + sh], [sx + sw, sy + sh]].forEach(([hx, hy]) => {
    ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
    ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
  });
}

function setupCanvas() {
  const canvas = document.getElementById('aiCanvas');
  if (!canvas || canvas._aiBound) return;
  canvas._aiBound = true;

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const f = S.files[S.selIdx]; if (!f) return;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    S.zoom = Math.max(0.05, Math.min(40, S.zoom * factor));
    renderCanvas();
  }, { passive: false });

  canvas.addEventListener('mousedown', e => {
    const f = S.files[S.selIdx]; if (!f) return;
    const rc = rotatedCanvas(f);
    const rect = canvas.getBoundingClientRect();
    const ex = (e.clientX - rect.left) * (canvas.width / rect.width);
    const ey = (e.clientY - rect.top) * (canvas.height / rect.height);

    if (e.button === 2 || e.button === 1) {
      S.drag = { mode: 'pan', startX: e.clientX, startY: e.clientY, panStart: [...S.pan] };
      return;
    }

    const [ix, iy] = canvasToImg(canvas, rc, ex, ey);
    const [cx, cy, cw, ch] = ensureCrop(f);
    const t = viewTransform(canvas, rc);
    const tol = 14 / t.scale;

    const corners = {
      nw: [cx, cy], ne: [cx + cw, cy], sw: [cx, cy + ch], se: [cx + cw, cy + ch],
    };
    let hit = null;
    for (const [k, [hx, hy]] of Object.entries(corners)) {
      if (Math.abs(ix - hx) < tol && Math.abs(iy - hy) < tol) { hit = k; break; }
    }
    if (hit) {
      S.drag = { mode: 'resize', corner: hit, crop0: [...f.crop] };
    } else if (ix >= cx && ix <= cx + cw && iy >= cy && iy <= cy + ch) {
      S.drag = { mode: 'move', startIx: ix, startIy: iy, crop0: [...f.crop] };
    } else {
      S.drag = { mode: 'new', startIx: ix, startIy: iy };
    }
  });

  window.addEventListener('mousemove', e => {
    if (!S.drag) return;
    const f = S.files[S.selIdx]; if (!f) return;
    const rc = rotatedCanvas(f);
    const rect = canvas.getBoundingClientRect();
    const ex = (e.clientX - rect.left) * (canvas.width / rect.width);
    const ey = (e.clientY - rect.top) * (canvas.height / rect.height);

    if (S.drag.mode === 'pan') {
      const k = canvas.width / rect.width; // CSS→백버퍼 픽셀 비율(dpr 보정)
      S.pan = [S.drag.panStart[0] + (e.clientX - S.drag.startX) * k, S.drag.panStart[1] + (e.clientY - S.drag.startY) * k];
      renderCanvas();
      return;
    }

    const [ix, iy] = canvasToImg(canvas, rc, ex, ey);
    const cix = Math.max(0, Math.min(rc.w, ix));
    const ciy = Math.max(0, Math.min(rc.h, iy));

    if (S.drag.mode === 'move') {
      let [x0, y0, w0, h0] = S.drag.crop0;
      let nx = x0 + (cix - S.drag.startIx);
      let ny = y0 + (ciy - S.drag.startIy);
      nx = Math.max(0, Math.min(rc.w - w0, nx));
      ny = Math.max(0, Math.min(rc.h - h0, ny));
      f.crop = [nx, ny, w0, h0];
      renderCanvas();
    } else if (S.drag.mode === 'resize') {
      let [x0, y0, w0, h0] = S.drag.crop0;
      let x1 = x0, y1 = y0, x2 = x0 + w0, y2 = y0 + h0;
      if (S.drag.corner.includes('w')) x1 = cix; else x2 = cix;
      if (S.drag.corner.includes('n')) y1 = ciy; else y2 = ciy;
      const nx = Math.min(x1, x2), ny = Math.min(y1, y2);
      const nw = Math.max(5, Math.abs(x2 - x1)), nh = Math.max(5, Math.abs(y2 - y1));
      f.crop = [nx, ny, nw, nh];
      renderCanvas();
    } else if (S.drag.mode === 'new') {
      const x0 = S.drag.startIx, y0 = S.drag.startIy;
      const nx = Math.min(x0, cix), ny = Math.min(y0, ciy);
      const nw = Math.max(5, Math.abs(cix - x0)), nh = Math.max(5, Math.abs(ciy - y0));
      f.crop = [nx, ny, nw, nh];
      renderCanvas();
    }
  });

  window.addEventListener('mouseup', () => { S.drag = null; });

  window.addEventListener('resize', () => { if (S.step === 1) renderCanvas(); });
}

// ── auto align (SAD template match on downscaled grayscale) ─────────────────

function toGray(canvas, scale) {
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(canvas, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  return { gray, w, h };
}

function findBestMatch(searchGray, sw, sh, tmplGray, tw, th) {
  let best = null, bestScore = Infinity;
  for (let y = 0; y <= sh - th; y++) {
    for (let x = 0; x <= sw - tw; x++) {
      let sad = 0;
      for (let ty = 0; ty < th; ty++) {
        const srow = (y + ty) * sw + x;
        const trow = ty * tw;
        for (let tx = 0; tx < tw; tx++) sad += Math.abs(searchGray[srow + tx] - tmplGray[trow + tx]);
      }
      if (sad < bestScore) { bestScore = sad; best = [x, y]; }
    }
  }
  return { pos: best, score: bestScore / (tw * th) };
}

async function autoAlign() {
  const ref = S.files[S.selIdx];
  if (!ref) return;
  const refRc = rotatedCanvas(ref);
  const [rcx, rcy, rcw, rch] = ensureCrop(ref);

  const SCALE = 0.2;
  const refGrayFull = toGray(refRc.canvas, SCALE);
  const tx = Math.round(rcx * SCALE), ty = Math.round(rcy * SCALE);
  const tw = Math.max(2, Math.round(rcw * SCALE)), th = Math.max(2, Math.round(rch * SCALE));
  // extract template patch from refGrayFull
  const tmpl = new Float32Array(tw * th);
  for (let yy = 0; yy < th; yy++) {
    for (let xx = 0; xx < tw; xx++) {
      const sx = Math.min(refGrayFull.w - 1, tx + xx);
      const sy = Math.min(refGrayFull.h - 1, ty + yy);
      tmpl[yy * tw + xx] = refGrayFull.gray[sy * refGrayFull.w + sx];
    }
  }

  app.log?.(`🤖 자동 맞춤 시작 (${S.files.length - 1}개 파일)`);
  for (let i = 0; i < S.files.length; i++) {
    if (i === S.selIdx) continue;
    const f = S.files[i];
    const rc = rotatedCanvas(f);
    const g = toGray(rc.canvas, SCALE);
    if (g.w < tw || g.h < th) continue;
    const { pos, score } = findBestMatch(g.gray, g.w, g.h, tmpl, tw, th);
    if (pos && score < 60) {
      const nx = pos[0] / SCALE, ny = pos[1] / SCALE;
      const nw = rcw, nh = rch;
      f.crop = [
        Math.max(0, Math.min(rc.w - nw, nx)),
        Math.max(0, Math.min(rc.h - nh, ny)),
        Math.min(nw, rc.w), Math.min(nh, rc.h),
      ];
    } else {
      // fallback: relative position
      f.crop = [
        Math.min(rc.w - rcw, Math.max(0, (rcx / refRc.w) * rc.w)),
        Math.min(rc.h - rch, Math.max(0, (rcy / refRc.h) * rc.h)),
        Math.min(rcw, rc.w), Math.min(rch, rc.h),
      ];
    }
    await new Promise(r => setTimeout(r, 0));
  }
  app.log?.('✅ 자동 맞춤 완료');
  renderCanvas();
}

// ── Step2 ─────────────────────────────────────────────────────────────────

function renderStep2(el) {
  setStep2Layout(true);
  const t = k => app.t(k);
  const previewLabel = app.lang === 'ko' ? '크롭 결과 미리보기' : 'Crop Preview';
  const subLabel     = app.lang === 'ko' ? '설정된 정렬 방식대로 엑셀에 저장됩니다' : 'Will be saved to Excel in this layout.';
  el.innerHTML = `
    <div class="ai-ws">
      <div class="ai-hdr2">
        <button class="ai-btn gray" onclick="app.instr.goBack()">◀ ${t('ai_back')}</button>
        <div>
          <div class="ai-title">${previewLabel}</div>
          <div class="ai-sub">${subLabel}</div>
        </div>
        <span style="flex:1"></span>
        <label style="font-size:12px;color:var(--text-dim)">${t('ai_per_row')}:</label>
        <input id="aiPerRow" type="number" step="1" min="1" value="${S.perRow}">
        <button class="ai-btn green" onclick="app.instr.exportExcel()">${t('ai_export_excel')}</button>
      </div>
      <div class="ai-grid" id="aiGrid"></div>
    </div>`;

  document.getElementById('aiPerRow').onchange = e => {
    S.perRow = Math.max(1, parseInt(e.target.value) || 6); saveSettings(); renderCenter();
  };

  const grid = document.getElementById('aiGrid');
  const perRow = S.perRow;
  const cols = Math.max(1, Math.ceil(S.files.length / perRow));
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(130px, max-content))`;
  grid.style.gridTemplateRows = `auto repeat(${perRow}, max-content)`;
  grid.style.justifyContent = 'start';

  // 열 헤더 (#1, #2 …) — 원본 파랑
  for (let c = 0; c < cols; c++) {
    const hdr = document.createElement('div');
    hdr.className = 'ai-colhdr';
    hdr.style.gridColumn = c + 1;
    hdr.style.gridRow = 1;
    hdr.textContent = `#${c + 1}`;
    grid.appendChild(hdr);
  }

  const { w: ow, h: oh } = outPx();
  // 미리보기는 출력 비율을 유지하되 고해상도로 렌더(선명) — 표시 폭은 고정
  const dispW = 170, dispH = Math.max(1, Math.round(dispW * oh / ow));
  const ss = Math.min(3, (window.devicePixelRatio || 1) * 2); // 슈퍼샘플 배수
  S.files.forEach((f, i) => {
    const col = Math.floor(i / perRow);
    const row = (i % perRow) + 1;
    const thumb = document.createElement('div');
    thumb.className = 'ai-thumb';
    thumb.style.gridColumn = col + 1;
    thumb.style.gridRow = row + 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(dispW * ss); canvas.height = Math.round(dispH * ss);
    canvas.style.width = dispW + 'px'; canvas.style.height = dispH + 'px';
    thumb.appendChild(canvas);
    const hdr = document.createElement('div');
    hdr.className = 'hdr';
    hdr.textContent = `#${i + 1}  ${f.name}`;
    thumb.appendChild(hdr);
    thumb.onclick = () => app.instr.openFixDialog(i);
    grid.appendChild(thumb);

    const rc = rotatedCanvas(f);
    const [cx, cy, cw, ch] = ensureCrop(f);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(rc.canvas, cx, cy, cw, ch, 0, 0, canvas.width, canvas.height);
  });
}

// ── fix dialog ────────────────────────────────────────────────────────────

function openFixDialog(idx) {
  const f = S.files[idx];
  if (!f) return;
  const { w: ow, h: oh } = outPx();
  // 보정 창은 크게 + 고해상도 렌더 (출력 비율 유지)
  const dispW = Math.round(Math.min(460, 460 * ow / Math.max(ow, oh)));
  const dispH = Math.round(dispW * oh / ow);
  const ss = Math.min(3, (window.devicePixelRatio || 1) * 2);
  const bw = Math.round(dispW * ss), bh = Math.round(dispH * ss);
  const overlay = document.createElement('div');
  overlay.className = 'ai-fixmodal';
  overlay.innerHTML = `
    <div class="ai-fixbox">
      <div style="font-weight:600">${f.name} 보정</div>
      <canvas id="aiFixCanvas" width="${bw}" height="${bh}" style="width:${dispW}px;height:${dispH}px"></canvas>
      <div style="display:flex;align-items:center;gap:8px;width:${dispW}px">
        <span style="font-size:12px;color:var(--text-dim)">회전</span>
        <input id="aiFixSlider" type="range" min="-15" max="15" step="0.1" value="${f.angle || 0}" style="flex:1">
        <span id="aiFixLabel" style="font-size:12px;width:46px;text-align:right">${(f.angle || 0).toFixed(1)}°</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="ai-btn gray" id="aiFixCancel">취소</button>
        <button class="ai-btn green" id="aiFixSave">보정 완료</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const redraw = () => {
    const rc = rotatedCanvas(f);
    const [cx, cy, cw, ch] = ensureCrop(f);
    const ctx = document.getElementById('aiFixCanvas').getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, bw, bh);
    ctx.drawImage(rc.canvas, cx, cy, cw, ch, 0, 0, bw, bh);
  };
  redraw();

  const slider = document.getElementById('aiFixSlider');
  slider.oninput = () => {
    f.angle = parseFloat(slider.value);
    document.getElementById('aiFixLabel').textContent = f.angle.toFixed(1) + '°';
    f.crop = null; // recompute since rotated size changes
    ensureCrop(f);
    redraw();
  };

  document.getElementById('aiFixCancel').onclick = () => overlay.remove();
  document.getElementById('aiFixSave').onclick = () => { overlay.remove(); renderCenter(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ── excel export ─────────────────────────────────────────────────────────

async function exportExcel() {
  const t = k => app.t(k);
  if (!S.files.length) { app.log?.(app.lang === 'ko' ? '내보낼 파일이 없습니다.' : 'No files to export.'); return; }
  app.log?.('📊 ' + t('ai_exporting'));
  let ExcelJS;
  try {
    ExcelJS = (await import('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/+esm')).default;
  } catch (e) {
    app.log?.('❌ ExcelJS ' + (app.lang === 'ko' ? '로드 실패: ' : 'load failed: ') + e.message);
    return;
  }

  const { w: ow, h: oh } = outPx();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');

  const perRow = S.perRow;
  const cols = Math.max(1, Math.ceil(S.files.length / perRow));
  const colWidth = ow / 7 + 2;       // approx Excel column width units
  const rowHeightPt = oh * 0.75;     // px -> pt at 96dpi

  for (let c = 0; c < cols; c++) ws.getColumn(c + 1).width = colWidth;
  ws.getRow(1).height = 18;
  for (let r = 0; r < perRow; r++) ws.getRow(r + 2).height = rowHeightPt;

  for (let c = 0; c < cols; c++) {
    ws.getCell(1, c + 1).value = `#${c + 1}`;
    ws.getCell(1, c + 1).alignment = { horizontal: 'center' };
  }

  for (let i = 0; i < S.files.length; i++) {
    const f = S.files[i];
    const col = Math.floor(i / perRow);
    const row = (i % perRow) + 1;
    const rc = rotatedCanvas(f);
    const [cx, cy, cw, ch] = ensureCrop(f);
    // 배치 크기(ext)는 ow×oh로 유지하되, 내장 이미지는 크롭 원본 해상도까지 고해상도로 저장
    // (같은 인치 크기인데 확대/인쇄 시 더 선명) — 단, 원본보다 크게 업스케일하진 않음
    const k = Math.min(3, Math.max(1, Math.min(cw / ow, ch / oh)));
    const ew = Math.max(1, Math.round(ow * k)), eh = Math.max(1, Math.round(oh * k));
    const canvas = document.createElement('canvas');
    canvas.width = ew; canvas.height = eh;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(rc.canvas, cx, cy, cw, ch, 0, 0, ew, eh);
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    const imgId = wb.addImage({ base64, extension: 'png' });
    ws.addImage(imgId, { tl: { col, row }, ext: { width: ow, height: oh } });
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `photo_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  app.log?.(app.lang === 'ko' ? '✅ 엑셀 내보내기 완료' : '✅ Excel export complete.');
}
