// Etching Design — Pure JavaScript Vector PDF Exporter
// Produces compliant PDF 1.4 files at exact 1:1 scale (72pt = 25.4mm) or Fit-to-Page.
// Works 100% offline without external CDN dependencies.

export function generatePDF(geom, options = {}) {
  const {
    scaleMode = '1:1', // '1:1' or 'fit'
    pageSize = 'auto', // 'auto', 'A4', 'A3'
    includeDimensions = true,
  } = options;

  const mmToPt = 72 / 25.4; // 1 mm in PDF points

  const plateW_mm = geom.plate.width;
  const plateH_mm = geom.plate.height;

  // MediaBox dimensions in points
  let pageW_pt, pageH_pt;
  let scale = mmToPt;
  let offsetX_pt = 0;
  let offsetY_pt = 0;

  if (pageSize === 'A4') {
    // A4 landscape: 297 × 210 mm
    pageW_pt = 297 * mmToPt;
    pageH_pt = 210 * mmToPt;
  } else if (pageSize === 'A3') {
    // A3 landscape: 420 × 297 mm
    pageW_pt = 420 * mmToPt;
    pageH_pt = 297 * mmToPt;
  } else {
    // Auto: Plate size + margins
    const marginMm = includeDimensions ? 20 : 10;
    pageW_pt = (plateW_mm + marginMm * 2) * mmToPt;
    pageH_pt = (plateH_mm + marginMm * 2) * mmToPt;
    offsetX_pt = marginMm * mmToPt;
    offsetY_pt = marginMm * mmToPt;
  }

  if (scaleMode === 'fit' && (pageSize === 'A4' || pageSize === 'A3')) {
    const availW = pageW_pt - 40;
    const availH = pageH_pt - 40;
    const fitScale = Math.min(availW / (plateW_mm * mmToPt), availH / (plateH_mm * mmToPt));
    scale = mmToPt * fitScale;
    offsetX_pt = (pageW_pt - plateW_mm * scale) / 2;
    offsetY_pt = (pageH_pt - plateH_mm * scale) / 2;
  } else if (pageSize === 'A4' || pageSize === 'A3') {
    offsetX_pt = (pageW_pt - plateW_mm * scale) / 2;
    offsetY_pt = (pageH_pt - plateH_mm * scale) / 2;
  }

  // Generate PDF Content Stream
  let stream = '';

  // Helpers for PDF graphics
  const rectPath = (x_mm, y_mm, w_mm, h_mm) => {
    const x = offsetX_pt + x_mm * scale;
    const y = offsetY_pt + y_mm * scale;
    const w = w_mm * scale;
    const h = h_mm * scale;
    return `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re `;
  };

  const linePath = (x1_mm, y1_mm, x2_mm, y2_mm) => {
    const x1 = offsetX_pt + x1_mm * scale;
    const y1 = offsetY_pt + y1_mm * scale;
    const x2 = offsetX_pt + x2_mm * scale;
    const y2 = offsetY_pt + y2_mm * scale;
    return `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
  };

  stream += 'q\n'; // Push graphics state

  // 1. Plate Outline
  stream += '0.2 0.2 0.3 RG\n'; // Stroke dark slate
  stream += '0.96 0.97 0.98 rg\n'; // Light fill
  stream += '0.5 w\n'; // Line width
  stream += rectPath(0, 0, plateW_mm, plateH_mm);
  stream += 'B\n'; // Fill and stroke

  // 2. Separators & Connectors
  stream += '1.0 0.4 0.4 RG\n'; // Light red stroke
  stream += '0.2 w\n';
  (geom.separators || []).forEach(sep => {
    stream += rectPath(sep.x, sep.y, sep.width, sep.height) + 'S\n';
  });

  stream += '0.2 0.8 0.5 RG\n'; // Light green stroke
  (geom.connectors || []).forEach(con => {
    stream += rectPath(con.x, con.y, con.width, con.height) + 'S\n';
  });

  // 3. Boundaries (in Mixed Design)
  stream += '0.8 0.2 0.8 RG\n'; // Magenta
  stream += '0.4 w\n';
  (geom.boundaries || []).forEach(b => {
    stream += rectPath(b.x, b.y, b.width, b.height) + 'S\n';
  });

  // 4. Samples
  stream += '0.1 0.1 0.1 RG\n'; // Black stroke
  stream += '1.0 1.0 1.0 rg\n'; // White fill
  stream += '0.3 w\n';
  (geom.samples || []).forEach(s => {
    stream += rectPath(s.x, s.y, s.width, s.height) + 'B\n';

    // Tabs
    if (s.tabs && s.tabs.length) {
      s.tabs.forEach(t => {
        stream += rectPath(t.x1, t.y1, t.x2 - t.x1, t.width) + 'B\n';
      });
    }
  });

  // 5. Dimensions
  if (includeDimensions) {
    stream += '0.15 0.4 0.9 RG\n'; // Blue
    stream += '0.3 w\n';
    // Top dimension
    stream += linePath(0, plateH_mm + 5, plateW_mm, plateH_mm + 5);
    stream += linePath(0, plateH_mm + 3, 0, plateH_mm + 7);
    stream += linePath(plateW_mm, plateH_mm + 3, plateW_mm, plateH_mm + 7);

    // Right dimension
    stream += linePath(plateW_mm + 5, 0, plateW_mm + 5, plateH_mm);
    stream += linePath(plateW_mm + 3, 0, plateW_mm + 7, 0);
    stream += linePath(plateW_mm + 3, plateH_mm, plateW_mm + 7, plateH_mm);
  }

  stream += 'Q\n'; // Pop graphics state

  // Assemble valid PDF 1.4 document
  const objects = [];
  const addObject = content => {
    objects.push(content);
    return objects.length; // 1-based index
  };

  // Obj 1: Catalog
  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  // Obj 2: Pages
  addObject(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
  // Obj 3: Page
  addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW_pt.toFixed(2)} ${pageH_pt.toFixed(2)}] /Contents 4 0 R >>`);
  // Obj 4: Stream
  const streamLen = stream.length;
  addObject(`<< /Length ${streamLen} >>\nstream\n${stream}endstream`);

  // Build PDF Binary String
  let pdf = '%PDF-1.4\n%âãÏÓ\n';
  const xref = [0];

  objects.forEach((obj, idx) => {
    xref.push(pdf.length);
    pdf += `${idx + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(xref[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return pdf;
}
