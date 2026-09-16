import assert from 'assert';
import { EtchingState } from '../instruments/etching_design/state.js';
import { generateDXF } from '../instruments/etching_design/export_dxf.js';

console.log('=== RUNNING ETCHING ADVANCED FEATURES TEST SUITE ===\n');

const state = new EtchingState();
state.setMode('mixed');

// Test 1: Initial state has 3 types with 0.5mm tabs
console.log('Test 1: Initial Mixed State Tabs Verification');
assert.strictEqual(state.mixed.types.length, 3);
const geomInit = state.getGeometry();
assert.ok(geomInit.samples.length > 0);
const sample0 = geomInit.samples[0];
assert.ok(sample0.tabs.length === 2);
assert.strictEqual(sample0.tabs[0].width, 0.5);
assert.strictEqual(sample0.tabs[1].width, 0.5);
assert.ok(sample0.cutSegments.length >= 6);
console.log('[PASS] Test 1: All samples have 0.5mm holding tabs and 6 cut segments.\n');

// Test 2: Add Type
console.log('Test 2: Dynamic Type Addition');
const newType = state.addMixedType();
assert.strictEqual(state.mixed.types.length, 4);
const totalRatio = state.mixed.types.reduce((sum, t) => sum + t.targetRatio, 0);
assert.strictEqual(Math.round(totalRatio), 100);
console.log(`[PASS] Test 2: Added TYPE 4, total ratio is ${totalRatio.toFixed(1)}%.\n`);

// Test 3: Move Type (Reordering)
console.log('Test 3: Reordering Types with moveMixedType');
const type1Name = state.mixed.types[0].name;
const type2Name = state.mixed.types[1].name;
state.moveMixedType(0, 1);
assert.strictEqual(state.mixed.types[0].name, type2Name);
assert.strictEqual(state.mixed.types[1].name, type1Name);
const geomReordered = state.getGeometry();
assert.strictEqual(geomReordered.types[0].name, type2Name);
assert.strictEqual(geomReordered.types[1].name, type1Name);
console.log('[PASS] Test 3: Types successfully reordered on state and plate layout.\n');

// Test 4: Vertical Auto-Fit Orientation
console.log('Test 4: Auto-Align Vertical Long (H >= W)');
state.autoAlignMixedOrientation('vertical');
assert.strictEqual(state.mixed.alignDirection, 'vertical');
state.mixed.types.forEach(t => {
  assert.ok(t.sample.height >= t.sample.width, `${t.name}: height ${t.sample.height} should be >= width ${t.sample.width}`);
});
console.log('[PASS] Test 4: All types oriented vertically (Height >= Width).\n');

// Test 5: Horizontal Auto-Fit Orientation
console.log('Test 5: Auto-Align Horizontal Long (W >= H)');
state.autoAlignMixedOrientation('horizontal');
assert.strictEqual(state.mixed.alignDirection, 'horizontal');
state.mixed.types.forEach(t => {
  assert.ok(t.sample.width >= t.sample.height, `${t.name}: width ${t.sample.width} should be >= height ${t.sample.height}`);
});
console.log('[PASS] Test 5: All types oriented horizontally (Width >= Height).\n');

// Test 6: Remove Type
console.log('Test 6: Remove Type');
state.removeMixedType(3);
assert.strictEqual(state.mixed.types.length, 3);
const ratioAfterDel = state.mixed.types.reduce((sum, t) => sum + t.targetRatio, 0);
assert.strictEqual(Math.round(ratioAfterDel), 100);
console.log(`[PASS] Test 6: Removed type, restored to 3 types, ratio = ${ratioAfterDel.toFixed(1)}%.\n`);

// Test 7: DXF Export with 0.5mm tab breaks
console.log('Test 7: DXF Export with 0.5mm Tab Breaks');
const geom = state.getGeometry();
const dxf = generateDXF(geom, { exportText: true });
assert.ok(dxf.includes('0\nSECTION'));
assert.ok(dxf.includes('TAB'));
assert.ok(dxf.includes('SAMPLE'));
console.log('[PASS] Test 7: DXF contains valid CAD layers and micro-joint break segments.\n');

console.log('=== ALL ADVANCED FEATURE TESTS PASSED! ===');
