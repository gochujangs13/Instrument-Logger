import assert from 'node:assert/strict';

const SETTINGS_KEY = 'keithley2400_settings';

class MemoryStorage {
  constructor(settings) {
    this.values = new Map([[SETTINGS_KEY, JSON.stringify(settings)]]);
  }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const baseSettings = {
  sourceMode: 'VOLT', sourceValue: 1, compliance: 0.01, sense: 4,
  nplc: 1, settle: 0, testMode: 'spot', interval: 0.2, duration: 1,
  repeat: 1, sweepStart: 0, sweepStop: 1, sweepPoints: 3, sample: 'Lifecycle',
  cycleSteps: [], cycleLoops: 1, cycleInterval: 0.2,
};

function installBrowserStubs(settings) {
  globalThis.localStorage = new MemoryStorage(settings);
  globalThis.document = {
    getElementById() { return null; },
    querySelectorAll() { return []; },
    body: { classList: { contains() { return false; } } },
  };
  globalThis.window = {};
}

function makeApp(module, options = {}) {
  const commands = [];
  const logs = [];
  let output = false;
  let remoteSense = options.initialSense === 2 ? false : true;
  let concurrent = options.concurrent ?? true;
  let measureFunctions = new Set(options.measureFunctions ?? ['VOLT', 'CURR']);
  let autoOff = options.autoOff ?? true;
  let sourceMode = 'VOLT';
  let sourceLevel = 0;
  const displays = [];
  const responses = {
    idn: options.idn ?? 'KEITHLEY INSTRUMENTS INC.,MODEL 2400,1234567,C30',
    reading: options.reading ?? '1.000000E+00,1.000000E-03,2.500000E+00,0',
  };

  const serial = {
    isConnected: true,
    isVisa: options.isVisa === true,
    async sendCmd(payload) {
      const command = String(payload).replace(/[\r\n]+$/, '');
      commands.push(command);
      if (command === ':OUTP ON') output = true;
      if (command === ':OUTP OFF') output = false;
      if (command === ':SYST:RSEN ON') remoteSense = true;
      if (command === ':SYST:RSEN OFF') remoteSense = false;
      if (command === ':SENS:FUNC:CONC ON') concurrent = true;
      if (command === ':SENS:FUNC:OFF:ALL') measureFunctions.clear();
      if (command.startsWith(':SENS:FUNC "')) {
        const names = [...command.matchAll(/"(VOLT|CURR|RES)"/g)].map(m => m[1]);
        if (!concurrent) measureFunctions.clear();
        names.forEach(name => measureFunctions.add(name));
      }
      if (command === ':SOUR:CLE:AUTO OFF') autoOff = false;
      if (command.startsWith(':SOUR:FUNC ')) sourceMode = command.split(' ').at(-1);
      if (/^:SOUR:(VOLT|CURR):LEV /.test(command)) sourceLevel = Number(command.split(' ').at(-1));

      let response;
      if (command === ':OUTP?') response = options.outputResponse ?? (output ? '1' : '0');
      else if (command === '*IDN?') response = responses.idn;
      else if (command === ':SYST:RSEN?') response = remoteSense ? '1' : '0';
      else if (command === ':SENS:FUNC?') response = options.functionResponse ?? [...measureFunctions].map(name => `"${name}:DC"`).join(',');
      else if (command === ':SOUR:CLE:AUTO?') response = autoOff ? '1' : '0';
      else if (command === ':SYST:ERR?') response = '0,"No error"';
      else if (command === ':READ?' && !options.holdRead) {
        if (options.measured) {
          const v = measureFunctions.has('VOLT') ? options.measured.voltage : sourceMode === 'VOLT' ? sourceLevel : 9.91e37;
          const i = measureFunctions.has('CURR') ? options.measured.current : sourceMode === 'CURR' ? sourceLevel : 9.91e37;
          response = `${v},${i},2.5,0`;
        } else response = responses.reading;
        if (autoOff) output = false;
      }
      if (response !== undefined) queueMicrotask(() => module.onLine(response));
      return { success: true };
    },
  };

  return {
    lang: 'ko', serial, commands, logs, displays, count: 0,
    log(message, level) { logs.push({ message, level }); },
    _updateCount() {},
    _setDisplay(...args) { displays.push(args); },
  };
}

async function loadScenario(name, settings = baseSettings, options = {}) {
  installBrowserStubs(settings);
  const { default: module } = await import(`../instruments/keithley_2400.js?scenario=${name}-${Date.now()}-${Math.random()}`);
  globalThis.app = makeApp(module, options);
  module.buildSidebar({ innerHTML: '' });
  return { module, app: globalThis.app };
}

async function waitFor(predicate, label, timeoutMs = 2000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail(`Timed out waiting for ${label}`);
}

async function confirmAndRun(module) {
  const result = module.requestStart();
  await Promise.resolve();
  module.closeConfirmModal(true);
  await result;
}

{
  const { module, app } = await loadScenario('normal');
  await module.onConnect();
  assert.deepEqual(app.commands.slice(0, 8), [
    ':OUTP OFF', ':OUTP?', '*IDN?', '*CLS', ':SYST:RSEN ON', ':SYST:RSEN?',
    ':FORM:ELEM VOLT,CURR,TIME,STAT', ':SYST:ERR?',
  ]);
  assert.equal(app.commands.some(command => /\*(?:RST)|:SYST:REM|:SYST:FRES/i.test(command)), false);

  await confirmAndRun(module);
  assert.equal(app.count, 1);
  assert.equal(module.isRunning(), false);
  assert.ok(app.commands.includes(':SOUR:FUNC VOLT'));
  assert.ok(app.commands.includes(':SENS:FUNC "VOLT","CURR"'));
  assert.ok(app.commands.includes(':READ?'));
  assert.ok(app.commands.includes(':OUTP ON'));
  assert.equal(app.commands.at(-2), ':OUTP OFF');
  assert.equal(app.commands.at(-1), ':OUTP?');
  await module.onDisconnect();
}

{
  const { module, app } = await loadScenario('gpib-safe-connect', baseSettings, { isVisa: true });
  assert.equal(module.visaConnectWithoutIdn, true);
  assert.equal(module.visaAsrlTermination, 'auto');
  await module.onConnect();
  assert.deepEqual(app.commands.slice(0, 3), [':OUTP OFF', ':OUTP?', '*IDN?']);
  assert.ok(app.logs.some(entry => entry.level === 'ok' && entry.message.includes('장비 확인 완료')));
  await module.onDisconnect();
  assert.equal(app.commands.at(-1), ':OUTP OFF');
}

{
  const { module, app } = await loadScenario('two-wire', { ...baseSettings, sense: 2 });
  await module.onConnect();
  assert.ok(app.commands.includes(':SYST:RSEN OFF'));
  assert.equal(app.logs.some(entry => entry.message.includes('Sense 2-Wire')), false);
  await module.onDisconnect();
}

{
  const { module, app } = await loadScenario('output-text-response', baseSettings, { outputResponse: 'OFF' });
  await module.onConnect();
  assert.ok(app.logs.some(entry => entry.level === 'ok' && entry.message.includes('장비 확인 완료')));
  await module.onDisconnect();
}

{
  const { module, app } = await loadScenario('compliance', baseSettings, {
    reading: '1.000000E+00,1.000000E-03,2.500000E+00,8',
  });
  await module.onConnect();
  await confirmAndRun(module);
  assert.equal(app.count, 1);
  assert.equal(module.isRunning(), false);
  assert.ok(app.logs.some(entry => entry.message.includes('Compliance 감지')));
  assert.equal(app.commands.at(-2), ':OUTP OFF');
  assert.equal(app.commands.at(-1), ':OUTP?');
  await module.onDisconnect();
}

{
  const { module, app } = await loadScenario('wrong-device', baseSettings, {
    idn: 'GW INSTEK,PST-3202,123456,1.00',
  });
  await assert.rejects(module.onConnect(), /Keithley 2400/);
  assert.equal(module.isRunning(), false);
  assert.equal(app.commands.at(-1), ':OUTP OFF');
  assert.ok(app.logs.some(entry => entry.level === 'err' && entry.message.includes('Keithley 2400')));
  await module.onDisconnect();
}

{
  const { module, app } = await loadScenario('disconnect-read', baseSettings, { holdRead: true });
  await module.onConnect();
  const run = module.requestStart();
  await Promise.resolve();
  module.closeConfirmModal(true);
  await waitFor(() => app.commands.includes(':READ?'), 'pending READ?');
  await module.onDisconnect();
  await run;
  assert.equal(module.isRunning(), false);
  assert.equal(app.commands.at(-1), ':OUTP OFF');
}

{
  const cycleSettings = {
    ...baseSettings,
    testMode: 'cycle',
    sample: 'Cycle product',
    cycleLoops: 1,
    cycleInterval: 0.2,
    cycleSteps: [
      { source: 0.05, compliance: 0.001, duration: 0.2 },
      { source: 0.1, compliance: 0.001, duration: 0.2 },
    ],
  };
  const { module, app } = await loadScenario('cycle', cycleSettings);
  await module.onConnect();
  await confirmAndRun(module);
  assert.equal(app.count, 2);
  assert.equal(module.isRunning(), false);
  const firstZero = app.commands.indexOf(':SOUR:VOLT:LEV 0');
  const firstProtection = app.commands.indexOf(':SENS:CURR:PROT 0.001', firstZero + 1);
  const firstLevel = app.commands.indexOf(':SOUR:VOLT:LEV 0.05', firstProtection + 1);
  assert.ok(firstZero >= 0 && firstProtection > firstZero && firstLevel > firstProtection);
  const secondZero = app.commands.indexOf(':SOUR:VOLT:LEV 0', firstLevel + 1);
  const secondProtection = app.commands.indexOf(':SENS:CURR:PROT 0.001', secondZero + 1);
  const secondLevel = app.commands.indexOf(':SOUR:VOLT:LEV 0.1', secondProtection + 1);
  assert.ok(secondZero > firstLevel && secondProtection > secondZero && secondLevel > secondProtection);
  assert.equal(app.commands.at(-2), ':OUTP OFF');
  assert.equal(app.commands.at(-1), ':OUTP?');
  await module.onDisconnect();
}

console.log('Keithley 2400 virtual RS-232/GPIB lifecycle tests passed.');

// A source-only value in FORM:ELEM is a setpoint, not a measured readback
// (2400 manual, 18-49/50). Reproduce with deliberately different values.
for (const sourceMode of ['VOLT', 'CURR']) {
  const settings = { ...baseSettings, sourceMode, sourceValue: sourceMode === 'VOLT' ? 1 : 0.001, compliance: sourceMode === 'VOLT' ? 0.01 : 2 };
  const { module, app } = await loadScenario(`4-wire-readback-${sourceMode}`, settings, {
    concurrent: false, measureFunctions: [sourceMode === 'VOLT' ? 'CURR' : 'VOLT'],
    measured: { voltage: 0.9, current: 0.0008 }, autoOff: true,
  });
  await module.onConnect();
  await confirmAndRun(module);
  assert.equal(app.count, 1);
  assert.equal(app.displays.at(-1)[0], '1125.00', 'Resistance must use measured V/I, never the source setpoint');
  const outputOn = app.commands.indexOf(':OUTP ON');
  assert.ok(app.commands.indexOf(':SENS:FUNC?') < outputOn);
  assert.ok(app.commands.indexOf(':SOUR:CLE:AUTO OFF') < outputOn);
  assert.ok(app.commands.lastIndexOf(':SYST:RSEN?') < outputOn);
  await module.onDisconnect();
}

console.log('Keithley 2400 4-wire measured readback regression passed.');

{
  const { module, app } = await loadScenario('inherited-auto-ohms', baseSettings, {
    concurrent: true, measureFunctions: ['RES'],
  });
  await module.onConnect();
  await confirmAndRun(module);
  assert.equal(app.count, 1, 'An inherited resistance function must be removed before the run');
  assert.ok(app.commands.indexOf(':SENS:FUNC:OFF:ALL') < app.commands.indexOf(':SOUR:FUNC VOLT'));
  assert.ok(app.commands.includes(':ARM:COUN 1'));
  assert.ok(app.commands.includes(':TRIG:COUN 1'));
  assert.ok(app.commands.includes(':FORM:DATA ASC'));
  await module.onDisconnect();
}

{
  const { module, app } = await loadScenario('readback-not-applied', baseSettings, {
    functionResponse: '"CURR:DC"',
  });
  await module.onConnect();
  await confirmAndRun(module);
  assert.equal(app.count, 0);
  assert.equal(app.commands.includes(':OUTP ON'), false, 'Do not enable output when readback verification fails');
  assert.ok(app.logs.some(entry => entry.message.includes('실측')));
  await module.onDisconnect();
}

console.log('Keithley 2400 inherited-state and readback-verification regressions passed.');
