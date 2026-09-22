# -*- coding: utf-8 -*-
"""
build_and_publish_6_13.py
Build v1.0.0-rc.6.13 to build_tmp/release_out/ (with STAGE_ONLY=1),
upload to GitHub Release v1.0.0-rc.6.13,
and keep local dist/3M_Instrument_Logger.exe and version.json at v1.0.0-rc.6.12.
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

TAG = "v1.0.0-rc.6.13"
VERSION_STR = "1.0.0-rc.6.13"
FILE_VERSION_STR = "1.0.6.13"
RELEASE_DATE = "2026-09-18"

BASE_VERSION_STR = "1.0.0-rc.6.12"
BASE_FILE_VERSION_STR = "1.0.6.12"

EXE_NAME = "3M_Instrument_Logger.exe"
STAGED_EXE = ROOT / "build_tmp" / "release_out" / EXE_NAME
LOCAL_EXE = ROOT / "dist" / EXE_NAME
BACKUP_KEEP_EXE = ROOT / "dist" / "3M_Instrument_Logger_v6.12_keep.exe"

DIST_NAME = "Hioki3540_Keithley2700_Keithley2400_MitutoyoVL50_Agilent4339B_DAQ6510_SP2100_PT2000_LT1000_AIPhotoEditor_PST3202_EpsonOK900P_EtchingDesign"
DIST_DIR = ROOT / "dist" / DIST_NAME

ROOT_VER_JSON = ROOT / "version.json"
DIST_VER_JSON = DIST_DIR / "version.json"

BODY = (
    "## 3M Instrument Logger v1.0.0-rc.6.13\n\n"
    "### 업데이트 시스템 실기 검증 릴리즈 (v6.12 ➔ v6.13 무중단 자동 갱신 검증)\n\n"
    "1. **PyInstaller `_MEI*` 잔여 폴더 완전 소거 검증**\n"
    "   - 파일 교체 전후로 `%TEMP%\\_MEI*` 임시 디렉터리를 완전 삭제하여, 구버전 코드 재사용 원천 차단\n\n"
    "2. **윈도우 탐색기 더블클릭과 동일한 독립 셸 실행 (`UseShellExecute = $true`)**\n"
    "   - 부모 프로세스의 환경변수 상속 없이 Windows Shell 컨텍스트에서 깨끗하게 기동하여 즉시 최신 버전으로 표시\n\n"
    "3. **기존 안정화 내역 포함 (v6.7 ~ v6.12)**\n"
    "   - 실시간 다운로드 게이지 폴링 및 3초 카운트다운\n"
    "   - 팝업창 최상위 포커스 고정 및 DLL 로드 오류 방지"
)

def safe_open(req, timeout=30):
    ctx = ssl._create_unverified_context()
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except Exception:
        return urllib.request.urlopen(req, context=ctx, timeout=timeout)

def main():
    print("=== [Step 1] Backup current local state ===")
    base_ver_obj = {
        "version": BASE_VERSION_STR,
        "releaseDate": RELEASE_DATE,
        "channel": "release-candidate",
        "fileVersion": BASE_FILE_VERSION_STR
    }
    base_ver_json = json.dumps(base_ver_obj, indent=2, ensure_ascii=False) + "\n"

    local_size_before = LOCAL_EXE.stat().st_size if LOCAL_EXE.exists() else 0
    print(f"Local {EXE_NAME} size before build: {local_size_before:,} bytes")
    
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
        print(f"\n=== [Step 4] Restoring local version.json back to {BASE_VERSION_STR} ===")
        ROOT_VER_JSON.write_text(base_ver_json, encoding="utf-8")
        if DIST_DIR.exists():
            DIST_VER_JSON.write_text(base_ver_json, encoding="utf-8")
        print(f"[OK] Local version.json restored to {BASE_VERSION_STR}.")
        
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
    print(f"[DONE] GitHub Release {TAG} 업로드 완료!")
    print(f"  Release ID : {rel_id}")
    print(f"  Asset ID   : {result.get('id')}")
    print(f"  Asset Name : {result.get('name')}")
    print(f"  Asset Size : {result.get('size'):,} bytes")
    print("==================================================")

if __name__ == "__main__":
    main()
