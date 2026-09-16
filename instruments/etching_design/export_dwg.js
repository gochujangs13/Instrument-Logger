// Etching Design — AutoCAD Native Binary DWG Exporter
// Produces 1:1 scale DWG (AutoCAD 2007 AC1021 binary format) with standard CAD layers,
// closed ETCH_REMOVE polylines, and ByLayer attributes.

import {
  CadDocument,
  DwgWriter,
  ACadVersion,
  Line,
  Circle,
  Arc,
  LwPolyline,
  LwPolylineVertex,
  XY,
  TextEntity,
  XYZ,
  Layer,
  Color,
} from './lib/acad-ts.min.js';

import { buildCadEntities, validateCadGeometry, CAD_LAYERS } from './cad_builder.js';

export { validateCadGeometry };

/**
 * Generates production-ready AutoCAD native binary DWG buffer.
 *
 * @param {object} geom - Etching geometry model
 * @param {object} options - Export options (mode, exportDimensions, exportText, exportOrientationMarks, etc.)
 * @returns {Uint8Array} dwgBuffer - AutoCAD binary DWG byte array
 */
export function generateDWG(geom, options = {}) {
  // Build clean CAD model (filters guide entities in manufacturing mode, cleans up duplicates & zero-length)
  const cadModel = buildCadEntities(geom, options);

  // Validate geometry
  const validation = validateCadGeometry(cadModel);
  if (!validation.valid && options.strictValidation !== false) {
    console.warn('DWG CAD Validation Warnings/Errors:', validation.errors);
  }

  const pw = cadModel.plate.width;
  const ph = cadModel.plate.height;

  const doc = new CadDocument();
  doc.header.version = options.version || ACadVersion.AC1021; // AutoCAD 2007+ binary DWG

  // Create Standard Layers
  const layerMap = {};
  Object.values(CAD_LAYERS).forEach(ld => {
    // Only register guide layers if needed
    const hasEntities = cadModel.entities.some(e => e.layer === ld.name);
    if (!cadModel.isMfg || !ld.name.startsWith('GUIDE_') || hasEntities) {
      let ly;
      if (doc.layers.contains(ld.name)) {
        ly = doc.layers.get(ld.name);
        ly.color = new Color(ld.color);
      } else {
        ly = new Layer(ld.name);
        ly.color = new Color(ld.color);
        doc.layers.add(ly);
      }
      layerMap[ld.name] = ly;
    }
  });

  // Helper to assign entity to layer with ByLayer color
  const assignLayer = (entity, layerName) => {
    entity.layer = layerMap[layerName] || doc.layers.default;
    entity.color = Color.byLayer;
  };

  // Convert CAD Model Entities to Native DWG Entities
  cadModel.entities.forEach(ent => {
    if (ent.type === 'line') {
      const line = new Line();
      assignLayer(line, ent.layer);
      line.startPoint = new XYZ(ent.x1, ent.y1, 0);
      line.endPoint = new XYZ(ent.x2, ent.y2, 0);
      doc.entities.add(line);
    } else if (ent.type === 'lwpolyline') {
      const poly = new LwPolyline();
      assignLayer(poly, ent.layer);
      poly.isClosed = Boolean(ent.closed);
      ent.points.forEach(([x, y]) => {
        const v = new LwPolylineVertex();
        v.location = new XY(x, y);
        poly.vertices.push(v);
      });
      doc.entities.add(poly);
    } else if (ent.type === 'arc') {
      const arc = new Arc();
      assignLayer(arc, ent.layer);
      arc.center = new XYZ(ent.cx, ent.cy, 0);
      arc.radius = ent.r;
      arc.startAngle = ent.startAngle; // acad-ts Arc takes radians
      arc.endAngle = ent.endAngle;
      doc.entities.add(arc);
    } else if (ent.type === 'circle') {
      const circle = new Circle();
      assignLayer(circle, ent.layer);
      circle.center = new XYZ(ent.cx, ent.cy, 0);
      circle.radius = ent.r;
      doc.entities.add(circle);
    } else if (ent.type === 'text') {
      const txt = new TextEntity();
      assignLayer(txt, ent.layer);
      txt.value = ent.text;
      txt.insertPoint = new XYZ(ent.x, ent.y, 0);
      txt.height = ent.height;
      doc.entities.add(txt);
    }
  });

  // Write binary DWG buffer
  const buffer = DwgWriter.writeToBuffer(doc);
  return buffer;
}
