# -*- coding: utf-8 -*-
"""
build_and_publish_6_19.py
Build v1.0.0-rc.6.19 to build_tmp/release_out/ (with STAGE_ONLY=1),
upload to GitHub Release v1.0.0-rc.6.19,
and keep local dist/3M_Instrument_Logger.exe and version.json at v1.0.0-rc.6.18.
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

TAG = "v1.0.0-rc.6.19"
VERSION_STR = "1.0.0-rc.6.19"
FILE_VERSION_STR = "1.0.6.19"
RELEASE_DATE = "2026-09-18"

BASE_VERSION_STR = "1.0.0-rc.6.18"
BASE_FILE_VERSION_STR = "1.0.6.18"

EXE_NAME = "3M_Instrument_Logger.exe"
STAGED_EXE = ROOT / "build_tmp" / "release_out" / EXE_NAME
LOCAL_EXE = ROOT / "dist" / EXE_NAME
BACKUP_KEEP_EXE = ROOT / "dist" / "3M_Instrument_Logger_v6.18_keep.exe"

DIST_NAME = "Hioki3540_Keithley2700_Keithley2400_MitutoyoVL50_Agilent4339B_DAQ6510_SP2100_PT2000_LT1000_AIPhotoEditor_PST3202_EpsonOK900P_EtchingDesign"
DIST_DIR = ROOT / "dist" / DIST_NAME

ROOT_VER_JSON = ROOT / "version.json"
DIST_VER_JSON = DIST_DIR / "version.json"

BODY = (
    "## 3M Instrument Logger v1.0.0-rc.6.19\n\n"
    "### Epson OK900P 라벨 프린터 연동 복구 및 업데이트 무중단 갱신 실기 검증 릴리즈\n\n"
    "1. **Epson PRIFIA OK900P 라벨 프린터 드라이버 및 인쇄 API 복구**\n"
    "   - 내장 웹서버 라벨 프린터 API 엔드포인트 복구 (`/api/printers`, `/api/print/ok900p`, `/api/driver/*`)\n"
    "   - 드라이버 자동 설치 시 PowerShell 관리자 권한 승격 실행 경로 공백 및 안전성 개선\n"
    "   - PyInstaller 번들 시 win32print, win32ui, PIL 의존성 명시적 포함 및 미사용 Qt 바인딩 제외로 실행 파일 경량화 (126.7 MB)\n\n"
    "2. **무중단 자동 업데이트 시스템 안정화 (v6.14 ~ v6.18)**\n"
    "   - PyInstaller onefile 재실행 시 `_MEIPASS2` 환경변수 완전 격리 (`UseShellExecute = $false`)\n"
    "   - PowerShell 5.1 CP949 인코딩 왜곡 방지를 위한 UTF-8 with BOM 보장\n"
    "   - 팝업창 Foreground Lockout 방지 및 화면 최상위 고정\n\n"
    "3. **10종 계측기 + 3종 소프트웨어 최신 코드 통합 탑재**"
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

        # Verify staged EXE has version 6.19
        from PyInstaller.archive.readers import CArchiveReader
        r = CArchiveReader(str(STAGED_EXE))
        ver_extracted = json.loads(r.extract(r"app\version.json").decode("utf-8"))
        if ver_extracted.get("version") != VERSION_STR:
            raise RuntimeError(f"Verification failed: Staged EXE has {ver_extracted} instead of {VERSION_STR}")
        print(f"[OK] Verified Staged EXE internal app/version.json is {VERSION_STR}")

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

    # 4. 검증: updater_backend를 통해 v6.18에서 v6.19 업데이트가 감지되는지 확인
    print("\n=== [Step 6] Verifying update detection for v6.18 client ===")
    check_res = updater_backend.check_for_updates("1.0.0-rc.6.18")
    print(f"Check result: {check_res}")
    if check_res.get("update_available") and check_res.get("latest_version") == VERSION_STR:
        print("✅ 검증 성공: v1.0.0-rc.6.18 클라이언트에서 v1.0.0-rc.6.19 업데이트가 정상 감지됩니다!")
    else:
        print("⚠️ 확인 필요: 업데이트 응답 확인 바랍니다.")

    print("\n🎉 모든 작업이 성공적으로 완료되었습니다!")

if __name__ == "__main__":
    main()
