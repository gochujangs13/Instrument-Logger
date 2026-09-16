# Release workflow

## Preconditions

- Build only after an explicit user request.
- Preserve uncommitted user work and generated measurement data.
- Run the project verifier first.
- Confirm the current module registry in `index.js` instead of copying an old dist folder.

## Integrated build

Use the skill wrapper, which calls the repository build scripts with the current integrated module list:

`python .agents/skills/maintain-3m-instrument-logger/scripts/build_integrated_exe.py`

The build produces exactly one stable artifact: `dist/3M_Instrument_Logger.exe`.
The new EXE is built in a temporary output directory first and atomically replaces the existing
artifact only after the build succeeds. Older versioned `3M_Instrument_Logger*.exe` artifacts are
then removed, so a failed build preserves the last working EXE.

## Verify the artifact

- Confirm the EXE exists and has a current timestamp.
- Compute SHA-256 and file size.
- Compare source hashes with the newly generated standalone folder.
- Inspect the PyInstaller archive for `core.js`, the entry file, and all registered modules.
- Distinguish packaging success from real-instrument success.

## Report

Report the clickable EXE path, time, size, hash, included modules, PyInstaller warnings that may matter, and any outstanding hardware tests.
