// Etching Design — AutoCAD ASCII DXF Exporter
// Produces 1:1 scale DXF (1 drawing unit = 1 mm) with standard manufacturing layers,
// closed ETCH_REMOVE polylines, and ByLayer attributes.

import { buildCadEntities, validateCadGeometry, CAD_LAYERS } from './cad_builder.js';

export { validateCadGeometry };

/**
 * Generates production-ready AutoCAD ASCII DXF content.
 *
 * @param {object} geom - Etching geometry model
 * @param {object} options - Export options (mode, exportDimensions, exportText, exportOrientationMarks, etc.)
 * @returns {string} dxfString - Complete AutoCAD ASCII DXF text
 */
export function generateDXF(geom, options = {}) {
  // Build clean CAD model (filters guide entities in manufacturing mode, cleans up duplicates & zero-length)
  const cadModel = buildCadEntities(geom, options);

  // Validate geometry
  const validation = validateCadGeometry(cadModel);
  if (!validation.valid && options.strictValidation !== false) {
    console.warn('DXF CAD Validation Warnings/Errors:', validation.errors);
  }

  const pw = cadModel.plate.width;
  const ph = cadModel.plate.height;
  const outputLayers = Object.values(CAD_LAYERS).filter(ly => {
    const hasEntities = cadModel.entities.some(e => e.layer === ly.name);
    return !cadModel.isMfg || !ly.name.startsWith('GUIDE_') || hasEntities;
  });

  let out = '';

  // 1. HEADER SECTION
  out += `0\nSECTION\n2\nHEADER\n`;
  out += `9\n$ACADVER\n1\nAC1009\n`; // R12 ASCII DXF: strict, widely supported ODA/Autodesk interchange input
  out += `9\n$INSUNITS\n70\n4\n`;    // 4 = Millimeters (1 Drawing Unit = 1 mm)
  out += `9\n$EXTMIN\n10\n0.0\n20\n0.0\n30\n0.0\n`;
  out += `9\n$EXTMAX\n10\n${pw.toFixed(3)}\n20\n${ph.toFixed(3)}\n30\n0.0\n`;
  out += `0\nENDSEC\n`;

  // 2. TABLES & LAYERS SECTION
  out += `0\nSECTION\n2\nTABLES\n`;
  out += `0\nTABLE\n2\nLTYPE\n70\n1\n`;
  out += `0\nLTYPE\n`;
  out += `2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n`;
  out += `0\nENDTAB\n`;
  out += `0\nTABLE\n2\nLAYER\n70\n${outputLayers.length}\n`;

  // Define layers with standard AutoCAD ACI colors and Continuous linetype
  outputLayers.forEach(ly => {
    out += `0\nLAYER\n2\n${ly.name}\n70\n0\n62\n${ly.color}\n6\n${ly.linetype}\n`;
  });

  out += `0\nENDTAB\n0\nENDSEC\n`;

  // 3. BLOCKS SECTION
  out += `0\nSECTION\n2\nBLOCKS\n0\nENDSEC\n`;

  // 4. ENTITIES SECTION (Pure ByLayer attributes)
  out += `0\nSECTION\n2\nENTITIES\n`;

  cadModel.entities.forEach(ent => {
    if (ent.type === 'line') {
      out += `0\nLINE\n8\n${ent.layer}\n`;
      out += `10\n${ent.x1.toFixed(4)}\n20\n${ent.y1.toFixed(4)}\n30\n0.0\n`;
      out += `11\n${ent.x2.toFixed(4)}\n21\n${ent.y2.toFixed(4)}\n31\n0.0\n`;
    } else if (ent.type === 'lwpolyline') {
      // R12 closed POLYLINE/VERTEX sequence. This avoids incomplete R2000
      // object tables while preserving each manufacturing contour exactly.
      out += `0\nPOLYLINE\n8\n${ent.layer}\n66\n1\n70\n${ent.closed ? 1 : 0}\n`;
      out += `10\n0.0\n20\n0.0\n30\n0.0\n`;
      ent.points.forEach(([x, y]) => {
        out += `0\nVERTEX\n8\n${ent.layer}\n`;
        out += `10\n${x.toFixed(4)}\n20\n${y.toFixed(4)}\n30\n0.0\n`;
      });
      out += `0\nSEQEND\n8\n${ent.layer}\n`;
    } else if (ent.type === 'arc') {
      let startDeg = (ent.startAngle * 180 / Math.PI) % 360;
      let endDeg = (ent.endAngle * 180 / Math.PI) % 360;
      if (startDeg < 0) startDeg += 360;
      if (endDeg < 0) endDeg += 360;

      out += `0\nARC\n8\n${ent.layer}\n`;
      out += `10\n${ent.cx.toFixed(4)}\n20\n${ent.cy.toFixed(4)}\n30\n0.0\n`;
      out += `40\n${ent.r.toFixed(4)}\n`;
      out += `50\n${startDeg.toFixed(3)}\n`;
      out += `51\n${endDeg.toFixed(3)}\n`;
    } else if (ent.type === 'circle') {
      out += `0\nCIRCLE\n8\n${ent.layer}\n`;
      out += `10\n${ent.cx.toFixed(4)}\n20\n${ent.cy.toFixed(4)}\n30\n0.0\n`;
      out += `40\n${ent.r.toFixed(4)}\n`;
    } else if (ent.type === 'text') {
      out += `0\nTEXT\n8\n${ent.layer}\n`;
      out += `10\n${ent.x.toFixed(4)}\n20\n${ent.y.toFixed(4)}\n30\n0.0\n`;
      out += `40\n${ent.height.toFixed(3)}\n`;
      out += `1\n${ent.text}\n`;
    }
  });

  out += `0\nENDSEC\n0\nEOF\n`;
  return out;
}
