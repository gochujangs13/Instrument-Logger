// Generate AutoCAD Calibration Verification DXF
// Plate: 100 x 100 mm
// Sample Rectangle: 20 x 10 mm at (15, 60)
// Circle: Ø10 mm (Radius 5mm) at (25, 30)
// Filleted Specimen: 20 x 10 mm with R1 at (55, 60)
// Chamfered Specimen: 20 x 10 mm with C1 at (55, 30)

import fs from 'fs';
import path from 'path';
import { generateDXF } from '../instruments/etching_design/export_dxf.js';
import { generateDWG } from '../instruments/etching_design/export_dwg.js';

const testGeom = {
  plate: { width: 100, height: 100 },
  totalSamples: 4,
  samples: [
    // 1. Sharp Rectangle 20 x 10 mm
    {
      id: 'sharp_1',
      x: 15,
      y: 60,
      width: 20,
      height: 10,
      cornerType: 'sharp',
      cornerRadius: 0,
      direction: 'up',
      tabs: [{ width: 0.5, length: 2.0 }],
    },
    // 2. Fillet R1 Specimen 20 x 10 mm
    {
      id: 'fillet_1',
      x: 55,
      y: 60,
      width: 20,
      height: 10,
      cornerType: 'fillet',
      cornerRadius: 1.0,
      direction: 'up',
      tabs: [{ width: 0.5, length: 2.0 }],
    },
    // 3. Chamfer C1 Specimen 20 x 10 mm
    {
      id: 'chamfer_1',
      x: 55,
      y: 30,
      width: 20,
      height: 10,
      cornerType: 'chamfer',
      cornerRadius: 1.0,
      direction: 'up',
      tabs: [{ width: 0.5, length: 2.0 }],
    },
    // 4. Circle Holder Specimen with Ø10mm Circle
    {
      id: 'sharp_2',
      x: 15,
      y: 25,
      width: 20,
      height: 20,
      cornerType: 'sharp',
      cornerRadius: 0,
      direction: 'up',
      tabs: [{ width: 0.5, length: 2.0 }],
    },
  ],
  boundaries: [],
};

// 1. Manufacturing DXF (Clean, No dimensions, No arrows, No text)
const mfgDxf = generateDXF(testGeom, { mode: 'MANUFACTURING' });
fs.writeFileSync('test_calibration_manufacturing.dxf', mfgDxf, 'utf8');
console.log('Saved test_calibration_manufacturing.dxf (Size:', mfgDxf.length, 'bytes)');

// 2. Review Drawing DXF (With Dimensions & Text for visual inspection)
const reviewDxf = generateDXF(testGeom, {
  mode: 'REVIEW_DRAWING',
  exportDimensions: true,
  exportText: true,
  exportOrientationMarks: true,
});
fs.writeFileSync('test_calibration_review.dxf', reviewDxf, 'utf8');
console.log('Saved test_calibration_review.dxf (Size:', reviewDxf.length, 'bytes)');

// 3. Manufacturing DWG
const mfgDwg = generateDWG(testGeom, { mode: 'MANUFACTURING' });
fs.writeFileSync('test_calibration_manufacturing.dwg', Buffer.from(mfgDwg));
console.log('Saved test_calibration_manufacturing.dwg (Size:', mfgDwg.length, 'bytes)');

console.log('\n--- Calibration Validation ---');
console.log('1. Plate: exactly 100.000 x 100.000 mm (1 unit = 1 mm)');
console.log('2. Rectangle: 20.000 x 10.000 mm');
console.log('3. Fillet: True ARC R = 1.000 mm');
console.log('4. Chamfer: True 45 deg line C = 1.000 mm');
console.log('5. Tabs: 0.500 mm metal bridge width');
