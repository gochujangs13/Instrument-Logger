# Diagnostic and test workflow

## Collect evidence before changing code

1. Record the expected result, observed result, affected instrument, transport, settings, time, and repeatability.
2. Capture the exact command and raw bytes or text response when transport access exists. Preserve error queues and logs.
3. Classify the failure boundary before proposing a fix:
   - device front panel, wiring, terminal mode, or instrument configuration;
   - transport open/write/read, timeout, framing, or encoding;
   - command sequence, pending query, or polling overlap;
   - parser, units, range, overflow, or stale record handling;
   - application state, timer, UI display, persistence, or export.
4. Trace a bad displayed or saved value backwards through UI state, parsed value, raw response, command sequence, and device configuration. Do not fix a symptom while the earlier boundary remains unexamined.

## Make the smallest evidence-backed change

- State the hypothesis and the observation that would disprove it.
- Change one boundary at a time where possible. Keep protocol changes separate from UI cleanup or refactoring.
- Do not turn timeouts into arbitrary long delays without proving an initialization or device-processing requirement.
- Do not hide invalid input, overflow, or an error response by converting it into a valid-looking measurement.
- Preserve the raw response in diagnostic logging when a parser rejects it; do not log credentials or sensitive file contents.

## Test without hardware when possible

Use deterministic parser or transport tests before requesting a physical test. Cover only cases relevant to the instrument being changed:

- valid response and expected unit/scaling;
- CR, LF, CRLF, partial line, or raw-byte framing where applicable;
- device error, overrange/open-circuit, malformed response, and unrelated response;
- delayed response, read timeout, pending-query overlap, and disconnect during an operation;
- reconnect after a failed open or read;
- persisted record and CSV/Excel/export behavior when the change affects data.

Use an in-process fake transport or captured response fixtures. Never claim that a simulator proves a physical device, cable, GPIB adapter, or fixture is working.

## Test real hardware safely

1. Start with connection discovery and read-only identity/status queries.
2. Confirm address/port, baud/data/parity/stop bits, line ending, front/rear or local/remote mode, and selected measurement function.
3. Report any command that can alter output, range, relay routing, protection, reset, REL/NULL, calibration, or instrument state before sending it.
4. Define the stop path before a timed or output-enabled test: output off, stop polling, close transport, and restore any temporary setting when appropriate.
5. Compare front-panel value, raw response, parsed value, displayed value, and saved value. Record which layers were actually observed.

## Completion rule

Report what was verified, the commands or fixtures used, and what remains hardware-dependent. Do not call a communication or measurement fix complete solely because code compiles, a UI renders, or a simulator passes.
