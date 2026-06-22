import { buildToggleRow, fmt } from './_utils.js';

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
      const v = parseFloat(m[1]);
      if (Math.abs(v) >= 9e36) return { valid: false, fmt: 'Over Flow', unit: '' };
      return { valid: true, value: v, fmt: fmt(v), unit: 'Ω' };
    }
    return { valid: false, fmt: line || '---', unit: '' };
  },

  onConnect() {
    app.serial.sendCmd('*RST\r\n');
    setTimeout(() => app.serial.sendCmd('SYST:REM\r\n'), 600);
    setTimeout(() => app.serial.sendCmd('*CLS\r\n'),    800);
    setTimeout(() => app.serial.sendCmd('SENS:FUNC "FRES"\r\n'), 1000);
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
