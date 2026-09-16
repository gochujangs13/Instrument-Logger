# Mitutoyo VL-50

- Module: `instruments/mitutoyo_vl50.js`
- View: grid with VL-50 test modes
- Serial: 9600, 7-E-2
- Poll: `GA01\r\n` every 300 ms
- Connect command: `CS\r\n`

The active poll command is required; the device may not respond without it. Preserve five-decimal millimeter display behavior unless the user explicitly changes the reporting requirement.

The shared sidebar contains the connection controls. When controls appear intermittently, inspect responsive breakpoints and leftover custom-layout classes before changing this module.
