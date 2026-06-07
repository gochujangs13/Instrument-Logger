// ── Shared utilities for instrument modules ───────────────────────────────────

export function buildToggleRow(area, labelText, opts, def, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'setting-group';
  const lbl = document.createElement('div');
  lbl.className = 'field-label';
  lbl.textContent = labelText;
  const row = document.createElement('div');
  row.className = 'toggle-row';
  opts.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'toggle-btn' + (opt === def ? ' active' : '');
    btn.textContent = opt;
    btn.onclick = () => {
      row.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(opt);
    };
    row.appendChild(btn);
  });
  wrap.appendChild(lbl); wrap.appendChild(row);
  area.appendChild(wrap);
}

export function buildSelect(area, labelText, opts, def, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'setting-group';
  const lbl = document.createElement('div');
  lbl.className = 'field-label';
  lbl.textContent = labelText;
  const sel = document.createElement('select');
  sel.className = 'inp';
  opts.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    if (o === def) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = () => onChange(sel.value);
  wrap.appendChild(lbl); wrap.appendChild(sel);
  area.appendChild(wrap);
}

export function buildInfoRow(area, labelText, getText) {
  const wrap = document.createElement('div');
  wrap.className = 'setting-group';
  const lbl = document.createElement('div');
  lbl.className = 'field-label';
  lbl.textContent = labelText;
  const val = document.createElement('div');
  val.className = 'setting-info';
  val.textContent = getText();
  wrap.appendChild(lbl); wrap.appendChild(val);
  area.appendChild(wrap);
}

export function syslogPanelHTML() {
  return `<div class="syslog-panel" id="syslogPanel">
    <div class="syslog-head">
      <span class="panel-title" style="margin-bottom:0;">SYSTEM LOG</span>
      <button class="logbar-toggle" id="logToggle" onclick="app.toggleLog()">▼</button>
    </div>
    <div id="sysLog" class="syslog"></div>
  </div>`;
}

export function fmt(v) {
  if (v === undefined || isNaN(v)) return '---';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e6 || a < 1e-3) return v.toExponential(2);
  if (a >= 100) return v.toFixed(2);
  if (a >= 1)   return v.toFixed(4);
  return v.toPrecision(4);
}

export function dateStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
