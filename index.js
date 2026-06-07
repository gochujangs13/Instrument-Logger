import Hioki3540    from './instruments/hioki_3540.js';
import Keithley2700 from './instruments/keithley_2700.js';
import MitutoyoVL50 from './instruments/mitutoyo_vl50.js';
import Agilent4339B from './instruments/agilent_4339b.js';
import DAQ6510      from './instruments/daq_6510.js';

// ── Instrument registry ───────────────────────────────────────────────────────
// To add a new instrument: create instruments/your_device.js and import it here.
const INSTRUMENTS = {};
[Hioki3540, Keithley2700, MitutoyoVL50, Agilent4339B, DAQ6510].forEach(m => {
  INSTRUMENTS[m.name] = m;
});

// ── Translations ──────────────────────────────────────────────────────────────
const T = {
  ko: {
    // topbar / launcher
    launcher_subtitle: '계측기를 선택하세요',
    launcher_sub_hint: 'Chrome / Edge 89+',
    launcher_fav_section: '★ 즐겨찾기',
    launcher_all_section: '★ 전체 목록',
    launcher_hidden: '숨겨진 항목',
    launcher_restore: '전체 복원',
    launcher_fav_tip: '즐겨찾기 추가',
    launcher_del_tip: '숨기기',
    theme_setting: '테마', lang_setting: '언어',
    disconnected: '연결 안됨', connected: '연결됨',
    conn_btn: '디바이스 연결', disconn_btn: '연결 해제',
    connect_first: '먼저 계측기를 연결하세요.',
    test_manage: '테스트 방법 관리',
    split_view: '출력 분할 화면:', screens: '화면',
    auto_log_wait: '자동 기록 대기 (초)',
    meas_wire: '측정 방식', sample_rate: '측정 속도',
    meas_range: '측정 레인지',
    btn_copy: 'COPY', btn_csv: 'Export CSV', btn_clear: 'Clear Data',
    test_add_new: '새 평가 방법 추가',
    test_name_label: '테스트명', test_total_cells: '총 칸 수',
    test_group_cells: '구분 칸 수 (0=없음)', test_set_group: '셋트 크기',
    btn_add: '추가', btn_delete: '삭제',
    test_delete_method: '기존 평가 방법 삭제',
    panel_prefix: 'PANEL',
    status_disconnected: 'Disconnected',
    status_connected: 'Connected',
    status_failed: 'Connection Failed',
    chart_hint: '현재 패널 측정값 분포 (박스 플롯)',
    chart_empty: '측정 데이터가 없습니다',
    wire_fixed: '4-Wire (고정)',
    web_serial_unsupported: 'Web Serial API가 지원되지 않습니다.\nChrome 또는 Edge 89+ 를 사용하세요.',
    settings_title: '설정',
    meas_count_lbl: '측정 수:',
    data_panel_title: '📋 측정 데이터',
    dist_panel_title: '📊 데이터 분포',
    syslog_title: 'SYSTEM LOG',
    refresh_tip: '새로고침',
    // test manager alerts
    alert_enter_name: '테스트명을 입력하세요.',
    alert_dup_name:   '이미 존재하는 이름입니다.',
    alert_min_cells:  '총 칸 수는 1 이상이어야 합니다.',
    alert_del_default:'기본 테스트 방법은 삭제할 수 없습니다.',
    alert_confirm_clear: '모든 데이터를 지우겠습니까?',
    clipboard_ok: '클립보드 복사됨.',
    csv_ok: 'CSV 내보내기 완료.',
    // Agilent 4339B
    ag_gpib_notice: '⚠ GPIB 장비 — NI GPIB-USB → 가상 COM 포트 연결 필요',
    ag_conn_section: '장비 연결',
    ag_meas_section: '측정 설정',
    ag_meas_mode: '측정 모드',
    ag_mode_surf: '표면 (Surface)',
    ag_mode_vol:  '체적 (Volume)',
    ag_mode_lbl_surf: '표면 저항률 (Ω/sq)',
    ag_mode_lbl_vol:  '체적 저항률 (Ω·cm)',
    ag_electrode: '전극 (Electrode)',
    ag_thickness: '시편 두께 (mm)',
    ag_voltage:   '인가 전압 (V)',
    ag_auto_volt: '자동 전압',
    ag_ilim:      '전류 상한 (I-Lim)',
    ag_ilim_note: '※ 체적모드: OL 시 전류 자동 상승 (500μA → 10mA)',
    ag_charge_t:  '충전 시간 (s)',
    ag_discharge_t:'방전 시간 (s)',
    ag_sop_btn:   '📋 SOP 매뉴얼 보기',
    ag_sample:    '샘플명',
    ag_wait:      '대기 중',
    ag_stopped:   '정지됨',
    ag_done_wait: '완료 — 다음 측정 대기 중',
    ag_charging:  '충전 중...',
    ag_measuring: '측정 중...',
    ag_discharging:'방전 중...',
    ag_start_btn: '▶ 측정 시작',
    ag_stop_btn:  '■ 정지',
    ag_ol_escalate: 'OL 감지 → 전류 상승:',
    ag_ol_maxed:  '전류 최대치 도달 — 측정 불가 (OL)',
    ag_valid_ok:  '에서 유효값 획득',
    ag_meas_done_ol: '측정 완료: OL (범위 초과) — 전류:',
    ag_meas_done: '측정 완료:',
    ag_stopped_log: '측정 중지됨.',
    ag_confirm_clear: '모든 데이터를 지우겠습니까?',
    ag_mode_changed: '모드 변경:',
    ag_mode_surf_short: '표면',
    ag_mode_vol_short: '체적',
    ag_mode_click_hint: '이미지를 클릭하면 이 모드로 설정됩니다',
    ag_sop_title: '📋 SOP 시료 거치 가이드',
    ag_sop_prev: '◀ 이전',
    ag_sop_next: '다음 ▶',
    ag_sop_close: '✕ 닫기',
    ag_mode_title_surf: '표면 저항률 (Surface) 측정 설정',
    ag_mode_title_vol:  '체적 저항률 (Volume) 측정 설정',
    // DAQ-6510
    daq_visa_label: 'VISA 주소',
    daq_visa_opt1: 'USB (04632710) — 1,2번 오븐',
    daq_visa_opt2: 'USB (04544808) — 3,4번 오븐',
    daq_config_section: '측정 구성',
    daq_filename: '파일명',
    daq_total_time: '총 측정 시간',
    daq_ch_delay: '채널 딜레이 (s)',
    daq_slot1_ch: 'Slot 1 채널',
    daq_slot2_ch: 'Slot 2 채널',
    daq_slot2_ph: '비워두면 OFF',
    daq_scan_mode: '스캔 모드',
    daq_scan_rt: '실시간 (최근 1000개 표시)',
    daq_scan_full: '전체 스캔 (3분마다 기록)',
    daq_wire_mode: '측정 방식',
    daq_ch_names_btn: '채널 이름 설정...',
    daq_wait: '대기 중',
    daq_start_btn: '▶ 측정 시작',
    daq_stop_btn: '■ 측정 정지',
    daq_rec_count: '기록 수:',
    daq_data_tab: '📋 데이터 테이블',
    daq_slot1_tab: '📈 Slot 1',
    daq_slot2_tab: '📈 Slot 2',
    daq_no_data: '데이터가 없습니다.',
    daq_clear_confirm: '모든 기록 데이터를 지우겠습니까?',
    daq_csv_ok: 'CSV 내보내기 완료.',
    daq_cleared: 'DAQ 데이터 초기화됨.',
    daq_stopped: '정지됨',
    daq_rt_running: '실시간 측정 중... (1초)',
    daq_full_running: '3분 간격 측정 중...',
    daq_start_log_rt: '실시간(1s)',
    daq_start_log_full: '전체스캔(3min)',
    daq_start_log: 'DAQ 시작 — 모드:',
    daq_stop_log: 'DAQ 측정 정지.',
    daq_no_data_log: '데이터가 없습니다.',
    daq_ch_modal_title: '채널 이름 설정',
    daq_ch_modal_no_slot: '슬롯 범위를 먼저 설정하세요',
    daq_ch_ok: '✔ 확인',
    daq_ch_cancel: '✕ 취소',
    daq_select_all: '전체 선택',
    daq_no_chart: '측정 데이터가 없습니다',
    daq_connect_first: '먼저 계측기를 연결하세요.',
  },
  en: {
    // topbar / launcher
    launcher_subtitle: 'Select an Instrument',
    launcher_sub_hint: 'Chrome / Edge 89+',
    launcher_fav_section: '★ Favorites',
    launcher_all_section: '★ All Instruments',
    launcher_hidden: 'Hidden items',
    launcher_restore: 'Restore All',
    launcher_fav_tip: 'Add to Favorites',
    launcher_del_tip: 'Hide',
    theme_setting: 'Theme', lang_setting: 'Language',
    disconnected: 'Disconnected', connected: 'Connected',
    conn_btn: 'Connect Device', disconn_btn: 'Disconnect',
    connect_first: 'Please connect the instrument first.',
    test_manage: 'Manage Test Methods',
    split_view: 'Split View:', screens: 'Panel',
    auto_log_wait: 'Auto-log Wait (s)',
    meas_wire: 'Wire Mode', sample_rate: 'Sample Rate',
    meas_range: 'Meas. Range',
    btn_copy: 'COPY', btn_csv: 'Export CSV', btn_clear: 'Clear Data',
    test_add_new: 'Add New Test Method',
    test_name_label: 'Name', test_total_cells: 'Total Cells',
    test_group_cells: 'Group Size (0=none)', test_set_group: 'Set Size',
    btn_add: 'Add', btn_delete: 'Delete',
    test_delete_method: 'Delete Existing Method',
    panel_prefix: 'PANEL',
    status_disconnected: 'Disconnected',
    status_connected: 'Connected',
    status_failed: 'Connection Failed',
    chart_hint: 'Box plot of active panel values',
    chart_empty: 'No data yet',
    wire_fixed: '4-Wire (Fixed)',
    web_serial_unsupported: 'Web Serial API not supported.\nUse Chrome or Edge 89+.',
    settings_title: 'Settings',
    meas_count_lbl: 'Count:',
    data_panel_title: '📋 Measurement Data',
    dist_panel_title: '📊 Data Distribution',
    syslog_title: 'SYSTEM LOG',
    refresh_tip: 'Refresh',
    // test manager alerts
    alert_enter_name: 'Please enter a test name.',
    alert_dup_name:   'That name already exists.',
    alert_min_cells:  'Total cells must be at least 1.',
    alert_del_default:'Default test methods cannot be deleted.',
    alert_confirm_clear: 'Clear all data?',
    clipboard_ok: 'Copied to clipboard.',
    csv_ok: 'CSV export complete.',
    // Agilent 4339B
    ag_gpib_notice: '⚠ GPIB device — NI GPIB-USB → virtual COM port required',
    ag_conn_section: 'Device Connection',
    ag_meas_section: 'Measurement Settings',
    ag_meas_mode: 'Measurement Mode',
    ag_mode_surf: 'Surface',
    ag_mode_vol:  'Volume',
    ag_mode_lbl_surf: 'Surface Resistivity (Ω/sq)',
    ag_mode_lbl_vol:  'Volume Resistivity (Ω·cm)',
    ag_electrode: 'Electrode',
    ag_thickness: 'Sample Thickness (mm)',
    ag_voltage:   'Applied Voltage (V)',
    ag_auto_volt: 'Auto Voltage',
    ag_ilim:      'Current Limit (I-Lim)',
    ag_ilim_note: '※ Volume mode: auto I-Lim escalation on OL (500μA → 10mA)',
    ag_charge_t:  'Charge Time (s)',
    ag_discharge_t:'Discharge Time (s)',
    ag_sop_btn:   '📋 SOP Manual',
    ag_sample:    'Sample Name',
    ag_wait:      'Waiting',
    ag_stopped:   'Stopped',
    ag_done_wait: 'Done — waiting for next measurement',
    ag_charging:  'Charging...',
    ag_measuring: 'Measuring...',
    ag_discharging:'Discharging...',
    ag_start_btn: '▶ Start',
    ag_stop_btn:  '■ Stop',
    ag_ol_escalate: 'OL detected → I-Lim escalated:',
    ag_ol_maxed:  'Max I-Lim reached — cannot measure (OL)',
    ag_valid_ok:  'valid reading at',
    ag_meas_done_ol: 'Measurement done: OL (out of range) — I-Lim:',
    ag_meas_done: 'Measurement done:',
    ag_stopped_log: 'Measurement stopped.',
    ag_confirm_clear: 'Clear all data?',
    ag_mode_changed: 'Mode changed:',
    ag_mode_surf_short: 'Surface',
    ag_mode_vol_short: 'Volume',
    ag_mode_click_hint: 'Click image to apply this mode',
    ag_sop_title: '📋 SOP Sample Placement Guide',
    ag_sop_prev: '◀ Prev',
    ag_sop_next: 'Next ▶',
    ag_sop_close: '✕ Close',
    ag_mode_title_surf: 'Surface Resistivity (Surface) Settings',
    ag_mode_title_vol:  'Volume Resistivity (Volume) Settings',
    // DAQ-6510
    daq_visa_label: 'VISA Address',
    daq_visa_opt1: 'USB (04632710) — Oven 1, 2',
    daq_visa_opt2: 'USB (04544808) — Oven 3, 4',
    daq_config_section: 'Measurement Config',
    daq_filename: 'File Name',
    daq_total_time: 'Total Duration',
    daq_ch_delay: 'Channel Delay (s)',
    daq_slot1_ch: 'Slot 1 Channels',
    daq_slot2_ch: 'Slot 2 Channels',
    daq_slot2_ph: 'Leave empty to disable',
    daq_scan_mode: 'Scan Mode',
    daq_scan_rt: 'Real-time (last 1000 pts)',
    daq_scan_full: 'Full Scan (every 3 min)',
    daq_wire_mode: 'Wire Mode',
    daq_ch_names_btn: 'Channel Names...',
    daq_wait: 'Waiting',
    daq_start_btn: '▶ Start',
    daq_stop_btn: '■ Stop',
    daq_rec_count: 'Records:',
    daq_data_tab: '📋 Data Table',
    daq_slot1_tab: '📈 Slot 1',
    daq_slot2_tab: '📈 Slot 2',
    daq_no_data: 'No data available.',
    daq_clear_confirm: 'Clear all recorded data?',
    daq_csv_ok: 'CSV export complete.',
    daq_cleared: 'DAQ data cleared.',
    daq_stopped: 'Stopped',
    daq_rt_running: 'Real-time measuring... (1s)',
    daq_full_running: 'Measuring every 3 min...',
    daq_start_log_rt: 'real-time(1s)',
    daq_start_log_full: 'full-scan(3min)',
    daq_start_log: 'DAQ start — mode:',
    daq_stop_log: 'DAQ measurement stopped.',
    daq_no_data_log: 'No data available.',
    daq_ch_modal_title: 'Channel Names',
    daq_ch_modal_no_slot: 'Please set slot range first',
    daq_ch_ok: '✔ OK',
    daq_ch_cancel: '✕ Cancel',
    daq_select_all: 'Select All',
    daq_no_chart: 'No measurement data',
    daq_connect_first: 'Please connect the instrument first.',
  },
};

// ── Default Test Modes ────────────────────────────────────────────────────────
const DEFAULT_TEST_MODES = {
  'ETM-7':  { cols: ['1','2','3'], group: 0, set: 3 },
  'ETM-6':  { cols: ['1','2','3','4','1','2','3','4'], group: 4, set: 8 },
  'ETM-3':  { cols: ['1','2','3','4','1','2','3','4','1','2','3','4'], group: 4, set: 12 },
  'ETM-18': { cols: ['1','2','3'], group: 0, set: 3 },
};
const DEFAULT_VL50_MODES = {
  'MSL-2': { cols: ['Left','Right'], group: 0, set: 6 },
};
const DEFAULT_KEYS = new Set(Object.keys(DEFAULT_TEST_MODES));

// ── State Machine ─────────────────────────────────────────────────────────────
class StateMachine {
  constructor() {
    this.state = 'WAIT_FOR_CONTACT';
    this.waitTime = 2.0;
    this._t0 = 0;
    this.onStateChange  = null;
    this.onLogTriggered = null;
  }
  update(isValid, value, fmt) {
    if (this.state === 'WAIT_FOR_CONTACT') {
      if (isValid) { this._t0 = Date.now(); this._go('STABILIZING'); }
    } else if (this.state === 'STABILIZING') {
      if (!isValid) { this._go('WAIT_FOR_CONTACT'); return; }
      if ((Date.now() - this._t0) / 1000 >= this.waitTime) {
        this.onLogTriggered?.(value, fmt);
        this._go('WAIT_FOR_OPEN');
      }
    } else if (this.state === 'WAIT_FOR_OPEN') {
      if (!isValid) this._go('WAIT_FOR_CONTACT');
    }
  }
  reset() { this._go('WAIT_FOR_CONTACT'); }
  _go(s) { if (this.state !== s) { this.state = s; this.onStateChange?.(s); } }
}

// ── Serial Controller ─────────────────────────────────────────────────────────
class SerialController {
  constructor() {
    this.port = null; this.writer = null; this.reader = null;
    this.readLoopActive = false;
    this.isConnected = false;
    this.onLine  = null;
    this.onError = null;
  }
  async connect(cfg) {
    if (!navigator.serial) throw new Error('Web Serial API not supported');
    this.port = await navigator.serial.requestPort();
    await this.port.open(cfg);
    const enc = new TextEncoderStream();
    enc.readable.pipeTo(this.port.writable).catch(() => {});
    this.writer = enc.writable.getWriter();
    this.isConnected = true;
    this._loop();
  }
  async disconnect() {
    this.readLoopActive = false;
    try { this.reader?.cancel(); } catch (_) {}
    try { await this.writer?.close(); } catch (_) {}
    try { await this.port?.close(); } catch (_) {}
    this.port = null; this.writer = null; this.reader = null;
    this.isConnected = false;
  }
  async sendCmd(cmd) {
    if (!this.writer) return;
    try { await this.writer.write(cmd); } catch (e) { this.onError?.(`Send: ${e.message}`); }
  }
  _loop() {
    this.readLoopActive = true;
    const dec = new TextDecoderStream();
    this.port.readable.pipeTo(dec.writable).catch(() => {});
    this.reader = dec.readable.getReader();
    let buf = '';
    (async () => {
      try {
        while (this.readLoopActive) {
          const { value, done } = await this.reader.read();
          if (done) break;
          buf += value;
          const parts = buf.split(/[\r\n]+/);
          buf = parts.pop();
          for (const line of parts) if (line.trim()) this.onLine?.(line.trim());
        }
      } catch (e) {
        if (this.readLoopActive) this.onError?.(`Read: ${e.message}`);
      }
    })();
  }
}

// ── Editable Grid ─────────────────────────────────────────────────────────────
class EditableGrid {
  constructor(host, panelIdx) {
    this.host = host;
    this.panelIdx = panelIdx;
    this.cols = []; this.group = 0; this.set = 0;
    this.rows = [];
    this.focusR = 0; this.focusC = 0;
    this.onFocusChange = null;
    this.onDataChange  = null;
    this._cells = [];
    this._tbody = null;
  }

  build(modeCfg, saved) {
    this.cols  = modeCfg.cols;
    this.group = modeCfg.group || 0;
    this.set   = modeCfg.set   || 0;
    this.rows  = (saved && saved.length)
      ? saved.map(r => r.slice())
      : [new Array(this.cols.length).fill('')];
    this.focusR = 0; this.focusC = 0;
    this._cells = [];
    this._render();
  }

  _render() {
    this.host.innerHTML = '';
    const scroll = document.createElement('div');
    scroll.className = 'grid-scroll';
    const tbl = document.createElement('table');
    tbl.className = 'data-table';

    const tr0 = tbl.createTHead().insertRow();
    const th0 = document.createElement('th'); th0.textContent = 'No.'; tr0.appendChild(th0);
    this.cols.forEach((c, ci) => {
      const th = document.createElement('th');
      th.textContent = c;
      if (this.group > 0 && (ci + 1) % this.group === 0 && ci < this.cols.length - 1)
        th.style.borderRight = '2px solid var(--accent)';
      tr0.appendChild(th);
    });

    this._tbody = tbl.createTBody();
    this.rows.forEach((_, ri) => this._appendRow(ri));

    scroll.appendChild(tbl);
    this.host.appendChild(scroll);

    const add = document.createElement('button');
    add.className = 'grid-add-btn';
    add.textContent = '+ Row';
    add.onclick = () => {
      this.rows.push(new Array(this.cols.length).fill(''));
      this._appendRow(this.rows.length - 1);
    };
    this.host.appendChild(add);
    this._focusCell(0, 0);
  }

  _appendRow(ri) {
    const tr = this._tbody.insertRow();
    if (this.set > 0 && ri > 0 && ri % this.set === 0) tr.classList.add('set-divider');

    const lbl = this.set > 0
      ? `${Math.floor(ri / this.set) + 1}-${(ri % this.set) + 1}`
      : String(ri + 1);
    const td0 = tr.insertCell();
    td0.className = 'no-cell'; td0.textContent = lbl;

    const row = [];
    this.cols.forEach((_, ci) => {
      const td = tr.insertCell();
      if (this.group > 0 && (ci + 1) % this.group === 0 && ci < this.cols.length - 1)
        td.classList.add('group-gap');
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'cell-input';
      inp.value = this.rows[ri][ci] || '';
      inp.addEventListener('focus',   () => this._onFocus(ri, ci));
      inp.addEventListener('input',   () => { this.rows[ri][ci] = inp.value; this.onDataChange?.(); });
      inp.addEventListener('keydown', e  => this._onKey(e, ri, ci));
      td.appendChild(inp);
      row.push(inp);
    });
    this._cells.push(row);
    this._scrollTo(ri);
  }

  _onFocus(r, c) {
    this.focusR = r; this.focusC = c;
    this.onFocusChange?.(this.panelIdx);
    this._tbl()?.querySelectorAll('td.cell-focused').forEach(td => td.classList.remove('cell-focused'));
    this._cells[r]?.[c]?.closest('td')?.classList.add('cell-focused');
  }

  _onKey(e, r, c) {
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); app.onEnterPressed(); }
    else if (e.key === 'ArrowRight') this._focusCell(r, c + 1);
    else if (e.key === 'ArrowLeft')  this._focusCell(r, c - 1);
    else if (e.key === 'ArrowDown')  this._focusCell(r + 1, c);
    else if (e.key === 'ArrowUp')    this._focusCell(r - 1, c);
  }

  _tbl()  { return this.host.querySelector('table'); }
  _focusCell(r, c) {
    r = Math.max(0, Math.min(r, this._cells.length - 1));
    c = Math.max(0, Math.min(c, this.cols.length - 1));
    this._cells[r]?.[c]?.focus();
  }
  _scrollTo(ri) {
    requestAnimationFrame(() => this._cells[ri]?.[0]?.scrollIntoView({ block: 'nearest' }));
  }

  setValue(r, c, val) {
    while (this.rows.length <= r) {
      this.rows.push(new Array(this.cols.length).fill(''));
      this._appendRow(this.rows.length - 1);
    }
    if (this._cells[r]?.[c]) {
      this._cells[r][c].value = val;
      this.rows[r][c] = val;
      this.onDataChange?.();
    }
  }

  moveNext() {
    let r = this.focusR, c = this.focusC + 1;
    if (c >= this.cols.length) { c = 0; r++; }
    if (r >= this._cells.length) {
      this.rows.push(new Array(this.cols.length).fill(''));
      this._appendRow(this.rows.length - 1);
    }
    this._focusCell(r, c);
  }

  getData()    { return this.rows.map(r => r.slice()); }
  getNumbers() { return this.rows.flat().map(v => parseFloat(v)).filter(v => !isNaN(v)); }
}

// ── Box Plot Chart ────────────────────────────────────────────────────────────
class BoxPlot {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); }

  draw(nums) {
    const cv = this.canvas;
    cv.width  = cv.offsetWidth  || 320;
    cv.height = cv.offsetHeight || 240;
    const W = cv.width, H = cv.height;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    const empty = document.getElementById('chartEmpty');
    if (!nums || nums.length < 2) { if (empty) empty.style.display = ''; return; }
    if (empty) empty.style.display = 'none';

    const sorted = [...nums].sort((a, b) => a - b);
    const n = sorted.length;
    const q = f => sorted[Math.min(n - 1, Math.floor(n * f))];
    const q1 = q(.25), q2 = q(.5), q3 = q(.75), mn = sorted[0], mx = sorted[n-1];
    const mean = nums.reduce((a,b)=>a+b,0)/n;
    const sd   = Math.sqrt(nums.reduce((s,v)=>s+(v-mean)**2,0)/n);
    const span = mx - mn || 1;

    const padT = 28, padB = 44, padL = 64, padR = 20;
    const cH = H - padT - padB;
    const bX = padL + (W - padL - padR) * .2;
    const bW = (W - padL - padR) * .6;
    const toY = v => padT + (1 - (v - mn) / span) * cH;

    // Read CSS theme vars for chart colors (use body to pick up body.light overrides)
    const cs = getComputedStyle(document.body);
    const C = {
      text:    cs.getPropertyValue('--chart-text').trim()    || '#5e7790',
      text2:   cs.getPropertyValue('--chart-text2').trim()   || '#8aa3bd',
      grid:    cs.getPropertyValue('--chart-grid').trim()    || 'rgba(31,59,86,.5)',
      boxFill: cs.getPropertyValue('--chart-box-fill').trim()|| 'rgba(43,143,255,.12)',
      boxStr:  cs.getPropertyValue('--chart-box-str').trim() || '#2b8fff',
      med:     cs.getPropertyValue('--chart-med').trim()     || '#3fb6e8',
      mean:    cs.getPropertyValue('--chart-mean').trim()    || '#fbbf24',
      dot:     cs.getPropertyValue('--chart-dot').trim()     || 'rgba(63,182,232,.55)',
    };

    ctx.fillStyle = C.text; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
    [mn, (mn+mx)/2, mx].forEach(v => {
      const y = toY(v);
      ctx.fillText(_fmt(v), padL - 6, y + 4);
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    });

    ctx.strokeStyle = C.med; ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    [[mn, q1],[q3, mx]].forEach(([y1, y2]) => {
      ctx.beginPath();
      ctx.moveTo(bX + bW/2, toY(y1)); ctx.lineTo(bX + bW/2, toY(y2)); ctx.stroke();
    });
    ctx.setLineDash([]);

    [[mn],[mx]].forEach(([v]) => {
      const y = toY(v);
      ctx.beginPath(); ctx.moveTo(bX + bW*.2, y); ctx.lineTo(bX + bW*.8, y); ctx.stroke();
    });

    const yQ1 = toY(q1), yQ3 = toY(q3);
    ctx.fillStyle = C.boxFill; ctx.strokeStyle = C.boxStr; ctx.lineWidth = 1.5;
    ctx.fillRect(bX, yQ3, bW, yQ1 - yQ3); ctx.strokeRect(bX, yQ3, bW, yQ1 - yQ3);

    ctx.strokeStyle = C.med; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(bX, toY(q2)); ctx.lineTo(bX + bW, toY(q2)); ctx.stroke();

    ctx.fillStyle = C.mean;
    const yM = toY(mean), dm = 5;
    ctx.beginPath();
    ctx.moveTo(bX + bW/2, yM - dm); ctx.lineTo(bX + bW/2 + dm, yM);
    ctx.lineTo(bX + bW/2, yM + dm); ctx.lineTo(bX + bW/2 - dm, yM);
    ctx.closePath(); ctx.fill();

    if (n <= 20) {
      nums.forEach(v => {
        const y = toY(v);
        const x = bX + bW + 10 + Math.random() * 8;
        ctx.fillStyle = C.dot;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill();
      });
    }

    ctx.fillStyle = C.text2; ctx.font = '10.5px Inter'; ctx.textAlign = 'center';
    ctx.fillText(`n=${n}  x̄=${_fmt(mean)}  σ=${_fmt(sd)}`, W/2, H - 6);

    const statsEl = document.getElementById('statsPanel');
    if (statsEl) statsEl.innerHTML = [
      ['Min', _fmt(mn)], ['Max', _fmt(mx)], ['Median', _fmt(q2)],
      ['Mean', _fmt(mean)], ['σ', _fmt(sd)], ['n', n],
    ].map(([k,v]) => `<div class="stat-chip">${k} <b>${v}</b></div>`).join('');
  }
}

function _fmt(v) {
  if (v === undefined || isNaN(v)) return '---';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e6 || a < 1e-3) return v.toExponential(2);
  if (a >= 100)  return v.toFixed(2);
  if (a >= 1)    return v.toFixed(4);
  return v.toPrecision(4);
}

// ── Main Application ──────────────────────────────────────────────────────────
class App {
  constructor() {
    this.lang  = 'ko';
    this.theme = 'dark';
    this.instrName = null;   // current instrument name string
    this.instr     = null;   // current instrument module object
    this.splitCount    = 1;
    this.panels        = [];
    this.activePanelIdx = 0;
    this.testModes  = { ...DEFAULT_TEST_MODES };
    this.masterData = Object.fromEntries(Object.keys(DEFAULT_TEST_MODES).map(k => [k, []]));
    this.vl50Modes  = { ...DEFAULT_VL50_MODES };
    this.vl50Data   = { 'MSL-2': [] };
    this.count      = 0;
    this.currentFmt = '---';
    this.serial     = new SerialController();
    this.sm         = new StateMachine();
    this.pollTimer  = null;
    this._chart     = null;

    // Save grid sidebar HTML for restore when switching back from custom views
    this._origSidebarHTML = document.getElementById('sidebar').innerHTML;

    this._loadConfig();
    this._applyTheme();
    this._applyLang();
    this._buildLauncher();

    this.sm.onStateChange  = s => this._onStateChange(s);
    this.sm.onLogTriggered = (v, f) => this._onLogTriggered(v, f);
    this.serial.onLine  = line => this._onLine(line);
    this.serial.onError = msg  => this.log(`[ERR] ${msg}`, 'err');
  }

  // ── i18n ───────────────────────────────────────────────────────────────────
  t(key) { return T[this.lang]?.[key] ?? T.ko[key] ?? key; }

  _applyLang() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = this.t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = this.t(el.dataset.i18nTitle);
    });
    document.documentElement.lang = this.lang;
    document.getElementById('langSelect').value = this.lang;
    document.getElementById('splitToggle')?.querySelectorAll('.toggle-btn').forEach((btn, i) => {
      btn.innerHTML = `${i+1} <span data-i18n="screens">${this.t('screens')}</span>`;
    });
    // Rebuild launcher section titles if visible
    if (!document.getElementById('launcher').hidden) {
      this._buildLauncher();
    }
    // Re-apply instrument sidebar if loaded
    if (this.instr?.buildSidebar) {
      this._rebuildInstrumentSidebar();
    }
  }

  _rebuildInstrumentSidebar() {
    // Re-render instrument-specific sidebar with new language
    if (!this.instr) return;
    const area = document.getElementById('dynamicSettings');
    if (area && this.instr.buildSidebar) {
      area.innerHTML = '';
      this.instr.buildSidebar(area);
    }
  }

  setLang(lang) { this.lang = lang; this._applyLang(); this._saveConfig(); }

  // ── Theme ──────────────────────────────────────────────────────────────────
  _applyTheme() {
    document.body.classList.toggle('light', this.theme === 'light');
    document.getElementById('themeSelect').value = this.theme;
  }
  setTheme(t) { this.theme = t; this._applyTheme(); this._saveConfig(); }

  // ── Config ─────────────────────────────────────────────────────────────────
  _saveConfig() {
    try {
      localStorage.setItem('3m_cfg', JSON.stringify({
        lang: this.lang, theme: this.theme,
        testModes: this.testModes,
        masterData: this.masterData,
        vl50Data: this.vl50Data,
        launcherOrder:    this._lOrder,
        launcherFavs:     [...this._lFavs],
        launcherHidden:   [...this._lHidden],
      }));
    } catch (_) {}
  }

  _loadConfig() {
    try {
      const c = JSON.parse(localStorage.getItem('3m_cfg') || '{}');
      if (c.lang)  this.lang  = c.lang;
      if (c.theme) this.theme = c.theme;
      if (c.testModes) {
        Object.assign(this.testModes, c.testModes);
        this.masterData = Object.fromEntries(Object.keys(this.testModes).map(k => [k, []]));
      }
      if (c.masterData) Object.assign(this.masterData, c.masterData);
      if (c.vl50Data)   Object.assign(this.vl50Data,   c.vl50Data);
      // Launcher state
      const allNames = Object.keys(INSTRUMENTS);
      this._lOrder  = c.launcherOrder?.filter(n => allNames.includes(n)) ?? [...allNames];
      // Add any new instruments not yet in saved order
      allNames.forEach(n => { if (!this._lOrder.includes(n)) this._lOrder.push(n); });
      this._lFavs   = new Set(c.launcherFavs   ?? []);
      this._lHidden = new Set(c.launcherHidden  ?? []);
    } catch (_) {
      const allNames = Object.keys(INSTRUMENTS);
      this._lOrder  = [...allNames];
      this._lFavs   = new Set();
      this._lHidden = new Set();
    }
  }

  // ── Launcher ───────────────────────────────────────────────────────────────
  _buildLauncher() {
    const root = document.getElementById('launcherCards');
    root.innerHTML = '';

    const favNames  = this._lOrder.filter(n => this._lFavs.has(n)   && !this._lHidden.has(n));
    const restNames = this._lOrder.filter(n => !this._lFavs.has(n)  && !this._lHidden.has(n));
    const hiddenNames = [...this._lHidden];

    // ── Favourites section ─────────────────────────────────────────────────
    if (favNames.length) {
      const favSec = document.createElement('div');
      favSec.className = 'launcher-section';
      favSec.innerHTML = `<div class="launcher-sec-title">${this.t('launcher_fav_section')}</div>`;
      const favGrid = document.createElement('div');
      favGrid.className = 'cards-grid launcher-fav-grid';
      favNames.forEach(n => favGrid.appendChild(this._makeCard(n, true)));
      favSec.appendChild(favGrid);
      root.appendChild(favSec);
    }

    // ── All instruments ────────────────────────────────────────────────────
    const allSec = document.createElement('div');
    allSec.className = 'launcher-section';
    if (favNames.length) allSec.innerHTML = `<div class="launcher-sec-title">${this.t('launcher_all_section')}</div>`;
    const allGrid = document.createElement('div');
    allGrid.className = 'cards-grid';
    allGrid.id = 'launcherMainGrid';
    restNames.forEach(n => allGrid.appendChild(this._makeCard(n, false)));
    allSec.appendChild(allGrid);
    root.appendChild(allSec);

    // ── Hidden restore bar ─────────────────────────────────────────────────
    if (hiddenNames.length) {
      const bar = document.createElement('div');
      bar.className = 'launcher-hidden-bar';
      bar.innerHTML = `<span style="color:var(--text-dim);font-size:12px;">${this.t('launcher_hidden')}: ${hiddenNames.join(', ')}</span>
        <button class="sbtn" onclick="app._restoreAll()">${this.t('launcher_restore')}</button>`;
      root.appendChild(bar);
    }

    this._initDragDrop();
  }

  _makeCard(name, isFav) {
    const cfg  = INSTRUMENTS[name];
    const card = document.createElement('div');
    card.className = 'device-card';
    card.dataset.name = name;
    card.draggable = true;

    // ── Favourite button (top-left) ──────────────────────────────────────
    const favBtn = document.createElement('button');
    favBtn.className = 'card-fav-btn' + (isFav ? ' active' : '');
    favBtn.title     = this.t(isFav ? 'disconn_btn' : 'launcher_fav_tip');
    favBtn.textContent = '★';
    favBtn.onclick = e => { e.stopPropagation(); this._toggleFav(name); };

    // ── Delete button (top-right) ────────────────────────────────────────
    const delBtn = document.createElement('button');
    delBtn.className   = 'card-del-btn';
    delBtn.title       = this.t('launcher_del_tip');
    delBtn.textContent = '✕';
    delBtn.onclick = e => { e.stopPropagation(); this._hideCard(name); };

    // ── Icon ──────────────────────────────────────────────────────────────
    const img = document.createElement('img');
    img.className = 'card-icon'; img.src = cfg.icon; img.alt = name;
    img.onerror = () => {
      const ph = document.createElement('div');
      ph.className = 'card-icon-ph'; ph.textContent = name[0];
      img.replaceWith(ph);
    };

    const nm = document.createElement('div'); nm.className = 'card-name'; nm.textContent = name;
    const ct = document.createElement('div'); ct.className = 'card-cat';  ct.textContent = cfg.category;

    card.appendChild(favBtn);
    card.appendChild(delBtn);
    card.appendChild(img);
    card.appendChild(nm);
    card.appendChild(ct);

    // Launch only when clicking the card body (not buttons)
    card.onclick = () => this.launchInstrument(name);
    return card;
  }

  _toggleFav(name) {
    if (this._lFavs.has(name)) this._lFavs.delete(name);
    else this._lFavs.add(name);
    this._saveConfig();
    this._buildLauncher();
  }

  _hideCard(name) {
    this._lHidden.add(name);
    this._lFavs.delete(name);
    this._saveConfig();
    this._buildLauncher();
  }

  _restoreAll() {
    this._lHidden.clear();
    this._saveConfig();
    this._buildLauncher();
  }

  // ── Drag-and-drop reorder ─────────────────────────────────────────────────
  _initDragDrop() {
    let dragging = null;

    document.querySelectorAll('.device-card[draggable]').forEach(card => {
      card.addEventListener('dragstart', e => {
        dragging = card;
        setTimeout(() => card.classList.add('dragging'), 0);
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        document.querySelectorAll('.card-drop-over').forEach(c => c.classList.remove('card-drop-over'));
        dragging = null;
      });
      card.addEventListener('dragover', e => {
        e.preventDefault();
        if (!dragging || dragging === card) return;
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.card-drop-over').forEach(c => c.classList.remove('card-drop-over'));
        card.classList.add('card-drop-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('card-drop-over'));
      card.addEventListener('drop', e => {
        e.preventDefault();
        if (!dragging || dragging === card) return;
        const fromName = dragging.dataset.name;
        const toName   = card.dataset.name;
        const fi = this._lOrder.indexOf(fromName);
        const ti = this._lOrder.indexOf(toName);
        if (fi !== -1 && ti !== -1) {
          this._lOrder.splice(fi, 1);
          this._lOrder.splice(ti, 0, fromName);
          this._saveConfig();
          this._buildLauncher();
        }
      });
    });
  }

  goHome() {
    this.instr?.onDisconnect?.();
    if (this.serial.isConnected) this._doDisconnect();
    document.getElementById('launcher').hidden = false;
    document.getElementById('instrumentView').hidden = true;
    document.getElementById('deviceName').textContent = '';
    this._connBadge(false);
    this._saveConfig();
  }

  // ── Instrument launch ──────────────────────────────────────────────────────
  launchInstrument(name) {
    this.instrName = name;
    this.instr     = INSTRUMENTS[name];
    document.getElementById('launcher').hidden = true;
    document.getElementById('instrumentView').hidden = false;
    document.getElementById('deviceName').textContent = `(${name})`;
    this.sm.reset();
    this.count = 0;
    document.getElementById('syslogPanel')?.classList.remove('collapsed');
    const lt = document.getElementById('logToggle');
    if (lt) lt.textContent = '▼';

    if (this.instr.viewType === 'custom') {
      this._setupCustomView();
    } else {
      this._setupGridView();
    }
  }

  // ── Custom view (Agilent, DAQ, etc.) ──────────────────────────────────────
  _setupCustomView() {
    this.instr.buildSidebar(document.getElementById('sidebar'));
    this.instr.buildCenter(document.getElementById('center'));
    this.instr.buildRightPanel(document.getElementById('rightpanel'));
    this._updateCount();
    this._setDisplay('— — —', '', 'off', '연결 안됨');
    this.refreshPorts();
  }

  // ── Grid view ──────────────────────────────────────────────────────────────
  _setupGridView() {
    const cfg = this.instr;
    document.getElementById('sidebar').innerHTML = this._origSidebarHTML;
    this._applyLang();

    if (cfg.hideSplit)   document.getElementById('splitPanel')?.style.setProperty('display','none');
    if (cfg.hideAutoLog) document.getElementById('autoLogPanel')?.style.setProperty('display','none');

    const center = document.getElementById('center');
    center.innerHTML = `
      <div class="display-bar">
        <div class="disp-value"><span id="liveValue">— — —</span><span class="disp-unit" id="liveUnit"></span></div>
        <div class="disp-meta">
          <span id="liveStatus" class="disp-status off">연결 안됨</span>
          <span class="meas-count">측정 수: <b id="measCount">0</b></span>
        </div>
      </div>
      <div class="panel datalog-head-bar">
        <div class="panel-title">📋 측정 데이터</div>
        <div class="datalog-actions">
          <button class="sbtn" onclick="app.copyData()">COPY</button>
          <button class="sbtn green" onclick="app.exportCSV()">Export CSV</button>
          <button class="sbtn red" onclick="app.clearData()">Clear Data</button>
        </div>
      </div>
      <div id="panelsContainer" class="panels-scroll"></div>`;

    document.getElementById('rightpanel').innerHTML = `
      <div class="panel grow">
        <div class="graph-head"><div class="panel-title">📊 데이터 분포</div></div>
        <div class="graph-hint">현재 패널의 측정값 분포 (박스 플롯)</div>
        <div class="graph-area">
          <canvas id="mainChart"></canvas>
          <div class="graph-empty" id="chartEmpty">측정 데이터가 없습니다</div>
        </div>
        <div id="statsPanel" class="stats-area"></div>
      </div>`;
    this._chart = new BoxPlot(document.getElementById('mainChart'));

    const area = document.getElementById('dynamicSettings');
    if (area) { area.innerHTML = ''; cfg.buildSettings?.(area); }

    this._updateCount();
    this._setDisplay('— — —', '', 'off', '연결 안됨');
    this.refreshPorts();

    const modes = cfg.useVL50Modes ? this.vl50Modes : this.testModes;
    const data  = cfg.useVL50Modes ? this.vl50Data  : this.masterData;
    this._buildPanels(1, modes, data);
  }

  // ── Serial port ────────────────────────────────────────────────────────────
  async refreshPorts() {
    const sel = document.getElementById('portSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select Port --</option>';
    if (!navigator.serial) return;
    try {
      const ports = await navigator.serial.getPorts();
      ports.forEach((_, i) => {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = `Serial Port ${i+1}`;
        sel.appendChild(opt);
      });
    } catch (_) {}
  }

  async toggleConnection() {
    if (this.serial.isConnected) await this._doDisconnect();
    else await this._doConnect();
  }

  async _doConnect() {
    if (!this.instr) return;
    if (!navigator.serial) { alert(this.t('web_serial_unsupported')); return; }
    try {
      this.log(`Connecting to ${this.instrName}…`);
      await this.serial.connect(this.instr.serial);
      this._setBtnState(true);
      this._connBadge(true);
      this._setDisplay('— — —', '', 'ready', 'READY');
      this.log(`Connected to ${this.instrName}.`, 'ok');
      this.instr.onConnect?.();
      if (this.instr.pollCmd) this._startPolling(this.instr);
    } catch (e) {
      this.log(`[ERR] ${e.message}`, 'err');
      const el = document.getElementById('connStatus');
      if (el) { el.className = 'conn-status-lbl err'; el.textContent = this.t('status_failed'); }
    }
  }

  async _doDisconnect() {
    clearInterval(this.pollTimer); this.pollTimer = null;
    await this.serial.disconnect();
    this._setBtnState(false);
    this._connBadge(false);
    this.sm.reset();
    this._setDisplay('— — —', '', 'off', '연결 안됨');
    this.log('Disconnected.');
  }

  _setBtnState(connected) {
    const btn = document.getElementById('btnConnect');
    if (btn) {
      btn.textContent = connected ? this.t('disconn_btn') : this.t('conn_btn');
      btn.className   = connected ? 'big-btn danger' : 'big-btn';
    }
    const st = document.getElementById('connStatus');
    if (st) {
      st.textContent = connected ? this.t('status_connected') : this.t('status_disconnected');
      st.className   = connected ? 'conn-status-lbl ok' : 'conn-status-lbl';
    }
  }

  _connBadge(on) {
    document.getElementById('connDot').className   = `conn-dot ${on ? 'on' : 'off'}`;
    document.getElementById('connText').textContent = on ? this.t('connected') : this.t('disconnected');
  }

  // ── Polling ────────────────────────────────────────────────────────────────
  _startPolling(cfg) {
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (this.serial.isConnected) this.serial.sendCmd(cfg.pollCmd);
    }, cfg.pollInterval);
  }

  _onLine(line) {
    if (!this.instr) return;
    // Custom instruments handle their own line parsing
    if (this.instr.onLine) {
      this.instr.onLine(line);
      return;
    }
    // Grid instruments: use parseValue + state machine
    const res = this.instr.parseValue?.(line);
    if (!res) return;
    this.currentFmt = `${res.fmt}${res.unit ? ' ' + res.unit : ''}`;
    this._setDisplay(res.fmt, res.unit || '');
    if (!this.instr.noAutoLog) {
      this.sm.update(res.valid, res.value ?? 0, res.fmt);
    }
  }

  // ── State machine callbacks ────────────────────────────────────────────────
  _onStateChange(s) {
    const map = {
      'WAIT_FOR_CONTACT': ['ready',       'READY'],
      'STABILIZING':      ['stabilizing', 'STABILIZING'],
      'WAIT_FOR_OPEN':    ['wait-open',   'WAIT OPEN'],
    };
    const [cls, lbl] = map[s] || ['off', s];
    const el = document.getElementById('liveStatus');
    if (el) { el.className = `disp-status ${cls}`; el.textContent = lbl; }
  }

  _onLogTriggered(value, fmt) {
    this.log(`Auto-log: ${fmt}`, 'ok');
    this._captureValue(fmt.split(' ')[0]);
  }

  // ── Grid interaction ───────────────────────────────────────────────────────
  onEnterPressed() {
    if (this.serial.isConnected) {
      const clean = this.currentFmt.split(' ')[0];
      const bad = ['---','Over','Current','Cmd'];
      if (clean && !bad.some(x => clean.startsWith(x))) {
        this._captureValue(clean); return;
      }
    }
    this.panels[this.activePanelIdx]?.grid.moveNext();
  }

  _captureValue(val) {
    const p = this.panels[this.activePanelIdx];
    if (!p) return;
    const { focusR: r, focusC: c } = p.grid;
    p.grid.setValue(r, c, val);
    p.grid.moveNext();
    this.count++;
    this._updateCount();
    this._redrawChart();
  }

  setWaitTime(v) { this.sm.waitTime = isNaN(v) ? 2.0 : Math.max(0.1, v); }

  // ── Split ──────────────────────────────────────────────────────────────────
  setSplit(n) {
    if (this.instr?.viewType !== 'grid') return;
    document.getElementById('splitToggle')?.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.val) === n);
    });
    this._savePanelData();
    const modes = this.instr.useVL50Modes ? this.vl50Modes : this.testModes;
    const data  = this.instr.useVL50Modes ? this.vl50Data  : this.masterData;
    this._buildPanels(n, modes, data);
  }

  _buildPanels(n, modes, data) {
    this.splitCount = n;
    const cont = document.getElementById('panelsContainer');
    cont.innerHTML = '';
    this.panels = [];
    const modeKeys = Object.keys(modes);

    for (let i = 0; i < n; i++) {
      const modeKey = modeKeys[i % modeKeys.length];

      const panelEl = document.createElement('div');
      panelEl.className = 'inst-panel';
      panelEl.style.flex = `${1/n}`;

      const hdr = document.createElement('div');
      hdr.className = 'panel-hdr';

      const lbl = document.createElement('span');
      lbl.className = 'panel-lbl';
      lbl.textContent = `${this.t('panel_prefix')} ${i+1}`;

      const modeSel = document.createElement('select');
      modeSel.className = 'mode-select';
      Object.keys(modes).forEach(k => {
        const opt = document.createElement('option');
        opt.value = k; opt.textContent = k;
        if (k === modeKey) opt.selected = true;
        modeSel.appendChild(opt);
      });

      hdr.appendChild(lbl); hdr.appendChild(modeSel);
      panelEl.appendChild(hdr);

      const gridHost = document.createElement('div');
      gridHost.style.cssText = 'flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;';
      panelEl.appendChild(gridHost);
      cont.appendChild(panelEl);

      const grid = new EditableGrid(gridHost, i);
      grid.onFocusChange = pi => { this.activePanelIdx = pi; };
      grid.onDataChange  = () => this._redrawChart();
      grid.build(modes[modeKey], data[modeKey] || []);

      const panelObj = { modeKey, grid };
      this.panels.push(panelObj);

      modeSel.onchange = () => {
        const k = modeSel.value;
        this._savePanelData(i);
        panelObj.modeKey = k;
        grid.build(modes[k], data[k] || []);
        this._redrawChart();
      };
    }
    this._redrawChart();
  }

  _redrawChart() {
    const p = this.panels[this.activePanelIdx];
    if (!p || !this._chart) return;
    requestAnimationFrame(() => this._chart.draw(p.grid.getNumbers()));
  }

  _savePanelData(idx) {
    const master = this.instr?.useVL50Modes ? this.vl50Data : this.masterData;
    if (idx !== undefined) {
      const p = this.panels[idx];
      if (p) master[p.modeKey] = p.grid.getData();
    } else {
      this.panels.forEach(p => { master[p.modeKey] = p.grid.getData(); });
    }
  }

  // ── Toolbar (grid) ─────────────────────────────────────────────────────────
  copyData() {
    const lines = [];
    this.panels.forEach((p, i) => {
      if (this.panels.length > 1) lines.push(`=== Panel ${i+1} ===`);
      p.grid.getData().forEach(row => lines.push(row.join('\t')));
    });
    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => this.log(this.t('clipboard_ok'), 'ok'));
  }

  exportCSV() {
    const rows = [];
    this.panels.forEach((p, pi) => {
      if (this.panels.length > 1) rows.push([`=== Panel ${pi+1} ===`]);
      rows.push(['No.', ...p.grid.cols]);
      p.grid.getData().forEach((row, ri) => rows.push([ri+1, ...row]));
      rows.push([]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })),
      download: `3M_${this.instrName}_${_dateStr()}.csv`,
    });
    a.click(); URL.revokeObjectURL(a.href);
    this.log(this.t('csv_ok'), 'ok');
  }

  clearData() {
    if (!confirm(this.t('alert_confirm_clear'))) return;
    const modes  = this.instr?.useVL50Modes ? this.vl50Modes : this.testModes;
    const master = this.instr?.useVL50Modes ? this.vl50Data  : this.masterData;
    this.panels.forEach(p => {
      master[p.modeKey] = [];
      p.grid.build(modes[p.modeKey], []);
    });
    this.count = 0; this._updateCount();
    this._redrawChart();
    this.log('Data cleared.');
  }

  // ── Test manager ───────────────────────────────────────────────────────────
  openTestManager() {
    const sel = document.getElementById('mgr_del');
    sel.innerHTML = '';
    Object.keys(this.testModes).forEach(k => {
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = k + (DEFAULT_KEYS.has(k) ? ` (${this.t('test_name_label')||'default'})` : '');
      sel.appendChild(opt);
    });
    document.getElementById('testManagerModal').style.display = 'flex';
  }
  closeTestManager() { document.getElementById('testManagerModal').style.display = 'none'; }

  addTestMode() {
    const name  = document.getElementById('mgr_name').value.trim();
    const total = parseInt(document.getElementById('mgr_total').value);
    const group = parseInt(document.getElementById('mgr_group').value) || 0;
    const set   = parseInt(document.getElementById('mgr_set').value)   || total;
    if (!name)               return alert(this.t('alert_enter_name'));
    if (this.testModes[name]) return alert(this.t('alert_dup_name'));
    if (isNaN(total) || total < 1) return alert(this.t('alert_min_cells'));
    const cols = group > 0
      ? Array.from({length: total}, (_, i) => String((i % group) + 1))
      : Array.from({length: total}, (_, i) => String(i + 1));
    this.testModes[name] = { cols, group, set };
    this.masterData[name] = [];
    this._saveConfig();
    this.openTestManager();
    document.getElementById('mgr_name').value = '';
    this.log(`'${name}' 추가됨.`, 'ok');
  }

  deleteTestMode() {
    const name = document.getElementById('mgr_del').value;
    if (DEFAULT_KEYS.has(name)) return alert(this.t('alert_del_default'));
    if (!confirm(`'${name}' ${this.t('btn_delete')}?`)) return;
    delete this.testModes[name]; delete this.masterData[name];
    this._saveConfig();
    this.openTestManager();
  }

  // ── System log ────────────────────────────────────────────────────────────
  toggleLog() {
    const panel = document.getElementById('syslogPanel');
    const btn   = document.getElementById('logToggle');
    if (!panel) return;
    const collapsed = panel.classList.toggle('collapsed');
    if (btn) btn.textContent = collapsed ? '▲' : '▼';
  }

  log(msg, type = '') {
    const box = document.getElementById('sysLog');
    if (!box) return;
    const ts  = new Date().toTimeString().slice(0, 8);
    const div = document.createElement('div');
    div.className = type ? `log-${type}` : '';
    div.textContent = `[${ts}] ${msg}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  _setDisplay(val, unit, statusCls, statusText) {
    const lv = document.getElementById('liveValue');
    const lu = document.getElementById('liveUnit');
    const ls = document.getElementById('liveStatus');
    if (lv) lv.textContent = val;
    if (lu && unit !== undefined) lu.textContent = unit ? ` ${unit}` : '';
    if (ls && statusCls !== undefined) {
      ls.className   = `disp-status ${statusCls}`;
      ls.textContent = statusText;
    }
  }

  _updateCount() {
    const el = document.getElementById('measCount');
    if (el) el.textContent = this.count;
  }
}

function _dateStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
window.app = new App();

window.addEventListener('resize', () => {
  if (app.instr?.viewType === 'grid') app._redrawChart();
});
