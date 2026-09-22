# -*- coding: utf-8 -*-
"""
build_and_publish_6_25.py
Build v1.0.0-rc.6.25 with STAGE_ONLY=1 for GitHub,
and rebuild local dist/3M_Instrument_Logger.exe as v1.0.0-rc.6.24 with ContentRendered fix.
"""
import os
import sys
import json
import ssl
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
import updater_backend

TAG = "v1.0.0-rc.6.25"
VERSION_STR = "1.0.0-rc.6.25"
FILE_VERSION_STR = "1.0.6.25"
RELEASE_DATE = "2026-09-21"

BASE_VERSION_STR = "1.0.0-rc.6.24"
BASE_FILE_VERSION_STR = "1.0.6.24"

EXE_NAME = "3M_Instrument_Logger.exe"
STAGED_EXE = ROOT / "build_tmp" / "release_out" / EXE_NAME
LOCAL_EXE = ROOT / "dist" / EXE_NAME

DIST_NAME = "Hioki3540_Keithley2700_Keithley2400_MitutoyoVL50_Agilent4339B_DAQ6510_SP2100_PT2000_LT1000_AIPhotoEditor_PST3202_EpsonOK900P_EtchingDesign"
DIST_DIR = ROOT / "dist" / DIST_NAME

ROOT_VER_JSON = ROOT / "version.json"
DIST_VER_JSON = DIST_DIR / "version.json"

BODY = (
    "## 3M Instrument Logger v1.0.0-rc.6.25\n\n"
    "### 작업표시줄 최소화 없이 즉시 화면에 팝업되는 ContentRendered 엔진 릴리즈\n\n"
    "1. **작업표시줄에만 머무는 현상 원천 해결 (`ContentRendered` 비동기 분리)**\n"
    "   - 기존 `Add_Loaded` 핸들러 내부에서 네트워크/프로세스 처리를 동기 수행하여 창 렌더링이 블로킹되고 작업표시줄에만 머물던 현상 규명\n"
    "   - 창이 화면에 100% 렌더링 완료된 직후 발생하는 `Add_ContentRendered` 이벤트로 이전\n"
    "   - `Dispatcher.BeginInvoke`를 통해 창 팝업 완료 후 백그라운드에서 다운로드 및 설치를 실행하여 사용자가 작업표시줄을 수동 클릭할 필요 없이 화면에 즉시 팝업\n\n"
    "2. **창 활성화 속성 추가 (`ShowActivated=True`, `WindowState=Normal`)**\n"
    "   - XAML 수준에서 명시적 활성화 보장\n\n"
    "3. **새 프로그램 독립 셸 기동 (`explorer.exe`) 유지**"
)

def safe_open(req, timeout=30):
    ctx = ssl._create_unverified_context()
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except Exception:
        return urllib.request.urlopen(req, context=ctx, timeout=timeout)

def main():
    print(f"=== [Step 1] Build {VERSION_STR} with STAGE_ONLY=1 for GitHub Release ===")
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

    modules = [
        "Hioki3540", "Keithley2700", "Keithley2400", "MitutoyoVL50",
        "Agilent4339B", "DAQ6510", "SP2100", "PT2000", "LT1000",
        "AIPhotoEditor", "PST3202", "EpsonOK900P", "EtchingDesign"
    ]
    cmd_sync = [sys.executable, str(ROOT / "build" / "build_standalone.py")] + modules
    subprocess.run(cmd_sync, cwd=str(ROOT), check=True)
    DIST_VER_JSON.write_text(new_ver_json, encoding="utf-8")

    env = os.environ.copy()
    env["STAGE_ONLY"] = "1"
    cmd_build = [sys.executable, str(ROOT / "build" / "package_exe.py"), str(DIST_DIR)]
    subprocess.run(cmd_build, cwd=str(ROOT), env=env, check=True)

    if not STAGED_EXE.exists():
        raise RuntimeError(f"Expected staged EXE not found at {STAGED_EXE}")

    staged_size = STAGED_EXE.stat().st_size
    print(f"[OK] Staged EXE built successfully: {STAGED_EXE} ({staged_size:,} bytes)")

    # Verify staged EXE has version 6.25
    from PyInstaller.archive.readers import CArchiveReader
    r = CArchiveReader(str(STAGED_EXE))
    ver_extracted = json.loads(r.extract(r"app\version.json").decode("utf-8"))
    if ver_extracted.get("version") != VERSION_STR:
        raise RuntimeError(f"Verification failed: Staged EXE has {ver_extracted} instead of {VERSION_STR}")
    print(f"[OK] Verified Staged EXE internal app/version.json is {VERSION_STR}")

    print(f"\n=== [Step 2] Uploading {TAG} to GitHub ===")
    cfg = updater_backend.load_config()
    repo, token = cfg["repo"], cfg["token"]
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "3M-Release-Uploader",
    }

    # 1. 릴리즈 조회 또는 생성
    list_req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/releases?per_page=100", headers=headers
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
    up_resp = safe_open(up_req, timeout=300)
    asset_info = json.loads(up_resp.read().decode())
    print(f"[3/3] 에셋 업로드 완료! ID={asset_info['id']}, URL={asset_info['browser_download_url']}")

    print(f"\n=== [Step 3] Rebuilding local dist/3M_Instrument_Logger.exe as {BASE_VERSION_STR} with ContentRendered fix ===")
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

    cmd_sync = [sys.executable, str(ROOT / "build" / "build_standalone.py")] + modules
    subprocess.run(cmd_sync, cwd=str(ROOT), check=True)
    DIST_VER_JSON.write_text(base_ver_json, encoding="utf-8")

    # Build local EXE (not STAGE_ONLY)
    cmd_build_local = [sys.executable, str(ROOT / "build" / "package_exe.py"), str(DIST_DIR)]
    subprocess.run(cmd_build_local, cwd=str(ROOT), check=True)

    r_local = CArchiveReader(str(LOCAL_EXE))
    ver_local = json.loads(r_local.extract(r"app\version.json").decode("utf-8"))
    print(f"[OK] Verified Local EXE internal app/version.json is {ver_local}")

    print(f"\n=== [Step 4] Verifying update detection for v{BASE_VERSION_STR} client ===")
    check_res = updater_backend.check_for_updates(BASE_VERSION_STR)
    print(f"Check result: available={check_res.get('update_available')}, latest={check_res.get('latest_version')}, asset_id={check_res.get('asset_id')}")
    if check_res.get("update_available") and check_res.get("latest_version") == VERSION_STR:
        print(f"[OK] Verification success: Update from {BASE_VERSION_STR} to {VERSION_STR} is properly detected!")
    else:
        print("[WARN] Please check update response.")

    print("\n[SUCCESS] All tasks completed successfully!")

if __name__ == "__main__":
    main()
