# -*- coding: utf-8 -*-
"""
build_and_publish_6_14.py
1. Build v1.0.0-rc.6.13 into dist/3M_Instrument_Logger.exe with the new fixed updater_gui.ps1.
2. Build v1.0.0-rc.6.14 into build_tmp/release_out/ with STAGE_ONLY=1.
3. Upload v1.0.0-rc.6.14 to GitHub Release v1.0.0-rc.6.14.
4. Keep local dist/3M_Instrument_Logger.exe and version.json at v1.0.0-rc.6.13.
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

TAG = "v1.0.0-rc.6.14"
VERSION_STR = "1.0.0-rc.6.14"
FILE_VERSION_STR = "1.0.6.14"
RELEASE_DATE = "2026-09-18"

BASE_VERSION_STR = "1.0.0-rc.6.13"
BASE_FILE_VERSION_STR = "1.0.6.13"

EXE_NAME = "3M_Instrument_Logger.exe"
STAGED_EXE = ROOT / "build_tmp" / "release_out" / EXE_NAME
LOCAL_EXE = ROOT / "dist" / EXE_NAME

DIST_NAME = "Hioki3540_Keithley2700_Keithley2400_MitutoyoVL50_Agilent4339B_DAQ6510_SP2100_PT2000_LT1000_AIPhotoEditor_PST3202_EpsonOK900P_EtchingDesign"
DIST_DIR = ROOT / "dist" / DIST_NAME

ROOT_VER_JSON = ROOT / "version.json"
DIST_VER_JSON = DIST_DIR / "version.json"

BODY = (
    "## 3M Instrument Logger v1.0.0-rc.6.14\n\n"
    "### 업데이트 시스템 실기 검증 릴리즈 (v6.13 ➔ v6.14 무중단 자동 갱신 검증)\n\n"
    "1. **'Failed to load Python DLL' 에러 영구 해결**\n"
    "   - PyInstaller onefile이 재실행될 때 부모 프로세스의 `_MEIPASS2` 환경변수가 상속되어 삭제된 임시 폴더를 참조하는 문제 원천 차단\n"
    "   - `UseShellExecute = $false` 및 `ProcessStartInfo.EnvironmentVariables`에서 `_MEI*`, `PYI*`, `PYTHONPATH`, `PYTHONHOME` 완전 소거 후 깨끗한 독립 프로세스로 기동\n\n"
    "2. **기존 안정화 내역 포함 (v6.7 ~ v6.13)**\n"
    "   - 실시간 다운로드 게이지 폴링 및 3초 카운트다운\n"
    "   - 팝업창 최상위 포커스 고정\n"
    "   - 10종 계측기 + 3종 소프트웨어(Photo Editor, Epson OK900P, Etching Design) 최신 코드 탑재"
)

def safe_open(req, timeout=30):
    ctx = ssl._create_unverified_context()
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except Exception:
        return urllib.request.urlopen(req, context=ctx, timeout=timeout)

def sync_modules():
    modules = [
        "Hioki3540", "Keithley2700", "Keithley2400", "MitutoyoVL50",
        "Agilent4339B", "DAQ6510", "SP2100", "PT2000", "LT1000",
        "AIPhotoEditor", "PST3202", "EpsonOK900P", "EtchingDesign"
    ]
    cmd_sync = [sys.executable, str(ROOT / "build" / "build_standalone.py")] + modules
    res = subprocess.run(cmd_sync, cwd=str(ROOT))
    if res.returncode != 0:
        raise RuntimeError("build_standalone.py failed")

def main():
    print(f"=== [Step 1] Build local {BASE_VERSION_STR} with fixed updater_gui.ps1 ===")
    base_ver_obj = {
        "version": BASE_VERSION_STR,
        "releaseDate": RELEASE_DATE,
        "channel": "release-candidate",
        "fileVersion": BASE_FILE_VERSION_STR
    }
    base_ver_json = json.dumps(base_ver_obj, indent=2, ensure_ascii=False) + "\n"
    ROOT_VER_JSON.write_text(base_ver_json, encoding="utf-8")
    if DIST_DIR.exists():
        DIST_VER_JSON.write_text(base_ver_json, encoding="utf-8")

    sync_modules()
    DIST_VER_JSON.write_text(base_ver_json, encoding="utf-8")

    # Build local EXE without STAGE_ONLY (replaces dist/3M_Instrument_Logger.exe)
    env = os.environ.copy()
    env.pop("STAGE_ONLY", None)
    cmd_build = [sys.executable, str(ROOT / "build" / "package_exe.py"), str(DIST_DIR)]
    res = subprocess.run(cmd_build, cwd=str(ROOT), env=env)
    if res.returncode != 0:
        raise RuntimeError("package_exe.py for local 6.13 failed")

    local_size = LOCAL_EXE.stat().st_size
    print(f"[OK] Local {BASE_VERSION_STR} built: {LOCAL_EXE} ({local_size:,} bytes)")

    # Verify updater_gui.ps1 in local EXE
    from PyInstaller.archive.readers import CArchiveReader
    r = CArchiveReader(str(LOCAL_EXE))
    k = [x for x in r.toc.keys() if "updater_gui" in x][0]
    ps1_code = r.extract(k).decode("utf-8")
    if "UseShellExecute = $false" not in ps1_code:
        raise RuntimeError("VERIFICATION FAILED: Local EXE does not contain UseShellExecute = $false!")
    print("[OK] Verified local EXE contains fixed updater_gui.ps1 (UseShellExecute = $false)")

    # ── Step 2: Build 6.14 with STAGE_ONLY ──
    print(f"\n=== [Step 2] Build {VERSION_STR} with STAGE_ONLY=1 ===")
    new_ver_obj = {
        "version": VERSION_STR,
        "releaseDate": RELEASE_DATE,
        "channel": "release-candidate",
        "fileVersion": FILE_VERSION_STR
    }
    new_ver_json = json.dumps(new_ver_obj, indent=2, ensure_ascii=False) + "\n"
    ROOT_VER_JSON.write_text(new_ver_json, encoding="utf-8")
    if DIST_DIR.exists():
        DIST_VER_JSON.write_text(new_ver_json, encoding="utf-8")

    sync_modules()
    DIST_VER_JSON.write_text(new_ver_json, encoding="utf-8")

    try:
        env_stage = os.environ.copy()
        env_stage["STAGE_ONLY"] = "1"
        res = subprocess.run(cmd_build, cwd=str(ROOT), env=env_stage)
        if res.returncode != 0:
            raise RuntimeError("package_exe.py for staged 6.14 failed")

        if not STAGED_EXE.exists():
            raise RuntimeError(f"Expected staged EXE not found at {STAGED_EXE}")

        staged_size = STAGED_EXE.stat().st_size
        print(f"[OK] Staged EXE built successfully: {STAGED_EXE} ({staged_size:,} bytes)")

    finally:
        # Restore local version.json back to 6.13
        print(f"\n=== [Step 3] Restore local version.json back to {BASE_VERSION_STR} ===")
        ROOT_VER_JSON.write_text(base_ver_json, encoding="utf-8")
        if DIST_DIR.exists():
            DIST_VER_JSON.write_text(base_ver_json, encoding="utf-8")
        print(f"[OK] Local version.json restored to {BASE_VERSION_STR}.")

    # ── Step 4: Upload 6.14 to GitHub ──
    print(f"\n=== [Step 4] Uploading {TAG} to GitHub ===")
    cfg = updater_backend.load_config()
    repo, token = cfg["repo"], cfg["token"]
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "3M-Release-Uploader",
    }

    # 1. 릴리즈 조회 또는 생성
    list_req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/releases", headers=headers
    )
    releases = json.loads(safe_open(list_req).read().decode())
    target = next((r for r in releases if r["tag_name"] == TAG), None)

    if target:
        print(f"[1/3] 기존 릴리즈 발견 ID={target['id']}")
    else:
        print(f"[1/3] 새 릴리즈 {TAG} 생성 중...")
        payload = json.dumps({
            "tag_name": TAG,
            "name": f"3M Instrument Logger {TAG}",
            "body": BODY,
            "draft": False,
            "prerelease": False,
            "make_latest": "true"
        }).encode()
        cr = urllib.request.Request(
            f"https://api.github.com/repos/{repo}/releases",
            data=payload,
            headers={**headers, "Content-Type": "application/json"},
        )
        target = json.loads(safe_open(cr).read().decode())
        print(f"    -> 생성 완료 ID={target['id']}")

    rel_id = target["id"]
    upload_base = target["upload_url"].split("{")[0]

    # 2. 기존 동일 이름 에셋 삭제
    for a in target.get("assets", []):
        if a["name"] == EXE_NAME:
            print(f"[*] 기존 에셋 {a['id']} 삭제 중...")
            dr = urllib.request.Request(
                f"https://api.github.com/repos/{repo}/releases/assets/{a['id']}",
                headers=headers, method="DELETE"
            )
            safe_open(dr)
            print("    -> 삭제 완료")

    # 3. 에셋 업로드
    print(f"[2/3] 업로드할 파일: {STAGED_EXE}")
    fsize = STAGED_EXE.stat().st_size
    print(f"      크기: {fsize:,} bytes ({fsize/1024/1024:.2f} MB)")
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
    up_resp = safe_open(up_req, timeout=180)
    asset_info = json.loads(up_resp.read().decode())
    print(f"[3/3] 에셋 업로드 완료! ID={asset_info['id']}, URL={asset_info['browser_download_url']}")
    print("\n🎉 모든 작업이 성공적으로 완료되었습니다!")

if __name__ == "__main__":
    main()
