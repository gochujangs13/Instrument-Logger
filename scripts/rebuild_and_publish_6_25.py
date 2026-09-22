# -*- coding: utf-8 -*-
"""
rebuild_and_publish_6_25.py
1. Build latest dist/3M_Instrument_Logger.exe as v1.0.0-rc.6.25 (with Keithley 2700 fixes).
2. Update GitHub Release v1.0.0-rc.6.25 body with latest release notes.
3. Replace GitHub Release asset with newly built 3M_Instrument_Logger.exe.
4. Verify build and release integrity.
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

EXE_NAME = "3M_Instrument_Logger.exe"
LOCAL_EXE = ROOT / "dist" / EXE_NAME

DIST_NAME = "Hioki3540_Keithley2700_Keithley2400_MitutoyoVL50_Agilent4339B_DAQ6510_SP2100_PT2000_LT1000_AIPhotoEditor_PST3202_EpsonOK900P_EtchingDesign"
DIST_DIR = ROOT / "dist" / DIST_NAME

ROOT_VER_JSON = ROOT / "version.json"
DIST_VER_JSON = DIST_DIR / "version.json"

BODY = (
    "## 3M Instrument Logger v1.0.0-rc.6.25\n\n"
    "### 1. Keithley 2700 측정 속도(FAST / MED / SLOW) 설정 교정 및 폴링 충돌 방지\n"
    "- **공식 규격 NPLC 교정**: FAST(0.1 NPLC), MED(1 NPLC), SLOW(5 NPLC)로 매핑 교정하여 장비 전면 패널의 FAST/MED/SLOW 인디케이터가 즉시 정확히 점등되도록 수정 (기존 'MIN'으로 인한 파라미터 에러 및 LED 미점등 문제 해결)\n"
    "- **폴링 충돌 방지**: 속도 및 와이어 모드 변경 시 `:READ?` 폴링을 일시 중지하고 120ms 안정화 후 재개하여 SCPI `-410 Query INTERRUPTED` 충돌 방지\n"
    "- **루트 콜론 부여**: 모든 설정 명령에 선두 루트 콜론(`:SENS:...`) 및 작은따옴표(`'FRES'`) 적용\n\n"
    "### 2. Keithley 2700 미세 저항 지수 왜곡 표기 버그 수정 (소수점 5자리 고정 표기)\n"
    "- **지수 표기 제거**: 4선식 측정 시 리드선 접촉이나 미세 열기전력으로 0.001 Ω 미만(-0.0003 Ω 등)이 측정될 때 `-3.00e-4`처럼 \"몇의 몇 승\" 형태로 강제 왜곡 표시되던 `fmt()` 버그 해결\n"
    "- 계측기 전면 패널(6.5 Digit)과 100% 일치하도록 `-0.00xxx Ω` 소수점 5자리 고정 소수점(`toFixed(5)`) 표기 적용\n"
    "- **`:FORM:ELEM READ` 적용**: `*RST` 후 기본값으로 유입되던 타임스탬프/상태 워드/샘플 번호를 원천 차단하고 순수 측정값 1개만 수신하도록 초기화 시퀀스 고정\n"
    "- **SYSTEM LOG 피드백**: 장비가 보낸 원시 응답과 화면 표시값을 SYSTEM LOG에 즉시 출력하여 실시간 대조 지원\n\n"
    "### 3. 작업표시줄 최소화 없이 즉시 화면에 팝업되는 ContentRendered 엔진 탑재\n"
    "- `Add_ContentRendered` 및 `Dispatcher.BeginInvoke` 비동기 분리로 업데이트 창이 작업표시줄에만 머물지 않고 화면 맨 앞에 즉시 팝업\n"
    "- 창 활성화 속성(`ShowActivated=True`, `WindowState=Normal`) 및 탐색기 독립 셸 기동(`explorer.exe`) 유지\n"
)

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

    # Build local EXE directly to dist/3M_Instrument_Logger.exe
    cmd_build = [sys.executable, str(ROOT / "build" / "package_exe.py"), str(DIST_DIR)]
    subprocess.run(cmd_build, cwd=str(ROOT), check=True)

    if not LOCAL_EXE.exists():
        raise RuntimeError(f"Expected EXE not found at {LOCAL_EXE}")

    exe_size = LOCAL_EXE.stat().st_size
    print(f"[OK] EXE built successfully: {LOCAL_EXE} ({exe_size:,} bytes)")

    # Verify EXE internal app/version.json
    from PyInstaller.archive.readers import CArchiveReader
    r = CArchiveReader(str(LOCAL_EXE))
    ver_extracted = json.loads(r.extract(r"app\version.json").decode("utf-8"))
    if ver_extracted.get("version") != VERSION_STR:
        raise RuntimeError(f"Verification failed: EXE has {ver_extracted} instead of {VERSION_STR}")
    print(f"[OK] Verified EXE internal app/version.json is {VERSION_STR}")

    print(f"\n=== [Step 2] Updating GitHub Release {TAG} & Uploading Asset ===")
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
    target = next((rel for rel in releases if rel["tag_name"] == TAG), None)

    if not target:
        raise RuntimeError(f"GitHub release {TAG} not found!")

    rel_id = target["id"]
    print(f"[1/3] 기존 릴리즈 발견 ID={rel_id}")

    # Update release body and title
    print(f"[*] 릴리즈 노트(Body) 업데이트 중...")
    patch_payload = json.dumps({
        "name": f"3M Instrument Logger {TAG}",
        "body": BODY,
        "draft": False,
        "prerelease": False,
        "make_latest": "true"
    }).encode()
    patch_req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/releases/{rel_id}",
        data=patch_payload,
        headers={**headers, "Content-Type": "application/json"},
        method="PATCH"
    )
    safe_open(patch_req)
    print("    -> 릴리즈 노트 업데이트 완료!")

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
    up_resp = safe_open(up_req, timeout=300)
    asset_info = json.loads(up_resp.read().decode())
    print(f"[3/3] 에셋 업로드 완료! ID={asset_info['id']}, URL={asset_info['browser_download_url']}")

    print("\n[SUCCESS] Local EXE build & GitHub Release v1.0.0-rc.6.25 updated successfully!")

if __name__ == "__main__":
    main()
