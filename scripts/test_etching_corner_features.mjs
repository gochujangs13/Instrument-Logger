// Automated Test: Corner treatments (Fillet, Chamfer, Sharp) with batch apply and per-type customization
import assert from 'node:assert/strict';
import { EtchingState } from '../instruments/etching_design/state.js';
import { calculateSingleTypeGeometry, calculateMixedDesignGeometry, buildSampleCutSegments } from '../instruments/etching_design/geometry.js';
import { generateDXF } from '../instruments/etching_design/export_dxf.js';
import { generateSVG } from '../instruments/etching_design/export_svg.js';

console.log('=== RUNNING ETCHING CORNER FEATURES TEST SUITE ===\n');

// Test 1: Geometry Helper buildSampleCutSegments
console.log('Test 1: buildSampleCutSegments math and structure');
{
  // 1a: Sharp
  const sharpRes = buildSampleCutSegments(0, 0, 20, 10, 'sharp', 0, true, 0.5);
  assert.equal(sharpRes.cornerType, 'sharp');
  assert.equal(sharpRes.safeR, 0);
  assert.equal(sharpRes.segments.length, 6); // top, bottom, 2 left, 2 right

  // 1b: Fillet R=1.0
  const filletRes = buildSampleCutSegments(0, 0, 20, 10, 'fillet', 1.0, true, 0.5);
  assert.equal(filletRes.cornerType, 'fillet');
  assert.equal(filletRes.safeR, 1.0);
  // 6 straights + 4 corners * 4 segments each = 6 + 16 = 22 segments
  assert.equal(filletRes.segments.length, 22);

  // 1c: Chamfer C=1.5
  const chamferRes = buildSampleCutSegments(0, 0, 20, 10, 'chamfer', 1.5, true, 0.5);
  assert.equal(chamferRes.cornerType, 'chamfer');
  assert.equal(chamferRes.safeR, 1.5);
  // 6 straights + 4 corner diagonals = 10 segments
  assert.equal(chamferRes.segments.length, 10);

  // 1d: Safety clamping when R is too large (w=10, h=6, tw=0.5, R=10 requested)
  // Max tab R = (6 - 0.5)/2 - 0.05 = 2.7
  const clampedRes = buildSampleCutSegments(0, 0, 10, 6, 'fillet', 10.0, true, 0.5);
  assert(clampedRes.safeR <= 2.7, `Clamped R should be <= 2.7, got ${clampedRes.safeR}`);
  console.log('[PASS] Test 1: buildSampleCutSegments produces correct segments and clamps radius safely.');
}

// Test 2: State applyCornerToAll
console.log('\nTest 2: state.applyCornerToAll batch update');
{
  const state = new EtchingState();
  state.setMode('mixed');

  // Apply Fillet R=0.8 to all types
  state.applyCornerToAll('fillet', 0.8);
  state.mixed.types.forEach((t, i) => {
    assert.equal(t.sample.cornerType, 'fillet', `Type ${i} should have cornerType 'fillet'`);
    assert.equal(t.sample.cornerRadius, 0.8, `Type ${i} should have cornerRadius 0.8`);
  });

  const geom1 = state.getGeometry();
  assert(geom1.samples.every(s => s.cornerType === 'fillet' && s.cornerRadius > 0));

  // Apply Chamfer C=1.2 to all types
  state.applyCornerToAll('chamfer', 1.2);
  state.mixed.types.forEach((t, i) => {
    assert.equal(t.sample.cornerType, 'chamfer');
    assert.equal(t.sample.cornerRadius, 1.2);
  });

  const geom2 = state.getGeometry();
  assert(geom2.samples.every(s => s.cornerType === 'chamfer'));
  console.log('[PASS] Test 2: applyCornerToAll updates all types simultaneously.');
}

// Test 3: Per-type individual modification
console.log('\nTest 3: Per-type individual corner customization');
{
  const state = new EtchingState();
  state.setMode('mixed');

  // Type 0: Fillet R=0.5
  state.mixed.types[0].sample.cornerType = 'fillet';
  state.mixed.types[0].sample.cornerRadius = 0.5;

  // Type 1: Chamfer C=1.0
  state.mixed.types[1].sample.cornerType = 'chamfer';
  state.mixed.types[1].sample.cornerRadius = 1.0;

  // Type 2: Sharp (0mm)
  state.mixed.types[2].sample.cornerType = 'sharp';
  state.mixed.types[2].sample.cornerRadius = 0;

  const geom = state.getGeometry();
  const t0Samples = geom.samples.filter(s => s.typeId === state.mixed.types[0].id);
  const t1Samples = geom.samples.filter(s => s.typeId === state.mixed.types[1].id);
  const t2Samples = geom.samples.filter(s => s.typeId === state.mixed.types[2].id);

  assert(t0Samples.length > 0 && t0Samples.every(s => s.cornerType === 'fillet' && s.cornerRadius === 0.5));
  assert(t1Samples.length > 0 && t1Samples.every(s => s.cornerType === 'chamfer' && s.cornerRadius === 1.0));
  assert(t2Samples.length > 0 && t2Samples.every(s => s.cornerType === 'sharp' || s.cornerRadius === 0));

  console.log('[PASS] Test 3: Each type accurately preserves its individual corner type and dimensions.');
}

// Test 4: Undo / Redo for corner modifications
console.log('\nTest 4: Undo / Redo history for corner actions');
{
  const state = new EtchingState();
  state.setMode('mixed');

  const origType0R = state.mixed.types[0].sample.cornerRadius;
  state.applyCornerToAll('fillet', 2.0);
  assert.equal(state.mixed.types[0].sample.cornerRadius, 2.0);

  state.undo();
  assert.equal(state.mixed.types[0].sample.cornerRadius, origType0R);

  state.redo();
  assert.equal(state.mixed.types[0].sample.cornerRadius, 2.0);
  console.log('[PASS] Test 4: Undo and Redo fully restore corner properties.');
}

// Test 5: CAD DXF and SVG export with corners
console.log('\nTest 5: DXF & SVG Export validation');
{
  const state = new EtchingState();
  state.setMode('mixed');
  state.mixed.types[0].sample.cornerType = 'fillet';
  state.mixed.types[0].sample.cornerRadius = 0.5;
  state.mixed.types[1].sample.cornerType = 'chamfer';
  state.mixed.types[1].sample.cornerRadius = 1.0;

  const geom = state.getGeometry();
  const dxf = generateDXF(geom);
  assert(dxf.includes('LAYER'), 'DXF must contain LAYER section');
  assert(dxf.includes('SAMPLE'), 'DXF must contain SAMPLE layer');
  assert(dxf.includes('TAB'), 'DXF must contain TAB layer');

  const svg = generateSVG(geom);
  assert(svg.includes('rx="0.500"'), 'SVG must include rounded corner rx attribute');
  assert(svg.includes('<polygon class="sample-body"'), 'SVG must include polygon for chamfered sample');
  console.log('[PASS] Test 5: DXF and SVG export correctly encode corner geometries.');
}

// Test 6: Single Mode corner controls
console.log('\nTest 6: Single Mode corner configuration');
{
  const state = new EtchingState();
  state.setMode('single');
  state.single.sample.cornerType = 'fillet';
  state.single.sample.cornerRadius = 1.0;

  const geom = state.getGeometry();
  assert(geom.samples.length > 0);
  assert(geom.samples.every(s => s.cornerType === 'fillet' && s.cornerRadius === 1.0));
  assert(geom.samples[0].cutSegments.length > 6, 'Cut segments should include corner arc segments');
  console.log('[PASS] Test 6: Single Mode geometry computes correct filleted cut segments.');
}

console.log('\n=== ALL CORNER FEATURE TESTS PASSED! ===\n');
