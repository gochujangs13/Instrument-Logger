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
DEFAULT_REPO = "gochujangs13/3M-Instrument-Logger-Update"

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
    if os.path.exists(p):
        try:
            with open(p, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
                return {
                    'repo': cfg.get('repo', DEFAULT_REPO).strip(),
                    'token': cfg.get('token', '').strip(),
                }
        except Exception:
            pass
    return {'repo': DEFAULT_REPO, 'token': ''}

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
        'masked_token': masked
    }

# ── 버전 비교 유틸 ─────────────────────────────────────────────────────────────
def parse_version_tuple(v_str):
    """'1.0.0-rc.6' -> (1, 0, 0, 6), 'v1.0.1' -> (1, 0, 1, 0)"""
    nums = [int(n) for n in re.findall(r'\d+', str(v_str))]
    while len(nums) < 4:
        nums.append(0)
    return tuple(nums[:4])

def is_newer_version(latest_str, current_str):
    t_latest = parse_version_tuple(latest_str)
    t_current = parse_version_tuple(current_str)
    return t_latest > t_current

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
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        # 오프라인이거나 타임아웃, 토큰 미설정 등 오류 시 무중단 실행을 위해 ok: True 반환
        return {
            'ok': True,
            'update_available': False,
            'current_version': current_version,
            'reason': f"GitHub API 확인 불가 ({e})",
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

    return {
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

    opener = urllib.request.build_opener(_S3SafeRedirectHandler())
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

# ── 자가 교체 및 재시작 ────────────────────────────────────────────────────────
def apply_update_and_restart():
    with _download_lock:
        if _download_state['status'] != 'completed' or not _download_state.get('temp_file'):
            return {'ok': False, 'error': '다운로드가 완료되지 않았습니다.'}
        new_exe = _download_state['temp_file']

    if not os.path.exists(new_exe):
        return {'ok': False, 'error': f'새 실행 파일을 찾을 수 없습니다: {new_exe}'}

    current_pid = os.getpid()

    # 현재 실행 중인 대상 EXE 경로
    if getattr(sys, 'frozen', False):
        target_exe = sys.executable
    else:
        # 개발 환경(Python 스크립트 실행)에서는 dist 내 EXE 경로를 타깃으로
        target_exe = os.path.abspath(os.path.join(os.path.dirname(__file__), 'dist', '3M_Instrument_Logger.exe'))

    # 자가 교체 배치 스크립트 작성
    bat_path = os.path.join(tempfile.gettempdir(), '3M_Instrument_Logger_updater.bat')
    bat_content = f"""@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set "TARGET={target_exe}"
set "NEW_FILE={new_exe}"
set "PID={current_pid}"

echo ========================================================
echo [3M Instrument Logger] 자동 업데이트를 진행하고 있습니다...
echo ========================================================
echo 프로세스(!PID!)가 종료되기를 기다리는 중...

:wait_loop
timeout /t 1 /nobreak >nul
tasklist /fi "PID eq !PID!" 2>nul | findstr /i "!PID!" >nul
if not errorlevel 1 (
    goto wait_loop
)

echo 최신 파일로 교체 중...
:copy_loop
copy /y "!NEW_FILE!" "!TARGET!" >nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto copy_loop
)

del "!NEW_FILE!" >nul 2>&1

echo 업데이트 완료! 프로그램을 다시 시작합니다...
start "" "!TARGET!"

(goto) 2>nul & del "%~f0"
exit
"""
    with open(bat_path, 'w', encoding='utf-8') as bf:
        bf.write(bat_content)

    # 백그라운드 독립 프로세스로 배치 스크립트 실행
    try:
        DETACHED = 0x00000008 | 0x00000200 # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        subprocess.Popen(['cmd.exe', '/c', bat_path], creationflags=DETACHED, close_fds=True)
    except Exception:
        subprocess.Popen(['cmd.exe', '/c', bat_path], shell=True)

    # 1.5초 후 메인 프로그램 자동 종료 예약
    def _delayed_exit():
        time.sleep(1.5)
        os._exit(0)

    threading.Thread(target=_delayed_exit, daemon=True).start()
    return {'ok': True, 'message': '업데이트 스크립트가 실행되었습니다. 프로그램이 곧 재시작됩니다.'}
