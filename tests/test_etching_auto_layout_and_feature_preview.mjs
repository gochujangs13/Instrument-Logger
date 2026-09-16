import assert from 'assert';
import fs from 'fs';
import { EtchingState } from '../instruments/etching_design/state.js';
import { calculateSingleTypeGeometry } from '../instruments/etching_design/geometry.js';
import { getPreset } from '../instruments/etching_design/presets.js';

console.log('=== ETCHING AUTO LAYOUT & ONE-SPECIMEN FEATURE PREVIEW TESTS ===');

// Auto layout derives both axes from plate, specimen, and gap dimensions.
const base = {
  plate: { width: 100, height: 50 },
  sample: { width: 15, height: 6, orientation: 0 },
  layout: { mode: 'auto', columns: 99, rows: 99 },
  gaps: { horizontalGap: 3, verticalGap: 1 },
  margin: { mode: 'manual', left: 5, right: 5, top: 4, bottom: 4 },
  tabs: { enabled: true, width: 0.5, length: 0.5, count: 1 },
};
const autoA = calculateSingleTypeGeometry(base);
assert.strictEqual(autoA.layout.columns, 5);
assert.strictEqual(autoA.layout.rows, 6);

const autoB = calculateSingleTypeGeometry({
  ...base,
  plate: { width: 82, height: 36 },
  gaps: { horizontalGap: 5, verticalGap: 2 },
});
assert.strictEqual(autoB.layout.columns, 3);
assert.strictEqual(autoB.layout.rows, 3);
console.log('[PASS] Auto layout responds to plate, specimen, margin, and gap dimensions.');

// Fixed mode respects the manually entered columns and rows.
const fixed = calculateSingleTypeGeometry({ ...base, layout: { mode: 'fixed', columns: 2, rows: 4 } });
assert.strictEqual(fixed.layout.columns, 2);
assert.strictEqual(fixed.layout.rows, 4);
console.log('[PASS] Manual columns/rows mode preserves the requested quantity.');

// Draft feature stays out of manufacturing geometry until explicitly applied.
const state = new EtchingState();
state.setMode('mixed');
state.setTabFeature(0, { type: 'hole', holeDia: 0.2, posX: 'center' });
assert.strictEqual(state.mixed.types[0].tabs.feature.type, 'hole');
assert.strictEqual(state.mixed.types[0].tabs.appliedFeature.type, 'none');
state.applyTabFeatureToType(0);
assert.strictEqual(state.mixed.types[0].tabs.appliedFeature.type, 'hole');
assert.strictEqual(state.mixed.types[1].tabs.appliedFeature.type, 'none');
console.log('[PASS] Draft preview commits only to the selected specimen type.');

// UI contract: a selected specimen gates type-wide application and selected
// specimen rendering uses the draft feature.
const uiSource = fs.readFileSync(new URL('../instruments/etching_design.js', import.meta.url), 'utf8');
assert(uiSource.includes('selectedSampleMatchesType'));
assert(uiSource.includes("state.applyTabFeatureToType(idx)"));
assert(uiSource.includes('const tabFeature = previewFeature || sampleTab?.feature'));
assert(uiSource.includes("layout_auto_help: '원판 크기, 시편 크기"));
assert(uiSource.includes('<option value="fourPoints"'));
assert(uiSource.includes('<option value="twoPoints"'));
assert(uiSource.includes('etchSingleTabHoleInsetX'));
assert(uiSource.includes('etchSingleTabHoleInsetY'));
assert(!uiSource.includes('<option value="specimen"'));
assert(!uiSource.includes('<option value="runner"'));
console.log('[PASS] Canvas preview and apply-button UI contract is present.');

// Every preset starts with a 1 mm top/bottom etch gap, while the user can edit it.
for (const key of ['TYPE_1', 'TYPE_2', 'TYPE_3', 'CUSTOM']) {
  assert.strictEqual(getPreset(key).gaps.verticalGap, 1, `${key} must default to 1 mm vertical etch gap`);
}
console.log('[PASS] All bridge presets default to a 1 mm top/bottom etch gap.');

// Plate dimensions persist across modes, preset changes, and a new app state.
const persisted = new Map();
global.localStorage = {
  getItem: key => persisted.has(key) ? persisted.get(key) : null,
  setItem: (key, value) => persisted.set(key, String(value)),
};
const persistentState = new EtchingState();
persistentState.setPlateWidth(333);
persistentState.setPlateHeight(222);
persistentState.loadPreset('TYPE_2');
assert.strictEqual(persistentState.single.plate.width, 333);
assert.strictEqual(persistentState.mixed.plate.height, 222);
const reopenedState = new EtchingState();
assert.strictEqual(reopenedState.single.plate.width, 333);
assert.strictEqual(reopenedState.single.plate.height, 222);
assert.strictEqual(reopenedState.mixed.plate.width, 333);
delete global.localStorage;
console.log('[PASS] Plate dimensions persist across mode, preset, and app restart.');

console.log('=== ALL AUTO LAYOUT & FEATURE PREVIEW TESTS PASSED ===');
