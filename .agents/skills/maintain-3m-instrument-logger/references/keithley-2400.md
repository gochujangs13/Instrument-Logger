# Keithley 2400

- Module: `instruments/keithley_2400.js`
- View: custom
- Transport: Web Serial RS-232 (9600 8-N-1, flow control none, CR command termination) or VISA ASRL/GPIB (NI-488.2/NI-VISA + PyVISA bridge). For VISA ASRL, keep write termination CR and auto-detect only the instrument reply termination (LF then CR).
- Cable: RS-232-level USB adapter with straight-through DB-9; never assume TTL UART or null-modem
- Protocol SSOT: `docs/INSTRUMENT_COMMUNICATION_PROTOCOLS.md`, section "Keithley SourceMeter 2400"
- User manual: `docs/manuals/Keithley_2400.md`
- Official command source: Keithley 2400 Series SourceMeter User's Manual 2400S-900-01

Protected behavior:

- Connection begins with `:OUTP OFF`; do not add automatic `*RST` or unsupported `:SYST:REM`.
- For VISA/GPIB, set `visaConnectWithoutIdn: true` so the server opens the session without its usual `*IDN?`; the module then sends `:OUTP OFF`, verifies OFF, and only then queries identity.
- For VISA ASRL, set `visaAsrlTermination: 'auto'`. Every read-termination probe must begin with `:OUTP OFF` and accept the candidate only after `:OUTP?` confirms OFF; do not auto-detect or change the CR write terminator.
- Remote sense uses only `:SYST:RSEN ON|OFF` plus `:SYST:RSEN?` verification.
- Serialize queries; never overlap `:READ?`, `:SYST:ERR?`, or sense verification.
- `:FORM:ELEM VOLT,CURR,TIME,STAT`; status bit 3 means real compliance and must trigger output off.
- Before an evaluation, with OUTPUT OFF verified, clear inherited measurement functions, enable concurrent VOLT/CURR measurements, and verify both functions plus the selected RSEN state. FORM:ELEM does not enable measurements: source-only fields can return setpoints. Remove inherited RES so auto-ohms cannot control the source. Apply NPLC to both V/I; only the opposite-to-source measurement uses Auto Range.
- Explicitly disable and verify source auto-clear (`:SOUR:CLE:AUTO OFF`) so host-timed evaluations keep DC applied between readings; retain all explicit stop/OFF paths. Set ARM/TRIG immediate count 1 and ASCII format for one four-field READ? response. Reject empty/truncated/multiple records, retain raw responses, and never bridge invalid graph points or hide single points.
- In Source V mode, choose the first supported hardware OVP step (20/40/60/80/100/120/160/NONE) at or above `min(210, max(20, abs(source)+10))`, show only the effective instrument OVP value, and stop/output-log OVP when status bit 4 reports it. Do not reintroduce a separate measurement-based software cutoff without explicit approval.
- Treat `±9.9E37` as overflow, not a measurement.
- Preserve the official Model 2400 hardware envelope (±210 V programming overrange, ±1.05 A, 22 W) in documentation, but cap application evaluation voltage and Voltage Compliance at ±200 V so automatic hardware OVP selection retains 10 V of headroom at the top of the range. Above 21 V cap current compliance at 0.105 A, and above 0.105 A cap voltage compliance at 21 V. Always apply the stricter `22 W / |source|` limit at rounded envelope corners.
- Electrical inputs use HTML bounds, blur-time clamping, load-time sanitization, and start-time revalidation. Do not remove any layer.
- User-entered source, Compliance, sweep, or cycle values that are clamped at blur time must show the localized `Instrument specification exceeded` modal with the Model 2400 voltage/current/power envelope and each original-to-adjusted value. Startup sanitization may remain silent so an old saved setting cannot trap the UI behind a modal.
- Treat any configuration with a maximum potential voltage of 30 V or more as a high-voltage warning condition. Keep the persistent settings notice and the pre-output acknowledgement synchronized across spot, time, sweep, and every cycle step; show the maximum potential voltage, effective Compliance/automatic OVP, insulated-fixture/interlock guidance, and OUTPUT OFF/residual-discharge warning.
- Show an Ohm's-law reference in both source modes using beginner wording: Source I says the product resistance should be at or below `Vcomp / Isource`, and Source V says it should be at or above `Vsource / Icomp`. In the same card, keep the two-row `0–21 V / above 21–200 V` maximum-current guide, highlight the current voltage range, explain that Compliance is a ceiling rather than continuously delivered current, and show the exact 22 W-aware allowed current. This is informational only and must not change measurement values or safety clamping.
- Sweep points use the same validator as spot/time settings.
- Cycle mode validates every step and uses a zero-source transition before changing compliance and applying the next source level.
- Keep the graph in the center column above the data table; the right panel is intentionally hidden for this instrument.
- Keep the two-column view width-bounded: the center column and its panels must never exceed the viewport, status cards must auto-wrap, and only the data table may use its own horizontal scrollbar.
- The visible table is one row per evaluation run, not one row per raw reading. Preserve every raw sample internally; the result row reports maximum absolute voltage, maximum absolute current, signed arithmetic mean current, maximum absolute resistance, sample count, and duration.
- Evaluation product names remain visibly editable and the edit must propagate to every raw sample in that run. Show the result date as month/day. Dashboard XLSX exports selected runs, or all runs when nothing is selected, with one native Excel combined scatter chart (voltage, current, resistance) linked directly to side-by-side numeric Raw Data blocks.
- XLSX language follows `app.lang` at save time: Korean UI produces the `대시보드` sheet and Korean dashboard/Raw Data labels; English UI produces the `Dashboard` sheet and English labels. Keep formulas, workbook defined names, and the main chart title synchronized with that sheet language.
- In the XLSX dashboard, do not use the combined chart's native legend for sample identification. Excel can ignore legend-entry deletion for the secondary scatter group and expose duplicate `Current`/`Resistance` entries. Remove the native chart legend and render exactly one colored line swatch plus sample name per run in worksheet cells above the chart.
- The centered graph plots voltage, current, and resistance using three independent colored Y-axis scales; never move it back to the right panel. Each metric has a checkbox and only checked metric curves, ticks, and axis titles are rendered. With no checked result it shows the latest run; one or more checked result rows must display all selected runs together. Encode evaluation runs by distinct colors and metrics by stroke style (voltage solid, current dashed, resistance dotted); the run legend and selected-row accent must use the same run color.
- Stop, compliance, error, disconnect, and Home navigation must all attempt `:OUTP OFF` before transport closure.
- Fresh installations default to 4-wire, while the most recent 2/4-wire choice is persisted.

Hardware verification must begin with identity and state queries, then a low-energy resistive dummy load. Do not claim cable, wiring, real compliance behavior, or output-off delivery is verified from simulator/browser tests alone.

Verified 2026-08-26 on Model 2400 S/N 1162685:

- RS-232/COM4 low-energy lifecycle and measurement suite.
- VISA ASRL/COM4 connection with LF reply termination auto-detection, output-off verification, identity, sense, and clean error-queue initialization.
- GPIB0::2::INSTR safe first-command order, identity, 4-wire application, 0.1 V/1 mA single/time/3-point sweep measurements, table/graph rendering, final output off, clean error queue, disconnect, and resource rediscovery.
- Centered graph layout, editable product names, and cycle configuration passed parser/lifecycle and browser layout checks. GPIB real-device cycle verification passed at 0.05→0.10 V, 1 mA compliance, 4-wire, 1 NPLC; output-off completion and editable-name persistence across a theme rebuild were confirmed.
- GPIB real-compliance test and a known low-resistance dummy-load/front-panel comparison remain outstanding.
