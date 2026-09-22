# -*- coding: utf-8 -*-
"""GitHub Release v1.0.0-rc.6.10 생성 및 EXE 업로드"""
import os, sys, json, ssl, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
import updater_backend

TAG = "v1.0.0-rc.6.10"
EXE_NAME = "3M_Instrument_Logger.exe"
EXE_PATH = os.path.join(ROOT, "dist", EXE_NAME)

BODY = (
    "## 3M Instrument Logger v1.0.0-rc.6.10\n\n"
    "### 업데이트 후 이전 버전으로 재시작되는 버그 수정\n\n"
    "**근본 원인 3가지 수정:**\n\n"
    "1. **dist `version.json` 미동기화** — 빌드 시 dist 폴더 내 version.json이 업데이트되지 않아 "
    "EXE 내부 버전과 GitHub 릴리즈 태그가 불일치. 업데이트 후 재시작하면 내부 버전(구버전)으로 표시.\n"
    "2. **PowerShell `TempFile` 무조건 재다운로드** — 메인 앱이 이미 다운로드한 임시 파일을 삭제하고 "
    "다시 다운로드. `AssetId`가 누락되거나 잘못된 경우 교체 실패.\n"
    "   → TempFile이 1MB 이상이면 재사용, 없을 때만 재다운로드하도록 수정.\n"
    "3. **`_watch_and_launch` 조기 종료** — 다운로드 완료 즉시 `os._exit(0)` 호출로 UI가 "
    "`finishAll()` 표시 전에 앱이 꺼짐.\n"
    "   → watcher는 감시만 하고, doRestart() 2차 호출 시 실제 교체·재시작 처리.\n\n"
    "### 이전 버전 수정 사항 포함 (v6.7~6.9)\n"
    "- 업데이트 게이지 25% 멈춤 → 실시간 폴링 방식으로 전환\n"
    "- 업데이트 팝업 창 포커스 고정 (창 밑으로 내려가는 현상 해결)\n"
    "- `Failed to load Python DLL (_MEI...)` 에러 해결"
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
