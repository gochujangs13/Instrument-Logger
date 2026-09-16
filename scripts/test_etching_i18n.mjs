// Verification of Etching Design Bilingual i18n
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const etchingFilePath = path.resolve(__dirname, '../instruments/etching_design.js');
const code = fs.readFileSync(etchingFilePath, 'utf8');

// Extract I18N object
const match = code.match(/const I18N = (\{[\s\S]*?\n\};)/);
if (!match) {
  console.error('FAIL: Could not locate I18N dictionary in instruments/etching_design.js');
  process.exit(1);
}

// Evaluate I18N dictionary
const evalI18N = new Function(`return ${match[1]}`)();

console.log('=== VERIFYING ETCHING DESIGN I18N DICTIONARY ===\n');

const koKeys = Object.keys(evalI18N.ko);
const enKeys = Object.keys(evalI18N.en);

console.log(`Korean keys count: ${koKeys.length}`);
console.log(`English keys count: ${enKeys.length}`);

// 1. Key Parity Check
let parityPass = true;
koKeys.forEach(k => {
  if (!evalI18N.en[k]) {
    console.error(`[FAIL] Key "${k}" in ko is missing in en!`);
    parityPass = false;
  }
});
enKeys.forEach(k => {
  if (!evalI18N.ko[k]) {
    console.error(`[FAIL] Key "${k}" in en is missing in ko!`);
    parityPass = false;
  }
});

if (parityPass) {
  console.log('[PASS] 100% Key parity between Korean and English dictionaries.');
} else {
  process.exit(1);
}

// 2. English Dictionary purity check (no Korean characters in English values)
let enPurityPass = true;
const koreanCharRegex = /[가-힣]/;
for (const [k, v] of Object.entries(evalI18N.en)) {
  if (koreanCharRegex.test(v)) {
    console.error(`[FAIL] English key "${k}" contains Korean characters: "${v}"`);
    enPurityPass = false;
  }
}
if (enPurityPass) {
  console.log('[PASS] English dictionary is 100% pure (zero Korean characters).');
} else {
  process.exit(1);
}

// 3. Korean Dictionary check (ensure major labels are translated into Korean)
const expectedKoreanKeys = [
  'mode_single', 'mode_mixed', 'sec_preset', 'sec_plate', 'plate_width', 'plate_height',
  'margin_auto', 'margin_manual', 'sec_sample', 'sec_orient', 'sec_layout', 'layout_fixed',
  'layout_auto', 'cols', 'rows', 'sec_tabs', 'sec_mixed_sheet', 'mixed_sheet_w', 'mixed_sheet_h',
  'btn_new', 'btn_open', 'btn_save', 'btn_undo', 'btn_redo', 'sec_calc_title', 'total_specimens_lbl'
];

let koCheckPass = true;
expectedKoreanKeys.forEach(k => {
  if (!koreanCharRegex.test(evalI18N.ko[k])) {
    console.error(`[FAIL] Korean key "${k}" does not contain expected Korean translation: "${evalI18N.ko[k]}"`);
    koCheckPass = false;
  }
});
if (koCheckPass) {
  console.log('[PASS] Korean dictionary has native Korean strings for all critical sections.');
} else {
  process.exit(1);
}

console.log('\n=== ALL I18N CHECKS PASSED SUCCESSFULLY! ===');
