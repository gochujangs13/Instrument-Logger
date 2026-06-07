import { buildToggleRow } from './_utils.js';

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
      return { valid: true, value: v, fmt: v.toExponential(4), unit: 'Ω' };
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
    buildToggleRow(area, t('sample_rate'), ['FAST', 'MED', 'SLOW'], 'MED', v => {
      const m = { FAST: 'MIN', MED: '1', SLOW: '10' };
      app.serial.sendCmd(`SENS:FRES:NPLC ${m[v]}\r\n`);
    });
    buildToggleRow(area, t('meas_wire'), ['2-Wire', '4-Wire'], '4-Wire', v => {
      app.serial.sendCmd(`SENS:FUNC "${v === '4-Wire' ? 'FRES' : 'RES'}"\r\n`);
    });
  },
};
