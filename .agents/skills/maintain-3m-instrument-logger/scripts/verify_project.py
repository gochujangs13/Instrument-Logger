#!/usr/bin/env python3
"""Read-only structural and syntax checks for 3M Instrument Logger."""

from __future__ import annotations

import functools
import http.server
import re
import shutil
import subprocess
import sys
import threading
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
REQUIRED = [
    "index.html",
    "index.js",
    "index.css",
    "core.js",
    "standalone.html",
    "server.py",
    "build/build_standalone.py",
    "build/package_exe.py",
    "docs/INSTRUMENT_COMMUNICATION_PROTOCOLS.md",
]
NODE_TESTS = [
    "scripts/test_layout_contract.mjs",
    "scripts/test_keithley_2400.mjs",
    "scripts/test_keithley_2400_lifecycle.mjs",
    "scripts/test_serial_controller_disconnect.mjs",
    "scripts/test_etch_remove_geometry.mjs",
    "scripts/test_etching_advanced_features.mjs",
    "scripts/test_etching_corner_features.mjs",
    "scripts/test_etching_custom_gaps.mjs",
    "scripts/test_etching_dwg_dxf_export.mjs",
    "tests/test_etching_geometry.mjs",
    "scripts/test_etching_i18n.mjs",
    "scripts/test_etching_manufacturing_export.mjs",
    "scripts/test_etching_mixed_margins.mjs",
    "scripts/test_etching_split_direction.mjs",
    "scripts/test_acad_dwg.mjs",
]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *args: object) -> None:
        pass


def fail(message: str) -> None:
    print(f"[FAIL] {message}", file=sys.stderr)
    raise SystemExit(1)


def run_checked(command: list[str]) -> None:
    # Node test output may include Korean and CAD symbols. Decode explicitly as
    # UTF-8 so the verifier works on Windows systems whose console defaults to
    # CP949 and does not lose the child process result while reading its pipes.
    result = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
    )
    if result.returncode:
        sys.stderr.write(result.stdout)
        sys.stderr.write(result.stderr)
        fail("Command failed: " + " ".join(command))


def main() -> None:
    missing = [path for path in REQUIRED if not (ROOT / path).is_file()]
    if missing:
        fail("Missing required files: " + ", ".join(missing))

    node = shutil.which("node")
    if not node:
        fail("Node.js is required for JavaScript syntax checks")

    js_files = sorted(
        path for path in ROOT.rglob("*.js")
        if not any(part in {"dist", "build_tmp", "Backups", "node_modules"} for part in path.parts)
    )
    for path in js_files:
        run_checked([node, "--check", str(path)])
    print(f"[OK] JavaScript syntax: {len(js_files)} files")

    available_tests = [path for path in NODE_TESTS if (ROOT / path).is_file()]
    for path in available_tests:
        run_checked([node, path])
    print(f"[OK] Instrument behavior tests: {len(available_tests)} files")

    py_files = sorted(
        path for path in ROOT.rglob("*.py")
        if not any(part in {"dist", "build_tmp", "Backups", "__pycache__"} for part in path.parts)
    )
    for path in py_files:
        try:
            compile(path.read_text(encoding="utf-8"), str(path), "exec")
        except Exception as exc:
            fail(f"Python syntax: {path.relative_to(ROOT)}: {exc}")
    print(f"[OK] Python syntax: {len(py_files)} files")

    index_source = (ROOT / "index.js").read_text(encoding="utf-8")
    imports = re.findall(r"from\s+['\"](\./[^'\"]+)['\"]", index_source)
    module_paths = sorted({item[2:] for item in imports})
    missing_imports = [path for path in module_paths if not (ROOT / path).is_file()]
    if missing_imports:
        fail("Missing index.js imports: " + ", ".join(missing_imports))
    print(f"[OK] index.js imports: {len(module_paths)} files")

    paths = ["index.html", "index.js", "index.css", "core.js", *module_paths]
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.server_port}/"
        for path in paths:
            with urllib.request.urlopen(base + path, timeout=5) as response:
                body = response.read()
                if response.status != 200 or not body:
                    fail(f"HTTP smoke failed: {path}")
    finally:
        server.shutdown()
        server.server_close()
    print(f"[OK] HTTP smoke: {len(paths)} files")

    print("[PASS] Project verification completed")


if __name__ == "__main__":
    main()
