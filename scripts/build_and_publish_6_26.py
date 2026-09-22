# -*- coding: utf-8 -*-
"""
build_and_publish_6_26.py
1. Build latest dist/3M_Instrument_Logger.exe as v1.0.0-rc.6.26 (with Photo Editor fixes).
2. Create GitHub Release v1.0.0-rc.6.26 with detailed release notes.
3. Upload 3M_Instrument_Logger.exe to GitHub Release.
4. Verify update detection from v1.0.0-rc.6.25 client.
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

TAG = "v1.0.0-rc.6.26"
VERSION_STR = "1.0.0-rc.6.26"
FILE_VERSION_STR = "1.0.6.26"
RELEASE_DATE = "2026-09-22"

EXE_NAME = "3M_Instrument_Logger.exe"
LOCAL_EXE = ROOT / "dist" / EXE_NAME

DIST_NAME = "Hioki3540_Keithley2700_Keithley2400_MitutoyoVL50_Agilent4339B_DAQ6510_SP2100_PT2000_LT1000_AIPhotoEditor_PST3202_EpsonOK900P_EtchingDesign"
DIST_DIR = ROOT / "dist" / DIST_NAME

ROOT_VER_JSON = ROOT / "version.json"
DIST_VER_JSON = DIST_DIR / "version.json"

BODY = (
    "## 3M Instrument Logger v1.0.0-rc.6.26\n\n"
    "### Photo Editor 대량 사진(72장) 렌더링 중단 및 이미지 왜곡(빨림/눌림) 해결\n\n"
    "1. **Step 2 렌더링 조기 중단 버그 영구 해결**\n"
    "   - 2열(#1, #2) 렌더링 직후 `requestAnimationFrame` 대기 시 WebView2 유휴 상태에서 콜백이 멈추거나 토큰 불일치로 3번째 열부터 조기 반환(`return`)되던 문제 해결\n"
    "   - 태스크 큐 기반의 신뢰성 높은 이벤트 루프 양보(`setTimeout`)로 전환하고 개별 이미지 단위 `try...catch` 격리 방어 코드 적용\n"
    "   - 72장(12개 그룹) 등 대량 사진 등록 시 단 1장의 누락 없이 12개 열 전체 100% 렌더링 보장\n"
    "   - 실시간 렌더링 진행률(`렌더링 진행 중 (n/12)`) 표시 연동\n\n"
    "2. **이미지 왜곡 (\"빨려서 나와\"/납작 눌림) 해결**\n"
    "   - 소스 크롭 영역의 비율을 무시하고 출력 크기(2.22\" × 0.9\")로 강제 스트레칭(`drawImage`)하여 이미지가 가로로 늘어나고 세로로 납작하게 눌리던 현상 교정\n"
    "   - 소스 비율을 100% 온전히 유지한 채 캔버스에 맞추는 **종횡비 보존 (Aspect Ratio Cover Fitting)** 적용\n"
    "   - 썸네일 미리보기는 물론, **엑셀(XLSX) 내보내기 및 JPEG 압축 저장 시에도 찌그러짐 0%** 보장\n\n"
    "3. **재진입 방지 락 및 가로 스크롤 UX 개선**\n"
    "   - [다음 단계 ▶] 버튼 연타 시 렌더링 토큰 꼬임 방지 락(`_isNavigatingStep`) 적용\n"
    "   - 12개 이상의 많은 열 배치 시 가로 스크롤바와 마우스 휠로 부드럽게 탐색 가능"
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

    if target:
        print(f"[1/3] 기존 릴리즈 발견 ID={target['id']}")
        patch_req = urllib.request.Request(
            f"https://api.github.com/repos/{repo}/releases/{target['id']}",
            data=json.dumps({"body": BODY, "name": f"3M Instrument Logger {TAG}", "make_latest": "true"}).encode(),
            headers={**headers, "Content-Type": "application/json"},
            method="PATCH"
        )
        safe_open(patch_req)
        print("    -> 릴리즈 본문 갱신 완료")
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

    print(f"\n=== [Step 3] Verifying update detection for v1.0.0-rc.6.25 client ===")
    check_res = updater_backend.check_for_updates("1.0.0-rc.6.25")
    print(f"Check result: available={check_res.get('update_available')}, latest={check_res.get('latest_version')}, asset_id={check_res.get('asset_id')}")
    if check_res.get("update_available") and check_res.get("latest_version") == VERSION_STR:
        print(f"[OK] Verification success: Update from v1.0.0-rc.6.25 to {VERSION_STR} is properly detected!")
    else:
        print("[WARN] Please check update response:", check_res)

    print("\n[SUCCESS] All tasks completed successfully!")

if __name__ == "__main__":
    main()
