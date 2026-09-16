"""Regression checks for importing printer discovery without Pillow/pywin32."""
from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "instruments" / "epson_ok900p"

# Simulate the development server's dependency-minimal runtime. The package must
# still import its discovery controller without importing optional renderer code.
for name in list(sys.modules):
    if name == "instruments.epson_ok900p" or name.startswith("instruments.epson_ok900p."):
        del sys.modules[name]

fake_pil = types.ModuleType("PIL")
sys.modules["PIL"] = fake_pil
spec = importlib.util.spec_from_file_location(
    "instruments.epson_ok900p.printer",
    PACKAGE / "printer.py",
    submodule_search_locations=[str(PACKAGE)],
)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
try:
    spec.loader.exec_module(module)
    assert callable(module.PrinterController.get_printers)
    assert isinstance(module.PrinterController.get_printers(), list)
finally:
    sys.modules.pop("PIL", None)

print("OK900P printer discovery imports without optional Pillow/pywin32 dependencies.")
