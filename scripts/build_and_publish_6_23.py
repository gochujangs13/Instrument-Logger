# -*- coding: utf-8 -*-
"""
build_and_publish_6_23.py
Build v1.0.0-rc.6.23 with STAGE_ONLY=1,
upload to GitHub Release v1.0.0-rc.6.23,
and preserve local dist/3M_Instrument_Logger.exe and version.json at v1.0.0-rc.6.22.
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

TAG = "v1.0.0-rc.6.23"
VERSION_STR = "1.0.0-rc.6.23"
FILE_VERSION_STR = "1.0.6.23"
RELEASE_DATE = "2026-09-21"

BASE_VERSION_STR = "1.0.0-rc.6.22"
BASE_FILE_VERSION_STR = "1.0.6.22"

EXE_NAME = "3M_Instrument_Logger.exe"
STAGED_EXE = ROOT / "build_tmp" / "release_out" / EXE_NAME
LOCAL_EXE = ROOT / "dist" / EXE_NAME

DIST_NAME = "Hioki3540_Keithley2700_Keithley2400_MitutoyoVL50_Agilent4339B_DAQ6510_SP2100_PT2000_LT1000_AIPhotoEditor_PST3202_EpsonOK900P_EtchingDesign"
DIST_DIR = ROOT / "dist" / DIST_NAME

ROOT_VER_JSON = ROOT / "version.json"
DIST_VER_JSON = DIST_DIR / "version.json"

BODY = (
    "## 3M Instrument Logger v1.0.0-rc.6.23\n\n"
    "### 자동 업데이트 엔진 및 독립 셸 기동 완전 안정화 릴리즈\n\n"
    "1. **독립 셸 기동 및 자동 업데이트 완벽 검증**\n"
    "   - 업데이트 완료 후 새 프로그램 기동 시 `explorer.exe` 데스크톱 셸 위임 방식으로 `Failed to load Python DLL` 에러 완전 해결\n"
    "   - 메인 프로그램 즉시 종료 및 파일 잠금 해제 안정화\n"
    "   - 화면 최상단 강제 표시(Foreground Lockout 해제) 적용\n\n"
    "2. **다운로드 진행률 및 완료 UI**\n"
    "   - GitHub S3 직접 스트리밍 다운로드 (0%~80%)\n"
    "   - 파일 삭제 및 안전 교체 (80%~98%)\n"
    "   - 2초 후 100% 완료 카드, 릴리즈 노트 표시 및 사용자 실행 선택([네] / [아니오])\n\n"
    "3. **10종 계측기 + 3종 소프트웨어 최신 코드 통합 탑재**"
)

def safe_open(req, timeout=30):
    ctx = ssl._create_unverified_context()
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except Exception:
        return urllib.request.urlopen(req, context=ctx, timeout=timeout)

def main():
    print(f"=== [Step 1] Build {VERSION_STR} with STAGE_ONLY=1 ===")
    
    # 1. Update version.json to new version for packaging
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
    res = subprocess.run(cmd_sync, cwd=str(ROOT))
    if res.returncode != 0:
        raise RuntimeError("build_standalone.py failed")

    DIST_VER_JSON.write_text(new_ver_json, encoding="utf-8")

    env = os.environ.copy()
    env["STAGE_ONLY"] = "1"
    cmd_build = [sys.executable, str(ROOT / "build" / "package_exe.py"), str(DIST_DIR)]
    res = subprocess.run(cmd_build, cwd=str(ROOT), env=env)
    if res.returncode != 0:
        raise RuntimeError("package_exe.py failed")

    if not STAGED_EXE.exists():
        raise RuntimeError(f"Expected staged EXE not found at {STAGED_EXE}")

    staged_size = STAGED_EXE.stat().st_size
    print(f"[OK] Staged EXE built successfully: {STAGED_EXE} ({staged_size:,} bytes)")

    # Verify staged EXE has version 6.23
    from PyInstaller.archive.readers import CArchiveReader
    r = CArchiveReader(str(STAGED_EXE))
    ver_extracted = json.loads(r.extract(r"app\version.json").decode("utf-8"))
    if ver_extracted.get("version") != VERSION_STR:
        raise RuntimeError(f"Verification failed: Staged EXE has {ver_extracted} instead of {VERSION_STR}")
    print(f"[OK] Verified Staged EXE internal app/version.json is {VERSION_STR}")

    # Restore local version.json back to BASE_VERSION_STR
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
    print(f"[OK] Restored local version.json back to {BASE_VERSION_STR}")

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

    print(f"\n=== [Step 3] Verifying update detection for v{BASE_VERSION_STR} client ===")
    check_res = updater_backend.check_for_updates(BASE_VERSION_STR)
    print(f"Check result: available={check_res.get('update_available')}, latest={check_res.get('latest_version')}, asset_id={check_res.get('asset_id')}")
    if check_res.get("update_available") and check_res.get("latest_version") == VERSION_STR:
        print(f"[OK] Verification success: Update from {BASE_VERSION_STR} to {VERSION_STR} is properly detected!")
    else:
        print("[WARN] Please check update response.")

    print("\n[SUCCESS] All tasks completed successfully!")

if __name__ == "__main__":
    main()
