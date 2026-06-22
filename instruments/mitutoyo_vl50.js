export default {
  name: 'Mitutoyo VL-50',
  icon: 'assets/mitutoyo_vl50.png',
  category: 'Instrument',
  viewType: 'grid',
  serial: { baudRate: 9600, dataBits: 7, parity: 'even', stopBits: 2 },
  pollCmd: 'GA01\r\n', pollInterval: 300,
  useVL50Modes: true,
  hideSplit:    true,
  hideAutoLog:  true,
  noAutoLog:    true,
  parseValue(line) {
    if (!line) return null;
    const m = line.match(/([+-]?\d+\.\d+)/);
    if (m) {
      const v = parseFloat(m[1]);
      return { valid: true, value: v, fmt: v.toFixed(5), unit: 'mm' };
    }
    return { valid: false, fmt: line || '---', unit: '' };
  },
  onConnect() { app.serial.sendCmd('CS\r\n'); },
  buildSettings() {},
};
