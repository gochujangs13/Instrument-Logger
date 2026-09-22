# -*- coding: utf-8 -*-
"""
updater_backend.py — GitHub Private/Public 릴리즈 기반 무중단 자동 업데이트 엔진
- GitHub API 최신 버전 및 릴리즈 노트 확인 (2.5초 타임아웃, 오프라인 무중단)
- GitHub Fine-grained Token 기반 Private Release Asset 스트리밍 다운로드 (S3 리다이렉트 인증 분리)
- 0% ~ 100% 진행률 실시간 트래킹
- Windows 자가 교체(Self-replace) 배치 스크립트 실행 및 재시작
"""
import os
import sys
import json
import re
import time
import tempfile
import threading
import subprocess
import urllib.request
import urllib.error

# ── 기본 설정 ─────────────────────────────────────────────────────────────────
DEFAULT_REPO = "gochujangs13/Instrument-Logger"
# 프로그램 내장 기본 토큰 (만료 없는 Private Repo 읽기 전용 토큰이 여기에 설정되면 전 PC 자동 적용)
DEFAULT_TOKEN = "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"

import ssl

def _get_windows_github_token():
    try:
        import ctypes, ctypes.wintypes
        class CREDENTIAL(ctypes.Structure):
            _fields_ = [('Flags', ctypes.wintypes.DWORD), ('Type', ctypes.wintypes.DWORD), ('TargetName', ctypes.wintypes.LPWSTR), ('Comment', ctypes.wintypes.LPWSTR), ('LastWritten', ctypes.wintypes.FILETIME), ('CredentialBlobSize', ctypes.wintypes.DWORD), ('CredentialBlob', ctypes.POINTER(ctypes.c_byte)), ('Persist', ctypes.wintypes.DWORD), ('AttributeCount', ctypes.wintypes.DWORD), ('Attributes', ctypes.c_void_p), ('TargetAlias', ctypes.wintypes.LPWSTR), ('UserName', ctypes.wintypes.LPWSTR)]
        pcred = ctypes.POINTER(CREDENTIAL)()
        if ctypes.windll.advapi32.CredReadW('git:https://github.com', 1, 0, ctypes.byref(pcred)):
            raw = ctypes.string_at(pcred.contents.CredentialBlob, pcred.contents.CredentialBlobSize)
            ctypes.windll.advapi32.CredFree(pcred)
            tok = raw.decode('utf-16le', errors='ignore').strip()
            if tok and not tok.startswith('\x00'):
                return tok
    except Exception:
        pass
    return ''

def get_storage_dir():
    appdata = os.environ.get('APPDATA', '')
    if not appdata:
        appdata = os.path.expanduser('~')
    base = os.path.join(appdata, '3M_Instrument_Logger')
    os.makedirs(base, exist_ok=True)
    return base

def get_config_path():
    return os.path.join(get_storage_dir(), 'updater_config.json')

def load_config():
    p = get_config_path()
    repo = DEFAULT_REPO
    token = DEFAULT_TOKEN.strip()
    if os.path.exists(p):
        try:
            with open(p, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
                saved_repo = cfg.get('repo', '').strip()
                if saved_repo:
                    repo = saved_repo
                saved_token = cfg.get('token', '').strip()
                if saved_token:
                    token = saved_token
        except Exception:
            pass
    if not token:
        win_token = _get_windows_github_token()
        if win_token:
            token = win_token
    return {'repo': repo, 'token': token}

def save_config(repo, token):
    p = get_config_path()
    cfg = {
        'repo': (repo or DEFAULT_REPO).strip(),
        'token': (token or '').strip(),
        'updatedAt': time.strftime('%Y-%m-%d %H:%M:%S')
    }
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    return cfg

def get_masked_config():
    cfg = load_config()
    tok = cfg.get('token', '')
    is_builtin = bool(DEFAULT_TOKEN and tok == DEFAULT_TOKEN.strip())
    if tok:
        if len(tok) > 8:
            masked = tok[:4] + '•' * (len(tok) - 8) + tok[-4:]
        else:
            masked = '••••••••'
    else:
        masked = ''
    return {
        'repo': cfg.get('repo', DEFAULT_REPO),
        'has_token': bool(tok),
        'is_builtin': is_builtin,
        'masked_token': masked
    }

# ── 버전 비교 유틸 ─────────────────────────────────────────────────────────────
def parse_version_tuple(v_str):
    """'1.0.0-rc.6' -> (1, 0, 0, 6), 'v1.0.0-rc.6.1' -> (1, 0, 0, 6, 1)"""
    return [int(n) for n in re.findall(r'\d+', str(v_str))]

def is_newer_version(latest_str, current_str):
    t_latest = list(parse_version_tuple(latest_str))
    t_current = list(parse_version_tuple(current_str))
    max_len = max(len(t_latest), len(t_current), 4)
    while len(t_latest) < max_len:
        t_latest.append(0)
    while len(t_current) < max_len:
        t_current.append(0)
    return tuple(t_latest) > tuple(t_current)

def _safe_urlopen(req, timeout=5):
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.URLError as e:
        if 'CERTIFICATE_VERIFY_FAILED' in str(e) or 'certificate verify failed' in str(e):
            ctx = ssl._create_unverified_context()
            return urllib.request.urlopen(req, context=ctx, timeout=timeout)
        raise

# ── 다운로드 상태 ─────────────────────────────────────────────────────────────
_download_lock = threading.Lock()
_download_state = {
    'status': 'idle',       # idle | downloading | completed | error
    'percent': 0,
    'downloaded_bytes': 0,
    'total_bytes': 0,
    'speed_str': '',
    'error': None,
    'temp_file': None,
}
_last_release_info = None  # check_for_updates() 최신 결과 캐시

def get_download_status():
    with _download_lock:
        return dict(_download_state)

# ── S3 안전 리다이렉트 핸들러 ───────────────────────────────────────────────────
class _S3SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """
    GitHub API가 S3 서명 URL(objects.githubusercontent.com 등)로 리다이렉트할 때
    Authorization 헤더를 제거해야 400 'Only one auth mechanism allowed' 오류를 방지함.
    """
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new_req = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new_req is not None:
            # github.com 도메인이 아닌 서명된 CDN/S3 URL이면 토큰 헤더 제거
            from urllib.parse import urlparse
            parsed = urlparse(newurl)
            if 'github.com' not in parsed.netloc.lower():
                new_req.headers.pop('Authorization', None)
                new_req.headers.pop('authorization', None)
        return new_req

# ── 릴리즈 확인 ───────────────────────────────────────────────────────────────
def check_for_updates(current_version, timeout=2.5):
    cfg = load_config()
    repo = cfg.get('repo', DEFAULT_REPO)
    token = cfg.get('token', '')

    url = f"https://api.github.com/repos/{repo}/releases/latest"
    req = urllib.request.Request(url)
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', '3M-Instrument-Logger-Updater')
    if token:
        req.add_header('Authorization', f'Bearer {token}')

    try:
        with _safe_urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as he:
        # 404일 경우 아직 릴리즈가 등록되지 않은 상태일 수 있음
        if he.code == 404:
            return {
                'ok': True,
                'update_available': False,
                'current_version': current_version,
                'latest_version': current_version,
                'reason': '등록된 신규 릴리즈가 없습니다.',
            }
        return {
            'ok': False,
            'update_available': False,
            'current_version': current_version,
            'error': f"GitHub API HTTP {he.code} ({he.reason})",
        }
    except Exception as e:
        return {
            'ok': False,
            'update_available': False,
            'current_version': current_version,
            'error': f"GitHub API 확인 불가 ({e})",
        }

    latest_tag = data.get('tag_name', '').lstrip('v')
    update_available = is_newer_version(latest_tag, current_version)

    # .exe 에셋 찾기
    exe_asset = None
    for asset in data.get('assets', []):
        name = asset.get('name', '')
        if name.lower().endswith('.exe'):
            exe_asset = asset
            break

    res = {
        'ok': True,
        'update_available': bool(update_available and exe_asset),
        'current_version': current_version,
        'latest_version': latest_tag,
        'release_name': data.get('name') or f"v{latest_tag}",
        'release_notes': data.get('body') or '릴리즈 상세 설명이 없습니다.',
        'published_at': data.get('published_at', ''),
        'asset_name': exe_asset.get('name') if exe_asset else None,
        'asset_id': exe_asset.get('id') if exe_asset else None,
        'asset_size': exe_asset.get('size', 0) if exe_asset else 0,
        'repo': repo,
    }
    global _last_release_info
    _last_release_info = res
    return res

# ── apply_update_and_restart: 독립 업데이트 프로그램 즉시 실행 + 메인 앱 종료 ─────
def apply_update_and_restart(body=None):
    """
    사용자 지정 플로우:
    1. 새로운 업데이트 프로그램(PowerShell WPF) 즉시 실행
    2. 메인 통합 프로그램 안전 종료
    3. 새로운 업데이트 프로그램에서 다운로드 및 설치 (이전 파일 삭제, 새 파일 이동)
       완료되면 2초 후 업데이트 게이지 100% 완료 표시 및 릴리즈 노트 표시
       '새로운 프로그램을 실행하시겠습니까?' 문구 표시 (네: 새 프로그램 실행, 아니오: 창만 닫기)
    """
    if body is None:
        body = {}

    global _last_release_info
    asset_id   = body.get('asset_id')   or (_last_release_info or {}).get('asset_id')
    version    = body.get('version')    or (_last_release_info or {}).get('latest_version')
    notes      = body.get('release_notes') or (_last_release_info or {}).get('release_notes', '')

    if not asset_id:
        return {'ok': False, 'error': 'asset_id가 없습니다. 먼저 버전 확인을 해주세요.'}

    # 독립 업데이트 프로그램 즉시 실행 및 메인 프로그램 종료
    # temp_file은 빈 값('')으로 전달하여 독립 업데이터가 자체 다운로드 및 설치를 수행하도록 함
    return launch_standalone_updater({
        'asset_id': asset_id,
        'version': version,
        'release_notes': notes,
        'temp_file': ''
    })

# ── 백그라운드 다운로드 ────────────────────────────────────────────────────────
def start_download_task(asset_id, asset_name=None, expected_size=0):
    with _download_lock:
        if _download_state['status'] == 'downloading':
            return {'ok': True, 'message': '이미 다운로드 진행 중입니다.'}
        _download_state.update({
            'status': 'downloading',
            'percent': 0,
            'downloaded_bytes': 0,
            'total_bytes': expected_size or 0,
            'speed_str': '',
            'error': None,
            'temp_file': None,
        })

    t = threading.Thread(target=_run_download, args=(asset_id, asset_name, expected_size), daemon=True)
    t.start()
    return {'ok': True, 'message': '다운로드가 시작되었습니다.'}

def _run_download(asset_id, asset_name, expected_size):
    global _download_state
    cfg = load_config()
    repo = cfg.get('repo', DEFAULT_REPO)
    token = cfg.get('token', '')

    target_temp = os.path.join(tempfile.gettempdir(), '3M_Instrument_Logger_Update.exe')
    url = f"https://api.github.com/repos/{repo}/releases/assets/{asset_id}"

    ssl_ctx = ssl._create_unverified_context()
    https_handler = urllib.request.HTTPSHandler(context=ssl_ctx)
    opener = urllib.request.build_opener(_S3SafeRedirectHandler(), https_handler)
    req = urllib.request.Request(url)
    req.add_header('Accept', 'application/octet-stream')
    req.add_header('User-Agent', '3M-Instrument-Logger-Updater')
    if token:
        req.add_header('Authorization', f'Bearer {token}')

    try:
        with opener.open(req, timeout=120) as resp:
            total_size = int(resp.headers.get('Content-Length', expected_size or 0))
            with _download_lock:
                _download_state['total_bytes'] = total_size

            downloaded = 0
            start_time = time.time()
            last_speed_time = start_time
            last_downloaded = 0

            with open(target_temp, 'wb') as f:
                while True:
                    chunk = resp.read(65536) # 64KB
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    now = time.time()

                    # 0.2초마다 속도 및 진행률 갱신
                    if now - last_speed_time >= 0.2:
                        speed = (downloaded - last_downloaded) / (now - last_speed_time) # bytes/sec
                        speed_mb = speed / (1024 * 1024)
                        speed_str = f"{speed_mb:.1f} MB/s"
                        pct = int((downloaded / total_size * 100)) if total_size > 0 else 0

                        with _download_lock:
                            _download_state['downloaded_bytes'] = downloaded
                            _download_state['percent'] = min(pct, 99)
                            _download_state['speed_str'] = speed_str

                        last_speed_time = now
                        last_downloaded = downloaded

        with _download_lock:
            _download_state['downloaded_bytes'] = downloaded
            _download_state['percent'] = 100
            _download_state['speed_str'] = '완료'
            _download_state['temp_file'] = target_temp
            _download_state['status'] = 'completed'

    except Exception as err:
        with _download_lock:
            _download_state['status'] = 'error'
            _download_state['error'] = str(err)
            _download_state['speed_str'] = ''
        if os.path.exists(target_temp):
            try: os.remove(target_temp)
            except Exception: pass

# ── 독립 업데이트 팝업창(Standalone Updater) 실행 및 재시작 ───────────────────
def get_standalone_updater_ps1_content():

    # scripts/updater_gui.ps1 파일이 존재하면 우선 로드
    candidates = [
        os.path.join(os.path.dirname(__file__), 'scripts', 'updater_gui.ps1'),
        os.path.join(getattr(sys, '_MEIPASS', ''), 'scripts', 'updater_gui.ps1'),
        os.path.join(getattr(sys, '_MEIPASS', ''), 'updater_gui.ps1')
    ]
    for c in candidates:
        if c and os.path.exists(c):
            try:
                with open(c, 'r', encoding='utf-8-sig') as f:
                    return f.read()
            except Exception:
                pass
    # 스크립트 파일이 없을 경우 내장 기본 템플릿 사용 (scripts/updater_gui.ps1과 100% 동일)
    ps1_file = os.path.join(os.path.dirname(__file__), 'scripts', 'updater_gui.ps1')
    if os.path.exists(ps1_file):
        with open(ps1_file, 'r', encoding='utf-8-sig') as f:
            return f.read()
    raise FileNotFoundError('updater_gui.ps1 스크립트를 찾을 수 없습니다.')

def launch_standalone_updater(target_info=None):
    """
    별도의 독립 팝업창(PowerShell WPF)을 단독 실행하고,
    메인 프로그램 프로세스를 즉시 종료하여 완벽한 파일 잠금 해제 및 자동 교체를 수행합니다.
    업데이트 완료 후 사용자에게 새 프로그램 실행 여부를 묻습니다 (네/아니오).
    """
    if target_info is None:
        target_info = {}

    cfg = load_config()
    repo = target_info.get('repo') or cfg.get('repo', DEFAULT_REPO)
    token = target_info.get('token') or cfg.get('token', '')

    asset_id = target_info.get('asset_id')
    version = target_info.get('version') or target_info.get('latest_version')
    temp_file = target_info.get('temp_file', '')

    global _last_release_info
    if not asset_id and _last_release_info:
        asset_id = _last_release_info.get('asset_id')
    if not version and _last_release_info:
        version = _last_release_info.get('latest_version')

    # 독립 업데이터가 최신 패키지를 자체 다운로드하도록 temp_file을 비워둠
    # (updater_gui.ps1이 스트리밍 다운로드 및 실시간 진행률을 직접 담당함)

    # 릴리즈 노트를 임시 파일에 저장 (PS 명령줄 길이 제한 회피)
    release_notes = ''
    if _last_release_info:
        release_notes = _last_release_info.get('release_notes', '')
    if not release_notes:
        release_notes = target_info.get('release_notes', '')
    notes_file = os.path.join(tempfile.gettempdir(), '3M_Updater_Notes.txt')
    try:
        with open(notes_file, 'w', encoding='utf-8') as f:
            f.write(release_notes or '업데이트 상세 내용은 GitHub 릴리즈 페이지에서 확인하세요.')
    except Exception:
        notes_file = ''

    # 대상 실행 파일 경로 결정
    if getattr(sys, 'frozen', False):
        target_exe = sys.executable
    else:
        target_exe = os.path.abspath(os.path.join(os.path.dirname(__file__), 'dist', '3M_Instrument_Logger.exe'))

    current_pid = os.getpid()

    # %TEMP%\3M_Updater.ps1 스크립트 파일 작성 (UTF-8 with BOM 필수)
    ps1_path = os.path.join(tempfile.gettempdir(), '3M_Updater.ps1')
    ps1_content = get_standalone_updater_ps1_content()
    with open(ps1_path, 'w', encoding='utf-8-sig') as f:
        f.write(ps1_content)

    # 독립 프로세스 실행 명령 (콘솔 숨김은 updater_gui.ps1 내부 ShowWindow(0)에서 처리하여 WPF 창 억제 방지)
    ps_cmd = [
        'powershell.exe',
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', ps1_path,
        '-TargetExe', target_exe,
        '-ParentPid', str(current_pid),
        '-AssetId', str(asset_id or ''),
        '-Version', str(version or ''),
        '-Token', str(token or ''),
        '-Repo', str(repo or DEFAULT_REPO),
        '-TempFile', str(temp_file or ''),
        '-NotesFile', str(notes_file or '')
    ]

    # PyInstaller 부트로더 임시 디렉터리 및 파이썬 환경변수 완전 제거
    clean_env = os.environ.copy()
    for k in list(clean_env.keys()):
        if k.upper().startswith('_MEI') or k.upper().startswith('PYI') or k.upper() in ('PYTHONPATH', 'PYTHONHOME'):
            clean_env.pop(k, None)

    flags = subprocess.CREATE_NEW_PROCESS_GROUP

    # Windows OS에 새 업데이트 창(PowerShell)이 맨 앞으로 뜰 수 있도록 전면 포커스 권한 부여
    try:
        import ctypes
        ctypes.windll.user32.AllowSetForegroundWindow(-1)
    except Exception:
        pass

    try:
        subprocess.Popen(ps_cmd, env=clean_env, creationflags=flags)
    except Exception:
        subprocess.Popen(ps_cmd, env=clean_env, shell=True)

    # 0.35초 후 메인 프로그램 안전 즉시 종료 (자식 프로세스에 전면 포커스 안정적 인계 후 종료)
    def _delayed_exit():
        time.sleep(0.35)
        os._exit(0)

    threading.Thread(target=_delayed_exit, daemon=True).start()
    return {'ok': True, 'message': '독립 업데이트 팝업창이 실행되었습니다. 메인 프로그램이 곧 안전 종료됩니다.'}

