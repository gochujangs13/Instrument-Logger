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
DEFAULT_TOKEN = ""

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
    return r"""<#
.SYNOPSIS
    3M Instrument Logger 독립 자동 업데이트 팝업창 (PowerShell WPF)
    - 메인 프로그램 프로세스 종료 감지 및 파일 잠금 해제
    - GitHub Private S3 릴리즈 다운로드 (0% ~ 100% 실시간 게이지)
    - 새 파일로 실행 파일 안전 교체
    - 최신 버전 자동 재실행
    - "완료되었습니다" 안내 후 자동 종료
#>

param(
    [string]$TargetExe = "",
    [string]$AssetId = "",
    [string]$Version = "",
    [string]$Token = "",
    [string]$Repo = "gochujangs13/Instrument-Logger",
    [int]$ParentPid = 0,
    [string]$TempFile = ""
)

# 콘솔 창 즉시 숨김 (WPF 단독 팝업 표시)
Add-Type -Name Win32 -Namespace Native -MemberDefinition '
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
'
$hConsole = [Native.Win32]::GetConsoleWindow()
if ($hConsole -ne [IntPtr]::Zero) {
    [Native.Win32]::ShowWindow($hConsole, 0)
}

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

# SSL 및 TLS 보안 호환 설정 (사내망/프록시 환경 인증서 오류 방지)
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

# 설정 및 토큰 확인
if (-not $Token) {
    $cfgPath = "$env:APPDATA\3M_Instrument_Logger\updater_config.json"
    if (Test-Path $cfgPath) {
        try {
            $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
            $Token = $cfg.token
        } catch {}
    }
}

$TargetExe = [System.IO.Path]::GetFullPath($TargetExe)
$targetDir = [System.IO.Path]::GetDirectoryName($TargetExe)
$exeName = [System.IO.Path]::GetFileName($TargetExe)
$exeBaseName = [System.IO.Path]::GetFileNameWithoutExtension($TargetExe)

if (-not $TempFile) {
    $TempFile = Join-Path ([System.IO.Path]::GetTempPath()) "3M_Instrument_Logger_Update.exe"
}

# ── WPF UI XAML ──────────────────────────────────────────────────────────────
$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="3M Instrument Logger 자동 업데이트"
        Height="360" Width="480"
        WindowStartupLocation="CenterScreen"
        WindowStyle="None"
        AllowsTransparency="True"
        Background="Transparent"
        Topmost="True"
        ShowInTaskbar="True">
    <Border Background="#0f172a" CornerRadius="12" BorderBrush="#334155" BorderThickness="1.5">
        <Border.Effect>
            <DropShadowEffect Color="#000000" BlurRadius="25" ShadowDepth="8" Opacity="0.65"/>
        </Border.Effect>
        <Grid Margin="24">
            <Grid.RowDefinitions>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="*"/>
                <RowDefinition Height="Auto"/>
            </Grid.RowDefinitions>

            <!-- Header -->
            <Grid Grid.Row="0">
                <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
                    <Border Background="#ef4444" CornerRadius="6" Width="28" Height="28" Margin="0,0,10,0">
                        <TextBlock Text="3M" Foreground="White" FontWeight="Bold" FontSize="13" 
                                   HorizontalAlignment="Center" VerticalAlignment="Center"/>
                    </Border>
                    <StackPanel>
                        <TextBlock Text="3M Instrument Logger" Foreground="#f8fafc" FontWeight="Bold" FontSize="15"/>
                        <TextBlock x:Name="TxtSubTitle" Text="최신 버전(v$Version) 자동 업데이트" Foreground="#94a3b8" FontSize="12" Margin="0,2,0,0"/>
                    </StackPanel>
                </StackPanel>
            </Grid>

            <!-- Body / Progress Area -->
            <StackPanel Grid.Row="1" VerticalAlignment="Center" Margin="0,15,0,15">
                <TextBlock x:Name="TxtStatus" Text="업데이트 준비 중..." Foreground="#38bdf8" FontWeight="SemiBold" FontSize="14" Margin="0,0,0,12"/>
                
                <!-- Progress Track -->
                <Grid Height="12">
                    <Border Background="#1e293b" CornerRadius="6"/>
                    <ProgressBar x:Name="ProgBar" Minimum="0" Maximum="100" Value="0" Height="12"
                                 Foreground="#3b82f6" Background="Transparent" BorderThickness="0"/>
                </Grid>

                <!-- Stats Row -->
                <Grid Margin="0,8,0,0">
                    <TextBlock x:Name="TxtPercent" Text="0%" Foreground="#f1f5f9" FontWeight="Bold" FontSize="12" HorizontalAlignment="Left"/>
                    <TextBlock x:Name="TxtBytes" Text="대기 중..." Foreground="#64748b" FontSize="12" HorizontalAlignment="Right"/>
                </Grid>

                <!-- Speed / Detail Box -->
                <Border x:Name="BoxDetail" Background="#1e293b" CornerRadius="8" Padding="12,10" Margin="0,16,0,0" BorderBrush="#334155" BorderThickness="1">
                    <TextBlock x:Name="TxtDetail" Text="메인 프로그램의 안전 종료를 확인하고 있습니다..." Foreground="#94a3b8" FontSize="12" TextWrapping="Wrap"/>
                </Border>
            </StackPanel>

            <!-- Bottom Action Row -->
            <Grid Grid.Row="2">
                <TextBlock x:Name="TxtFooter" Text="업데이트 중에는 창을 닫지 마세요." Foreground="#475569" FontSize="11" VerticalAlignment="Center"/>
                <Button x:Name="BtnAction" Content="확인 및 닫기 (3s)" Width="130" Height="32" HorizontalAlignment="Right" Visibility="Collapsed"
                        Background="#10b981" Foreground="White" FontWeight="Bold" BorderThickness="0" Cursor="Hand">
                    <Button.Resources>
                        <Style TargetType="Border">
                            <Setter Property="CornerRadius" Value="6"/>
                        </Style>
                    </Button.Resources>
                </Button>
            </Grid>
        </Grid>
    </Border>
</Window>
"@

$reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($xaml))
$window = [System.Windows.Markup.XamlReader]::Load($reader)
$window.Add_MouseLeftButtonDown({ $window.DragMove() })

$txtSubTitle = $window.FindName("TxtSubTitle")
$txtStatus   = $window.FindName("TxtStatus")
$progBar     = $window.FindName("ProgBar")
$txtPercent  = $window.FindName("TxtPercent")
$txtBytes    = $window.FindName("TxtBytes")
$txtDetail   = $window.FindName("TxtDetail")
$boxDetail   = $window.FindName("BoxDetail")
$btnAction   = $window.FindName("BtnAction")
$txtFooter   = $window.FindName("TxtFooter")

$script:closeRequested = $false
$btnAction.Add_Click({ 
    $script:closeRequested = $true
    $window.Close() 
})

function DoEvents {
    $frame = New-Object System.Windows.Threading.DispatcherFrame
    [System.Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvoke(
        [System.Windows.Threading.DispatcherPriority]::Background,
        [Action[System.Windows.Threading.DispatcherFrame]]{ param($f) $f.Continue = $false },
        $frame
    ) | Out-Null
    [System.Windows.Threading.Dispatcher]::PushFrame($frame)
}

$script:hWndWpf = [IntPtr]::Zero

function ForceForeground {
    try {
        if ($script:hWndWpf -and $script:hWndWpf -ne [IntPtr]::Zero) {
            # HWND_TOPMOST (-1), SWP_NOMOVE(2) | SWP_NOSIZE(1) | SWP_SHOWWINDOW(0x40) = 0x43
            [Native.Win32]::SetWindowPos($script:hWndWpf, [IntPtr]-1, 0, 0, 0, 0, 0x0043) | Out-Null
            [Native.Win32]::BringWindowToTop($script:hWndWpf) | Out-Null
            [Native.Win32]::SetForegroundWindow($script:hWndWpf) | Out-Null
        }
        $window.Topmost = $false
        $window.Topmost = $true
        $window.Activate()
        $window.Focus()
    } catch {}
}

function SetUI($pct, $status, $detail, $bytes) {
    if ($null -ne $pct) {
        $progBar.Value = [Math]::Max(0, [Math]::Min(100, $pct))
        $txtPercent.Text = "$([int]$pct)%"
    }
    if ($status) { $txtStatus.Text = $status }
    if ($detail) { $txtDetail.Text = $detail }
    if ($bytes)  { $txtBytes.Text = $bytes }
    ForceForeground
    DoEvents
}

$window.Add_Loaded({
    try {
        # WPF 윈도우 핸들 등록 및 최상위 전면 고정
        $interop = New-Object System.Windows.Interop.WindowInteropHelper($window)
        $script:hWndWpf = $interop.Handle
        ForceForeground

        # [Step 1] 메인 프로그램 즉각 종료 및 파일 잠금 해제 (대기 없이 즉시 종료)
        SetUI 5 "1단계: 메인 프로그램 안전 종료 중..." "기존 프로그램을 안전하게 닫고 파일 잠금을 해제합니다..." "프로세스 정리"
        
        if ($ParentPid -gt 0) {
            Stop-Process -Id $ParentPid -Force -ErrorAction SilentlyContinue
        }
        Get-Process -Name $exeBaseName -ErrorAction SilentlyContinue | ForEach-Object {
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 200
        ForceForeground
        DoEvents

        SetUI 10 "1단계 완료: 메인 프로그램 종료됨" "프로그램이 안전하게 종료되어 파일 잠금이 해제되었습니다." "파일 잠금 해제"
        Start-Sleep -Milliseconds 200
        DoEvents

        # [Step 2] 다운로드 (이전 임시 파일 정리 후 최신 패키지 스트리밍 다운로드)
        if (Test-Path $TempFile) {
            Remove-Item -Path $TempFile -Force -ErrorAction SilentlyContinue
        }
        $needDownload = $true

        if ($needDownload) {
            SetUI 15 "2단계: 최신 버전 다운로드 준비 중..." "GitHub 릴리즈 서버 연결 및 다운로드 주소 확인 중..." "서버 연결"
            
            $apiUrl = "https://api.github.com/repos/$Repo/releases/assets/$AssetId"
            $req = [System.Net.HttpWebRequest]::Create($apiUrl)
            $req.AllowAutoRedirect = $false
            if ($Token) {
                $req.Headers.Add("Authorization", "Bearer $Token")
            }
            $req.UserAgent = "3M-Instrument-Logger-Updater"
            $req.Accept = "application/octet-stream"

            $s3Url = ""
            try {
                $resp = [System.Net.HttpWebResponse]$req.GetResponse()
                $s3Url = $resp.GetResponseHeader("Location")
                $resp.Close()
            } catch [System.Net.WebException] {
                $r = [System.Net.HttpWebResponse]$_.Exception.Response
                if ($r -and ($r.StatusCode -eq 302 -or $r.StatusCode -eq 301)) {
                    $s3Url = $r.GetResponseHeader("Location")
                    $r.Close()
                } else {
                    throw "GitHub API 응답 오류: $($_.Exception.Message)"
                }
            }

            if (-not $s3Url) {
                throw "다운로드 URL 획득 실패 (S3 Redirect Location 없음)"
            }

            # 직접 스트리밍 다운로드 (0-80% 게이지)
            $s3Req = [System.Net.HttpWebRequest]::Create($s3Url)
            $s3Req.UserAgent = "3M-Instrument-Logger-Updater"
            $s3Resp = [System.Net.HttpWebResponse]$s3Req.GetResponse()
            $totalLen = $s3Resp.ContentLength
            $totalMb = [math]::Round($totalLen / 1MB, 1)

            $sStream = $s3Resp.GetResponseStream()
            $fStream = [System.IO.File]::Create($TempFile)

            $buffer = New-Object byte[] 65536
            $downloaded = 0
            $lastUpdate = [DateTime]::Now
            $lastBytes = 0

            while (($read = $sStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $fStream.Write($buffer, 0, $read)
                $downloaded += $read

                $now = [DateTime]::Now
                $elapsed = ($now - $lastUpdate).TotalSeconds
                if ($elapsed -ge 0.15) {
                    $speed = [math]::Round((($downloaded - $lastBytes) / 1MB) / $elapsed, 1)
                    $pct = [math]::Round(15 + (($downloaded / $totalLen) * 65), 1)
                    $curMb = [math]::Round($downloaded / 1MB, 1)
                    SetUI $pct "2단계: 최신 버전 다운로드 중..." "다운로드 진행 중 ($speed MB/s)" "$curMb MB / $totalMb MB"
                    $lastUpdate = $now
                    $lastBytes = $downloaded
                }
            }

            $fStream.Close()
            $sStream.Close()
            $s3Resp.Close()
            SetUI 80 "2단계 완료: 다운로드 완료" "최신 버전 패키지($totalMb MB) 다운로드가 완료되었습니다." "100% 수신"
            Start-Sleep -Milliseconds 300
            DoEvents
        }

        # [Step 3] 새 파일로 교체 (80% ~ 90%)
        SetUI 85 "3단계: 최신 버전 파일 교체 중..." "기존 $exeName 파일을 최신 버전으로 교체합니다..." "파일 교체 중"
        
        $copied = $false
        $attempts = 0
        while (-not $copied -and $attempts -lt 25) {
            $attempts += 1
            try {
                Copy-Item -Path $TempFile -Destination $TargetExe -Force -ErrorAction Stop
                $copied = $true
            } catch {
                Get-Process -Name $exeBaseName -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 300
                DoEvents
            }
        }

        if (-not $copied) {
            throw "파일 교체 실패: 대상 실행 파일($TargetExe)이 여전히 잠겨 있습니다."
        }

        SetUI 95 "3단계 완료: 파일 교체 성공" "최신 버전 파일 교체가 성공적으로 완료되었습니다." "교체 완료"
        Start-Sleep -Milliseconds 300
        DoEvents

        # [Step 4] 최신 버전 자동 재실행
        SetUI 98 "4단계: 최신 버전 자동 재실행 중..." "3M Instrument Logger를 시작하는 중입니다..." "프로그램 기동"
        
        $started = $false
        $startAttempts = 0
        while (-not $started -and $startAttempts -lt 15) {
            $startAttempts += 1
            try {
                $pInfo = New-Object System.Diagnostics.ProcessStartInfo
                $pInfo.FileName = $TargetExe
                $pInfo.WorkingDirectory = $targetDir
                $pInfo.UseShellExecute = $true
                [System.Diagnostics.Process]::Start($pInfo) | Out-Null
                $started = $true
            } catch {
                Start-Sleep -Milliseconds 400
                DoEvents
            }
        }
        
        Start-Sleep -Milliseconds 500
        DoEvents

        # [Step 5] 완료 상태 전환 및 3초 카운트다운
        $progBar.Value = 100
        $txtPercent.Text = "100%"
        $txtStatus.Text = "🎉 최신 버전 업데이트가 완료되었습니다!"
        $txtStatus.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#4ade80")
        $txtDetail.Text = "최신 버전(v$Version) 프로그램이 성공적으로 실행되었습니다.`n이 창은 3초 후 자동으로 닫힙니다."
        $txtDetail.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#cbd5e1")
        $boxDetail.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#059669")
        $boxDetail.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#064e3b")
        $progBar.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#10b981")
        $txtBytes.Text = "업데이트 완료"
        $txtFooter.Text = "업데이트가 성공적으로 완료되었습니다."
        $btnAction.Visibility = [System.Windows.Visibility]::Visible
        DoEvents

        for ($s = 3; $s -ge 1; $s--) {
            if ($script:closeRequested) { break }
            $btnAction.Content = "확인 및 닫기 ($($s)s)"
            DoEvents
            for ($k = 0; $k -lt 10; $k++) {
                if ($script:closeRequested) { break }
                Start-Sleep -Milliseconds 100
                DoEvents
            }
        }

        $window.Close()

    } catch {
        $err = $_
        $txtStatus.Text = "❌ 업데이트 중 오류가 발생했습니다"
        $txtStatus.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#f87171")
        $txtDetail.Text = "오류 내용: $err"
        $boxDetail.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#dc2626")
        $boxDetail.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#450a0a")
        $btnAction.Content = "닫기"
        $btnAction.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#ef4444")
        $btnAction.Visibility = [System.Windows.Visibility]::Visible
        $txtFooter.Text = "문제가 지속되면 프로그램을 수동으로 재시작해 주세요."
        DoEvents
    }
})

$window.ShowDialog() | Out-Null
"""

def launch_standalone_updater(target_info=None):
    """
    별도의 독립 팝업창(PowerShell WPF)을 단독 실행하고,
    메인 프로그램 프로세스를 즉시 종료하여 완벽한 파일 잠금 해제 및 자동 교체·재실행을 수행합니다.
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

    with _download_lock:
        if not temp_file and _download_state.get('temp_file') and os.path.exists(_download_state['temp_file']):
            temp_file = _download_state['temp_file']

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

    # 독립 프로세스 실행 명령 (WindowStyle Hidden 없이 실행하고 ps1 시작 시 즉시 콘솔 숨김)
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
        '-TempFile', str(temp_file or '')
    ]

    try:
        subprocess.Popen(ps_cmd, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP, close_fds=True)
    except Exception:
        subprocess.Popen(ps_cmd, shell=True)

    # 0.1초 후 메인 프로그램 안전 즉시 종료
    def _delayed_exit():
        time.sleep(0.1)
        os._exit(0)

    threading.Thread(target=_delayed_exit, daemon=True).start()
    return {'ok': True, 'message': '독립 업데이트 팝업창이 실행되었습니다. 메인 프로그램이 곧 안전 종료됩니다.'}

def apply_update_and_restart(body=None):
    """
    하위 호환성을 유지하며 독립 업데이트 팝업창 실행 방식으로 위임
    """
    return launch_standalone_updater(body)
