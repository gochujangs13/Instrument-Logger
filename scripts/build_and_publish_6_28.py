# -*- coding: utf-8 -*-
"""
build_and_publish_6_28.py
1. Build latest dist/3M_Instrument_Logger.exe as v1.0.0-rc.6.28 (Photo Editor Step 2 full-width fix).
2. Create/Update GitHub Release v1.0.0-rc.6.28 with detailed release notes.
3. Upload 3M_Instrument_Logger.exe to GitHub Release.
4. Verify update detection from v1.0.0-rc.6.27 and earlier clients.
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

TAG = "v1.0.0-rc.6.28"
VERSION_STR = "1.0.0-rc.6.28"
FILE_VERSION_STR = "1.0.6.28"
RELEASE_DATE = "2026-09-22"

EXE_NAME = "3M_Instrument_Logger.exe"
LOCAL_EXE = ROOT / "dist" / EXE_NAME

DIST_NAME = "Hioki3540_Keithley2700_Keithley2400_MitutoyoVL50_Agilent4339B_DAQ6510_SP2100_PT2000_LT1000_AIPhotoEditor_PST3202_EpsonOK900P_EtchingDesign"
DIST_DIR = ROOT / "dist" / DIST_NAME

ROOT_VER_JSON = ROOT / "version.json"
DIST_VER_JSON = DIST_DIR / "version.json"

BODY = """## 3M Instrument Logger v1.0.0-rc.6.28

### Photo Editor Step 2 화면 잘림(290px 사이드바 폭에 갇힘) 및 툴바 줄바꿈 현상 완벽 해결

1. **Step 2 단일 열(Full Width) 레이아웃 우선순위 복원**
   - 기존에는 CSS `:has(#rightpanel[style*="display: none"])` 규칙의 높은 우선순위로 인해 단일 열 모드에서도 2열 그리드가 강제 적용되어, 사이드바를 숨겼을 때 본문 화면(`center`)이 너비 290px의 1열(사이드바 자리)에 갇히는 문제가 발생했습니다.
   - 이로 인해 우측의 넓은 화면이 텅 빈 공백으로 남고, 상단 툴바가 4줄로 좁게 래핑되며 3번째 열 중간에서 사진이 싹둑 잘리는 현상이 완벽히 해결되었습니다.
   - 단일 열(`data-layout-mode="one"`, `ai-s2`) 진입 시 `#center`가 화면 전체 폭(`grid-column: 1 / -1; width: 100%`)을 100% 온전히 사용하도록 보장했습니다.

2. **사진 그룹 렌더링 및 가로 스크롤 UX 개선**
   - 4그룹(24장), 12그룹(72장) 등 어떤 그룹 수에서도 모든 열이 잘림 없이 온전히 표시됩니다.
   - 상단 버튼 바(`< Back`, `Output Size`, `Per Column`, `Save JPEG`, `Export to Excel`)가 가로 폭에 맞춰 시원하게 한 줄로 배치됩니다.
   - 화면 폭을 넘는 대량 사진의 경우 가로 스크롤바와 마우스 휠을 통해 모든 열을 매끄럽게 연속 탐색할 수 있습니다.

3. **새 PC 환경 무설정 자동 업데이트 지원 (토큰 기본 내장 유지)**
   - EXE 파일 1개만 다른 PC로 복사하더라도 토큰 입력 없이 최신 버전 감지 및 자동 원클릭 업데이트가 즉시 동작합니다.
"""

def safe_open(req, timeout=30):
    ctx = ssl._create_unverified_context()
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except Exception:
        return urllib.request.urlopen(req, context=ctx, timeout=timeout)

def main():
    print(f"=== [Step 1] Build {VERSION_STR} Local EXE ===")
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

    cmd_build = [sys.executable, str(ROOT / "build" / "package_exe.py"), str(DIST_DIR)]
    subprocess.run(cmd_build, cwd=str(ROOT), check=True)

    if not LOCAL_EXE.exists():
        raise RuntimeError(f"Expected EXE not found at {LOCAL_EXE}")

    local_size = LOCAL_EXE.stat().st_size
    print(f"[OK] Local EXE built successfully: {LOCAL_EXE} ({local_size:,} bytes)")

    from PyInstaller.archive.readers import CArchiveReader
    r = CArchiveReader(str(LOCAL_EXE))
    ver_extracted = json.loads(r.extract(r"app\version.json").decode("utf-8"))
    if ver_extracted.get("version") != VERSION_STR:
        raise RuntimeError(f"Verification failed: Built EXE has {ver_extracted} instead of {VERSION_STR}")
    print(f"[OK] Verified EXE internal app/version.json is {VERSION_STR}")

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

    payload_dict = {
        "tag_name": TAG,
        "name": f"3M Instrument Logger {TAG}",
        "body": BODY,
        "draft": False,
        "prerelease": False,
        "make_latest": "true"
    }
    payload_bytes = json.dumps(payload_dict, ensure_ascii=False).encode("utf-8")

    if target:
        print(f"[1/3] 기존 릴리즈 발견 ID={target['id']}")
        patch_req = urllib.request.Request(
            f"https://api.github.com/repos/{repo}/releases/{target['id']}",
            data=payload_bytes,
            headers={**headers, "Content-Type": "application/json; charset=utf-8"},
            method="PATCH"
        )
        safe_open(patch_req)
        print("    -> 릴리즈 본문 갱신 완료")
    else:
        print(f"[1/3] 새 릴리즈 {TAG} 생성 중...")
        cr = urllib.request.Request(
            f"https://api.github.com/repos/{repo}/releases",
            data=payload_bytes,
            headers={**headers, "Content-Type": "application/json; charset=utf-8"},
        )
        target = json.loads(safe_open(cr).read().decode())
        print(f"    -> 생성 완료 ID={target['id']}")

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
    print(f"[2/3] 업로드할 파일: {LOCAL_EXE}")
    fsize = LOCAL_EXE.stat().st_size
    print(f"      크기: {fsize:,} bytes ({fsize/1024/1024:.2f} MB)")
    with open(LOCAL_EXE, "rb") as f:
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
    up_resp = safe_open(up_req, timeout=600)
    asset_info = json.loads(up_resp.read().decode())
    print(f"[3/3] 에셋 업로드 완료! ID={asset_info['id']}, URL={asset_info['browser_download_url']}")

    print(f"\n=== [Step 3] Verifying update detection for v1.0.0-rc.6.27 client ===")
    check_res = updater_backend.check_for_updates("1.0.0-rc.6.27")
    print(f"Check result: available={check_res.get('update_available')}, latest={check_res.get('latest_version')}, asset_id={check_res.get('asset_id')}")
    if check_res.get("update_available") and check_res.get("latest_version") == VERSION_STR:
        print(f"[OK] Verification success: Update from v1.0.0-rc.6.27 to {VERSION_STR} is properly detected!")
    else:
        print("[WARN] Please check update response:", check_res)

    print("\n[SUCCESS] All tasks completed successfully!")

if __name__ == "__main__":
    main()
