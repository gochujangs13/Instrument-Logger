import { buildToggleRow, fmt } from './_utils.js';

let _badCount = 0;
let _maint = null; // 에러 큐 주기적 클리어 타이머
const _startupTimers = new Set();
const SETTINGS_KEY = 'keithley2700_settings';
const NPLC_BY_RATE = { FAST: '0.1', MED: '1', SLOW: '5' };

let _rawLogCount = 0;

function formatKeithley2700(v) {
  if (v === undefined || isNaN(v)) return '---';
  if (!isFinite(v) || Math.abs(v) >= 9e36) return 'Over Flow';
  const abs = Math.abs(v);
  if (abs === 0) return '0.00000';

  // 100 MΩ 이상 초고저항 외에는 지수(toExponential) 표기를 절대 사용하지 않고,
  // 계측기 전면 패널과 동일하게 소수점 형태(Fixed Decimal)로 표시함
  if (abs >= 1e8) {
    return v.toExponential(4);
  }
  if (abs < 1) {
    // -0.00xxx ~ 0.999xx 옴 구간: 계측기 6.5 digit과 일치하도록 소수점 5자리 소수점 표기
    return v.toFixed(5);
  }
  if (abs < 100) {
    return v.toFixed(4);
  }
  if (abs < 10000) {
    return v.toFixed(2);
  }
  return v.toFixed(1);
}

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
    const first = line.split(',')[0].trim();
    const m = first.match(/([+-]?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?)/);
    if (m) {
      _badCount = 0;
      const v = parseFloat(m[1]);
      if (Math.abs(v) >= 9e36) return { valid: false, fmt: 'Over Flow', unit: '' };
      const formatted = formatKeithley2700(v);
      if (_rawLogCount < 3 && typeof app !== 'undefined' && app.log) {
        app.log(`[2700 수신] ${first} ➔ 화면 표시: ${formatted} Ω`, 'ok');
        _rawLogCount++;
      }
      return { valid: true, value: v, fmt: formatted, unit: 'Ω' };
    }
    // 비정상 응답 10회 연속 시 에러 큐 클리어 (363 누적 → 350 overflow 방지)
    _badCount++;
    if (_badCount % 10 === 0 && typeof app !== 'undefined') app.serial?.sendCmd('*CLS\r\n');
    return { valid: false, fmt: line || '---', unit: '' };
  },

  onConnect() {
    _badCount = 0;
    _rawLogCount = 0;
    clearInterval(_maint);
    clearStartupTimers();
    // *RST 완료까지 ~1.2s 소요 — 그 전에 READ?가 날아가면 363 발생
    // 실행 시점의 화면 선택값을 다시 읽어 적용한 뒤(3.2s) READ? 폴링을 시작한다.
    app.serial.sendCmd('*RST\r\n');
    scheduleCommand(1400, '*CLS\r\n');
    scheduleCommand(1700, 'SYST:REM\r\n');
    scheduleCommand(1900, ':FORM:ELEM READ\r\n'); // 타임스탬프/상태 제외, 순수 측정값만 수신
    scheduleCommand(2100, '*CLS\r\n');
    scheduleCommand(2400, () => `:SENS:FUNC '${selectedConfig().func}'\r\n`);
    scheduleCommand(2600, () => `:SENS:${selectedConfig().func}:RANG:AUTO ON\r\n`);
    scheduleCommand(2800, () => {
      const { func, nplc } = selectedConfig();
      return `:SENS:${func}:NPLC ${nplc}\r\n`;
    });
    scheduleCommand(3000, '*CLS\r\n');
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

    buildToggleRow(area, t('sample_rate'), ['FAST', 'MED', 'SLOW'], saved.sampleRate || 'MED', async v => {
      save('sampleRate', v);
      const { func, nplc } = selectedConfig();
      if (app?.serial?.isConnected) {
        clearInterval(app.pollTimer);
        await app.serial.sendCmd(`:SENS:${func}:NPLC ${nplc}\r\n`);
        app.log?.(`[Keithley 2700] ${t('sample_rate')}: ${v} (${nplc} NPLC)`, 'ok');
        setTimeout(() => {
          if (app?.serial?.isConnected && app.instr?.name === 'Keithley 2700') {
            app._startPolling(app.instr);
          }
        }, 120);
      }
    });
    buildToggleRow(area, t('meas_wire'), ['2-Wire', '4-Wire'], saved.measWire || '4-Wire', async v => {
      save('measWire', v);
      const func = v === '4-Wire' ? 'FRES' : 'RES';
      if (app?.serial?.isConnected) {
        clearInterval(app.pollTimer);
        await app.serial.sendCmd(`:SENS:FUNC '${func}'\r\n`);
        await app.serial.sendCmd(`:SENS:${func}:RANG:AUTO ON\r\n`);
        const current = selectedConfig();
        if (current.func === func) {
          await app.serial.sendCmd(`:SENS:${func}:NPLC ${current.nplc}\r\n`);
        }
        app.log?.(`[Keithley 2700] ${t('meas_wire')}: ${v} (${func})`, 'ok');
        setTimeout(() => {
          if (app?.serial?.isConnected && app.instr?.name === 'Keithley 2700') {
            app._startPolling(app.instr);
          }
        }, 120);
      }
    });
  },
};
