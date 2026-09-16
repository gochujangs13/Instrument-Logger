// Verification of DWG and DXF Only Export & Save Functions
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EtchingState } from '../instruments/etching_design/state.js';
import { generateDXF } from '../instruments/etching_design/export_dxf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainJs = fs.readFileSync(path.resolve(__dirname, '../instruments/etching_design.js'), 'utf8');

console.log('=== TEST: ETCHING DWG & DXF EXPORT AND SAVE AS ===\n');

// 1. Check HTML Toolbar has only DWG and DXF in Group 3
assert(mainJs.includes('id="etchBtnExportDWG"'), 'Must contain #etchBtnExportDWG');
assert(mainJs.includes('id="etchBtnExportDXF"'), 'Must contain #etchBtnExportDXF');
assert(!mainJs.includes('id="etchBtnExportSVG"'), 'Must NOT contain #etchBtnExportSVG in toolbar');
assert(!mainJs.includes('id="etchBtnExportPDF"'), 'Must NOT contain #etchBtnExportPDF in toolbar');
assert(!mainJs.includes('id="etchBtnExportPNG"'), 'Must NOT contain #etchBtnExportPNG in toolbar');
console.log('[PASS] Toolbar export buttons: Only DWG and DXF present.');

// 2. Check Event Wiring for DWG & DXF
assert(mainJs.includes("el.querySelector('#etchBtnExportDWG').onclick = doExportDWG;"), 'DWG button must be wired to doExportDWG');
assert(mainJs.includes("el.querySelector('#etchBtnExportDXF').onclick = doExportDXF;"), 'DXF button must be wired to doExportDXF');
console.log('[PASS] Event listeners correctly wired to DWG and DXF handlers.');

// 3. Check saveCadFile implementation with showSaveFilePicker & prompt fallback
assert(mainJs.includes('window.showSaveFilePicker'), 'saveCadFile must use showSaveFilePicker for path & filename selection');
assert(mainJs.includes('createWritable'), 'saveCadFile must use createWritable to write directly to user-specified path');
assert(mainJs.includes('window.prompt'), 'saveCadFile must provide fallback prompt for filename');
console.log('[PASS] saveCadFile implements native Save As picker with path & filename selection.');

// 4. Verify that the UI converts the verified DXF through the local vendor converter.
assert(!mainJs.includes("import { generateDWG }"), 'UI must not use the rejected in-browser DWG writer');
assert(mainJs.includes("fetch('/api/cad/convert-dwg'"), 'DWG button must call the local converter API');
assert(mainJs.includes("version: 'ACAD2007'"), 'DWG conversion must request AutoCAD 2007');
assert(mainJs.includes('generateDXF(geom, exportOptions)'), 'DWG conversion must start from the verified DXF geometry');
console.log('[PASS] DWG button uses DXF -> vendor converter -> AutoCAD 2007 pipeline.');

// 5. Test DXF Generation for Single and Mixed
const state = new EtchingState();
const singleDxf = generateDXF(state.getGeometry(), { exportDimensions: true });
assert(typeof singleDxf === 'string', 'DXF output must be a string');
assert(singleDxf.includes('ENTITIES'), 'DXF must contain ENTITIES section');
assert(singleDxf.includes('SECTION'), 'DXF must contain SECTION');

state.setMode('mixed');
const mixedDxf = generateDXF(state.getGeometry(), { exportDimensions: true });
assert(typeof mixedDxf === 'string', 'Mixed DXF output must be a string');
assert(mixedDxf.includes('ENTITIES'), 'Mixed DXF must contain ENTITIES section');
console.log('[PASS] DXF generated cleanly for both single and mixed modes.');

console.log('\n=== ALL DWG & DXF EXPORT TESTS PASSED SUCCESSFULLY! ===');
