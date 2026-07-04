import { buildToggleRow, fmt } from './_utils.js';

let _badCount = 0;
let _maint = null; // 에러 큐 주기적 클리어 타이머

export default {
  name: 'Keithley 2700',
  icon: 'assets/keithley_2700.png',
  category: 'Instrument',
  viewType: 'grid',
  serial: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },
  pollCmd: ':READ?\r\n', pollInterval: 500,

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
    // *RST 완료까지 ~1.2s 소요 — 그 전에 READ?가 날아가면 363 발생
    // *CLS를 RST 완료 후, SENS:FUNC 후, 최종 3회 분산 배치
    app.serial.sendCmd('*RST\r\n');
    setTimeout(() => app.serial.sendCmd('*CLS\r\n'),             1400);
    setTimeout(() => app.serial.sendCmd('SYST:REM\r\n'),         1800);
    setTimeout(() => app.serial.sendCmd('*CLS\r\n'),             2100);
    setTimeout(() => app.serial.sendCmd('SENS:FUNC "FRES"\r\n'), 2500);
    setTimeout(() => app.serial.sendCmd('*CLS\r\n'),             3000);
    // 30초마다 에러 큐 선제 클리어 → 350(overflow) 원천 차단
    _maint = setInterval(() => {
      if (app.serial?.isConnected) app.serial.sendCmd('*CLS\r\n');
    }, 30000);
  },

  onDisconnect() {
    clearInterval(_maint);
    _maint = null;
    _badCount = 0;
  },

  buildSettings(area) {
    const t = k => app?.t(k) ?? k;
    const SK = 'keithley2700_settings';
    const save = (key, val) => {
      const s = JSON.parse(localStorage.getItem(SK) || '{}');
      s[key] = val; localStorage.setItem(SK, JSON.stringify(s));
    };
    const saved = JSON.parse(localStorage.getItem(SK) || '{}');

    buildToggleRow(area, t('sample_rate'), ['FAST', 'MED', 'SLOW'], saved.sampleRate || 'MED', v => {
      const m = { FAST: 'MIN', MED: '1', SLOW: '10' };
      app.serial.sendCmd(`SENS:FRES:NPLC ${m[v]}\r\n`);
      save('sampleRate', v);
    });
    buildToggleRow(area, t('meas_wire'), ['2-Wire', '4-Wire'], saved.measWire || '4-Wire', v => {
      app.serial.sendCmd(`SENS:FUNC "${v === '4-Wire' ? 'FRES' : 'RES'}"\r\n`);
      save('measWire', v);
    });
  },
};
