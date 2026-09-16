// Etching Design — Presets & Default Configurations
// Separated from Geometry Engine to allow adding new types without modifying calculation logic.

export const PRESET_DEFINITIONS = {
  TYPE_1: {
    id: 'type1',
    name: 'TYPE 1 (15×6 378EA)',
    plate: {
      width: 297,
      height: 197,
      material: 'SUS304',
      thickness: 0.1,
    },
    sample: {
      width: 15,
      height: 6,
      orientation: 0,
      overrideCenter: false,
      centerOrientation: 180,
      cornerRadius: 0.3,
      cornerType: 'fillet',
      holeDia: 0,
    },
    layout: {
      mode: 'fixed',
      columns: 14,
      rows: 27,
    },
    gaps: {
      horizontalGap: 3,
      verticalGap: 1,
      separatorWidth: 3,
      connectorWidth: 1,
    },
    margin: {
      mode: 'auto',
      left: 24,
      right: 24,
      top: 4.5,
      bottom: 4.5,
    },
    tabs: {
      enabled: true,
      width: 0.5,
      length: 0.5,
      count: 1,
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
    },
    targetColumns: 5,
  },

  TYPE_2: {
    id: 'type2',
    name: 'TYPE 2 (50×10 SUS316L)',
    plate: {
      width: 420,
      height: 200,
      material: 'SUS316L',
      thickness: 0.1,
    },
    sample: {
      width: 50,
      height: 10,
      orientation: 0,
      overrideCenter: false,
      centerOrientation: 180,
      cornerRadius: 0.5,
      cornerType: 'fillet',
      holeDia: 0,
    },
    layout: {
      mode: 'fixed',
      columns: 7,
      rows: 14,
    },
    gaps: {
      horizontalGap: 5,
      verticalGap: 1,
      separatorWidth: 5,
      connectorWidth: 1,
    },
    margin: {
      mode: 'auto',
      left: 17.5,
      right: 17.5,
      top: 10.5,
      bottom: 10.5,
    },
    tabs: {
      enabled: true,
      width: 0.5,
      length: 0.5,
      count: 1,
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
    },
    targetColumns: 3,
  },

  TYPE_3: {
    id: 'type3',
    name: 'TYPE 3 (40×3 Stiffener)',
    plate: {
      width: 420,
      height: 197,
      material: 'SUS304',
      thickness: 0.2,
    },
    sample: {
      width: 40,
      height: 3,
      orientation: 0,
      overrideCenter: false,
      centerOrientation: 180,
      cornerRadius: 0.2,
      cornerType: 'fillet',
      holeDia: 0,
    },
    layout: {
      mode: 'fixed',
      columns: 9,
      rows: 34,
    },
    gaps: {
      horizontalGap: 4,
      verticalGap: 1,
      separatorWidth: 4,
      connectorWidth: 1,
    },
    margin: {
      mode: 'auto',
      left: 14,
      right: 14,
      top: 3,
      bottom: 3,
    },
    tabs: {
      enabled: true,
      width: 0.5,
      length: 0.5,
      count: 1,
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
    },
    targetColumns: 4,
  },

  CUSTOM: {
    id: 'custom',
    name: 'CUSTOM',
    plate: {
      width: 300,
      height: 200,
      material: 'SUS304',
      thickness: 0.1,
    },
    sample: {
      width: 20,
      height: 20,
      orientation: 0,
      overrideCenter: false,
      centerOrientation: 180,
      cornerRadius: 0.5,
      cornerType: 'fillet',
      holeDia: 0,
    },
    layout: {
      mode: 'auto',
      columns: 10,
      rows: 7,
    },
    gaps: {
      horizontalGap: 4,
      verticalGap: 1,
      separatorWidth: 4,
      connectorWidth: 1,
    },
    margin: {
      mode: 'auto',
      left: 10,
      right: 10,
      top: 10,
      bottom: 10,
    },
    tabs: {
      enabled: true,
      width: 0.5,
      length: 0.5,
      count: 1,
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
    },
    targetColumns: 5,
  },
};

export function getPreset(key) {
  const normKey = (key || 'TYPE_1').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const base = PRESET_DEFINITIONS[normKey] || PRESET_DEFINITIONS.TYPE_1;
  return JSON.parse(JSON.stringify(base));
}
