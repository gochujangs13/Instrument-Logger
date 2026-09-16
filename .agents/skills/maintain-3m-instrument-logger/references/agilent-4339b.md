# Agilent 4339B

- Module: `instruments/agilent_4339b.js`
- View: custom
- Serial fallback: 9600, 8-N-1
- Primary laboratory path may use VISA/GPIB through the local API bridge.

Read the Agilent section of `docs/INSTRUMENT_COMMUNICATION_PROTOCOLS.md` and `Manuals/Agilent_4339B_Manual.md` before changing SCPI sequences.

Do not assume the Web Serial and PyVISA workflows are interchangeable. Preserve charge delay, test voltage, current limit/range, trigger sequence, output shutdown, overflow handling, sample naming, grouping, and box-whisker behavior. Require real-device verification for SCPI changes.
