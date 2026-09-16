# Instrument routing

| Target | Current module | Transport/view | Read next |
|---|---|---|---|
| Hioki 3540 | `instruments/hioki_3540.js` | Web Serial, grid | `hioki-3540.md` |
| Keithley 2700 | `instruments/keithley_2700.js` | Web Serial/SCPI, grid | `keithley-2700.md` |
| Keithley 2400 | `instruments/keithley_2400.js` | Web Serial RS-232 or VISA/GPIB/SCPI, custom | `keithley-2400.md` |
| Mitutoyo VL-50 | `instruments/mitutoyo_vl50.js` | Web Serial, grid | `mitutoyo-vl50.md` |
| SP-2100 / TL-2200 | `instruments/sp2100_logger.js` | Web Serial/raw byte, custom | `sp2100-tl2200.md` |
| Agilent 4339B | `instruments/agilent_4339b.js` | Serial or VISA/SCPI, custom | `agilent-4339b.md` |
| DAQ-6510 | `instruments/daq_6510.js` | Serial or VISA/SCPI, custom | `daq-6510.md` |
| PT-2000 | `instruments/pt2000_probe_tack.js` | WebHID, custom | `pt-2000.md` |
| LT-1000 | `instruments/lt1000_loop_tack.js` | Web Serial, custom | `lt-1000.md` |
| PST-3202 | `instruments/pst3202.js` | Web Serial/SCPI, custom | `pst-3202.md` |
| Photo Editor | `instruments/photo_editor.js` | Non-serial browser tool, custom | `photo-editor.md` |
| Etching Design | `instruments/etching_design.js` | Non-serial CAD/design tool, custom | `docs/manuals/Etching_Design.md` |

Club Expense is a retained link module but is not registered in the current integrated `index.js`. Do not add it to a release without an explicit request.
