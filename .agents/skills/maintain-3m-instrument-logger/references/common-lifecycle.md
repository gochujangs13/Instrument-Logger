# Common lifecycle

## Connect

1. Open the correct transport with module-provided settings.
2. Mark the shared connection state only after opening succeeds.
3. Invoke `onConnect` before starting generic polling.
4. Honor `pollStartDelay` when initialization must finish first.
5. Prevent generic connection handling for self-managed transports such as PT-2000 WebHID.
6. Deduplicate repeated connect clicks so only one port chooser or VISA request is active.
7. Invalidate pending connection attempts on Home navigation or disconnect, and close any transport that finishes after cancellation.

## Poll

- Never interleave `READ?` or another measurement query with reset/setup commands unless the device protocol explicitly permits it.
- Avoid overlapping queries when responses are matched to a single pending callback.
- Keep generic polling optional; custom modules may own chained polling or scheduled cycles.

## Receive

- Preserve raw bytes for modules implementing `onByte`.
- Split decoded text on CR/LF without inventing missing records.
- Route custom `onLine` before grid `parseValue`.
- Treat overflow/open-circuit values separately from valid measurements.

## Disconnect

1. Stop pending polling-start timeouts and active polling intervals.
2. Invoke the module cleanup hook while transport state is still available when required.
3. Clear module timers, pending callbacks, streams, and raw buffers.
4. Close readers, writers, ports, VISA sessions, HID handles, or camera tracks.
5. Reset shared UI and connection state.

## Navigation and rebuild

- Clear temporary layout classes before building a different instrument.
- Rebuild custom and grid views through their declared hooks.
- Do not leave camera streams, phone polling, waveform timers, or test cycles running after returning home.
- Do not let a late Web Serial/VISA connection completion update a different instrument screen.
