import assert from 'node:assert/strict';
import {
  automaticOvpPlan, buildGraphSeries, buildXlsxExportModel, clampSafetyConfig, clampSourceForCompliance, currentAmpsToMilliamps, currentSourceResistanceReference, formatCurrentMilliamps, formatMilliamps, formatResultDate, graphRunColor, graphSeriesStyle, graphSegments, maximumComplianceForSource,
  maximumSourceForCompliance, mergeEvaluationRows, normalizeEvaluationPayload, parseReading, safetyAdjustmentDetails, selectGraphRuns, summarizeRunRows,
  selectRawRows, validateCycleConfig, validateSafetyConfig, voltageHazardSummary, voltageSourceResistanceReference,
} from '../instruments/keithley_2400.js';
import { buildTemplateChartPlan, buildTemplateExportLayout, patchTemplateChartXml } from '../instruments/keithley_2400_xlsx.js';

const validV = validateSafetyConfig({ sourceMode: 'VOLT', sourceValue: 200, compliance: 0.105 });
assert.equal(validV.ok, true);
assert.ok(Math.abs(validV.maxPower - 21) < 1e-12);
assert.equal(validateSafetyConfig({ sourceMode: 'VOLT', sourceValue: 210, compliance: 0.105 }).ok, false);
assert.equal(validateSafetyConfig({ sourceMode: 'VOLT', sourceValue: 210.001, compliance: 0.001 }).ok, false);
assert.equal(validateSafetyConfig({ sourceMode: 'VOLT', sourceValue: 21, compliance: 1 }).ok, true);
assert.equal(validateSafetyConfig({ sourceMode: 'VOLT', sourceValue: 21, compliance: 1.05 }).ok, false);
assert.equal(validateSafetyConfig({ sourceMode: 'VOLT', sourceValue: 21.01, compliance: 0.105 }).ok, true);
assert.equal(validateSafetyConfig({ sourceMode: 'VOLT', sourceValue: 1, compliance: 0.5e-9 }).ok, false);
assert.equal(validateSafetyConfig({ sourceMode: 'CURR', sourceValue: 1.05, compliance: 20 }).ok, true);
assert.equal(validateSafetyConfig({ sourceMode: 'CURR', sourceValue: 1.05, compliance: 21 }).ok, false);
assert.equal(validateSafetyConfig({ sourceMode: 'CURR', sourceValue: 0.105, compliance: 200 }).ok, true);
assert.equal(validateSafetyConfig({ sourceMode: 'CURR', sourceValue: 1e-3, compliance: 0.1e-3 }).ok, false);
assert.equal(validateSafetyConfig({ sourceMode: 'CURR', sourceValue: 0.106, compliance: 200 }).ok, false);
assert.equal(validateSafetyConfig({ sourceMode: 'CURR', sourceValue: -1.051, compliance: 1 }).ok, false);

assert.equal(maximumComplianceForSource('VOLT', 200), 0.105);
assert.equal(maximumSourceForCompliance('VOLT', 1), 21);
assert.equal(maximumSourceForCompliance('CURR', 200), 0.105);
assert.equal(clampSourceForCompliance('VOLT', 200, 1), 21);
assert.equal(currentSourceResistanceReference(0.01, 20), 2000);
assert.equal(currentSourceResistanceReference(-0.01, -20), 2000);
assert.equal(currentSourceResistanceReference(0, 20), null);
assert.equal(voltageSourceResistanceReference(9, 0.01), 900);
assert.equal(voltageSourceResistanceReference(-20, -0.001), 20000);
assert.equal(voltageSourceResistanceReference(9, 0), null);
assert.deepEqual(voltageHazardSummary({ sourceMode:'VOLT', testMode:'spot', sourceValue:29.9, compliance:0.1 }), { maxVoltage:29.9, maxCompliance:0.1, hazardous:false });
assert.deepEqual(voltageHazardSummary({ sourceMode:'VOLT', testMode:'spot', sourceValue:-30, compliance:0.1 }), { maxVoltage:30, maxCompliance:0.1, hazardous:true });
assert.deepEqual(voltageHazardSummary({ sourceMode:'CURR', testMode:'time', sourceValue:0.01, compliance:200 }), { maxVoltage:200, maxCompliance:200, hazardous:true });
assert.deepEqual(voltageHazardSummary({ sourceMode:'VOLT', testMode:'sweep', sweepStart:-10, sweepStop:80, compliance:0.01 }), { maxVoltage:80, maxCompliance:0.01, hazardous:true });
assert.deepEqual(voltageHazardSummary({ sourceMode:'CURR', testMode:'cycle', cycleSteps:[{source:0.01,compliance:20},{source:0.01,compliance:60}] }), { maxVoltage:60, maxCompliance:60, hazardous:true });
const clampedV = clampSafetyConfig({ sourceMode: 'VOLT', sourceValue: 500, compliance: 1 });
assert.equal(clampedV.sourceValue, 200);
assert.equal(clampedV.compliance, 0.105);
const clampedI = clampSafetyConfig({ sourceMode: 'CURR', sourceValue: -2, compliance: 200 });
assert.equal(clampedI.sourceValue, -1.05);
assert.ok(Math.abs(clampedI.compliance - (22 / 1.05)) < 1e-12);
const adjustedSpec = safetyAdjustmentDetails({ sourceMode:'VOLT', sourceValue:300, compliance:1 });
assert.equal(adjustedSpec.sourceChanged, true);
assert.equal(adjustedSpec.complianceChanged, true);
assert.equal(adjustedSpec.sourceValue, 200);
assert.equal(adjustedSpec.compliance, 0.105);
assert.equal(safetyAdjustmentDetails({ sourceMode:'VOLT', sourceValue:60, compliance:0.1 }).sourceChanged, false);
assert.equal(safetyAdjustmentDetails({ sourceMode:'VOLT', sourceValue:60, compliance:0.1 }).complianceChanged, false);
assert.deepEqual(automaticOvpPlan(10), { sourceVoltage:10, requestedOvp:20, instrumentCommand:20, instrumentCutoff:20 });
assert.deepEqual(automaticOvpPlan(100), { sourceVoltage:100, requestedOvp:110, instrumentCommand:120, instrumentCutoff:120 });
assert.deepEqual(automaticOvpPlan(200), { sourceVoltage:200, requestedOvp:210, instrumentCommand:'NONE', instrumentCutoff:210 });

const validCycle = validateCycleConfig({
  sourceMode: 'VOLT', cycleLoops: 2, cycleInterval: 0.5,
  cycleSteps: [
    { source: 0.05, compliance: 0.001, duration: 1 },
    { source: 0.1, compliance: 0.001, duration: 2 },
  ],
});
assert.equal(validCycle.ok, true);
assert.equal(validCycle.totalDuration, 6);
assert.equal(validateCycleConfig({ sourceMode: 'VOLT', cycleLoops: 1, cycleInterval: 0.5, cycleSteps: [] }).ok, false);
assert.equal(validateCycleConfig({ sourceMode: 'VOLT', cycleLoops: 0, cycleInterval: 0.5, cycleSteps: [{ source: 1, compliance: 0.001, duration: 1 }] }).ok, false);
assert.equal(validateCycleConfig({ sourceMode: 'VOLT', cycleLoops: 1, cycleInterval: 0.1, cycleSteps: [{ source: 1, compliance: 0.001, duration: 1 }] }).ok, false);
assert.equal(validateCycleConfig({ sourceMode: 'VOLT', cycleLoops: 1, cycleInterval: 0.5, cycleSteps: [{ source: 211, compliance: 0.001, duration: 1 }] }).ok, false);
assert.equal(validateCycleConfig({ sourceMode: 'VOLT', cycleLoops: 1, cycleInterval: 0.5, cycleSteps: [{ source: 1, compliance: 0.001, duration: 0.1 }] }).ok, false);

const normal = parseReading('1.000000E+00,1.000000E-03,2.500000E+00,0');
assert.equal(normal.voltage, 1);
assert.equal(normal.current, 0.001);
assert.equal(normal.resistance, 1000);
assert.equal(normal.power, 0.001);
assert.equal(normal.compliance, false);

// Captured from Model 2400 S/N 1162685 over COM4 on 2026-08-26.
// Conditions: Source V 0.1 V, current compliance 1 mA, 4-wire, 1 NPLC.
const capturedOpenLoad = parseReading('+1.000202E-01,+1.642276E-10,+4.799660E+03,+4.217860E+06');
assert.equal(capturedOpenLoad.voltage, 0.1000202);
assert.equal(capturedOpenLoad.current, 1.642276e-10);
assert.ok(Math.abs(capturedOpenLoad.resistance - 609034047.870151) < 1e-6);
assert.equal(capturedOpenLoad.compliance, false);

// Captured from the same Model 2400 over GPIB0::2::INSTR on 2026-08-26.
// Conditions: Source V 0.1 V, current compliance 1 mA, 4-wire, 1 NPLC.
const capturedGpibOpenLoad = parseReading('+1.000000E-01,+1.384179E-10,+7.798027E+02,+4.215812E+06');
assert.equal(capturedGpibOpenLoad.voltage, 0.1);
assert.equal(capturedGpibOpenLoad.current, 1.384179e-10);
assert.ok(Math.abs(capturedGpibOpenLoad.resistance - 722449914.3535627) < 1e-6);
assert.equal(capturedGpibOpenLoad.compliance, false);

const compliance = parseReading('1.000000E+00,1.000000E-03,2.500000E+00,8');
assert.equal(compliance.compliance, true);
assert.equal(compliance.ovp, false);
const ovpReading = parseReading('1.100000E+01,1.000000E-03,2.500000E+00,16');
assert.equal(ovpReading.compliance, false);
assert.equal(ovpReading.ovp, true);

const overflow = parseReading('+9.900000E+37,1.000000E-03,2.500000E+00,1');
assert.equal(overflow.overflow, true);
assert.equal(Number.isNaN(overflow.voltage), true);
assert.equal(parseReading('not,a,reading'), null);
for (const malformed of ['1,,2,0', ',.001,2,0', '1,.001,,0', '1,.001,2,', '1,.001,2,0,1,.002,3,0', '1,.001,2,0.5', '1,.001,2,-1', '1,.001,2,16777216']) {
  assert.equal(parseReading(malformed), null, `Reject incomplete or unexpected READ? data: ${malformed}`);
}
assert.equal(parseReading('9,9.910000E+37,1,0').overflow, true);
assert.equal(Number.isNaN(parseReading('9,0,1,0').resistance), true);
assert.equal(parseReading('-9,-0.000000002,1,0').current, -2e-9, 'Keep the sign and scale of low current');
assert.equal(currentAmpsToMilliamps(0.001419546), 1.419546);
assert.equal(currentAmpsToMilliamps(0.0007207676), 0.7207676);
assert.equal(Number.isNaN(currentAmpsToMilliamps(null)), true);
assert.equal(formatCurrentMilliamps(0.001419546), '1.41955');
assert.equal(formatCurrentMilliamps(0.0007207676), '0.72077');
assert.equal(formatCurrentMilliamps(1.51e-9), '0.00000');
assert.equal(formatCurrentMilliamps(2.87e-10), '0.00000');
assert.equal(formatMilliamps(0), '0.00000');

const gaps = [
  { elapsed:0, current:1e-9 }, { elapsed:1, current:8e-10 },
  { elapsed:2, current:NaN }, { elapsed:3, current:6e-10 },
  { elapsed:4, current:null }, { elapsed:5, current:0 }, { elapsed:6, current:-2e-10 },
];
assert.deepEqual(graphSegments(gaps, 'current'), [
  [{x:0,y:1e-9},{x:1,y:8e-10}], [{x:3,y:6e-10}], [{x:5,y:0},{x:6,y:-2e-10}],
]);
assert.deepEqual(graphSegments([{ sourceSetpoint:0.001, voltage:0.9 }], 'voltage', true), [[{x:0.001,y:0.9}]]);
assert.equal(Number.isNaN(buildGraphSeries([{runId:'gap',elapsed:0,current:null}]).current[0]), true);
assert.equal(summarizeRunRows([{runId:'gap',current:0.008},{runId:'gap',current:null}])[0].avgCurrent, 0.008);

const summaries = summarizeRunRows([
  { runId:'run-a', timestamp:'2026-08-26T01:00:00.000Z', sample:'A', mode:'time', sense:4, sourceMode:'VOLT', sourceSetpoint:9, voltage:8.9, current:0.004, resistance:2225, elapsed:0.2 },
  { runId:'run-a', timestamp:'2026-08-26T01:00:01.000Z', sample:'A', mode:'time', sense:4, sourceMode:'VOLT', sourceSetpoint:9, voltage:-9.1, current:-0.006, resistance:1517, elapsed:1.2 },
  { runId:'run-b', timestamp:'2026-08-26T02:00:00.000Z', sample:'B', mode:'sweep', sense:2, sourceMode:'VOLT', sourceSetpoint:0, voltage:0, current:0, resistance:0, elapsed:0.1 },
  { runId:'run-b', timestamp:'2026-08-26T02:00:01.000Z', sample:'B', mode:'sweep', sense:2, sourceMode:'VOLT', sourceSetpoint:1, voltage:1, current:0.001, resistance:1000, elapsed:1.1, compliance:true },
]);
assert.equal(summaries.length, 2);
assert.equal(summaries[0].count, 2);
assert.equal(summaries[0].maxVoltage, 9.1);
assert.equal(summaries[0].maxCurrent, 0.006);
assert.ok(Math.abs(summaries[0].avgCurrent - (-0.001)) < 1e-12);
assert.equal(summaries[0].maxResistance, 2225);
assert.equal(summaries[0].elapsed, 1.2);
assert.equal(summaries[1].sourceMin, 0);
assert.equal(summaries[1].sourceMax, 1);
assert.equal(summaries[1].compliance, true);
const graphSeries = buildGraphSeries([
  { runId:'old', mode:'time', elapsed:1, voltage:9, current:0.01, resistance:900 },
  { runId:'new', mode:'time', elapsed:0, voltage:8.8, current:0.006, resistance:1466.7 },
  { runId:'new', mode:'time', elapsed:1, voltage:9.0, current:0.004, resistance:2250 },
]);
assert.equal(graphSeries.rows.length, 2);
assert.deepEqual(graphSeries.x, [0, 1]);
assert.deepEqual(graphSeries.voltage, [8.8, 9]);
assert.deepEqual(graphSeries.current, [0.006, 0.004]);
assert.deepEqual(graphSeries.resistance, [1466.7, 2250]);

const graphRows = [
  { runId:'run-a', mode:'time', elapsed:0, sourceSetpoint:9, voltage:8.9, current:0.004, resistance:2225 },
  { runId:'run-a', mode:'time', elapsed:1, sourceSetpoint:9, voltage:9, current:0.003, resistance:3000 },
  { runId:'run-b', mode:'sweep', elapsed:0, sourceSetpoint:0, voltage:0, current:0, resistance:0 },
  { runId:'run-b', mode:'sweep', elapsed:1, sourceSetpoint:1, voltage:1, current:0.001, resistance:1000 },
];
const latestGraph = selectGraphRuns(graphRows, []);
assert.deepEqual(latestGraph.runs.map(run => run.runId), ['run-b']);
assert.equal(latestGraph.rows.length, 2);
assert.equal(latestGraph.sweep, true);
const singleSelectedGraph = selectGraphRuns(graphRows, new Set(['run-a']));
assert.deepEqual(singleSelectedGraph.runs.map(run => run.runId), ['run-a']);
assert.equal(singleSelectedGraph.rows.length, 2);
assert.equal(singleSelectedGraph.sweep, false);
const multipleSelectedGraph = selectGraphRuns(graphRows, new Set(['run-a', 'run-b']));
assert.deepEqual(multipleSelectedGraph.runs.map(run => run.runId), ['run-a', 'run-b']);
assert.equal(multipleSelectedGraph.rows.length, 4);
assert.equal(multipleSelectedGraph.sweep, false);
assert.equal(formatResultDate('2026-08-26T12:00:00.000Z'), '08/26');
assert.equal(formatResultDate('invalid'), '—');
assert.notEqual(graphRunColor(0), graphRunColor(1));
assert.notEqual(graphRunColor(1), graphRunColor(2));
assert.equal(graphRunColor(0), graphRunColor(8));
assert.deepEqual(graphSeriesStyle(0, 'voltage').dash, []);
assert.deepEqual(graphSeriesStyle(0, 'current').dash, [9, 5]);
assert.deepEqual(graphSeriesStyle(0, 'resistance').dash, [2, 4]);
assert.notEqual(graphSeriesStyle(0, 'voltage').color, graphSeriesStyle(1, 'voltage').color);
assert.equal(graphSeriesStyle(0, 'voltage', 1).color, '#3fb6e8');
assert.equal(graphSeriesStyle(0, 'current', 1).color, '#f59e0b');
assert.equal(graphSeriesStyle(0, 'resistance', 1).color, '#22b06a');
assert.equal(graphSeriesStyle(0, 'current', 1).lineWidth, 3);
assert.equal(graphSeriesStyle(0, 'voltage', 2).color, graphRunColor(0));
assert.equal(graphSeriesStyle(1, 'resistance', 2).color, graphRunColor(1));

const rawExportRows = [
  { runId:'run-a', timestamp:'2026-08-26T01:00:00.000Z', sample:'A', mode:'time', sense:4, sourceMode:'VOLT', sourceSetpoint:9, voltage:9, current:0.001, resistance:9000, power:0.009, complianceLimit:0.01, compliance:false, elapsed:0.2, status:0, raw:'raw-a1' },
  { runId:'run-a', timestamp:'2026-08-26T01:00:01.000Z', sample:'A', mode:'time', sense:4, sourceMode:'VOLT', sourceSetpoint:9, voltage:9, current:0.002, resistance:4500, power:0.018, complianceLimit:0.01, compliance:false, elapsed:1.2, status:0, raw:'raw-a2' },
  { runId:'run-b', timestamp:'2026-08-26T02:00:00.000Z', sample:'B', mode:'time', sense:4, sourceMode:'VOLT', sourceSetpoint:5, voltage:5, current:0.001, resistance:5000, power:0.005, complianceLimit:0.01, compliance:false, elapsed:0.2, status:0, raw:'raw-b1' },
  { runId:'run-c', timestamp:'2026-08-26T03:00:00.000Z', sample:'C', mode:'time', sense:4, sourceMode:'VOLT', sourceSetpoint:1, voltage:1, current:0.001, resistance:1000, power:0.001, complianceLimit:0.01, compliance:false, elapsed:0.2, status:0, raw:'raw-c1' },
];
const selectedRaw = selectRawRows(rawExportRows, new Set(['run-a', 'run-c']));
assert.equal(selectedRaw.length, 3);
assert.deepEqual([...new Set(selectedRaw.map(row => row.runId))], ['run-a', 'run-c']);
assert.equal(selectRawRows(rawExportRows, new Set()).length, 4);
const xlsxModel = buildXlsxExportModel(selectedRaw, rawExportRows);
assert.equal(xlsxModel.runCount, 2);
assert.equal(xlsxModel.maxSamples, 2);
assert.deepEqual(xlsxModel.runs.map(run => run.evaluationNo), [1, 3]);
assert.deepEqual(xlsxModel.runs.map(run => run.sample), ['A', 'C']);
assert.deepEqual(xlsxModel.runs.map(run => run.runId), ['run-a', 'run-c']);
assert.equal(xlsxModel.runs[0].rawRows.length, 2);
assert.deepEqual(xlsxModel.runs[0].rawRows[0], { elapsed:0.2, voltage:9, current:0.001, resistance:9000 });
assert.equal(xlsxModel.runs[1].rawRows.length, 1);
assert.deepEqual(xlsxModel.runs[1].rawRows[0], { elapsed:0.2, voltage:1, current:0.001, resistance:1000 });
assert.equal(xlsxModel.runs.some(run => run.runId === 'run-b'), false);
const singleXlsxModel = buildXlsxExportModel(selectRawRows(rawExportRows, new Set(['run-b'])), rawExportRows);
assert.equal(singleXlsxModel.runCount, 1);
assert.equal(singleXlsxModel.runs[0].evaluationNo, 2);
assert.equal(singleXlsxModel.runs[0].sample, 'B');
assert.equal(singleXlsxModel.runs[0].rawRows.length, 1);

const templateLayout = buildTemplateExportLayout(xlsxModel);
assert.equal(templateLayout.graphTitleRow, 3);
assert.equal(templateLayout.metricToggleRow, 4);
assert.equal(templateLayout.sampleLegendStartRow, 5);
assert.equal(templateLayout.sampleLegendEndRow, 6);
assert.equal(templateLayout.graphAnchorStart, 7);
assert.equal(templateLayout.graphAnchorEnd, 29);
assert.equal(templateLayout.summaryHeaderRow, 33);
assert.equal(templateLayout.summaryStartRow, 34);
assert.equal(templateLayout.summaryEndRow, 35);
const templatePlan = buildTemplateChartPlan(xlsxModel, 'en');
assert.equal(templatePlan.helperRows.length, 9);
assert.equal(templatePlan.sampleLegend.length, 2);
assert.deepEqual(templatePlan.sampleLegend.map(item => item.sample), ['A', 'C']);
assert.notEqual(templatePlan.sampleLegend[0].color, templatePlan.sampleLegend[1].color);
assert.equal(templatePlan.ranges[0].metrics.voltage.start, 2);
assert.equal(templatePlan.ranges[0].metrics.voltage.end, 3);
assert.equal(templatePlan.ranges[1].metrics.current.xValues.length, 1);
assert.match(templatePlan.helperRows[0].valueFormula, /'Dashboard'!\$A\$34/);
assert.match(templatePlan.helperRows[0].valueFormula, /'Dashboard'!\$A\$4/);
assert.match(templatePlan.helperRows[0].valueFormula, /'Raw Data'!B9/);
assert.match(templatePlan.helperRows.find(row => row.metric === 'Resistance').valueFormula, /'Raw Data'!D9\*[0-9.e+-]+\/[0-9.e+-]+/i);
assert.notEqual(templatePlan.ranges[0].color, templatePlan.ranges[1].color);
const templatePlanKorean = buildTemplateChartPlan(xlsxModel, 'ko');
assert.match(templatePlanKorean.helperRows[0].valueFormula, /'대시보드'!\$A\$34/);
assert.match(templatePlanKorean.helperRows[0].valueFormula, /'대시보드'!\$A\$4/);

const chartFixture = '<c:chartSpace><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>전압 / 전류 / 저항 그래프</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea>'
  + '<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/><c:ser><c:idx val="99"/></c:ser><c:dLbls></c:dLbls></c:scatterChart>'
  + '<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/><c:ser><c:idx val="100"/></c:ser><c:dLbls></c:dLbls></c:scatterChart>'
  + '<c:valAx><c:axId val="50010001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:majorUnit val="2.0066"/></c:valAx>'
  + '<c:valAx><c:axId val="50010002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:majorUnit val="4.8601"/></c:valAx>'
  + '<c:valAx><c:axId val="50010003"/><c:scaling><c:orientation val="minMax"/></c:scaling></c:valAx>'
  + '<c:valAx><c:axId val="50010004"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:majorUnit val="1.71393408E-9"/></c:valAx>'
  + '</c:plotArea><c:plotVisOnly val="1"/><c:legend><c:legendPos val="t"/></c:legend></c:chart></c:chartSpace>';
const patchedChart = patchTemplateChartXml(chartFixture, xlsxModel, 'en');
assert.doesNotMatch(patchedChart, /<c:legend>/);
assert.doesNotMatch(patchedChart, /<c:majorUnit\b/);
assert.doesNotMatch(patchedChart, /<c:scatterStyle val="lineMarker"\/>/);
assert.match(patchedChart, /<c:scatterStyle val="line"\/>/);
assert.match(patchedChart, /<c:plotVisOnly val="0"\/>/);
assert.doesNotMatch(patchedChart, /<c:v>A<\/c:v>/);
assert.match(patchedChart, /<c:v>A · Voltage<\/c:v>/);
assert.match(patchedChart, /<c:v>C · Resistance<\/c:v>/);
assert.match(patchedChart, /<a:t>Voltage \/ Current \/ Resistance<\/a:t>/);
assert.doesNotMatch(patchedChart, /전압|전류|저항/);
const patchedKoreanChart = patchTemplateChartXml(chartFixture, xlsxModel, 'ko');
assert.match(patchedKoreanChart, /<a:t>전압 \/ 전류 \/ 저항<\/a:t>/);

const storedPayload = {
  schema: '3m-instrument-logger/keithley2400-evaluations', version: 1,
  rows: [
    { runId:'stored-a', timestamp:'2026-08-26T03:00:00.000Z', sample:'Stored A', mode:'time', sense:4, sourceMode:'VOLT', sourceSetpoint:9, voltage:9, current:0.001, resistance:9000, power:0.009, elapsed:0.2 },
    { runId:'stored-a', timestamp:'2026-08-26T03:00:01.000Z', sample:'Stored A', mode:'time', sense:4, sourceMode:'VOLT', sourceSetpoint:9, voltage:9, current:null, resistance:null, power:null, elapsed:1.2, overflow:true },
    { runId:'stored-b', timestamp:'2026-08-26T04:00:00.000Z', sample:'Stored B', mode:'spot', sense:2, sourceMode:'CURR', sourceSetpoint:0.01, voltage:1, current:0.01, resistance:100, power:0.01, elapsed:0.3 },
  ],
};
const normalizedStored = normalizeEvaluationPayload(storedPayload);
assert.equal(normalizedStored.length, 3);
assert.equal(Number.isNaN(normalizedStored[1].current), true);
assert.equal(Number.isNaN(normalizedStored[1].resistance), true);
assert.equal(normalizeEvaluationPayload({ rows:'invalid' }), null);
assert.equal(normalizeEvaluationPayload([{ timestamp:'2026-08-26T03:00:00.000Z' }]).length, 0);

const mergedStored = mergeEvaluationRows(
  [{ runId:'stored-a', timestamp:'2026-08-26T03:00:00.000Z' }],
  normalizedStored,
);
assert.equal(mergedStored.addedRuns, 1);
assert.equal(mergedStored.skippedRuns, 1);
assert.equal(mergedStored.addedRows, 1);
assert.deepEqual(mergedStored.rows.map(row => row.runId), ['stored-a', 'stored-b']);

console.log('Keithley 2400 safety and parser tests passed.');
