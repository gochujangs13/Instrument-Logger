import assert from 'node:assert';
import { calculateMixedDesignGeometry } from '../instruments/etching_design/geometry.js';
import { EtchingState } from '../instruments/etching_design/state.js';
import { generateDXF } from '../instruments/etching_design/export_dxf.js';
import { generateSVG } from '../instruments/etching_design/export_svg.js';

console.log('=== RUNNING ETCHING SPLIT DIRECTION TEST SUITE ===\n');

// Test 1: Horizontal Split Geometry Calculation
console.log('Test 1: Horizontal Split Geometry Math');
const geomH = calculateMixedDesignGeometry({
  plate: { width: 450, height: 297 },
  boundaryWidth: 5,
  splitDirection: 'horizontal',
  margin: { mode: 'auto', left: 15, right: 15, top: 4.5, bottom: 4.5 },
  types: [
    { id: 'type1', name: 'TYPE 1 (15×6)', sample: { width: 15, height: 6 }, targetRatio: 33.3, gaps: { horizontalGap: 3, verticalGap: 1 } },
    { id: 'type2', name: 'TYPE 2 (50×10)', sample: { width: 50, height: 10 }, targetRatio: 33.3, gaps: { horizontalGap: 3, verticalGap: 1 } },
    { id: 'type3', name: 'TYPE 3 (40×3)', sample: { width: 40, height: 3 }, targetRatio: 33.4, gaps: { horizontalGap: 3, verticalGap: 1 } },
  ],
});

assert.strictEqual(geomH.splitDirection, 'horizontal', 'splitDirection must be horizontal');
assert.strictEqual(geomH.types.length, 3, 'Must have 3 types');
assert.strictEqual(geomH.boundaries.length, 2, 'Must have 2 horizontal boundaries between 3 types');
assert(geomH.totalSamples > 0, 'Must produce samples');

// Verify Boundaries are horizontal strips
geomH.boundaries.forEach(b => {
  assert.strictEqual(b.orientation, 'horizontal', 'Boundary must be horizontal');
  assert.strictEqual(b.width, 450, 'Boundary width must span plate width');
  assert.strictEqual(b.height, 5, 'Boundary height must equal boundaryWidth');
});

// Verify Top-to-Bottom order: TYPE 1 Y > TYPE 2 Y > TYPE 3 Y
const t1Samples = geomH.samples.filter(s => s.typeId === 'type1');
const t2Samples = geomH.samples.filter(s => s.typeId === 'type2');
const t3Samples = geomH.samples.filter(s => s.typeId === 'type3');

const minT1Y = Math.min(...t1Samples.map(s => s.y));
const maxT2Y = Math.max(...t2Samples.map(s => s.y));
const minT2Y = Math.min(...t2Samples.map(s => s.y));
const maxT3Y = Math.max(...t3Samples.map(s => s.y));

assert(minT1Y > maxT2Y, `TYPE 1 (상단) min Y (${minT1Y}) must be greater than TYPE 2 (중단) max Y (${maxT2Y})`);
assert(minT2Y > maxT3Y, `TYPE 2 (중단) min Y (${minT2Y}) must be greater than TYPE 3 (하단) max Y (${maxT3Y})`);

console.log(`[PASS] Test 1: Horizontal split successfully positions TYPE 1 (상단) > TYPE 2 (중단) > TYPE 3 (하단). Total: ${geomH.totalSamples} pcs`);

// Test 2: State management toggle and undo/redo
console.log('\nTest 2: State setSplitDirection and Undo/Redo');
const state = new EtchingState();
state.setMode('mixed');
assert.strictEqual(state.mixed.splitDirection, 'vertical', 'Default splitDirection is vertical');

state.setSplitDirection('horizontal');
assert.strictEqual(state.mixed.splitDirection, 'horizontal', 'splitDirection changed to horizontal');
const geomFromStateH = state.getGeometry();
assert.strictEqual(geomFromStateH.splitDirection, 'horizontal');

state.undo();
assert.strictEqual(state.mixed.splitDirection, 'vertical', 'Undo restores vertical splitDirection');
state.redo();
assert.strictEqual(state.mixed.splitDirection, 'horizontal', 'Redo restores horizontal splitDirection');
console.log('[PASS] Test 2: State toggle and Undo/Redo fully verified');

// Test 3: DXF and SVG export with horizontal split
console.log('\nTest 3: DXF & SVG Export validation');
const dxf = generateDXF(geomH, { exportDimensions: true });
assert(dxf.includes('SECTION'), 'DXF must contain SECTION');
assert(dxf.includes('BOUNDARY'), 'DXF must contain BOUNDARY layer');

const svg = generateSVG(geomH, { showDimensions: true });
assert(svg.includes('boundary-strip'), 'SVG must include boundary-strip elements');
assert(svg.includes('sample-body'), 'SVG must include sample-body elements');
console.log('[PASS] Test 3: DXF and SVG export correctly encode horizontal boundaries');

console.log('\n=== ALL SPLIT DIRECTION TESTS PASSED! ===');
