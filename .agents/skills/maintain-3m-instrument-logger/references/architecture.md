# Architecture

## Current application

- `index.html`: integrated application shell.
- `index.js`: imports modules, builds the registry, and starts `App`.
- `core.js`: translations, state machine, serial controller, grid, chart, navigation, connection lifecycle, and shared application behavior.
- `index.css`: integrated styling and responsive layouts.
- `instruments/*.js`: current instrument and tool modules.
- `instruments/_utils.js`: shared module helpers.
- `server.py`: development HTTP/API server for camera, export, evaluation data, and VISA bridges.
- `standalone.html`, `build/build_standalone.py`, `build/package_exe.py`: distribution pipeline.

## Module shapes

Grid modules normally provide `serial`, `pollCmd`, `pollInterval`, `parseValue`, and optional lifecycle/settings hooks.

Custom modules normally provide `buildSidebar`, `buildCenter`, `buildRightPanel`, `onLine`, and lifecycle hooks. Some own their connection or polling.

Optional capabilities include dynamic `serial` getters, `onByte`, `pollStartDelay`, `noAutoConnect`, and `onRebuild`.
Non-serial custom tools such as Photo Editor and Etching Design still use the shared custom-view shell, but own their local interaction/render/export pipelines and must declare/observe an appropriate layout mode.

## Boundaries

- Keep transport and protocol details inside the module.
- Put only reusable lifecycle and UI behavior in `core.js`.
- Treat `docs/INSTRUMENT_COMMUNICATION_PROTOCOLS.md` as the communication SSOT.
- Treat `docs/SP2100_PROTOCOL_REFERENCE.md` as the SP-2100/TL-2200 parsing SSOT.
- Treat old desktop implementations as references, not current integrated code, unless `AGENTS.md` states otherwise.

## Cross-module review

Before editing `core.js`, enumerate all consumers of the affected hook or property with `rg`. Check grid, custom, Web Serial, WebHID, VISA, raw-byte, and non-serial paths separately.
