import tempfile
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def verify_packaged_handler_base64_scope():
    package_source = (
        Path(__file__).resolve().parents[1] / "build" / "package_exe.py"
    ).read_text(encoding="utf-8")
    handler_start = package_source.index("            def do_POST(self):")
    handler_end = package_source.index("        # ── 서버 / 창 시작", handler_start)
    handler_source = package_source[handler_start:handler_end]
    assert "import base64" not in handler_source, (
        "do_POST 내부 import base64는 함수 전체에서 base64를 지역 변수로 만들어 "
        "앞선 DWG 변환 분기에서 UnboundLocalError를 발생시킵니다."
    )


def main():
    verify_packaged_handler_base64_scope()
    with tempfile.TemporaryDirectory(prefix="test_oda_pipeline_") as temp_dir:
        fake = Path(temp_dir) / "fake_oda.py"
        fake.write_text(
            """import pathlib, sys
src, dst, version, kind, recurse, audit, pattern = sys.argv[1:]
assert version == 'ACAD2007'
assert kind == 'DWG'
assert recurse == '0'
assert audit == '1'
assert pattern == '*.dxf'
assert list(pathlib.Path(src).glob('*.dxf'))
pathlib.Path(dst, 'Etching_ODA_Input.dwg').write_bytes(b'AC1021' + bytes(128))
""",
            encoding="utf-8",
        )
        original = server._find_oda_file_converter
        try:
            server._find_oda_file_converter = lambda: str(fake)
            result, converter = server._convert_dxf_to_autocad2007_dwg(b"0\nEOF\n")
        finally:
            server._find_oda_file_converter = original

        assert converter == str(fake)
        assert result[:6] == b"AC1021"
        assert len(result) == 134
        print("[PASS] Packaged HTTP handler uses module-scope base64 without shadowing")
        print("[PASS] DXF -> ODA ACAD2007 DWG command, audit flag, and AC1021 validation")


if __name__ == "__main__":
    main()
