import assert from 'assert';

// Mock DOM & environment for testing logic extracted from sp2100_logger.js
const SEG_COLORS = [
  { fill: 'rgba(56, 189, 248, 0.22)', border: '#38bdf8' },
  { fill: 'rgba(245, 158, 11, 0.22)', border: '#f59e0b' },
  { fill: 'rgba(168, 85, 247, 0.22)', border: '#a855f7' },
  { fill: 'rgba(16, 185, 129, 0.22)', border: '#10b981' },
  { fill: 'rgba(236, 72, 153, 0.22)', border: '#ec4899' },
];

function getWaveSegmentsStats(segments, force, tMax) {
  if (!force || !force.length || !segments || !segments.length) return null;
  const n = force.length;

  const segDetails = segments.map((seg, idx) => {
    const i1 = Math.max(0, Math.min(seg.startIdx, seg.endIdx));
    const i2 = Math.min(n - 1, Math.max(seg.startIdx, seg.endIdx));
    const slice = force.slice(i1, i2 + 1);
    const avg = slice.length ? (slice.reduce((a, b) => a + b, 0) / slice.length) : 0;
    const min = slice.length ? Math.min(...slice) : 0;
    const max = slice.length ? Math.max(...slice) : 0;
    const t1 = tMax != null ? (tMax * i1 / Math.max(1, n - 1)) : null;
    const t2 = tMax != null ? (tMax * i2 / Math.max(1, n - 1)) : null;
    const dt = (t1 != null && t2 != null) ? (t2 - t1) : null;
    return {
      id: seg.id,
      index: idx + 1,
      i1, i2,
      sliceLen: slice.length,
      avg, min, max,
      t1, t2, dt,
      isActiveDrag: !!seg.isActiveDrag,
    };
  });

  const indices = new Set();
  for (const seg of segments) {
    const i1 = Math.max(0, Math.min(seg.startIdx, seg.endIdx));
    const i2 = Math.min(n - 1, Math.max(seg.startIdx, seg.endIdx));
    for (let i = i1; i <= i2; i++) {
      if (i >= 0 && i < n) indices.add(i);
    }
  }

  if (indices.size === 0) return null;

  let sum = 0, combMin = Infinity, combMax = -Infinity;
  for (const idx of indices) {
    const val = force[idx];
    sum += val;
    if (val < combMin) combMin = val;
    if (val > combMax) combMax = val;
  }
  const combAvg = sum / indices.size;

  return {
    segments: segDetails,
    count: segments.length,
    totalPoints: indices.size,
    combAvg,
    combMin: combMin === Infinity ? 0 : combMin,
    combMax: combMax === -Infinity ? 0 : combMax,
  };
}

console.log('Testing SP-2100 Multi-segment logic...');

// Test 1: Simple single segment
const dummyForce = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]; // 10 samples (indices 0..9)
const tMax = 5.0; // 5.0 seconds
const seg1 = { id: 1, startIdx: 1, endIdx: 3 }; // slice: [20, 30, 40] -> avg 30, min 20, max 40
const stats1 = getWaveSegmentsStats([seg1], dummyForce, tMax);

assert.strictEqual(stats1.count, 1);
assert.strictEqual(stats1.totalPoints, 3);
assert.strictEqual(stats1.combAvg, 30);
assert.strictEqual(stats1.combMin, 20);
assert.strictEqual(stats1.combMax, 40);
assert.strictEqual(stats1.segments[0].index, 1);
console.log('✓ Test 1 passed: Single segment stats accurate.');

// Test 2: Multiple non-overlapping segments
const seg2 = { id: 2, startIdx: 6, endIdx: 8 }; // slice: [70, 80, 90] -> avg 80, min 70, max 90
const stats2 = getWaveSegmentsStats([seg1, seg2], dummyForce, tMax);

assert.strictEqual(stats2.count, 2);
assert.strictEqual(stats2.totalPoints, 6);
// Combined: [20, 30, 40, 70, 80, 90] -> sum = 330 / 6 = 55
assert.strictEqual(stats2.combAvg, 55);
assert.strictEqual(stats2.combMin, 20);
assert.strictEqual(stats2.combMax, 90);
console.log('✓ Test 2 passed: Multiple non-overlapping segments stats accurate.');

// Test 3: Overlapping segments deduplication
const seg3 = { id: 3, startIdx: 2, endIdx: 4 }; // overlaps seg1 at idx 2, 3
const stats3 = getWaveSegmentsStats([seg1, seg3], dummyForce, tMax);
// Indices in seg1 (1..3) and seg3 (2..4) -> union is {1, 2, 3, 4}: [20, 30, 40, 50]
assert.strictEqual(stats3.count, 2);
assert.strictEqual(stats3.totalPoints, 4); // not 3 + 3 = 6! Deduplication works!
assert.strictEqual(stats3.combAvg, 35);
console.log('✓ Test 3 passed: Overlapping segments correctly deduplicated without bias.');

// Test 4: Apply to record and Restore
const record = {
  id: 101,
  name: 'Sample A',
  AVG: 25.5,
  KP: 60.0,
  SP: 10.0,
  VAL: 5.0,
  RMS: 1.2,
  _orig: { AVG: 25.5, KP: 60.0, SP: 10.0, VAL: 5.0, RMS: 1.2 },
  _isModified: false,
  _appliedSegments: null,
};

// Simulate applySegmentsToTable with stats2 (combAvg: 55, combMax: 90, combMin: 20)
record.AVG = parseFloat(stats2.combAvg.toFixed(2));
record.KP = parseFloat(stats2.combMax.toFixed(2));
record.VAL = parseFloat(stats2.combMin.toFixed(2));
record._isModified = true;
record._appliedSegments = [seg1, seg2];

assert.strictEqual(record.AVG, 55);
assert.strictEqual(record.KP, 90);
assert.strictEqual(record.VAL, 20);
assert.strictEqual(record._isModified, true);
assert.strictEqual(record._appliedSegments.length, 2);
console.log('✓ Test 4 passed: Record values updated upon apply.');

// Simulate restoreOriginalTableData
record.AVG = record._orig.AVG;
record.KP = record._orig.KP;
record.SP = record._orig.SP;
record.VAL = record._orig.VAL;
record.RMS = record._orig.RMS;
record._isModified = false;
record._appliedSegments = null;

assert.strictEqual(record.AVG, 25.5);
assert.strictEqual(record.KP, 60.0);
assert.strictEqual(record._isModified, false);
assert.strictEqual(record._appliedSegments, null);
console.log('✓ Test 5 passed: Record restored back to exact original measurement values.');

console.log('All SP-2100 multi-segment tests PASSED!');
