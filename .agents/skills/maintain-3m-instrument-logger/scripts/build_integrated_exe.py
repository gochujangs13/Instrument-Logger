#!/usr/bin/env python3
"""Build the current integrated 3M Instrument Logger Windows EXE."""

from __future__ import annotations

import hashlib
import json
import re
import runpy
import subprocess
import sys
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
def run(command: list[str]) -> None:
    print("[RUN] " + " ".join(command), flush=True)
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode:
        raise SystemExit(result.returncode)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def registered_module_keys(index_source: str, instrument_map: dict[str, tuple[str, str]]) -> list[str]:
    """Return build keys in the exact order used by the integrated registry."""
    registry = re.search(r"\[([^\]]+)\]\.forEach\s*\(\s*m\s*=>", index_source, re.DOTALL)
    if not registry:
        raise SystemExit("Could not parse the integrated INSTRUMENTS registry in index.js")
    aliases = [item.strip() for item in registry.group(1).split(",") if item.strip()]
    imports = dict(re.findall(
        r"import\s+(\w+)\s+from\s+['\"](\./instruments/[^'\"]+\.js)['\"]",
        index_source,
    ))
    key_by_path = {
        Path(path).as_posix(): key
        for key, (_alias, path) in instrument_map.items()
    }
    module_keys = []
    unsupported = []
    for alias in aliases:
        imported = imports.get(alias)
        path = imported[2:] if imported and imported.startswith("./") else imported
        key = key_by_path.get(Path(path).as_posix()) if path else None
        if not key:
            unsupported.append(f"{alias} ({imported or 'missing import'})")
        else:
            module_keys.append(key)
    if unsupported:
        raise SystemExit(
            "Registered modules missing from build/build_standalone.py INSTRUMENT_MAP: "
            + ", ".join(unsupported)
        )
    return module_keys


def main() -> None:
    run([sys.executable, str(Path(__file__).with_name("verify_project.py"))])

    release = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))
    version = release.get("version")
    if not version:
        raise SystemExit("version.json is missing the version value")

    index_source = (ROOT / "index.js").read_text(encoding="utf-8")
    build_namespace = runpy.run_path(
        str(ROOT / "build" / "build_standalone.py"),
        run_name="build_standalone_definition",
    )
    instrument_map = build_namespace["INSTRUMENT_MAP"]
    collect_deps = build_namespace["collect_instrument_deps"]
    common_files = build_namespace["COMMON_FILES"]
    module_keys = registered_module_keys(index_source, instrument_map)
    dist_name = "_".join(module_keys)

    run([sys.executable, "build/build_standalone.py", *module_keys])
    standalone = ROOT / "dist" / dist_name

    copied_files = set(common_files)
    for key in module_keys:
        copied_files.update(collect_deps(instrument_map[key][1], str(ROOT)))
    for relative in sorted(copied_files):
        source = ROOT / relative
        copied = standalone / relative
        if sha256(source) != sha256(copied):
            raise SystemExit(f"Standalone source mismatch: {relative}")
    print("[OK] Standalone source hashes match")

    run([sys.executable, "build/package_exe.py", str(standalone)])
    release_exe = ROOT / "dist" / "3M_Instrument_Logger.exe"
    if not release_exe.is_file():
        raise SystemExit(f"Integrated EXE not found: {release_exe}")
    release_exes = sorted((ROOT / "dist").glob("3M_Instrument_Logger*.exe"))
    if release_exes != [release_exe]:
        raise SystemExit(
            "Expected exactly one integrated EXE, found: "
            + ", ".join(path.name for path in release_exes)
        )

    stat = release_exe.stat()
    print("[PASS] Integrated EXE built")
    print(f"Version: v{version}")
    print(f"Path: {release_exe}")
    print(f"Created: {datetime.fromtimestamp(stat.st_mtime).isoformat(sep=' ', timespec='seconds')}")
    print(f"Size: {stat.st_size} bytes ({stat.st_size / 1024 / 1024:.2f} MiB)")
    print(f"SHA256: {sha256(release_exe)}")
    print("Modules: " + ", ".join(module_keys))


if __name__ == "__main__":
    main()
