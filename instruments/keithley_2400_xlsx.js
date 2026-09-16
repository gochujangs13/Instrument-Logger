// Keithley 2400 XLSX exporter.
// It patches the user-approved workbook template at the OOXML level so Excel's
// native chart, worksheet styling, checkboxes, and hidden chart-data sheet survive.

const RUN_COLORS = ['#38bdf8', '#f472b6', '#facc15', '#a78bfa', '#fb7185', '#2dd4bf', '#fb923c', '#c084fc'];
const RAW_DATA_SHEET = 'Raw Data';

const LABELS = {
  ko: {
    dashboardSheet: '대시보드', chartTitle: '전압 / 전류 / 저항',
    mode: { spot: '단일', time: '시간', sweep: 'I-V Sweep', cycle: '사이클' },
    currentSource: '전류 인가', voltageSource: '전압 인가',
    graphHeading: '전압 / 전류 / 저항 비교 그래프 | 체크된 항목만 표시됩니다.',
    summaryHeading: '샘플 선택 | 체크된 샘플만 위 그래프에 표시됩니다.',
    summaryHeaders: ['선택', 'No', '샘플명', '테스트 방법', '인가 설정', 'Compliance', '측정 수', '평가 시간(s)', '상태'],
    legendNote: '그래프 범례: 샘플별 색상 · 전압 실선 · 전류 파선 · 저항 점선',
    safetyNote: '프로그램 평가 제한: ±200 V, ±1.05 A, 최대 22 W. 21 V 초과 영역은 105 mA 이하. 210 V 기술 한계는 OVP 여유가 없어 사용하지 않습니다.',
    rawMetadata: ['샘플명', '테스트 방법', '평가 시각', '인가 설정', 'Compliance', '측정 수 / 평가 시간', '상태'],
    rawHeaders: ['시간 (s)', '전압 (V)', '전류 (A)', '저항 (Ω)'],
  },
  en: {
    dashboardSheet: 'Dashboard', chartTitle: 'Voltage / Current / Resistance',
    mode: { spot: 'Spot', time: 'Time', sweep: 'I-V Sweep', cycle: 'Cycle' },
    currentSource: 'Current Source', voltageSource: 'Voltage Source',
    graphHeading: 'Voltage / Current / Resistance Comparison | Only checked metrics are displayed.',
    summaryHeading: 'Sample Selection | Only checked samples are shown in the chart above.',
    summaryHeaders: ['Selected', 'No.', 'Sample Name', 'Test Method', 'Source Setting', 'Compliance', 'Samples', 'Duration (s)', 'Status'],
    legendNote: 'Chart legend: color by sample · voltage solid · current dashed · resistance dotted',
    safetyNote: 'Program evaluation limits: ±200 V, ±1.05 A, 22 W max. Above 21 V, current is limited to 105 mA. The 210 V technical limit is not used because it leaves no OVP headroom.',
    rawMetadata: ['Sample Name', 'Test Method', 'Evaluated At', 'Source Setting', 'Compliance', 'Samples / Duration', 'Status'],
    rawHeaders: ['Time (s)', 'Voltage (V)', 'Current (A)', 'Resistance (Ω)'],
  },
};

function languagePack(lang) {
  return LABELS[lang === 'en' ? 'en' : 'ko'];
}

function esc(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function colName(column) {
  let value = Math.max(1, Math.trunc(Number(column) || 1)), name = '';
  while (value > 0) { value -= 1; name = String.fromCharCode(65 + (value % 26)) + name; value = Math.floor(value / 26); }
  return name;
}

function textCell(ref, value, style = null) {
  const s = style === null ? '' : ` s="${style}"`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function sampleLegendCell(ref, sample, color) {
  return `<c r="${ref}" t="inlineStr"><is>`
    + `<r><rPr><b/><color rgb="FF${color}"/><sz val="12"/></rPr><t xml:space="preserve">━━━━</t></r>`
    + `<r><rPr><color rgb="FF334E68"/><sz val="10"/></rPr><t xml:space="preserve"> ${esc(sample)}</t></r>`
    + `</is></c>`;
}

function numberCell(ref, value, style = null) {
  const s = style === null ? '' : ` s="${style}"`;
  return Number.isFinite(Number(value)) ? `<c r="${ref}"${s}><v>${Number(value)}</v></c>` : `<c r="${ref}"${s}/>`;
}

function boolCell(ref, value, style = 2) {
  return `<c r="${ref}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
}

function formulaCell(ref, formula, cachedValue, { type = null } = {}) {
  const t = type ? ` t="${type}"` : '';
  return `<c r="${ref}"${t}><f>${esc(formula)}</f><v>${esc(cachedValue)}</v></c>`;
}

function rowXml(row, cells, options = '') {
  return `<row r="${row}" spans="1:18"${options}>${cells.join('')}</row>`;
}

function modeLabel(mode, lang = 'ko') {
  return languagePack(lang).mode[mode] || mode || '—';
}

function testMethod(run, lang = 'ko') {
  const labels = languagePack(lang);
  const source = run.sourceMode === 'CURR' ? labels.currentSource : labels.voltageSource;
  return `${modeLabel(run.mode, lang)} · ${run.sense || 4}-Wire · ${source}`;
}

function fmt(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (number === 0) return '0';
  return Math.abs(number) >= 10000 || Math.abs(number) < 0.001 ? number.toExponential(4) : number.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function sourceSetting(run) {
  const unit = run.sourceMode === 'CURR' ? 'A' : 'V';
  if (!Number.isFinite(run.sourceMin)) return '—';
  const source = run.sourceMin === run.sourceMax ? fmt(run.sourceMin) : `${fmt(run.sourceMin)} → ${fmt(run.sourceMax)}`;
  return `${source} ${unit}`;
}

function complianceSetting(run) {
  if (!Number.isFinite(run.complianceLimit)) return '—';
  return `${fmt(run.complianceLimit)} ${run.sourceMode === 'CURR' ? 'V' : 'A'}`;
}

function timestampText(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value || '—');
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function buildTemplateExportLayout(model = { runs: [] }) {
  const count = Math.max(1, model.runs?.length || 0);
  const sampleLegendRows = Math.max(2, Math.ceil(count / 4));
  const sampleLegendStartRow = 5;
  const sampleLegendEndRow = sampleLegendStartRow + sampleLegendRows - 1;
  const graphAnchorStart = sampleLegendEndRow + 1;
  const graphAnchorEnd = 29;
  const resistanceTopRow = graphAnchorStart + 3;
  const resistanceBottomRow = graphAnchorEnd - 1;
  const resistanceMidRow = Math.round((resistanceTopRow + resistanceBottomRow) / 2);
  return {
    graphTitleRow: 3,
    metricToggleRow: 4,
    sampleLegendStartRow,
    sampleLegendEndRow,
    sampleLegendRows,
    graphAnchorStart,
    graphAnchorEnd,
    resistanceTopRow,
    resistanceMidRow,
    resistanceBottomRow,
    resistanceLabelStartRow: resistanceMidRow - 5,
    resistanceLabelEndRow: resistanceMidRow + 6,
    summaryTitleRow: 32,
    summaryHeaderRow: 33,
    summaryStartRow: 34,
    summaryEndRow: 33 + count,
    noteRow: 35 + count,
    safetyRow: 36 + count,
  };
}

function paddedAxis(values, { symmetric = false, includeZero = false, fallback = 1 } = {}) {
  const numbers = (values || []).map(Number).filter(Number.isFinite);
  if (!numbers.length) return symmetric ? { min: -fallback, max: fallback } : { min: 0, max: fallback };
  if (symmetric) {
    const edge = Math.max(fallback, Math.max(...numbers.map(Math.abs)) * 1.08);
    return { min: -edge, max: edge };
  }
  let min = Math.min(...numbers), max = Math.max(...numbers);
  if (includeZero) { min = Math.min(0, min); max = Math.max(0, max); }
  if (min === max) { const pad = Math.max(Math.abs(min) * 0.08, fallback); min -= pad; max += pad; }
  else { const pad = (max - min) * 0.08; if (min < 0) min -= pad; if (max > 0) max += pad; }
  return { min, max };
}

export function buildTemplateChartPlan(model = { runs: [] }, lang = 'ko') {
  const runs = model.runs || [], layout = buildTemplateExportLayout(model), rawStartRow = 9;
  const dashboardSheet = languagePack(lang).dashboardSheet;
  const allRows = runs.flatMap(run => run.rawRows || []);
  const xAxis = paddedAxis(allRows.map(row => row.elapsed), { fallback: 1 });
  const voltageAxis = paddedAxis(allRows.map(row => row.voltage), { includeZero: true, fallback: 1 });
  const currentAxis = paddedAxis(allRows.map(row => row.current), { symmetric: true, fallback: 1e-12 });
  const resistanceAxis = paddedAxis(allRows.map(row => row.resistance), { symmetric: true, fallback: 1 });
  const helperRows = [];
  let cursor = 2;
  const ranges = runs.map((run, runIndex) => {
    const rawColumn = runIndex * 5 + 1, timeColumn = colName(rawColumn), dashboardRow = layout.summaryStartRow + runIndex;
    const metrics = {};
    [
      ['voltage', 'Voltage', 1, 'A'],
      ['current', 'Current', 2, 'E'],
      ['resistance', 'Resistance', 3, 'J'],
    ].forEach(([field, label, columnOffset, toggleColumn]) => {
      const start = cursor, xValues = [], values = [];
      (run.rawRows || []).forEach((raw, rowIndex) => {
        const rawRow = rawStartRow + rowIndex, rawValue = Number(raw[field]);
        const displayValue = field === 'resistance' ? rawValue * (currentAxis.max / resistanceAxis.max) : rawValue;
        const elapsed = Number(raw.elapsed);
        const rawReference = `'${RAW_DATA_SHEET}'!${colName(rawColumn + columnOffset)}${rawRow}`;
        const displayExpression = field === 'resistance' ? `${rawReference}*${currentAxis.max}/${resistanceAxis.max}` : rawReference;
        xValues.push(elapsed); values.push(displayValue);
        helperRows.push({
          row: cursor++, sample: run.sample, metric: label, elapsed, displayValue, rawValue,
          timeFormula: `'${RAW_DATA_SHEET}'!${timeColumn}${rawRow}`,
          valueFormula: `IF(AND('${dashboardSheet}'!$A$${dashboardRow},'${dashboardSheet}'!$${toggleColumn}$${layout.metricToggleRow}),${displayExpression},NA())`,
          rawFormula: rawReference,
        });
      });
      metrics[field] = { start, end: Math.max(start, cursor - 1), xValues, values };
    });
    return { color: RUN_COLORS[runIndex % RUN_COLORS.length].slice(1).toUpperCase(), metrics };
  });
  const sampleLegend = runs.map((run, runIndex) => ({
    sample: run.sample,
    color: ranges[runIndex].color,
    row: layout.sampleLegendStartRow + Math.floor(runIndex / 4),
    startColumn: 1 + (runIndex % 4) * 4,
    endColumn: 4 + (runIndex % 4) * 4,
  }));
  return { layout, xAxis, voltageAxis, currentAxis, resistanceAxis, helperRows, ranges, sampleLegend };
}

function numberCache(values, formatCode = 'General') {
  const numbers = (values || []).map(Number);
  const points = numbers.map((value, index) => Number.isFinite(value) ? `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>` : '').join('');
  return `<c:numCache><c:formatCode>${formatCode}</c:formatCode><c:ptCount val="${numbers.length}"/>${points}</c:numCache>`;
}

function chartSeries({ idx, name, color, dash, width, xFormula, yFormula, xValues = [], yValues = [] }) {
  const references = `<c:xVal><c:numRef><c:f>${esc(xFormula)}</c:f>${numberCache(xValues)}</c:numRef></c:xVal><c:yVal><c:numRef><c:f>${esc(yFormula)}</c:f>${numberCache(yValues)}</c:numRef></c:yVal>`;
  const dashXml = dash ? `<a:prstDash val="${dash}"/>` : '';
  return `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/><c:tx><c:v>${esc(name)}</c:v></c:tx><c:spPr><a:ln w="${width}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${dashXml}</a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>${references}<c:smooth val="0"/></c:ser>`;
}

function patchAxisScale(chartXml, axisId, axis) {
  return chartXml.replace(/<c:valAx>[\s\S]*?<\/c:valAx>/g, block => {
    if (!block.includes(`<c:axId val="${axisId}"/>`)) return block;
    return block
      .replace(/<c:scaling>[\s\S]*?<\/c:scaling>/, `<c:scaling><c:max val="${axis.max}"/><c:min val="${axis.min}"/><c:orientation val="minMax"/></c:scaling>`)
      // The template's fixed major unit belongs to its sample data. Keeping it
      // after replacing min/max can request millions of ticks and make Excel
      // omit the whole secondary scatter group. Let Excel choose safe units.
      .replace(/<c:majorUnit\b[^>]*\/>/g, '')
      .replace(/<c:minorUnit\b[^>]*\/>/g, '');
  });
}

export function patchTemplateChartXml(chartXml, model = { runs: [] }, lang = 'ko') {
  const labels = languagePack(lang), plan = buildTemplateChartPlan(model, lang), runs = model.runs || [], count = runs.length;
  const voltageSeries = plan.ranges.map((range, index) => {
    const info = range.metrics.voltage;
    return chartSeries({ idx: index, name: `${runs[index].sample} · Voltage`, color: range.color, dash: 'solid', width: 25400, xFormula: `_ChartData!$C$${info.start}:$C$${info.end}`, yFormula: `_ChartData!$D$${info.start}:$D$${info.end}`, xValues: info.xValues, yValues: info.values });
  });
  const secondarySeries = [];
  plan.ranges.forEach((range, index) => {
    const current = range.metrics.current, resistance = range.metrics.resistance;
    secondarySeries.push(chartSeries({ idx: count + index * 2, name: `${runs[index].sample} · Current`, color: range.color, dash: 'dash', width: 31750, xFormula: `_ChartData!$C$${current.start}:$C$${current.end}`, yFormula: `_ChartData!$D$${current.start}:$D$${current.end}`, xValues: current.xValues, yValues: current.values }));
    secondarySeries.push(chartSeries({ idx: count + index * 2 + 1, name: `${runs[index].sample} · Resistance`, color: range.color, dash: 'dot', width: 31750, xFormula: `_ChartData!$C$${resistance.start}:$C$${resistance.end}`, yFormula: `_ChartData!$D$${resistance.start}:$D$${resistance.end}`, xValues: resistance.xValues, yValues: resistance.values }));
  });
  let groupIndex = 0;
  let updated = chartXml.replace(/<c:scatterChart>[\s\S]*?<\/c:scatterChart>/g, group => {
    const series = groupIndex++ === 0 ? voltageSeries.join('') : secondarySeries.join('');
    return group.replace(/(<c:varyColors[^>]*\/>)[\s\S]*?(<c:dLbls>)/, (_match, prefix, suffix) => `${prefix}${series}${suffix}`);
  });
  updated = updated.replace(/<c:scatterStyle val="lineMarker"\/>/g, '<c:scatterStyle val="line"/>');
  // Chart source formulas live on the intentionally hidden _ChartData sheet.
  // plotVisOnly=1 can suppress those formulas after Excel recalculates them.
  updated = updated.replace(/<c:plotVisOnly\b[^>]*\/>/g, '<c:plotVisOnly val="0"/>');
  // Excel does not reliably honor per-series legend deletion for the secondary
  // scatter group of a combined chart. The dashboard therefore renders one
  // deterministic sample/color legend in worksheet cells above the chart.
  updated = updated.replace(/<c:legend>[\s\S]*?<\/c:legend>/g, '');
  // Replace only the main chart title. Axis titles are separate <c:title>
  // blocks and must remain unchanged.
  updated = updated.replace(/<c:title>[\s\S]*?<\/c:title>/, title => title.replace(/<a:t>[\s\S]*?<\/a:t>/, `<a:t>${labels.chartTitle}</a:t>`));
  updated = patchAxisScale(updated, '50010001', plan.xAxis);
  updated = patchAxisScale(updated, '50010002', plan.voltageAxis);
  updated = patchAxisScale(updated, '50010003', plan.xAxis);
  updated = patchAxisScale(updated, '50010004', plan.currentAxis);
  return updated;
}

function replaceSheetData(xml, dimension, sheetData, mergeCells = '', autoFilter = '') {
  let updated = xml.replace(/<dimension ref="[^"]+"\/>/, `<dimension ref="${dimension}"/>`);
  updated = updated.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${sheetData}</sheetData>`);
  updated = updated.replace(/<autoFilter[^>]*\/>/g, '').replace(/<mergeCells[^>]*>[\s\S]*?<\/mergeCells>/g, '');
  return updated.replace('</sheetData>', `</sheetData>${autoFilter}${mergeCells}`);
}

function dashboardSheet(templateXml, model, plan, lang) {
  const labels = languagePack(lang), layout = plan.layout, rows = [];
  rows.push(rowXml(1, [textCell('A1', 'KEITHLEY 2400 · INTERACTIVE TEST DASHBOARD', 14)], ' ht="32" customHeight="1"'));
  rows.push(rowXml(2, [], ' ht="32" customHeight="1"'));
  rows.push(rowXml(layout.graphTitleRow, [textCell(`A${layout.graphTitleRow}`, labels.graphHeading, 11)]));
  rows.push(rowXml(layout.metricToggleRow, [
    boolCell(`A${layout.metricToggleRow}`, true), textCell(`B${layout.metricToggleRow}`, '━━  Voltage (V)', 15),
    boolCell(`E${layout.metricToggleRow}`, true), textCell(`F${layout.metricToggleRow}`, '━ ━  Current (A)', 16),
    boolCell(`J${layout.metricToggleRow}`, true), textCell(`K${layout.metricToggleRow}`, '····  Resistance (Ω)', 17),
  ]));
  for (let row = layout.sampleLegendStartRow; row <= layout.sampleLegendEndRow; row += 1) {
    const cells = plan.sampleLegend
      .filter(item => item.row === row)
      .map(item => sampleLegendCell(`${colName(item.startColumn)}${row}`, item.sample, item.color));
    rows.push(rowXml(row, cells, ' ht="20" customHeight="1"'));
  }
  rows.push(rowXml(layout.resistanceTopRow, [numberCell(`Q${layout.resistanceTopRow}`, plan.resistanceAxis.max, 12)]));
  rows.push(rowXml(layout.resistanceLabelStartRow, [textCell(`R${layout.resistanceLabelStartRow}`, 'Resistance (Ω)', 13)]));
  rows.push(rowXml(layout.resistanceMidRow, [numberCell(`Q${layout.resistanceMidRow}`, 0, 12)]));
  rows.push(rowXml(layout.resistanceBottomRow, [numberCell(`Q${layout.resistanceBottomRow}`, plan.resistanceAxis.min, 12)]));
  rows.push(rowXml(layout.summaryTitleRow, [textCell(`A${layout.summaryTitleRow}`, labels.summaryHeading, 11)]));
  rows.push(rowXml(layout.summaryHeaderRow, labels.summaryHeaders.map((value, index) => textCell(`${colName(index + 1)}${layout.summaryHeaderRow}`, value, 1))));
  model.runs.forEach((run, index) => {
    const row = layout.summaryStartRow + index;
    rows.push(rowXml(row, [
      boolCell(`A${row}`, true), numberCell(`B${row}`, run.evaluationNo || index + 1, 3), textCell(`C${row}`, run.sample, 4),
      textCell(`D${row}`, testMethod(run, lang), 4), textCell(`E${row}`, sourceSetting(run), 4), textCell(`F${row}`, complianceSetting(run), 4),
      numberCell(`G${row}`, run.count, 4), numberCell(`H${row}`, run.elapsed, 4), textCell(`I${row}`, run.statusText, 5),
    ]));
  });
  rows.push(rowXml(layout.noteRow, [textCell(`A${layout.noteRow}`, labels.legendNote, 9)], ' ht="22" customHeight="1"'));
  rows.push(rowXml(layout.safetyRow, [textCell(`A${layout.safetyRow}`, labels.safetyNote, 10)], ' ht="20.15" customHeight="1"'));
  const sampleLegendMerges = plan.sampleLegend.map(item => `${colName(item.startColumn)}${item.row}:${colName(item.endColumn)}${item.row}`);
  const merges = [`A1:R2`, `A${layout.graphTitleRow}:R${layout.graphTitleRow}`, `B${layout.metricToggleRow}:D${layout.metricToggleRow}`, `F${layout.metricToggleRow}:I${layout.metricToggleRow}`, `K${layout.metricToggleRow}:O${layout.metricToggleRow}`, ...sampleLegendMerges, `A${layout.summaryTitleRow}:R${layout.summaryTitleRow}`, `A${layout.noteRow}:R${layout.noteRow}`, `A${layout.safetyRow}:R${layout.safetyRow}`, `Q${layout.resistanceTopRow}:Q${layout.resistanceTopRow + 1}`, `Q${layout.resistanceMidRow}:Q${layout.resistanceMidRow + 1}`, `Q${layout.resistanceBottomRow}:Q${layout.resistanceBottomRow + 1}`, `R${layout.resistanceLabelStartRow}:R${layout.resistanceLabelEndRow}`];
  const mergeXml = `<mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`;
  return replaceSheetData(templateXml, `A1:R${layout.safetyRow}`, rows.join(''), mergeXml, `<autoFilter ref="B${layout.summaryHeaderRow}:I${layout.summaryEndRow}"/>`);
}

function rawSheet(templateXml, model, lang) {
  const labels = languagePack(lang), rows = new Map(), merges = [];
  const add = (row, cell) => { if (!rows.has(row)) rows.set(row, []); rows.get(row).push(cell); };
  model.runs.forEach((run, index) => {
    const start = index * 5 + 1, end = start + 3, startName = colName(start), valueStart = colName(start + 1), endName = colName(end);
    const metadataValues = [run.sample, testMethod(run, lang), timestampText(run.timestamp), sourceSetting(run), complianceSetting(run), `${run.count} / ${fmt(run.elapsed)} s`, run.statusText];
    const metadata = labels.rawMetadata.map((label, metaIndex) => [label, metadataValues[metaIndex]]);
    metadata.forEach(([label, value], metaIndex) => { const row = metaIndex + 1; add(row, textCell(`${startName}${row}`, label, 6)); add(row, textCell(`${valueStart}${row}`, value, 18)); merges.push(`${valueStart}${row}:${endName}${row}`); });
    labels.rawHeaders.forEach((label, column) => add(8, textCell(`${colName(start + column)}8`, label, 7)));
    (run.rawRows || []).forEach((raw, rowIndex) => [raw.elapsed, raw.voltage, raw.current, raw.resistance].forEach((value, column) => add(9 + rowIndex, numberCell(`${colName(start + column)}${9 + rowIndex}`, value, 8))));
  });
  const data = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([row, cells]) => rowXml(row, cells)).join('');
  const lastColumn = colName(Math.max(4, model.runs.length * 5 - 1)), lastRow = Math.max(8, 8 + (model.maxSamples || 0));
  const mergeXml = `<mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`;
  let updated = replaceSheetData(templateXml, `A1:${lastColumn}${lastRow}`, data, mergeXml);
  const columns = [];
  for (let index = 0; index < model.runs.length; index += 1) {
    const start = index * 5 + 1;
    columns.push(`<col min="${start}" max="${start + 3}" width="16.7265625" customWidth="1"/>`);
    if (index < model.runs.length - 1) columns.push(`<col min="${start + 4}" max="${start + 4}" width="3.7265625" customWidth="1"/>`);
  }
  return updated.replace(/<cols>[\s\S]*?<\/cols>/, `<cols>${columns.join('')}</cols>`);
}

function chartDataSheet(templateXml, plan) {
  const rows = [rowXml(1, ['Sample', 'Metric', 'Time', 'Display', 'Raw'].map((value, index) => textCell(`${colName(index + 1)}1`, value)))];
  plan.helperRows.forEach(item => rows.push(rowXml(item.row, [
    textCell(`A${item.row}`, item.sample), textCell(`B${item.row}`, item.metric), formulaCell(`C${item.row}`, item.timeFormula, item.elapsed), formulaCell(`D${item.row}`, item.valueFormula, item.displayValue), formulaCell(`E${item.row}`, item.rawFormula, item.rawValue),
  ])));
  const lastRow = Math.max(1, ...plan.helperRows.map(item => item.row));
  return replaceSheetData(templateXml, `A1:E${lastRow}`, rows.join(''));
}

function patchDrawingRows(xml, plan) {
  let occurrence = 0;
  return xml.replace(/<xdr:row>\d+<\/xdr:row>/g, () => `<xdr:row>${occurrence++ === 0 ? plan.layout.graphAnchorStart : plan.layout.graphAnchorEnd}</xdr:row>`);
}

export async function fillKeithley2400TemplateWithJSZip(templateBytes, model, JSZip, lang = 'ko') {
  const labels = languagePack(lang), zip = await JSZip.loadAsync(templateBytes), plan = buildTemplateChartPlan(model, lang);
  const read = path => zip.file(path).async('string');
  zip.file('xl/worksheets/sheet1.xml', dashboardSheet(await read('xl/worksheets/sheet1.xml'), model, plan, lang));
  zip.file('xl/worksheets/sheet2.xml', rawSheet(await read('xl/worksheets/sheet2.xml'), model, lang));
  zip.file('xl/worksheets/sheet3.xml', chartDataSheet(await read('xl/worksheets/sheet3.xml'), plan));
  zip.file('xl/charts/chart1.xml', patchTemplateChartXml(await read('xl/charts/chart1.xml'), model, lang));
  zip.file('xl/drawings/drawing1.xml', patchDrawingRows(await read('xl/drawings/drawing1.xml'), plan));
  zip.remove('xl/calcChain.xml');
  const relationships = 'xl/_rels/workbook.xml.rels';
  zip.file(relationships, (await read(relationships)).replace(/<Relationship[^>]+calcChain[^>]+\/>/g, ''));
  zip.file('[Content_Types].xml', (await read('[Content_Types].xml')).replace(/<Override[^>]+calcChain[^>]+\/>/g, ''));
  let workbook = await read('xl/workbook.xml');
  workbook = workbook.replace(/(<sheet\s+name=")[^"]+("\s+sheetId="1")/, `$1${labels.dashboardSheet}$2`);
  workbook = workbook.replace(/(<definedName name="_xlnm\._FilterDatabase"[^>]*>)[\s\S]*?(<\/definedName>)/, (_match, open, close) => `${open}'${labels.dashboardSheet}'!$B$${plan.layout.summaryHeaderRow}:$I$${plan.layout.summaryEndRow}${close}`);
  workbook = workbook.replace(/(<definedName name="_xlnm\.Print_Area"[^>]*>)[\s\S]*?(<\/definedName>)/, (_match, open, close) => `${open}'${labels.dashboardSheet}'!$A$1:$R$${plan.layout.safetyRow}${close}`);
  workbook = workbook.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>');
  zip.file('xl/workbook.xml', workbook);
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

export async function fillKeithley2400Template(templateBytes, model, lang = 'ko') {
  const module = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
  return fillKeithley2400TemplateWithJSZip(templateBytes, model, module.default || module, lang);
}
