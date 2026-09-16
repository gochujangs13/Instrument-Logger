import assert from 'node:assert/strict';
import fs from 'node:fs';

const core = fs.readFileSync(new URL('../core.js', import.meta.url), 'utf8');
const start = core.indexOf('class SerialController');
const end = core.indexOf('// ── Editable Grid', start);
assert.ok(start >= 0 && end > start, 'SerialController source block not found');

const SerialController = new Function(`${core.slice(start, end)}; return SerialController;`)();

let physicalPortClosed = false;
let destinationClosed = false;
const port = {
  readable: new ReadableStream({ cancel() {} }),
  writable: new WritableStream({
    write() {},
    close() { destinationClosed = true; },
  }),
  async open() {},
  async close() {
    if (this.readable.locked || this.writable.locked) {
      throw new Error('Port streams are still locked');
    }
    physicalPortClosed = true;
  },
};

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { serial: { requestPort: async () => port } },
});

const controller = new SerialController();
await controller.connect({ baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 });
await controller.sendCmd('*IDN?\r');
await controller.disconnect();

assert.equal(destinationClosed, true, 'encoder pipe did not close the port writable stream');
assert.equal(physicalPortClosed, true, 'physical port was not closed after stream locks were released');
assert.equal(controller.port, null);
assert.equal(controller.writer, null);
assert.equal(controller.reader, null);
assert.equal(controller.writePipePromise, null);
assert.equal(controller.isConnected, false);

console.log('SerialController disconnect pipeline test passed.');
