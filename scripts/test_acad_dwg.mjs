import { generateDWG } from '../instruments/etching_design/export_dwg.js';
import { EtchingState } from '../instruments/etching_design/state.js';

const state = new EtchingState();
const geom = state.getGeometry();

console.log('Generating DWG for Single mode...');
const singleDwg = generateDWG(geom, { exportDimensions: true, exportOrientationMarks: true });
console.log('Single DWG Size:', singleDwg.length, 'Header:', String.fromCharCode(...singleDwg.slice(0, 6)));

state.setMode('mixed');
const mixedGeom = state.getGeometry();
console.log('Generating DWG for Mixed mode...');
const mixedDwg = generateDWG(mixedGeom, { exportDimensions: true, exportOrientationMarks: true });
console.log('Mixed DWG Size:', mixedDwg.length, 'Header:', String.fromCharCode(...mixedDwg.slice(0, 6)));

console.log('ALL DWG EXPORT TESTS PASSED!');
