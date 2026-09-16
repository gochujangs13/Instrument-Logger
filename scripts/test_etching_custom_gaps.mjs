// Verification of Etching Design Custom Gaps (Per-Boundary Widths)
import { EtchingState } from '../instruments/etching_design/state.js';
import { calculateMixedDesignGeometry, getBoundaryWidth } from '../instruments/etching_design/geometry.js';
import { generateDXF } from '../instruments/etching_design/export_dxf.js';
import { generateSVG } from '../instruments/etching_design/export_svg.js';

console.log('=== RUNNING ETCHING CUSTOM GAP TEST SUITE ===\n');

// Test 1: getBoundaryWidth helper
console.log('Test 1: getBoundaryWidth fallback and index lookup');
{
  const paramsDefault = { boundaryWidth: 6 };
  if (getBoundaryWidth(paramsDefault, 0) !== 6) throw new Error('Expected 6 for default');
  if (getBoundaryWidth(paramsDefault, 1) !== 6) throw new Error('Expected 6 for default');

  const paramsCustom = { boundaryWidth: 5, boundaryWidths: [12.5, 8.0] };
  if (getBoundaryWidth(paramsCustom, 0) !== 12.5) throw new Error('Expected 12.5 for gap 0');
  if (getBoundaryWidth(paramsCustom, 1) !== 8.0) throw new Error('Expected 8.0 for gap 1');
  if (getBoundaryWidth(paramsCustom, 2) !== 5) throw new Error('Expected 5 for gap 2 (fallback)');
  console.log('[PASS] Test 1: getBoundaryWidth handles overrides and fallbacks correctly.');
}

// Test 2: Horizontal Split with custom gaps
console.log('\nTest 2: Horizontal Split with custom gaps (12mm and 7mm)');
{
  const state = new EtchingState();
  state.setMode('mixed');
  state.setSplitDirection('horizontal');
  state.setIndividualBoundaryWidth(0, 12);
  state.setIndividualBoundaryWidth(1, 7);

  const geom = state.getGeometry();
  if (geom.boundaries.length !== 2) throw new Error(`Expected 2 boundaries, got ${geom.boundaries.length}`);

  const b0 = geom.boundaries[0];
  const b1 = geom.boundaries[1];

  if (b0.height !== 12) throw new Error(`Expected boundary 0 height 12, got ${b0.height}`);
  if (b0.dimension !== 12) throw new Error(`Expected boundary 0 dimension 12, got ${b0.dimension}`);
  if (b1.height !== 7) throw new Error(`Expected boundary 1 height 7, got ${b1.height}`);
  if (b1.dimension !== 7) throw new Error(`Expected boundary 1 dimension 7, got ${b1.dimension}`);

  console.log(`[PASS] Test 2: Horizontal split boundaries: gap 0 = ${b0.height}mm, gap 1 = ${b1.height}mm.`);
}

// Test 3: Vertical Split with custom gaps
console.log('\nTest 3: Vertical Split with custom gaps (15mm and 10mm)');
{
  const state = new EtchingState();
  state.setMode('mixed');
  state.setSplitDirection('vertical');
  state.setIndividualBoundaryWidth(0, 15);
  state.setIndividualBoundaryWidth(1, 10);

  const geom = state.getGeometry();
  if (geom.boundaries.length !== 2) throw new Error(`Expected 2 boundaries, got ${geom.boundaries.length}`);

  const b0 = geom.boundaries[0];
  const b1 = geom.boundaries[1];

  if (b0.width !== 15) throw new Error(`Expected boundary 0 width 15, got ${b0.width}`);
  if (b0.dimension !== 15) throw new Error(`Expected boundary 0 dimension 15, got ${b0.dimension}`);
  if (b1.width !== 10) throw new Error(`Expected boundary 1 width 10, got ${b1.width}`);
  if (b1.dimension !== 10) throw new Error(`Expected boundary 1 dimension 10, got ${b1.dimension}`);

  console.log(`[PASS] Test 3: Vertical split boundaries: gap 0 = ${b0.width}mm, gap 1 = ${b1.width}mm.`);
}

// Test 4: Global gap override & reset
console.log('\nTest 4: Global gap reset');
{
  const state = new EtchingState();
  state.setMode('mixed');
  state.setIndividualBoundaryWidth(0, 20);
  if (state.mixed.boundaryWidths[0] !== 20) throw new Error('Failed to set individual width');

  state.setBoundaryWidth(8);
  if (state.mixed.boundaryWidth !== 8) throw new Error('Failed to set global width');
  if (state.mixed.boundaryWidths.length !== 0) throw new Error('Global reset should clear individual overrides');

  const geom = state.getGeometry();
  if (geom.boundaries[0].dimension !== 8) throw new Error(`Expected 8, got ${geom.boundaries[0].dimension}`);
  if (geom.boundaries[1].dimension !== 8) throw new Error(`Expected 8, got ${geom.boundaries[1].dimension}`);
  console.log('[PASS] Test 4: Global gap reset successfully resets all boundaries to 8mm.');
}

// Test 5: Undo / Redo
console.log('\nTest 5: Undo / Redo for gap changes');
{
  const state = new EtchingState();
  state.setMode('mixed');
  state.setBoundaryWidth(5);
  state.setIndividualBoundaryWidth(0, 14);
  if (state.mixed.boundaryWidths[0] !== 14) throw new Error('Expected 14');

  state.undo();
  const geomUndone = state.getGeometry();
  if (geomUndone.boundaries[0].dimension !== 5) throw new Error(`Expected undone 5, got ${geomUndone.boundaries[0].dimension}`);

  state.redo();
  const geomRedone = state.getGeometry();
  if (geomRedone.boundaries[0].dimension !== 14) throw new Error(`Expected redone 14, got ${geomRedone.boundaries[0].dimension}`);
  console.log('[PASS] Test 5: Undo and Redo fully restore custom gap states.');
}

// Test 6: DXF & SVG Export validation with custom gaps
console.log('\nTest 6: DXF & SVG Export validation');
{
  const state = new EtchingState();
  state.setMode('mixed');
  state.setIndividualBoundaryWidth(0, 16);
  const geom = state.getGeometry();

  const dxf = generateDXF(geom, { exportDimensions: true });
  if (!dxf.includes('BOUNDARY')) throw new Error('DXF missing BOUNDARY layer');

  const svg = generateSVG(geom, { exportDimensions: true });
  if (!svg.includes('boundary-strip')) throw new Error('SVG missing boundary-strip element');
  if (!svg.includes('16.000')) throw new Error('SVG missing 16.000 custom width');
  console.log('[PASS] Test 6: DXF and SVG export properly output custom gap boundaries.');
}

console.log('\n=== ALL CUSTOM GAP TESTS PASSED! ===');
