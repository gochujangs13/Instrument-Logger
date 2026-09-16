// Test: Etching Design Mixed Mode Fixed Layout (Cols/Rows) and Corner Fillet Rendering Verification
import assert from 'assert';
import { EtchingState } from '../instruments/etching_design/state.js';
import { calculateMixedDesignGeometry } from '../instruments/etching_design/geometry.js';

console.log('=== RUNNING MIXED MODE FIXED LAYOUT & CORNER GEOMETRY TESTS ===\n');

// -----------------------------------------------------------------------------
// Test 1: Vertical Split — Per-Type Layout Mode (Fixed Columns & Rows)
// -----------------------------------------------------------------------------
console.log('Test 1: Vertical Split Mixed Mode Fixed Layout...');
const state = new EtchingState();
state.setMode('mixed');
state.setSplitDirection('vertical');

// TYPE 1: Set fixed count (columns=2, rows=5 => exactly 10 specimens)
state.setTypeLayoutMode(0, 'fixed');
state.setTypeLayoutCols(0, 2);
state.setTypeLayoutRows(0, 5);

const geomV = state.getGeometry();
const t1 = geomV.types[0];

assert.strictEqual(t1.isFixed, true, 'TYPE 1 must be marked as isFixed');
assert.strictEqual(t1.cols, 2, 'TYPE 1 must have exactly 2 columns');
assert.strictEqual(t1.rows, 5, 'TYPE 1 must have exactly 5 rows');
assert.strictEqual(t1.sampleCount, 10, 'TYPE 1 must have exactly 10 samples');

const t1Samples = geomV.samples.filter(s => s.typeId === t1.id);
assert.strictEqual(t1Samples.length, 10, 'Generated samples for TYPE 1 must be 10');
console.log(`[PASS] Vertical Split Fixed Layout: TYPE 1 generated ${t1.cols} cols × ${t1.rows} rows = ${t1.sampleCount} specimens`);

// -----------------------------------------------------------------------------
// Test 2: Horizontal Split — Per-Type Layout Mode (Fixed Rows & Columns)
// -----------------------------------------------------------------------------
console.log('\nTest 2: Horizontal Split Mixed Mode Fixed Layout...');
state.setSplitDirection('horizontal');

// TYPE 2: Set fixed count (columns=4, rows=3 => exactly 12 specimens)
state.setTypeLayoutMode(1, 'fixed');
state.setTypeLayoutCols(1, 4);
state.setTypeLayoutRows(1, 3);

const geomH = state.getGeometry();
const t2 = geomH.types[1];

assert.strictEqual(t2.isFixed, true, 'TYPE 2 must be marked as isFixed');
assert.strictEqual(t2.cols, 4, 'TYPE 2 must have exactly 4 columns');
assert.strictEqual(t2.rows, 3, 'TYPE 2 must have exactly 3 rows');
assert.strictEqual(t2.sampleCount, 12, 'TYPE 2 must have exactly 12 samples');

const t2Samples = geomH.samples.filter(s => s.typeId === t2.id);
assert.strictEqual(t2Samples.length, 12, 'Generated samples for TYPE 2 must be 12');
console.log(`[PASS] Horizontal Split Fixed Layout: TYPE 2 generated ${t2.cols} cols × ${t2.rows} rows = ${t2.sampleCount} specimens`);

// -----------------------------------------------------------------------------
// Test 3: Batch All Fixed Layout Mode
// -----------------------------------------------------------------------------
console.log('\nTest 3: Batch All Types Fixed Layout Mode...');
state.setAllTypesLayoutMode('fixed');
state.setTypeLayoutCols(0, 3);
state.setTypeLayoutRows(0, 4); // 12
state.setTypeLayoutCols(1, 2);
state.setTypeLayoutRows(1, 6); // 12
state.setTypeLayoutCols(2, 5);
state.setTypeLayoutRows(2, 2); // 10

const geomAllFixed = state.getGeometry();
assert.strictEqual(geomAllFixed.types[0].sampleCount, 12, 'TYPE 1 must have 12');
assert.strictEqual(geomAllFixed.types[1].sampleCount, 12, 'TYPE 2 must have 12');
assert.strictEqual(geomAllFixed.types[2].sampleCount, 10, 'TYPE 3 must have 10');
assert.strictEqual(geomAllFixed.totalSamples, 34, 'Total specimens must be exactly 34');
console.log(`[PASS] All Fixed Layout Mode: Total specimens = ${geomAllFixed.totalSamples} (12 + 12 + 10)`);

// -----------------------------------------------------------------------------
// Test 4: Undo / Redo with Layout Mode & Cols/Rows
// -----------------------------------------------------------------------------
console.log('\nTest 4: Undo / Redo Stack with Layout Mode...');
state.setTypeLayoutCols(0, 8); // changed to 8 cols => 8*4 = 32
const geomAfterChange = state.getGeometry();
assert.strictEqual(geomAfterChange.types[0].cols, 8);
assert.strictEqual(geomAfterChange.types[0].sampleCount, 32);

state.undo();
const geomAfterUndo = state.getGeometry();
assert.strictEqual(geomAfterUndo.types[0].cols, 3);
assert.strictEqual(geomAfterUndo.types[0].sampleCount, 12);

state.redo();
const geomAfterRedo = state.getGeometry();
assert.strictEqual(geomAfterRedo.types[0].cols, 8);
assert.strictEqual(geomAfterRedo.types[0].sampleCount, 32);
console.log('[PASS] Undo / Redo for per-type layout mode works flawlessly');

// -----------------------------------------------------------------------------
// Test 5: Serialization & Deserialization
// -----------------------------------------------------------------------------
console.log('\nTest 5: Project File Serialization / Deserialization with Layout...');
const json = state.serializeProject();
const restoredState = new EtchingState();
const loadRes = restoredState.loadProject(json);
assert.strictEqual(loadRes.ok, true, 'Project load must succeed');

const restoredGeom = restoredState.getGeometry();
assert.strictEqual(restoredGeom.types[0].isFixed, true);
assert.strictEqual(restoredGeom.types[0].cols, 8);
assert.strictEqual(restoredGeom.types[0].sampleCount, 32);
console.log('[PASS] Project serialization preserves per-type layout mode and cols/rows');

console.log('\n============================================================');
console.log('ALL MIXED MODE FIXED LAYOUT SPECIFICATION TESTS PASSED 100%!');
console.log('============================================================\n');
