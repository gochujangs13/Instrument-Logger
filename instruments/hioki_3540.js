import { buildToggleRow, buildSelect, buildInfoRow } from './_utils.js';

export default {
  name: 'Hioki 3540',
  icon: 'assets/hioki_3540.png',
  category: 'Instrument',
  viewType: 'grid',
  serial: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },
  pollCmd: 'RMES\r', pollInterval: 400,

  parseValue(line) {
    if (!line) return null;
    const up = line.toUpperCase();
    if (up.includes('OF'))   return { valid: false, fmt: 'Over Flow',     unit: '' };
    if (up.includes('----')) return { valid: false, fmt: 'Current Error', unit: '' };
    if (up.includes('ERR'))  return { valid: false, fmt: 'Cmd Error',     unit: '' };
    const m = line.match(/([+-]?\d+\.?\d*[Ee][+-]?\d+)/);
    if (m) {
      const v = parseFloat(m[1]);
      return { valid: true, value: v, fmt: v.toPrecision(5), unit: 'Ω' };
    }
    return { valid: false, fmt: line || '---', unit: '' };
  },

  buildSettings(area) {
    const t = k => app?.t(k) ?? k;
    buildToggleRow(area, t('sample_rate'), ['FAST', 'SLOW'], 'SLOW', v => {
      app.serial.sendCmd(`SMP ${v === 'FAST' ? '1' : '0'}\r`);
    });
    buildSelect(area, t('meas_range'),
      ['Auto', '30 mΩ', '300 mΩ', '3 Ω', '30 Ω', '300 Ω', '3 kΩ', '30 kΩ'], 'Auto',
      v => {
        if (v === 'Auto') { app.serial.sendCmd('AUTO 1\r'); return; }
        const M = { '30 mΩ': '30E-3', '300 mΩ': '300E-3', '3 Ω': '3', '30 Ω': '30',
                    '300 Ω': '300', '3 kΩ': '3E3', '30 kΩ': '30E3' };
        app.serial.sendCmd('AUTO 0\r');
        setTimeout(() => app.serial.sendCmd(`RNG ${M[v]}\r`), 160);
      }
    );
    buildInfoRow(area, t('meas_wire'), () => t('wire_fixed'));
  },
};
