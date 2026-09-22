# -*- coding: utf-8 -*-
"""
GitHub Private Release v1.0.0-rc.6.7 생성 및 최신 EXE 업로드 스크립트
- 최신 바이너리: dist/3M_Instrument_Logger.exe (v1.0.0-rc.6.7)
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import json
import urllib.request
import urllib.error
import updater_backend

def main():
    cfg = updater_backend.load_config()
    repo = cfg['repo']
    token = cfg['token']
    if not token:
        print("[ERROR] GitHub Token이 설정되어 있지 않습니다.")
        sys.exit(1)

    tag_name = "v1.0.0-rc.6.7"
    release_name = "3M Instrument Logger v1.0.0-rc.6.7 (자동 업데이트 창 활성화 및 재실행 안정화)"
    body_text = (
        "## 3M Instrument Logger v1.0.0-rc.6.7 공식 패키지\n\n"
        "### 주요 개선 및 버그 수정 내역\n"
        "1. **독립 팝업창 전면 활성화 및 포커스 고정 (창 밑으로 내려가는 현상 해결)**:\n"
        "   - PowerShell 실행 시 `-WindowStyle Hidden` 및 `CREATE_NO_WINDOW`를 적용하여 콘솔 창 깜빡임 및 포커스 분실 원천 차단.\n"
        "   - Win32 `SwitchToThisWindow`, `SetWindowPos(HWND_TOPMOST)` 결합으로 업데이트 창이 다른 창 뒤나 작업표시줄 밑으로 가라앉지 않고 화면 정중앙 최상위에 또렷하게 유지되도록 개선.\n"
        "2. **재실행 시 `Failed to load Python DLL (_MEI...)` 에러 원천 차단**:\n"
        "   - 부모 PyInstaller 프로세스의 `_MEIPASS2`, `_MEIPASS`, `PYI_PARENT_PID` 환경변수가 자식 프로세스에 상속되어 삭제된 이전 임시 폴더를 참조하던 문제 완전 해결.\n"
        "   - 파이썬 및 파워쉘 환경변수 완전 소거 및 `UseShellExecute = $false` 격리 기동 적용.\n"
        "3. **스트리밍 다운로드 무결성 검증 추가**:\n"
        "   - Content-Length 기반 수신 바이트 일치 여부 검증으로 불완전 전송 방지.\n"
        "4. **프로세스 완전 종료 대기 루프 강화**:\n"
        "   - 기존 인스턴스가 100% 닫힌 후 파일 교체를 수행하도록 잠금 해제 안정성 강화."
    )

    # 1. 릴리즈 생성 또는 기존 릴리즈 확인
    url_releases = f"https://api.github.com/repos/{repo}/releases"
    headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': f'Bearer {token}',
        'User-Agent': '3M-Release-Uploader'
    }

    req = urllib.request.Request(url_releases, headers=headers)
    resp = updater_backend._safe_urlopen(req)
    releases = json.loads(resp.read().decode('utf-8'))

    target_rel = None
    for r in releases:
        if r.get('tag_name') == tag_name:
            target_rel = r
            break

    if not target_rel:
        print(f"[1/3] 새 릴리즈({tag_name}) 생성 중...")
        payload = json.dumps({
            'tag_name': tag_name,
            'name': release_name,
            'body': body_text,
            'draft': False,
            'prerelease': False
        }).encode('utf-8')
        req = urllib.request.Request(url_releases, data=payload, headers={**headers, 'Content-Type': 'application/json'})
        resp = updater_backend._safe_urlopen(req)
        target_rel = json.loads(resp.read().decode('utf-8'))
        print(f"[OK] 릴리즈 생성 완료: ID {target_rel['id']}")
    else:
        print(f"[1/3] 기존 릴리즈 발견: ID {target_rel['id']}")

    release_id = target_rel['id']
    upload_url = target_rel['upload_url'].split('{')[0]

    # 2. 기존 에셋 중 동일 파일명이 있으면 삭제
    exe_name = "3M_Instrument_Logger.exe"
    exe_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist", exe_name)
    if not os.path.exists(exe_path):
        print(f"[ERROR] 업로드 대상 EXE 파일이 없습니다: {exe_path}")
        sys.exit(1)

    file_size = os.path.getsize(exe_path)
    print(f"[2/3] 업로드 대상 파일: {exe_path} ({file_size / 1024 / 1024:.2f} MB)")

    for asset in target_rel.get('assets', []):
        if asset.get('name') == exe_name:
            asset_id = asset['id']
            print(f"[*] 기존 에셋(ID: {asset_id}) 삭제 중...")
            del_url = f"https://api.github.com/repos/{repo}/releases/assets/{asset_id}"
            del_req = urllib.request.Request(del_url, headers=headers, method='DELETE')
            updater_backend._safe_urlopen(del_req)
            print("[OK] 기존 에셋 삭제 완료")

    # 3. 신규 에셋 업로드
    print(f"[3/3] 최신 EXE 에셋 업로드 중 ({file_size} 바이트)...")
    upload_endpoint = f"{upload_url}?name={exe_name}"
    with open(exe_path, 'rb') as f:
        data = f.read()

    upload_headers = {
        'Authorization': f'Bearer {token}',
        'User-Agent': '3M-Release-Uploader',
        'Content-Type': 'application/octet-stream',
        'Content-Length': str(len(data))
    }
    up_req = urllib.request.Request(upload_endpoint, data=data, headers=upload_headers)
    up_resp = updater_backend._safe_urlopen(up_req, timeout=300)
    result = json.loads(up_resp.read().decode('utf-8'))

    print(f"\n[🎉 성공] GitHub Release {tag_name} 업로드 완료!")
    print(f"  - Release ID: {release_id}")
    print(f"  - Asset ID: {result.get('id')}")
    print(f"  - Asset Name: {result.get('name')}")
    print(f"  - Asset Size: {result.get('size')} bytes")

if __name__ == '__main__':
    main()
