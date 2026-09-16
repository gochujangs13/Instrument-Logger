import fs from 'fs';
import assert from 'node:assert/strict';
import { buildSP2100ChartPlan, patchSP2100ChartXml } from '../instruments/sp2100_xlsx.js';

console.log('--- Testing SP-2100 XLSX Logic ---');

const mockModel = {
  runs: [
    {
      label: '1-1',
      name: '제품 A',
      avg: 129.26,
      sp: 4.5,
      kp: 285.5,
      val: -4.6,
      rms: 125.0,
      speed: 90,
      delay: 1,
      avgTime: 5,
      rawRows: [
        { time: 0.0, force: -0.5 },
        { time: 1.0, force: -1.2 },
        { time: 2.0, force: 150.0 },
        { time: 3.0, force: 285.5 },
        { time: 4.0, force: 250.0 },
        { time: 5.0, force: -4.0 },
        { time: 6.0, force: -4.6 },
      ],
    },
    {
      label: '1-2',
      name: '제품 B',
      avg: 151.83,
      sp: 67.4,
      kp: 436.2,
      val: -7.8,
      rms: 159.4,
      speed: 90,
      delay: 1,
      avgTime: 5,
      rawRows: [
        { time: 0.0, force: 0.0 },
        { time: 1.0, force: 67.4 },
        { time: 2.0, force: 200.0 },
        { time: 3.0, force: 436.2 },
        { time: 4.0, force: 300.0 },
        { time: 5.0, force: 10.0 },
        { time: 6.0, force: -7.8 },
      ],
    },
  ],
};

// 1. Chart plan verification
const planKo = buildSP2100ChartPlan(mockModel, 'ko');
console.log('Chart Plan Ko ranges:', planKo.ranges.length);
assert.equal(planKo.ranges.length, 2);
assert.equal(planKo.sampleLegend.length, 2);
assert.equal(planKo.ranges[0].name, '제품 A');
assert.equal(planKo.ranges[1].name, '제품 B');
console.log('Helper rows count:', planKo.helperRows.length);
assert.equal(planKo.helperRows.length, 14);
assert.match(planKo.helperRows[0].valueFormula, /'대시보드'!\$A\$\d+/);
assert.match(planKo.helperRows[0].timeFormula, /'Raw Data'!\$?[A-Z]+\d+/);

const planEn = buildSP2100ChartPlan(mockModel, 'en');
assert.match(planEn.helperRows[0].valueFormula, /'Dashboard'!\$A\$\d+/);

// 2. Chart XML patch verification
const chartFixture = '<c:chartSpace><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>차트 제목</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea>'
  + '<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/><c:dLbls></c:dLbls></c:scatterChart>'
  + '<c:valAx><c:axId val="50010001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:majorUnit val="1"/></c:valAx>'
  + '<c:valAx><c:axId val="50010002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:majorUnit val="50"/></c:valAx>'
  + '</c:plotArea><c:plotVisOnly val="1"/><c:legend><c:legendPos val="t"/></c:legend></c:chart></c:chartSpace>';

const patchedChart = patchSP2100ChartXml(chartFixture, mockModel, 'ko');
assert.doesNotMatch(patchedChart, /<c:legend>/);
assert.match(patchedChart, /<c:scatterStyle val="lineMarker"\/>/);
assert.match(patchedChart, /<c:size val="2"\/>/);
assert.match(patchedChart, /<c:plotVisOnly val="0"\/>/);
assert.match(patchedChart, /<a:t>박리력 비교 그래프 \(Force-Time\)<\/a:t>/);
assert.match(patchedChart, /_ChartData!\$C\$2:\$C\$8/);
assert.match(patchedChart, /_ChartData!\$C\$9:\$C\$15/);

console.log('All SP-2100 XLSX unit tests passed successfully!');
