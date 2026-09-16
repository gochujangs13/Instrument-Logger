// Etching Design — CAD Manufacturing Geometry Engine
// Single Source of Truth for 2D CAD manufacturing and review drawing generation.
// Enforces 1:1 scale (1 unit = 1 mm), true physical bridge metals, explicit closed ETCH_REMOVE areas, ByLayer attributes.

export const CAD_LAYERS = {
  // Manufacturing Layers (Metal Keep)
  ETCH_SAMPLE: { name: 'ETCH_SAMPLE', color: 4, linetype: 'CONTINUOUS', desc: 'Specimen metal keep contours' },
  ETCH_FRAME: { name: 'ETCH_FRAME', color: 7, linetype: 'CONTINUOUS', desc: 'Outer plate frame metal keep' },
  ETCH_SEPARATOR: { name: 'ETCH_SEPARATOR', color: 1, linetype: 'CONTINUOUS', desc: 'Vertical runners metal keep' },
  ETCH_CONNECTOR: { name: 'ETCH_CONNECTOR', color: 3, linetype: 'CONTINUOUS', desc: 'Mechanical connectors metal keep' },
  ETCH_BRIDGE: { name: 'ETCH_BRIDGE', color: 2, linetype: 'CONTINUOUS', desc: 'Micro-joint metal keep bridge connections' },
  ETCH_TAB: { name: 'ETCH_TAB', color: 2, linetype: 'CONTINUOUS', desc: 'Alias for ETCH_BRIDGE' },
  ETCH_BOUNDARY: { name: 'ETCH_BOUNDARY', color: 6, linetype: 'CONTINUOUS', desc: 'Physical type separation runner' },
  PLATE_OUTLINE: { name: 'PLATE_OUTLINE', color: 7, linetype: 'CONTINUOUS', desc: 'Raw sheet boundary and tooling holes' },

  // Manufacturing Layer (Etch Remove - Void to be etched away)
  ETCH_REMOVE: { name: 'ETCH_REMOVE', color: 30, linetype: 'CONTINUOUS', desc: 'Explicit closed etch removal void regions' },

  // Guide / Preview Layers (Only generated when Mode === 'REVIEW_DRAWING')
  GUIDE_ORIENTATION: { name: 'GUIDE_ORIENTATION', color: 5, linetype: 'CONTINUOUS', desc: 'Rolling / grain direction arrows' },
  GUIDE_DIMENSION: { name: 'GUIDE_DIMENSION', color: 5, linetype: 'CONTINUOUS', desc: 'Sheet and specimen dimension lines' },
  GUIDE_TEXT: { name: 'GUIDE_TEXT', color: 8, linetype: 'CONTINUOUS', desc: 'Title, specs and dimension labels' },
  GUIDE_GRID: { name: 'GUIDE_GRID', color: 9, linetype: 'CONTINUOUS', desc: 'Layout alignment grid' },
  GUIDE_BOUNDARY: { name: 'GUIDE_BOUNDARY', color: 6, linetype: 'CONTINUOUS', desc: 'Visual type boundary indicator' },
};

/**
 * Calculates Bridge and Gap intervals along a specimen edge.
 * Supports single center bridge and multiple bridges evenly distributed.
 *
 * @param {number} y0 - Edge bottom coordinate
 * @param {number} h - Edge height (length)
 * @param {number} count - Number of bridges (1, 2, ...)
 * @param {number} width - Bridge width in mm (e.g. 0.5)
 * @returns {object} { bridges: [{top, bot, width}], gaps: [{bot, top, height}] }
 */
export function calculateBridgesAndGaps(y0, h, count = 1, width = 0.5) {
  const bridges = [];
  const gaps = [];
  const bw = Math.max(0.1, Math.min(width, h / Math.max(1, count) - 0.05));
  const numBridges = Math.max(1, parseInt(count, 10) || 1);

  if (numBridges === 1) {
    const cy = y0 + h / 2;
    const bTop = Number((cy + bw / 2).toFixed(4));
    const bBot = Number((cy - bw / 2).toFixed(4));
    bridges.push({ top: bTop, bot: bBot, width: bw, centerY: cy });
    // Remaining etch length split into two equal gaps
    gaps.push({ bot: Number(y0.toFixed(4)), top: bBot, height: Number((bBot - y0).toFixed(4)) });
    gaps.push({ bot: bTop, top: Number((y0 + h).toFixed(4)), height: Number((y0 + h - bTop).toFixed(4)) });
  } else {
    const step = h / (numBridges + 1);
    let curY = Number(y0.toFixed(4));
    for (let i = 0; i < numBridges; i++) {
      const cy = y0 + step * (i + 1);
      const bTop = Number((cy + bw / 2).toFixed(4));
      const bBot = Number((cy - bw / 2).toFixed(4));
      bridges.push({ top: bTop, bot: bBot, width: bw, centerY: cy });
      gaps.push({ bot: curY, top: bBot, height: Number((bBot - curY).toFixed(4)) });
      curY = bTop;
    }
    gaps.push({ bot: curY, top: Number((y0 + h).toFixed(4)), height: Number((y0 + h - curY).toFixed(4)) });
  }

  return { bridges, gaps };
}

/**
 * Calculates Bridge Feature Geometry (circular hole or rectangular slot/notch)
 * for a specific bridge.
 *
 * @param {object} b - Bridge object { top, bot, width, centerY }
 * @param {boolean} isLeft - True if left edge bridge, false if right edge
 * @param {number} x0 - Specimen left edge coordinate
 * @param {number} w - Specimen width
 * @param {number} bridgeL - Bridge length bridging from specimen to runner
 * @param {object} tabFeature - Tab feature configuration { type, holeDia, slotWidth, slotHeight, posX, posY, customX }
 * @returns {object|null} Feature geometry details
 */
export function calculateBridgeFeatureGeometry(b, isLeft, x0, w, bridgeL, tabFeature) {
  if (!tabFeature || !tabFeature.type || tabFeature.type === 'none') return null;
  const bw = b.width;
  const cy = b.centerY;
  const featType = tabFeature.type;
  const posX = tabFeature.posX || 'center';
  const posY = tabFeature.posY || 'center';

  if (featType === 'hole') {
    const maxDia = Math.max(0.05, Math.min(bridgeL - 0.05, 10.0));
    const dia = Number(Math.min(Math.max(0.05, Number(tabFeature.holeDia || 0.3)), maxDia).toFixed(4));
    const r = Number((dia / 2).toFixed(4));
    let cx = 0;
    if (posX === 'specimen') {
      cx = isLeft ? (x0 - r) : (x0 + w + r);
    } else if (posX === 'runner') {
      cx = isLeft ? (x0 - bridgeL + r) : (x0 + w + bridgeL - r);
    } else if (posX === 'custom') {
      const dX = Math.max(r, Math.min(bridgeL - r, Number(tabFeature.customX || (bridgeL / 2))));
      cx = isLeft ? (x0 - dX) : (x0 + w + dX);
    } else {
      // 'center'
      cx = isLeft ? (x0 - bridgeL / 2) : (x0 + w + bridgeL / 2);
    }
    return { type: 'hole', cx: Number(cx.toFixed(4)), cy: Number(cy.toFixed(4)), r, dia };
  } else if (featType === 'slot') {
    const sw = Number(Math.min(Math.max(0.05, Number(tabFeature.slotWidth || 0.2)), bridgeL).toFixed(4));
    const sh = Number(Math.min(Math.max(0.05, Number(tabFeature.slotHeight || 0.2)), bw).toFixed(4));
    const hw = Number((sw / 2).toFixed(4));

    let cx = 0;
    if (posX === 'specimen') {
      cx = isLeft ? (x0 - hw) : (x0 + w + hw);
    } else if (posX === 'runner') {
      cx = isLeft ? (x0 - bridgeL + hw) : (x0 + w + bridgeL - hw);
    } else if (posX === 'custom') {
      const dX = Math.max(hw, Math.min(bridgeL - hw, Number(tabFeature.customX || (bridgeL / 2))));
      cx = isLeft ? (x0 - dX) : (x0 + w + dX);
    } else {
      // 'center'
      cx = isLeft ? (x0 - bridgeL / 2) : (x0 + w + bridgeL / 2);
    }

    const x1 = Number((cx - hw).toFixed(4));
    const x2 = Number((cx + hw).toFixed(4));
    const slots = [];

    if (posY === 'top') {
      slots.push({ x1, y1: Number((b.top - sh).toFixed(4)), x2, y2: b.top, notch: 'top' });
    } else if (posY === 'bottom') {
      slots.push({ x1, y1: b.bot, x2, y2: Number((b.bot + sh).toFixed(4)), notch: 'bottom' });
    } else if (posY === 'both') {
      const notchH = Number(Math.min(sh, (bw - 0.05) / 2).toFixed(4));
      slots.push({ x1, y1: Number((b.top - notchH).toFixed(4)), x2, y2: b.top, notch: 'top' });
      slots.push({ x1, y1: b.bot, x2, y2: Number((b.bot + notchH).toFixed(4)), notch: 'bottom' });
    } else {
      // 'center'
      slots.push({
        x1,
        y1: Number((cy - sh / 2).toFixed(4)),
        x2,
        y2: Number((cy + sh / 2).toFixed(4)),
        notch: 'none',
      });
    }

    return { type: 'slot', slots, cx: Number(cx.toFixed(4)), cy: Number(cy.toFixed(4)), sw, sh };
  }
  return null;
}

/**
 * Calculates a feature cut into the specimen body itself. In the shop-floor
 * terminology used by this project the specimen body is the "bridge", while
 * the narrow left/right metal connections are supports.
 */
export function calculateSpecimenFeatureGeometry(sample, feature) {
  if (!sample || !feature || !feature.type || feature.type === 'none') return null;
  const x = Number(sample.x || 0);
  const y = Number(sample.y || 0);
  const w = Math.max(0.1, Number(sample.width || 0.1));
  const h = Math.max(0.1, Number(sample.height || 0.1));
  const cx = Number((x + w / 2).toFixed(4));
  const cy = Number((y + h / 2).toFixed(4));

  const requestedInsetX = Math.max(0, Number(feature.pointInsetX ?? feature.pointInset ?? 1));
  const requestedInsetY = Math.max(0, Number(feature.pointInsetY ?? feature.pointInset ?? 1));
  const requestedDistanceX = Math.max(0, Number(feature.pointDistanceX ?? Math.max(0, w - 2 * requestedInsetX)));
  const requestedDistanceY = Math.max(0, Number(feature.pointDistanceY ?? Math.max(0, h - 2 * requestedInsetY)));

  if (feature.type === 'hole') {
    const dia = Number(Math.min(Math.max(0.05, Number(feature.holeDia || 0.2)), Math.max(0.05, Math.min(w, h) - 0.1)).toFixed(4));
    const r = Number((dia / 2).toFixed(4));
    let holes;
    if (feature.posX === 'fourPoints') {
      const maxDistanceX = Math.max(0, w - 2 * (r + 0.05));
      const maxDistanceY = Math.max(0, h - 2 * (r + 0.05));
      const distanceX = Math.min(maxDistanceX, Math.max(Math.min(maxDistanceX, dia + 0.05), requestedDistanceX));
      const distanceY = Math.min(maxDistanceY, Math.max(Math.min(maxDistanceY, dia + 0.05), requestedDistanceY));
      holes = [
        { cx: cx - distanceX / 2, cy: cy - distanceY / 2 },
        { cx: cx + distanceX / 2, cy: cy - distanceY / 2 },
        { cx: cx - distanceX / 2, cy: cy + distanceY / 2 },
        { cx: cx + distanceX / 2, cy: cy + distanceY / 2 },
      ];
    } else if (feature.posX === 'twoPoints') {
      const maxDistanceX = Math.max(0, w - 2 * (r + 0.05));
      const distanceX = Math.min(maxDistanceX, Math.max(Math.min(maxDistanceX, dia + 0.05), requestedDistanceX));
      holes = [
        { cx: cx - distanceX / 2, cy },
        { cx: cx + distanceX / 2, cy },
      ];
    } else if (feature.posX === 'custom') {
      const customX = Math.min(w - r, Math.max(r, Number(feature.customX ?? (w / 2))));
      holes = [{ cx: x + customX, cy }];
    } else {
      holes = [{ cx, cy }];
    }
    holes = holes.map(p => ({ cx: Number(p.cx.toFixed(4)), cy: Number(p.cy.toFixed(4)), r, dia }));
    return { type: 'hole', holes, cx: holes[0].cx, cy: holes[0].cy, r, dia };
  }

  if (feature.type === 'slot') {
    const sw = Number(Math.min(Math.max(0.05, Number(feature.slotWidth || 0.2)), Math.max(0.05, w - 0.1)).toFixed(4));
    const sh = Number(Math.min(Math.max(0.05, Number(feature.slotHeight || 0.2)), Math.max(0.05, h - 0.1)).toFixed(4));
    const slots = [];
    const addCenteredSlot = (slotCx, slotCy, notch = 'none') => {
      slots.push({
        x1: Number((slotCx - sw / 2).toFixed(4)),
        y1: Number((slotCy - sh / 2).toFixed(4)),
        x2: Number((slotCx + sw / 2).toFixed(4)),
        y2: Number((slotCy + sh / 2).toFixed(4)),
        notch,
      });
    };
    const posY = feature.posY || 'center';
    if (feature.posX === 'fourPoints') {
      const maxDistanceX = Math.max(0, w - sw - 0.1);
      const maxDistanceY = Math.max(0, h - sh - 0.1);
      const distanceX = Math.min(maxDistanceX, Math.max(Math.min(maxDistanceX, sw + 0.05), requestedDistanceX));
      const distanceY = Math.min(maxDistanceY, Math.max(Math.min(maxDistanceY, sh + 0.05), requestedDistanceY));
      addCenteredSlot(cx - distanceX / 2, cy - distanceY / 2, 'bottom-left');
      addCenteredSlot(cx + distanceX / 2, cy - distanceY / 2, 'bottom-right');
      addCenteredSlot(cx - distanceX / 2, cy + distanceY / 2, 'top-left');
      addCenteredSlot(cx + distanceX / 2, cy + distanceY / 2, 'top-right');
    } else if (feature.posX === 'twoPoints') {
      const maxDistanceX = Math.max(0, w - sw - 0.1);
      const distanceX = Math.min(maxDistanceX, Math.max(Math.min(maxDistanceX, sw + 0.05), requestedDistanceX));
      addCenteredSlot(cx - distanceX / 2, cy, 'left');
      addCenteredSlot(cx + distanceX / 2, cy, 'right');
    } else if (feature.posX === 'custom') {
      const customCx = x + Math.min(w - sw / 2, Math.max(sw / 2, Number(feature.customX ?? (w / 2))));
      addCenteredSlot(customCx, cy);
    } else if (posY === 'top') {
      const x1 = Number((cx - sw / 2).toFixed(4));
      const x2 = Number((cx + sw / 2).toFixed(4));
      slots.push({ x1, y1: Number((y + h - sh).toFixed(4)), x2, y2: Number((y + h).toFixed(4)), notch: 'top' });
    } else if (posY === 'bottom') {
      const x1 = Number((cx - sw / 2).toFixed(4));
      const x2 = Number((cx + sw / 2).toFixed(4));
      slots.push({ x1, y1: Number(y.toFixed(4)), x2, y2: Number((y + sh).toFixed(4)), notch: 'bottom' });
    } else if (posY === 'both') {
      const x1 = Number((cx - sw / 2).toFixed(4));
      const x2 = Number((cx + sw / 2).toFixed(4));
      const notchH = Number(Math.min(sh, Math.max(0.05, (h - 0.05) / 2)).toFixed(4));
      slots.push({ x1, y1: Number((y + h - notchH).toFixed(4)), x2, y2: Number((y + h).toFixed(4)), notch: 'top' });
      slots.push({ x1, y1: Number(y.toFixed(4)), x2, y2: Number((y + notchH).toFixed(4)), notch: 'bottom' });
    } else {
      addCenteredSlot(cx, cy);
    }
    return { type: 'slot', slots, cx, cy, sw, sh };
  }
  return null;
}


/**
 * Builds pure CAD entity model from Etching Design geometry.
 *
 * @param {object} geom - Output of calculateSingleTypeGeometry or calculateMixedDesignGeometry
 * @param {object} options - Export configuration options
 * @returns {object} cadModel - Normalized CAD geometry model with clean entities
 */
export function buildCadEntities(geom, options = {}) {
  const mode = options.mode || 'MANUFACTURING'; // 'MANUFACTURING' | 'REVIEW_DRAWING'
  const isMfg = mode === 'MANUFACTURING';

  // Option defaults based on mode
  const exportOrientationMarks = isMfg ? false : Boolean(options.exportOrientationMarks);
  const exportDimensions = isMfg ? false : Boolean(options.exportDimensions);
  const exportText = isMfg ? false : Boolean(options.exportText);
  const exportPlateOutline = options.exportPlateOutline !== false;
  const exportEtchRemove = options.exportEtchRemove !== false; // Default: true (generate closed ETCH_REMOVE areas)
  const boundaryMode = options.boundaryMode || 'guide'; // 'guide' | 'physical'

  const pw = Number(geom.plate.width.toFixed(4));
  const ph = Number(geom.plate.height.toFixed(4));

  const rawEntities = [];

  const addLine = (x1, y1, x2, y2, layer) => {
    rawEntities.push({
      type: 'line',
      layer,
      x1: Number(Number(x1).toFixed(4)),
      y1: Number(Number(y1).toFixed(4)),
      x2: Number(Number(x2).toFixed(4)),
      y2: Number(Number(y2).toFixed(4)),
    });
  };

  const addPoly = (points, layer, closed = true) => {
    rawEntities.push({
      type: 'lwpolyline',
      layer,
      points: points.map(([x, y]) => [Number(Number(x).toFixed(4)), Number(Number(y).toFixed(4))]),
      closed: Boolean(closed),
    });
  };

  const addArc = (cx, cy, r, startAngle, endAngle, layer) => {
    rawEntities.push({
      type: 'arc',
      layer,
      cx: Number(Number(cx).toFixed(4)),
      cy: Number(Number(cy).toFixed(4)),
      r: Number(Number(r).toFixed(4)),
      startAngle: Number(Number(startAngle).toFixed(6)),
      endAngle: Number(Number(endAngle).toFixed(6)),
    });
  };

  const addCircle = (cx, cy, r, layer) => {
    rawEntities.push({
      type: 'circle',
      layer,
      cx: Number(Number(cx).toFixed(4)),
      cy: Number(Number(cy).toFixed(4)),
      r: Number(Number(r).toFixed(4)),
    });
  };

  const addText = (text, x, y, height, layer) => {
    rawEntities.push({
      type: 'text',
      layer,
      text: String(text),
      x: Number(Number(x).toFixed(4)),
      y: Number(Number(y).toFixed(4)),
      height: Number(Number(height).toFixed(3)),
    });
  };

  // 1. PLATE_OUTLINE & Tooling Holes
  if (exportPlateOutline) {
    // 4 edges of sheet
    addLine(0, 0, pw, 0, 'PLATE_OUTLINE');
    addLine(pw, 0, pw, ph, 'PLATE_OUTLINE');
    addLine(pw, ph, 0, ph, 'PLATE_OUTLINE');
    addLine(0, ph, 0, 0, 'PLATE_OUTLINE');

    // Tooling holes
    const hOff = 3.5;
    const hR = 1.5;
    addCircle(hOff, hOff, hR, 'PLATE_OUTLINE');
    addCircle(pw - hOff, hOff, hR, 'PLATE_OUTLINE');
    addCircle(hOff, ph - hOff, hR, 'PLATE_OUTLINE');
    addCircle(pw - hOff, ph - hOff, hR, 'PLATE_OUTLINE');
  }

  // 2. SPECIMENS (ETCH_SAMPLE), BRIDGES (ETCH_BRIDGE), & ETCH_REMOVE CLOSED CONTOURS
  const samples = geom.samples || [];

  // 1B. ETCH_FRAME — Outer metal frame boundary (encloses all specimens + tabs)
  if (samples.length > 0) {
    const tabLen = samples[0]?.tabs?.[0]?.length || 0.5;
    const xs = samples.map(s => s.x);
    const ys = samples.map(s => s.y);
    const xw = samples.map(s => s.x + s.width);
    const yh = samples.map(s => s.y + s.height);

    const frameLeft = Math.min(...xs) - tabLen;
    const frameRight = Math.max(...xw) + tabLen;
    const frameBottom = Math.min(...ys);
    const frameTop = Math.max(...yh);

    // Only emit if frame is inset from plate outline (avoid duplicating PLATE_OUTLINE)
    if (frameLeft > 0.01 || frameRight < pw - 0.01 || frameBottom > 0.01 || frameTop < ph - 0.01) {
      addLine(frameLeft, frameBottom, frameRight, frameBottom, 'ETCH_FRAME');
      addLine(frameRight, frameBottom, frameRight, frameTop, 'ETCH_FRAME');
      addLine(frameRight, frameTop, frameLeft, frameTop, 'ETCH_FRAME');
      addLine(frameLeft, frameTop, frameLeft, frameBottom, 'ETCH_FRAME');
    }
  }

  samples.forEach(s => {
    const x0 = s.x;
    const y0 = s.y;
    const w = s.width;
    const h = s.height;
    const r = s.cornerRadius || 0;
    const cType = s.cornerType || 'sharp';

    const sampleTab = s.tabs?.[0];
    const hasTabs = Boolean(sampleTab);
    const tabFeature = sampleTab?.feature;
    const baseTabL = sampleTab?.length !== undefined ? Number(sampleTab.length) : 0.8;
    const baseTabW = sampleTab?.width !== undefined ? Number(sampleTab.width) : 0.5;

    const effBridgeW = baseTabW;
    const effBridgeL = baseTabL;

    // Keep vertical runner intact: clamp bridgeL so it does not swallow the column gap
    let bridgeL = effBridgeL;
    if (s.hGap !== undefined && s.hGap > 0) {
      const maxAllowedL = Math.max(0.4, Number(((s.hGap - 0.4) / 2).toFixed(4)));
      bridgeL = Math.min(maxAllowedL, effBridgeL);
    }
    const bridgeCount = sampleTab ? (sampleTab.count || 1) : 1;

    // Calculate Bridges and Gaps along vertical height
    const { bridges, gaps } = calculateBridgesAndGaps(y0, h, bridgeCount, effBridgeW);

    // A. Horizontal Cut Lines (Top & Bottom)
    addLine(x0 + r, y0 + h, x0 + w - r, y0 + h, 'ETCH_SAMPLE');
    addLine(x0 + r, y0, x0 + w - r, y0, 'ETCH_SAMPLE');

    // B. Corners (Sharp / Chamfer / Fillet Arc)
    if (cType === 'chamfer' && r > 0) {
      addLine(x0, y0 + r, x0 + r, y0, 'ETCH_SAMPLE'); // BL
      addLine(x0 + w - r, y0, x0 + w, y0 + r, 'ETCH_SAMPLE'); // BR
      addLine(x0 + w, y0 + h - r, x0 + w - r, y0 + h, 'ETCH_SAMPLE'); // TR
      addLine(x0 + r, y0 + h, x0, y0 + h - r, 'ETCH_SAMPLE'); // TL
    } else if (cType === 'fillet' && r > 0) {
      // True AutoCAD ARC entities
      addArc(x0 + r, y0 + r, r, Math.PI, 1.5 * Math.PI, 'ETCH_SAMPLE'); // BL
      addArc(x0 + w - r, y0 + r, r, 1.5 * Math.PI, 2 * Math.PI, 'ETCH_SAMPLE'); // BR
      addArc(x0 + w - r, y0 + h - r, r, 0, 0.5 * Math.PI, 'ETCH_SAMPLE'); // TR
      addArc(x0 + r, y0 + h - r, r, 0.5 * Math.PI, Math.PI, 'ETCH_SAMPLE'); // TL
    }

    if (hasTabs) {
      // C. Left Side: Cut lines for gaps only (bridges remain OPEN for metal connection)
      gaps.forEach(gap => {
        const yStart = Math.max(gap.bot, y0 + r);
        const yEnd = Math.min(gap.top, y0 + h - r);
        if (yEnd > yStart) {
          addLine(x0, yStart, x0, yEnd, 'ETCH_SAMPLE');
        }

        // ETCH_REMOVE: Explicit Closed Polyline on Left Edge Gap
        if (exportEtchRemove) {
          addPoly([
            [x0 - bridgeL, gap.bot],
            [x0, gap.bot],
            [x0, gap.top],
            [x0 - bridgeL, gap.top],
          ], 'ETCH_REMOVE', true);
        }
      });

      // D. Right Side: Cut lines for gaps only (bridges remain OPEN for metal connection)
      gaps.forEach(gap => {
        const yStart = Math.max(gap.bot, y0 + r);
        const yEnd = Math.min(gap.top, y0 + h - r);
        if (yEnd > yStart) {
          addLine(x0 + w, yStart, x0 + w, yEnd, 'ETCH_SAMPLE');
        }

        // ETCH_REMOVE: Explicit Closed Polyline on Right Edge Gap
        if (exportEtchRemove) {
          addPoly([
            [x0 + w, gap.bot],
            [x0 + w + bridgeL, gap.bot],
            [x0 + w + bridgeL, gap.top],
            [x0 + w, gap.top],
          ], 'ETCH_REMOVE', true);
        }
      });

      // E. ETCH_BRIDGE: Metal Keep Connections (Top & Bottom Boundaries of Bridge)
      bridges.forEach(b => {
        // Left bridge cut boundaries
        addLine(x0 - bridgeL, b.top, x0, b.top, 'ETCH_BRIDGE');
        addLine(x0 - bridgeL, b.bot, x0, b.bot, 'ETCH_BRIDGE');

        // Right bridge cut boundaries
        addLine(x0 + w, b.top, x0 + w + bridgeL, b.top, 'ETCH_BRIDGE');
        addLine(x0 + w, b.bot, x0 + w + bridgeL, b.bot, 'ETCH_BRIDGE');

      });
    } else {
      // No tabs: continuous vertical cuts
      addLine(x0, y0 + r, x0, y0 + h - r, 'ETCH_SAMPLE');
      addLine(x0 + w, y0 + r, x0 + w, y0 + h - r, 'ETCH_SAMPLE');
    }

    // "Bridge center" means the exact center of the specimen body (for a
    // 15×6 bridge: x+7.5 mm, y+3 mm), not either left/right support.
    if (tabFeature?.type && tabFeature.type !== 'none' && exportEtchRemove) {
      const bodyFeat = calculateSpecimenFeatureGeometry(s, tabFeature);
      if (bodyFeat?.type === 'hole') {
        bodyFeat.holes.forEach(hole => addCircle(hole.cx, hole.cy, hole.r, 'ETCH_REMOVE'));
      } else if (bodyFeat?.type === 'slot') {
        bodyFeat.slots.forEach(slot => {
          addPoly([[slot.x1, slot.y1], [slot.x2, slot.y1], [slot.x2, slot.y2], [slot.x1, slot.y2]], 'ETCH_REMOVE', true);
        });
      }
    }

    // F. Orientation Arrow (GUIDE_ORIENTATION layer, strictly excluded in Manufacturing)
    if (exportOrientationMarks) {
      const cx = x0 + w / 2;
      const cy = y0 + h / 2;
      const arm = Math.min(w, h) * 0.25;
      if (s.direction === 'up') {
        addLine(cx, cy - arm, cx, cy + arm, 'GUIDE_ORIENTATION');
        addLine(cx - arm * 0.4, cy + arm * 0.5, cx, cy + arm, 'GUIDE_ORIENTATION');
        addLine(cx + arm * 0.4, cy + arm * 0.5, cx, cy + arm, 'GUIDE_ORIENTATION');
      } else if (s.direction === 'down') {
        addLine(cx, cy + arm, cx, cy - arm, 'GUIDE_ORIENTATION');
        addLine(cx - arm * 0.4, cy - arm * 0.5, cx, cy - arm, 'GUIDE_ORIENTATION');
        addLine(cx + arm * 0.4, cy - arm * 0.5, cx, cy - arm, 'GUIDE_ORIENTATION');
      } else if (s.direction === 'right') {
        addLine(cx - arm, cy, cx + arm, cy);
        addLine(cx + arm * 0.5, cy + arm * 0.4, cx + arm, cy, 'GUIDE_ORIENTATION');
        addLine(cx + arm * 0.5, cy - arm * 0.4, cx + arm, cy, 'GUIDE_ORIENTATION');
      } else if (s.direction === 'left') {
        addLine(cx + arm, cy, cx - arm, cy, 'GUIDE_ORIENTATION');
        addLine(cx - arm * 0.5, cy + arm * 0.4, cx - arm, cy, 'GUIDE_ORIENTATION');
        addLine(cx - arm * 0.5, cy - arm * 0.4, cx - arm, cy, 'GUIDE_ORIENTATION');
      }
    }
  });

  // 3. VERTICAL RUNNER SLITS, SEPARATORS, & V-GAP ETCH_REMOVE REGIONS
  if (samples.length > 0) {
    const colGroups = new Map();
    samples.forEach(s => {
      const c = s.column ?? 0;
      if (!colGroups.has(c)) colGroups.set(c, []);
      colGroups.get(c).push(s);
    });

    colGroups.forEach(grp => grp.sort((a, b) => a.y - b.y));

    // Vertical Gap (vGap) Etch Remove Regions between consecutive rows in same column
    colGroups.forEach(colSamples => {
      for (let r = 0; r < colSamples.length - 1; r++) {
        const sCur = colSamples[r];
        const sNext = colSamples[r + 1];
        const vGapBot = sCur.y + sCur.height;
        const vGapTop = sNext.y;

        if (exportEtchRemove && vGapTop > vGapBot) {
          // Closed rectangular void between row r and row r+1
          addPoly([
            [sCur.x, vGapBot],
            [sCur.x + sCur.width, vGapBot],
            [sCur.x + sCur.width, vGapTop],
            [sCur.x, vGapTop],
          ], 'ETCH_REMOVE', true);
        }
      }
    });

    // Vertical Runner Cut Edges between column c and column c+1
    const maxCol = Math.max(...Array.from(colGroups.keys()));
    for (let c = 0; c <= maxCol; c++) {
      const curColSamples = colGroups.get(c) || [];
      const nextColSamples = colGroups.get(c + 1);

      if (nextColSamples && nextColSamples.length > 0) {
        const numRows = Math.min(curColSamples.length, nextColSamples.length);
        for (let r = 0; r < numRows - 1; r++) {
          const sCurr = curColSamples[r];
          const sNext = curColSamples[r + 1];

          const tlCurr = sCurr.tabs?.[0]?.length || 0.5;
          const twCurr = sCurr.tabs?.[0]?.width || 0.5;
          const tabTopY = sCurr.y + sCurr.height / 2 + twCurr / 2;

          const twNext = sNext.tabs?.[0]?.width || 0.5;
          const tabBotY = sNext.y + sNext.height / 2 - twNext / 2;

          const runnerX1 = sCurr.x + sCurr.width + tlCurr;
          if (tabBotY > tabTopY) {
            addLine(runnerX1, tabTopY, runnerX1, tabBotY, 'ETCH_SEPARATOR');
          }
        }
      }
    }
  }

  // 4. TYPE BOUNDARIES (ETCH_BOUNDARY vs GUIDE_BOUNDARY)
  const boundaries = geom.boundaries || [];
  boundaries.forEach(b => {
    const isPhysical = boundaryMode === 'physical';
    const targetLayer = isPhysical ? 'ETCH_BOUNDARY' : 'GUIDE_BOUNDARY';

    if (isPhysical || !isMfg) {
      addLine(b.x, b.y, b.x + b.width, b.y, targetLayer);
      addLine(b.x + b.width, b.y, b.x + b.width, b.y + b.height, targetLayer);
      addLine(b.x + b.width, b.y + b.height, b.x, b.y + b.height, targetLayer);
      addLine(b.x, b.y + b.height, b.x, b.y, targetLayer);
    }
  });

  // 5. DIMENSIONS & TEXT (GUIDE_DIMENSION & GUIDE_TEXT, strictly Review Drawing only)
  if (exportDimensions) {
    addLine(0, ph + 5, pw, ph + 5, 'GUIDE_DIMENSION');
    addLine(0, ph + 3, 0, ph + 7, 'GUIDE_DIMENSION');
    addLine(pw, ph + 3, pw, ph + 7, 'GUIDE_DIMENSION');
    addText(`${pw} mm`, pw / 2 - 8, ph + 6, 2.5, 'GUIDE_DIMENSION');

    addLine(pw + 5, 0, pw + 5, ph, 'GUIDE_DIMENSION');
    addLine(pw + 3, 0, pw + 7, 0, 'GUIDE_DIMENSION');
    addLine(pw + 3, ph, pw + 7, ph, 'GUIDE_DIMENSION');
    addText(`${ph} mm`, pw + 6, ph / 2, 2.5, 'GUIDE_DIMENSION');
  }

  if (exportText) {
    addText(`3M ETCHING DESIGN - PLATE: ${pw}x${ph}mm - TOTAL: ${geom.totalSamples}EA`, 10, 2, 2.0, 'GUIDE_TEXT');
  }

  // Apply Geometry Cleanup
  const cleanedEntities = cleanupGeometry(rawEntities);

  return {
    plate: { width: pw, height: ph },
    mode,
    isMfg,
    totalSamples: geom.totalSamples || samples.length,
    entities: cleanedEntities,
  };
}

/**
 * Geometric Cleanup Engine
 * 1. Removes zero-length entities (< tolerance)
 * 2. Normalizes line segment directions (canonical start/end)
 * 3. Removes exact duplicate entities (within tolerance)
 * 4. Merges collinear overlapping line segments
 * 5. Preserves and validates closed polyline loops
 */
export function cleanupGeometry(entities, tolerance = 0.001) {
  const result = [];
  const linesByLayer = new Map();
  const polylines = [];
  const arcs = [];
  const circles = [];
  const texts = [];

  // Step 1: Categorize entities
  entities.forEach(ent => {
    if (ent.type === 'line') {
      const len = Math.hypot(ent.x2 - ent.x1, ent.y2 - ent.y1);
      if (len >= tolerance) {
        let { x1, y1, x2, y2 } = ent;
        if (x1 > x2 + tolerance || (Math.abs(x1 - x2) <= tolerance && y1 > y2 + tolerance)) {
          const tx = x1; const ty = y1;
          x1 = x2; y1 = y2;
          x2 = tx; y2 = ty;
        }
        const cleanLine = {
          type: 'line',
          layer: ent.layer,
          x1: Number(x1.toFixed(4)),
          y1: Number(y1.toFixed(4)),
          x2: Number(x2.toFixed(4)),
          y2: Number(y2.toFixed(4)),
        };
        if (!linesByLayer.has(ent.layer)) linesByLayer.set(ent.layer, []);
        linesByLayer.get(ent.layer).push(cleanLine);
      }
    } else if (ent.type === 'lwpolyline') {
      // Validate polyline points
      if (Array.isArray(ent.points) && ent.points.length >= 3) {
        polylines.push(ent);
      }
    } else if (ent.type === 'arc') {
      if (ent.r >= tolerance && Math.abs(ent.endAngle - ent.startAngle) >= 0.001) {
        arcs.push(ent);
      }
    } else if (ent.type === 'circle') {
      if (ent.r >= tolerance) {
        circles.push(ent);
      }
    } else if (ent.type === 'text') {
      texts.push(ent);
    }
  });

  // Step 2: Remove duplicates & merge collinear overlapping lines per layer
  linesByLayer.forEach((lines, layer) => {
    const hLines = [];
    const vLines = [];
    const dLines = [];

    lines.forEach(l => {
      if (Math.abs(l.y1 - l.y2) <= tolerance) {
        hLines.push(l);
      } else if (Math.abs(l.x1 - l.x2) <= tolerance) {
        vLines.push(l);
      } else {
        dLines.push(l);
      }
    });

    // Merge Horizontal Lines
    hLines.sort((a, b) => a.y1 !== b.y1 ? a.y1 - b.y1 : a.x1 - b.x1);
    const mergedH = [];
    hLines.forEach(l => {
      const prev = mergedH[mergedH.length - 1];
      if (prev && Math.abs(prev.y1 - l.y1) <= tolerance && l.x1 <= prev.x2 + tolerance) {
        prev.x2 = Math.max(prev.x2, l.x2);
      } else {
        mergedH.push({ ...l });
      }
    });

    // Merge Vertical Lines
    vLines.sort((a, b) => a.x1 !== b.x1 ? a.x1 - b.x1 : a.y1 - b.y1);
    const mergedV = [];
    vLines.forEach(l => {
      const prev = mergedV[mergedV.length - 1];
      if (prev && Math.abs(prev.x1 - l.x1) <= tolerance && l.y1 <= prev.y2 + tolerance) {
        prev.y2 = Math.max(prev.y2, l.y2);
      } else {
        mergedV.push({ ...l });
      }
    });

    // Deduplicate Diagonal Lines
    const mergedD = [];
    const seenD = new Set();
    dLines.forEach(l => {
      const key = `${l.x1}_${l.y1}_${l.x2}_${l.y2}`;
      if (!seenD.has(key)) {
        seenD.add(key);
        mergedD.push(l);
      }
    });

    result.push(...mergedH, ...mergedV, ...mergedD);
  });

  // Deduplicate Polylines
  const seenPoly = new Set();
  polylines.forEach(p => {
    const key = `${p.layer}_` + p.points.map(pt => `${pt[0]},${pt[1]}`).join(';');
    if (!seenPoly.has(key)) {
      seenPoly.add(key);
      result.push(p);
    }
  });

  // Deduplicate Arcs
  const seenArcs = new Set();
  arcs.forEach(a => {
    const key = `${a.layer}_${a.cx}_${a.cy}_${a.r}_${a.startAngle.toFixed(3)}_${a.endAngle.toFixed(3)}`;
    if (!seenArcs.has(key)) {
      seenArcs.add(key);
      result.push(a);
    }
  });

  // Deduplicate Circles
  const seenCircles = new Set();
  circles.forEach(c => {
    const key = `${c.layer}_${c.cx}_${c.cy}_${c.r}`;
    if (!seenCircles.has(key)) {
      seenCircles.add(key);
      result.push(c);
    }
  });

  result.push(...texts);

  return result;
}

/**
 * Validates CAD geometry against strict chemical etching manufacturing rules.
 *
 * @param {object} cadModel - Result of buildCadEntities
 * @returns {object} validationReport
 */
export function validateCadGeometry(cadModel) {
  const errors = [];
  const warnings = [];
  const { plate, mode, entities, totalSamples } = cadModel;
  const isMfg = mode === 'MANUFACTURING';

  // 1. Plate Dimensions Check
  if (!plate || plate.width <= 0 || plate.height <= 0) {
    errors.push(`Invalid plate dimensions: ${plate?.width} x ${plate?.height} mm`);
  }

  const pw = plate.width;
  const ph = plate.height;

  let zeroLengthCount = 0;
  let guideInMfgCount = 0;
  let sampleCutCount = 0;
  let bridgeCount = 0;
  let etchRemoveCount = 0;
  let nonClosedRemoveCount = 0;
  let plateOutlineCount = 0;

  const seenLineKeys = new Set();
  let duplicateCount = 0;

  entities.forEach(ent => {
    if (ent.type === 'line') {
      const len = Math.hypot(ent.x2 - ent.x1, ent.y2 - ent.y1);
      if (len < 0.0001) zeroLengthCount++;

      const key = `${ent.layer}_${ent.x1}_${ent.y1}_${ent.x2}_${ent.y2}`;
      if (seenLineKeys.has(key)) {
        duplicateCount++;
      } else {
        seenLineKeys.add(key);
      }
    }

    if (ent.type === 'lwpolyline') {
      if (ent.layer === 'ETCH_REMOVE') {
        etchRemoveCount++;
        if (!ent.closed) {
          nonClosedRemoveCount++;
          errors.push('Found non-closed LWPOLYLINE on ETCH_REMOVE layer');
        }
      }
    }

    if (isMfg && ent.layer.startsWith('GUIDE_')) {
      guideInMfgCount++;
    }

    if (ent.layer === 'ETCH_SAMPLE') sampleCutCount++;
    if (ent.layer === 'ETCH_BRIDGE' || ent.layer === 'ETCH_TAB') bridgeCount++;
    if (ent.layer === 'PLATE_OUTLINE') plateOutlineCount++;

    // Plate Overflow Check (Only for manufacturing layers)
    if (!ent.layer.startsWith('GUIDE_')) {
      if (ent.type === 'line') {
        if (ent.x1 < -0.01 || ent.x2 > pw + 0.01 || ent.y1 < -0.01 || ent.y2 > ph + 0.01) {
          errors.push(`Entity on layer ${ent.layer} extends beyond plate boundaries: (${ent.x1},${ent.y1})-(${ent.x2},${ent.y2})`);
        }
      } else if (ent.type === 'lwpolyline') {
        ent.points.forEach(([px, py]) => {
          if (px < -0.01 || px > pw + 0.01 || py < -0.01 || py > ph + 0.01) {
            errors.push(`Polyline on layer ${ent.layer} extends beyond plate boundaries at (${px}, ${py})`);
          }
        });
      }
    }
  });

  if (zeroLengthCount > 0) {
    errors.push(`Found ${zeroLengthCount} zero-length entity segments`);
  }
  if (duplicateCount > 0) {
    errors.push(`Found ${duplicateCount} duplicate entity segments`);
  }
  if (isMfg && guideInMfgCount > 0) {
    errors.push(`Found ${guideInMfgCount} guide/preview entities in manufacturing export`);
  }
  if (sampleCutCount === 0) {
    errors.push('No specimen cut contours (ETCH_SAMPLE) found in CAD model');
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    stats: {
      mode,
      scale: '1 unit = 1 mm',
      plate: `${pw.toFixed(3)} x ${ph.toFixed(3)} mm`,
      totalSamples,
      totalEntities: entities.length,
      sampleCutCount,
      bridgeCount,
      etchRemoveCount,
      nonClosedRemoveCount,
      plateOutlineCount,
      zeroLengthCount,
      duplicateCount,
      guideInMfgCount,
    },
  };
}
