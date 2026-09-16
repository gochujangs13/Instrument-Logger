// Isolated browser regression: no instrument connection and no measurement-file writes.
// Usage: node scripts/test_keithley_2400_graph.mjs [path-to-playwright-package]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname, join } from 'node:path';
import { tmpdir } from 'node:os';

const { chromium } = createRequire(import.meta.url)(process.argv[2] || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json' };
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!path.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const outputDir = await mkdtemp(join(tmpdir(), 'k2400-4wire-'));
let browser;
try {
  browser = await chromium.launch({ channel:'msedge', headless:true });
  const page = await browser.newPage({ viewport:{width:1600,height:1050} });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const row = (runId, elapsed, current) => ({
    runId, timestamp:`2026-09-08T01:00:0${elapsed}.000Z`, sample:`SIMULATED · ${runId}`,
    mode:'time', sense:4, sourceMode:'VOLT', sourceSetpoint:9, voltage:9, current,
    resistance:current === null ? null : 9/current, elapsed, complianceLimit:0.02,
  });
  const rows = [
    ...[0.010,0.008,null,0.006,null,0.004].map((current,i)=>row('gaps',i,current)),
    row('single',0,0.008),
  ];
  await page.route('**/api/**', route => route.fulfill({
    contentType:'application/json', body:JSON.stringify(route.request().url().endsWith('/keithley2400/evaldata') && route.request().method()==='GET'
      ? {rows} : {ok:true,success:true,ports:[],resources:[]}),
  }));
  await page.addInitScript(() => {
    window.graphCalls = { strokes:[], dots:[] };
    const proto = CanvasRenderingContext2D.prototype;
    for (const name of ['setTransform','beginPath','moveTo','lineTo','arc','stroke']) {
      const original = proto[name];
      proto[name] = function(...args) {
        if (this.canvas.id === 'k2400Chart') {
          if(name==='setTransform') window.graphCalls = {strokes:[],dots:[]};
          if(name==='beginPath') this.testPath = [];
          if(name==='moveTo'||name==='lineTo') (this.testPath ||= []).push([name,...args]);
          if(name==='arc') window.graphCalls.dots.push(args);
          if(name==='stroke') window.graphCalls.strokes.push({dash:this.getLineDash(),path:[...(this.testPath||[])]});
        }
        return original.apply(this,args);
      };
    }
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => window.app?._instruments?.['Keithley 2400']);
  await page.evaluate(() => app.launchInstrument('Keithley 2400'));
  await page.waitForFunction(() => document.querySelectorAll('#k2400Tbody tr').length === 2);
  const layout = await page.evaluate(() => ({
    canvas:document.querySelector('#k2400Chart').getBoundingClientRect().width,
    wrap:document.querySelector('.k2400-graph-wrap').getBoundingClientRect().width,
    right:getComputedStyle(document.querySelector('#rightpanel')).display,
  }));
  assert.ok(layout.canvas > 700, `Chart must fill the center, not default to a tiny canvas: ${layout.canvas}px`);
  assert.ok(Math.abs(layout.canvas - layout.wrap) < 4);
  assert.equal(layout.right,'none');
  await page.evaluate(() => {
    app.instr.toggleGraphMetric('voltage',false);
    app.instr.toggleGraphMetric('resistance',false);
  });
  const single = await page.evaluate(() => window.graphCalls);
  assert.equal(single.dots.length,1,'Single reading must render a visible dot');
  await page.evaluate(() => app.instr.toggleResult(encodeURIComponent('gaps'),true));
  const gaps = await page.evaluate(() => window.graphCalls);
  assert.equal(gaps.dots.length,2,'Isolated samples on either side of a gap remain visible');
  const currentStrokes = gaps.strokes.filter(s => s.dash.join(',') === '9,5');
  assert.equal(currentStrokes.length,1,'Do not connect across missing readings');
  assert.equal(currentStrokes[0].path.length,2);
  for(const language of ['ko','en']) {
    await page.evaluate(lang => {
      app.lang = lang;
      app.instr.toggleGraphMetric('voltage',true);
      app.instr.toggleGraphMetric('resistance',true);
      app.instr.onRebuild();
    },language);
    await page.locator('.k2400-center-graph').screenshot({path:join(outputDir,`graph-${language}.png`)});
  }
  assert.deepEqual(errors,[],'Integrated module must load and render without JavaScript errors');
  console.log(JSON.stringify({result:'PASS',checks:['integrated HTTP module load','single point','missing-data gaps','V/I/R axes'],outputDir}));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
