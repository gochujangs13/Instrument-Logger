// Test Suite for Bridge & ETCH_REMOVE Closed Geometry Engine
// Verifies:
// 1. Precise bridge & gap calculations (e.g. 6.0mm - 0.5mm = 5.5mm, 2.75mm top/bottom gaps)
// 2. Multiple bridges support (Bridge count = 2 -> 3 gaps)
// 3. All ETCH_REMOVE entities are closed LWPOLYLINE (Closed = YES, 70=1)
// 4. DXF and DWG generation with native closed polylines on ETCH_REMOVE layer

import assert from 'assert';
import fs from 'fs';
import { calculateBridgesAndGaps, buildCadEntities, validateCadGeometry } from '../instruments/etching_design/cad_builder.js';
import { generateDXF } from '../instruments/etching_design/export_dxf.js';
import { generateDWG } from '../instruments/etching_design/export_dwg.js';

console.log('=== RUNNING BRIDGE & ETCH_REMOVE CLOSED GEOMETRY TEST SUITE ===\n');

// ── Test 1: calculateBridgesAndGaps Math Verification ───────────────────────
console.log('Test 1: Single Center Bridge (Sample H=6.0mm, Bridge W=0.5mm)');
const res1 = calculateBridgesAndGaps(0, 6.0, 1, 0.5);

assert.strictEqual(res1.bridges.length, 1, 'Should have exactly 1 bridge');
assert.strictEqual(res1.gaps.length, 2, 'Should have exactly 2 gaps (lower & upper)');

const b1 = res1.bridges[0];
assert.strictEqual(b1.width, 0.5, 'Bridge width should be 0.5 mm');
assert.strictEqual(b1.bot, 2.75, 'Bridge bottom should be 2.75 mm (3.0 - 0.25)');
assert.strictEqual(b1.top, 3.25, 'Bridge top should be 3.25 mm (3.0 + 0.25)');

assert.strictEqual(res1.gaps[0].bot, 0.0, 'Lower gap bottom should be 0.0 mm');
assert.strictEqual(res1.gaps[0].top, 2.75, 'Lower gap top should be 2.75 mm');
assert.strictEqual(res1.gaps[0].height, 2.75, 'Lower gap height should be 2.75 mm');

assert.strictEqual(res1.gaps[1].bot, 3.25, 'Upper gap bottom should be 3.25 mm');
assert.strictEqual(res1.gaps[1].top, 6.0, 'Upper gap top should be 6.0 mm');
assert.strictEqual(res1.gaps[1].height, 2.75, 'Upper gap height should be 2.75 mm');

const totalEtchLength = res1.gaps[0].height + res1.gaps[1].height;
assert.strictEqual(totalEtchLength, 5.5, 'Total etch remove height must be 6.0 - 0.5 = 5.5 mm');
console.log('[PASS] Test 1: Math verified: 6.0mm - 0.5mm bridge = 5.5mm etch remove (2.75mm top + 2.75mm bottom)\n');

// ── Test 2: Multiple Bridges Support (Count = 2) ────────────────────────────
console.log('Test 2: Multiple Bridges (Sample H=12.0mm, Bridge W=0.5mm, Count=2)');
const res2 = calculateBridgesAndGaps(0, 12.0, 2, 0.5);

assert.strictEqual(res2.bridges.length, 2, 'Should have exactly 2 bridges');
assert.strictEqual(res2.gaps.length, 3, 'Should have exactly 3 gaps (bottom, middle, top)');
console.log(`[PASS] Test 2: 2 Bridges generate 3 distinct etch removal gaps\n`);

// ── Test 3: ETCH_REMOVE Entities are Closed Polylines ──────────────────────
console.log('Test 3: CAD Model ETCH_REMOVE Layer Closed LWPOLYLINE Check');
const sampleGeom = {
  plate: { width: 100, height: 100 },
  samples: [
    {
      id: 's1',
      x: 20,
      y: 30,
      width: 15,
      height: 6,
      cornerRadius: 0,
      tabs: [{ width: 0.5, length: 1.5, count: 1 }],
    },
  ],
};

const cadModel = buildCadEntities(sampleGeom, { mode: 'MANUFACTURING', exportEtchRemove: true });
const removePolys = cadModel.entities.filter(e => e.layer === 'ETCH_REMOVE');

assert(removePolys.length >= 2, 'Should have at least 2 ETCH_REMOVE polylines (left & right gaps)');

removePolys.forEach((p, idx) => {
  assert.strictEqual(p.type, 'lwpolyline', `Entity ${idx} must be lwpolyline`);
  assert.strictEqual(p.closed, true, `Entity ${idx} must have closed === true`);
  assert.strictEqual(p.points.length, 4, `Entity ${idx} must be a 4-point rectangle`);
});

// Check left lower gap geometry: X from 20 - 1.5 = 18.5 to 20, Y from 30 to 32.75
const leftLower = removePolys.find(p => Math.abs(p.points[0][0] - 18.5) < 0.01 && Math.abs(p.points[0][1] - 30) < 0.01);
assert(leftLower, 'Must find left lower gap ETCH_REMOVE closed polyline');
assert.strictEqual(leftLower.closed, true, 'Left lower gap must be closed = true');
console.log('[PASS] Test 3: All ETCH_REMOVE entities are closed LWPOLYLINEs with closed=true\n');

// ── Test 4: DXF Generation with 0\nLWPOLYLINE\n8\nETCH_REMOVE\n ─────────────
console.log('Test 4: DXF Output Format for ETCH_REMOVE');
const dxf = generateDXF(sampleGeom, { mode: 'MANUFACTURING' });

assert(dxf.includes('0\nPOLYLINE\n8\nETCH_REMOVE\n'), 'DXF must contain R12 POLYLINE on ETCH_REMOVE layer');
assert(dxf.includes('70\n1\n'), 'DXF POLYLINE must have group code 70 = 1 (Closed = YES)');
assert(dxf.includes('ETCH_BRIDGE'), 'DXF must contain ETCH_BRIDGE layer for metal keep connections');
console.log('[PASS] Test 4: DXF correctly encodes R12 POLYLINE with 70=1 (Closed) on ETCH_REMOVE layer\n');

// ── Test 5: DWG Generation with Closed LwPolyline ───────────────────────────
console.log('Test 5: Native Binary DWG Generation with Closed LwPolyline');
const dwg = generateDWG(sampleGeom, { mode: 'MANUFACTURING' });
const header = Buffer.from(dwg.buffer, 0, 6).toString('ascii');
assert.strictEqual(header, 'AC1021', 'DWG header must be AC1021 (AutoCAD 2007+)');
assert(dwg.length > 5000, 'DWG buffer must be valid size');
console.log(`[PASS] Test 5: DWG AC1021 generated (${dwg.length} bytes) with native closed LwPolylines\n`);

// ── Test 6: CAD Validation Check ────────────────────────────────────────────
console.log('Test 6: validateCadGeometry strictly verifies closed ETCH_REMOVE contours');
const val = validateCadGeometry(cadModel);
assert.strictEqual(val.valid, true, `Validation must pass: ${val.errors.join(', ')}`);
assert.strictEqual(val.stats.nonClosedRemoveCount, 0, 'Zero non-closed ETCH_REMOVE contours');
assert(val.stats.etchRemoveCount > 0, 'Must have etchRemoveCount > 0');
console.log(`[PASS] Test 6: Validation report confirmed ${val.stats.etchRemoveCount} closed ETCH_REMOVE contours\n`);

console.log('============================================================');
console.log('ALL BRIDGE & ETCH_REMOVE CLOSED GEOMETRY TESTS PASSED 100%!');
console.log('============================================================');
