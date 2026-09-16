---
name: maintain-3m-instrument-logger
description: Maintain, diagnose, extend, test, document, and package the complete 3M Instrument Logger repository, including Hioki 3540, Keithley 2700, Mitutoyo VL-50, SP-2100/TL-2200, Agilent 4339B, DAQ-6510, PT-2000, LT-1000, PST-3202, Photo Editor, shared core.js behavior, Web Serial/WebHID/VISA communication, standalone distributions, and Windows EXE builds. Use for instrument integration, measurement discrepancies, protocol or parser changes, shared UI fixes, regression checks, and release packaging in this repository.
---

# Maintain 3M Instrument Logger

Maintain the complete integrated application without assuming that every module uses the same transport, parser, UI, or lifecycle.

## Start every task

1. Read the repository `AGENTS.md` completely.
2. Run `git status --short` and preserve all existing user changes and measurement data.
3. Read [references/architecture.md](references/architecture.md).
4. Identify the target in [references/instrument-routing.md](references/instrument-routing.md).
5. Read only the selected instrument reference. Read every affected reference before changing shared code.
6. Inspect the current implementation and repository SSOT before proposing or applying changes.

## Apply source priority

Use sources in this order:

1. Current user request and real-device observations.
2. Repository `AGENTS.md`.
3. `docs/INSTRUMENT_COMMUNICATION_PROTOCOLS.md` and instrument-specific SSOT.
4. Current `instruments/*.js`, `core.js`, server, and build implementation.
5. Legacy desktop or Python code only when repository guidance explicitly names it as a reference.

Never replace a verified protocol with behavior copied from another instrument.

## Route the work

- For connection, polling, disconnect, navigation, or `core.js`, read [references/common-lifecycle.md](references/common-lifecycle.md).
- For a named instrument or tool, read its file from the routing table.
- For a measurement discrepancy, timeout, intermittent connection, parser failure, or hardware-free test, read [references/diagnostic-and-test.md](references/diagnostic-and-test.md).
- For parser changes, collect representative raw responses and keep invalid/overflow handling explicit.
- For measurement discrepancies, distinguish device-front-panel values, raw received responses, parsed application values, wiring, and instrument settings.
- For standalone or EXE work, read [references/release.md](references/release.md).

## Change safely

1. Keep instrument-specific behavior in its module when an optional module property can express it.
2. Keep initialization commands separate from measurement polling.
3. Match displayed selections to the commands actually sent.
4. Clear startup timers, polling timers, pending callbacks, streams, and device handles on disconnect.
5. Do not add or change `*RST`, REL, NULL, OCOM, Auto Range, calibration, protection, output, or routing commands without documenting their measurement or safety effect.
6. Update the protocol SSOT whenever communication behavior changes.
7. Mark physical-device verification as outstanding until it is actually performed.
8. Do not rebuild an EXE unless the user explicitly requests a build.
9. Before sending a state-changing command to real hardware, report the selected device, transport, setting, command effect, and safe stop condition. Perform it only when the user has explicitly requested the operation or test.

## Choose model escalation

- Continue with the active model for documentation, routine UI work, and localized fixes.
- Recommend GPT-5.6 Sol with High reasoning before changing protocols, parsers, measurement calculations, or shared serial lifecycle behavior.
- Recommend GPT-5.6 Sol with Xhigh reasoning for unexplained real-device discrepancies, multi-instrument regressions, or broad architecture changes.
- State the recommended model, effort, and reason. Let the user change the active model; never claim it changed automatically.

## Verify

Run `python .agents/skills/maintain-3m-instrument-logger/scripts/verify_project.py` after source changes.

For instrument work, also verify:

1. The selected module loads through the local HTTP server.
2. Its parser accepts valid examples and rejects unrelated or incomplete responses.
3. Connect and disconnect paths leave no active timers or streams.
4. UI state matches the effective device settings.
5. Any hardware-dependent result is reported as unverified until tested on the instrument.
6. For a fixed bug, preserve a reproducible input, raw response, or simulator case that would have failed before the change.

For an explicitly requested integrated EXE build, run:

`python .agents/skills/maintain-3m-instrument-logger/scripts/build_integrated_exe.py`

Report the output path, creation time, size, SHA-256, included modules, and remaining real-device tests.
