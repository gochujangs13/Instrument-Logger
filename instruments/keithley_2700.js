import { buildToggleRow, fmt } from './_utils.js';

let _badCount = 0;
let _maint = null; // 에러 큐 주기적 클리어 타이머
const _startupTimers = new Set();
const SETTINGS_KEY = 'keithley2700_settings';
const NPLC_BY_RATE = { FAST: 'MIN', MED: '1', SLOW: '10' };

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function clearStartupTimers() {
  _startupTimers.forEach(clearTimeout);
  _startupTimers.clear();
}

function selectedConfig() {
  const settings = loadSettings();
  const rate = settings.sampleRate || 'MED';
  const wire = settings.measWire || '4-Wire';
  return {
    func: wire === '2-Wire' ? 'RES' : 'FRES',
    nplc: NPLC_BY_RATE[rate] || NPLC_BY_RATE.MED,
  };
}

function scheduleCommand(delay, cmdOrFactory) {
  const timer = setTimeout(() => {
    _startupTimers.delete(timer);
    if (!app.serial?.isConnected) return;
    const cmd = typeof cmdOrFactory === 'function' ? cmdOrFactory() : cmdOrFactory;
    if (cmd) app.serial.sendCmd(cmd);
  }, delay);
  _startupTimers.add(timer);
}

export default {
  name: 'Keithley 2700',
  icon: 'assets/keithley_2700.png',
  category: 'Instrument',
  viewType: 'grid',
  serial: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },
  pollCmd: ':READ?\r\n', pollInterval: 500, pollStartDelay: 3200,

  parseValue(line) {
    if (!line) return null;
    const m = line.match(/([+-]?\d+\.?\d*[Ee][+-]?\d+)/);
    if (m) {
      _badCount = 0;
      const v = parseFloat(m[1]);
      if (Math.abs(v) >= 9e36) return { valid: false, fmt: 'Over Flow', unit: '' };
      return { valid: true, value: v, fmt: fmt(v), unit: 'Ω' };
    }
    // 비정상 응답 10회 연속 시 에러 큐 클리어 (363 누적 → 350 overflow 방지)
    _badCount++;
    if (_badCount % 10 === 0) app.serial.sendCmd('*CLS\r\n');
    return { valid: false, fmt: line || '---', unit: '' };
  },

  onConnect() {
    _badCount = 0;
    clearInterval(_maint);
    clearStartupTimers();
    // *RST 완료까지 ~1.2s 소요 — 그 전에 READ?가 날아가면 363 발생
    // 실행 시점의 화면 선택값을 다시 읽어 적용한 뒤(3.2s) READ? 폴링을 시작한다.
    app.serial.sendCmd('*RST\r\n');
    scheduleCommand(1400, '*CLS\r\n');
    scheduleCommand(1800, 'SYST:REM\r\n');
    scheduleCommand(2100, '*CLS\r\n');
    scheduleCommand(2500, () => `SENS:FUNC "${selectedConfig().func}"\r\n`);
    scheduleCommand(2700, () => `SENS:${selectedConfig().func}:RANG:AUTO ON\r\n`);
    scheduleCommand(2850, () => {
      const { func, nplc } = selectedConfig();
      return `SENS:${func}:NPLC ${nplc}\r\n`;
    });
    scheduleCommand(3050, '*CLS\r\n');
    // 30초마다 에러 큐 선제 클리어 → 350(overflow) 원천 차단
    _maint = setInterval(() => {
      if (app.serial?.isConnected) app.serial.sendCmd('*CLS\r\n');
    }, 30000);
  },

  onDisconnect() {
    clearStartupTimers();
    clearInterval(_maint);
    _maint = null;
    _badCount = 0;
  },

  buildSettings(area) {
    const t = k => app?.t(k) ?? k;
    const save = (key, val) => {
      const s = loadSettings();
      s[key] = val;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    };
    const saved = loadSettings();

    buildToggleRow(area, t('sample_rate'), ['FAST', 'MED', 'SLOW'], saved.sampleRate || 'MED', v => {
      save('sampleRate', v);
      const { func, nplc } = selectedConfig();
      app.serial.sendCmd(`SENS:${func}:NPLC ${nplc}\r\n`);
    });
    buildToggleRow(area, t('meas_wire'), ['2-Wire', '4-Wire'], saved.measWire || '4-Wire', async v => {
      save('measWire', v);
      const func = v === '4-Wire' ? 'FRES' : 'RES';
      await app.serial.sendCmd(`SENS:FUNC "${func}"\r\n`);
      await app.serial.sendCmd(`SENS:${func}:RANG:AUTO ON\r\n`);
      const current = selectedConfig();
      if (current.func !== func) return; // 더 최근 와이어 선택 콜백이 최종 설정을 적용함
      await app.serial.sendCmd(`SENS:${func}:NPLC ${current.nplc}\r\n`);
    });
  },
};
