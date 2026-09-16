// Unit Test Suite for Etching Bridge (Tab) Features: Hole & Rectangular Slot/Notch
// Tests:
// 1. calculateBridgeFeatureGeometry math for hole and slot positioning
// 2. CAD entity generation (CIRCLE and closed LWPOLYLINE on ETCH_REMOVE layer)
// 3. Per-type batch application (applying on TYPE 1 affects all TYPE 1 bridges and leaves TYPE 2 untouched)
// 4. Batch-apply across all types (state.applyTabFeatureToAllTypes)
// 5. AutoCAD DXF and DWG export with strict CAD validation

import assert from 'assert';
import { calculateBridgesAndGaps, calculateSpecimenFeatureGeometry, buildCadEntities, validateCadGeometry } from '../instruments/etching_design/cad_builder.js';
import { EtchingState } from '../instruments/etching_design/state.js';
import { generateDXF } from '../instruments/etching_design/export_dxf.js';
import { generateDWG } from '../instruments/etching_design/export_dwg.js';

console.log('=== RUNNING ETCHING BRIDGE FEATURES TEST SUITE ===\n');

// ── Test 1: calculateBridgeFeatureGeometry Hole Math ────────────────────────
console.log('Test 1: Circular Hole Geometry Calculation');
const bridge = { top: 3.25, bot: 2.75, width: 0.5, centerY: 3.0 };
const x0 = 10;
const w = 15;
const bridgeL = 1.0;

// Exact center of the 15×6 bridge body: x0+7.5, y0+3.0
const bridgeBody = { x: x0, y: 20, width: 15, height: 6 };
const holeCenter = calculateSpecimenFeatureGeometry(bridgeBody, {
  type: 'hole',
  holeDia: 0.2,
  posX: 'center',
});
assert.strictEqual(holeCenter.type, 'hole');
assert.strictEqual(holeCenter.dia, 0.2);
assert.strictEqual(holeCenter.r, 0.1);
assert.strictEqual(holeCenter.cx, 17.5);
assert.strictEqual(holeCenter.cy, 23.0);

const fourPointHoles = calculateSpecimenFeatureGeometry(bridgeBody, {
  type: 'hole',
  holeDia: 0.2,
  posX: 'fourPoints',
  pointDistanceX: 11,
  pointDistanceY: 4,
});
assert.strictEqual(fourPointHoles.holes.length, 4);
assert.deepStrictEqual(fourPointHoles.holes.map(h => [h.cx, h.cy]), [
  [12, 21], [23, 21], [12, 25], [23, 25],
]);

const twoPointHoles = calculateSpecimenFeatureGeometry(bridgeBody, {
  type: 'hole', holeDia: 0.2, posX: 'twoPoints', pointDistanceX: 11,
});
assert.deepStrictEqual(twoPointHoles.holes.map(h => [h.cx, h.cy]), [[12, 23], [23, 23]]);

console.log('[PASS] Test 1: Hole math verified (15×6 body center and four corner points).\n');

// ── Test 2: calculateBridgeFeatureGeometry Rectangular Slot/Notch Math ─────
console.log('Test 2: Rectangular Slot & Notch Geometry Calculation');

// Center slot
const slotCenter = calculateSpecimenFeatureGeometry(bridgeBody, {
  type: 'slot',
  slotWidth: 0.4,
  slotHeight: 0.2,
  posX: 'center',
  posY: 'center',
});
assert.strictEqual(slotCenter.type, 'slot');
assert.strictEqual(slotCenter.slots.length, 1);
assert.strictEqual(slotCenter.slots[0].x1, 17.3);
assert.strictEqual(slotCenter.slots[0].x2, 17.7);
assert.strictEqual(slotCenter.slots[0].y1, 22.9);
assert.strictEqual(slotCenter.slots[0].y2, 23.1);

const slotFourPoints = calculateSpecimenFeatureGeometry(bridgeBody, {
  type: 'slot', slotWidth: 0.4, slotHeight: 0.2, posX: 'fourPoints', pointDistanceX: 11, pointDistanceY: 3,
});
assert.strictEqual(slotFourPoints.slots.length, 4);
assert.deepStrictEqual(slotFourPoints.slots.map(s => [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2]), [
  [12, 21.5], [23, 21.5], [12, 24.5], [23, 24.5],
]);

// Dual notch (top & bottom)
const slotDual = calculateSpecimenFeatureGeometry(bridgeBody, {
  type: 'slot',
  slotWidth: 0.3,
  slotHeight: 0.15,
  posX: 'center',
  posY: 'both',
});
assert.strictEqual(slotDual.slots.length, 2, 'Dual notch must generate 2 slot rectangles');
const topNotch = slotDual.slots.find(s => s.notch === 'top');
const botNotch = slotDual.slots.find(s => s.notch === 'bottom');
assert(topNotch, 'Top notch must exist');
assert(botNotch, 'Bottom notch must exist');
assert.strictEqual(topNotch.y2, 26);
assert.strictEqual(topNotch.y1, 25.85);
assert.strictEqual(botNotch.y1, 20);
assert.strictEqual(botNotch.y2, 20.15);

console.log('[PASS] Test 2: Slot/Notch math verified (center, dual notches).\n');

// ── Test 3: Per-Type Batch Application in Mixed Mode ───────────────────────
console.log('Test 3: Per-Type Batch Application in State & Geometry');
const state = new EtchingState();
state.setMode('mixed');

// Edit the draft for TYPE 1. Manufacturing geometry must remain unchanged
// until the user previews one specimen and confirms type-wide application.
state.setTabFeature(0, {
  type: 'hole',
  holeDia: 0.25,
  posX: 'fourPoints',
});

// TYPE 2 (index 1) remains 'none'
assert.strictEqual(state.mixed.types[0].tabs.feature.type, 'hole');
assert.strictEqual(state.mixed.types[1].tabs.feature.type, 'none');

const draftGeom = state.getGeometry();
const draftCad = buildCadEntities(draftGeom, { mode: 'MANUFACTURING', exportEtchRemove: true });
const draftCircles = draftCad.entities.filter(e => e.type === 'circle' && e.layer === 'ETCH_REMOVE');
assert.strictEqual(draftCircles.length, 0, 'Draft hole must not enter manufacturing geometry before Apply');

state.applyTabFeatureToType(0);
assert.strictEqual(state.mixed.types[0].tabs.appliedFeature.type, 'hole');
assert.strictEqual(state.mixed.types[1].tabs.appliedFeature.type, 'none');

const geom = state.getGeometry();
const cadModel = buildCadEntities(geom, { mode: 'MANUFACTURING', exportEtchRemove: true });

// Check ETCH_REMOVE layer circles (should only come from TYPE 1 samples)
const circles = cadModel.entities.filter(e => e.type === 'circle' && e.layer === 'ETCH_REMOVE');
assert(circles.length > 0, 'Must have circles on ETCH_REMOVE layer for TYPE 1 bridges');

// Each TYPE 1 bridge body receives four corner-point through-holes.
const type1Cols = state.mixed.types[0].cols || 4;
const type1Rows = state.mixed.types[0].rows || 10;
const expectedCircles = type1Cols * type1Rows * 4;
assert.strictEqual(circles.length, expectedCircles, `Expected ${expectedCircles} circles for TYPE 1, got ${circles.length}`);

console.log(`[PASS] Test 3: Per-type batch application verified (${circles.length} circles on TYPE 1, TYPE 2 untouched).\n`);

// ── Test 4: Batch Apply to All Types ───────────────────────────────────────
console.log('Test 4: state.applyTabFeatureToAllTypes Batch Synchronization');
// Switch TYPE 1 to slot notch and apply to all types
state.setTabFeature(0, {
  type: 'slot',
  slotWidth: 0.3,
  slotHeight: 0.1,
  posX: 'center',
  posY: 'both',
});
state.applyTabFeatureToAllTypes(0);

state.mixed.types.forEach((t, idx) => {
  assert.strictEqual(t.tabs.feature.type, 'slot', `TYPE ${idx + 1} must now have slot feature`);
  assert.strictEqual(t.tabs.feature.posY, 'both');
});

const geomAll = state.getGeometry();
const cadModelAll = buildCadEntities(geomAll, { mode: 'MANUFACTURING', exportEtchRemove: true });
const slotPolys = cadModelAll.entities.filter(e => e.type === 'lwpolyline' && e.layer === 'ETCH_REMOVE');
assert(slotPolys.length > 0, 'All types should now have slot polylines on ETCH_REMOVE');

console.log('[PASS] Test 4: applyTabFeatureToAllTypes successfully synchronized all types.\n');

// ── Test 5: CAD Validation, DXF, and DWG Export ─────────────────────────────
console.log('Test 5: CAD Geometry Validation, DXF & DWG Generation');
const validation = validateCadGeometry(cadModelAll);
assert.strictEqual(validation.valid, true, `CAD geometry must be 100% valid: ${validation.errors.join('; ')}`);
assert.strictEqual(validation.errors.length, 0);

// DXF export check
const dxf = generateDXF(geomAll, { mode: 'MANUFACTURING' });
assert(dxf.includes('ETCH_REMOVE'), 'DXF must contain ETCH_REMOVE layer');
assert(dxf.includes('0\nPOLYLINE\n8\nETCH_REMOVE'), 'DXF must contain R12 POLYLINE on ETCH_REMOVE');

// DWG export check
const dwg = generateDWG(geomAll, { mode: 'MANUFACTURING' });
assert(dwg instanceof Uint8Array);
assert(dwg.length > 5000, 'DWG buffer must be non-empty');
const header = Buffer.from(dwg.buffer, 0, 6).toString('ascii');
assert.strictEqual(header, 'AC1021', 'DWG must have AC1021 header for AutoCAD 2007+');

console.log('[PASS] Test 5: CAD validation 0 errors, DXF & DWG exports verified.\n');

console.log('=== ALL 5 BRIDGE FEATURE TESTS PASSED ===\n');
