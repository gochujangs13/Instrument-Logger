# -*- coding: utf-8 -*-
"""
publish_release_to_github.py — GitHub Private Repo에 v1.0.0-rc.6.1 릴리즈 생성 및 EXE 업로드
"""
import os
import sys
import json
import ssl
import time
import urllib.request
import urllib.error

REPO = "gochujangs13/Instrument-Logger"
TAG_NAME = "v1.0.0-rc.6.5"
RELEASE_NAME = "3M Instrument Logger v1.0.0-rc.6.5"
RELEASE_NOTES = """## 3M Instrument Logger v1.0.0-rc.6.5

### 🚀 업데이트 하이라이트
- **무중단 독립 팝업 자동 업데이트 개선 (v1.0.0-rc.6.5)**:
  - 독립 팝업창(PowerShell WPF) 표시 보장: 백그라운드 콘솔만 안전 숨김 처리하여 업데이트 창 100% 정상 표시
  - 프로세스 완전 종료 및 잠금 해제: PyInstaller 멀티 프로세스 파일 잠금 감지 및 안전 해제
  - 파일 교체 후 최신 버전 자동 재실행 및 3초 카운트다운 자동 종료
- **안정성 및 네트워크 호환성 강화**:
  - 사내망/보안 프록시 환경 SSL 통신 호환성 개선

### 📦 포함 파일
- `3M_Instrument_Logger.exe` (v1.0.0-rc.6.5 Windows 단독 실행 파일)
"""

EXE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "3M_Instrument_Logger.exe")

def get_token():
    try:
        import ctypes, ctypes.wintypes
        class CREDENTIAL(ctypes.Structure):
            _fields_ = [('Flags', ctypes.wintypes.DWORD), ('Type', ctypes.wintypes.DWORD), ('TargetName', ctypes.wintypes.LPWSTR), ('Comment', ctypes.wintypes.LPWSTR), ('LastWritten', ctypes.wintypes.FILETIME), ('CredentialBlobSize', ctypes.wintypes.DWORD), ('CredentialBlob', ctypes.POINTER(ctypes.c_byte)), ('Persist', ctypes.wintypes.DWORD), ('AttributeCount', ctypes.wintypes.DWORD), ('Attributes', ctypes.c_void_p), ('TargetAlias', ctypes.wintypes.LPWSTR), ('UserName', ctypes.wintypes.LPWSTR)]
        pcred = ctypes.POINTER(CREDENTIAL)()
        if ctypes.windll.advapi32.CredReadW('git:https://github.com', 1, 0, ctypes.byref(pcred)):
            raw = ctypes.string_at(pcred.contents.CredentialBlob, pcred.contents.CredentialBlobSize)
            ctypes.windll.advapi32.CredFree(pcred)
            return raw.decode('utf-16le', errors='ignore').strip()
    except Exception as e:
        print(f"Token read error: {e}")
    return None

def main():
    token = get_token()
    if not token:
        print("[ERROR] GitHub 토큰을 찾을 수 없습니다.")
        sys.exit(1)

    if not os.path.exists(EXE_PATH):
        print(f"[ERROR] 업로드할 EXE 파일이 없습니다: {EXE_PATH}")
        sys.exit(1)

    exe_size = os.path.getsize(EXE_PATH)
    print(f"[INFO] 대상 파일: {EXE_PATH} ({exe_size / (1024*1024):.2f} MiB)")

    ctx = ssl._create_unverified_context()

    # 1. 기존 릴리즈 확인 및 삭제 (동일 태그가 이미 있을 경우)
    url_releases = f"https://api.github.com/repos/{REPO}/releases"
    req = urllib.request.Request(url_releases, headers={
        'Authorization': f'Bearer {token}',
        'User-Agent': 'ReleaseUploader',
        'Accept': 'application/vnd.github+json'
    })
    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            existing = json.loads(resp.read().decode('utf-8'))
            for rel in existing:
                if rel.get('tag_name') == TAG_NAME:
                    rel_id = rel['id']
                    print(f"[INFO] 기존 릴리즈(ID={rel_id}, Tag={TAG_NAME}) 삭제 중...")
                    del_req = urllib.request.Request(f"{url_releases}/{rel_id}", method='DELETE', headers={
                        'Authorization': f'Bearer {token}',
                        'User-Agent': 'ReleaseUploader',
                    })
                    with urllib.request.urlopen(del_req, context=ctx) as del_resp:
                        print("[INFO] 기존 릴리즈 삭제 완료.")
    except Exception as e:
        print(f"[WARN] 릴리즈 목록 조회 중: {e}")

    # 2. 릴리즈 생성
    print(f"[INFO] 신규 릴리즈 생성 중: {TAG_NAME} on {REPO}...")
    create_payload = json.dumps({
        'tag_name': TAG_NAME,
        'target_commitish': 'main',
        'name': RELEASE_NAME,
        'body': RELEASE_NOTES,
        'draft': False,
        'prerelease': False
    }).encode('utf-8')

    req_create = urllib.request.Request(url_releases, data=create_payload, headers={
        'Authorization': f'Bearer {token}',
        'User-Agent': 'ReleaseUploader',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
    })

    try:
        with urllib.request.urlopen(req_create, context=ctx) as resp:
            release_data = json.loads(resp.read().decode('utf-8'))
            release_id = release_data['id']
            upload_url = release_data['upload_url'].split('{')[0]
            print(f"[SUCCESS] 릴리즈 생성 완료! (ID={release_id})")
    except urllib.error.HTTPError as he:
        print(f"[ERROR] 릴리즈 생성 실패: {he.code} {he.reason}")
        print(he.read().decode('utf-8'))
        sys.exit(1)

    # 3. EXE 에셋 업로드
    asset_name = "3M_Instrument_Logger.exe"
    upload_url_with_param = f"{upload_url}?name={asset_name}"
    print(f"[INFO] EXE 에셋 업로드 중 ({asset_name}, {exe_size / (1024*1024):.2f} MiB)...")

    with open(EXE_PATH, 'rb') as f:
        exe_bytes = f.read()

    req_upload = urllib.request.Request(upload_url_with_param, data=exe_bytes, headers={
        'Authorization': f'Bearer {token}',
        'User-Agent': 'ReleaseUploader',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/octet-stream',
        'Content-Length': str(len(exe_bytes))
    })

    try:
        with urllib.request.urlopen(req_upload, context=ctx, timeout=300) as resp:
            asset_data = json.loads(resp.read().decode('utf-8'))
            print(f"[SUCCESS] 에셋 업로드 성공! (Asset ID={asset_data.get('id')}, Size={asset_data.get('size')} 바이트)")
    except urllib.error.HTTPError as he:
        print(f"[ERROR] 에셋 업로드 실패: {he.code} {he.reason}")
        print(he.read().decode('utf-8'))
        sys.exit(1)

    print("\n=======================================================")
    print(f"[SUCCESS] GitHub 릴리즈가 성공적으로 발행되었습니다!")
    print(f"저장소: https://github.com/{REPO}/releases/tag/{TAG_NAME}")
    print(f"에셋 파일: {asset_name} ({exe_size / (1024*1024):.2f} MiB)")
    print("=======================================================\n")

if __name__ == '__main__':
    main()
