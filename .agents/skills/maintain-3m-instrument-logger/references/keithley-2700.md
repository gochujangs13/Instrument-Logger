# Keithley 2700

- Module: `instruments/keithley_2700.js`
- View: grid
- Serial: 9600, 8-N-1, CRLF
- Poll: `:READ?` every 500 ms after `pollStartDelay`

Read the Keithley section of `docs/INSTRUMENT_COMMUNICATION_PROTOCOLS.md` and `Manuals/Keithley_2700_Manual.md` before protocol changes.

## Invariants

- Finish `*RST` and setup before starting `READ?` polling.
- Restore the selected `RES`/`FRES`, Auto Range, and NPLC setting after reset.
- Keep FAST/MED/SLOW mapped to the documented NPLC values.
- Do not enable REL/NULL automatically.
- Treat absolute values near `9.9E+37` as overflow, not measurements.
- Cancel delayed startup commands on disconnect.

For discrepant values, compare the front-panel reading, raw response, parsed value, 2/4-wire state, terminal selection, range, NPLC, REL, OCOM, wiring, and contact condition.
