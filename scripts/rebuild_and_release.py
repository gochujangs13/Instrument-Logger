# -*- coding: utf-8 -*-
"""
rebuild_and_release.py
1. Build v1.0.0-rc.6.21 (STAGE_ONLY=1) -> build_tmp/release_out/3M_Instrument_Logger.exe
2. Upload v1.0.0-rc.6.21 to GitHub Release (replacing existing asset)
3. Build local dist/3M_Instrument_Logger.exe as v1.0.0-rc.6.20 (so user can update 6.20 -> 6.21)
4. Verify both EXEs and GitHub release status.
"""
import os
import sys
import json
import ssl
import shutil
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
import updater_backend

TAG = "v1.0.0-rc.6.21"
VERSION_6_21 = "1.0.0-rc.6.21"
FILE_VERSION_6_21 = "1.0.6.21"

VERSION_6_20 = "1.0.0-rc.6.20"
FILE_VERSION_6_20 = "1.0.6.20"

RELEASE_DATE = "2026-09-21"

EXE_NAME = "3M_Instrument_Logger.exe"
STAGED_EXE = ROOT / "build_tmp" / "release_out" / EXE_NAME
LOCAL_EXE = ROOT / "dist" / EXE_NAME

DIST_NAME = "Hioki3540_Keithley2700_Keithley2400_MitutoyoVL50_Agilent4339B_DAQ6510_SP2100_PT2000_LT1000_AIPhotoEditor_PST3202_EpsonOK900P_EtchingDesign"
DIST_DIR = ROOT / "dist" / DIST_NAME

ROOT_VER_JSON = ROOT / "version.json"
DIST_VER_JSON = DIST_DIR / "version.json"

MODULES = [
    "Hioki3540", "Keithley2700", "Keithley2400", "MitutoyoVL50",
    "Agilent4339B", "DAQ6510", "SP2100", "PT2000", "LT1000",
    "AIPhotoEditor", "PST3202", "EpsonOK900P", "EtchingDesign"
]

def safe_open(req, timeout=30):
    ctx = ssl._create_unverified_context()
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except Exception:
        return urllib.request.urlopen(req, context=ctx, timeout=timeout)

def set_version(ver_str, file_ver_str):
    obj = {
        "version": ver_str,
        "releaseDate": RELEASE_DATE,
        "channel": "release-candidate",
        "fileVersion": file_ver_str
    }
    content = json.dumps(obj, indent=2, ensure_ascii=False) + "\n"
    ROOT_VER_JSON.write_text(content, encoding="utf-8")
    if DIST_DIR.exists():
        DIST_VER_JSON.write_text(content, encoding="utf-8")

def sync_standalone():
    cmd_sync = [sys.executable, str(ROOT / "build" / "build_standalone.py")] + MODULES
    res = subprocess.run(cmd_sync, cwd=str(ROOT))
    if res.returncode != 0:
        raise RuntimeError("build_standalone.py failed")

def build_exe(stage_only=False):
    env = os.environ.copy()
    if stage_only:
        env["STAGE_ONLY"] = "1"
    else:
        env.pop("STAGE_ONLY", None)
    cmd_build = [sys.executable, str(ROOT / "build" / "package_exe.py"), str(DIST_DIR)]
    res = subprocess.run(cmd_build, cwd=str(ROOT), env=env)
    if res.returncode != 0:
        raise RuntimeError("package_exe.py failed")

def verify_exe_version(exe_path, expected_ver):
    from PyInstaller.archive.readers import CArchiveReader
    r = CArchiveReader(str(exe_path))
    ver_extracted = json.loads(r.extract(r"app\version.json").decode("utf-8"))
    if ver_extracted.get("version") != expected_ver:
        raise RuntimeError(f"Verification failed: {exe_path} has {ver_extracted} instead of {expected_ver}")
    print(f"[OK] Verified {exe_path.name} internal version is {expected_ver}")

def upload_to_github():
    print(f"\n=== Uploading {TAG} asset to GitHub ===")
    cfg = updater_backend.load_config()
    repo, token = cfg["repo"], cfg["token"]
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "3M-Release-Uploader",
    }

    # 1. 릴리즈 조회
    list_req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/releases?per_page=100", headers=headers
    )
    releases = json.loads(safe_open(list_req).read().decode())
    target = next((r for r in releases if r["tag_name"] == TAG), None)
    if not target:
        raise RuntimeError(f"Release {TAG} not found on GitHub!")

    rel_id = target["id"]
    upload_base = target["upload_url"].split("{")[0]
    print(f"[1/3] Found release {TAG} ID={rel_id}")

    # 2. 기존 에셋 삭제
    for a in target.get("assets", []):
        if a["name"] == EXE_NAME:
            print(f"[*] Deleting existing asset {a['id']}...")
            dr = urllib.request.Request(
                f"https://api.github.com/repos/{repo}/releases/assets/{a['id']}",
                headers=headers, method="DELETE"
            )
            safe_open(dr)
            print("    -> Deleted.")

    # 3. 새 에셋 업로드
    print(f"[2/3] Uploading file: {STAGED_EXE}")
    fsize = STAGED_EXE.stat().st_size
    print(f"      Size: {fsize:,} bytes ({fsize/1024/1024:.2f} MB)")
    with open(STAGED_EXE, "rb") as f:
        data = f.read()

    up_req = urllib.request.Request(
        f"{upload_base}?name={EXE_NAME}",
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": "3M-Release-Uploader",
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(data)),
        },
    )
    up_resp = safe_open(up_req, timeout=300)
    asset_info = json.loads(up_resp.read().decode())
    print(f"[3/3] Upload completed! Asset ID={asset_info['id']}")

def main():
    print("==================================================================")
    print("=== [PHASE 1] BUILD AND UPLOAD v1.0.0-rc.6.21 FOR GITHUB ===")
    print("==================================================================")
    set_version(VERSION_6_21, FILE_VERSION_6_21)
    sync_standalone()
    set_version(VERSION_6_21, FILE_VERSION_6_21)
    build_exe(stage_only=True)
    verify_exe_version(STAGED_EXE, VERSION_6_21)
    upload_to_github()

    print("\n==================================================================")
    print("=== [PHASE 2] BUILD LOCAL dist/3M_Instrument_Logger.exe (v1.0.0-rc.6.20) ===")
    print("==================================================================")
    set_version(VERSION_6_20, FILE_VERSION_6_20)
    sync_standalone()
    set_version(VERSION_6_20, FILE_VERSION_6_20)
    build_exe(stage_only=False)
    verify_exe_version(LOCAL_EXE, VERSION_6_20)

    print("\n==================================================================")
    print("=== [PHASE 3] VERIFY UPDATE DETECTION ===")
    print("==================================================================")
    res = updater_backend.check_for_updates(VERSION_6_20)
    print(f"Update check for v{VERSION_6_20}: available={res.get('update_available')}, latest={res.get('latest_version')}, asset_id={res.get('asset_id')}")
    if res.get('update_available') and res.get('latest_version') == VERSION_6_21:
        print("[SUCCESS] All steps verified 100%! Ready for user testing.")
    else:
        print("[WARN] Update check returned unexpected result.")

if __name__ == "__main__":
    main()
