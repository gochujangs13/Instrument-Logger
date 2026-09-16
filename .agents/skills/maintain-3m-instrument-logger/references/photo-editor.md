# Photo Editor

- Module: `instruments/photo_editor.js`
- View: custom
- Transport: none; uses file input, phone/server camera, and optional USB camera streams.

This is a tool in the integrated app, not a serial instrument.

Preserve upload, crop, rotation, auto-alignment, preview, correction, Excel export, JPEG ZIP export, phone polling, and USB camera behavior. Keep the server-first `/api/export` save path for EXE reliability and browser download only as fallback.

On disconnect or navigation, stop live polling, phone polling, and camera tracks, then remove Photo Editor layout classes. Do not restore excluded YOLO training functionality unless explicitly requested.
