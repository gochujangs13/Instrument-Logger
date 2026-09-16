// Etching Design — Geometry Engine (Source of Truth)
// Calculates exact mm geometry for single and mixed etching designs.
// Supports: Plate, Sample, Orientation, Center Override, Separators, Connectors, Tabs, Mixed Optimization.

export const ORIENTATIONS = {
  UP: 0,
  RIGHT: 90,
  DOWN: 180,
  LEFT: 270,
};

export function getEffectiveSize(width, height, orientation) {
  const norm = ((Math.round(orientation) % 360) + 360) % 360;
  if (norm === 90 || norm === 270) {
    return { width: height, height: width, swapped: true, rotation: norm };
  }
  return { width, height, swapped: false, rotation: norm };
}

export function getOrientationDirection(orientation) {
  const norm = ((Math.round(orientation) % 360) + 360) % 360;
  if (norm === 90) return 'right';
  if (norm === 180) return 'down';
  if (norm === 270) return 'left';
  return 'up';
}

export function isCenterSample(col, row, totalCols, totalRows) {
  // 0-indexed center check
  if (totalCols % 2 === 1 && totalRows % 2 === 1) {
    const centerCol = Math.floor(totalCols / 2);
    const centerRow = Math.floor(totalRows / 2);
    return col === centerCol && row === centerRow;
  }
  // Even rows/cols: upper-left center as default fallback
  const cC = Math.floor((totalCols - 1) / 2);
  const cR = Math.floor((totalRows - 1) / 2);
  return col === cC && row === cR;
}

/**
 * Builds cutting segments for sample taking corner radius/chamfer and tabs into account.
 */
export function buildSampleCutSegments(x, y, w, h, cornerType, cornerRadius, hasTabs, tw) {
  let cType = cornerType === 'chamfer' ? 'chamfer' : (cornerType === 'sharp' ? 'sharp' : 'fillet');
  let r = Math.max(0, Number(cornerRadius ?? 0));
  const maxR = Math.min(w, h) / 2;
  r = Math.min(r, maxR);

  if (hasTabs && tw > 0) {
    const maxTabR = Math.max(0, (h - tw) / 2 - 0.05);
    r = Math.min(r, maxTabR);
  }

  if (r <= 0.01) {
    cType = 'sharp';
    r = 0;
  }

  const segments = [];
  const tabY1 = Number((y + h / 2 - tw / 2).toFixed(4));
  const tabY2 = Number((y + h / 2 + tw / 2).toFixed(4));

  // 1. Straight segments
  segments.push({
    x1: Number((x + r).toFixed(4)),
    y1: Number((y + h).toFixed(4)),
    x2: Number((x + w - r).toFixed(4)),
    y2: Number((y + h).toFixed(4)),
    edge: 'top',
  });

  segments.push({
    x1: Number((x + r).toFixed(4)),
    y1: Number(y.toFixed(4)),
    x2: Number((x + w - r).toFixed(4)),
    y2: Number(y.toFixed(4)),
    edge: 'bottom',
  });

  if (hasTabs) {
    segments.push({
      x1: Number(x.toFixed(4)),
      y1: Number((y + r).toFixed(4)),
      x2: Number(x.toFixed(4)),
      y2: tabY1,
      edge: 'left_lower',
    });
    segments.push({
      x1: Number(x.toFixed(4)),
      y1: tabY2,
      x2: Number(x.toFixed(4)),
      y2: Number((y + h - r).toFixed(4)),
      edge: 'left_upper',
    });
    segments.push({
      x1: Number((x + w).toFixed(4)),
      y1: Number((y + r).toFixed(4)),
      x2: Number((x + w).toFixed(4)),
      y2: tabY1,
      edge: 'right_lower',
    });
    segments.push({
      x1: Number((x + w).toFixed(4)),
      y1: tabY2,
      x2: Number((x + w).toFixed(4)),
      y2: Number((y + h - r).toFixed(4)),
      edge: 'right_upper',
    });
  } else {
    segments.push({
      x1: Number(x.toFixed(4)),
      y1: Number((y + r).toFixed(4)),
      x2: Number(x.toFixed(4)),
      y2: Number((y + h - r).toFixed(4)),
      edge: 'left',
    });
    segments.push({
      x1: Number((x + w).toFixed(4)),
      y1: Number((y + r).toFixed(4)),
      x2: Number((x + w).toFixed(4)),
      y2: Number((y + h - r).toFixed(4)),
      edge: 'right',
    });
  }

  // 2. Corner segments
  if (cType === 'chamfer' && r > 0) {
    segments.push({
      x1: Number(x.toFixed(4)),
      y1: Number((y + r).toFixed(4)),
      x2: Number((x + r).toFixed(4)),
      y2: Number(y.toFixed(4)),
      edge: 'corner_bl',
    });
    segments.push({
      x1: Number((x + w - r).toFixed(4)),
      y1: Number(y.toFixed(4)),
      x2: Number((x + w).toFixed(4)),
      y2: Number((y + r).toFixed(4)),
      edge: 'corner_br',
    });
    segments.push({
      x1: Number((x + w).toFixed(4)),
      y1: Number((y + h - r).toFixed(4)),
      x2: Number((x + w - r).toFixed(4)),
      y2: Number((y + h).toFixed(4)),
      edge: 'corner_tr',
    });
    segments.push({
      x1: Number((x + r).toFixed(4)),
      y1: Number((y + h).toFixed(4)),
      x2: Number(x.toFixed(4)),
      y2: Number((y + h - r).toFixed(4)),
      edge: 'corner_tl',
    });
  } else if (cType === 'fillet' && r > 0) {
    const N = 4;
    const addArc = (cx, cy, startA, endA, edge) => {
      for (let i = 0; i < N; i++) {
        const a1 = startA + (endA - startA) * (i / N);
        const a2 = startA + (endA - startA) * ((i + 1) / N);
        segments.push({
          x1: Number((cx + r * Math.cos(a1)).toFixed(4)),
          y1: Number((cy + r * Math.sin(a1)).toFixed(4)),
          x2: Number((cx + r * Math.cos(a2)).toFixed(4)),
          y2: Number((cy + r * Math.sin(a2)).toFixed(4)),
          edge,
        });
      }
    };
    addArc(x + r, y + r, Math.PI, 1.5 * Math.PI, 'corner_bl');
    addArc(x + w - r, y + r, 1.5 * Math.PI, 2 * Math.PI, 'corner_br');
    addArc(x + w - r, y + h - r, 0, 0.5 * Math.PI, 'corner_tr');
    addArc(x + r, y + h - r, 0.5 * Math.PI, Math.PI, 'corner_tl');
  }

  return { segments, safeR: r, cornerType: cType };
}

/**
 * Single Type Layout Calculation (Core Engine)
 */
export function calculateSingleTypeGeometry(params) {
  const plateW = Math.max(0.1, Number(params.plate?.width ?? 297));
  const plateH = Math.max(0.1, Number(params.plate?.height ?? 197));

  const sampleW = Math.max(0.1, Number(params.sample?.width ?? 15));
  const sampleH = Math.max(0.1, Number(params.sample?.height ?? 6));
  const mainOrientation = Number(params.sample?.orientation ?? 0);
  const overrideCenter = Boolean(params.sample?.overrideCenter);
  const centerOrientation = Number(params.sample?.centerOrientation ?? 180);
  const cornerType = params.sample?.cornerType || (Number(params.sample?.cornerRadius ?? 0) > 0 ? 'fillet' : 'sharp');
  const cornerRadius = Number(params.sample?.cornerRadius ?? 0.3);

  const eff = getEffectiveSize(sampleW, sampleH, mainOrientation);
  const effW = eff.width;
  const effH = eff.height;

  const hGap = Math.max(0, Number(params.gaps?.horizontalGap ?? params.gaps?.separatorWidth ?? 3));
  const vGap = Math.max(0, Number(params.gaps?.verticalGap ?? params.gaps?.connectorWidth ?? 1));

  const marginMode = params.margin?.mode || 'auto';
  let manualLeft = Math.max(0, Number(params.margin?.left ?? 0));
  let manualRight = Math.max(0, Number(params.margin?.right ?? 0));
  let manualTop = Math.max(0, Number(params.margin?.top ?? 0));
  let manualBottom = Math.max(0, Number(params.margin?.bottom ?? 0));

  let cols = Math.max(1, parseInt(params.layout?.columns ?? 14, 10));
  let rows = Math.max(1, parseInt(params.layout?.rows ?? 27, 10));
  const layoutMode = params.layout?.mode || 'fixed'; // 'fixed' | 'auto'

  // Auto count calculation
  if (layoutMode === 'auto') {
    const usableW = Math.max(0, plateW - (marginMode === 'manual' ? (manualLeft + manualRight) : 0));
    const usableH = Math.max(0, plateH - (marginMode === 'manual' ? (manualTop + manualBottom) : 0));

    cols = Math.max(1, Math.floor((usableW + hGap) / (effW + hGap)));
    rows = Math.max(1, Math.floor((usableH + vGap) / (effH + vGap)));
  }

  // Exact used width and height
  const usedWidth = Number((cols * effW + (cols - 1) * hGap).toFixed(4));
  const usedHeight = Number((rows * effH + (rows - 1) * vGap).toFixed(4));

  let leftMargin = manualLeft;
  let rightMargin = manualRight;
  let topMargin = manualTop;
  let bottomMargin = manualBottom;

  if (marginMode === 'auto') {
    const hMargin = Number(((plateW - usedWidth) / 2).toFixed(4));
    const vMargin = Number(((plateH - usedHeight) / 2).toFixed(4));
    leftMargin = hMargin;
    rightMargin = hMargin;
    topMargin = vMargin;
    bottomMargin = vMargin;
  }

  const overflowW = Number(Math.max(0, usedWidth - plateW).toFixed(4));
  const overflowH = Number(Math.max(0, usedHeight - plateH).toFixed(4));
  const isOverflow = overflowW > 0 || overflowH > 0 || leftMargin < 0 || topMargin < 0;

  // Generate Sample Objects (Bottom-left origin standard mm: X 0->W, Y 0->H)
  const startX = leftMargin;
  const startY = bottomMargin;

  const samples = [];
  const tabCfg = params.tabs || { enabled: true, width: 0.5, length: 0.5, count: 2, position: 'center' };
  const hasTabs = tabCfg.enabled !== false && Number(tabCfg.width ?? 0.5) > 0;
  const tw = Math.max(0.1, Number(tabCfg.width ?? 0.5));
  const tl = Math.max(0.1, Number(tabCfg.length ?? (hGap > 0 ? hGap : 0.5)));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isCtr = overrideCenter && isCenterSample(c, r, cols, rows);
      const rot = isCtr ? centerOrientation : mainOrientation;
      const sEff = getEffectiveSize(sampleW, sampleH, rot);
      const dir = getOrientationDirection(rot);

      const x = Number((startX + c * (effW + hGap)).toFixed(4));
      const y = Number((startY + r * (effH + vGap)).toFixed(4));
      const w = Number(sEff.width.toFixed(4));
      const h = Number(sEff.height.toFixed(4));

      const sampleObj = {
        id: `sample_${c}_${r}`,
        typeId: params.typeId || 'type1',
        row: r,
        column: c,
        totalRows: rows,
        totalCols: cols,
        vGap: vGap,
        hGap: hGap,
        x,
        y,
        width: w,
        height: h,
        nominalWidth: sampleW,
        nominalHeight: sampleH,
        rotation: rot,
        orientationOverride: isCtr,
        direction: dir,
        tabs: [],
        cutSegments: [],
      };

      // Generate Tabs (0.5mm width micro-joint holding tab at edge center) & Cut Segments
      if (hasTabs) {
        sampleObj.tabs.push({
          edge: 'left',
          x1: Number((x - tl).toFixed(4)),
          y1: Number((y + h / 2 - tw / 2).toFixed(4)),
          x2: x,
          y2: Number((y + h / 2 + tw / 2).toFixed(4)),
          width: tw,
          length: tl,
          count: tabCfg.count || 1,
          feature: tabCfg.appliedFeature ? JSON.parse(JSON.stringify(tabCfg.appliedFeature)) : null,
        });
        sampleObj.tabs.push({
          edge: 'right',
          x1: Number((x + w).toFixed(4)),
          y1: Number((y + h / 2 - tw / 2).toFixed(4)),
          x2: Number((x + w + tl).toFixed(4)),
          y2: Number((y + h / 2 + tw / 2).toFixed(4)),
          width: tw,
          length: tl,
          count: tabCfg.count || 1,
          feature: tabCfg.appliedFeature ? JSON.parse(JSON.stringify(tabCfg.appliedFeature)) : null,
        });
        const cutRes = buildSampleCutSegments(x, y, w, h, cornerType, cornerRadius, hasTabs, tw);
        sampleObj.cornerType = cutRes.cornerType;
        sampleObj.cornerRadius = cutRes.safeR;
        sampleObj.cutSegments = cutRes.segments;
      } else {
        const cutRes = buildSampleCutSegments(x, y, w, h, cornerType, cornerRadius, false, 0);
        sampleObj.cornerType = cutRes.cornerType;
        sampleObj.cornerRadius = cutRes.safeR;
        sampleObj.cutSegments = cutRes.segments;
      }

      samples.push(sampleObj);
    }
  }

  // Generate Separators (Vertical strips between columns)
  const separators = [];
  for (let c = 0; c < cols - 1; c++) {
    const sepX = Number((startX + (c + 1) * effW + c * hGap).toFixed(4));
    separators.push({
      id: `sep_${c}`,
      x: sepX,
      y: startY,
      width: hGap,
      height: usedHeight,
    });
  }

  // Connectors: In chemical etching sheets, specimens are held exclusively by 0.5mm tabs to vertical runners.
  // No horizontal metal connectors exist between sample rows (cut slit is continuous).
  const connectors = [];

  const totalSamples = samples.length;
  const plateArea = Number((plateW * plateH).toFixed(2));
  const usedArea = Number((usedWidth * usedHeight).toFixed(2));
  const sampleArea = Number((totalSamples * effW * effH).toFixed(2));
  const yieldPct = plateArea > 0 ? Number(((sampleArea / plateArea) * 100).toFixed(2)) : 0;
  const scrapPct = Number(Math.max(0, 100 - yieldPct).toFixed(2));
  const unusedWidth = Number(Math.max(0, plateW - usedWidth).toFixed(4));
  const unusedHeight = Number(Math.max(0, plateH - usedHeight).toFixed(4));

  return {
    plate: { width: plateW, height: plateH },
    sample: {
      nominalWidth: sampleW,
      nominalHeight: sampleH,
      effectiveWidth: effW,
      effectiveHeight: effH,
      orientation: mainOrientation,
      overrideCenter,
      centerOrientation,
    },
    layout: {
      mode: layoutMode,
      columns: cols,
      rows,
    },
    gaps: {
      horizontalGap: hGap,
      verticalGap: vGap,
      separatorWidth: hGap,
      connectorWidth: vGap,
    },
    margins: {
      mode: marginMode,
      left: leftMargin,
      right: rightMargin,
      top: topMargin,
      bottom: bottomMargin,
    },
    usedWidth,
    usedHeight,
    isOverflow,
    overflow: {
      width: overflowW,
      height: overflowH,
    },
    totalSamples,
    samples,
    separators,
    connectors,
    boundaries: [],
    summary: {
      plateArea,
      usedArea,
      sampleArea,
      yieldPct,
      scrapPct,
      unusedWidth,
      unusedHeight,
    },
  };
}

/**
 * Helper to build an individual specimen in mixed design
 */
function buildMixedSampleObject(ct, idx, c, r, x, y) {
  const overrideCenter = Boolean(ct.sample?.overrideCenter);
  const centerOrient = Number(ct.sample?.centerOrientation ?? 180);
  const mainOrient = Number(ct.sample?.orientation ?? 0);
  const isCtr = overrideCenter && isCenterSample(c, r, ct.cols, ct.rows);
  const rot = isCtr ? centerOrient : mainOrient;
  const sEff = getEffectiveSize(ct.sample.width, ct.sample.height, rot);
  const dir = getOrientationDirection(rot);

  const ctCornerType = ct.sample?.cornerType || (Number(ct.sample?.cornerRadius ?? 0) > 0 ? 'fillet' : 'sharp');
  const ctCornerRadius = Number(ct.sample?.cornerRadius ?? 0.3);

  const w = Number(sEff.width.toFixed(4));
  const h = Number(sEff.height.toFixed(4));

  const sampleObj = {
    id: `${ct.id || 'type' + (idx + 1)}_${c}_${r}`,
    typeId: ct.id || `type${idx + 1}`,
    typeName: ct.name || `TYPE ${idx + 1}`,
    row: r,
    column: c,
    totalRows: ct.rows,
    totalCols: ct.cols,
    vGap: Number(ct.vGap ?? ct.gaps?.verticalGap ?? 1.0),
    hGap: Number(ct.hGap ?? ct.gaps?.horizontalGap ?? 3.0),
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    width: w,
    height: h,
    nominalWidth: ct.sample.width,
    nominalHeight: ct.sample.height,
    rotation: rot,
    orientationOverride: isCtr,
    direction: dir,
    tabs: [],
  };

  // Tabs & Cut Segments
  const tabCfg = ct.tabs || { enabled: true, width: 0.5, length: 0.5, count: 2, position: 'center' };
  const hasTabs = tabCfg.enabled !== false && Number(tabCfg.width ?? 0.5) > 0;
  const tw = Math.max(0.1, Number(tabCfg.width ?? 0.5));
  const tl = Math.max(0.1, Number(tabCfg.length ?? (ct.hGap > 0 ? ct.hGap : 0.5)));

  if (hasTabs) {
    sampleObj.tabs.push({
      edge: 'left',
      x1: Number((x - tl).toFixed(4)),
      y1: Number((y + h / 2 - tw / 2).toFixed(4)),
      x2: x,
      y2: Number((y + h / 2 + tw / 2).toFixed(4)),
      width: tw,
      length: tl,
      count: tabCfg.count || 1,
      feature: tabCfg.appliedFeature ? JSON.parse(JSON.stringify(tabCfg.appliedFeature)) : null,
    });
    sampleObj.tabs.push({
      edge: 'right',
      x1: Number((x + w).toFixed(4)),
      y1: Number((y + h / 2 - tw / 2).toFixed(4)),
      x2: Number((x + w + tl).toFixed(4)),
      y2: Number((y + h / 2 + tw / 2).toFixed(4)),
      width: tw,
      length: tl,
      count: tabCfg.count || 1,
      feature: tabCfg.appliedFeature ? JSON.parse(JSON.stringify(tabCfg.appliedFeature)) : null,
    });
    const cutRes = buildSampleCutSegments(x, y, w, h, ctCornerType, ctCornerRadius, hasTabs, tw);
    sampleObj.cornerType = cutRes.cornerType;
    sampleObj.cornerRadius = cutRes.safeR;
    sampleObj.cutSegments = cutRes.segments;
  } else {
    const cutRes = buildSampleCutSegments(x, y, w, h, ctCornerType, ctCornerRadius, false, 0);
    sampleObj.cornerType = cutRes.cornerType;
    sampleObj.cornerRadius = cutRes.safeR;
    sampleObj.cutSegments = cutRes.segments;
  }

  return sampleObj;
}

export function getBoundaryWidth(params, idx) {
  if (Array.isArray(params?.boundaryWidths) && params.boundaryWidths[idx] !== undefined) {
    const v = Number(params.boundaryWidths[idx]);
    if (!isNaN(v) && v >= 0) return v;
  }
  return Math.max(0, Number(params?.boundaryWidth ?? 5));
}

/**
 * Mixed Design Layout Optimizer & Generator
 * Supports:
 * - Vertical Split (좌 / 우 열 분할, columns)
 * - Horizontal Split (상 / 중 / 하 행 분할, rows)
 */
export function calculateMixedDesignGeometry(params) {
  const plateW = Math.max(0.1, Number(params.plate?.width ?? 420));
  const plateH = Math.max(0.1, Number(params.plate?.height ?? 197));

  const types = params.types || [];
  if (!types.length) {
    return calculateSingleTypeGeometry(params);
  }

  const splitDir = params.splitDirection || 'vertical';

  // In quantity-matched layout, distribution ratio is automatically derived from rows/cols;
  const hasDirectCounts = types.some(t => t.layout?.mode === 'fixed');
  const rawTotalRatio = Number(types.reduce((sum, t) => sum + Number(t.targetRatio || 0), 0).toFixed(1));
  const totalRatio = hasDirectCounts ? 100 : rawTotalRatio;
  const ratioValid = hasDirectCounts ? true : (Math.abs(totalRatio - 100) < 0.05);

  const boundaryWidth = Math.max(0, Number(params.boundaryWidth ?? 5));
  const numBoundaries = Math.max(0, types.length - 1);

  const leftMargin = Math.max(0, Number(params.margin?.left ?? 15));
  const rightMargin = Math.max(0, Number(params.margin?.right ?? 15));
  const tMarginT = Math.max(0, Number(params.margin?.top ?? 4.5));
  const tMarginB = Math.max(0, Number(params.margin?.bottom ?? 4.5));
  const isAutoMargin = (params.margin?.mode ?? 'auto') === 'auto';

  // ══════════════════════════════════════════════════════════════════════════
  // BRANCH A: HORIZONTAL SPLIT (상 / 중 / 하 가로 행 분할)
  // ══════════════════════════════════════════════════════════════════════════
  if (splitDir === 'horizontal') {
    const totalBoundaryH = numBoundaries > 0
      ? Array.from({ length: numBoundaries }, (_, i) => getBoundaryWidth(params, i)).reduce((a, b) => a + b, 0)
      : 0;
    const availH = Math.max(0, plateH - tMarginT - tMarginB - totalBoundaryH);
    const availW = Math.max(0, plateW - leftMargin - rightMargin);

    const computedTypes = [];

    // Pass 1: 각 타입의 시편 크기 및 후보 행/열 산출
    types.forEach((t, idx) => {
      const configuredRatio = Number(t.targetRatio || 0);
      const ratio = configuredRatio > 0 ? configuredRatio : (100 / Math.max(1, types.length));
      const targetH = availH * (ratio / 100);

      let sW = Math.max(0.1, Number(t.sample?.width ?? 15));
      let sH = Math.max(0.1, Number(t.sample?.height ?? 6));
      const orient = Number(t.sample?.orientation ?? 0);

      const alignDir = params.alignDirection || 'horizontal';
      if (alignDir === 'vertical') {
        if (sW > sH && (orient === 0 || orient === 180)) {
          const tmp = sW; sW = sH; sH = tmp;
        }
      } else {
        if (sW < sH && (orient === 0 || orient === 180)) {
          const tmp = sW; sW = sH; sH = tmp;
        }
      }
      const eff = getEffectiveSize(sW, sH, orient);

      const hGap = Math.max(0, Number(t.gaps?.horizontalGap ?? 3));
      const vGap = Math.max(0, Number(t.gaps?.verticalGap ?? 1));

      let defaultCols = Math.max(1, Math.floor((availW + hGap) / (eff.width + hGap)));
      let defaultRows = Math.max(1, Math.floor((targetH + vGap) / (eff.height + vGap)));
      const isFixed = t.layout?.mode === 'fixed';
      let cols = isFixed
        ? Math.max(1, parseInt(t.cols ?? t.layout?.columns ?? defaultCols, 10))
        : defaultCols;
      let rows = isFixed
        ? Math.max(1, parseInt(t.rows ?? t.layout?.rows ?? defaultRows, 10))
        : defaultRows;

      const typeUsedW = cols * eff.width + (cols - 1) * hGap;
      const typeUsedH = rows * eff.height + (rows - 1) * vGap;

      computedTypes.push({
        ...t,
        isFixed,
        sample: {
          ...(t.sample || {}),
          width: sW,
          height: sH,
        },
        effW: eff.width,
        effH: eff.height,
        cols,
        rows,
        typeUsedW,
        typeUsedH,
        hGap,
        vGap,
        targetH,
        targetRatio: ratio,
      });
    });

    // Pass 2: 전체 시트 가용 높이(availH)를 초과하지 않도록 자동 배분 조정 (고정 타입 제외)
    let currentTotalH = computedTypes.reduce((acc, ct) => acc + ct.typeUsedH, 0);

    // 초과 시: 목표 높이 대비 초과량이 가장 큰 타입부터 행(rows) 감소
    while (currentTotalH > availH) {
      let worstIdx = -1;
      let maxExcess = -Infinity;
      computedTypes.forEach((ct, i) => {
        if (!ct.isFixed && ct.rows > 1) {
          const excess = ct.typeUsedH - ct.targetH;
          if (excess > maxExcess) {
            maxExcess = excess;
            worstIdx = i;
          }
        }
      });
      if (worstIdx === -1) break;
      const ct = computedTypes[worstIdx];
      ct.rows -= 1;
      ct.typeUsedH = ct.rows * ct.effH + (ct.rows - 1) * ct.vGap;
      currentTotalH = computedTypes.reduce((acc, c) => acc + c.typeUsedH, 0);
    }

    // 여유 공간이 있을 때: 가용 높이 안에서 목표 비율에 더 가깝게 행(rows) 추가 배분 (고정 타입 제외)
    let improved = true;
    while (improved) {
      improved = false;
      let bestIdx = -1;
      let bestImprovement = 0;

      computedTypes.forEach((ct, i) => {
        if (ct.isFixed) return;
        const addedH = ct.effH + ct.vGap;
        if (currentTotalH + addedH <= availH) {
          const curDiff = Math.abs((ct.typeUsedH / (currentTotalH || 1)) * 100 - ct.targetRatio);
          const newTotalH = currentTotalH + addedH;
          const newDiff = Math.abs(((ct.typeUsedH + addedH) / newTotalH) * 100 - ct.targetRatio);
          const improvement = curDiff - newDiff;
          if (improvement > bestImprovement) {
            bestImprovement = improvement;
            bestIdx = i;
          }
        }
      });

      if (bestIdx !== -1 && bestImprovement > 0) {
        const ct = computedTypes[bestIdx];
        ct.rows += 1;
        ct.typeUsedH = ct.rows * ct.effH + (ct.rows - 1) * ct.vGap;
        currentTotalH = computedTypes.reduce((acc, c) => acc + c.typeUsedH, 0);
        improved = true;
      }
    }

    // Step 2-2: 가용 높이(availH) 내에 추가 행을 배분할 공간이 남아있을 때,
    // 목표 비율과의 제곱 오차 합을 최소화하는 타입에 추가 행을 배분하여 원판 공간 채움 극대화 (고정 타입 제외)
    let canFillH = true;
    while (canFillH) {
      canFillH = false;
      let bestIdx = -1;
      let minSquareError = Infinity;

      computedTypes.forEach((ct, i) => {
        if (ct.isFixed) return;
        const addedH = ct.effH + ct.vGap;
        if (currentTotalH + addedH <= availH) {
          const nextTotalH = currentTotalH + addedH;
          let sumSq = 0;
          computedTypes.forEach((t, j) => {
            const tH = (j === i) ? (t.typeUsedH + addedH) : t.typeUsedH;
            const ratio = (tH / nextTotalH) * 100;
            sumSq += Math.pow(ratio - t.targetRatio, 2);
          });
          if (sumSq < minSquareError) {
            minSquareError = sumSq;
            bestIdx = i;
          }
        }
      });

      if (bestIdx !== -1) {
        const ct = computedTypes[bestIdx];
        ct.rows += 1;
        ct.typeUsedH = ct.rows * ct.effH + (ct.rows - 1) * ct.vGap;
        currentTotalH = computedTypes.reduce((acc, c) => acc + c.typeUsedH, 0);
        canFillH = true;
      }
    }

    // Pass 3: Layout Positioning (상단 TYPE 1 -> 중단 TYPE 2 -> 하단 TYPE 3)
    const remainingH = plateH - currentTotalH - totalBoundaryH;
    const topPad = isAutoMargin && remainingH > 0
      ? Number((remainingH / 2).toFixed(4))
      : tMarginT;
    let currentTopY = Number((plateH - topPad).toFixed(4));

    const totalAllocatedH = currentTotalH;
    const allSamples = [];
    const allSeparators = [];
    const allConnectors = [];
    const boundaries = [];
    let totalPlateSamples = 0;
    let totalSampleArea = 0;

    const totalPlateSpecimens = computedTypes.reduce((acc, c) => acc + (c.cols * c.rows), 0);
    computedTypes.forEach((ct, idx) => {
      const count = ct.cols * ct.rows;
      const actualRatio = totalPlateSpecimens > 0 ? Number(((count / totalPlateSpecimens) * 100).toFixed(1)) : 0;
      ct.actualRatio = actualRatio;
      ct.targetRatio = actualRatio;

      const typeStartY = Number((currentTopY - ct.typeUsedH).toFixed(4));
      const remainingTypeW = plateW - ct.typeUsedW;
      const typeStartX = isAutoMargin && remainingTypeW > 0
        ? Number((remainingTypeW / 2).toFixed(4))
        : leftMargin;

      const typeSamples = [];
      for (let r = 0; r < ct.rows; r++) {
        for (let c = 0; c < ct.cols; c++) {
          const x = Number((typeStartX + c * (ct.effW + ct.hGap)).toFixed(4));
          const y = Number((typeStartY + r * (ct.effH + ct.vGap)).toFixed(4));
          const sampleObj = buildMixedSampleObject(ct, idx, c, r, x, y);
          typeSamples.push(sampleObj);
          allSamples.push(sampleObj);
        }
      }

      // Separators for this type (vertical strips between columns)
      for (let c = 0; c < ct.cols - 1; c++) {
        allSeparators.push({
          id: `${ct.id}_sep_${c}`,
          typeId: ct.id,
          x: Number((typeStartX + (c + 1) * ct.effW + c * ct.hGap).toFixed(4)),
          y: typeStartY,
          width: ct.hGap,
          height: ct.typeUsedH,
        });
      }

      // Horizontal Split: allConnectors remain empty (no horizontal metal bones between rows)

      ct.samples = typeSamples;
      ct.sampleCount = typeSamples.length;
      ct.bounds = {
        x: typeStartX,
        y: typeStartY,
        width: ct.typeUsedW,
        height: ct.typeUsedH,
      };

      totalPlateSamples += typeSamples.length;
      totalSampleArea += typeSamples.length * (ct.effW * ct.effH);

      // Add horizontal boundary below this type if not the last type
      if (idx < computedTypes.length - 1) {
        const bH = getBoundaryWidth(params, idx);
        const boundaryY = Number((typeStartY - bH).toFixed(4));
        boundaries.push({
          id: `boundary_${idx}`,
          index: idx,
          x: 0,
          y: boundaryY,
          width: plateW,
          height: bH,
          dimension: bH,
          orientation: 'horizontal',
          between: [ct.id || `type${idx + 1}`, computedTypes[idx + 1].id || `type${idx + 2}`],
          type1Name: ct.name || `TYPE ${idx + 1}`,
          type2Name: computedTypes[idx + 1].name || `TYPE ${idx + 2}`,
        });
        currentTopY = boundaryY;
      } else {
        currentTopY = typeStartY;
      }
    });

    const maxUsedWidth = Number(Math.max(...computedTypes.map(c => c.typeUsedW), 0).toFixed(4));
    const totalUsedHeight = Number((totalAllocatedH + totalBoundaryH).toFixed(4));

    const overflowW = Number(Math.max(0, maxUsedWidth + leftMargin + rightMargin - plateW).toFixed(4));
    const overflowH = Number(Math.max(0, totalUsedHeight + tMarginT + tMarginB - plateH).toFixed(4));
    const isOverflow = overflowW > 0 || overflowH > 0;

    const plateArea = Number((plateW * plateH).toFixed(2));
    const yieldPct = plateArea > 0 ? Number(((totalSampleArea / plateArea) * 100).toFixed(2)) : 0;
    const scrapPct = Number(Math.max(0, 100 - yieldPct).toFixed(2));
    const unusedWidth = Number(Math.max(0, plateW - maxUsedWidth).toFixed(4));
    const unusedHeight = Number(Math.max(0, plateH - totalUsedHeight).toFixed(4));

    return {
      plate: { width: plateW, height: plateH },
      isMixed: true,
      splitDirection: 'horizontal',
      ratioValid,
      totalRatio,
      types: computedTypes,
      boundaries,
      samples: allSamples,
      separators: allSeparators,
      connectors: allConnectors,
      usedWidth: maxUsedWidth,
      usedHeight: totalUsedHeight,
      isOverflow,
      overflow: {
        width: overflowW,
        height: overflowH,
      },
      totalSamples: totalPlateSamples,
      margins: {
        left: leftMargin,
        right: rightMargin,
        top: tMarginT,
        bottom: tMarginB,
      },
      summary: {
        plateArea,
        usedArea: Number((maxUsedWidth * totalUsedHeight).toFixed(2)),
        sampleArea: Number(totalSampleArea.toFixed(2)),
        yieldPct,
        scrapPct,
        unusedWidth,
        unusedHeight,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BRANCH B: VERTICAL SPLIT (좌 / 우 세로 열 분할 — 기본 방식)
  // ══════════════════════════════════════════════════════════════════════════
  const totalBoundaryW = numBoundaries > 0
    ? Array.from({ length: numBoundaries }, (_, i) => getBoundaryWidth(params, i)).reduce((a, b) => a + b, 0)
    : 0;
  const availW = Math.max(0, plateW - leftMargin - rightMargin - totalBoundaryW);
  const availH = Math.max(0, plateH - tMarginT - tMarginB);

  // Optimization: For each type, determine optimal column and row count
  const computedTypes = [];

  // Pass 1: 각 타입의 시편 크기(1번 타입처럼 가로 긴 방향으로 자동 셋팅) 및 후보 컬럼/행 산출
  types.forEach((t, idx) => {
    const configuredRatio = Number(t.targetRatio || 0);
    const ratio = configuredRatio > 0 ? configuredRatio : (100 / Math.max(1, types.length));
    const targetW = availW * (ratio / 100);

    let sW = Math.max(0.1, Number(t.sample?.width ?? 15));
    let sH = Math.max(0.1, Number(t.sample?.height ?? 6));
    const orient = Number(t.sample?.orientation ?? 0);

    // 1번 타입처럼 가로/세로 방향 자동 셋팅 (Long side horizontal or vertical)
    const alignDir = params.alignDirection || 'horizontal';
    if (alignDir === 'vertical') {
      if (sW > sH && (orient === 0 || orient === 180)) {
        const tmp = sW;
        sW = sH;
        sH = tmp;
      }
    } else {
      if (sW < sH && (orient === 0 || orient === 180)) {
        const tmp = sW;
        sW = sH;
        sH = tmp;
      }
    }
    const eff = getEffectiveSize(sW, sH, orient);

    const hGap = Math.max(0, Number(t.gaps?.horizontalGap ?? 3));
    const vGap = Math.max(0, Number(t.gaps?.verticalGap ?? 1));

      let defaultRows = Math.max(1, Math.floor((availH + vGap) / (eff.height + vGap)));
      let defaultCols = Math.max(1, Math.floor((targetW + hGap) / (eff.width + hGap)));
      const isFixed = t.layout?.mode === 'fixed';
      let cols = isFixed
        ? Math.max(1, parseInt(t.cols ?? t.layout?.columns ?? defaultCols, 10))
        : defaultCols;
      let rows = isFixed
        ? Math.max(1, parseInt(t.rows ?? t.layout?.rows ?? defaultRows, 10))
        : defaultRows;

    let typeUsedH = rows * eff.height + (rows - 1) * vGap;
    let typeUsedW = cols * eff.width + (cols - 1) * hGap;

    computedTypes.push({
      ...t,
      isFixed,
      sample: {
        ...(t.sample || {}),
        width: sW,
        height: sH,
      },
      effW: eff.width,
      effH: eff.height,
      cols,
      rows,
      typeUsedW,
      typeUsedH,
      hGap,
      vGap,
      targetW,
      targetRatio: ratio,
    });
  });

  // Pass 2: 전체 시트 가용 폭(availW)을 초과하지 않도록 자동 배분 조정 (고정 타입 제외)
  let currentTotalW = computedTypes.reduce((acc, ct) => acc + ct.typeUsedW, 0);

  // 초과 시: 목표 폭 대비 초과량이 가장 큰 타입부터 컬럼 감소
  while (currentTotalW > availW) {
    let worstIdx = -1;
    let maxExcess = -Infinity;
    computedTypes.forEach((ct, i) => {
      if (!ct.isFixed && ct.cols > 1) {
        const excess = ct.typeUsedW - ct.targetW;
        if (excess > maxExcess) {
          maxExcess = excess;
          worstIdx = i;
        }
      }
    });
    if (worstIdx === -1) break;
    const ct = computedTypes[worstIdx];
    ct.cols -= 1;
    ct.typeUsedW = ct.cols * ct.effW + (ct.cols - 1) * ct.hGap;
    currentTotalW = computedTypes.reduce((acc, c) => acc + c.typeUsedW, 0);
  }

  // 여유 공간이 있을 때: 가용 폭 안에서 목표 비율에 더 가깝게 컬럼 추가 배분 (고정 타입 제외)
  let improved = true;
  while (improved) {
    improved = false;
    let bestIdx = -1;
    let bestImprovement = 0;

    computedTypes.forEach((ct, i) => {
      if (ct.isFixed) return;
      const addedW = ct.effW + ct.hGap;
      if (currentTotalW + addedW <= availW) {
        const curDiff = Math.abs((ct.typeUsedW / (currentTotalW || 1)) * 100 - ct.targetRatio);
        const newTotalW = currentTotalW + addedW;
        const newDiff = Math.abs(((ct.typeUsedW + addedW) / newTotalW) * 100 - ct.targetRatio);
        const improvement = curDiff - newDiff;
        if (improvement > bestImprovement) {
          bestImprovement = improvement;
          bestIdx = i;
        }
      }
    });

    if (bestIdx !== -1 && bestImprovement > 0) {
      const ct = computedTypes[bestIdx];
      ct.cols += 1;
      ct.typeUsedW = ct.cols * ct.effW + (ct.cols - 1) * ct.hGap;
      currentTotalW = computedTypes.reduce((acc, c) => acc + c.typeUsedW, 0);
      improved = true;
    }
  }

  // Step 2-2: 가용 폭(availW) 내에 추가 컬럼을 배분할 여유 공간이 남아있을 때,
  // 목표 비율과의 제곱 오차 합을 최소화하는 타입에 추가 컬럼을 배분하여 원판 공간 채움 극대화 (고정 타입 제외)
  let canFillW = true;
  while (canFillW) {
    canFillW = false;
    let bestIdx = -1;
    let minSquareError = Infinity;

    computedTypes.forEach((ct, i) => {
      if (ct.isFixed) return;
      const addedW = ct.effW + ct.hGap;
      if (currentTotalW + addedW <= availW) {
        const nextTotalW = currentTotalW + addedW;
        let sumSq = 0;
        computedTypes.forEach((t, j) => {
          const tW = (j === i) ? (t.typeUsedW + addedW) : t.typeUsedW;
          const ratio = (tW / nextTotalW) * 100;
          sumSq += Math.pow(ratio - t.targetRatio, 2);
        });
        if (sumSq < minSquareError) {
          minSquareError = sumSq;
          bestIdx = i;
        }
      }
    });

    if (bestIdx !== -1) {
      const ct = computedTypes[bestIdx];
      ct.cols += 1;
      ct.typeUsedW = ct.cols * ct.effW + (ct.cols - 1) * ct.hGap;
      currentTotalW = computedTypes.reduce((acc, c) => acc + c.typeUsedW, 0);
      canFillW = true;
    }
  }

  // 전체 시트 가로 중앙 자동 정렬 (Auto Center)
  const remainingW = plateW - currentTotalW - totalBoundaryW;
  let startX = isAutoMargin && remainingW > 0
    ? Number((remainingW / 2).toFixed(4))
    : leftMargin;
  let currentX = startX;

  const totalAllocatedW = currentTotalW;
  const allSamples = [];
  const allSeparators = [];
  const allConnectors = [];
  const boundaries = [];
  let totalPlateSamples = 0;
  let totalSampleArea = 0;

  const totalPlateSpecimens = computedTypes.reduce((acc, c) => acc + (c.cols * c.rows), 0);
  computedTypes.forEach((ct, idx) => {
    const count = ct.cols * ct.rows;
    const actualRatio = totalPlateSpecimens > 0 ? Number(((count / totalPlateSpecimens) * 100).toFixed(1)) : 0;
    ct.actualRatio = actualRatio;
    ct.targetRatio = actualRatio;

    const typeStartX = currentX;
    const startY = Number(((plateH - ct.typeUsedH) / 2).toFixed(4)); // Vertical auto-center for type

    const typeSamples = [];
    for (let r = 0; r < ct.rows; r++) {
      for (let c = 0; c < ct.cols; c++) {
        const x = Number((typeStartX + c * (ct.effW + ct.hGap)).toFixed(4));
        const y = Number((startY + r * (ct.effH + ct.vGap)).toFixed(4));
        const sampleObj = buildMixedSampleObject(ct, idx, c, r, x, y);
        typeSamples.push(sampleObj);
        allSamples.push(sampleObj);
      }
    }

    // Separators for this type
    for (let c = 0; c < ct.cols - 1; c++) {
      allSeparators.push({
        id: `${ct.id}_sep_${c}`,
        typeId: ct.id,
        x: Number((typeStartX + (c + 1) * ct.effW + c * ct.hGap).toFixed(4)),
        y: startY,
        width: ct.hGap,
        height: ct.typeUsedH,
      });
    }

    // Vertical Split: allConnectors remain empty (no horizontal metal bones between rows)

    ct.samples = typeSamples;
    ct.sampleCount = typeSamples.length;
    ct.bounds = {
      x: typeStartX,
      y: startY,
      width: ct.typeUsedW,
      height: ct.typeUsedH,
    };

    totalPlateSamples += typeSamples.length;
    totalSampleArea += typeSamples.length * (ct.effW * ct.effH);

    currentX += ct.typeUsedW;

    // Add Boundary if not last type
    if (idx < computedTypes.length - 1) {
      const bW = getBoundaryWidth(params, idx);
      boundaries.push({
        id: `boundary_${idx}`,
        index: idx,
        x: currentX,
        y: 0,
        width: bW,
        height: plateH,
        dimension: bW,
        orientation: 'vertical',
        between: [ct.id || `type${idx + 1}`, computedTypes[idx + 1].id || `type${idx + 2}`],
        type1Name: ct.name || `TYPE ${idx + 1}`,
        type2Name: computedTypes[idx + 1].name || `TYPE ${idx + 2}`,
      });
      currentX += bW;
    }
  });

  const totalUsedWidth = Number((currentX - startX).toFixed(4));
  const maxUsedHeight = Number(Math.max(...computedTypes.map(c => c.typeUsedH), 0).toFixed(4));

  const overflowW = Number(Math.max(0, currentX + rightMargin - plateW).toFixed(4));
  const overflowH = Number(Math.max(0, maxUsedHeight - plateH).toFixed(4));
  const isOverflow = overflowW > 0 || overflowH > 0;

  const plateArea = Number((plateW * plateH).toFixed(2));
  const yieldPct = plateArea > 0 ? Number(((totalSampleArea / plateArea) * 100).toFixed(2)) : 0;
  const scrapPct = Number(Math.max(0, 100 - yieldPct).toFixed(2));
  const unusedWidth = Number(Math.max(0, plateW - (currentX + rightMargin)).toFixed(4));
  const unusedHeight = Number(Math.max(0, plateH - maxUsedHeight).toFixed(4));

  return {
    plate: { width: plateW, height: plateH },
    isMixed: true,
    splitDirection: 'vertical',
    ratioValid,
    totalRatio,
    types: computedTypes,
    boundaries,
    samples: allSamples,
    separators: allSeparators,
    connectors: allConnectors,
    usedWidth: totalUsedWidth,
    usedHeight: maxUsedHeight,
    isOverflow,
    overflow: {
      width: overflowW,
      height: overflowH,
    },
    totalSamples: totalPlateSamples,
    margins: {
      left: leftMargin,
      right: rightMargin,
      top: tMarginT,
      bottom: tMarginB,
    },
    summary: {
      plateArea,
      usedArea: Number((totalUsedWidth * maxUsedHeight).toFixed(2)),
      sampleArea: Number(totalSampleArea.toFixed(2)),
      yieldPct,
      scrapPct,
      unusedWidth,
      unusedHeight,
    },
  };
}
