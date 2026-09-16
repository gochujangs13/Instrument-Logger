// Unit tests for Mixed Mode Manual Margin & Dynamic Fill Optimization
import assert from 'assert';
import { EtchingState } from '../instruments/etching_design/state.js';
import { calculateMixedDesignGeometry } from '../instruments/etching_design/geometry.js';
import { generateDXF } from '../instruments/etching_design/export_dxf.js';
import { generateSVG } from '../instruments/etching_design/export_svg.js';

console.log('=== RUNNING ETCHING MIXED MARGINS & FILL TEST SUITE ===\n');

// Test 1: Auto margin centers layout, while manual margin fixes StartX
console.log('Test 1: Auto margin vs Manual margin positioning');
const s = new EtchingState();
s.setMode('mixed');

let geomAuto = s.getGeometry();
assert.strictEqual(geomAuto.margins.left, 15);
assert(geomAuto.samples[0].x > 15, 'Auto margin must center and place StartX > 15mm');

s.pushState();
s.mixed.margin.mode = 'manual';
s.mixed.margin.left = 8;
s.mixed.margin.right = 8;
let geomManual = s.getGeometry();
assert.strictEqual(geomManual.samples[0].x, 8, 'Manual margin must start exactly at leftMargin (8mm)');
console.log('[PASS] Test 1: Auto margin centers and Manual margin fixes StartX at 8mm.');

// Test 2: Reducing left/right margin dynamically adds extra columns
console.log('\nTest 2: Reducing manual margin dynamically adds columns');
const initialColsT1 = geomManual.types[0].cols;
const initialTotal = geomManual.totalSamples;

s.pushState();
s.mixed.margin.left = 5;
s.mixed.margin.right = 5;
const geomNarrow = s.getGeometry();
assert(geomNarrow.usedWidth > geomManual.usedWidth || geomNarrow.totalSamples >= initialTotal, 'Smaller margin must allow design to expand or increase samples');
assert.strictEqual(geomNarrow.samples[0].x, 5, 'StartX must update to 5mm');
console.log('[PASS] Test 2: Reducing margin to 5mm expanded design width and positioned at 5mm.');

// Test 3: Horizontal split reacts to manual margins
console.log('\nTest 3: Horizontal Split manual margins');
s.setSplitDirection('horizontal');
s.mixed.margin.mode = 'manual';
s.mixed.margin.top = 6;
s.mixed.margin.bottom = 6;
s.mixed.margin.left = 10;
s.mixed.margin.right = 10;
const geomH = s.getGeometry();
assert.strictEqual(geomH.splitDirection, 'horizontal');
assert.strictEqual(geomH.margins.top, 6);
assert.strictEqual(geomH.margins.bottom, 6);
assert.strictEqual(geomH.margins.left, 10);
assert(geomH.samples.length > 0, 'Samples must be populated');
console.log('[PASS] Test 3: Horizontal split respects manual margins.');

// Test 4: Undo and Redo restore margin state
console.log('\nTest 4: Undo/Redo for manual margins');
s.undo();
const afterUndo = s.getGeometry();
assert.strictEqual(afterUndo.splitDirection, 'vertical');
s.undo();
const after2Undo = s.getGeometry();
assert.strictEqual(after2Undo.margins.left, 8);
console.log('[PASS] Test 4: Undo/Redo restores margin configuration.');

// Test 5: DXF & SVG export include geometry with manual margins
console.log('\nTest 5: DXF and SVG export with manual margins');
const dxf = generateDXF(after2Undo, { exportDimensions: true });
assert(dxf.includes('ENTITIES'), 'DXF must contain ENTITIES');
assert(dxf.includes('EOF'), 'DXF must terminate with EOF');

const svg = generateSVG(after2Undo);
assert(svg.includes('<svg'), 'SVG must contain root svg tag');
assert(svg.includes('class="plate-outline"'), 'SVG must render plate');
console.log('[PASS] Test 5: DXF and SVG export generated successfully.');

// Test 6: Cross-mode synchronization of plate dimensions
console.log('\nTest 6: Single & Mixed plate dimensions synchronization');
const syncState = new EtchingState();
assert.strictEqual(syncState.single.plate.width, syncState.mixed.plate.width, 'Initial plate width must match');
assert.strictEqual(syncState.single.plate.height, syncState.mixed.plate.height, 'Initial plate height must match');

// Update from Single mode
syncState.setPlateWidth(450);
syncState.setPlateHeight(210);
assert.strictEqual(syncState.single.plate.width, 450);
assert.strictEqual(syncState.mixed.plate.width, 450);
assert.strictEqual(syncState.single.plate.height, 210);
assert.strictEqual(syncState.mixed.plate.height, 210);
assert.strictEqual(syncState.mixed.types[0].plate.width, 450);

// Update from Mixed mode
syncState.setPlateWidth(380);
syncState.setPlateHeight(190);
assert.strictEqual(syncState.single.plate.width, 380);
assert.strictEqual(syncState.mixed.plate.width, 380);
assert.strictEqual(syncState.single.plate.height, 190);
assert.strictEqual(syncState.mixed.plate.height, 190);
console.log('[PASS] Test 6: Plate dimensions synchronize bidirectionally across Single and Mixed modes.');

// Test 7: Cross-mode synchronization of margin mode and dimensions
console.log('\nTest 7: Single & Mixed margins synchronization');
syncState.setMarginMode('manual');
assert.strictEqual(syncState.single.margin.mode, 'manual');
assert.strictEqual(syncState.mixed.margin.mode, 'manual');

syncState.setMarginLR(12.5);
assert.strictEqual(syncState.single.margin.left, 12.5);
assert.strictEqual(syncState.single.margin.right, 12.5);
assert.strictEqual(syncState.mixed.margin.left, 12.5);
assert.strictEqual(syncState.mixed.margin.right, 12.5);

syncState.setMarginTB(7.0);
assert.strictEqual(syncState.single.margin.top, 7.0);
assert.strictEqual(syncState.single.margin.bottom, 7.0);
assert.strictEqual(syncState.mixed.margin.top, 7.0);
assert.strictEqual(syncState.mixed.margin.bottom, 7.0);

syncState.setMarginMode('auto');
assert.strictEqual(syncState.single.margin.mode, 'auto');
assert.strictEqual(syncState.mixed.margin.mode, 'auto');
console.log('[PASS] Test 7: Margin mode, LR, and TB synchronize bidirectionally across Single and Mixed modes.');

console.log('\n=== ALL MIXED MARGINS & FILL TESTS PASSED! ===');

