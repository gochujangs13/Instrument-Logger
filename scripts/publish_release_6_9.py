# -*- coding: utf-8 -*-
"""GitHub Release v1.0.0-rc.6.9 생성 및 EXE 업로드"""
import os, sys, json, ssl, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
import updater_backend

TAG = "v1.0.0-rc.6.9"
EXE_NAME = "3M_Instrument_Logger.exe"
EXE_PATH = os.path.join(ROOT, "dist", EXE_NAME)

BODY = (
    "## 3M Instrument Logger v1.0.0-rc.6.9\n\n"
    "### 업데이트 게이지 실시간 진행률 표시 수정 (25% 멈춤 버그 해결)\n\n"
    "- **이전 동작**: `/api/update/apply` 호출 후 25%에서 영구 멈춤\n"
    "- **수정 후 동작**:\n"
    "  - `/api/update/apply` → 백엔드 백그라운드 다운로드 즉시 시작\n"
    "  - `/api/update/progress` 폴링으로 실시간 `X MB / 143.4 MB (Y%)` 게이지 표시\n"
    "  - 100% 완료 시 PowerShell WPF 팝업 → 파일 교체 → 자동 재실행\n\n"
    "### v1.0.0-rc.6.7~6.8 변경 사항 포함\n"
    "1. 업데이트 팝업창 포커스 고정 (창 밑으로 내려가는 현상 해결)\n"
    "2. `Failed to load Python DLL (_MEI...)` 에러 완전 해결 (환경변수 격리)\n"
    "3. 다운로드 무결성 검증 (Content-Length 비교)"
)

def safe_open(req, timeout=30):
    ctx = ssl._create_unverified_context()
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except Exception:
        return urllib.request.urlopen(req, context=ctx, timeout=timeout)

def main():
    cfg = updater_backend.load_config()
    repo, token = cfg["repo"], cfg["token"]
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "3M-Release-Uploader",
    }

    # 1. 기존 동일 태그 릴리즈 확인
    list_req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/releases", headers=headers
    )
    releases = json.loads(safe_open(list_req).read().decode())
    target = next((r for r in releases if r["tag_name"] == TAG), None)

    if target:
        print(f"[1/3] 기존 릴리즈 발견 ID={target['id']}")
    else:
        print(f"[1/3] 새 릴리즈 {TAG} 생성 중...")
        payload = json.dumps({"tag_name": TAG, "name": f"3M Instrument Logger {TAG}",
                              "body": BODY, "draft": False, "prerelease": False}).encode()
        cr = urllib.request.Request(
            f"https://api.github.com/repos/{repo}/releases",
            data=payload,
            headers={**headers, "Content-Type": "application/json"},
        )
        target = json.loads(safe_open(cr).read().decode())
        print(f"    -> 생성 완료 ID={target['id']}")

    rel_id = target["id"]
    upload_base = target["upload_url"].split("{")[0]

    # 2. 기존 동명 에셋 삭제
    for a in target.get("assets", []):
        if a["name"] == EXE_NAME:
            print(f"[*] 기존 에셋 {a['id']} 삭제...")
            dr = urllib.request.Request(
                f"https://api.github.com/repos/{repo}/releases/assets/{a['id']}",
                headers=headers, method="DELETE"
            )
            safe_open(dr)
            print("    -> 삭제 완료")

    # 3. 업로드
    print(f"[2/3] 업로드: {EXE_PATH}")
    fsize = os.path.getsize(EXE_PATH)
    print(f"      크기: {fsize:,} bytes ({fsize/1024/1024:.2f} MB)")
    with open(EXE_PATH, "rb") as f:
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
    print("[3/3] GitHub 업로드 중 (약 1~2분)...")
    resp = urllib.request.urlopen(up_req, context=ctx, timeout=300)
    result = json.loads(resp.read().decode())

    print()
    print(f"[DONE] GitHub Release {TAG} 업로드 완료!")
    print(f"  Release ID : {rel_id}")
    print(f"  Asset ID   : {result.get('id')}")
    print(f"  Asset Name : {result.get('name')}")
    print(f"  Asset Size : {result.get('size'):,} bytes")

if __name__ == "__main__":
    main()
