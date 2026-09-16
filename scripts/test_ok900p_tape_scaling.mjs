import assert from 'node:assert/strict';
import { rescaleElementsForTapeWidth, serialPrintPlan } from '../instruments/epson_ok900p.js';

const original = [
  { id:'title', type:'text', x:6.5, y:5.2, w:38, h:5, size:9 },
  { id:'serial', type:'text', x:6.5, y:12, w:38, h:6.8, size:11 },
  { id:'qr', type:'qrcode', x:47.5, y:4.8, w:14.5, h:14.5 },
  { id:'image', type:'image', x:64, y:5, w:12, h:12 },
];
const scaled = structuredClone(original);
rescaleElementsForTapeWidth(scaled, 24, 9);

const expectedRatio = 6.5 / 18.5;
assert.ok(Math.abs(scaled[0].size / original[0].size - expectedRatio) < 0.001);
assert.ok(Math.abs(scaled[1].size / original[1].size - expectedRatio) < 0.001);
assert.ok(Math.abs(scaled[2].w / original[2].w - expectedRatio) < 0.001);
assert.ok(Math.abs(scaled[3].h / original[3].h - expectedRatio) < 0.001);
for (const element of scaled) {
  assert.ok(element.y >= 1.25);
  assert.ok(element.y + element.h <= 7.75 + 1e-9);
}

rescaleElementsForTapeWidth(scaled, 9, 24);
for (let i = 0; i < original.length; i++) {
  for (const field of ['x','y','w','h']) {
    assert.ok(Math.abs(scaled[i][field] - original[i][field]) <= 0.01, `${i}.${field}`);
  }
  if (original[i].type === 'text') assert.ok(Math.abs(scaled[i].size - original[i].size) <= 0.01);
}

const serialFive = serialPrintPlan({ serialStart:1, serialEnd:5, serialStep:1, serialPad:3 });
assert.deepEqual(serialFive, {
  ok:true, start:1, end:5, step:1, digits:3, count:5,
  values:['001','002','003','004','005'], offsets:[0,1,2,3,4],
});
assert.deepEqual(serialPrintPlan({ serialStart:1, serialEnd:5, serialStep:2, serialPad:3 }).values, ['001','003','005']);
assert.equal(serialPrintPlan({ serialStart:5, serialEnd:1, serialStep:1, serialPad:3 }).ok, false);
assert.equal(serialPrintPlan({ serialStart:1, serialEnd:1000, serialStep:1, serialPad:3 }).reason, 'too_large');

console.log('OK900P tape scaling and serial print planning tests passed.');
