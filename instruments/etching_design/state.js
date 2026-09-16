// Etching Design — State Management with Undo / Redo and Project Serialization
import { PRESET_DEFINITIONS, getPreset } from './presets.js';
import { calculateSingleTypeGeometry, calculateMixedDesignGeometry } from './geometry.js';

const PLATE_STORAGE_KEY = '3m_etching_plate_dimensions_v1';

export class EtchingState {
  constructor() {
    this.mode = 'single'; // 'single' | 'mixed'
    this.currentPresetKey = 'TYPE_1';

    // Single Type State (initialized to Type 1)
    this.single = getPreset('TYPE_1');

    // Mixed Design State
    this.mixed = {
      plate: {
        width: 420,
        height: 197,
        material: 'SUS304',
        thickness: 0.1,
      },
      boundaryWidth: 5,
      boundaryWidths: [], // Custom gap dimensions between types: [gap0, gap1, ...]
      margin: {
        mode: 'auto',
        left: 15,
        right: 15,
        top: 4.5,
        bottom: 4.5,
      },
      alignDirection: 'horizontal', // 'horizontal' | 'vertical'
      splitDirection: 'vertical', // 'vertical' (좌/우) | 'horizontal' (상/하)
      types: [
        { ...getPreset('TYPE_1'), id: 'type1', name: 'TYPE 1 (15×6)', cols: 4, rows: 10, layout: { mode: 'fixed', columns: 4, rows: 10 } },
        { ...getPreset('TYPE_2'), id: 'type2', name: 'TYPE 2 (50×10)', cols: 3, rows: 16, layout: { mode: 'fixed', columns: 3, rows: 16 } },
        { ...getPreset('TYPE_3'), id: 'type3', name: 'TYPE 3 (40×3)', cols: 3, rows: 33, layout: { mode: 'fixed', columns: 3, rows: 33 } },
      ],
    };

    // Synchronize plate & margin so Single Mode and Mixed Mode always share plate dimensions and margins
    this.syncPlateAndMargin('mixed');
    this._loadPersistedPlateDimensions();
    this._normalizeTabFeatureWorkflow(false);

    // View & Display Toggles
    this.view = {
      zoom: 1,
      panX: 0,
      panY: 0,
      hoverIdx: -1,
      selectedIdx: -1,
      showDimensions: true,
      showOrientation: true,
      showGrid: true,
      showBoundary: true,
      showTabs: true,
      showBridges: true,
      showEtchRemove: true,
    };

    // History for Undo / Redo
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 50;

    this._listeners = new Set();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  notify() {
    for (const fn of this._listeners) {
      try { fn(this); } catch (e) { console.error(e); }
    }
  }

  snapshot() {
    return JSON.stringify({
      mode: this.mode,
      currentPresetKey: this.currentPresetKey,
      single: this.single,
      mixed: this.mixed,
      viewToggles: {
        showDimensions: this.view.showDimensions,
        showOrientation: this.view.showOrientation,
        showGrid: this.view.showGrid,
        showBoundary: this.view.showBoundary,
        showTabs: this.view.showTabs,
      },
    });
  }

  pushState() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo on new action
  }

  undo() {
    if (!this.canUndo()) return false;
    this.redoStack.push(this.snapshot());
    const prev = JSON.parse(this.undoStack.pop());
    this.restore(prev);
    this.notify();
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    this.undoStack.push(this.snapshot());
    const next = JSON.parse(this.redoStack.pop());
    this.restore(next);
    this.notify();
    return true;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  restore(data) {
    if (!data) return;
    this.mode = data.mode || 'single';
    this.currentPresetKey = data.currentPresetKey || 'CUSTOM';
    if (data.single) this.single = data.single;
    if (data.mixed) {
      this.mixed = data.mixed;
      if (!Array.isArray(this.mixed.boundaryWidths)) {
        this.mixed.boundaryWidths = [];
      }
      if (Array.isArray(this.mixed.types)) {
        this.mixed.types.forEach(t => {
          if (!t.layout) {
            t.layout = { mode: 'auto', columns: 5, rows: 15 };
          }
        });
      }
    }
    if (data.viewToggles) {
      Object.assign(this.view, data.viewToggles);
    }
    // Legacy projects stored an already-manufacturing-applied feature in
    // `feature`. Preserve it while adding a separate editable preview draft.
    this._normalizeTabFeatureWorkflow(true);
    // Maintain synchronized plate & margins across modes
    if (this.mode === 'mixed') {
      this.syncPlateAndMargin('mixed');
    } else {
      this.syncPlateAndMargin('single');
    }
    this._savePersistedPlateDimensions();
  }

  syncPlateAndMargin(source = 'single') {
    const srcPlate = source === 'single' ? this.single?.plate : this.mixed?.plate;
    const srcMargin = source === 'single' ? this.single?.margin : this.mixed?.margin;
    if (srcPlate) {
      if (!this.single.plate) this.single.plate = {};
      if (!this.mixed.plate) this.mixed.plate = {};
      this.single.plate.width = srcPlate.width;
      this.single.plate.height = srcPlate.height;
      if (srcPlate.material) {
        this.single.plate.material = srcPlate.material;
        this.mixed.plate.material = srcPlate.material;
      }
      if (srcPlate.thickness !== undefined) {
        this.single.plate.thickness = srcPlate.thickness;
        this.mixed.plate.thickness = srcPlate.thickness;
      }
      this.mixed.plate.width = srcPlate.width;
      this.mixed.plate.height = srcPlate.height;
      if (Array.isArray(this.mixed.types)) {
        this.mixed.types.forEach(t => {
          if (!t.plate) t.plate = {};
          t.plate.width = srcPlate.width;
          t.plate.height = srcPlate.height;
          if (srcPlate.material) t.plate.material = srcPlate.material;
          if (srcPlate.thickness !== undefined) t.plate.thickness = srcPlate.thickness;
        });
      }
    }
    if (srcMargin) {
      if (!this.single.margin) this.single.margin = {};
      if (!this.mixed.margin) this.mixed.margin = {};
      const mode = srcMargin.mode || 'auto';
      const left = srcMargin.left ?? 15;
      const right = srcMargin.right ?? left;
      const top = srcMargin.top ?? 4.5;
      const bottom = srcMargin.bottom ?? top;

      this.single.margin.mode = mode;
      this.single.margin.left = left;
      this.single.margin.right = right;
      this.single.margin.top = top;
      this.single.margin.bottom = bottom;

      this.mixed.margin.mode = mode;
      this.mixed.margin.left = left;
      this.mixed.margin.right = right;
      this.mixed.margin.top = top;
      this.mixed.margin.bottom = bottom;
    }
  }

  _loadPersistedPlateDimensions() {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = JSON.parse(localStorage.getItem(PLATE_STORAGE_KEY) || 'null');
      const width = Number(saved?.width);
      const height = Number(saved?.height);
      if (!(width > 0) || !(height > 0)) return;
      this.single.plate.width = width;
      this.single.plate.height = height;
      this.mixed.plate.width = width;
      this.mixed.plate.height = height;
      this.mixed.types.forEach(t => {
        if (!t.plate) t.plate = {};
        t.plate.width = width;
        t.plate.height = height;
      });
    } catch (_) {}
  }

  _savePersistedPlateDimensions() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(PLATE_STORAGE_KEY, JSON.stringify({
        width: this.single.plate.width,
        height: this.single.plate.height,
      }));
    } catch (_) {}
  }

  setPlateWidth(width, recordHistory = true) {
    const w = Math.max(1, Number(width || 0));
    if (this.single?.plate?.width === w && this.mixed?.plate?.width === w) return;
    if (recordHistory) this.pushState();
    if (!this.single.plate) this.single.plate = {};
    if (!this.mixed.plate) this.mixed.plate = {};
    this.single.plate.width = w;
    this.mixed.plate.width = w;
    if (Array.isArray(this.mixed.types)) {
      this.mixed.types.forEach(t => {
        if (!t.plate) t.plate = {};
        t.plate.width = w;
      });
    }
    this._savePersistedPlateDimensions();
    this.notify();
  }

  setPlateHeight(height, recordHistory = true) {
    const h = Math.max(1, Number(height || 0));
    if (this.single?.plate?.height === h && this.mixed?.plate?.height === h) return;
    if (recordHistory) this.pushState();
    if (!this.single.plate) this.single.plate = {};
    if (!this.mixed.plate) this.mixed.plate = {};
    this.single.plate.height = h;
    this.mixed.plate.height = h;
    if (Array.isArray(this.mixed.types)) {
      this.mixed.types.forEach(t => {
        if (!t.plate) t.plate = {};
        t.plate.height = h;
      });
    }
    this._savePersistedPlateDimensions();
    this.notify();
  }

  setMarginMode(mode = 'auto', recordHistory = true) {
    const m = mode === 'manual' ? 'manual' : 'auto';
    if (this.single?.margin?.mode === m && this.mixed?.margin?.mode === m) return;
    if (recordHistory) this.pushState();
    if (!this.single.margin) this.single.margin = {};
    if (!this.mixed.margin) this.mixed.margin = {};
    this.single.margin.mode = m;
    this.mixed.margin.mode = m;
    this.notify();
  }

  setMarginLR(val, recordHistory = true) {
    const v = Math.max(0, Number(val || 0));
    if (this.single?.margin?.left === v && this.mixed?.margin?.left === v) return;
    if (recordHistory) this.pushState();
    if (!this.single.margin) this.single.margin = {};
    if (!this.mixed.margin) this.mixed.margin = {};
    this.single.margin.left = v;
    this.single.margin.right = v;
    this.mixed.margin.left = v;
    this.mixed.margin.right = v;
    this.notify();
  }

  setMarginTB(val, recordHistory = true) {
    const v = Math.max(0, Number(val || 0));
    if (this.single?.margin?.top === v && this.mixed?.margin?.top === v) return;
    if (recordHistory) this.pushState();
    if (!this.single.margin) this.single.margin = {};
    if (!this.mixed.margin) this.mixed.margin = {};
    this.single.margin.top = v;
    this.single.margin.bottom = v;
    this.mixed.margin.top = v;
    this.mixed.margin.bottom = v;
    this.notify();
  }

  loadPreset(key) {
    this.pushState();
    const currentPlate = {
      width: this.single?.plate?.width ?? this.mixed?.plate?.width,
      height: this.single?.plate?.height ?? this.mixed?.plate?.height,
    };
    this.currentPresetKey = key;
    this.single = getPreset(key);
    this.single.plate.width = currentPlate.width;
    this.single.plate.height = currentPlate.height;
    this._normalizeTabFeatureWorkflow(false);
    this.syncPlateAndMargin('single');
    this._savePersistedPlateDimensions();
    this.notify();
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.pushState();
    this.mode = mode;
    this.notify();
  }

  autoDistributeMixedEqual() {
    this.pushState();
    const count = this.mixed.types.length;
    if (count > 0) {
      const base = Math.floor((100 / count) * 10) / 10;
      let sum = 0;
      this.mixed.types.forEach((t, i) => {
        if (i === count - 1) {
          t.targetRatio = Number((100 - sum).toFixed(1));
        } else {
          t.targetRatio = base;
          sum += base;
        }
      });
    }
    this.notify();
  }

  autoAlignMixedOrientation(dir = 'horizontal') {
    this.pushState();
    this.mixed.alignDirection = dir;
    this.mixed.types.forEach(t => {
      const w = dir === 'vertical'
        ? Math.min(t.sample.width, t.sample.height)
        : Math.max(t.sample.width, t.sample.height);
      const h = dir === 'vertical'
        ? Math.max(t.sample.width, t.sample.height)
        : Math.min(t.sample.width, t.sample.height);
      t.sample.width = w;
      t.sample.height = h;
      t.sample.orientation = 0;
    });
    this.notify();
  }

  autoAlignMixedLongHorizontal() {
    this.autoAlignMixedOrientation('horizontal');
  }

  autoAlignMixedLongVertical() {
    this.autoAlignMixedOrientation('vertical');
  }

  setSplitDirection(dir = 'vertical') {
    const validDir = dir === 'horizontal' ? 'horizontal' : 'vertical';
    if (this.mixed.splitDirection === validDir) return;
    this.pushState();
    this.mixed.splitDirection = validDir;
    this.notify();
  }

  setBoundaryWidth(width) {
    const w = Math.max(0, Number(width ?? 5));
    if (this.mixed.boundaryWidth === w && (!this.mixed.boundaryWidths || this.mixed.boundaryWidths.length === 0)) return;
    this.pushState();
    this.mixed.boundaryWidth = w;
    this.mixed.boundaryWidths = [];
    this.notify();
  }

  setIndividualBoundaryWidth(idx, width) {
    const w = Math.max(0, Number(width ?? 5));
    if (!Array.isArray(this.mixed.boundaryWidths)) {
      this.mixed.boundaryWidths = [];
    }
    while (this.mixed.boundaryWidths.length <= idx) {
      this.mixed.boundaryWidths.push(this.mixed.boundaryWidth ?? 5);
    }
    if (this.mixed.boundaryWidths[idx] === w) return;
    this.pushState();
    this.mixed.boundaryWidths[idx] = w;
    this.notify();
  }

  applyCornerToAll(cornerType = 'fillet', cornerRadius = 0.5) {
    this.pushState();
    const ct = cornerType === 'sharp' ? 'sharp' : (cornerType === 'chamfer' ? 'chamfer' : 'fillet');
    const cr = Math.max(0, Number(cornerRadius ?? 0));
    this.mixed.types.forEach(t => {
      if (!t.sample) t.sample = {};
      t.sample.cornerType = ct;
      t.sample.cornerRadius = cr;
    });
    this.notify();
  }

  setTypeLayoutMode(idx, mode = 'auto') {
    const t = this.mixed.types[idx];
    if (!t) return;
    this.pushState();
    if (!t.layout) t.layout = { mode: 'auto', columns: 5, rows: 15 };
    t.layout.mode = mode === 'fixed' ? 'fixed' : 'auto';
    if (t.layout.mode === 'auto') {
      delete t.cols;
      delete t.rows;
    }
    this.notify();
  }

  setTypeLayoutCols(idx, cols) {
    const t = this.mixed.types[idx];
    if (!t) return;
    const c = Math.max(1, parseInt(cols, 10) || 1);
    this.pushState();
    t.cols = c;
    if (!t.layout) t.layout = { mode: 'fixed', columns: c, rows: t.rows ?? 10 };
    t.layout.columns = c;
    t.layout.mode = 'fixed';
    this.notify();
  }

  setTypeCols(idx, cols) {
    this.setTypeLayoutCols(idx, cols);
  }

  setTypeLayoutRows(idx, rows) {
    const t = this.mixed.types[idx];
    if (!t) return;
    const r = Math.max(1, parseInt(rows, 10) || 1);
    this.pushState();
    t.rows = r;
    if (!t.layout) t.layout = { mode: 'fixed', columns: t.cols ?? 5, rows: r };
    t.layout.rows = r;
    t.layout.mode = 'fixed';
    this.notify();
  }

  setTypeRows(idx, rows) {
    this.setTypeLayoutRows(idx, rows);
  }

  setAllTypesLayoutMode(mode = 'auto') {
    this.pushState();
    const m = mode === 'fixed' ? 'fixed' : 'auto';
    this.mixed.types.forEach(t => {
      if (!t.layout) t.layout = { mode: m, columns: 5, rows: 15 };
      else t.layout.mode = m;
      if (m === 'auto') {
        delete t.cols;
        delete t.rows;
      }
    });
    this.notify();
  }

  addMixedType(template = null) {
    this.pushState();
    const count = this.mixed.types.length + 1;
    const isVert = this.mixed.alignDirection === 'vertical';
    const refSample = this.mixed.types[0]?.sample;
    const baseSample = template?.sample || {
      width: isVert ? 10 : 30,
      height: isVert ? 30 : 10,
      orientation: 0,
      overrideCenter: false,
      centerOrientation: 180,
      cornerType: refSample?.cornerType || 'fillet',
      cornerRadius: refSample?.cornerRadius ?? 0.5,
    };
    const newType = {
      id: `type_${Date.now()}_${count}`,
      name: `TYPE ${count} (${baseSample.width}×${baseSample.height})`,
      plate: { ...this.mixed.plate },
      sample: { ...baseSample },
      layout: { mode: 'auto', columns: 5, rows: 15 },
      gaps: { horizontalGap: 3, verticalGap: 1, separatorWidth: 3, connectorWidth: 1 },
      margin: { mode: 'auto', left: 15, right: 15, top: 4.5, bottom: 4.5 },
      tabs: {
        enabled: true,
        width: 0.5,
        length: 0.5,
        count: 2,
        position: 'center',
        feature: {
          type: 'none',
          holeDia: 0.2,
          slotWidth: 0.2,
          slotHeight: 0.2,
          posX: 'center',
          customX: 0.25,
          posY: 'center',
        },
        appliedFeature: {
          type: 'none',
          holeDia: 0.2,
          slotWidth: 0.2,
          slotHeight: 0.2,
          posX: 'center',
          customX: 0.25,
          posY: 'center',
        },
      },
      targetRatio: 0,
    };
    this.mixed.types.push(newType);
    this.autoDistributeMixedEqual();
    return newType;
  }

  setTabFeature(typeIdx, partialFeature, recordHistory = true) {
    if (recordHistory) this.pushState();
    if (typeIdx === null || typeIdx === undefined || typeIdx === 'single') {
      if (!this.single.tabs) this.single.tabs = {};
      if (!this.single.tabs.feature) {
        this.single.tabs.feature = {
          type: 'none',
          holeDia: 0.2,
          slotWidth: 0.2,
          slotHeight: 0.2,
          posX: 'center',
          customX: 0.25,
          posY: 'center',
        };
      }
      Object.assign(this.single.tabs.feature, partialFeature);
    } else {
      const t = this.mixed?.types?.[typeIdx];
      if (t) {
        if (!t.tabs) t.tabs = {};
        if (!t.tabs.feature) {
          t.tabs.feature = {
            type: 'none',
            holeDia: 0.2,
            slotWidth: 0.2,
            slotHeight: 0.2,
            posX: 'center',
            customX: 0.25,
            posY: 'center',
          };
        }
        Object.assign(t.tabs.feature, partialFeature);
      }
    }
    this.notify();
  }

  _defaultTabFeature() {
    return {
      type: 'none',
      holeDia: 0.2,
      slotWidth: 0.2,
      slotHeight: 0.2,
      posX: 'center',
      customX: 0.25,
      pointInset: 1,
      pointInsetX: 1,
      pointInsetY: 1,
      pointDistanceX: null,
      pointDistanceY: null,
      posY: 'center',
    };
  }

  _normalizeTabsFeature(tabs, migrateLegacy = false) {
    if (!tabs) return;
    if (!tabs.feature) tabs.feature = this._defaultTabFeature();
    if (!tabs.appliedFeature) {
      const source = migrateLegacy ? tabs.feature : this._defaultTabFeature();
      tabs.appliedFeature = JSON.parse(JSON.stringify(source));
    }
    for (const feature of [tabs.feature, tabs.appliedFeature]) {
      if (!feature) continue;
      if (feature.posX === 'specimen' || feature.posX === 'runner') feature.posX = 'center';
      if (feature.pointInset === undefined) feature.pointInset = 1;
      if (feature.pointInsetX === undefined) feature.pointInsetX = feature.pointInset;
      if (feature.pointInsetY === undefined) feature.pointInsetY = feature.pointInset;
      if (feature.pointDistanceX === undefined) feature.pointDistanceX = null;
      if (feature.pointDistanceY === undefined) feature.pointDistanceY = null;
    }
  }

  _normalizeTabFeatureWorkflow(migrateLegacy = false) {
    this._normalizeTabsFeature(this.single?.tabs, migrateLegacy);
    if (Array.isArray(this.mixed?.types)) {
      this.mixed.types.forEach(t => this._normalizeTabsFeature(t?.tabs, migrateLegacy));
    }
  }

  applyTabFeatureToType(typeIdx, recordHistory = true) {
    const targetTabs = (typeIdx === null || typeIdx === undefined || typeIdx === 'single')
      ? this.single?.tabs
      : this.mixed?.types?.[typeIdx]?.tabs;
    if (!targetTabs?.feature) return false;
    if (recordHistory) this.pushState();
    targetTabs.appliedFeature = JSON.parse(JSON.stringify(targetTabs.feature));
    this.notify();
    return true;
  }

  applyTabFeatureToAllTypes(sourceTypeIdx, recordHistory = true) {
    if (recordHistory) this.pushState();
    let srcTabs;
    if (sourceTypeIdx === null || sourceTypeIdx === undefined || sourceTypeIdx === 'single') {
      srcTabs = this.single?.tabs;
    } else {
      srcTabs = this.mixed?.types?.[sourceTypeIdx]?.tabs;
    }
    if (!srcTabs || !srcTabs.feature) return;
    const cloned = JSON.parse(JSON.stringify(srcTabs.feature));
    const tabW = srcTabs.width;
    const tabL = srcTabs.length;
    if (Array.isArray(this.mixed?.types)) {
      this.mixed.types.forEach(t => {
        if (!t.tabs) t.tabs = {};
        t.tabs.feature = JSON.parse(JSON.stringify(cloned));
        t.tabs.appliedFeature = JSON.parse(JSON.stringify(cloned));
        if (tabW !== undefined) t.tabs.width = tabW;
        if (tabL !== undefined) t.tabs.length = tabL;
      });
    }
    if (!this.single.tabs) this.single.tabs = {};
    this.single.tabs.feature = JSON.parse(JSON.stringify(cloned));
    this.single.tabs.appliedFeature = JSON.parse(JSON.stringify(cloned));
    if (tabW !== undefined) this.single.tabs.width = tabW;
    if (tabL !== undefined) this.single.tabs.length = tabL;
    this.notify();
  }

  removeMixedType(idx) {
    if (this.mixed.types.length <= 1) return false;
    this.pushState();
    this.mixed.types.splice(idx, 1);
    if (Array.isArray(this.mixed.boundaryWidths) && this.mixed.boundaryWidths.length > 0) {
      const bIdx = Math.min(idx, this.mixed.boundaryWidths.length - 1);
      this.mixed.boundaryWidths.splice(bIdx, 1);
    }
    this.autoDistributeMixedEqual();
    return true;
  }

  moveMixedType(fromIdx, toIdx) {
    if (fromIdx < 0 || fromIdx >= this.mixed.types.length) return false;
    if (toIdx < 0 || toIdx >= this.mixed.types.length) return false;
    if (fromIdx === toIdx) return false;
    this.pushState();
    const item = this.mixed.types.splice(fromIdx, 1)[0];
    this.mixed.types.splice(toIdx, 0, item);
    this.notify();
    return true;
  }

  getGeometry() {
    if (this.mode === 'mixed') {
      const geom = calculateMixedDesignGeometry(this.mixed);
      if (geom?.types) {
        geom.types.forEach((ct, idx) => {
          const t = this.mixed.types[idx];
          if (t && t.layout?.mode === 'auto') {
            t.cols = ct.cols;
            t.rows = ct.rows;
            if (t.layout) {
              t.layout.columns = ct.cols;
              t.layout.rows = ct.rows;
            }
          }
        });
      }
      return geom;
    }
    return calculateSingleTypeGeometry(this.single);
  }

  serializeProject() {
    return JSON.stringify({
      app: '3M_ETCHING_DESIGN',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      mode: this.mode,
      currentPresetKey: this.currentPresetKey,
      single: this.single,
      mixed: this.mixed,
    }, null, 2);
  }

  loadProject(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.app !== '3M_ETCHING_DESIGN' && !data.single) {
        throw new Error('Invalid project file format');
      }
      this.pushState();
      this.restore(data);
      this.notify();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}
