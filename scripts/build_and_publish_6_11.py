# -*- coding: utf-8 -*-
"""
build_and_publish_6_11.py
Build v1.0.0-rc.6.11 to build_tmp/release_out/ (without touching dist/3M_Instrument_Logger.exe),
upload it to GitHub Release v1.0.0-rc.6.11 as the latest release,
and keep local dist/3M_Instrument_Logger.exe and local version.json at v1.0.0-rc.6.10.
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

TAG = "v1.0.0-rc.6.11"
VERSION_STR = "1.0.0-rc.6.11"
FILE_VERSION_STR = "1.0.6.11"
RELEASE_DATE = "2026-09-18"

EXE_NAME = "3M_Instrument_Logger.exe"
STAGED_EXE = ROOT / "build_tmp" / "release_out" / EXE_NAME
LOCAL_EXE = ROOT / "dist" / EXE_NAME
BACKUP_KEEP_EXE = ROOT / "dist" / "3M_Instrument_Logger_v6.10_keep.exe"

DIST_NAME = "Hioki3540_Keithley2700_Keithley2400_MitutoyoVL50_Agilent4339B_DAQ6510_SP2100_PT2000_LT1000_AIPhotoEditor_PST3202_EpsonOK900P_EtchingDesign"
DIST_DIR = ROOT / "dist" / DIST_NAME

ROOT_VER_JSON = ROOT / "version.json"
DIST_VER_JSON = DIST_DIR / "version.json"

BODY = (
    "## 3M Instrument Logger v1.0.0-rc.6.11\n\n"
    "### 업데이트 시스템 안정성 및 실기 검증 릴리즈\n\n"
    "1. **업데이트 후 이전 버전으로 재시작되는 버그 해결 (v6.10 연동)**\n"
    "   - dist `version.json` 동기화 보장 (EXE 내부 버전 일치)\n"
    "   - PowerShell `TempFile` 무조건 삭제 방지 및 기 다운로드 파일 재사용\n"
    "   - 백엔드 `_watch_and_launch` 조기 종료 제거 및 doRestart() 2차 안전 재시작\n\n"
    "2. **실시간 다운로드 게이지**\n"
    "   - 400ms 폴링으로 `X MB / 143.4 MB (Y%)` 실시간 진행률 표시\n"
    "   - 100% 완료 시 3초 카운트다운 후 독립 팝업 전환\n\n"
    "3. **독립 팝업 자가 교체 엔진**\n"
    "   - PowerShell WPF 최상위 포커스 고정\n"
    "   - `_MEIPASS2` 환경변수 완전 소거로 DLL 로드 오류 차단"
)

def safe_open(req, timeout=30):
    ctx = ssl._create_unverified_context()
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except Exception:
        return urllib.request.urlopen(req, context=ctx, timeout=timeout)

def main():
    print("=== [Step 1] Backup current local state ===")
    orig_root_ver = ROOT_VER_JSON.read_text(encoding="utf-8")
    orig_dist_ver = DIST_VER_JSON.read_text(encoding="utf-8") if DIST_VER_JSON.exists() else orig_root_ver
    
    local_size_before = LOCAL_EXE.stat().st_size if LOCAL_EXE.exists() else 0
    print(f"Local {EXE_NAME} size before build: {local_size_before:,} bytes")
    
    # Ensure backup of current 6.10 EXE
    if LOCAL_EXE.exists() and not BACKUP_KEEP_EXE.exists():
        shutil.copy2(LOCAL_EXE, BACKUP_KEEP_EXE)
        print(f"Created backup: {BACKUP_KEEP_EXE}")

    new_ver_obj = {
        "version": VERSION_STR,
        "releaseDate": RELEASE_DATE,
        "channel": "release-candidate",
        "fileVersion": FILE_VERSION_STR
    }
    new_ver_json = json.dumps(new_ver_obj, indent=2, ensure_ascii=False) + "\n"

    try:
        print(f"\n=== [Step 2] Set version to {VERSION_STR} ===")
        ROOT_VER_JSON.write_text(new_ver_json, encoding="utf-8")
        if DIST_DIR.exists():
            DIST_VER_JSON.write_text(new_ver_json, encoding="utf-8")

        print("Syncing standalone files via build_standalone.py...")
        modules = [
            "Hioki3540", "Keithley2700", "Keithley2400", "MitutoyoVL50",
            "Agilent4339B", "DAQ6510", "SP2100", "PT2000", "LT1000",
            "AIPhotoEditor", "PST3202", "EpsonOK900P", "EtchingDesign"
        ]
        cmd_sync = [sys.executable, str(ROOT / "build" / "build_standalone.py")] + modules
        res = subprocess.run(cmd_sync, cwd=str(ROOT))
        if res.returncode != 0:
            raise RuntimeError("build_standalone.py failed")

        # Double check dist version.json has 6.11
        DIST_VER_JSON.write_text(new_ver_json, encoding="utf-8")
        print(f"[OK] dist version.json updated to {VERSION_STR}")

        print(f"\n=== [Step 3] Build EXE with STAGE_ONLY=1 ===")
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

    finally:
        print(f"\n=== [Step 4] Restoring local version.json back to 6.10 ===")
        ROOT_VER_JSON.write_text(orig_root_ver, encoding="utf-8")
        if DIST_DIR.exists():
            DIST_VER_JSON.write_text(orig_dist_ver, encoding="utf-8")
        print("[OK] Local version.json restored.")
        
        # Verify local EXE was NOT overwritten
        if LOCAL_EXE.exists():
            local_size_after = LOCAL_EXE.stat().st_size
            print(f"Local {EXE_NAME} size after build: {local_size_after:,} bytes")
            if local_size_after != local_size_before and BACKUP_KEEP_EXE.exists():
                print(f"[WARN] Local EXE changed! Restoring from {BACKUP_KEEP_EXE}...")
                shutil.copy2(BACKUP_KEEP_EXE, LOCAL_EXE)
                print("Restored local EXE from backup.")

    print(f"\n=== [Step 5] Uploading {TAG} to GitHub ===")
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

    ctx = ssl._create_unverified_context()
    up_req = urllib.request.Request(
        f"{upload_base}?name={EXE_NAME}",
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": "3M-Release-Uploader",
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(data)),
        }
    )
    print("[3/3] GitHub 에셋 업로드 중 (약 1~2분)...")
    resp = urllib.request.urlopen(up_req, context=ctx, timeout=300)
    result = json.loads(resp.read().decode())

    print()
    print("==================================================")
    print(f"🎉 GitHub Release {TAG} 업로드 완료!")
    print(f"  Release ID : {rel_id}")
    print(f"  Asset ID   : {result.get('id')}")
    print(f"  Asset Name : {result.get('name')}")
    print(f"  Asset Size : {result.get('size'):,} bytes")
    print("==================================================")

if __name__ == "__main__":
    main()
