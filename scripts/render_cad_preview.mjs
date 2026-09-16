// Render Manufacturing DXF / CAD Model to an AutoCAD Dark-Theme SVG for visual inspection

import fs from 'fs';
import { EtchingState } from '../instruments/etching_design/state.js';
import { buildCadEntities } from '../instruments/etching_design/cad_builder.js';

const state = new EtchingState();
state.setMode('mixed');
state.setPlateWidth(420);
state.setPlateHeight(197);
const geom = state.getGeometry();

// Generate Pure Manufacturing CAD Model
const cadModel = buildCadEntities(geom, { mode: 'MANUFACTURING' });

const pw = cadModel.plate.width;
const ph = cadModel.plate.height;

// Padding around plate
const pad = 20;
const svgW = pw + pad * 2;
const svgH = ph + pad * 2;

// Layer colors (AutoCAD Standard ACI Colors on Black Canvas)
const LAYER_STYLES = {
  ETCH_SAMPLE: 'stroke="#00e5ff" stroke-width="0.35" fill="none"',            // Bright Cyan (Specimen Cut Lines)
  ETCH_BRIDGE: 'stroke="#00e676" stroke-width="0.5" fill="none"',            // Bright Green (Bridge Cut Boundaries)
  ETCH_TAB: 'stroke="#00e676" stroke-width="0.5" fill="none"',               // Bright Green (Alias)
  ETCH_SEPARATOR: 'stroke="#ff1744" stroke-width="0.35" fill="none"',         // Red (Vertical runners)
  ETCH_FRAME: 'stroke="#ffffff" stroke-width="0.4" fill="none"',             // White (Outer frame)
  ETCH_BOUNDARY: 'stroke="#e040fb" stroke-width="0.4" fill="none"',          // Magenta (Type boundaries)
  PLATE_OUTLINE: 'stroke="#ffffff" stroke-width="0.5" fill="none"',          // White sheet boundary
  ETCH_REMOVE: 'stroke="#ff9100" stroke-width="0.15" fill="rgba(255, 145, 0, 0.25)"', // Amber Orange Translucent (Closed Etch Remove)
};

function renderCadSvg(cadModel, opts = {}) {
  const { viewBox, width, height, title, subtitle } = opts;
  const pw = cadModel.plate.width;
  const ph = cadModel.plate.height;
  const vb = viewBox || `0 0 ${pw + 40} ${ph + 40}`;
  const svgW = width || 1920;
  const svgH = height || Math.round(svgW * ((ph + 40) / (pw + 40)));
  const pad = 20;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${svgW}" height="${svgH}" style="background:#0f141c; font-family:sans-serif;">\n`;
  svg += `  <style>
    .cad-title { font-family: 'JetBrains Mono', monospace; font-size: 5px; fill: #94a3b8; font-weight: 600; }
    .cad-badge { font-family: 'JetBrains Mono', monospace; font-size: 3.5px; fill: #10b981; }
    .cad-legend { font-family: 'JetBrains Mono', monospace; font-size: 3px; fill: #cbd5e1; }
  </style>\n`;

  if (title) {
    svg += `  <text x="${pad}" y="${pad - 8}" class="cad-title">${title}</text>\n`;
  }
  if (subtitle) {
    svg += `  <text x="${pad + 180}" y="${pad - 8}" class="cad-badge">${subtitle}</text>\n`;
  }

  // Group with inverted Y coordinates (CAD bottom-left mm -> SVG top-left px)
  const tx = opts.tx !== undefined ? opts.tx : pad;
  const ty = opts.ty !== undefined ? opts.ty : (ph + pad);
  svg += `  <g transform="translate(${tx}, ${ty}) scale(1, -1)">\n`;

  // Draw entities
  cadModel.entities.forEach(ent => {
    const style = LAYER_STYLES[ent.layer] || 'stroke="#94a3b8" stroke-width="0.2" fill="none"';

    if (ent.type === 'line') {
      svg += `    <line x1="${ent.x1}" y1="${ent.y1}" x2="${ent.x2}" y2="${ent.y2}" ${style} />\n`;
    } else if (ent.type === 'arc') {
      const startA = ent.startAngle;
      const endA = ent.endAngle;
      const x1 = ent.cx + ent.r * Math.cos(startA);
      const y1 = ent.cy + ent.r * Math.sin(startA);
      const x2 = ent.cx + ent.r * Math.cos(endA);
      const y2 = ent.cy + ent.r * Math.sin(endA);
      let diff = endA - startA;
      while (diff < 0) diff += Math.PI * 2;
      const largeArc = diff > Math.PI ? 1 : 0;
      const sweep = 1;
      svg += `    <path d="M ${x1.toFixed(4)} ${y1.toFixed(4)} A ${ent.r} ${ent.r} 0 ${largeArc} ${sweep} ${x2.toFixed(4)} ${y2.toFixed(4)}" ${style} />\n`;
    } else if (ent.type === 'circle') {
      svg += `    <circle cx="${ent.cx}" cy="${ent.cy}" r="${ent.r}" ${style} />\n`;
    } else if (ent.type === 'lwpolyline') {
      const ptsArr = ent.points || ent.vertices || [];
      const pts = ptsArr.map(v => `${v[0].toFixed(3)},${v[1].toFixed(3)}`).join(' ');
      svg += `    <polygon points="${pts}" ${style} />\n`;
    }
  });

  svg += `  </g>\n`;
  svg += `</svg>\n`;
  return svg;
}

// 1. Full Sheet Overview
const fullSvg = renderCadSvg(cadModel, {
  title: `AUTOCAD MANUFACTURING EXPORT PREVIEW — PLATE: ${pw} x ${ph} mm`,
  subtitle: `✓ CLOSED ETCH_REMOVE CONTOURS | TRUE ETCH_BRIDGE METAL CONNECTORS`,
});
fs.writeFileSync('cad_export_preview.svg', fullSvg, 'utf8');
console.log('Saved cad_export_preview.svg (Full Plate Overview)');

// 2. High-Precision Macro Zoom Detail (Bridge & Etch Remove Region)
// Find first sample
const s1 = geom.samples[0];
const zoomX = s1.x - 3;
const zoomY = s1.y - 2;
const zoomW = s1.width + 10;
const zoomH = s1.height + 4;

let zoomSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${zoomX} ${zoomY} ${zoomW} ${zoomH}" width="1200" height="${Math.round(1200 * (zoomH / zoomW))}" style="background:#0b0f17; font-family:sans-serif;">\n`;
zoomSvg += `  <style>
  .label-title { font-family: 'JetBrains Mono', monospace; font-size: 0.6px; fill: #38bdf8; font-weight: bold; }
  .label-annot { font-family: 'JetBrains Mono', monospace; font-size: 0.45px; fill: #facc15; }
  .label-remove { font-family: 'JetBrains Mono', monospace; font-size: 0.4px; fill: #fb923c; font-weight: bold; }
  .label-bridge { font-family: 'JetBrains Mono', monospace; font-size: 0.4px; fill: #4ade80; font-weight: bold; }
</style>\n`;

// Draw entities with inverted Y
zoomSvg += `  <g transform="translate(0, ${zoomY * 2 + zoomH}) scale(1, -1)">\n`;

cadModel.entities.forEach(ent => {
  const style = LAYER_STYLES[ent.layer] || 'stroke="#94a3b8" stroke-width="0.1" fill="none"';
  // Only draw if inside bounding box of zoom
  if (ent.type === 'lwpolyline') {
    const ptsArr = ent.points || ent.vertices || [];
    const pts = ptsArr.map(v => `${v[0].toFixed(3)},${v[1].toFixed(3)}`).join(' ');
    zoomSvg += `    <polygon points="${pts}" ${style} />\n`;
  } else if (ent.type === 'line') {
    const minX = Math.min(ent.x1, ent.x2);
    const maxX = Math.max(ent.x1, ent.x2);
    const minY = Math.min(ent.y1, ent.y2);
    const maxY = Math.max(ent.y1, ent.y2);
    if (maxX >= zoomX && minX <= zoomX + zoomW && maxY >= zoomY && minY <= zoomY + zoomH) {
      zoomSvg += `    <line x1="${ent.x1}" y1="${ent.y1}" x2="${ent.x2}" y2="${ent.y2}" ${style} />\n`;
    }
  }
});

zoomSvg += `  </g>\n`;

// Add engineering callout labels
const midY = zoomY + zoomH / 2;
zoomSvg += `  <text x="${s1.x + 1}" y="${zoomY + 2}" class="label-title">SAMPLE (Metal Keep: ${s1.width}×${s1.height}mm)</text>\n`;
zoomSvg += `  <text x="${s1.x - 2.8}" y="${zoomY + 2}" class="label-remove">ETCH REMOVE 1 (2.75mm)</text>\n`;
zoomSvg += `  <text x="${s1.x - 2.8}" y="${midY + 0.15}" class="label-bridge">BRIDGE (0.5mm)</text>\n`;
zoomSvg += `  <text x="${s1.x - 2.8}" y="${zoomY + zoomH - 1}" class="label-remove">ETCH REMOVE 2 (2.75mm)</text>\n`;

zoomSvg += `</svg>\n`;

fs.writeFileSync('cad_bridge_zoom_preview.svg', zoomSvg, 'utf8');
console.log('Saved cad_bridge_zoom_preview.svg (Macro Zoom Detail)');
