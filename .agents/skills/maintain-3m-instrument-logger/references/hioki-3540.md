# Hioki 3540

- Module: `instruments/hioki_3540.js`
- View: grid
- Serial: 9600, 8-N-1
- Poll: `RMES\r` every 400 ms

Read the Hioki section of `docs/INSTRUMENT_COMMUNICATION_PROTOCOLS.md` and the current module before editing commands or parsing.

Preserve the instrument-specific range and sample-rate commands. Keep four-wire behavior fixed as documented. Test valid measurement responses, non-measurement responses, and open/invalid conditions separately.
