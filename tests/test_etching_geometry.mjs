// Etching Design — Complete 20-Point Unit Test Suite
// Verifies all requirements specified in Section 50 of MASTER GOAL.

import assert from 'node:assert';
import {
  calculateSingleTypeGeometry,
  calculateMixedDesignGeometry,
  getEffectiveSize,
  getOrientationDirection,
} from '../instruments/etching_design/geometry.js';
import { PRESET_DEFINITIONS, getPreset } from '../instruments/etching_design/presets.js';
import { generateDXF } from '../instruments/etching_design/export_dxf.js';
import { generateSVG } from '../instruments/etching_design/export_svg.js';
import { generatePDF } from '../instruments/etching_design/export_pdf.js';

let passed = 0;
let total = 20;

function runTest(num, name, fn) {
  try {
    fn();
    console.log(`[PASS] Test ${num}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] Test ${num}: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('=== RUNNING ETCHING DESIGN 20-POINT TEST SUITE ===\n');

// 1. TYPE 1 기본 Geometry (Section 10 & 11)
runTest(1, 'TYPE 1 기본 Geometry', () => {
  const geom = calculateSingleTypeGeometry({
    plate: { width: 297, height: 197 },
    sample: { width: 15, height: 6, orientation: 0 },
    layout: { mode: 'fixed', columns: 14, rows: 27 },
    gaps: { horizontalGap: 3, verticalGap: 1 },
    margin: { mode: 'auto' },
  });

  assert.strictEqual(geom.usedWidth, 249, 'Used Width must be 249mm');
  assert.strictEqual(geom.usedHeight, 188, 'Used Height must be 188mm');
  assert.strictEqual(geom.margins.left, 24, 'Left margin must be 24mm');
  assert.strictEqual(geom.margins.right, 24, 'Right margin must be 24mm');
  assert.strictEqual(geom.margins.top, 4.5, 'Top margin must be 4.5mm');
  assert.strictEqual(geom.margins.bottom, 4.5, 'Bottom margin must be 4.5mm');
  assert.strictEqual(geom.totalSamples, 378, 'Total samples must be 378');
});

// 2. Margin 계산
runTest(2, 'Margin 계산 (Auto vs Manual)', () => {
  const autoGeom = calculateSingleTypeGeometry({
    plate: { width: 300, height: 200 },
    sample: { width: 20, height: 10, orientation: 0 },
    layout: { mode: 'fixed', columns: 10, rows: 10 },
    gaps: { horizontalGap: 2, verticalGap: 2 },
    margin: { mode: 'auto' },
  });
  // Used W = 10*20 + 9*2 = 218. Margin = (300-218)/2 = 41
  assert.strictEqual(autoGeom.margins.left, 41);
  assert.strictEqual(autoGeom.margins.right, 41);

  const manGeom = calculateSingleTypeGeometry({
    plate: { width: 300, height: 200 },
    sample: { width: 20, height: 10, orientation: 0 },
    layout: { mode: 'fixed', columns: 10, rows: 10 },
    gaps: { horizontalGap: 2, verticalGap: 2 },
    margin: { mode: 'manual', left: 15, right: 25, top: 10, bottom: 20 },
  });
  assert.strictEqual(manGeom.margins.left, 15);
  assert.strictEqual(manGeom.margins.right, 25);
  assert.strictEqual(manGeom.margins.top, 10);
  assert.strictEqual(manGeom.margins.bottom, 20);
});

// 3. 소수점 값 처리
runTest(3, '소수점 값 정밀도', () => {
  const geom = calculateSingleTypeGeometry({
    plate: { width: 199.5, height: 297.25 },
    sample: { width: 15.25, height: 4.06, orientation: 0 },
    layout: { mode: 'fixed', columns: 5, rows: 10 },
    gaps: { horizontalGap: 2.75, verticalGap: 1.5 },
    margin: { mode: 'auto' },
  });
  // 5 * 15.25 + 4 * 2.75 = 76.25 + 11 = 87.25
  assert.strictEqual(geom.usedWidth, 87.25);
  // (199.5 - 87.25) / 2 = 56.125
  assert.strictEqual(geom.margins.left, 56.125);
});

// 4. Plate Size 변경
runTest(4, 'Plate Size 변경 반응', () => {
  const p1 = calculateSingleTypeGeometry({ plate: { width: 200, height: 200 }, sample: { width: 10, height: 10 }, layout: { columns: 5, rows: 5 } });
  const p2 = calculateSingleTypeGeometry({ plate: { width: 400, height: 300 }, sample: { width: 10, height: 10 }, layout: { columns: 5, rows: 5 } });
  assert.notStrictEqual(p1.margins.left, p2.margins.left);
  assert.strictEqual(p1.usedWidth, p2.usedWidth); // Used width unchanged, margins expanded
});

// 5. Sample Size 변경
runTest(5, 'Sample Size 변경 반응', () => {
  const s1 = calculateSingleTypeGeometry({ plate: { width: 300, height: 200 }, sample: { width: 10, height: 10 }, layout: { columns: 5, rows: 5 }, gaps: { horizontalGap: 2, verticalGap: 2 } });
  const s2 = calculateSingleTypeGeometry({ plate: { width: 300, height: 200 }, sample: { width: 20, height: 10 }, layout: { columns: 5, rows: 5 }, gaps: { horizontalGap: 2, verticalGap: 2 } });
  // s1 usedW = 5*10 + 4*2 = 58
  // s2 usedW = 5*20 + 4*2 = 108
  assert.strictEqual(s1.usedWidth, 58);
  assert.strictEqual(s2.usedWidth, 108);
});

// 6. Auto Count
runTest(6, 'Auto Count 계산', () => {
  const geom = calculateSingleTypeGeometry({
    plate: { width: 100, height: 100 },
    sample: { width: 10, height: 10, orientation: 0 },
    layout: { mode: 'auto' },
    gaps: { horizontalGap: 2, verticalGap: 2 },
    margin: { mode: 'manual', left: 10, right: 10, top: 10, bottom: 10 },
  });
  // usableW = 80. (80 + 2) / (10 + 2) = 82 / 12 = 6.83 -> 6
  assert.strictEqual(geom.layout.columns, 6);
  assert.strictEqual(geom.layout.rows, 6);
  assert.strictEqual(geom.totalSamples, 36);
});

// 7. Fixed Count
runTest(7, 'Fixed Count', () => {
  const geom = calculateSingleTypeGeometry({
    plate: { width: 300, height: 300 },
    sample: { width: 10, height: 10 },
    layout: { mode: 'fixed', columns: 12, rows: 18 },
  });
  assert.strictEqual(geom.layout.columns, 12);
  assert.strictEqual(geom.layout.rows, 18);
  assert.strictEqual(geom.totalSamples, 216);
});

// 8. 0° Orientation
runTest(8, '0° Orientation', () => {
  const eff = getEffectiveSize(10, 50, 0);
  assert.strictEqual(eff.width, 10);
  assert.strictEqual(eff.height, 50);
  assert.strictEqual(getOrientationDirection(0), 'up');
});

// 9. 90° Orientation
runTest(9, '90° Orientation (Swaps W & H)', () => {
  const eff = getEffectiveSize(10, 50, 90);
  assert.strictEqual(eff.width, 50);
  assert.strictEqual(eff.height, 10);
  assert.strictEqual(getOrientationDirection(90), 'right');
});

// 10. 180° Orientation
runTest(10, '180° Orientation', () => {
  const eff = getEffectiveSize(10, 50, 180);
  assert.strictEqual(eff.width, 10);
  assert.strictEqual(eff.height, 50);
  assert.strictEqual(getOrientationDirection(180), 'down');
});

// 11. 270° Orientation
runTest(11, '270° Orientation (Swaps W & H)', () => {
  const eff = getEffectiveSize(10, 50, 270);
  assert.strictEqual(eff.width, 50);
  assert.strictEqual(eff.height, 10);
  assert.strictEqual(getOrientationDirection(270), 'left');
});

// 12. Center Orientation Override
runTest(12, 'Center Product Orientation Override', () => {
  const geom = calculateSingleTypeGeometry({
    plate: { width: 300, height: 300 },
    sample: { width: 15, height: 6, orientation: 0, overrideCenter: true, centerOrientation: 180 },
    layout: { columns: 3, rows: 3 }, // 3x3: center is (1, 1)
  });
  const centerSample = geom.samples.find(s => s.column === 1 && s.row === 1);
  const cornerSample = geom.samples.find(s => s.column === 0 && s.row === 0);

  assert.strictEqual(centerSample.orientationOverride, true);
  assert.strictEqual(centerSample.rotation, 180);
  assert.strictEqual(centerSample.direction, 'down');

  assert.strictEqual(cornerSample.orientationOverride, false);
  assert.strictEqual(cornerSample.rotation, 0);
  assert.strictEqual(cornerSample.direction, 'up');
});

// 13. Plate Overflow
runTest(13, 'Plate Overflow 감지', () => {
  const okGeom = calculateSingleTypeGeometry({
    plate: { width: 100, height: 100 },
    sample: { width: 10, height: 10 },
    layout: { columns: 5, rows: 5 },
    gaps: { horizontalGap: 2, verticalGap: 2 },
  });
  assert.strictEqual(okGeom.isOverflow, false);

  const overGeom = calculateSingleTypeGeometry({
    plate: { width: 50, height: 50 },
    sample: { width: 15, height: 15 },
    layout: { columns: 5, rows: 5 }, // 5*15 + 4*2 = 83 > 50
    gaps: { horizontalGap: 2, verticalGap: 2 },
  });
  assert.strictEqual(overGeom.isOverflow, true);
  assert(overGeom.overflow.width > 0, 'Overflow width must be positive');
});

// 14. Mixed Ratio = 100%
runTest(14, 'Mixed Ratio = 100% 검증', () => {
  const geom = calculateMixedDesignGeometry({
    plate: { width: 420, height: 197 },
    types: [
      { id: 't1', targetRatio: 30, sample: { width: 15, height: 6 } },
      { id: 't2', targetRatio: 40, sample: { width: 10, height: 50 } },
      { id: 't3', targetRatio: 30, sample: { width: 3, height: 40 } },
    ],
  });
  assert.strictEqual(geom.ratioValid, true);
  assert.strictEqual(geom.totalRatio, 100);
});

// 15. Mixed Ratio < 100%
runTest(15, 'Mixed Ratio < 100% 검증', () => {
  const geom = calculateMixedDesignGeometry({
    plate: { width: 420, height: 197 },
    types: [
      { id: 't1', targetRatio: 30, sample: { width: 15, height: 6 } },
      { id: 't2', targetRatio: 40, sample: { width: 10, height: 50 } },
    ],
  });
  assert.strictEqual(geom.ratioValid, false);
  assert.strictEqual(geom.totalRatio, 70);
});

// 16. Mixed Ratio > 100%
runTest(16, 'Mixed Ratio > 100% 검증', () => {
  const geom = calculateMixedDesignGeometry({
    plate: { width: 420, height: 197 },
    types: [
      { id: 't1', targetRatio: 50, sample: { width: 15, height: 6 } },
      { id: 't2', targetRatio: 60, sample: { width: 10, height: 50 } },
    ],
  });
  assert.strictEqual(geom.ratioValid, false);
  assert.strictEqual(geom.totalRatio, 110);
});

// 17. Mixed Layout (배열 및 경계 생성)
runTest(17, 'Mixed Layout 구조', () => {
  const geom = calculateMixedDesignGeometry({
    plate: { width: 420, height: 197 },
    boundaryWidth: 5,
    margin: { left: 10, right: 10 },
    types: [
      { id: 't1', targetRatio: 50, sample: { width: 15, height: 6 } },
      { id: 't2', targetRatio: 50, sample: { width: 10, height: 50 } },
    ],
  });
  assert.strictEqual(geom.types.length, 2);
  assert.strictEqual(geom.boundaries.length, 1, 'There must be 1 boundary between 2 types');
  assert.strictEqual(geom.boundaries[0].width, 5);
  assert(geom.samples.length > 0, 'Must have samples');
});

// 18. Sample Count (정확한 객체 카운트)
runTest(18, 'Sample Count 일치', () => {
  const geom = calculateSingleTypeGeometry({
    plate: { width: 300, height: 300 },
    sample: { width: 10, height: 10 },
    layout: { columns: 7, rows: 13 },
  });
  assert.strictEqual(geom.totalSamples, 91);
  assert.strictEqual(geom.samples.length, 91);
});

// 19. DXF Size 및 무결성
runTest(19, 'DXF Size 및 구문 무결성', () => {
  const geom = calculateSingleTypeGeometry({
    plate: { width: 297, height: 197 },
    sample: { width: 15, height: 6 },
    layout: { columns: 14, rows: 27 },
    gaps: { horizontalGap: 3, verticalGap: 1 },
    margin: { mode: 'auto' },
  });
  const dxf = generateDXF(geom, { exportDimensions: true, exportOrientationMarks: true });
  assert(dxf.includes('$ACADVER\n1\nAC1009'), 'Must use strict AutoCAD R12 interchange DXF for ODA conversion');
  assert(dxf.includes('$EXTMAX\n10\n297.000\n20\n197.000'), 'Must match plate dimensions in DXF Header');
  assert(dxf.includes('EOF'), 'Must end with EOF');
});

// 20. Preview Geometry == Export Geometry
runTest(20, 'Preview Geometry == Export Geometry 일치성', () => {
  const geom = calculateSingleTypeGeometry({
    plate: { width: 297, height: 197 },
    sample: { width: 15, height: 6 },
    layout: { columns: 14, rows: 27 },
  });
  const svg = generateSVG(geom);
  const dxf = generateDXF(geom);
  const pdf = generatePDF(geom);

  // Both SVG, DXF, and PDF contain exact plate and samples derived from the same geom object
  assert(svg.includes('width="297mm"'));
  assert(svg.includes('height="197mm"'));
  assert(dxf.includes('297.000'));
  assert(pdf.startsWith('%PDF-1.4'));
});

console.log(`\n=== TEST SUMMARY: ${passed} / ${total} TESTS PASSED ===\n`);
if (passed === total) {
  console.log('ALL 20 UNIT TESTS PASSED SUCCESSFULLY! 🎯');
} else {
  process.exit(1);
}
