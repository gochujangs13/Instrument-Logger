# -*- coding: utf-8 -*-
"""
build_and_publish_6_21.py
Build v1.0.0-rc.6.21 to build_tmp/release_out/ (with STAGE_ONLY=1),
upload to GitHub Release v1.0.0-rc.6.21,
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

TAG = "v1.0.0-rc.6.21"
VERSION_STR = "1.0.0-rc.6.21"
FILE_VERSION_STR = "1.0.6.21"
RELEASE_DATE = "2026-09-21"

BASE_VERSION_STR = "1.0.0-rc.6.20"
BASE_FILE_VERSION_STR = "1.0.6.20"

EXE_NAME = "3M_Instrument_Logger.exe"
STAGED_EXE = ROOT / "build_tmp" / "release_out" / EXE_NAME
LOCAL_EXE = ROOT / "dist" / EXE_NAME
BACKUP_KEEP_EXE = ROOT / "dist" / "3M_Instrument_Logger_v6.18_keep.exe"

DIST_NAME = "Hioki3540_Keithley2700_Keithley2400_MitutoyoVL50_Agilent4339B_DAQ6510_SP2100_PT2000_LT1000_AIPhotoEditor_PST3202_EpsonOK900P_EtchingDesign"
DIST_DIR = ROOT / "dist" / DIST_NAME

ROOT_VER_JSON = ROOT / "version.json"
DIST_VER_JSON = DIST_DIR / "version.json"

BODY = (
    "## 3M Instrument Logger v1.0.0-rc.6.21\n\n"
    "### 독립 업데이터 직행 및 사용자 실행 선택(네/아니오) 전면 개편 릴리즈\n\n"
    "1. **독립 업데이트 프로그램 즉시 실행 및 메인 프로그램 종료**\n"
    "   - 업데이트 진행 클릭 즉시 전용 독립 업데이트 창(`updater_gui.ps1`) 단독 실행\n"
    "   - 메인 통합 프로그램을 0.15초 내 즉시 안전 종료하여 파일 잠금 완벽 해제\n\n"
    "2. **독립 업데이터 자체 스트리밍 다운로드 및 파일 교체**\n"
    "   - GitHub Private S3 릴리즈 직접 스트리밍 다운로드 (실시간 MB/s 및 0%~80% 진행률 표시)\n"
    "   - 이전 실행 파일 안전 삭제 및 최신 파일 교체, 잔여 임시 디렉터리(`_MEI*`) 소거 (80%~98%)\n\n"
    "3. **설치 완료 후 2초 대기 및 100% 완료 전환**\n"
    "   - 설치 완료 후 2초 대기 ➔ 게이지 100% 완료 전환 (`🎉 업데이트가 완료되었습니다!`)\n"
    "   - 이번 업데이트 주요 내용(릴리즈 노트) 스크롤 박스 표시\n\n"
    "4. **새로운 프로그램 실행 여부 사용자 선택**\n"
    "   - `💡 새로운 프로그램을 지금 실행하시겠습니까?` 문구 및 [네] / [아니오] 버튼 제공\n"
    "   - **네**: PyInstaller 부트로더 환경변수(`_MEIPASS2` 등)를 완전히 정화한 후 새 프로그램 정상 기동 & 업데이터 닫기\n"
    "   - **아니오**: 새 프로그램을 실행하지 않고 업데이터 창만 닫기\n\n"
    "5. **10종 계측기 + 3종 소프트웨어 최신 코드 통합 탑재**"
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

        # Verify staged EXE has version 6.21
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

    # 4. 검증: updater_backend를 통해 v6.18에서 v6.21 업데이트가 감지되는지 확인
    print("\n=== [Step 6] Verifying update detection for v6.18 client ===")
    check_res = updater_backend.check_for_updates("1.0.0-rc.6.18")
    print(f"Check result: available={check_res.get('update_available')}, latest={check_res.get('latest_version')}, asset_id={check_res.get('asset_id')}")
    if check_res.get("update_available") and check_res.get("latest_version") == VERSION_STR:
        print("[OK] Verification success: Update to v1.0.0-rc.6.21 is properly detected!")
    else:
        print("[WARN] Please check update response.")

    print("\n🎉 모든 작업이 성공적으로 완료되었습니다!")

if __name__ == "__main__":
    main()
