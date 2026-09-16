import assert from 'node:assert/strict';
import fs from 'node:fs';

const core = fs.readFileSync(new URL('../core.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const start = core.indexOf('function resolveInstrumentLayoutMode');
const end = core.indexOf('// ── Main Application', start);
assert.ok(start >= 0 && end > start, 'shared layout resolver source block not found');
const resolveInstrumentLayoutMode = new Function(`${core.slice(start, end)}; return resolveInstrumentLayoutMode;`)();

assert.equal(resolveInstrumentLayoutMode({ viewType:'grid' }, {
  hasRightPanelBuilder:false, rightHasContent:false,
}), 'three', 'grid instruments retain the shared chart column');
assert.equal(resolveInstrumentLayoutMode({ viewType:'custom' }, {
  hasRightPanelBuilder:false, rightHasContent:false,
}), 'two', 'a new custom card without a right-panel builder must not reserve blank space');
assert.equal(resolveInstrumentLayoutMode({ viewType:'custom' }, {
  hasRightPanelBuilder:true, rightHasContent:true, rightDisplay:'', rightHidden:false,
}), 'three', 'a populated custom right panel must remain visible');
assert.equal(resolveInstrumentLayoutMode({ viewType:'custom' }, {
  hasRightPanelBuilder:true, rightHasContent:true, rightDisplay:'none', rightHidden:false,
}), 'two', 'an explicitly hidden right panel must collapse');
assert.equal(resolveInstrumentLayoutMode({ viewType:'custom' }, {
  hasRightPanelBuilder:true, rightHasContent:false, rightDisplay:'', rightHidden:false,
}), 'two', 'an empty custom right panel must collapse automatically');
assert.equal(resolveInstrumentLayoutMode({ viewType:'custom' }, {
  singleColumn:true, hasRightPanelBuilder:true, rightHasContent:true,
}), 'one', 'single-column editor mode must hide both side panels');
assert.equal(resolveInstrumentLayoutMode({ viewType:'custom', layoutMode:'two' }, {
  hasRightPanelBuilder:true, rightHasContent:true,
}), 'two', 'an explicit module layout contract must take priority');
assert.equal(resolveInstrumentLayoutMode({ viewType:'custom', layoutMode:()=>'one' }, {
  hasRightPanelBuilder:true, rightHasContent:true,
}), 'one', 'a dynamic module layout contract must be supported');

assert.match(core, /_resetInstrumentLayout\(\)/);
assert.match(core, /_syncInstrumentLayout\(\)/);
assert.match(core, /MutationObserver/);
assert.match(core, /ResizeObserver/);
assert.match(css, /#layout\[data-layout-mode="one"\]/);
assert.match(css, /#layout\[data-layout-mode="two"\]/);
assert.match(css, /#layout\[data-layout-mode="three"\]/);
assert.match(css, /#layout \.graph-area > canvas/);

console.log('Integrated layout contract tests passed.');
