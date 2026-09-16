// SP-2100 / TL-2200 Interactive Dashboard XLSX Exporter
// Patches the OOXML template so Excel's native chart, worksheet styling,
// interactive sample checkboxes, and hidden dynamic chart data survive.

const RUN_COLORS = [
  '2563EB', // Blue
  'DC2626', // Red
  '059669', // Emerald
  'D97706', // Amber
  '7C3AED', // Violet
  'DB2777', // Pink
  '0891B2', // Cyan
  '4F46E5', // Indigo
  'EA580C', // Orange
  '65A30D', // Lime
  '9333EA', // Purple
  '0D9488', // Teal
];

const RAW_DATA_SHEET = 'Raw Data';

const LABELS = {
  ko: {
    dashboardSheet: '대시보드',
    chartTitle: '박리력 비교 그래프 (Force-Time)',
    graphHeading: '박리력 비교 그래프 (Force-Time) | 체크된 샘플만 표시됩니다.',
    summaryHeading: '샘플 선택 및 구간 분석 | 시작/종료 시간(s)을 입력하면 해당 구간의 평균·최소·최대가 자동 계산됩니다.',
    rangeCtrlTitle: '📍 구간 분석 설정:',
    rangeStartLabel: '시작 시간 (s):',
    rangeEndLabel: '~ 종료 시간 (s):',
    rangeHint: '※ 위 시작/종료 시간(s)을 입력하면 아래 표의 구간 평균·최소·최대값이 실시간 계산됩니다.',
    summaryHeaders: ['선택', '#', '제품명', '공식 AVG (g)', '구간 평균 (g)', '구간 최소 (g)', '구간 최대 (g)', 'SP (g)', 'KP (g)', 'VAL (g)', 'RMS (g)', '속도 (in/min)', '지연 (s)', '평균시간 (s)'],
    legendNote: '※ 표의 첫 번째 열(선택)의 체크박스(☑ / ☐)를 변경하면 차트에 해당 곡선이 실시간으로 켜지거나 숨겨집니다.',
    rawMetadata: ['제품명', '평균값 (AVG)', '초기값 (SP)', '피크값 (KP)', '종료값 (VAL)', '변동치 (RMS)', '시험 속도', '초기 지연', '평균 시간', '총 샘플 수'],
    rawHeaders: ['시간 (s)', '힘 (g)'],
  },
  en: {
    dashboardSheet: 'Dashboard',
    chartTitle: 'Peel Force Comparison (Force-Time)',
    graphHeading: 'Peel Force Comparison (Force-Time) | Only checked samples are displayed.',
    summaryHeading: 'Sample Selection & Range Analysis | Enter start/end time to calculate range statistics in real time.',
    rangeCtrlTitle: '📍 Range Analysis:',
    rangeStartLabel: 'Start Time (s):',
    rangeEndLabel: '~ End Time (s):',
    rangeHint: '※ Enter start/end time to recalculate range Avg, Min, Max in real time.',
    summaryHeaders: ['Select', '#', 'Product Name', 'Device AVG (g)', 'Range Avg (g)', 'Range Min (g)', 'Range Max (g)', 'SP (g)', 'KP (g)', 'VAL (g)', 'RMS (g)', 'Speed (in/min)', 'Delay (s)', 'Avg Time (s)'],
    legendNote: '※ Change the checkbox (☑ / ☐) in the first column (Select) to dynamically toggle curves on the chart.',
    rawMetadata: ['Product Name', 'Average (AVG)', 'Initial (SP)', 'Peak (KP)', 'Final (VAL)', 'RMS', 'Test Speed', 'Initial Delay', 'Averaging Time', 'Total Samples'],
    rawHeaders: ['Time (s)', 'Force (g)'],
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
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
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
  return `<row r="${row}" spans="1:15"${options}>${cells.join('')}</row>`;
}

function fmt(value, decimals = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(decimals);
}

function buildTemplateExportLayout(model) {
  const count = (model.runs || []).length;
  const legendRows = Math.max(1, Math.ceil(count / 4));
  const graphAnchorStart = 6 + legendRows;
  const graphAnchorEnd = graphAnchorStart + 22;
  const summaryTitleRow = graphAnchorEnd + 2;
  const rangeControlRow = summaryTitleRow + 1;
  const summaryHeaderRow = rangeControlRow + 1;
  const summaryStartRow = summaryHeaderRow + 1;
  const summaryEndRow = summaryHeaderRow + Math.max(1, count);
  const noteRow = summaryEndRow + 2;

  return {
    graphTitleRow: 3,
    sampleLegendStartRow: 5,
    sampleLegendEndRow: 4 + legendRows,
    graphAnchorStart,
    graphAnchorEnd,
    summaryTitleRow,
    rangeControlRow,
    summaryHeaderRow,
    summaryStartRow,
    summaryEndRow,
    noteRow,
  };
}

function paddedAxis(values, { fallbackMin = 0, fallbackMax = 100 } = {}) {
  const numbers = (values || []).map(Number).filter(Number.isFinite);
  if (!numbers.length) return { min: fallbackMin, max: fallbackMax };
  let min = Math.min(...numbers), max = Math.max(...numbers);
  if (min === max) { min -= 10; max += 10; }
  const pad = (max - min) * 0.08 || 5;
  min = Math.min(0, Math.floor(min - pad));
  max = Math.ceil(max + pad);
  return { min, max };
}

export function buildSP2100ChartPlan(model = { runs: [] }, lang = 'ko') {
  const runs = model.runs || [];
  const layout = buildTemplateExportLayout(model);
  const rawStartRow = 9;
  const dashboardSheet = languagePack(lang).dashboardSheet;

  const allRawRows = runs.flatMap(r => r.rawRows || []);
  const allTimes = allRawRows.map(r => r.time);
  const allForces = allRawRows.map(r => r.force);

  const xAxis = paddedAxis(allTimes, { fallbackMin: 0, fallbackMax: 6 });
  const yAxis = paddedAxis(allForces, { fallbackMin: -20, fallbackMax: 300 });

  const helperRows = [];
  let cursor = 2; // _ChartData starts at row 2

  const ranges = runs.map((run, runIdx) => {
    const rawColTime = runIdx * 3 + 1; // Col A, D, G...
    const rawColForce = runIdx * 3 + 2; // Col B, E, H...
    const timeColLetter = colName(rawColTime);
    const forceColLetter = colName(rawColForce);
    const dashboardRow = layout.summaryStartRow + runIdx;

    const start = cursor;
    const xValues = [];
    const yValues = [];

    (run.rawRows || []).forEach((row, rowIdx) => {
      const rawRow = rawStartRow + rowIdx;
      const tVal = Number(row.time);
      const fVal = Number(row.force);
      xValues.push(tVal);
      yValues.push(fVal);

      helperRows.push({
        row: cursor++,
        sample: run.name || `Sample ${runIdx + 1}`,
        time: tVal,
        force: fVal,
        timeFormula: `'${RAW_DATA_SHEET}'!${timeColLetter}${rawRow}`,
        valueFormula: `IF(OR('${dashboardSheet}'!$A$${dashboardRow}="☑",'${dashboardSheet}'!$A$${dashboardRow}=TRUE,'${dashboardSheet}'!$A$${dashboardRow}="TRUE",'${dashboardSheet}'!$A$${dashboardRow}=1),'${RAW_DATA_SHEET}'!${forceColLetter}${rawRow},NA())`,
      });
    });

    const end = Math.max(start, cursor - 1);
    const color = RUN_COLORS[runIdx % RUN_COLORS.length];
    return {
      name: run.name || `Sample ${runIdx + 1}`,
      color,
      start,
      end,
      xValues,
      yValues,
    };
  });

  const sampleLegend = runs.map((run, runIdx) => ({
    sample: run.name || `Sample ${runIdx + 1}`,
    color: ranges[runIdx].color,
    row: layout.sampleLegendStartRow + Math.floor(runIdx / 4),
    startColumn: 1 + (runIdx % 4) * 4,
    endColumn: 4 + (runIdx % 4) * 4,
  }));

  return { layout, xAxis, yAxis, helperRows, ranges, sampleLegend };
}

function numberCache(values, formatCode = 'General') {
  const numbers = (values || []).map(Number);
  const points = numbers.map((val, idx) => Number.isFinite(val) ? `<c:pt idx="${idx}"><c:v>${val}</c:v></c:pt>` : '').join('');
  return `<c:numCache><c:formatCode>${formatCode}</c:formatCode><c:ptCount val="${numbers.length}"/>${points}</c:numCache>`;
}

function chartSeries({ idx, name, color, xFormula, yFormula, xValues = [], yValues = [] }) {
  const references = `<c:xVal><c:numRef><c:f>${esc(xFormula)}</c:f>${numberCache(xValues)}</c:numRef></c:xVal>`
                   + `<c:yVal><c:numRef><c:f>${esc(yFormula)}</c:f>${numberCache(yValues)}</c:numRef></c:yVal>`;
  return `<c:ser>`
       + `<c:idx val="${idx}"/><c:order val="${idx}"/>`
       + `<c:tx><c:v>${esc(name)}</c:v></c:tx>`
       + `<c:spPr><a:ln w="12700"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr>`
       + `<c:marker><c:symbol val="circle"/><c:size val="2"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr></c:marker>`
       + `${references}`
       + `<c:smooth val="0"/>`
       + `</c:ser>`;
}

function patchAxisScale(chartXml, axisId, axis) {
  return chartXml.replace(/<c:valAx>[\s\S]*?<\/c:valAx>/g, block => {
    if (!block.includes(`<c:axId val="${axisId}"/>`)) return block;
    return block
      .replace(/<c:scaling>[\s\S]*?<\/c:scaling>/, `<c:scaling><c:max val="${axis.max}"/><c:min val="${axis.min}"/><c:orientation val="minMax"/></c:scaling>`)
      .replace(/<c:majorUnit\b[^>]*\/>/g, '')
      .replace(/<c:minorUnit\b[^>]*\/>/g, '');
  });
}

export function patchSP2100ChartXml(chartXml, model = { runs: [] }, lang = 'ko') {
  const labels = languagePack(lang);
  const plan = buildSP2100ChartPlan(model, lang);

  const seriesXml = plan.ranges.map((r, idx) => {
    return chartSeries({
      idx,
      name: r.name,
      color: r.color,
      xFormula: `_ChartData!$B$${r.start}:$B$${r.end}`,
      yFormula: `_ChartData!$C$${r.start}:$C$${r.end}`,
      xValues: r.xValues,
      yValues: r.yValues,
    });
  }).join('');

  let updated = chartXml.replace(/<c:scatterChart>[\s\S]*?<\/c:scatterChart>/, group => {
    return group.replace(/(<c:varyColors[^>]*\/>)[\s\S]*?(<c:dLbls>)/, (_match, prefix, suffix) => `${prefix}${seriesXml}${suffix}`);
  });

  updated = updated.replace(/<c:scatterStyle val="[^"]*"\/>/g, '<c:scatterStyle val="lineMarker"/>');
  updated = updated.replace(/<c:plotVisOnly\b[^>]*\/>/g, '<c:plotVisOnly val="0"/>');
  updated = updated.replace(/<c:legend>[\s\S]*?<\/c:legend>/g, '');
  updated = updated.replace(/<c:title>[\s\S]*?<\/c:title>/, title => title.replace(/<a:t>[\s\S]*?<\/a:t>/, `<a:t>${labels.chartTitle}</a:t>`));

  updated = patchAxisScale(updated, '50010001', plan.xAxis);
  updated = patchAxisScale(updated, '50010002', plan.yAxis);

  return updated;
}

function replaceSheetData(xml, dimension, sheetData, mergeCells = '', autoFilter = '', dataValidations = '') {
  let updated = xml.replace(/<dimension ref="[^"]+"\/>/, `<dimension ref="${dimension}"/>`);
  updated = updated.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${sheetData}</sheetData>`);
  updated = updated.replace(/<autoFilter[^>]*\/>/g, '').replace(/<mergeCells[^>]*>[\s\S]*?<\/mergeCells>/g, '').replace(/<dataValidations[^>]*>[\s\S]*?<\/dataValidations>/g, '');
  return updated.replace('</sheetData>', `</sheetData>${autoFilter}${mergeCells}${dataValidations}`);
}

function dashboardSheet(templateXml, model, plan, lang) {
  const labels = languagePack(lang);
  const layout = plan.layout;
  const rows = [];

  // Title
  rows.push(rowXml(1, [textCell('A1', 'SP-2100 / TL-2200 · PEEL FORCE EVALUATION DASHBOARD', 14)], ' ht="32" customHeight="1"'));
  rows.push(rowXml(2, [], ' ht="16" customHeight="1"'));

  // Graph heading
  rows.push(rowXml(layout.graphTitleRow, [textCell(`A${layout.graphTitleRow}`, labels.graphHeading, 11)]));

  // Legend cells
  for (let r = layout.sampleLegendStartRow; r <= layout.sampleLegendEndRow; r++) {
    const cells = plan.sampleLegend
      .filter(item => item.row === r)
      .map(item => sampleLegendCell(`${colName(item.startColumn)}${r}`, item.sample, item.color));
    rows.push(rowXml(r, cells, ' ht="20" customHeight="1"'));
  }

  // Summary heading
  rows.push(rowXml(layout.summaryTitleRow, [textCell(`A${layout.summaryTitleRow}`, labels.summaryHeading, 11)]));

  const defaultT1 = model.runs[0]?.delay != null ? Number(model.runs[0].delay) : 1.0;
  let defaultT2 = defaultT1 + (model.runs[0]?.avgTime != null ? Number(model.runs[0].avgTime) : 5.0);
  if (defaultT2 <= defaultT1) defaultT2 = 6.0;

  // Range analysis control bar
  rows.push(rowXml(layout.rangeControlRow, [
    textCell(`A${layout.rangeControlRow}`, labels.rangeCtrlTitle, 11),
    textCell(`B${layout.rangeControlRow}`, labels.rangeStartLabel, 6),
    numberCell(`C${layout.rangeControlRow}`, defaultT1, 3),
    textCell(`D${layout.rangeControlRow}`, labels.rangeEndLabel, 6),
    numberCell(`E${layout.rangeControlRow}`, defaultT2, 3),
    textCell(`F${layout.rangeControlRow}`, labels.rangeHint, 10),
  ], ' ht="24" customHeight="1"'));

  // Summary table headers
  rows.push(rowXml(layout.summaryHeaderRow, labels.summaryHeaders.map((val, idx) => textCell(`${colName(idx + 1)}${layout.summaryHeaderRow}`, val, 1))));

  // Summary data rows
  (model.runs || []).forEach((run, idx) => {
    const row = layout.summaryStartRow + idx;
    const rawColTime = colName(idx * 3 + 1);
    const rawColForce = colName(idx * 3 + 2);
    const rawEndRow = 8 + Math.max(1, (run.rawRows || []).length);
    const avgFormula = `AVERAGEIFS('${RAW_DATA_SHEET}'!${rawColForce}$9:${rawColForce}$${rawEndRow},'${RAW_DATA_SHEET}'!${rawColTime}$9:${rawColTime}$${rawEndRow},">="&$C$${layout.rangeControlRow},'${RAW_DATA_SHEET}'!${rawColTime}$9:${rawColTime}$${rawEndRow},"<="&$E$${layout.rangeControlRow})`;
    const minFormula = `MINIFS('${RAW_DATA_SHEET}'!${rawColForce}$9:${rawColForce}$${rawEndRow},'${RAW_DATA_SHEET}'!${rawColTime}$9:${rawColTime}$${rawEndRow},">="&$C$${layout.rangeControlRow},'${RAW_DATA_SHEET}'!${rawColTime}$9:${rawColTime}$${rawEndRow},"<="&$E$${layout.rangeControlRow})`;
    const maxFormula = `MAXIFS('${RAW_DATA_SHEET}'!${rawColForce}$9:${rawColForce}$${rawEndRow},'${RAW_DATA_SHEET}'!${rawColTime}$9:${rawColTime}$${rawEndRow},">="&$C$${layout.rangeControlRow},'${RAW_DATA_SHEET}'!${rawColTime}$9:${rawColTime}$${rawEndRow},"<="&$E$${layout.rangeControlRow})`;

    const inRange = (run.rawRows || []).filter(r => r.time >= defaultT1 && r.time <= defaultT2).map(r => r.force);
    const cachedAvg = inRange.length ? +(inRange.reduce((a, b) => a + b, 0) / inRange.length).toFixed(2) : (run.avg != null ? +Number(run.avg).toFixed(2) : '');
    const cachedMin = inRange.length ? +Math.min(...inRange).toFixed(2) : (run.val != null ? +Number(run.val).toFixed(1) : '');
    const cachedMax = inRange.length ? +Math.max(...inRange).toFixed(2) : (run.kp != null ? +Number(run.kp).toFixed(1) : '');

    rows.push(rowXml(row, [
      textCell(`A${row}`, '☑', 3), // Visual checkbox symbol
      textCell(`B${row}`, run.label || `${idx + 1}`, 3),
      textCell(`C${row}`, run.name || `제품 ${idx + 1}`, 4),
      numberCell(`D${row}`, run.avg != null ? Number(run.avg.toFixed(2)) : '', 4),
      formulaCell(`E${row}`, avgFormula, cachedAvg),
      formulaCell(`F${row}`, minFormula, cachedMin),
      formulaCell(`G${row}`, maxFormula, cachedMax),
      numberCell(`H${row}`, run.sp != null ? Number(run.sp.toFixed(1)) : '', 4),
      numberCell(`I${row}`, run.kp != null ? Number(run.kp.toFixed(1)) : '', 4),
      numberCell(`J${row}`, run.val != null ? Number(run.val.toFixed(1)) : '', 4),
      numberCell(`K${row}`, run.rms != null ? Number(run.rms.toFixed(1)) : '', 4),
      numberCell(`L${row}`, run.speed != null ? Number(run.speed) : '', 4),
      numberCell(`M${row}`, run.delay != null ? Number(run.delay) : '', 4),
      numberCell(`N${row}`, run.avgTime != null ? Number(run.avgTime) : '', 4),
    ]));
  });

  // Note
  rows.push(rowXml(layout.noteRow, [textCell(`A${layout.noteRow}`, labels.legendNote, 9)], ' ht="22" customHeight="1"'));

  const sampleLegendMerges = plan.sampleLegend.map(item => `${colName(item.startColumn)}${item.row}:${colName(item.endColumn)}${item.row}`);
  const merges = [
    'A1:N2',
    `A${layout.graphTitleRow}:N${layout.graphTitleRow}`,
    ...sampleLegendMerges,
    `A${layout.summaryTitleRow}:N${layout.summaryTitleRow}`,
    `F${layout.rangeControlRow}:N${layout.rangeControlRow}`,
    `A${layout.noteRow}:N${layout.noteRow}`,
  ];
  const mergeXml = `<mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`;
  const autoFilter = `<autoFilter ref="B${layout.summaryHeaderRow}:N${layout.summaryEndRow}"/>`;
  const dataValidationXml = `<dataValidations count="1"><dataValidation type="list" allowBlank="0" showInputMessage="1" showErrorMessage="1" sqref="A${layout.summaryStartRow}:A${layout.summaryEndRow}"><formula1>&quot;☑,☐&quot;</formula1></dataValidation></dataValidations>`;

  return replaceSheetData(templateXml, `A1:N${layout.noteRow}`, rows.join(''), mergeXml, autoFilter, dataValidationXml);
}

function rawSheet(templateXml, model, lang) {
  const labels = languagePack(lang);
  const rows = new Map();
  const merges = [];
  const add = (row, cell) => {
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row).push(cell);
  };

  (model.runs || []).forEach((run, idx) => {
    const start = idx * 3 + 1; // Col A, D, G...
    const startName = colName(start);
    const valueName = colName(start + 1);

    const metaValues = [
      run.name || `제품 ${idx + 1}`,
      fmt(run.avg, 2) + ' g',
      fmt(run.sp, 1) + ' g',
      fmt(run.kp, 1) + ' g',
      fmt(run.val, 1) + ' g',
      fmt(run.rms, 1) + ' g',
      (run.speed ?? '—') + ' in/min',
      (run.delay ?? '—') + ' s',
      (run.avgTime ?? '—') + ' s',
      String((run.rawRows || []).length),
    ];

    labels.rawMetadata.forEach((lbl, mIdx) => {
      const r = mIdx + 1;
      add(r, textCell(`${startName}${r}`, lbl, 6));
      add(r, textCell(`${valueName}${r}`, metaValues[mIdx], 18));
      merges.push(`${valueName}${r}:${colName(start + 1)}${r}`);
    });

    // Row 11: Column headers
    labels.rawHeaders.forEach((lbl, cIdx) => add(11, textCell(`${colName(start + cIdx)}11`, lbl, 7)));

    // Row 12~: Raw data
    (run.rawRows || []).forEach((rData, rIdx) => {
      const rowNum = 12 + rIdx;
      add(rowNum, numberCell(`${startName}${rowNum}`, rData.time, 8));
      add(rowNum, numberCell(`${valueName}${rowNum}`, rData.force, 8));
    });
  });

  const maxRawLen = Math.max(0, ...(model.runs || []).map(r => (r.rawRows || []).length));
  const data = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([row, cells]) => rowXml(row, cells)).join('');
  const lastCol = colName(Math.max(2, (model.runs || []).length * 3 - 1));
  const lastRow = Math.max(11, 11 + maxRawLen);
  const mergeXml = `<mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`;

  let updated = replaceSheetData(templateXml, `A1:${lastCol}${lastRow}`, data, mergeXml);

  // Columns styling
  const columns = [];
  for (let i = 0; i < (model.runs || []).length; i++) {
    const s = i * 3 + 1;
    columns.push(`<col min="${s}" max="${s + 1}" width="15.0" customWidth="1"/>`);
    columns.push(`<col min="${s + 2}" max="${s + 2}" width="3.5" customWidth="1"/>`);
  }
  return updated.replace(/<cols>[\s\S]*?<\/cols>/, `<cols>${columns.join('')}</cols>`);
}

function chartDataSheet(templateXml, plan) {
  const rows = [rowXml(1, ['Sample', 'Time', 'Force'].map((val, idx) => textCell(`${colName(idx + 1)}1`, val)))];
  plan.helperRows.forEach(item => {
    rows.push(rowXml(item.row, [
      textCell(`A${item.row}`, item.sample),
      formulaCell(`B${item.row}`, item.timeFormula, item.time),
      formulaCell(`C${item.row}`, item.valueFormula, item.force),
    ]));
  });
  const lastRow = Math.max(1, ...plan.helperRows.map(item => item.row));
  return replaceSheetData(templateXml, `A1:C${lastRow}`, rows.join(''));
}

function patchDrawingRows(xml, plan) {
  let occurrence = 0;
  return xml.replace(/<xdr:row>\d+<\/xdr:row>/g, () => `<xdr:row>${occurrence++ === 0 ? plan.layout.graphAnchorStart : plan.layout.graphAnchorEnd}</xdr:row>`);
}

export async function fillSP2100TemplateWithJSZip(templateBytes, model, JSZip, lang = 'ko') {
  const labels = languagePack(lang);
  const zip = await JSZip.loadAsync(templateBytes);
  const plan = buildSP2100ChartPlan(model, lang);

  const read = path => zip.file(path).async('string');

  zip.file('xl/worksheets/sheet1.xml', dashboardSheet(await read('xl/worksheets/sheet1.xml'), model, plan, lang));
  zip.file('xl/worksheets/sheet2.xml', rawSheet(await read('xl/worksheets/sheet2.xml'), model, lang));
  zip.file('xl/worksheets/sheet3.xml', chartDataSheet(await read('xl/worksheets/sheet3.xml'), plan));
  zip.file('xl/charts/chart1.xml', patchSP2100ChartXml(await read('xl/charts/chart1.xml'), model, lang));
  zip.file('xl/drawings/drawing1.xml', patchDrawingRows(await read('xl/drawings/drawing1.xml'), plan));

  zip.remove('xl/calcChain.xml');
  const relationships = 'xl/_rels/workbook.xml.rels';
  zip.file(relationships, (await read(relationships)).replace(/<Relationship[^>]+calcChain[^>]+\/>/g, ''));
  zip.file('[Content_Types].xml', (await read('[Content_Types].xml')).replace(/<Override[^>]+calcChain[^>]+\/>/g, ''));

  let workbook = await read('xl/workbook.xml');
  workbook = workbook.replace(/(<sheet\s+name=")[^"]+("\s+sheetId="1")/, `$1${labels.dashboardSheet}$2`);
  workbook = workbook.replace(/(<definedName name="_xlnm\._FilterDatabase"[^>]*>)[\s\S]*?(<\/definedName>)/, (_match, open, close) => `${open}'${labels.dashboardSheet}'!$B$${plan.layout.summaryHeaderRow}:$N$${plan.layout.summaryEndRow}${close}`);
  workbook = workbook.replace(/(<definedName name="_xlnm\.Print_Area"[^>]*>)[\s\S]*?(<\/definedName>)/, (_match, open, close) => `${open}'${labels.dashboardSheet}'!$A$1:$N$${plan.layout.noteRow}${close}`);
  workbook = workbook.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>');
  zip.file('xl/workbook.xml', workbook);

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

export async function fillSP2100Template(templateBytes, model, lang = 'ko') {
  const module = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
  return fillSP2100TemplateWithJSZip(templateBytes, model, module.default || module, lang);
}
