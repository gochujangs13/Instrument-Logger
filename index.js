import Hioki3540     from './instruments/hioki_3540.js';
import Keithley2700  from './instruments/keithley_2700.js';
import MitutoyoVL50  from './instruments/mitutoyo_vl50.js';
import Agilent4339B  from './instruments/agilent_4339b.js';
import DAQ6510       from './instruments/daq_6510.js';
import SP2100        from './instruments/sp2100_logger.js';
import PT2000        from './instruments/pt2000_probe_tack.js';
import LT1000        from './instruments/lt1000_loop_tack.js';
import AIPhotoEditor from './instruments/ai_photo_editor.js';
import ClubExpense   from './instruments/club_expense.js';
import { App }       from './core.js';

// ── Instrument registry ───────────────────────────────────────────────────────
// To add a new instrument: create instruments/your_device.js and import it here.
const INSTRUMENTS = {};
[Hioki3540, Keithley2700, MitutoyoVL50, Agilent4339B, DAQ6510, SP2100, PT2000, LT1000,
 AIPhotoEditor, ClubExpense].forEach(m => {
  INSTRUMENTS[m.name] = m;
});

// ── Boot ──────────────────────────────────────────────────────────────────────
window.app = new App(INSTRUMENTS);

window.addEventListener('resize', () => {
  if (app.instr?.viewType === 'grid') app._redrawChart();
});

// ── Responsive scale ──────────────────────────────────────────────────────────
(function () {
  const REF_W = 1600;
  const MIN_Z = 0.6, MAX_Z = 1.6;
  function apply() {
    const ratio = window.innerWidth / REF_W;
    const zoom = Math.max(MIN_Z, Math.min(MAX_Z, ratio));
    document.documentElement.style.zoom = zoom;
  }
  apply();
  window.addEventListener('resize', apply);
})();
