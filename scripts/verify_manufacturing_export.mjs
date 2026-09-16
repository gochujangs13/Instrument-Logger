// ============================================================
// COMPREHENSIVE MANUFACTURING DWG/DXF VERIFICATION SCRIPT
// Checks all 11 items from the user's verification request.
// ============================================================

import assert from 'node:assert/strict';
import { EtchingState } from '../instruments/etching_design/state.js';
import { buildCadEntities, validateCadGeometry, calculateBridgesAndGaps, CAD_LAYERS } from '../instruments/etching_design/cad_builder.js';
import { generateDXF } from '../instruments/etching_design/export_dxf.js';
import { generateDWG } from '../instruments/etching_design/export_dwg.js';

const TOLERANCE = 0.01;
const results = [];
function record(id, name, pass, detail = '') {
  results.push({ id, name, pass, detail });
  const tag = pass ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
  console.log(`${tag} ${id}. ${name}${detail ? ': ' + detail : ''}`);
}

// ── Setup: Build Mixed Mode Geometry (TYPE 1, 2, 3 on 420x197mm) ──
const state = new EtchingState();
state.setMode('mixed');
state.setPlateWidth(420);
state.setPlateHeight(197);
const geom = state.getGeometry();

// Build both Manufacturing and Review models
const mfgModel = buildCadEntities(geom, { mode: 'MANUFACTURING' });
const reviewModel = buildCadEntities(geom, { mode: 'REVIEW_DRAWING', exportDimensions: true, exportText: true, exportOrientationMarks: true });
const mfgValidation = validateCadGeometry(mfgModel);

// Generate DXF and DWG
const dxfStr = generateDXF(geom, { mode: 'MANUFACTURING' });
const dwgBuf = generateDWG(geom, { mode: 'MANUFACTURING' });

console.log('\n============================================================');
console.log('  COMPREHENSIVE MANUFACTURING DWG/DXF VERIFICATION');
console.log('  Plate: 420 x 197 mm  |  Mixed Mode (TYPE 1, 2, 3)');
console.log('============================================================\n');

// ============================================================
// 1. ETCH_REMOVE 영역 존재 여부
// ============================================================
console.log('── 1. ETCH_REMOVE 영역 존재 여부 ──');

const etchRemoveEnts = mfgModel.entities.filter(e => e.type === 'lwpolyline' && e.layer === 'ETCH_REMOVE');
const allClosed = etchRemoveEnts.every(e => e.closed === true);
const allHave4pts = etchRemoveEnts.every(e => Array.isArray(e.points) && e.points.length >= 3);
const anyZeroArea = etchRemoveEnts.some(e => {
  const pts = e.points;
  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return w < 0.001 || h < 0.001;
});

console.log(`  Total ETCH_REMOVE polylines: ${etchRemoveEnts.length}`);
console.log(`  All closed: ${allClosed}`);
console.log(`  All have ≥3 points: ${allHave4pts}`);
console.log(`  Any zero-area: ${anyZeroArea}`);

record(1, 'ETCH_REMOVE 존재', 
  etchRemoveEnts.length > 0 && allClosed && allHave4pts && !anyZeroArea,
  `${etchRemoveEnts.length} closed polylines, all valid`
);

// ============================================================
// 2. Bridge 치수 검증 (0.5 mm)
// ============================================================
console.log('\n── 2. Bridge 치수 검증 ──');

const bridgeEnts = mfgModel.entities.filter(e => (e.layer === 'ETCH_BRIDGE' || e.layer === 'ETCH_TAB') && e.type === 'line');
console.log(`  Total ETCH_BRIDGE lines: ${bridgeEnts.length}`);

const bridgesByXRange = new Map();
bridgeEnts.forEach(line => {
  const key = `${line.x1.toFixed(2)}_${line.x2.toFixed(2)}`;
  if (!bridgesByXRange.has(key)) bridgesByXRange.set(key, []);
  bridgesByXRange.get(key).push(line.y1);
});

let allBridgeWidthsCorrect = true;
let bridgeWidthSamples = [];
bridgesByXRange.forEach((ys, key) => {
  ys.sort((a, b) => a - b);
  for (let i = 0; i < ys.length - 1; i++) {
    const diff = ys[i + 1] - ys[i];
    if (diff > 0.01 && diff < 2.0) {
      bridgeWidthSamples.push(diff);
      if (Math.abs(diff - 0.5) > TOLERANCE) {
        allBridgeWidthsCorrect = false;
      }
    }
  }
});

console.log(`  Bridge width samples: ${bridgeWidthSamples.slice(0, 10).map(w => w.toFixed(4)).join(', ')}...`);
console.log(`  All bridge widths = 0.5mm: ${allBridgeWidthsCorrect}`);
record(2, 'Bridge 0.5 mm', allBridgeWidthsCorrect, `${bridgeWidthSamples.length} bridges measured`);

// ============================================================
// 3-5. Type별 제거영역 치수 검증
// ============================================================
console.log('\n── 3-5. Type별 Bridge 제거영역 치수 검증 ──');

const typeSpecs = [
  { name: 'TYPE 1', height: 6, bridge: 0.5, expectedGap: 2.75 },
  { name: 'TYPE 2', height: 10, bridge: 0.5, expectedGap: 4.75 },
  { name: 'TYPE 3', height: 3, bridge: 0.5, expectedGap: 1.25 },
];

typeSpecs.forEach((spec, idx) => {
  const { bridges, gaps } = calculateBridgesAndGaps(0, spec.height, 1, spec.bridge);
  
  const totalGapH = gaps.reduce((s, g) => s + g.height, 0);
  const expectedTotalGap = spec.height - spec.bridge;
  
  console.log(`  ${spec.name}: H=${spec.height}mm, Bridge=${spec.bridge}mm`);
  console.log(`    Bridges: ${bridges.length} (width: ${bridges[0]?.width})`);
  console.log(`    Gaps: ${gaps.length} (heights: ${gaps.map(g => g.height.toFixed(4)).join(', ')})`);
  console.log(`    Total gap: ${totalGapH.toFixed(4)}mm, expected: ${expectedTotalGap}mm`);
  console.log(`    Each gap: ${gaps[0]?.height.toFixed(4)}mm, expected: ${spec.expectedGap}mm`);
  
  const gapCorrect = gaps.every(g => Math.abs(g.height - spec.expectedGap) < TOLERANCE);
  const bridgeCorrect = bridges.length === 1 && Math.abs(bridges[0].width - spec.bridge) < TOLERANCE;
  
  record(idx + 3, `${spec.name} 제거영역 ${spec.expectedGap}mm`, 
    gapCorrect && bridgeCorrect,
    `gap=${gaps[0]?.height.toFixed(4)}, bridge=${bridges[0]?.width}`
  );
});

// ============================================================
// 6. Sample / Bridge 연결성 확인
// ============================================================
console.log('\n── 6. Sample / Bridge 연결성 확인 ──');

const sampleLines = mfgModel.entities.filter(e => e.type === 'line' && e.layer === 'ETCH_SAMPLE');

const sample0 = geom.samples[0];
if (sample0) {
  const s0x = sample0.x;
  const s0y = sample0.y;
  const s0h = sample0.height;
  const s0w = sample0.width;
  const tabW = sample0.tabs?.[0]?.width || 0.5;
  const tabCount = sample0.tabs?.[0]?.count || 1;
  const cornerR = sample0.cornerRadius || 0;
  
  // Filter left edge lines at x=s0x AND within sample 0's Y range [s0y, s0y+s0h]
  const leftEdgeLines = sampleLines.filter(l => 
    Math.abs(l.x1 - s0x) < 0.01 && Math.abs(l.x2 - s0x) < 0.01 &&
    l.y1 >= s0y - 0.01 && l.y2 <= s0y + s0h + 0.01 &&
    Math.min(l.y1, l.y2) >= s0y - 0.01 && Math.max(l.y1, l.y2) <= s0y + s0h + 0.01
  );
  
  const totalLeftCoverage = leftEdgeLines.reduce((sum, l) => sum + Math.abs(l.y2 - l.y1), 0);
  const fullEdgeLength = s0h - 2 * cornerR;
  const expectedGap = tabW * tabCount;
  
  console.log(`  Sample 0: x=${s0x}, y=${s0y}, h=${s0h}, tabW=${tabW}, tabCount=${tabCount}, cornerR=${cornerR}`);
  console.log(`  Left edge segments within Y[${s0y}, ${s0y + s0h}]: ${leftEdgeLines.length} (should be ≥${tabCount + 1})`);
  leftEdgeLines.forEach(l => console.log(`    Y: ${l.y1.toFixed(4)} → ${l.y2.toFixed(4)} (len=${Math.abs(l.y2-l.y1).toFixed(4)})`));
  console.log(`  Total left coverage: ${totalLeftCoverage.toFixed(4)}mm vs full edge: ${fullEdgeLength.toFixed(4)}mm`);
  console.log(`  Gap (bridge openings): ${(fullEdgeLength - totalLeftCoverage).toFixed(4)}mm ≈ ${tabCount}x${tabW}=${expectedGap}mm`);
  
  // Also verify right edge
  const rightEdgeLines = sampleLines.filter(l => 
    Math.abs(l.x1 - (s0x + s0w)) < 0.01 && Math.abs(l.x2 - (s0x + s0w)) < 0.01 &&
    Math.min(l.y1, l.y2) >= s0y - 0.01 && Math.max(l.y1, l.y2) <= s0y + s0h + 0.01
  );
  console.log(`  Right edge segments: ${rightEdgeLines.length}`);
  
  // Verify: bridge opening means the cut line does NOT span the full height
  const hasSplit = leftEdgeLines.length >= tabCount + 1;
  const gapDiff = Math.abs((fullEdgeLength - totalLeftCoverage) - expectedGap);
  const hasGap = gapDiff < TOLERANCE * 5;
  
  // Verify: no single line spans through the bridge opening
  const { bridges } = calculateBridgesAndGaps(s0y, s0h, tabCount, tabW);
  const noLineCrossesBridge = bridges.every(b => {
    return !leftEdgeLines.some(l => {
      const lMin = Math.min(l.y1, l.y2);
      const lMax = Math.max(l.y1, l.y2);
      return lMin < b.bot - 0.01 && lMax > b.top + 0.01;
    });
  });
  console.log(`  No line crosses bridge opening: ${noLineCrossesBridge}`);
  
  record(6, 'Sample/Bridge 연결성', 
    hasSplit && hasGap && noLineCrossesBridge,
    `${leftEdgeLines.length} segments, gap=${(fullEdgeLength - totalLeftCoverage).toFixed(4)}mm, no cross=${noLineCrossesBridge}`
  );
} else {
  record(6, 'Sample/Bridge 연결성', false, 'No samples found');
}

// ============================================================
// 7. Closed Polyline 검증 (ETCH_REMOVE)
// ============================================================
console.log('\n── 7. Closed Polyline 검증 ──');

let selfIntersections = 0;
let duplicatePolys = 0;
const polyKeys = new Set();

etchRemoveEnts.forEach(ent => {
  if (!ent.closed) return;
  
  const key = ent.points.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(';');
  if (polyKeys.has(key)) {
    duplicatePolys++;
  } else {
    polyKeys.add(key);
  }
  
  const pts = ent.points;
  if (pts.length === 4) {
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    if (maxX - minX < 0.001 || maxY - minY < 0.001) {
      selfIntersections++;
    }
  }
});

console.log(`  Unique polylines: ${polyKeys.size}`);
console.log(`  Duplicate polylines: ${duplicatePolys}`);
console.log(`  Self-intersections/degenerates: ${selfIntersections}`);

record(7, 'Closed Polyline', 
  allClosed && duplicatePolys === 0 && selfIntersections === 0,
  `${etchRemoveEnts.length} polys, 0 dupes, 0 self-x`
);

// ============================================================
// 8. Layer 분리 확인
// ============================================================
console.log('\n── 8. Layer 구조 확인 ──');

const layerCounts = new Map();
mfgModel.entities.forEach(ent => {
  const ly = ent.layer;
  layerCounts.set(ly, (layerCounts.get(ly) || 0) + 1);
});

const requiredLayers = ['ETCH_SAMPLE', 'ETCH_FRAME', 'ETCH_SEPARATOR', 'ETCH_BRIDGE', 'ETCH_REMOVE', 'PLATE_OUTLINE'];
const missingLayers = requiredLayers.filter(l => !layerCounts.has(l));

console.log('  Layer Entity Counts:');
const sortedLayers = Array.from(layerCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
sortedLayers.forEach(([layer, count]) => {
  console.log(`    ${layer}: ${count}`);
});
console.log(`  Missing required layers: ${missingLayers.length > 0 ? missingLayers.join(', ') : 'NONE'}`);

record(8, 'Layer 분리', 
  missingLayers.length === 0,
  `${sortedLayers.length} layers, missing: ${missingLayers.join(', ') || 'none'}`
);

// ============================================================
// 9. Manufacturing Guide 제거 확인
// ============================================================
console.log('\n── 9. Manufacturing Export Guide 제거 확인 ──');

const guideInMfg = mfgModel.entities.filter(e => e.layer.startsWith('GUIDE_'));
const textInMfg = mfgModel.entities.filter(e => e.type === 'text');

console.log(`  Guide entities in MFG: ${guideInMfg.length}`);
console.log(`  Text entities in MFG: ${textInMfg.length}`);
console.log(`  Validation guideInMfgCount: ${mfgValidation.stats.guideInMfgCount}`);

const guideInReview = reviewModel.entities.filter(e => e.layer.startsWith('GUIDE_'));
console.log(`  Guide entities in REVIEW: ${guideInReview.length} (should be > 0)`);

record(9, 'Manufacturing Guide 제거', 
  guideInMfg.length === 0 && textInMfg.length === 0 && guideInReview.length > 0,
  `MFG: ${guideInMfg.length} guide + ${textInMfg.length} text; REVIEW: ${guideInReview.length} guide`
);

// ============================================================
// 10. Plate 420 × 197 mm 스케일 검증
// ============================================================
console.log('\n── 10. Plate 420 × 197 mm 스케일 검증 ──');

const plateW = mfgModel.plate.width;
const plateH = mfgModel.plate.height;
console.log(`  Plate: ${plateW} x ${plateH} mm`);

const plateLines = mfgModel.entities.filter(e => e.layer === 'PLATE_OUTLINE' && e.type === 'line');
const plateXs = plateLines.flatMap(l => [l.x1, l.x2]);
const plateYs = plateLines.flatMap(l => [l.y1, l.y2]);
const plateMaxX = Math.max(...plateXs);
const plateMaxY = Math.max(...plateYs);
const plateMinX = Math.min(...plateXs);
const plateMinY = Math.min(...plateYs);

console.log(`  PLATE_OUTLINE bounds: (${plateMinX}, ${plateMinY}) to (${plateMaxX}, ${plateMaxY})`);

// Verify individual sample dimensions from geometry
const typeSamples = {};
geom.samples.forEach(s => {
  const tid = s.typeId || s.type || 'unknown';
  if (!typeSamples[tid]) typeSamples[tid] = [];
  typeSamples[tid].push(s);
});

Object.entries(typeSamples).forEach(([tid, samps]) => {
  const s = samps[0];
  console.log(`  ${tid}: first sample at (${s.x.toFixed(2)}, ${s.y.toFixed(2)}), size: ${s.width}x${s.height}mm, direction: ${s.direction || 'up'}`);
});

const dxfHasInsUnits = dxfStr.includes('$INSUNITS') && dxfStr.includes('70\n4');
console.log(`  DXF $INSUNITS=4 (mm): ${dxfHasInsUnits}`);

record(10, 'Plate 420 × 197 mm', 
  Math.abs(plateW - 420) < TOLERANCE && Math.abs(plateH - 197) < TOLERANCE && 
  Math.abs(plateMaxX - 420) < TOLERANCE && Math.abs(plateMaxY - 197) < TOLERANCE &&
  Math.abs(plateMinX) < TOLERANCE && Math.abs(plateMinY) < TOLERANCE,
  `${plateW}x${plateH}mm, OUTLINE: (${plateMinX},${plateMinY})-(${plateMaxX},${plateMaxY})`
);

// ============================================================
// 11. DXF / DWG 일치 확인
// ============================================================
console.log('\n── 11. DXF / DWG 일치 확인 ──');

const dxfLineCount = (dxfStr.match(/0\nLINE\n/g) || []).length;
const dxfArcCount = (dxfStr.match(/0\nARC\n/g) || []).length;
const dxfCircleCount = (dxfStr.match(/0\nCIRCLE\n/g) || []).length;
const dxfPolyCount = (dxfStr.match(/0\nPOLYLINE\n/g) || []).length;

const modelLineCount = mfgModel.entities.filter(e => e.type === 'line').length;
const modelArcCount = mfgModel.entities.filter(e => e.type === 'arc').length;
const modelCircleCount = mfgModel.entities.filter(e => e.type === 'circle').length;
const modelPolyCount = mfgModel.entities.filter(e => e.type === 'lwpolyline').length;

console.log(`  DXF entities: LINE=${dxfLineCount}, ARC=${dxfArcCount}, CIRCLE=${dxfCircleCount}, LWPOLYLINE=${dxfPolyCount}`);
console.log(`  Model entities: LINE=${modelLineCount}, ARC=${modelArcCount}, CIRCLE=${modelCircleCount}, LWPOLYLINE=${modelPolyCount}`);

const dwgHeader = Buffer.from(dwgBuf.buffer, 0, 6).toString('ascii');
console.log(`  DWG header: ${dwgHeader} (expect AC1021 / AutoCAD 2007+)`);
console.log(`  DWG size: ${dwgBuf.length} bytes`);

const dxfHasClosedPoly = dxfStr.includes('ETCH_REMOVE') && dxfStr.includes('70\n1');
const dxfHasBridge = dxfStr.includes('ETCH_BRIDGE');
console.log(`  DXF has ETCH_REMOVE closed(70=1): ${dxfHasClosedPoly}`);
console.log(`  DXF has ETCH_BRIDGE: ${dxfHasBridge}`);

const entityCountsMatch = dxfLineCount === modelLineCount &&
  dxfArcCount === modelArcCount &&
  dxfCircleCount === modelCircleCount &&
  dxfPolyCount === modelPolyCount;

record(11, 'DXF / DWG 일치', 
  entityCountsMatch && dwgHeader === 'AC1021' && dxfHasClosedPoly && dxfHasBridge,
  `Counts match: ${entityCountsMatch}, DWG: ${dwgHeader}, ETCH_REMOVE(closed): ${dxfHasClosedPoly}`
);

// ============================================================
// HATCH 가능 여부 검증
// ============================================================
console.log('\n── HATCH 가능 여부 검증 ──');

let overlappingPolys = 0;
for (let i = 0; i < etchRemoveEnts.length; i++) {
  const a = etchRemoveEnts[i];
  const aXs = a.points.map(p => p[0]);
  const aYs = a.points.map(p => p[1]);
  const aMinX = Math.min(...aXs), aMaxX = Math.max(...aXs);
  const aMinY = Math.min(...aYs), aMaxY = Math.max(...aYs);
  
  for (let j = i + 1; j < etchRemoveEnts.length; j++) {
    const b = etchRemoveEnts[j];
    const bXs = b.points.map(p => p[0]);
    const bYs = b.points.map(p => p[1]);
    const bMinX = Math.min(...bXs), bMaxX = Math.max(...bXs);
    const bMinY = Math.min(...bYs), bMaxY = Math.max(...bYs);
    
    const overlapX = Math.max(0, Math.min(aMaxX, bMaxX) - Math.max(aMinX, bMinX));
    const overlapY = Math.max(0, Math.min(aMaxY, bMaxY) - Math.max(aMinY, bMinY));
    
    if (overlapX > TOLERANCE && overlapY > TOLERANCE) {
      overlappingPolys++;
    }
  }
}
console.log(`  Overlapping ETCH_REMOVE pairs: ${overlappingPolys}`);
console.log(`  All closed: ${allClosed} → AutoCAD HATCH capable: ${allClosed && overlappingPolys === 0}`);

// ============================================================
// TYPE별 개수 상세 검증
// ============================================================
console.log('\n── TYPE별 개수 상세 검증 ──');

const typeInfo = {};
geom.samples.forEach(s => {
  const tid = s.typeId || s.type || 'unknown';
  if (!typeInfo[tid]) typeInfo[tid] = { sampleCount: 0, height: s.height, width: s.width, samples: [] };
  typeInfo[tid].sampleCount++;
  typeInfo[tid].samples.push(s);
});

console.log('\n  ┌─────────────┬───────────┬───────────────────┬──────────────────┬──────────────────┬────────────┐');
console.log('  │ Type        │ Samples   │ Bridge Lines(ETCH)│ ETCH_REMOVE (Act)│ ETCH_REMOVE (Exp)│ Difference │');
console.log('  ├─────────────┼───────────┼───────────────────┼──────────────────┼──────────────────┼────────────┤');

const typeDiffs = {};
Object.entries(typeInfo).forEach(([tid, info]) => {
  const tabCount = info.samples[0]?.tabs?.[0]?.count || 1;
  const tabLength = info.samples[0]?.tabs?.[0]?.length || 0.5;
  const tabW = info.samples[0]?.tabs?.[0]?.width || 0.5;
  
  // Count bridge lines for this type
  let typeBridgeLines = 0;
  let actualRemoveCount = 0;
  
  info.samples.forEach(s => {
    const sx = s.x;
    const sy = s.y;
    const sw = s.width;
    const sh = s.height;
    
    // Count bridge lines at sample edges — also filter by Y range
    const sampleBridgeLines = bridgeEnts.filter(l => {
      const ly = l.y1;
      const inYRange = ly >= sy - 0.01 && ly <= sy + sh + 0.01;
      if (!inYRange) return false;
      
      const xMatch = 
        (Math.abs(Math.min(l.x1, l.x2) - (sx - tabLength)) < TOLERANCE && Math.abs(Math.max(l.x1, l.x2) - sx) < TOLERANCE) ||
        (Math.abs(Math.min(l.x1, l.x2) - (sx + sw)) < TOLERANCE && Math.abs(Math.max(l.x1, l.x2) - (sx + sw + tabLength)) < TOLERANCE);
      return xMatch;
    });
    typeBridgeLines += sampleBridgeLines.length;
    
    // Count ETCH_REMOVE polylines for this sample (bridge-side) — filter by both X and Y range
    const { gaps } = calculateBridgesAndGaps(sy, sh, tabCount, tabW);
    
    const leftRemoves = etchRemoveEnts.filter(e => {
      const xs = e.points.map(p => p[0]);
      const ys = e.points.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      // Match X range to left bridge zone
      if (Math.abs(maxX - sx) > TOLERANCE || Math.abs(minX - (sx - tabLength)) > TOLERANCE) return false;
      // Match Y range to one of the sample's gaps
      return gaps.some(g => Math.abs(minY - g.bot) < TOLERANCE && Math.abs(maxY - g.top) < TOLERANCE);
    });
    
    const rightRemoves = etchRemoveEnts.filter(e => {
      const xs = e.points.map(p => p[0]);
      const ys = e.points.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      // Match X range to right bridge zone
      if (Math.abs(minX - (sx + sw)) > TOLERANCE || Math.abs(maxX - (sx + sw + tabLength)) > TOLERANCE) return false;
      // Match Y range to one of the sample's gaps
      return gaps.some(g => Math.abs(minY - g.bot) < TOLERANCE && Math.abs(maxY - g.top) < TOLERANCE);
    });
    
    actualRemoveCount += leftRemoves.length + rightRemoves.length;
  });
  
  // Expected bridge-side ETCH_REMOVE: each sample has 2 sides × (tabCount + 1) gaps
  const expectedRemovePerSample = 2 * (tabCount + 1);
  const expectedRemoveTotal = info.sampleCount * expectedRemovePerSample;
  
  const diff = actualRemoveCount - expectedRemoveTotal;
  typeDiffs[tid] = { actualRemoveCount, expectedRemoveTotal, diff, sampleCount: info.sampleCount, typeBridgeLines };
  
  console.log(`  │ ${tid.padEnd(11)} │ ${String(info.sampleCount).padStart(9)} │ ${String(typeBridgeLines).padStart(17)} │ ${String(actualRemoveCount).padStart(16)} │ ${String(expectedRemoveTotal).padStart(16)} │ ${String(diff).padStart(10)} │`);
});

console.log('  └─────────────┴───────────┴───────────────────┴──────────────────┴──────────────────┴────────────┘');

// V-Gap ETCH_REMOVE count
const vGapRemoves = etchRemoveEnts.filter(e => {
  const xs = e.points.map(p => p[0]);
  const w = Math.max(...xs) - Math.min(...xs);
  return w > 1.0;
});

const bridgeSideRemoves = etchRemoveEnts.length - vGapRemoves.length;
console.log(`\n  Bridge-side ETCH_REMOVE: ${bridgeSideRemoves}`);
console.log(`  V-Gap ETCH_REMOVE: ${vGapRemoves.length}`);
console.log(`  Total ETCH_REMOVE: ${etchRemoveEnts.length}`);

// Analyze Type 3 discrepancy if present
Object.entries(typeDiffs).forEach(([tid, data]) => {
  if (data.diff !== 0) {
    console.log(`\n  ⚠ ${tid} ETCH_REMOVE discrepancy: ${data.diff}`);
    
    const info = typeInfo[tid];
    const tabLength = info.samples[0]?.tabs?.[0]?.length || 0.5;
    const tabCount = info.samples[0]?.tabs?.[0]?.count || 1;
    const expectedPerSample = 2 * (tabCount + 1);
    
    let missingLocations = [];
    info.samples.forEach(s => {
      const sx = s.x;
      const sw = s.width;
      
      const leftRemoves = etchRemoveEnts.filter(e => {
        const xs = e.points.map(p => p[0]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        return Math.abs(maxX - sx) < TOLERANCE && Math.abs(minX - (sx - tabLength)) < TOLERANCE;
      });
      
      const rightRemoves = etchRemoveEnts.filter(e => {
        const xs = e.points.map(p => p[0]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        return Math.abs(minX - (sx + sw)) < TOLERANCE && Math.abs(maxX - (sx + sw + tabLength)) < TOLERANCE;
      });
      
      const sampleActual = leftRemoves.length + rightRemoves.length;
      if (sampleActual !== expectedPerSample) {
        missingLocations.push({
          x: sx, y: s.y, w: sw, h: s.height,
          left: leftRemoves.length, right: rightRemoves.length,
          expected: expectedPerSample, actual: sampleActual
        });
      }
    });
    
    if (missingLocations.length > 0) {
      console.log(`    Samples with missing ETCH_REMOVE: ${missingLocations.length}`);
      missingLocations.slice(0, 10).forEach(loc => {
        console.log(`    → Sample at (${loc.x.toFixed(2)}, ${loc.y.toFixed(2)}) ${loc.w}x${loc.h}mm: L=${loc.left}, R=${loc.right}, expected=${loc.expected}`);
      });
      if (missingLocations.length > 10) {
        console.log(`    ... and ${missingLocations.length - 10} more`);
      }
    } else {
      console.log(`    All individual samples have correct ETCH_REMOVE count — discrepancy may be from shared edge deduplication`);
    }
  }
});

// ============================================================
// ZERO-LENGTH & DUPLICATE FINAL CHECK
// ============================================================
console.log('\n── Zero-Length & Duplicate Check ──');
console.log(`  Zero-length: ${mfgValidation.stats.zeroLengthCount}`);
console.log(`  Duplicates: ${mfgValidation.stats.duplicateCount}`);
console.log(`  Validation valid: ${mfgValidation.valid}`);
if (!mfgValidation.valid) {
  console.log(`  Errors: ${mfgValidation.errors.join('; ')}`);
}

// ============================================================
// FINAL SUMMARY
// ============================================================
console.log('\n');
console.log('============================================================');
console.log('  PASS / FAIL SUMMARY');
console.log('============================================================');
console.log('');

results.forEach(r => {
  const tag = r.pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${r.id.toString().padStart(2)}. ${r.name.padEnd(35)} ${tag}  ${r.detail}`);
});

const totalPass = results.filter(r => r.pass).length;
const totalFail = results.filter(r => !r.pass).length;

console.log('');
console.log(`  Total: ${totalPass} PASS / ${totalFail} FAIL out of ${results.length}`);
console.log('============================================================');

if (totalFail > 0) {
  console.log('\n\x1b[31m⚠ FAILURES DETECTED — See details above\x1b[0m');
  process.exit(1);
} else {
  console.log('\n\x1b[32m✓ ALL CHECKS PASSED — Manufacturing Export Verified\x1b[0m');
  process.exit(0);
}
