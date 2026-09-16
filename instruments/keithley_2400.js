import { syslogPanelHTML, fmt, dateStr } from './_utils.js';
import { fillKeithley2400Template } from './keithley_2400_xlsx.js';

// Keithley 2400 SourceMeter - Web Serial RS-232 or VISA/GPIB.
// Protocol SSOT: docs/INSTRUMENT_COMMUNICATION_PROTOCOLS.md

const SETTINGS_KEY = 'keithley2400_settings';
const EVALDATA_URL = '/api/keithley2400/evaldata';
const EVALDATA_SCHEMA = '3m-instrument-logger/keithley2400-evaluations';
const EVALDATA_VERSION = 1;
const CR = '\r';
const MAX_POWER_W = 22;
const MAX_SOURCE_V = 200;
const HARDWARE_MAX_V = 210;
const MAX_SOURCE_I = 1.05;
const HIGH_CURRENT_V_BOUNDARY = 21;
const HIGH_VOLTAGE_I_BOUNDARY = 0.105;
const MAX_I_AT_HIGH_V = 0.105;
const MAX_V_AT_HIGH_I = 21;
const MIN_CURRENT_COMPLIANCE = 1e-9;
const MIN_VOLTAGE_COMPLIANCE = 2e-4;
const HAZARDOUS_VOLTAGE_THRESHOLD = 30;
const COMPLIANCE_BIT = 1 << 3;
const OVP_BIT = 1 << 4;
const OVERFLOW_LIMIT = 9e36;
const NPLC_VALUES = new Set([0.1, 1, 10]);
const VOLT_RANGES = [0.2, 2, 20, 200];
const CURR_RANGES = [1e-6, 10e-6, 100e-6, 1e-3, 10e-3, 100e-3, 1];
const V_PROTECTION_LEVELS = [20, 40, 60, 80, 100, 120, 160];
const GRAPH_RUN_COLORS = ['#38bdf8', '#f472b6', '#facc15', '#a78bfa', '#fb7185', '#2dd4bf', '#fb923c', '#c084fc'];

let S = null;
let _pending = null;

const L = {
  ko: {
    conn: 'RS-232 / GPIB 연결', rs232: 'RS-232: 9600 · 8-N-1 · Flow Control NONE · Straight-through DB-9 · GPIB: NI-VISA',
    disconnected: '연결 안 됨', connect: '디바이스 연결', refresh: '포트 새로고침',
    setup: '출력 및 측정 설정', source_mode: '소스 모드', source_v: '전압 인가', source_i: '전류 인가',
    source_value: '인가값', compliance_i: '전류 Compliance', compliance_v: '전압 Compliance',
    ref_r_title: '참고 계산 · 설정 전류 유지 기준',
    ref_r_value: '제품 저항이 약 {value} 이하여야 합니다',
    ref_r_formula: '이보다 저항이 높으면 전압 제한이 작동해 실제 전류가 설정값보다 낮아질 수 있습니다.',
    ref_r_zero: '인가 전류를 입력하면 제품 저항 기준이 표시됩니다.',
    ref_v_title: '참고 계산 · 설정 전압 유지 기준',
    ref_v_value: '제품 저항이 약 {value} 이상이어야 합니다',
    ref_v_formula: '이보다 저항이 낮으면 안전 전류 제한이 작동해 실제 전압이 설정값보다 낮아질 수 있습니다.',
    ref_v_zero: '전류 제한값을 입력하면 제품 저항 기준이 표시됩니다.',
    limit_guide_title: '초보자용 전압·전류 설정 한도',
    limit_voltage: '설정 전압', limit_current: '설정 가능한 최대 전류 제한',
    limit_low_v: '0 V ~ 21 V', limit_low_i: '최대 약 1.05 A',
    limit_high_v: '21 V 초과 ~ 200 V', limit_high_i: '최대 약 0.105 A',
    limit_guide_note: '전류 제한은 항상 흐르는 전류가 아니라, 이 값보다 많이 흐르지 못하게 막는 안전 한도입니다.',
    limit_guide_ok: '현재 설정은 허용 범위 안입니다. 최대 {current} A',
    limit_guide_over: '현재 전류 제한이 큽니다. 최대 {current} A 이하로 설정하세요.',
    spec_exceeded: '장비 스펙 초과',
    spec_summary: '프로그램 평가 허용 범위\n• 전압 인가: 최대 200 V\n• 전류 인가: 최대 1.05 A\n• 최대 출력: 22 W\n• 21 V 초과 시 전류 제한: 최대 0.105 A\n\n장비의 기술적 프로그래밍 한계는 210 V이지만, 210 V에서는 OVP 여유가 없어 안전을 위해 200 V까지만 허용합니다.',
    spec_adjust_source_v: '입력한 전압 {input} V는 입력칸을 벗어나면 {adjusted} V로 자동 조정됩니다.',
    spec_adjust_source_i: '입력한 전류 {input} A는 입력칸을 벗어나면 {adjusted} A로 자동 조정됩니다.',
    spec_adjust_compliance_i: '입력한 전류 제한 {input} A는 입력칸을 벗어나면 {adjusted} A로 자동 조정됩니다.',
    spec_adjust_compliance_v: '입력한 전압 제한 {input} V는 입력칸을 벗어나면 {adjusted} V로 자동 조정됩니다.',
    spec_adjust_sweep_start: 'Sweep 시작값 {input}은 입력칸을 벗어나면 {adjusted}으로 자동 조정됩니다.',
    spec_adjust_sweep_stop: 'Sweep 종료값 {input}은 입력칸을 벗어나면 {adjusted}으로 자동 조정됩니다.',
    ovp_auto_title: 'OVP 자동 설정',
    ovp_auto_device: '현재 장비 OVP: {voltage}',
    ovp_auto_note: '설정 전압보다 높은 장비 보호 단계가 자동 적용됩니다.',
    ovp_trip: '장비 OVP {limit} V가 감지되어 출력이 차단되었습니다. 측정 전압: {measured} V',
    sense: '측정 배선', rate: '측정 속도', settle: '안정화 시간 (초)', sample: '제품명',
    mode: '평가 모드', spot: '단일', time: '시간', sweep: 'I-V Sweep', cycle: '사이클',
    interval: '기록 간격 (초)', duration: '총 시간 (초)', repeat: '반복 횟수',
    sweep_start: '시작값', sweep_stop: '종료값', sweep_points: '포인트 수',
    cycle_title: '사이클 설정', cycle_step_source: '인가값', cycle_step_compliance: 'Compliance',
    cycle_step_time: '유지시간 (초)', cycle_add: '단계 추가', cycle_loops: '반복 횟수',
    cycle_interval: '측정 간격 (초)', cycle_total: '총 예정시간', cycle_empty: '추가된 사이클 단계가 없습니다.',
    cycle_delete: '삭제', cycle_step: '단계', cycle_need_step: '사이클 단계를 1개 이상 추가하세요.',
    cycle_running: '사이클 {loop}/{loops} · 단계 {step}/{steps}', sample_edit_hint: '제품명 수정',
    graph_latest: '최신 결과', graph_selected: '선택 결과',
    graph_line_voltage: '전압: 직선', graph_line_current: '전류: 굵은 점선', graph_line_resistance: '저항: 점선',
    start: '안전 확인 후 시작', stop: '비상 출력 OFF', clear: '전체 삭제', del: '선택 삭제', xlsx: '대시보드 XLSX 저장',
    list_export: '목록 내보내기', list_import: '목록 가져오기', list_save: '목록 저장', graph_save: '그래프 이미지 저장',
    ready: '준비', configuring: '설정 적용 중', measuring: '측정 중', stopping: '출력 차단 중', fault: '안전 정지',
    data: '평가 결과', graph: '전압 / 전류 / 저항 그래프', no_data: '평가 결과가 없습니다.',
    date: '평가일', max_v: '전압 최대값 |V|', max_i: '전류 최대값 |I|', avg_i: '전류 평균값', max_r: '저항 최대값 |R|',
    points: '측정 수', elapsed: '평가 시간', raw_export_hint: '선택 결과를 Raw Data 숫자 셀과 연동된 Excel 기본 차트 3개 및 평가별 가로 배치 Raw Data의 2개 시트로 저장합니다. 선택이 없으면 전체 평가를 저장합니다.',
    hv_title: '출력 전 안전 확인', hv: '고전압 위험 조건입니다. 출력 중 단자와 DUT를 만지지 마세요.',
    hv_setting_title: '⚠ 고전압 설정 · 최대 예상 {voltage} V',
    hv_setting_touch: '출력 ON 중 단자, DUT 및 케이블을 만지지 마세요.',
    hv_setting_fixture: '해당 전압 정격의 절연 케이블·프로브와 밀폐 지그/인터락을 사용하세요.',
    hv_setting_off: '배선 변경과 DUT 탈착은 OUTPUT OFF 및 잔류전압 방전을 확인한 후 진행하세요.',
    hv_setting_limit: 'Compliance와 프로그램 경고는 감전 방지 장치를 대신하지 않습니다.',
    hv_setting_source_v: '현재 전류 Compliance: {compliance} A · 장비 OVP: {deviceOvp}',
    hv_setting_source_i: '현재 전압 Compliance: {compliance} V',
    normal: '아래 조건과 DUT 배선을 확인한 뒤에만 시작하세요.',
    four_wire: '4-Wire: FORCE HI/LO와 SENSE HI/LO가 DUT에 올바르게 연결되어야 합니다.',
    two_wire: '2-Wire: SENSE 단자를 사용하지 않는 Local Sense 구성입니다.',
    acknowledge: '배선, DUT 정격, 극성, 비상 차단 방법을 확인했습니다.',
    cancel: '취소', confirm: '확인 후 출력 시작',
    invalid: '설정 제한', connected: '장비 확인 완료', compliance: 'Compliance 감지 - 출력이 자동 차단되었습니다.',
    err_timeout: '장비 응답 시간이 초과되었습니다.', err_idn: 'Keithley 2400으로 확인되지 않았습니다.',
    err_sense: '장비의 2/4-Wire 설정 확인에 실패했습니다.', err_connect: '초기 안전 설정에 실패했습니다.',
    err_measure_config: '전압·전류 실측 또는 연속 출력 설정이 장비에 적용되지 않았습니다. 출력을 중단합니다. 시스템 로그를 확인하세요.',
    stopped: '출력이 OFF 되었습니다.', finished: '평가 완료 - 출력 OFF', overflow: 'Over Flow',
    fresh_4w: '최초 기본값은 4-Wire이며 마지막 선택값을 저장합니다.',
    saved: '저장됨', fallback: '브라우저 다운로드로 저장됨',
    list_saved: '평가 목록이 누적 저장되었습니다.', list_loaded: '저장된 평가 {runs}건을 불러왔습니다.',
    list_imported: '평가 {added}건을 추가했고, 중복 {skipped}건을 제외했습니다.',
    list_invalid: 'Keithley 2400 평가 목록 JSON 형식이 아닙니다.', list_save_failed: '평가 목록 저장에 실패했습니다.',
  },
  en: {
    conn: 'RS-232 / GPIB Connection', rs232: 'RS-232: 9600 · 8-N-1 · Flow Control NONE · Straight-through DB-9 · GPIB: NI-VISA',
    disconnected: 'Disconnected', connect: 'Connect Device', refresh: 'Refresh ports',
    setup: 'Source and Measurement', source_mode: 'Source mode', source_v: 'Source V', source_i: 'Source I',
    source_value: 'Source level', compliance_i: 'Current compliance', compliance_v: 'Voltage compliance',
    ref_r_title: 'Reference · keep the set current',
    ref_r_value: 'Product resistance should be about {value} or lower',
    ref_r_formula: 'Above this resistance, the voltage limit can reduce the actual current below the set value.',
    ref_r_zero: 'Enter a source current to see the product-resistance reference.',
    ref_v_title: 'Reference · keep the set voltage',
    ref_v_value: 'Product resistance should be about {value} or higher',
    ref_v_formula: 'Below this resistance, the safety current limit can reduce the actual voltage below the set value.',
    ref_v_zero: 'Enter a current limit to see the product-resistance reference.',
    limit_guide_title: 'Beginner voltage/current setting limits',
    limit_voltage: 'Set voltage', limit_current: 'Maximum current limit',
    limit_low_v: '0 V to 21 V', limit_low_i: 'Up to about 1.05 A',
    limit_high_v: 'Above 21 V to 200 V', limit_high_i: 'Up to about 0.105 A',
    limit_guide_note: 'The current limit is not the current that always flows. It is the safety ceiling that the current cannot exceed.',
    limit_guide_ok: 'The current setting is allowed. Maximum {current} A',
    limit_guide_over: 'The current limit is too high. Set it to {current} A or lower.',
    spec_exceeded: 'Instrument specification exceeded',
    spec_summary: 'Program evaluation range\n• Source voltage: maximum 200 V\n• Source current: maximum 1.05 A\n• Maximum output: 22 W\n• Above 21 V, current limit: maximum 0.105 A\n\nThe instrument can technically be programmed to 210 V, but that leaves no OVP headroom, so the program allows evaluation only up to 200 V.',
    spec_adjust_source_v: 'The entered voltage {input} V will be adjusted to {adjusted} V when you leave the field.',
    spec_adjust_source_i: 'The entered current {input} A will be adjusted to {adjusted} A when you leave the field.',
    spec_adjust_compliance_i: 'The entered current limit {input} A will be adjusted to {adjusted} A when you leave the field.',
    spec_adjust_compliance_v: 'The entered voltage limit {input} V will be adjusted to {adjusted} V when you leave the field.',
    spec_adjust_sweep_start: 'Sweep start {input} will be adjusted to {adjusted} when you leave the field.',
    spec_adjust_sweep_stop: 'Sweep stop {input} will be adjusted to {adjusted} when you leave the field.',
    ovp_auto_title: 'Automatic OVP setting',
    ovp_auto_device: 'Current instrument OVP: {voltage}',
    ovp_auto_note: 'The next supported instrument protection step above the source voltage is applied automatically.',
    ovp_trip: 'Instrument OVP {limit} V was detected, so output was turned off. Measured voltage: {measured} V',
    sense: 'Sense wiring', rate: 'Measurement speed', settle: 'Settling time (s)', sample: 'Sample name',
    mode: 'Test mode', spot: 'Spot', time: 'Time', sweep: 'I-V Sweep', cycle: 'Cycle',
    interval: 'Log interval (s)', duration: 'Duration (s)', repeat: 'Repeats',
    sweep_start: 'Start level', sweep_stop: 'Stop level', sweep_points: 'Points',
    cycle_title: 'Cycle Settings', cycle_step_source: 'Source level', cycle_step_compliance: 'Compliance',
    cycle_step_time: 'Hold time (s)', cycle_add: 'Add step', cycle_loops: 'Loops',
    cycle_interval: 'Sample interval (s)', cycle_total: 'Estimated duration', cycle_empty: 'No cycle steps have been added.',
    cycle_delete: 'Delete', cycle_step: 'Step', cycle_need_step: 'Add at least one cycle step.',
    cycle_running: 'Cycle {loop}/{loops} · Step {step}/{steps}', sample_edit_hint: 'Edit sample name',
    graph_latest: 'Latest result', graph_selected: 'Selected results',
    graph_line_voltage: 'Voltage: solid', graph_line_current: 'Current: thick dashed', graph_line_resistance: 'Resistance: dotted',
    start: 'Safety check and start', stop: 'Emergency output OFF', clear: 'Clear all', del: 'Delete selected', xlsx: 'Save Dashboard XLSX',
    list_export: 'Export list', list_import: 'Import list', list_save: 'Save list', graph_save: 'Save graph image',
    ready: 'Ready', configuring: 'Configuring', measuring: 'Measuring', stopping: 'Turning output off', fault: 'Safety stop',
    data: 'Evaluation Results', graph: 'Voltage / Current / Resistance Graph', no_data: 'No evaluation results.',
    date: 'Date', max_v: 'Max |V|', max_i: 'Max |I|', avg_i: 'Average I', max_r: 'Max |R|',
    points: 'Samples', elapsed: 'Duration', raw_export_hint: 'Exports two sheets with three native Excel charts linked to numeric Raw Data and side-by-side raw evaluation blocks. If none are selected, all evaluations are exported.',
    hv_title: 'Pre-output safety check', hv: 'Hazardous voltage condition. Never touch terminals or the DUT while output is on.',
    hv_setting_title: '⚠ High-voltage setting · maximum potential {voltage} V',
    hv_setting_touch: 'Do not touch terminals, the DUT, or cables while OUTPUT is ON.',
    hv_setting_fixture: 'Use voltage-rated insulated cables/probes and an enclosed fixture with an interlock.',
    hv_setting_off: 'Change wiring or remove the DUT only after verifying OUTPUT OFF and discharging residual voltage.',
    hv_setting_limit: 'Compliance and software warnings do not replace electric-shock protection.',
    hv_setting_source_v: 'Current compliance: {compliance} A · instrument OVP: {deviceOvp}',
    hv_setting_source_i: 'Voltage compliance: {compliance} V',
    normal: 'Verify the conditions and DUT wiring before starting.',
    four_wire: '4-Wire: connect FORCE HI/LO and SENSE HI/LO correctly at the DUT.',
    two_wire: '2-Wire: local sense configuration; do not use the SENSE terminals.',
    acknowledge: 'I checked wiring, DUT rating, polarity, and the emergency stop method.',
    cancel: 'Cancel', confirm: 'Confirm and enable output',
    invalid: 'Setting limit', connected: 'Instrument verified', compliance: 'Compliance detected - output was turned off.',
    err_timeout: 'Instrument response timed out.', err_idn: 'The device was not identified as a Keithley 2400.',
    err_sense: 'Could not verify the 2/4-wire setting.', err_connect: 'Initial safe configuration failed.',
    err_measure_config: 'Measured voltage/current or continuous output configuration was not applied. Output is stopped. Check the system log.',
    stopped: 'Output is OFF.', finished: 'Test complete - output OFF', overflow: 'Over Flow',
    fresh_4w: 'The first-use default is 4-Wire; the last selection is saved.',
    saved: 'Saved', fallback: 'Saved using browser download',
    list_saved: 'The evaluation list was saved.', list_loaded: 'Loaded {runs} saved evaluations.',
    list_imported: 'Added {added} evaluations and skipped {skipped} duplicates.',
    list_invalid: 'This is not a valid Keithley 2400 evaluation-list JSON file.', list_save_failed: 'Could not save the evaluation list.',
  },
};

const t = key => L[app?.lang === 'en' ? 'en' : 'ko'][key] ?? key;
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadSettings() {
  const defaults = {
    sourceMode: 'VOLT', sourceValue: 1, compliance: 0.01, sense: 4,
    nplc: 1, settle: 0.2, testMode: 'spot', interval: 1, duration: 60,
    repeat: 1, sweepStart: 0, sweepStop: 5, sweepPoints: 11, sample: '',
    cycleSteps: [], cycleLoops: 1, cycleInterval: 1,
  };
  try {
    const saved = { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    saved.sourceMode = saved.sourceMode === 'CURR' ? 'CURR' : 'VOLT';
    if (!Number.isFinite(finiteNumber(saved.sourceValue))) saved.sourceValue = defaults.sourceValue;
    if (!Number.isFinite(finiteNumber(saved.compliance))) saved.compliance = defaults.compliance;
    const primary = clampSafetyConfig(saved);
    saved.sourceValue = primary.sourceValue;
    saved.compliance = primary.compliance;
    const rawSweepStart = Number.isFinite(finiteNumber(saved.sweepStart)) ? saved.sweepStart : defaults.sweepStart;
    const rawSweepStop = Number.isFinite(finiteNumber(saved.sweepStop)) ? saved.sweepStop : defaults.sweepStop;
    saved.sweepStart = clampSourceForCompliance(saved.sourceMode, rawSweepStart, saved.compliance);
    saved.sweepStop = clampSourceForCompliance(saved.sourceMode, rawSweepStop, saved.compliance);
    saved.nplc = NPLC_VALUES.has(Number(saved.nplc)) ? Number(saved.nplc) : defaults.nplc;
    saved.settle = clampFinite(saved.settle, 0, 60, defaults.settle);
    saved.interval = clampFinite(saved.interval, 0.2, 3600, defaults.interval);
    saved.duration = clampFinite(saved.duration, saved.interval, 86400, defaults.duration);
    saved.repeat = Math.round(clampFinite(saved.repeat, 1, 1000, defaults.repeat));
    saved.sweepPoints = Math.round(clampFinite(saved.sweepPoints, 2, 1000, defaults.sweepPoints));
    saved.cycleLoops = Math.round(clampFinite(saved.cycleLoops, 1, 1000, defaults.cycleLoops));
    saved.cycleInterval = clampFinite(saved.cycleInterval, 0.2, 3600, defaults.cycleInterval);
    saved.sense = Number(saved.sense) === 2 ? 2 : 4;
    saved.testMode = ['spot','time','sweep','cycle'].includes(saved.testMode) ? saved.testMode : defaults.testMode;
    saved.sample = String(saved.sample ?? '');
    saved.cycleSteps = Array.isArray(saved.cycleSteps)
      ? saved.cycleSteps.map(step => ({
          source: finiteNumber(step?.source),
          compliance: finiteNumber(step?.compliance),
          duration: finiteNumber(step?.duration),
        })).filter(step => Number.isFinite(step.source) && Number.isFinite(step.compliance) && Number.isFinite(step.duration))
          .map(step => {
            const safe = clampSafetyConfig({ sourceMode: saved.sourceMode, sourceValue: step.source, compliance: step.compliance });
            return { source: safe.sourceValue, compliance: safe.compliance, duration: Math.min(86400, Math.max(0.2, step.duration)) };
          })
      : [];
    return saved;
  }
  catch (_) { return defaults; }
}

function saveSettings() {
  if (!S) return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(S.settings));
}

function init() {
  S = {
    settings: loadSettings(), rows: [], running: false, ready: false,
    outputActive: false, outputKnown: false, busy: false, stopRequested: false, runToken: 0,
    timer: null, startedAt: 0, resizeObserver: null, confirmResolve: null,
    idn: '', lastReading: null, activeRunId: null, activeSample: '', selectedRuns: new Set(),
    graphMetrics: new Set(['voltage', 'current', 'resistance']),
    storageLoaded: false, storageLoadPromise: null, saveTimer: null, saveChain: Promise.resolve(), storageWarned: false,
  };
}

function finiteNumber(value) {
  if (value === '' || value === null || value === undefined) return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export function currentAmpsToMilliamps(value) {
  const amps = finiteNumber(value);
  return Number.isFinite(amps) ? amps * 1000 : NaN;
}

export function formatMilliamps(valueInMilliamps) {
  const value = finiteNumber(valueInMilliamps);
  if (!Number.isFinite(value)) return '—';
  // Model 2400 front-panel current display uses a five-decimal mantissa
  // on the selected mA range. Keep the program's mA display identical.
  return value.toFixed(5);
}

export function formatCurrentMilliamps(currentInAmps) {
  return formatMilliamps(currentAmpsToMilliamps(currentInAmps));
}

const STORED_NUMERIC_FIELDS = [
  'elapsed', 'sourceSetpoint', 'sense', 'nplc', 'complianceLimit', 'stepIndex', 'cycleLoop',
  'voltage', 'current', 'resistance', 'power', 'time', 'status',
];

function normalizeStoredNumber(value) {
  if (value === null || value === '' || value === undefined) return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function normalizeStoredRow(row, index = 0) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const runId = String(row.runId ?? '').trim();
  const timestamp = String(row.timestamp ?? '').trim();
  if (!runId || !Number.isFinite(new Date(timestamp).getTime())) return null;
  const normalized = {
    ...row,
    id: row.id ?? `${runId}-${index}`,
    checked: false,
    runId,
    timestamp,
    sample: String(row.sample ?? ''),
    mode: ['spot', 'time', 'sweep', 'cycle'].includes(row.mode) ? row.mode : 'spot',
    sourceMode: row.sourceMode === 'CURR' ? 'CURR' : 'VOLT',
    sense: Number(row.sense) === 2 ? 2 : 4,
    compliance: Boolean(row.compliance),
    ovp: Boolean(row.ovp),
    overflow: Boolean(row.overflow),
    raw: String(row.raw ?? ''),
  };
  STORED_NUMERIC_FIELDS.forEach(field => { normalized[field] = normalizeStoredNumber(row[field]); });
  normalized.sense = Number(row.sense) === 2 ? 2 : 4;
  return normalized;
}

export function normalizeEvaluationPayload(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.rows) ? payload.rows : null;
  if (!rows) return null;
  return rows.map(normalizeStoredRow).filter(Boolean);
}

export function mergeEvaluationRows(existingRows = [], incomingRows = []) {
  const existing = Array.isArray(existingRows) ? [...existingRows] : [];
  const normalizedIncoming = normalizeEvaluationPayload(incomingRows) ?? [];
  const existingRunIds = new Set(existing.map((row, index) => runKey(row, index)));
  const incomingGroups = new Map();
  normalizedIncoming.forEach(row => {
    if (!incomingGroups.has(row.runId)) incomingGroups.set(row.runId, []);
    incomingGroups.get(row.runId).push(row);
  });
  let addedRuns = 0;
  let skippedRuns = 0;
  let addedRows = 0;
  incomingGroups.forEach((rows, runId) => {
    if (existingRunIds.has(runId)) { skippedRuns++; return; }
    existing.push(...rows);
    existingRunIds.add(runId);
    addedRuns++;
    addedRows += rows.length;
  });
  return { rows: existing, addedRuns, skippedRuns, addedRows };
}

function clampFinite(value, min, max, fallback) {
  const n = finiteNumber(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function rangeComplianceLimit(sourceMode, sourceValue) {
  if (sourceMode === 'CURR') return Math.abs(sourceValue) <= HIGH_VOLTAGE_I_BOUNDARY ? MAX_SOURCE_V : MAX_V_AT_HIGH_I;
  return Math.abs(sourceValue) <= HIGH_CURRENT_V_BOUNDARY ? MAX_SOURCE_I : MAX_I_AT_HIGH_V;
}

function minimumCompliance(sourceMode) {
  return sourceMode === 'CURR' ? MIN_VOLTAGE_COMPLIANCE : MIN_CURRENT_COMPLIANCE;
}

function absoluteSourceLimit(sourceMode) {
  return sourceMode === 'CURR' ? MAX_SOURCE_I : MAX_SOURCE_V;
}

export function maximumComplianceForSource(sourceMode, sourceValue) {
  const mode = sourceMode === 'CURR' ? 'CURR' : 'VOLT';
  const source = Math.abs(finiteNumber(sourceValue));
  if (!Number.isFinite(source)) return NaN;
  const rangeLimit = rangeComplianceLimit(mode, source);
  const powerLimit = source > 0 ? MAX_POWER_W / source : rangeLimit;
  return Math.min(rangeLimit, powerLimit);
}

export function maximumSourceForCompliance(sourceMode, compliance) {
  const mode = sourceMode === 'CURR' ? 'CURR' : 'VOLT';
  const limit = Math.abs(finiteNumber(compliance));
  if (!Number.isFinite(limit) || limit <= 0) return absoluteSourceLimit(mode);
  const quadrantLimit = mode === 'VOLT'
    ? (limit <= MAX_I_AT_HIGH_V ? MAX_SOURCE_V : HIGH_CURRENT_V_BOUNDARY)
    : (limit <= MAX_V_AT_HIGH_I ? MAX_SOURCE_I : HIGH_VOLTAGE_I_BOUNDARY);
  return Math.min(quadrantLimit, MAX_POWER_W / limit);
}

export function clampSourceForCompliance(sourceMode, sourceValue, compliance) {
  const value = finiteNumber(sourceValue);
  if (!Number.isFinite(value)) return value;
  const max = maximumSourceForCompliance(sourceMode, compliance);
  return Math.max(-max, Math.min(max, value));
}

export function currentSourceResistanceReference(sourceCurrent, voltageCompliance) {
  const current = Math.abs(finiteNumber(sourceCurrent));
  const voltage = Math.abs(finiteNumber(voltageCompliance));
  if (!Number.isFinite(current) || !Number.isFinite(voltage) || current <= 0) return null;
  return voltage / current;
}

export function voltageSourceResistanceReference(sourceVoltage, currentCompliance) {
  const voltage = Math.abs(finiteNumber(sourceVoltage));
  const current = Math.abs(finiteNumber(currentCompliance));
  if (!Number.isFinite(voltage) || !Number.isFinite(current) || current <= 0) return null;
  return voltage / current;
}

export function voltageHazardSummary(input = {}) {
  const sourceMode = input.sourceMode === 'CURR' ? 'CURR' : 'VOLT';
  const testMode = input.testMode || 'spot';
  let voltageCandidates;
  if (testMode === 'cycle' && Array.isArray(input.cycleSteps) && input.cycleSteps.length) {
    voltageCandidates = input.cycleSteps.map(step => sourceMode === 'VOLT' ? step?.source : step?.compliance);
  } else if (testMode === 'sweep' && sourceMode === 'VOLT') {
    voltageCandidates = [input.sweepStart, input.sweepStop];
  } else {
    voltageCandidates = [sourceMode === 'VOLT' ? input.sourceValue : input.compliance];
  }
  const values = voltageCandidates.map(value => Math.abs(finiteNumber(value))).filter(Number.isFinite);
  const complianceCandidates = testMode === 'cycle' && Array.isArray(input.cycleSteps) && input.cycleSteps.length
    ? input.cycleSteps.map(step => step?.compliance)
    : [input.compliance];
  const complianceValues = complianceCandidates.map(value => Math.abs(finiteNumber(value))).filter(Number.isFinite);
  const maxVoltage = values.length ? Math.max(...values) : 0;
  const maxCompliance = complianceValues.length ? Math.max(...complianceValues) : 0;
  return { maxVoltage, maxCompliance, hazardous: maxVoltage >= HAZARDOUS_VOLTAGE_THRESHOLD };
}

export function clampSafetyConfig(input) {
  const sourceMode = input?.sourceMode === 'CURR' ? 'CURR' : 'VOLT';
  const rawSource = finiteNumber(input?.sourceValue);
  const rawCompliance = finiteNumber(input?.compliance);
  const maxSource = absoluteSourceLimit(sourceMode);
  const sourceValue = Number.isFinite(rawSource) ? Math.max(-maxSource, Math.min(maxSource, rawSource)) : rawSource;
  const maxCompliance = maximumComplianceForSource(sourceMode, sourceValue);
  const minCompliance = minimumCompliance(sourceMode);
  const compliance = Number.isFinite(rawCompliance)
    ? Math.max(minCompliance, Math.min(maxCompliance, rawCompliance))
    : rawCompliance;
  return { sourceMode, sourceValue, compliance, maxSource, minCompliance, maxCompliance };
}

export function safetyAdjustmentDetails(input, safe = clampSafetyConfig(input)) {
  const rawSource = finiteNumber(input?.sourceValue);
  const rawCompliance = finiteNumber(input?.compliance);
  const changed = (before, after) => Number.isFinite(before) && Number.isFinite(after) && Math.abs(before - after) > 1e-12;
  return {
    sourceMode: safe.sourceMode,
    sourceChanged: changed(rawSource, safe.sourceValue),
    complianceChanged: changed(rawCompliance, safe.compliance),
    rawSource, rawCompliance,
    sourceValue: safe.sourceValue,
    compliance: safe.compliance,
  };
}

export function validateSafetyConfig(input) {
  const sourceMode = input.sourceMode === 'CURR' ? 'CURR' : 'VOLT';
  const sourceValue = finiteNumber(input.sourceValue);
  const compliance = finiteNumber(input.compliance);
  const errors = [];
  if (!Number.isFinite(sourceValue)) errors.push('인가값은 숫자여야 합니다.');
  if (!Number.isFinite(compliance) || compliance <= 0) errors.push('Compliance는 0보다 커야 합니다.');

  if (errors.length === 0 && sourceMode === 'VOLT') {
    const av = Math.abs(sourceValue);
    const maxI = rangeComplianceLimit(sourceMode, sourceValue);
    if (av > MAX_SOURCE_V) errors.push(`OVP 여유 확보를 위한 프로그램 전압 인가 범위는 ±${MAX_SOURCE_V} V입니다.`);
    if (compliance < MIN_CURRENT_COMPLIANCE) errors.push('Current Compliance는 최소 1 nA 이상이어야 합니다.');
    if (compliance > maxI) errors.push(`${av > HIGH_CURRENT_V_BOUNDARY ? '21 V 초과' : '±21 V 이하'} 영역의 전류 Compliance는 ${maxI} A 이하여야 합니다.`);
    if (av * compliance > MAX_POWER_W + 1e-12) errors.push(`예상 최대 전력 ${fmt(av * compliance)} W가 ${MAX_POWER_W} W 제한을 초과합니다.`);
  }
  if (errors.length === 0 && sourceMode === 'CURR') {
    const ai = Math.abs(sourceValue);
    const maxV = rangeComplianceLimit(sourceMode, sourceValue);
    if (ai > MAX_SOURCE_I) errors.push(`Model 2400 전류 인가 범위는 ±${MAX_SOURCE_I} A입니다.`);
    if (compliance < MIN_VOLTAGE_COMPLIANCE) errors.push('Voltage Compliance는 최소 0.2 mV 이상이어야 합니다.');
    if (compliance > maxV) errors.push(`${ai > HIGH_VOLTAGE_I_BOUNDARY ? '105 mA 초과' : '±105 mA 이하'} 영역의 전압 Compliance는 ${maxV} V 이하여야 합니다.`);
    if (ai * compliance > MAX_POWER_W + 1e-12) errors.push(`예상 최대 전력 ${fmt(ai * compliance)} W가 ${MAX_POWER_W} W 제한을 초과합니다.`);
  }
  return {
    ok: errors.length === 0, errors, sourceMode, sourceValue, compliance,
    maxVoltage: sourceMode === 'VOLT' ? Math.abs(sourceValue) : compliance,
    maxCurrent: sourceMode === 'CURR' ? Math.abs(sourceValue) : compliance,
    maxPower: Math.abs(sourceValue * compliance),
  };
}

export function validateCycleConfig(input) {
  const steps = Array.isArray(input?.cycleSteps) ? input.cycleSteps : [];
  const loops = Number(input?.cycleLoops);
  const interval = Number(input?.cycleInterval);
  const errors = [];
  if (!steps.length) errors.push('사이클 단계를 1개 이상 추가하세요.');
  if (!Number.isInteger(loops) || loops < 1 || loops > 1000) errors.push('사이클 반복 횟수는 1~1000의 정수입니다.');
  if (!Number.isFinite(interval) || interval < 0.2 || interval > 3600) errors.push('사이클 측정 간격은 0.2~3600초입니다.');
  steps.forEach((step, index) => {
    const check = validateSafetyConfig({
      sourceMode: input?.sourceMode,
      sourceValue: step?.source,
      compliance: step?.compliance,
    });
    check.errors.forEach(error => errors.push(`${index + 1}단계: ${error}`));
    const duration = Number(step?.duration);
    if (!Number.isFinite(duration) || duration < 0.2 || duration > 86400) {
      errors.push(`${index + 1}단계: 유지시간은 0.2~86400초입니다.`);
    }
  });
  const totalDuration = steps.reduce((sum, step) => sum + (Number(step?.duration) || 0), 0) * (Number.isFinite(loops) ? loops : 0);
  return { ok: errors.length === 0, errors, totalDuration };
}

export function parseReading(line) {
  if (!line) return null;
  const parts = String(line).trim().split(',').map(v => v.trim());
  // A single READ? must contain exactly VOLT,CURR,TIME,STAT. Do not turn
  // blank fields into zero or silently truncate a stale multi-reading response.
  if (parts.length !== 4 || parts.some(v => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d+)?$/i.test(v))) return null;
  const values = parts.map(Number);
  if (values.some(v => !Number.isFinite(v))) return null;
  let [voltage, current, instrumentTime, status] = values;
  if (!Number.isInteger(status) || status < 0 || status > 0xffffff || instrumentTime < 0 || instrumentTime >= OVERFLOW_LIMIT) return null;
  const overflow = Math.abs(voltage) >= OVERFLOW_LIMIT || Math.abs(current) >= OVERFLOW_LIMIT;
  if (Math.abs(voltage) >= OVERFLOW_LIMIT) voltage = NaN;
  if (Math.abs(current) >= OVERFLOW_LIMIT) current = NaN;
  const resistance = Number.isFinite(voltage) && Number.isFinite(current) && Math.abs(current) > 1e-15
    ? voltage / current : NaN;
  const power = Number.isFinite(voltage) && Number.isFinite(current) ? voltage * current : NaN;
  return {
    voltage, current, resistance, power, instrumentTime, status, overflow,
    compliance: Boolean(status & COMPLIANCE_BIT), ovp: Boolean(status & OVP_BIT), raw: String(line).trim(),
  };
}

function sourceRange(mode, value) {
  const ranges = mode === 'VOLT' ? VOLT_RANGES : CURR_RANGES;
  const a = Math.abs(value);
  return ranges.find(r => a <= r) ?? ranges[ranges.length - 1];
}

function voltageProtection(value) {
  const a = Math.abs(value);
  return V_PROTECTION_LEVELS.find(v => a <= v) ?? 'NONE';
}

export function automaticOvpPlan(sourceVoltage) {
  const source = Math.abs(finiteNumber(sourceVoltage));
  const requestedOvp = Number.isFinite(source)
    ? Math.min(HARDWARE_MAX_V, Math.max(20, source + 10))
    : 20;
  const instrumentCommand = voltageProtection(requestedOvp);
  const instrumentCutoff = instrumentCommand === 'NONE' ? HARDWARE_MAX_V : instrumentCommand;
  return { sourceVoltage: source, requestedOvp, instrumentCommand, instrumentCutoff };
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
}

async function send(command) {
  if (!app.serial?.isConnected) throw new Error('Instrument transport is not connected');
  const result = await app.serial.sendCmd(`${command}${CR}`);
  if (result?.success === false) throw new Error(result.error || `Send failed: ${command}`);
}

function clearPending(error) {
  if (!_pending) return;
  const p = _pending;
  _pending = null;
  clearTimeout(p.timer);
  p.reject(error instanceof Error ? error : new Error(String(error || 'Query cancelled')));
}

function query(command, accept = () => true, timeoutMs = 3000) {
  if (_pending) return Promise.reject(new Error('A query is already pending'));
  return new Promise(async (resolve, reject) => {
    const timer = setTimeout(() => {
      if (_pending?.resolve !== resolve) return;
      _pending = null;
      reject(new Error(t('err_timeout')));
    }, timeoutMs);
    _pending = { resolve, reject, accept, timer, command };
    try { await send(command); }
    catch (error) {
      if (_pending?.resolve === resolve) _pending = null;
      clearTimeout(timer);
      reject(error);
    }
  });
}

function handleLine(line) {
  const clean = String(line ?? '').trim();
  if (!clean) return;
  if (_pending) {
    let accepted = false;
    try { accepted = _pending.accept(clean); } catch (_) {}
    if (accepted) {
      const p = _pending;
      _pending = null;
      clearTimeout(p.timer);
      p.resolve(clean);
      return;
    }
  }
  app.log(`[2400 RX] ${clean}`);
}

function setStatus(text, cls = 'ready') {
  const el = $('k2400RunStatus');
  if (el) { el.textContent = text; el.className = `k2400-run-status ${cls}`; }
  const live = $('liveStatus');
  if (live) { live.textContent = text; live.className = `disp-status ${cls === 'fault' ? 'err' : cls === 'running' ? 'active' : 'ready'}`; }
}

function updateControlState() {
  const connected = Boolean(app.serial?.isConnected && S?.ready);
  const running = Boolean(S?.running);
  ['k2400Start','k2400SourceV','k2400SourceI','k2400Sense2','k2400Sense4','k2400TestMode',
   'k2400SourceValue','k2400Compliance','k2400Nplc','k2400Settle','k2400Interval',
   'k2400Duration','k2400Repeat','k2400SweepStart','k2400SweepStop','k2400SweepPoints',
   'k2400CycleLoops','k2400CycleInterval','k2400CycleSource','k2400CycleCompliance',
   'k2400CycleDuration','k2400CycleAdd']
    .forEach(id => { const el = $(id); if (el) el.disabled = running || Boolean(S?.busy) || (id === 'k2400Start' && !connected); });
  document.querySelectorAll('.k2400-cycle-editable').forEach(el => { el.disabled = running; });
  const stop = $('k2400Stop');
  if (stop) stop.disabled = !app.serial?.isConnected;
}

function updateOutputUI() {
  const badge = $('k2400OutputBadge');
  if (badge) {
    const state = S?.outputActive ? 'on' : S?.outputKnown ? 'off' : 'unknown';
    badge.textContent = state === 'on' ? 'OUTPUT ON' : state === 'off' ? 'OUTPUT OFF' : 'OUTPUT ?';
    badge.className = `k2400-output-badge ${state}`;
  }
}

function updateTimer() {
  if (!S?.running) return;
  const sec = Math.max(0, (Date.now() - S.startedAt) / 1000);
  const el = $('k2400Elapsed');
  if (el) el.textContent = `${sec.toFixed(1)} s`;
}

function setRunning(running) {
  S.running = running;
  clearInterval(S.timer);
  S.timer = running ? setInterval(updateTimer, 100) : null;
  updateControlState();
}

function modeUnit(mode = S.settings.sourceMode) { return mode === 'VOLT' ? 'V' : 'A'; }
function complianceUnit(mode = S.settings.sourceMode) { return mode === 'VOLT' ? 'A' : 'V'; }

function formatResistanceReference(value) {
  const n = Math.abs(Number(value));
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e9) return `${fmt(n / 1e9)} GΩ`;
  if (n >= 1e6) return `${fmt(n / 1e6)} MΩ`;
  if (n >= 1e3) return `${fmt(n / 1e3)} kΩ`;
  if (n >= 1) return `${fmt(n)} Ω`;
  return `${fmt(n * 1e3)} mΩ`;
}

function updateVoltageCurrentGuide(voltage, current) {
  const lowRow = $('k2400LimitLowRow');
  const highRow = $('k2400LimitHighRow');
  const state = $('k2400LimitState');
  if (!lowRow || !highRow || !state) return;
  const highVoltage = voltage > HIGH_CURRENT_V_BOUNDARY;
  lowRow.classList.toggle('active', !highVoltage);
  highRow.classList.toggle('active', highVoltage);
  const maxCurrent = maximumComplianceForSource('VOLT', voltage);
  if (!Number.isFinite(maxCurrent)) { state.textContent = ''; state.className = 'k2400-limit-state'; return; }
  const over = current > maxCurrent + 1e-12;
  state.textContent = t(over ? 'limit_guide_over' : 'limit_guide_ok').replace('{current}', fmt(maxCurrent));
  state.className = `k2400-limit-state${over ? ' over' : ''}`;
}

function updateResistanceReference() {
  const panel = $('k2400ResistanceRef');
  const titleEl = panel?.querySelector('.k2400-resistance-ref-title');
  const valueEl = $('k2400ResistanceRefValue');
  const detailEl = $('k2400ResistanceRefDetail');
  if (!panel || !titleEl || !valueEl || !detailEl || !S) return;
  panel.hidden = false;
  const currentMode = S.settings.sourceMode === 'CURR';
  const current = Math.abs(finiteNumber(currentMode ? S.settings.sourceValue : S.settings.compliance));
  const voltage = Math.abs(finiteNumber(currentMode ? S.settings.compliance : S.settings.sourceValue));
  const resistance = currentMode
    ? currentSourceResistanceReference(current, voltage)
    : voltageSourceResistanceReference(voltage, current);
  titleEl.textContent = t(currentMode ? 'ref_r_title' : 'ref_v_title');
  if (resistance === null) {
    valueEl.textContent = t(currentMode ? 'ref_r_zero' : 'ref_v_zero');
    detailEl.textContent = '';
  } else {
    valueEl.textContent = t(currentMode ? 'ref_r_value' : 'ref_v_value').replace('{value}', formatResistanceReference(resistance));
    detailEl.textContent = t(currentMode ? 'ref_r_formula' : 'ref_v_formula');
  }
  updateVoltageCurrentGuide(voltage, current);
}

function updateOvpReference() {
  const panel = $('k2400OvpRef');
  const deviceEl = $('k2400OvpDevice');
  if (!panel || !deviceEl || !S) return;
  panel.hidden = S.settings.sourceMode !== 'VOLT';
  if (panel.hidden) return;
  const plan = automaticOvpPlan(voltageHazardSummary(S.settings).maxVoltage);
  const deviceText = plan.instrumentCommand === 'NONE' ? '210 V (full range)' : `${plan.instrumentCutoff} V`;
  deviceEl.textContent = t('ovp_auto_device').replace('{voltage}', deviceText);
}

function updateHazardNotice() {
  const panel = $('k2400HazardNotice');
  if (!panel || !S) return;
  const summary = voltageHazardSummary(S.settings);
  panel.hidden = !summary.hazardous;
  if (!summary.hazardous) { panel.innerHTML = ''; return; }
  const sourceV = S.settings.sourceMode === 'VOLT';
  const ovpPlan = sourceV ? automaticOvpPlan(summary.maxVoltage) : null;
  const deviceOvp = ovpPlan?.instrumentCommand === 'NONE' ? '210 V (full range)' : `${ovpPlan?.instrumentCutoff} V`;
  const protectionLine = t(sourceV ? 'hv_setting_source_v' : 'hv_setting_source_i')
    .replace('{compliance}', fmt(summary.maxCompliance))
    .replace('{deviceOvp}', deviceOvp);
  panel.innerHTML = `<strong>${escapeHTML(t('hv_setting_title').replace('{voltage}', fmt(summary.maxVoltage)))}</strong>
    <div>${escapeHTML(protectionLine)}</div>
    <ul><li>${escapeHTML(t('hv_setting_touch'))}</li><li>${escapeHTML(t('hv_setting_fixture'))}</li><li>${escapeHTML(t('hv_setting_off'))}</li><li>${escapeHTML(t('hv_setting_limit'))}</li></ul>`;
}

function syncSettingsFromUI() {
  if (!S) return;
  const read = (id, fallback) => $(id) ? finiteNumber($(id).value) : fallback;
  S.settings = {
    ...S.settings,
    sourceValue: read('k2400SourceValue', S.settings.sourceValue),
    compliance: read('k2400Compliance', S.settings.compliance),
    nplc: read('k2400Nplc', S.settings.nplc),
    settle: read('k2400Settle', S.settings.settle),
    interval: read('k2400Interval', S.settings.interval),
    duration: read('k2400Duration', S.settings.duration),
    repeat: read('k2400Repeat', S.settings.repeat),
    sweepStart: read('k2400SweepStart', S.settings.sweepStart),
    sweepStop: read('k2400SweepStop', S.settings.sweepStop),
    sweepPoints: read('k2400SweepPoints', S.settings.sweepPoints),
    cycleLoops: read('k2400CycleLoops', S.settings.cycleLoops),
    cycleInterval: read('k2400CycleInterval', S.settings.cycleInterval),
    sample: $('k2400Sample')?.value ?? S.settings.sample,
    testMode: $('k2400TestMode')?.value ?? S.settings.testMode,
  };
  saveSettings();
  updateSettingLabels();
}

function updateSettingLabels() {
  if (!S) return;
  const srcUnit = modeUnit();
  const compUnit = complianceUnit();
  const srcLbl = $('k2400SourceLabel');
  const compLbl = $('k2400ComplianceLabel');
  if (srcLbl) srcLbl.textContent = `${t('source_value')} (${srcUnit})`;
  if (compLbl) compLbl.textContent = `${S.settings.sourceMode === 'VOLT' ? t('compliance_i') : t('compliance_v')} (${compUnit})`;
  updateResistanceReference();
  updateOvpReference();
  ['k2400SweepStartLabel','k2400SweepStopLabel'].forEach((id, i) => {
    const el = $(id); if (el) el.textContent = `${i ? t('sweep_stop') : t('sweep_start')} (${srcUnit})`;
  });
  const mode = $('k2400TestMode')?.value ?? S.settings.testMode;
  const spot = $('k2400SpotFields');
  const time = $('k2400TimeFields');
  const sweep = $('k2400SweepFields');
  const cycle = $('k2400CyclePanel');
  if (spot) spot.hidden = mode !== 'spot';
  if (time) time.hidden = mode !== 'time';
  if (sweep) sweep.hidden = mode !== 'sweep';
  if (cycle) cycle.hidden = mode !== 'cycle';
  renderCycleSteps();
  applySpecInputLimits();
  validateInputs();
}

function validateInputs() {
  if (!S) return false;
  const isCycle = S.settings.testMode === 'cycle';
  const result = isCycle ? { errors: [] } : validateSafetyConfig(S.settings);
  const extra = [];
  if (!NPLC_VALUES.has(Number(S.settings.nplc))) extra.push('측정 속도 값이 올바르지 않습니다.');
  if (!(S.settings.settle >= 0 && S.settings.settle <= 60)) extra.push('안정화 시간은 0~60초입니다.');
  if (S.settings.testMode === 'time') {
    if (!(S.settings.interval >= 0.2 && S.settings.interval <= 3600)) extra.push('기록 간격은 0.2~3600초입니다.');
    if (!(S.settings.duration >= S.settings.interval && S.settings.duration <= 86400)) extra.push('총 시간은 기록 간격 이상, 86400초 이하여야 합니다.');
  }
  if (S.settings.testMode === 'spot' && !(Number.isInteger(S.settings.repeat) && S.settings.repeat >= 1 && S.settings.repeat <= 1000)) extra.push('반복 횟수는 1~1000의 정수입니다.');
  if (S.settings.testMode === 'sweep') {
    if (!(Number.isInteger(S.settings.sweepPoints) && S.settings.sweepPoints >= 2 && S.settings.sweepPoints <= 1000)) extra.push('Sweep 포인트 수는 2~1000의 정수입니다.');
    for (const level of [S.settings.sweepStart, S.settings.sweepStop]) {
      const check = validateSafetyConfig({ ...S.settings, sourceValue: level });
      extra.push(...check.errors.map(e => `Sweep: ${e}`));
    }
  }
  if (isCycle) extra.push(...validateCycleConfig(S.settings).errors);
  const errors = [...result.errors, ...extra];
  updateHazardNotice();
  const warn = $('k2400Validation');
  if (warn) {
    warn.hidden = errors.length === 0;
    warn.textContent = errors.join('\n');
    warn.className = 'k2400-validation bad';
  }
  const start = $('k2400Start');
  if (start) start.disabled = errors.length > 0 || !S.ready || S.running;
  return errors.length === 0;
}

function setNumberBounds(id, min, max) {
  const el = $(id);
  if (!el) return;
  if (Number.isFinite(min)) el.min = String(min);
  if (Number.isFinite(max)) el.max = String(max);
}

function applySpecInputLimits() {
  if (!S) return;
  const mode = S.settings.sourceMode;
  const sourceMax = absoluteSourceLimit(mode);
  const complianceMin = minimumCompliance(mode);
  const complianceMax = maximumComplianceForSource(mode, S.settings.sourceValue);
  setNumberBounds('k2400SourceValue', -sourceMax, sourceMax);
  setNumberBounds('k2400Compliance', complianceMin, complianceMax);

  const sweepMax = maximumSourceForCompliance(mode, S.settings.compliance);
  ['k2400SweepStart','k2400SweepStop'].forEach(id => setNumberBounds(id, -sweepMax, sweepMax));

  const draftSource = finiteNumber($('k2400CycleSource')?.value);
  const draftCompliance = finiteNumber($('k2400CycleCompliance')?.value);
  setNumberBounds('k2400CycleSource', -maximumSourceForCompliance(mode, draftCompliance), maximumSourceForCompliance(mode, draftCompliance));
  setNumberBounds('k2400CycleCompliance', complianceMin, maximumComplianceForSource(mode, draftSource));
}

function showSpecMessages(messages) {
  if (!messages.length) { if (S) S.lastSpecWarningSignature = ''; return; }
  const signature = messages.join('|');
  if (S?.lastSpecWarningSignature === signature) return;
  if (S) S.lastSpecWarningSignature = signature;
  showWarning(`${t('spec_summary')}\n\n${messages.join('\n')}`, t('spec_exceeded'));
}

function safetyAdjustmentMessages(details) {
  const messages = [];
  if (details.sourceChanged) {
    const key = details.sourceMode === 'VOLT' ? 'spec_adjust_source_v' : 'spec_adjust_source_i';
    messages.push(t(key).replace('{input}', fmt(details.rawSource)).replace('{adjusted}', fmt(details.sourceValue)));
  }
  if (details.complianceChanged) {
    const key = details.sourceMode === 'VOLT' ? 'spec_adjust_compliance_i' : 'spec_adjust_compliance_v';
    messages.push(t(key).replace('{input}', fmt(details.rawCompliance)).replace('{adjusted}', fmt(details.compliance)));
  }
  return messages;
}

function previewPrimaryOrSweepSpecWarning() {
  if (!S || S.running) return;
  const activeId = document.activeElement?.id || '';
  if (activeId === 'k2400SourceValue' || activeId === 'k2400Compliance') {
    const raw = {
      sourceMode: S.settings.sourceMode,
      sourceValue: $('k2400SourceValue')?.value,
      compliance: $('k2400Compliance')?.value,
    };
    showSpecMessages(safetyAdjustmentMessages(safetyAdjustmentDetails(raw)));
    return;
  }
  if (activeId === 'k2400SweepStart' || activeId === 'k2400SweepStop') {
    const input = $(activeId);
    const raw = finiteNumber(input?.value);
    const adjusted = clampSourceForCompliance(S.settings.sourceMode, raw, S.settings.compliance);
    const key = activeId === 'k2400SweepStart' ? 'spec_adjust_sweep_start' : 'spec_adjust_sweep_stop';
    const messages = Number.isFinite(raw) && Number.isFinite(adjusted) && Math.abs(raw - adjusted) > 1e-12
      ? [t(key).replace('{input}', fmt(raw)).replace('{adjusted}', fmt(adjusted))]
      : [];
    showSpecMessages(messages);
  }
}

function previewCycleDraftSpecWarning() {
  if (!S || S.running) return;
  const raw = { sourceMode: S.settings.sourceMode, sourceValue: $('k2400CycleSource')?.value, compliance: $('k2400CycleCompliance')?.value };
  showSpecMessages(safetyAdjustmentMessages(safetyAdjustmentDetails(raw)));
}

function previewCycleStepSpecWarning(index, field, value) {
  if (!S || S.running || !S.settings.cycleSteps[index] || !['source','compliance'].includes(field)) return;
  const next = { ...S.settings.cycleSteps[index], [field]: finiteNumber(value) };
  const raw = { sourceMode: S.settings.sourceMode, sourceValue: next.source, compliance: next.compliance };
  showSpecMessages(safetyAdjustmentMessages(safetyAdjustmentDetails(raw)));
}

function enforcePrimaryLimits() {
  if (!S || S.running) return;
  const sourceEl = $('k2400SourceValue');
  const complianceEl = $('k2400Compliance');
  const raw = { sourceMode: S.settings.sourceMode, sourceValue: sourceEl?.value, compliance: complianceEl?.value };
  syncSettingsFromUI();
  const safe = clampSafetyConfig(raw);
  if (!Number.isFinite(safe.sourceValue) || !Number.isFinite(safe.compliance)) return;
  const adjustment = safetyAdjustmentDetails(raw, safe);
  S.settings.sourceValue = safe.sourceValue;
  S.settings.compliance = safe.compliance;
  S.settings.sweepStart = clampSourceForCompliance(S.settings.sourceMode, S.settings.sweepStart, safe.compliance);
  S.settings.sweepStop = clampSourceForCompliance(S.settings.sourceMode, S.settings.sweepStop, safe.compliance);
  if (sourceEl) sourceEl.value = String(safe.sourceValue);
  if (complianceEl) complianceEl.value = String(safe.compliance);
  const sweepStartEl = $('k2400SweepStart'); if (sweepStartEl && Number.isFinite(S.settings.sweepStart)) sweepStartEl.value = String(S.settings.sweepStart);
  const sweepStopEl = $('k2400SweepStop'); if (sweepStopEl && Number.isFinite(S.settings.sweepStop)) sweepStopEl.value = String(S.settings.sweepStop);
  saveSettings(); updateSettingLabels();
  showSpecMessages(safetyAdjustmentMessages(adjustment));
}

function enforceSweepLimits() {
  if (!S || S.running) return;
  const startEl = $('k2400SweepStart');
  const stopEl = $('k2400SweepStop');
  const rawStart = finiteNumber(startEl?.value);
  const rawStop = finiteNumber(stopEl?.value);
  syncSettingsFromUI();
  const start = clampSourceForCompliance(S.settings.sourceMode, rawStart, S.settings.compliance);
  const stop = clampSourceForCompliance(S.settings.sourceMode, rawStop, S.settings.compliance);
  if (Number.isFinite(start)) S.settings.sweepStart = start;
  if (Number.isFinite(stop)) S.settings.sweepStop = stop;
  if (startEl && Number.isFinite(start)) startEl.value = String(start);
  if (stopEl && Number.isFinite(stop)) stopEl.value = String(stop);
  saveSettings(); updateSettingLabels();
  const messages = [];
  if (Number.isFinite(rawStart) && Number.isFinite(start) && Math.abs(rawStart - start) > 1e-12) messages.push(t('spec_adjust_sweep_start').replace('{input}', fmt(rawStart)).replace('{adjusted}', fmt(start)));
  if (Number.isFinite(rawStop) && Number.isFinite(stop) && Math.abs(rawStop - stop) > 1e-12) messages.push(t('spec_adjust_sweep_stop').replace('{input}', fmt(rawStop)).replace('{adjusted}', fmt(stop)));
  showSpecMessages(messages);
}

function enforceCycleDraftLimits() {
  if (!S || S.running) return null;
  const sourceEl = $('k2400CycleSource');
  const complianceEl = $('k2400CycleCompliance');
  const raw = {
    sourceMode: S.settings.sourceMode,
    sourceValue: sourceEl?.value,
    compliance: complianceEl?.value,
  };
  const safe = clampSafetyConfig(raw);
  if (!Number.isFinite(safe.sourceValue) || !Number.isFinite(safe.compliance)) return null;
  const adjustment = safetyAdjustmentDetails(raw, safe);
  if (sourceEl) sourceEl.value = String(safe.sourceValue);
  if (complianceEl) complianceEl.value = String(safe.compliance);
  applySpecInputLimits();
  showSpecMessages(safetyAdjustmentMessages(adjustment));
  return safe;
}

function enforceGeneralLimits() {
  if (!S || S.running) return;
  syncSettingsFromUI();
  S.settings.settle = clampFinite(S.settings.settle, 0, 60, 0.2);
  S.settings.interval = clampFinite(S.settings.interval, 0.2, 3600, 1);
  S.settings.duration = clampFinite(S.settings.duration, S.settings.interval, 86400, S.settings.interval);
  S.settings.repeat = Math.round(clampFinite(S.settings.repeat, 1, 1000, 1));
  S.settings.sweepPoints = Math.round(clampFinite(S.settings.sweepPoints, 2, 1000, 11));
  const values = {
    k2400Settle: S.settings.settle,
    k2400Interval: S.settings.interval,
    k2400Duration: S.settings.duration,
    k2400Repeat: S.settings.repeat,
    k2400SweepPoints: S.settings.sweepPoints,
  };
  Object.entries(values).forEach(([id, value]) => { const el = $(id); if (el) el.value = String(value); });
  saveSettings(); updateSettingLabels();
}

function formatCycleDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  if (total >= 3600) return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m ${Math.round(total % 60)}s`;
  if (total >= 60) return `${Math.floor(total / 60)}m ${Math.round(total % 60)}s`;
  return `${Number.isInteger(total) ? total : total.toFixed(1)}s`;
}

function cycleEditorChanged() {
  if (!S || S.running) return;
  syncSettingsFromUI();
  S.settings.cycleLoops = Math.round(clampFinite(S.settings.cycleLoops, 1, 1000, 1));
  S.settings.cycleInterval = clampFinite(S.settings.cycleInterval, 0.2, 3600, 1);
  const loops = $('k2400CycleLoops'); if (loops) loops.value = String(S.settings.cycleLoops);
  const interval = $('k2400CycleInterval'); if (interval) interval.value = String(S.settings.cycleInterval);
  saveSettings();
  renderCycleSteps();
  validateInputs();
}

function addCycleStep() {
  if (!S || S.running) return;
  syncSettingsFromUI();
  const safe = enforceCycleDraftLimits();
  if (!safe) { showWarning('인가값과 Compliance를 숫자로 입력하세요.'); return; }
  const source = safe.sourceValue;
  const compliance = safe.compliance;
  const duration = finiteNumber($('k2400CycleDuration')?.value);
  const step = { source, compliance, duration };
  const check = validateCycleConfig({ ...S.settings, cycleSteps: [step], cycleLoops: 1, cycleInterval: 1 });
  if (!check.ok) { showWarning(check.errors.join('\n')); return; }
  S.settings.cycleSteps.push(step);
  saveSettings();
  renderCycleSteps();
  validateInputs();
}

function editCycleStep(index, field, value) {
  if (!S || S.running || !S.settings.cycleSteps[index]) return;
  const next = { ...S.settings.cycleSteps[index], [field]: finiteNumber(value) };
  if (!Number.isFinite(next[field])) { renderCycleSteps(); return; }
  if (field === 'duration') next.duration = Math.min(86400, Math.max(0.2, next.duration));
  const raw = { sourceMode: S.settings.sourceMode, sourceValue: next.source, compliance: next.compliance };
  const safe = clampSafetyConfig(raw);
  const adjustment = safetyAdjustmentDetails(raw, safe);
  next.source = safe.sourceValue;
  next.compliance = safe.compliance;
  S.settings.cycleSteps[index] = next;
  saveSettings();
  renderCycleSteps();
  validateInputs();
  showSpecMessages(safetyAdjustmentMessages(adjustment));
}

function deleteCycleStep(index) {
  if (!S || S.running) return;
  S.settings.cycleSteps.splice(index, 1);
  saveSettings();
  renderCycleSteps();
  validateInputs();
}

function renderCycleSteps() {
  if (!S) return;
  const body = $('k2400CycleTbody');
  const sourceLabel = $('k2400CycleSourceLabel');
  const complianceLabel = $('k2400CycleComplianceLabel');
  const srcUnit = modeUnit();
  const compUnit = complianceUnit();
  if (sourceLabel) sourceLabel.textContent = `${t('cycle_step_source')} (${srcUnit})`;
  if (complianceLabel) complianceLabel.textContent = `${t('cycle_step_compliance')} (${compUnit})`;
  if (body) {
    body.innerHTML = S.settings.cycleSteps.length ? S.settings.cycleSteps.map((step, index) => {
      const sourceMax = maximumSourceForCompliance(S.settings.sourceMode, step.compliance);
      const complianceMax = maximumComplianceForSource(S.settings.sourceMode, step.source);
      return `
      <tr>
        <td>${index + 1}</td>
        <td><input class="inp k2400-cycle-step-input k2400-cycle-editable" type="number" min="${-sourceMax}" max="${sourceMax}" step="any" value="${step.source}" oninput="app.instr.previewCycleStepSpecWarning(${index},'source',this.value)" onblur="app.instr.editCycleStep(${index},'source',this.value)"></td>
        <td><input class="inp k2400-cycle-step-input k2400-cycle-editable" type="number" min="${minimumCompliance(S.settings.sourceMode)}" max="${complianceMax}" step="any" value="${step.compliance}" oninput="app.instr.previewCycleStepSpecWarning(${index},'compliance',this.value)" onblur="app.instr.editCycleStep(${index},'compliance',this.value)"></td>
        <td><input class="inp k2400-cycle-step-input k2400-cycle-editable" type="number" min="0.2" max="86400" step="0.1" value="${step.duration}" onblur="app.instr.editCycleStep(${index},'duration',this.value)"></td>
        <td><button class="sbtn red-o k2400-cycle-editable" onclick="app.instr.deleteCycleStep(${index})">${t('cycle_delete')}</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="5" class="k2400-cycle-empty">${t('cycle_empty')}</td></tr>`;
  }
  const total = $('k2400CycleTotal');
  if (total) total.textContent = formatCycleDuration(validateCycleConfig(S.settings).totalDuration);
  updateControlState();
}

function chooseSourceMode(mode) {
  if (!S || S.running) return;
  syncSettingsFromUI();
  const nextMode = mode === 'CURR' ? 'CURR' : 'VOLT';
  if (nextMode !== S.settings.sourceMode) {
    S.settings.sourceMode = nextMode;
    S.settings.sourceValue = nextMode === 'VOLT' ? 1 : 0.001;
    S.settings.compliance = nextMode === 'VOLT' ? 0.01 : 20;
    // Cycle source/compliance units change with source mode. Never reinterpret
    // stored voltage steps as current steps (or the reverse).
    S.settings.cycleSteps = [];
  }
  const safe = clampSafetyConfig(S.settings);
  S.settings.sourceValue = safe.sourceValue;
  S.settings.compliance = safe.compliance;
  saveSettings();
  const src = $('k2400SourceValue'); if (src) src.value = S.settings.sourceValue;
  const comp = $('k2400Compliance'); if (comp) comp.value = S.settings.compliance;
  $('k2400SourceV')?.classList.toggle('active', S.settings.sourceMode === 'VOLT');
  $('k2400SourceI')?.classList.toggle('active', S.settings.sourceMode === 'CURR');
  updateSettingLabels();
}

async function chooseSense(wire) {
  if (!S || S.running || S.busy) return;
  const previous = S.settings.sense;
  S.settings.sense = Number(wire) === 2 ? 2 : 4;
  saveSettings();
  updateSenseButtons();
  if (!app.serial?.isConnected || !S.ready) return;
  try {
    S.busy = true;
    updateControlState();
    await send(':OUTP OFF');
    S.outputActive = false; S.outputKnown = false; updateOutputUI();
    await verifyOutput(false);
    await send(`:SYST:RSEN ${S.settings.sense === 4 ? 'ON' : 'OFF'}`);
    const answer = await query(':SYST:RSEN?', v => /^(?:0|1|ON|OFF)$/i.test(v));
    const actual = /^(?:1|ON)$/i.test(answer) ? 4 : 2;
    if (actual !== S.settings.sense) throw new Error(t('err_sense'));
    app.log(`[2400] Sense ${actual}-Wire`, 'ok');
  } catch (error) {
    S.settings.sense = previous;
    saveSettings(); updateSenseButtons();
    app.log(`[2400] ${error.message}`, 'err');
  } finally { S.busy = false; updateControlState(); }
}

function updateSenseButtons() {
  $('k2400Sense2')?.classList.toggle('active', S?.settings.sense === 2);
  $('k2400Sense4')?.classList.toggle('active', S?.settings.sense === 4);
}

function errorQueueAccept(value) { return /^[-+]?\d+\s*,/.test(value); }

function parseOutputState(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (/^(?:1|1\.0+|ON)$/.test(normalized)) return true;
  if (/^(?:0|0\.0+|OFF)$/.test(normalized)) return false;
  return null;
}

async function verifyOutput(expected, timeoutMs = 1500) {
  const raw = await query(':OUTP?', v => parseOutputState(v) !== null, timeoutMs);
  const actual = parseOutputState(raw);
  if (actual !== expected) throw new Error(`OUTPUT state mismatch: expected ${expected ? 'ON' : 'OFF'}, received ${raw}`);
  S.outputActive = actual;
  S.outputKnown = true;
  updateOutputUI();
}

async function checkErrorQueue() {
  const raw = await query(':SYST:ERR?', errorQueueAccept);
  const code = Number(raw.split(',')[0]);
  if (code !== 0) throw new Error(`SCPI ${raw}`);
}

async function onConnect() {
  if (!S) init();
  S.ready = false; S.stopRequested = false; S.runToken++;
  setStatus(t('configuring'));
  updateControlState();
  try {
    clearPending(new Error('Reconnect'));
    app.log('[2400 init] OUTPUT OFF command sending');
    await send(':OUTP OFF');
    S.outputActive = false; S.outputKnown = false; updateOutputUI();
    // The 2400 processes RS-232 commands after CR. Give an output relay/state
    // transition a brief, deterministic settle time before the verification query.
    await sleep(250);
    app.log('[2400 init] OUTPUT OFF state verification waiting');
    await verifyOutput(false, 4000);
    app.log('[2400 init] Identity verification waiting');
    const idn = await query('*IDN?', v => v.includes(','), 4000);
    if (!/KEITHLEY/i.test(idn) || !/(?:MODEL\s*)?2400/i.test(idn)) throw new Error(t('err_idn'));
    S.idn = idn;
    await send('*CLS');
    await send(`:SYST:RSEN ${S.settings.sense === 4 ? 'ON' : 'OFF'}`);
    app.log('[2400 init] Sense wiring verification waiting');
    const sense = await query(':SYST:RSEN?', v => /^(?:0|1|ON|OFF)$/i.test(v));
    const actualSense = /^(?:1|ON)$/i.test(sense) ? 4 : 2;
    if (actualSense !== S.settings.sense) throw new Error(t('err_sense'));
    await send(':FORM:ELEM VOLT,CURR,TIME,STAT');
    app.log('[2400 init] Error queue verification waiting');
    await checkErrorQueue();
    S.ready = true;
    setStatus(t('ready'));
    app.log(`[2400] ${t('connected')}: ${idn}`, 'ok');
  } catch (error) {
    app.log(`[2400] ${t('err_connect')} ${error.message}`, 'err');
    try { await send(':OUTP OFF'); } catch (_) {}
    S.ready = false;
    setStatus(t('fault'), 'fault');
    throw error;
  } finally {
    S.busy = false;
    updateControlState();
  }
}

async function onDisconnect() {
  if (!S) return;
  S.stopRequested = true; S.runToken++;
  clearInterval(S.timer); S.timer = null;
  S.outputActive = false; S.outputKnown = false; S.running = false; S.ready = false; S.busy = false;
  clearPending(new Error('STOP'));
  updateOutputUI(); updateControlState();
  try { if (app.serial?.isConnected) await send(':OUTP OFF'); } catch (_) {}
  await saveRowsNow();
  S.resizeObserver?.disconnect(); S.resizeObserver = null;
}

function currentConfig() {
  syncSettingsFromUI();
  if (!validateInputs()) throw new Error($('k2400Validation')?.textContent || t('invalid'));
  return { ...S.settings, cycleSteps: S.settings.cycleSteps.map(step => ({ ...step })) };
}

async function applyConfiguration(cfg, sourceSpan) {
  const maxSource = Math.max(Math.abs(cfg.sourceValue), ...(sourceSpan || []).map(Math.abs));
  await send(':OUTP OFF');
  S.outputActive = false; S.outputKnown = false; updateOutputUI();
  await verifyOutput(false);
  // SENS:FUNC adds functions when concurrent mode is enabled. Clear a
  // previously enabled RES function (auto-ohms can control the source), then
  // explicitly enable both V and I readback. FORM:ELEM alone only selects
  // returned columns; it does not enable the corresponding measurements.
  await send(':SENS:FUNC:OFF:ALL');
  await send(':SENS:FUNC:CONC ON');
  await send(`:SOUR:FUNC ${cfg.sourceMode}`);
  await send(`:SOUR:${cfg.sourceMode}:MODE FIX`);
  await send(`:SOUR:${cfg.sourceMode}:RANG ${sourceRange(cfg.sourceMode, maxSource)}`);
  await send(`:SOUR:${cfg.sourceMode}:LEV ${cfg.sourceValue}`);
  if (cfg.sourceMode === 'VOLT') {
    await send(':SENS:CURR:RANG:AUTO ON');
    await send(`:SENS:CURR:PROT ${cfg.compliance}`);
    await send(`:SOUR:VOLT:PROT ${automaticOvpPlan(maxSource).instrumentCommand}`);
  } else {
    await send(':SENS:VOLT:RANG:AUTO ON');
    await send(`:SENS:VOLT:PROT ${cfg.compliance}`);
  }
  await send(':SENS:FUNC "VOLT","CURR"');
  await send(`:SENS:VOLT:NPLC ${cfg.nplc}`);
  await send(`:SENS:CURR:NPLC ${cfg.nplc}`);
  await send(`:SYST:RSEN ${cfg.sense === 4 ? 'ON' : 'OFF'}`);
  const sense = await query(':SYST:RSEN?', v => /^(?:0|1|ON|OFF)$/i.test(v));
  if ((/^(?:1|ON)$/i.test(sense) ? 4 : 2) !== cfg.sense) throw new Error(t('err_sense'));
  const functions = await query(':SENS:FUNC?', v => /VOLT|CURR|RES/i.test(v));
  const enabled = functions.toUpperCase().replace(/["'\s]/g, '').split(',').map(v => v.replace(/:DC$/, ''));
  if (enabled.length !== 2 || !enabled.includes('VOLT') || !enabled.includes('CURR')) {
    throw new Error(t('err_measure_config'));
  }
  // Keep continuous DC between host-scheduled samples; an inherited auto-off
  // setting otherwise pulses the DUT on every READ?. All stop paths still OFF.
  await send(':SOUR:CLE:AUTO OFF');
  const autoOff = await query(':SOUR:CLE:AUTO?', v => parseOutputState(v) !== null);
  if (parseOutputState(autoOff) !== false) throw new Error(t('err_measure_config'));
  await send(':ARM:SOUR IMM');
  await send(':ARM:COUN 1');
  await send(':TRIG:SOUR IMM');
  await send(':TRIG:COUN 1');
  await send(':FORM:DATA ASC');
  await send(':FORM:ELEM VOLT,CURR,TIME,STAT');
  await checkErrorQueue();
  app.log(`[2400 setup] Sense ${cfg.sense}-Wire verified; measured V+I; NPLC ${cfg.nplc}; continuous DC; 1 reading/query`, 'ok');
}

function buildSweepLevels(cfg) {
  const count = Math.trunc(cfg.sweepPoints);
  return Array.from({ length: count }, (_, i) => cfg.sweepStart + (cfg.sweepStop - cfg.sweepStart) * i / (count - 1));
}

function startSafetyModal(cfg) {
  const cycleSteps = cfg.testMode === 'cycle' ? cfg.cycleSteps : [];
  const sourceLevels = cfg.testMode === 'sweep'
    ? [cfg.sweepStart, cfg.sweepStop]
    : cfg.testMode === 'cycle'
      ? cycleSteps.map(step => step.source)
      : [cfg.sourceValue];
  const checks = cfg.testMode === 'cycle'
    ? cycleSteps.map(step => validateSafetyConfig({ ...cfg, sourceValue: step.source, compliance: step.compliance }))
    : sourceLevels.map(sourceValue => validateSafetyConfig({ ...cfg, sourceValue }));
  const result = {
    maxVoltage: Math.max(...checks.map(v => v.maxVoltage)),
    maxCurrent: Math.max(...checks.map(v => v.maxCurrent)),
    maxPower: Math.max(...checks.map(v => v.maxPower)),
  };
  const highVoltage = result.maxVoltage >= HAZARDOUS_VOLTAGE_THRESHOLD;
  const ovpPlan = cfg.sourceMode === 'VOLT' ? automaticOvpPlan(result.maxVoltage) : null;
  const ovpDeviceText = ovpPlan?.instrumentCommand === 'NONE' ? '210 V (full range)' : `${ovpPlan?.instrumentCutoff} V`;
  const details = [
    `${cfg.sourceMode === 'VOLT' ? 'Source V' : 'Source I'}: ${cfg.testMode === 'sweep' ? `${fmt(cfg.sweepStart)} → ${fmt(cfg.sweepStop)}` : cfg.testMode === 'cycle' ? `${cycleSteps.length} ${t('cycle_step')}` : fmt(cfg.sourceValue)} ${cfg.testMode === 'cycle' ? '' : modeUnit(cfg.sourceMode)}`.trim(),
    cfg.testMode === 'cycle'
      ? `${t('cycle_loops')}: ${cfg.cycleLoops} · ${t('cycle_total')}: ${formatCycleDuration(validateCycleConfig(cfg).totalDuration)}`
      : `Compliance: ${fmt(cfg.compliance)} ${complianceUnit(cfg.sourceMode)}`,
    `Sense: ${cfg.sense}-Wire`,
    `Max potential power: ${fmt(result.maxPower)} W`,
    cfg.sourceMode === 'VOLT' ? t('ovp_auto_device').replace('{voltage}', ovpDeviceText) : null,
  ].filter(Boolean);
  const msg = $('k2400ConfirmMessage');
  if (msg) msg.innerHTML = `<div class="${highVoltage ? 'k2400-hv' : ''}">${highVoltage ? t('hv') : t('normal')}</div>
    <ul>${details.map(v => `<li>${escapeHTML(v)}</li>`).join('')}</ul>
    <div>${cfg.sense === 4 ? t('four_wire') : t('two_wire')}</div>`;
  const cb = $('k2400Acknowledge'); if (cb) cb.checked = false;
  const ok = $('k2400ConfirmOk'); if (ok) ok.disabled = true;
  const modal = $('k2400ConfirmModal'); if (modal) modal.style.display = 'flex';
  return new Promise(resolve => { S.confirmResolve = resolve; });
}

function toggleConfirmReady(checked) {
  const ok = $('k2400ConfirmOk'); if (ok) ok.disabled = !checked;
}

function closeConfirmModal(accepted) {
  const modal = $('k2400ConfirmModal'); if (modal) modal.style.display = 'none';
  const resolve = S?.confirmResolve; if (S) S.confirmResolve = null;
  resolve?.(Boolean(accepted));
}

async function requestStart() {
  if (!S?.ready || S.running || S.busy) return;
  let cfg;
  try { cfg = currentConfig(); }
  catch (error) { showWarning(error.message); return; }
  if (!(await startSafetyModal(cfg))) return;
  try {
    await runEvaluation(cfg);
  } catch (error) {
    app.log(`[2400] ${error.message}`, 'err');
    await safeOff(t('fault'), 'fault');
    showWarning(error.message);
  }
}

async function safeOff(message = t('stopped'), cls = 'ready') {
  if (!S) return;
  S.stopRequested = true; S.runToken++;
  clearPending(new Error('STOP'));
  setStatus(t('stopping'));
  let verified = false;
  try {
    if (app.serial?.isConnected) {
      await send(':OUTP OFF');
      S.outputActive = false; S.outputKnown = false; updateOutputUI();
      await verifyOutput(false, 1500);
      verified = true;
    }
  } catch (error) { app.log(`[2400] OUTPUT OFF verification failed: ${error.message}`, 'err'); }
  S.outputActive = false; S.outputKnown = verified;
  setRunning(false);
  updateOutputUI();
  const finalMessage = verified ? message : `${message} (OUTPUT OFF 미확인)`;
  setStatus(finalMessage, verified ? cls : 'fault');
  app.log(`[2400] ${finalMessage}`, (verified ? cls : 'fault') === 'fault' ? 'err' : 'ok');
}

async function emergencyOff() { await safeOff(t('stopped')); }

async function readOne(cfg, token, stepIndex = null, sourceSetpoint = null, cycleLoop = null) {
  if (token !== S.runToken || S.stopRequested) throw new Error('STOP');
  const raw = await query(':READ?', value => Boolean(parseReading(value)), Math.max(4000, cfg.nplc * 1000 + 2000));
  if (token !== S.runToken || S.stopRequested) throw new Error('STOP');
  const reading = parseReading(raw);
  if (!reading) throw new Error(`Invalid READ? response: ${raw}`);
  app.log(`[2400 READ] ${raw}`);
  addReading(reading, cfg, stepIndex, sourceSetpoint, cycleLoop);
  if (cfg.sourceMode === 'VOLT') {
    const source = Number.isFinite(finiteNumber(sourceSetpoint)) ? sourceSetpoint : cfg.sourceValue;
    const ovpPlan = automaticOvpPlan(source);
    if (reading.ovp) {
      const message = t('ovp_trip')
        .replace('{measured}', fmt(Math.abs(reading.voltage)))
        .replace('{limit}', fmt(ovpPlan.instrumentCutoff));
      await safeOff(message, 'fault');
      showWarning(message, t('ovp_auto_title'));
      throw new Error('OVP');
    }
  }
  if (reading.compliance) {
    await safeOff(t('compliance'), 'fault');
    showWarning(t('compliance'));
    throw new Error('COMPLIANCE');
  }
  return reading;
}

async function runEvaluation(cfg) {
  S.busy = true; S.stopRequested = false;
  const token = ++S.runToken;
  S.startedAt = Date.now();
  S.activeRunId = `${Date.now()}-${Math.random()}`;
  S.activeSample = cfg.sample || `Sample ${S.rows.length + 1}`;
  const elapsed = $('k2400Elapsed'); if (elapsed) elapsed.textContent = '0.0 s';
  setRunning(true); setStatus(t('configuring'));
  const levels = cfg.testMode === 'sweep'
    ? buildSweepLevels(cfg)
    : cfg.testMode === 'cycle'
      ? cfg.cycleSteps.map(step => step.source)
      : [cfg.sourceValue];
  try {
    const safetyEntries = cfg.testMode === 'cycle'
      ? cfg.cycleSteps.map(step => ({ sourceValue: step.source, compliance: step.compliance }))
      : levels.map(sourceValue => ({ sourceValue, compliance: cfg.compliance }));
    for (const entry of safetyEntries) {
      const check = validateSafetyConfig({ ...cfg, ...entry });
      if (!check.ok) throw new Error(check.errors.join('\n'));
    }
    if (cfg.testMode === 'cycle') {
      const cycleCheck = validateCycleConfig(cfg);
      if (!cycleCheck.ok) throw new Error(cycleCheck.errors.join('\n'));
    }
    const initialCfg = cfg.testMode === 'sweep'
      ? { ...cfg, sourceValue: levels[0] }
      : cfg.testMode === 'cycle'
        ? { ...cfg, sourceValue: cfg.cycleSteps[0].source, compliance: cfg.cycleSteps[0].compliance }
        : cfg;
    await applyConfiguration(initialCfg, levels);
    if (token !== S.runToken || S.stopRequested) return;
    await send(':OUTP ON');
    S.outputActive = false; S.outputKnown = false; updateOutputUI();
    await verifyOutput(true);
    setStatus(t('measuring'), 'running');

    if (cfg.testMode === 'spot') {
      await sleep(cfg.settle * 1000);
      for (let i = 0; i < cfg.repeat; i++) {
        await readOne(cfg, token, i + 1, cfg.sourceValue);
        if (i + 1 < cfg.repeat) await sleep(Math.max(200, cfg.interval * 1000));
      }
    } else if (cfg.testMode === 'time') {
      await sleep(cfg.settle * 1000);
      const endAt = Date.now() + cfg.duration * 1000;
      while (Date.now() <= endAt && token === S.runToken && !S.stopRequested) {
        const cycleAt = Date.now();
        await readOne(cfg, token, null, cfg.sourceValue);
        const wait = Math.max(0, cfg.interval * 1000 - (Date.now() - cycleAt));
        if (wait) await sleep(wait);
      }
    } else if (cfg.testMode === 'sweep') {
      for (let i = 0; i < levels.length; i++) {
        if (token !== S.runToken || S.stopRequested) break;
        const level = levels[i];
        await send(`:SOUR:${cfg.sourceMode}:LEV ${level}`);
        await sleep(cfg.settle * 1000);
        await readOne(cfg, token, i + 1, level);
      }
    } else {
      const measureFunction = cfg.sourceMode === 'VOLT' ? 'CURR' : 'VOLT';
      for (let loop = 1; loop <= cfg.cycleLoops; loop++) {
        for (let i = 0; i < cfg.cycleSteps.length; i++) {
          if (token !== S.runToken || S.stopRequested) break;
          const step = cfg.cycleSteps[i];
          const cycleStatus = t('cycle_running')
            .replace('{loop}', loop).replace('{loops}', cfg.cycleLoops)
            .replace('{step}', i + 1).replace('{steps}', cfg.cycleSteps.length);
          setStatus(cycleStatus, 'running');
          // Keep OUTPUT enabled across steps but force the source to zero before
          // changing compliance, preventing an uncontrolled transition.
          await send(`:SOUR:${cfg.sourceMode}:LEV 0`);
          await send(`:SENS:${measureFunction}:PROT ${step.compliance}`);
          await send(`:SOUR:${cfg.sourceMode}:LEV ${step.source}`);
           await checkErrorQueue();
           await sleep(cfg.settle * 1000);
           const stepCfg = { ...cfg, sourceValue: step.source, compliance: step.compliance };
           const stepStart = Date.now();
           const stepEnd = stepStart + step.duration * 1000;
           // Sample at 0, interval, 2*interval ... but never again exactly at
           // the step end. Precomputing this count avoids a millisecond-boundary
           // race that could otherwise add a duplicate final reading.
           const sampleCount = Math.max(1, Math.ceil(step.duration / cfg.cycleInterval));
           for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
             if (token !== S.runToken || S.stopRequested) break;
             if (sampleIndex > 0) {
               const wait = stepStart + sampleIndex * cfg.cycleInterval * 1000 - Date.now();
               if (wait > 0) await sleep(wait);
               if (Date.now() >= stepEnd) break;
             }
             await readOne(stepCfg, token, i + 1, step.source, loop);
           }
           const remaining = stepEnd - Date.now();
           if (remaining > 0 && token === S.runToken && !S.stopRequested) await sleep(remaining);
         }
        if (token !== S.runToken || S.stopRequested) break;
      }
    }
    if (token === S.runToken && !S.stopRequested) await safeOff(t('finished'));
  } catch (error) {
    if (!['STOP','COMPLIANCE','OVP'].includes(error.message)) throw error;
  } finally {
    S.busy = false;
    if (S.running) await safeOff(t('stopped'));
    await saveRowsNow();
    // safeOff updates controls while S.busy is still true. Refresh once more
    // after clearing busy so a completed run does not leave every setting
    // control permanently disabled.
    updateControlState();
  }
}

function addReading(reading, cfg, stepIndex, sourceSetpoint, cycleLoop = null) {
  const row = {
    id: Date.now() + Math.random(), checked: false,
    timestamp: new Date().toISOString(), elapsed: (Date.now() - S.startedAt) / 1000,
    sample: cfg.sample || S.activeSample || `Sample ${S.rows.length + 1}`, mode: cfg.testMode,
    sourceMode: cfg.sourceMode, sourceSetpoint, sense: cfg.sense, nplc: cfg.nplc,
    complianceLimit: cfg.compliance, stepIndex, cycleLoop, runId: S.activeRunId, ...reading,
  };
  S.rows.push(row); S.lastReading = row;
  app.count = S.rows.length; app._updateCount();
  updateLive(row); renderTable(); drawGraph();
  scheduleRowsSave();
}

function updateLive(row) {
  const fault = row.ovp || row.compliance;
  app._setDisplay(Number.isFinite(row.resistance) ? fmt(row.resistance) : t('overflow'), 'Ω', fault ? 'err' : 'active', row.ovp ? 'OVP' : row.compliance ? 'COMPLIANCE' : t('measuring'));
  const values = { k2400LiveV: `${fmt(row.voltage)} V`, k2400LiveI: `${formatCurrentMilliamps(row.current)} mA`, k2400LiveR: `${fmt(row.resistance)} Ω`, k2400LiveP: `${fmt(row.power)} W` };
  Object.entries(values).forEach(([id, value]) => { const el = $(id); if (el) el.textContent = value; });
}

function runKey(row, index = 0) {
  return String(row?.runId || `legacy-${row?.id ?? index}`);
}

function maximumAbsolute(rows, field) {
  const values = rows.map(row => Math.abs(finiteNumber(row?.[field]))).filter(Number.isFinite);
  return values.length ? Math.max(...values) : NaN;
}

export function graphRunColor(index = 0) {
  const normalized = Math.max(0, Math.trunc(Number(index) || 0));
  return GRAPH_RUN_COLORS[normalized % GRAPH_RUN_COLORS.length];
}

const GRAPH_METRIC_COLORS = { voltage: '#3fb6e8', current: '#f59e0b', resistance: '#22b06a' };

export function graphSeriesStyle(runIndex, metric, runCount = 2) {
  const dash = metric === 'current' ? [9, 5] : metric === 'resistance' ? [2, 4] : [];
  const color = runCount <= 1 ? (GRAPH_METRIC_COLORS[metric] || graphRunColor(runIndex)) : graphRunColor(runIndex);
  const lineWidth = metric === 'current' ? 3 : 2;
  return { color, dash, lineWidth };
}

function averageValue(rows, field) {
  const values = rows.map(row => finiteNumber(row?.[field])).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
}

export function summarizeRunRows(rows = []) {
  const groups = new Map();
  rows.forEach((row, index) => {
    const key = runKey(row, index);
    if (!groups.has(key)) groups.set(key, { runId:key, rows:[] });
    groups.get(key).rows.push(row);
  });
  return [...groups.values()].map(group => {
    const rawRows = group.rows;
    const first = rawRows[0] || {};
    const levels = rawRows.map(row => Number(row.sourceSetpoint)).filter(Number.isFinite);
    const sourceMin = levels.length ? Math.min(...levels) : NaN;
    const sourceMax = levels.length ? Math.max(...levels) : NaN;
    return {
      runId: group.runId,
      rows: rawRows,
      timestamp: first.timestamp || '',
      sample: first.sample || '',
      mode: first.mode || '',
      sense: first.sense,
      sourceMode: first.sourceMode || 'VOLT',
      sourceMin,
      sourceMax,
      maxVoltage: maximumAbsolute(rawRows, 'voltage'),
      maxCurrent: maximumAbsolute(rawRows, 'current'),
      avgCurrent: averageValue(rawRows, 'current'),
      maxResistance: maximumAbsolute(rawRows, 'resistance'),
      elapsed: Math.max(0, ...rawRows.map(row => Number(row.elapsed)).filter(Number.isFinite)),
      count: rawRows.length,
      compliance: rawRows.some(row => Boolean(row.compliance)),
      ovp: rawRows.some(row => Boolean(row.ovp)),
      overflow: rawRows.some(row => Boolean(row.overflow)),
    };
  });
}

export function selectGraphRuns(rows = [], selectedRunIds = []) {
  const results = summarizeRunRows(rows);
  if (!results.length) return { runs:[], rows:[], sweep:false };
  const selected = new Set([...selectedRunIds].map(String));
  const runs = selected.size
    ? results.filter(result => selected.has(result.runId))
    : results.slice(-1);
  return {
    runs,
    rows: runs.flatMap(result => result.rows),
    sweep: runs.length > 0 && runs.every(result => result.mode === 'sweep'),
  };
}

export function buildGraphSeries(rows = []) {
  const selected = selectGraphRuns(rows);
  const latestRows = selected.rows;
  const sweep = selected.sweep;
  return {
    rows: latestRows,
    sweep,
    x: latestRows.map(row => finiteNumber(sweep ? row.sourceSetpoint : row.elapsed)),
    voltage: latestRows.map(row => finiteNumber(row.voltage)),
    current: latestRows.map(row => finiteNumber(row.current)),
    resistance: latestRows.map(row => finiteNumber(row.resistance)),
  };
}

export function graphSegments(rows, field, sweep = false) {
  const segments = [];
  let segment = null;
  for (const row of rows) {
    const x = finiteNumber(sweep ? row.sourceSetpoint : row.elapsed);
    const y = finiteNumber(row[field]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) { segment = null; continue; }
    if (!segment) { segment = []; segments.push(segment); }
    segment.push({ x, y });
  }
  return segments;
}

function sourceSummary(result) {
  const unit = modeUnit(result.sourceMode);
  if (!Number.isFinite(result.sourceMin)) return '—';
  if (result.sourceMin === result.sourceMax) return `${fmt(result.sourceMin)} ${unit}`;
  return `${fmt(result.sourceMin)} → ${fmt(result.sourceMax)} ${unit}`;
}

export function formatResultDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}`;
}

function updateSelectAllState(results = summarizeRunRows(S?.rows ?? [])) {
  const box = $('k2400SelectAll');
  if (!box) return;
  const selectedCount = results.filter(result => S.selectedRuns.has(result.runId)).length;
  box.checked = results.length > 0 && selectedCount === results.length;
  box.indeterminate = selectedCount > 0 && selectedCount < results.length;
}

function renderTable() {
  const body = $('k2400Tbody');
  if (!body) return;
  const results = summarizeRunRows(S.rows);
  if (!results.length) {
    body.innerHTML = `<tr><td colspan="14" class="k2400-empty">${t('no_data')}</td></tr>`;
    updateSelectAllState(results);
    return;
  }
  const selectedResults = results.filter(result => S.selectedRuns.has(result.runId));
  body.innerHTML = results.map((r, i) => {
    const encodedRun = encodeURIComponent(r.runId);
    const status = r.ovp ? 'OVP' : r.compliance ? 'TRIP' : r.overflow ? t('overflow') : 'OK';
    const rowClasses = [r.ovp || r.compliance ? 'k2400-trip-row' : '', S.selectedRuns.has(r.runId) ? 'k2400-result-selected' : ''].filter(Boolean).join(' ');
    const selectedIndex = selectedResults.findIndex(result => result.runId === r.runId);
    const rowStyle = selectedIndex >= 0 ? ` style="--k2400-run-color:${graphRunColor(selectedIndex)}"` : '';
    return `<tr class="${rowClasses}"${rowStyle}>
      <td><input type="checkbox" ${S.selectedRuns.has(r.runId) ? 'checked' : ''} data-run="${escapeHTML(encodedRun)}" onchange="app.instr.toggleResult(this.dataset.run,this.checked)"></td>
      <td>${i + 1}</td><td>${escapeHTML(formatResultDate(r.timestamp))}</td><td><input class="k2400-sample-input" type="text" maxlength="80" value="${escapeHTML(r.sample)}" aria-label="${t('sample_edit_hint')}" title="${t('sample_edit_hint')}" data-run="${escapeHTML(encodedRun)}" oninput="app.instr.editResultSample(this.dataset.run,this.value)" onkeydown="if(event.key==='Enter')this.blur()"></td>
      <td>${escapeHTML(r.mode)}</td><td>${r.sense}W</td><td>${escapeHTML(sourceSummary(r))}</td>
      <td class="k2400-result-max">${fmt(r.maxVoltage)}</td><td class="k2400-result-max k2400-result-current">${formatCurrentMilliamps(r.maxCurrent)}</td><td class="k2400-result-average-current">${formatCurrentMilliamps(r.avgCurrent)}</td><td class="k2400-result-max">${fmt(r.maxResistance)}</td>
      <td>${r.count}</td><td>${r.elapsed.toFixed(2)}</td><td>${status}</td>
    </tr>`;
  }).join('');
  updateSelectAllState(results);
}

function decodeRunKey(encodedRun) {
  try { return decodeURIComponent(String(encodedRun)); }
  catch (_) { return String(encodedRun); }
}

function toggleResult(encodedRun, checked) {
  const key = decodeRunKey(encodedRun);
  if (checked) S.selectedRuns.add(key); else S.selectedRuns.delete(key);
  renderTable();
  drawGraph();
}
function editResultSample(encodedRun, value) {
  const key = decodeRunKey(encodedRun);
  const sample = String(value ?? '').trim();
  S.rows.forEach((row, index) => { if (runKey(row, index) === key) row.sample = sample; });
  drawGraph();
  scheduleRowsSave(250);
}
function toggleAll(checked) {
  S.selectedRuns.clear();
  if (checked) summarizeRunRows(S.rows).forEach(result => S.selectedRuns.add(result.runId));
  renderTable();
  drawGraph();
}
function deleteSelected() {
  if (!S.selectedRuns.size) return;
  S.rows = S.rows.filter((row, index) => !S.selectedRuns.has(runKey(row, index)));
  S.selectedRuns.clear();
  S.lastReading = S.rows.at(-1) || null;
  app.count = S.rows.length; app._updateCount(); renderTable(); drawGraph();
  void saveRowsNow();
}
function clearData() {
  if (S.running) return;
  S.rows = []; S.selectedRuns.clear(); S.lastReading = null;
  app.count = 0; app._updateCount(); renderTable(); drawGraph();
  void saveRowsNow();
}

function evaluationPayload(rows = S?.rows ?? []) {
  return {
    schema: EVALDATA_SCHEMA,
    version: EVALDATA_VERSION,
    exportedAt: new Date().toISOString(),
    rows,
  };
}

function refreshRowsUI() {
  S.selectedRuns.clear();
  S.lastReading = S.rows.at(-1) || null;
  app.count = S.rows.length;
  app._updateCount();
  renderTable();
  if (S.lastReading) updateLive(S.lastReading);
  drawGraph();
}

async function loadStoredRows() {
  try {
    const response = await fetch(EVALDATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const storedRows = normalizeEvaluationPayload(payload);
    if (storedRows === null) throw new Error('Invalid evaluation payload');
    // Retain measurements created while the server request was in flight.
    S.rows = mergeEvaluationRows(storedRows, S.rows).rows;
    S.storageLoaded = true;
    refreshRowsUI();
    const runs = summarizeRunRows(S.rows).length;
    if (runs) app.log(`[2400] ${t('list_loaded').replace('{runs}', runs)}`, 'ok');
  } catch (error) {
    S.storageLoaded = true;
    if (!S.storageWarned) {
      app.log(`[2400] ${t('list_save_failed')} ${error.message}`, 'err');
      S.storageWarned = true;
    }
  }
}

function ensureStoredRowsLoaded() {
  if (S.storageLoaded) return Promise.resolve();
  if (!S.storageLoadPromise) {
    S.storageLoadPromise = loadStoredRows().finally(() => { S.storageLoadPromise = null; });
  }
  return S.storageLoadPromise;
}

function scheduleRowsSave(delay = 700) {
  if (!S) return;
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(() => { S.saveTimer = null; void saveRowsNow(); }, delay);
}

function saveRowsNow(announce = false) {
  if (!S) return Promise.resolve(false);
  clearTimeout(S.saveTimer);
  S.saveTimer = null;
  const saveTask = async () => {
    await ensureStoredRowsLoaded();
    try {
      const response = await fetch(EVALDATA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(evaluationPayload()),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json().catch(() => ({ ok: true }));
      if (result.ok === false) throw new Error(result.error || 'Save failed');
      S.storageWarned = false;
      if (announce) app.log(`[2400] ${t('list_saved')}`, 'ok');
      return true;
    } catch (error) {
      if (announce || !S.storageWarned) app.log(`[2400] ${t('list_save_failed')} ${error.message}`, 'err');
      S.storageWarned = true;
      return false;
    }
  };
  S.saveChain = S.saveChain.catch(() => false).then(saveTask);
  return S.saveChain;
}

async function saveBytes(filename, bytes, contentType) {
  try {
    const response = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': contentType, 'X-Filename': encodeURIComponent(filename) },
      body: bytes,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json().catch(() => ({}));
    app.log(`[2400] ${t('saved')}: ${data.path || filename}`, 'ok');
  } catch (_) {
    const blob = new Blob([bytes], { type: contentType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    app.log(`[2400] ${t('fallback')}: ${filename}`, 'ok');
  }
}

async function exportEvaluationList() {
  if (!S.rows.length) { app.log(`[2400] ${t('no_data')}`, 'err'); return; }
  const text = JSON.stringify(evaluationPayload(), null, 2);
  const bytes = new TextEncoder().encode(text);
  const filename = `Keithley2400_records_${dateStr()}_${new Date().toTimeString().slice(0,8).replaceAll(':','')}.json`;
  await saveBytes(filename, bytes, 'application/json; charset=utf-8');
}

function importEvaluationList() { $('k2400ImportFile')?.click(); }

async function handleEvaluationImport(input) {
  const file = input?.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const rawRows = Array.isArray(parsed) ? parsed : parsed?.rows;
    const importedRows = normalizeEvaluationPayload(parsed);
    if (importedRows === null || (Array.isArray(rawRows) && rawRows.length > 0 && importedRows.length === 0)) {
      throw new Error(t('list_invalid'));
    }
    const merged = mergeEvaluationRows(S.rows, importedRows);
    S.rows = merged.rows;
    refreshRowsUI();
    await saveRowsNow();
    app.log(`[2400] ${t('list_imported').replace('{added}', merged.addedRuns).replace('{skipped}', merged.skippedRuns)}`, 'ok');
  } catch (error) {
    const detail = error.message === t('list_invalid') ? '' : ` ${error.message}`;
    app.log(`[2400] ${t('list_invalid')}${detail}`, 'err');
  } finally {
    input.value = '';
  }
}

async function manualSaveEvaluationList() { await saveRowsNow(true); }

export function selectRawRows(rows = [], selectedRunIds = []) {
  const selected = new Set([...selectedRunIds].map(String));
  if (!selected.size) return [...rows];
  return rows.filter((row, index) => selected.has(runKey(row, index)));
}

export function buildXlsxExportModel(rows = [], allRows = rows) {
  const numberByRun = new Map(summarizeRunRows(allRows).map((result, index) => [result.runId, index + 1]));
  const runs = summarizeRunRows(rows).map((result, exportIndex) => {
    const evaluationNo = numberByRun.get(result.runId) ?? '';
    const sample = String(result.sample || '').trim() || `Sample ${evaluationNo || exportIndex + 1}`;
    const complianceValues = result.rows.map(row => Number(row.complianceLimit)).filter(Number.isFinite);
    return {
      ...result,
      evaluationNo,
      sample,
      complianceLimit: complianceValues[0] ?? NaN,
      statusText: result.ovp ? 'OVP' : result.compliance ? 'COMPLIANCE' : result.overflow ? 'OVERFLOW' : 'OK',
      rawRows: result.rows.map(row => ({
        elapsed: Number(row.elapsed),
        voltage: Number(row.voltage),
        current: Number(row.current),
        resistance: Number(row.resistance),
      })),
    };
  });
  return { runs, runCount:runs.length, maxSamples:Math.max(0, ...runs.map(run => run.rawRows.length)) };
}

async function saveXLSX() {
  if (!S.rows.length) return;
  const exportRows=selectRawRows(S.rows,S.selectedRuns);
  const model=buildXlsxExportModel(exportRows,S.rows);
  if (!model.runs.length) return;
  try {
    const templateUrl=new URL('../assets/keithley_2400_export_template.xlsx',import.meta.url);
    const response=await fetch(templateUrl,{cache:'no-store'});
    if(!response.ok)throw new Error(`template load failed (${response.status})`);
    const bytes=await fillKeithley2400Template(await response.arrayBuffer(),model,app?.lang === 'en' ? 'en' : 'ko');
    const selectedCount=S.selectedRuns.size;const scope=selectedCount?`selected_${selectedCount}`:'all';
    const filename=`Keithley2400_template_export_${scope}_${dateStr()}_${new Date().toTimeString().slice(0,8).replaceAll(':','')}.xlsx`;
    await saveBytes(filename,bytes,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch(error) {
    app.log(`[2400] XLSX export failed: ${error.message}`,'err');
  }
}

async function saveGraphImage() {
  const canvas = $('k2400Chart');
  const graph = selectGraphRuns(S?.rows ?? [], S?.selectedRuns ?? []);
  if (!canvas || !graph.rows.length) { app.log(`[2400] ${t('no_data')}`, 'err'); return; }
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) { app.log('[2400] PNG image creation failed.', 'err'); return; }
  const scope = S.selectedRuns.size ? `selected_${S.selectedRuns.size}` : 'latest';
  const filename = `Keithley2400_graph_${scope}_${dateStr()}_${new Date().toTimeString().slice(0,8).replaceAll(':','')}.png`;
  await saveBytes(filename, blob, 'image/png');
}

function showWarning(message, title = t('invalid')) {
  const heading = $('k2400WarningTitle'); if (heading) heading.textContent = `⚠ ${title}`;
  const msg = $('k2400WarningMessage'); if (msg) msg.textContent = message;
  const modal = $('k2400WarningModal'); if (modal) modal.style.display = 'flex';
}
function closeWarning() { const modal = $('k2400WarningModal'); if (modal) modal.style.display = 'none'; }

function toggleGraphMetric(metric, checked) {
  if (!['voltage', 'current', 'resistance'].includes(metric)) return;
  if (checked) S.graphMetrics.add(metric); else S.graphMetrics.delete(metric);
  drawGraph();
}

function updateGraphRunLegend(runs, allResults) {
  const legend = $('k2400RunLegend');
  if (!legend) return;
  if (!runs.length) { legend.innerHTML = ''; return; }
  const numberByRun = new Map(allResults.map((result, index) => [result.runId, index + 1]));
  const prefix = S.selectedRuns.size ? t('graph_selected') : t('graph_latest');
  legend.innerHTML = `<span class="k2400-run-legend-label">${prefix}</span>${runs.map((result, index) => {
    const name = result.sample || `#${numberByRun.get(result.runId) || index + 1}`;
    const date = formatResultDate(result.timestamp);
    return `<span class="k2400-run-key" style="--k2400-run-color:${graphRunColor(index)}"><i class="k2400-run-key-line"></i><span>#${numberByRun.get(result.runId) || index + 1} ${escapeHTML(name)} · ${escapeHTML(date)}</span></span>`;
  }).join('')}`;
}

function drawGraph() {
  const canvas = $('k2400Chart');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(320, rect.width || 320), H = Math.max(240, rect.height || 240);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  const light = document.body.classList.contains('light');
  const C = { bg:light?'#fff':'#091728', grid:light?'#dce5ef':'#1c3953', text:light?'#516174':'#8aa3bd', v:'#3fb6e8', i:'#f59e0b', r:'#22b06a' };
  ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
  const allResults = summarizeRunRows(S?.rows ?? []);
  const graph = selectGraphRuns(S?.rows ?? [], S?.selectedRuns ?? []);
  updateGraphRunLegend(graph.runs, allResults);
  const rows = graph.rows;
  const empty = $('k2400GraphEmpty');
  if (empty) { empty.textContent = t('no_data'); empty.style.display = rows.length ? 'none' : 'flex'; }
  if (!rows.length) return;
  const sweep = graph.sweep;
  const pad = { l:76,r:230,t:38,b:44 };
  const xValue = row => finiteNumber(sweep ? row.sourceSetpoint : row.elapsed);
  const xs = rows.map(xValue).filter(Number.isFinite);
  if (!xs.length) return;
  let xmin=Math.min(...xs), xmax=Math.max(...xs);
  if (xmin===xmax) { const d=Math.abs(xmin)*.05||1; xmin-=d; xmax+=d; }
  const axisRange = (field, scale = 1) => {
    const values=rows.map(row=>finiteNumber(row[field]) * scale).filter(Number.isFinite);
    if (!values.length) return { min:0,max:1 };
    const min=Math.min(...values), max=Math.max(...values);
    if (min < 0) { const limit=Math.max(Math.abs(min),Math.abs(max))||1; return { min:-limit*1.08,max:limit*1.08 }; }
    return { min:0,max:(max||1)*1.08 };
  };
  const axes = [
    { field:'voltage', label:'Voltage (V)', color:C.v, scale:1, range:axisRange('voltage'), format:fmt },
    { field:'current', label:'Current (mA)', color:C.i, scale:1000, range:axisRange('current', 1000), format:formatMilliamps },
    { field:'resistance', label:'Resistance (Ω)', color:C.r, scale:1, range:axisRange('resistance'), format:fmt },
  ].filter(axis => S.graphMetrics.has(axis.field));
  if (!axes.length) return;
  const plotW=W-pad.l-pad.r, plotH=H-pad.t-pad.b;
  const x=value=>pad.l+(value-xmin)/(xmax-xmin)*plotW;
  const y=(value,range)=>H-pad.b-(value-range.min)/(range.max-range.min)*plotH;
  ctx.strokeStyle=C.grid; ctx.lineWidth=1; ctx.fillStyle=C.text; ctx.font='11px sans-serif';
  for(let i=0;i<=5;i++) {
    const xx=pad.l+i*plotW/5, yy=pad.t+i*plotH/5;
    ctx.beginPath();ctx.moveTo(xx,pad.t);ctx.lineTo(xx,H-pad.b);ctx.stroke();
    ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(W-pad.r,yy);ctx.stroke();
    const xTick=xmin+(xmax-xmin)*i/5;
    ctx.fillStyle=C.text;ctx.textAlign='center';ctx.fillText(fmt(xTick),xx,H-pad.b+17);
  }
  const drawSeries = (axis, run, runIndex) => {
    const style=graphSeriesStyle(runIndex,axis.field,graph.runs.length);
    ctx.strokeStyle=style.color;ctx.fillStyle=style.color;ctx.lineWidth=style.lineWidth;ctx.setLineDash(style.dash);
    graphSegments(run.rows, axis.field, sweep).forEach(points=>{
      ctx.beginPath();
      points.forEach((point,index)=>{
        if(index===0)ctx.moveTo(x(point.x),y(point.y*axis.scale,axis.range));
        else ctx.lineTo(x(point.x),y(point.y*axis.scale,axis.range));
      });
      if(points.length>1)ctx.stroke();
      else { const point=points[0];ctx.beginPath();ctx.arc(x(point.x),y(point.y*axis.scale,axis.range),3,0,Math.PI*2);ctx.fill(); }
    });
    ctx.setLineDash([]);
  };
  graph.runs.forEach((run, runIndex) => axes.forEach(axis => drawSeries(axis, run, runIndex)));
  ctx.font='11px sans-serif';ctx.fillStyle=C.text;ctx.textAlign='center';
  ctx.fillText(sweep?`Source (${modeUnit(rows.at(-1)?.sourceMode)})`:'Elapsed (s)',pad.l+plotW/2,H-10);
  const tickLabels = axis => [axis.format(axis.range.max),axis.format((axis.range.max+axis.range.min)/2),axis.format(axis.range.min)];
  const tickYs=[pad.t+4,pad.t+plotH/2+4,H-pad.b];
  const axisByField = Object.fromEntries(axes.map(axis => [axis.field, axis]));
  if (axisByField.voltage) {
    ctx.textAlign='right';ctx.fillStyle=C.v;tickLabels(axisByField.voltage).forEach((label,i)=>ctx.fillText(label,pad.l-8,tickYs[i]));
    ctx.save();ctx.translate(16,pad.t+plotH/2);ctx.rotate(-Math.PI/2);ctx.textAlign='center';ctx.fillStyle=C.v;ctx.fillText('Voltage (V)',0,0);ctx.restore();
  }
  if (axisByField.current) {
    ctx.textAlign='left';ctx.fillStyle=C.i;tickLabels(axisByField.current).forEach((label,i)=>ctx.fillText(label,W-pad.r+8,tickYs[i]));
    ctx.save();ctx.translate(W-126,pad.t+plotH/2);ctx.rotate(-Math.PI/2);ctx.textAlign='center';ctx.fillStyle=C.i;ctx.fillText('Current (mA)',0,0);ctx.restore();
  }
  if (axisByField.resistance) {
    ctx.textAlign='right';ctx.fillStyle=C.r;tickLabels(axisByField.resistance).forEach((label,i)=>ctx.fillText(label,W-40,tickYs[i]));
    ctx.save();ctx.translate(W-10,pad.t+plotH/2);ctx.rotate(-Math.PI/2);ctx.textAlign='center';ctx.fillStyle=C.r;ctx.fillText('Resistance (Ω)',0,0);ctx.restore();
  }
}

function buildSidebar(el) {
  if (!S) init();
  const s=S.settings;
  el.innerHTML=`<div class="sidebar-top">
    <div class="panel"><div class="panel-title">${t('conn')}</div>
      <div class="k2400-rs232-note">${t('rs232')}</div>
      <div class="conn-row"><select id="portSelect" class="inp port-sel"></select><button class="icon-btn" onclick="app.refreshPorts()" title="${t('refresh')}">↻</button></div>
      <div id="connStatus" class="conn-status-lbl">${t('disconnected')}</div>
      <button id="btnConnect" class="big-btn" onclick="app.toggleConnection()">${t('connect')}</button>
    </div>
    <div class="panel"><div class="panel-title">${t('setup')}</div>
      <label class="fl">${t('source_mode')}</label><div class="toggle-row"><button id="k2400SourceV" class="toggle-btn ${s.sourceMode==='VOLT'?'active':''}" onclick="app.instr.chooseSourceMode('VOLT')">${t('source_v')}</button><button id="k2400SourceI" class="toggle-btn ${s.sourceMode==='CURR'?'active':''}" onclick="app.instr.chooseSourceMode('CURR')">${t('source_i')}</button></div>
      <label class="fl" id="k2400SourceLabel"></label><input id="k2400SourceValue" class="inp" type="number" min="${-absoluteSourceLimit(s.sourceMode)}" max="${absoluteSourceLimit(s.sourceMode)}" step="any" value="${s.sourceValue}" oninput="app.instr.settingsChanged()" onblur="app.instr.enforcePrimaryLimits()">
      <label class="fl" id="k2400ComplianceLabel"></label><input id="k2400Compliance" class="inp" type="number" min="${minimumCompliance(s.sourceMode)}" max="${maximumComplianceForSource(s.sourceMode, s.sourceValue)}" step="any" value="${s.compliance}" oninput="app.instr.settingsChanged()" onblur="app.instr.enforcePrimaryLimits()">
      <div id="k2400OvpRef" class="k2400-ovp-ref"><strong>${t('ovp_auto_title')}</strong><span id="k2400OvpDevice"></span><small>${t('ovp_auto_note')}</small></div>
      <div id="k2400ResistanceRef" class="k2400-resistance-ref">
        <span class="k2400-resistance-ref-title">${t(s.sourceMode === 'CURR' ? 'ref_r_title' : 'ref_v_title')}</span>
        <strong id="k2400ResistanceRefValue"></strong>
        <span id="k2400ResistanceRefDetail" class="k2400-resistance-ref-detail"></span>
        <div class="k2400-limit-guide">
          <div class="k2400-limit-guide-title">${t('limit_guide_title')}</div>
          <table aria-label="${t('limit_guide_title')}"><thead><tr><th>${t('limit_voltage')}</th><th>${t('limit_current')}</th></tr></thead><tbody>
            <tr id="k2400LimitLowRow"><td>${t('limit_low_v')}</td><td>${t('limit_low_i')}</td></tr>
            <tr id="k2400LimitHighRow"><td>${t('limit_high_v')}</td><td>${t('limit_high_i')}</td></tr>
          </tbody></table>
          <div class="k2400-limit-guide-note">${t('limit_guide_note')}</div>
          <div id="k2400LimitState" class="k2400-limit-state"></div>
        </div>
      </div>
      <div id="k2400HazardNotice" class="k2400-hazard-notice" hidden></div>
      <label class="fl">${t('sense')}</label><div class="toggle-row"><button id="k2400Sense2" class="toggle-btn ${s.sense===2?'active':''}" onclick="app.instr.chooseSense(2)">2-Wire</button><button id="k2400Sense4" class="toggle-btn ${s.sense===4?'active':''}" onclick="app.instr.chooseSense(4)">4-Wire</button></div>
      <div class="k2400-mini-note">${t('fresh_4w')}</div>
      <label class="fl">${t('rate')}</label><select id="k2400Nplc" class="inp" onchange="app.instr.settingsChanged()"><option value="0.1" ${s.nplc===0.1?'selected':''}>FAST (0.1 NPLC)</option><option value="1" ${s.nplc===1?'selected':''}>MED (1 NPLC)</option><option value="10" ${s.nplc===10?'selected':''}>SLOW (10 NPLC)</option></select>
      <label class="fl">${t('settle')}</label><input id="k2400Settle" class="inp" type="number" min="0" max="60" step="0.1" value="${s.settle}" oninput="app.instr.settingsChanged()" onblur="app.instr.enforceGeneralLimits()">
    </div>
    <div class="panel"><div class="panel-title">${t('mode')}</div>
      <select id="k2400TestMode" class="inp" onchange="app.instr.settingsChanged()"><option value="spot" ${s.testMode==='spot'?'selected':''}>${t('spot')}</option><option value="time" ${s.testMode==='time'?'selected':''}>${t('time')}</option><option value="sweep" ${s.testMode==='sweep'?'selected':''}>${t('sweep')}</option><option value="cycle" ${s.testMode==='cycle'?'selected':''}>${t('cycle')}</option></select>
      <label class="fl">${t('sample')}</label><input id="k2400Sample" class="inp" type="text" value="${escapeHTML(s.sample)}" oninput="app.instr.settingsChanged()">
      <div id="k2400SpotFields"><label class="fl">${t('repeat')}</label><input id="k2400Repeat" class="inp" type="number" min="1" max="1000" step="1" value="${s.repeat}" oninput="app.instr.settingsChanged()" onblur="app.instr.enforceGeneralLimits()"></div>
      <div id="k2400TimeFields"><label class="fl">${t('interval')}</label><input id="k2400Interval" class="inp" type="number" min="0.2" max="3600" step="0.1" value="${s.interval}" oninput="app.instr.settingsChanged()" onblur="app.instr.enforceGeneralLimits()"><label class="fl">${t('duration')}</label><input id="k2400Duration" class="inp" type="number" min="0.2" max="86400" step="1" value="${s.duration}" oninput="app.instr.settingsChanged()" onblur="app.instr.enforceGeneralLimits()"></div>
      <div id="k2400SweepFields"><label class="fl" id="k2400SweepStartLabel"></label><input id="k2400SweepStart" class="inp" type="number" step="any" value="${s.sweepStart}" oninput="app.instr.settingsChanged()" onblur="app.instr.enforceSweepLimits()"><label class="fl" id="k2400SweepStopLabel"></label><input id="k2400SweepStop" class="inp" type="number" step="any" value="${s.sweepStop}" oninput="app.instr.settingsChanged()" onblur="app.instr.enforceSweepLimits()"><label class="fl">${t('sweep_points')}</label><input id="k2400SweepPoints" class="inp" type="number" min="2" max="1000" step="1" value="${s.sweepPoints}" oninput="app.instr.settingsChanged()" onblur="app.instr.enforceGeneralLimits()"></div>
      <div id="k2400Validation" class="k2400-validation"></div>
      <button id="k2400Start" class="big-btn green" onclick="app.instr.requestStart()">${t('start')}</button>
      <button id="k2400Stop" class="big-btn danger" onclick="app.instr.emergencyOff()" disabled>${t('stop')}</button>
    </div>
  </div>${syslogPanelHTML()}`;
  updateSettingLabels(); updateControlState();
}

function buildCenter(el) {
  if (!S) init();
  document.getElementById('layout')?.classList.add('k2400-layout-no-right');
  el.innerHTML=`<div class="display-bar k2400-display"><div class="disp-value"><span id="liveValue">— — —</span><span class="disp-unit" id="liveUnit"></span></div><div class="disp-meta"><span id="liveStatus" class="disp-status off">${t('disconnected')}</span><span class="meas-count">Count <b id="measCount">${S.rows.length}</b></span></div></div>
    <div class="k2400-live-grid"><div><span>Voltage</span><b id="k2400LiveV">— V</b></div><div><span>Current</span><b id="k2400LiveI">— mA</b></div><div><span>Resistance</span><b id="k2400LiveR">— Ω</b></div><div><span>Power</span><b id="k2400LiveP">— W</b></div><div class="k2400-output-cell"><span id="k2400OutputBadge" class="k2400-output-badge off">OUTPUT OFF</span><b id="k2400Elapsed">0.0 s</b><em id="k2400RunStatus" class="k2400-run-status">${t('ready')}</em></div></div>
    <div id="k2400CyclePanel" class="panel k2400-cycle-panel" ${S.settings.testMode === 'cycle' ? '' : 'hidden'}>
      <div class="k2400-cycle-head"><div class="panel-title">${t('cycle_title')}</div><div class="k2400-cycle-summary"><label>${t('cycle_loops')} <input id="k2400CycleLoops" class="inp" type="number" min="1" max="1000" step="1" value="${S.settings.cycleLoops}" onchange="app.instr.cycleEditorChanged()"></label><label>${t('cycle_interval')} <input id="k2400CycleInterval" class="inp" type="number" min="0.2" max="3600" step="0.1" value="${S.settings.cycleInterval}" onchange="app.instr.cycleEditorChanged()"></label><span>${t('cycle_total')}: <b id="k2400CycleTotal">0s</b></span></div></div>
      <div class="k2400-cycle-add-row">
        <label><span id="k2400CycleSourceLabel">${t('cycle_step_source')}</span><input id="k2400CycleSource" class="inp" type="number" step="any" value="${S.settings.sourceValue}" oninput="app.instr.previewCycleDraftSpecWarning()" onblur="app.instr.enforceCycleDraftLimits()"></label>
        <label><span id="k2400CycleComplianceLabel">${t('cycle_step_compliance')}</span><input id="k2400CycleCompliance" class="inp" type="number" min="${minimumCompliance(S.settings.sourceMode)}" step="any" value="${S.settings.compliance}" oninput="app.instr.previewCycleDraftSpecWarning()" onblur="app.instr.enforceCycleDraftLimits()"></label>
        <label><span>${t('cycle_step_time')}</span><input id="k2400CycleDuration" class="inp" type="number" min="0.2" max="86400" step="0.1" value="10"></label>
        <button id="k2400CycleAdd" class="sbtn green" onclick="app.instr.addCycleStep()">＋ ${t('cycle_add')}</button>
      </div>
      <div class="k2400-cycle-table-wrap"><table class="k2400-cycle-table"><thead><tr><th>${t('cycle_step')}</th><th>${t('cycle_step_source')}</th><th>${t('cycle_step_compliance')}</th><th>${t('cycle_step_time')}</th><th></th></tr></thead><tbody id="k2400CycleTbody"></tbody></table></div>
    </div>
    <div class="panel k2400-graph-panel k2400-center-graph"><div class="k2400-graph-head"><div class="panel-title">${t('graph')}</div><div id="k2400RunLegend" class="k2400-run-legend"></div></div><div class="k2400-graph-wrap"><div class="k2400-metric-filter"><label class="k2400-metric-voltage"><input type="checkbox" ${S.graphMetrics.has('voltage')?'checked':''} onchange="app.instr.toggleGraphMetric('voltage',this.checked)"><i></i><span>Voltage (V)</span></label><label class="k2400-metric-current"><input type="checkbox" ${S.graphMetrics.has('current')?'checked':''} onchange="app.instr.toggleGraphMetric('current',this.checked)"><i></i><span>Current (mA)</span></label><label class="k2400-metric-resistance"><input type="checkbox" ${S.graphMetrics.has('resistance')?'checked':''} onchange="app.instr.toggleGraphMetric('resistance',this.checked)"><i></i><span>Resistance (Ω)</span></label><div class="k2400-line-style-legend"><span class="k2400-line-style k2400-line-style-voltage"><i></i><span>${t('graph_line_voltage')}</span></span><span class="k2400-line-style k2400-line-style-current"><i></i><span>${t('graph_line_current')}</span></span><span class="k2400-line-style k2400-line-style-resistance"><i></i><span>${t('graph_line_resistance')}</span></span></div></div><canvas id="k2400Chart"></canvas><div id="k2400GraphEmpty" class="graph-empty">${t('no_data')}</div></div><div class="k2400-graph-footer"><button class="sbtn k2400-graph-save" onclick="app.instr.saveGraphImage()">🖼 ${t('graph_save')}</button></div></div>
    <div class="panel datalog-head-bar"><div class="panel-title">${t('data')} · Keithley 2400</div><div class="datalog-actions"><button class="sbtn green" onclick="app.instr.saveXLSX()">${t('xlsx')}</button><button class="sbtn" onclick="app.instr.exportEvaluationList()">${t('list_export')}</button><button class="sbtn" onclick="app.instr.importEvaluationList()">${t('list_import')}</button><input id="k2400ImportFile" type="file" accept=".json,application/json" hidden onchange="app.instr.handleEvaluationImport(this)"><button class="sbtn" onclick="app.instr.manualSaveEvaluationList()">${t('list_save')}</button><button class="sbtn red-o" onclick="app.instr.deleteSelected()">${t('del')}</button><button class="sbtn red" onclick="app.instr.clearData()">${t('clear')}</button></div></div>
    <div class="panel grow k2400-table-panel"><div class="table-wrap"><table class="k2400-table k2400-result-table"><thead><tr><th><input id="k2400SelectAll" type="checkbox" onchange="app.instr.toggleAll(this.checked)"></th><th>No</th><th>${t('date')}</th><th>${t('sample')}</th><th>Mode</th><th>Sense</th><th>Source</th><th>${t('max_v')} (V)</th><th>${t('max_i')} (mA)</th><th>${t('avg_i')} (mA)</th><th>${t('max_r')} (Ω)</th><th>${t('points')}</th><th>${t('elapsed')} (s)</th><th>Status</th></tr></thead><tbody id="k2400Tbody"></tbody></table></div></div>
    <div id="k2400ConfirmModal" class="k2400-modal" style="display:none"><div class="k2400-modal-box"><div class="k2400-modal-title">⚠ ${t('hv_title')}</div><div id="k2400ConfirmMessage" class="k2400-modal-message"></div><label class="k2400-ack"><input id="k2400Acknowledge" type="checkbox" onchange="app.instr.toggleConfirmReady(this.checked)"><span>${t('acknowledge')}</span></label><div class="k2400-modal-actions"><button class="big-btn" onclick="app.instr.closeConfirmModal(false)">${t('cancel')}</button><button id="k2400ConfirmOk" class="big-btn danger" onclick="app.instr.closeConfirmModal(true)" disabled>${t('confirm')}</button></div></div></div>
    <div id="k2400WarningModal" class="k2400-modal" style="display:none" onclick="if(event.target===this)app.instr.closeWarning()"><div class="k2400-modal-box"><div id="k2400WarningTitle" class="k2400-modal-title">⚠ ${t('invalid')}</div><div id="k2400WarningMessage" class="k2400-modal-message k2400-hv"></div><button class="big-btn" onclick="app.instr.closeWarning()">OK</button></div></div>`;
  renderCycleSteps(); renderTable(); if(S.lastReading) updateLive(S.lastReading); updateOutputUI(); updateControlState();
  void ensureStoredRowsLoaded();
  S.resizeObserver?.disconnect();
  const graph = $('k2400Chart')?.parentElement;
  if (window.ResizeObserver && graph) { S.resizeObserver=new ResizeObserver(()=>drawGraph()); S.resizeObserver.observe(graph); }
  requestAnimationFrame(drawGraph);
}

function buildRightPanel(el) {
  if (!S) init();
  document.getElementById('layout')?.classList.add('k2400-layout-no-right');
  el.innerHTML='';
}

function settingsChanged() { previewPrimaryOrSweepSpecWarning(); syncSettingsFromUI(); }
function onRebuild() {
  document.getElementById('layout')?.classList.add('k2400-layout-no-right');
  renderCycleSteps(); renderTable(); drawGraph(); updateOutputUI(); updateControlState();
  if(S.lastReading) updateLive(S.lastReading);
}

export default {
  name: 'Keithley 2400',
  icon: 'assets/keithley_2400.png',
  popupImage: 'assets/keithley_2400.png',
  category: 'Instrument', viewType: 'custom',
  // The 2400 must receive :OUTP OFF before any identity query. Ask the VISA
  // bridge to open only; onConnect() performs the safe sequence itself.
  visaConnectWithoutIdn: true,
  // The 2400 always receives CR commands, while its front-panel setting can
  // select CR/CRLF/LF/LFCR for replies. The VISA bridge detects read framing.
  visaAsrlTermination: 'auto',
  serial: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, flowControl: 'none' },
  buildSidebar, buildCenter, buildRightPanel, onRebuild,
  onConnect, onDisconnect, onLine: handleLine,
  isRunning: () => Boolean(S?.running || S?.outputActive),
  chooseSourceMode, chooseSense, settingsChanged, requestStart, emergencyOff,
  enforcePrimaryLimits, enforceSweepLimits, enforceCycleDraftLimits, enforceGeneralLimits,
  previewCycleDraftSpecWarning, previewCycleStepSpecWarning,
  cycleEditorChanged, addCycleStep, editCycleStep, deleteCycleStep,
  toggleConfirmReady, closeConfirmModal, closeWarning,
  editResultSample, toggleResult, toggleAll, toggleGraphMetric, deleteSelected, clearData, saveXLSX, saveGraphImage, drawGraph,
  exportEvaluationList, importEvaluationList, handleEvaluationImport, manualSaveEvaluationList,
};
