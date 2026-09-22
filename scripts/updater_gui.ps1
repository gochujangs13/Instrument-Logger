<#
.SYNOPSIS
    3M Instrument Logger 독립 자동 업데이트 팝업창 (PowerShell WPF)
    - 메인 프로그램 프로세스 종료 감지 및 파일 잠금 해제
    - GitHub Private S3 릴리즈 다운로드 (0% ~ 100% 실시간 게이지)
    - 새 파일로 실행 파일 안전 교체
    - 완료 후 릴리즈 노트 표시 및 사용자 선택 (네/아니오)
#>

param(
    [string]$TargetExe = "",
    [string]$AssetId = "",
    [string]$Version = "",
    [string]$Token = "",
    [string]$Repo = "gochujangs13/Instrument-Logger",
    [int]$ParentPid = 0,
    [string]$TempFile = "",
    [string]$NotesFile = ""
)

# PyInstaller 부트로더 임시 환경변수 원천 제거
Remove-Item env:_MEIPASS* -ErrorAction SilentlyContinue
Remove-Item env:PYI* -ErrorAction SilentlyContinue
[Environment]::SetEnvironmentVariable("_MEIPASS2", $null, [System.EnvironmentVariableTarget]::Process)
[Environment]::SetEnvironmentVariable("_MEIPASS", $null, [System.EnvironmentVariableTarget]::Process)
[Environment]::SetEnvironmentVariable("PYI_PARENT_PID", $null, [System.EnvironmentVariableTarget]::Process)
[Environment]::SetEnvironmentVariable("PYTHONPATH", $null, [System.EnvironmentVariableTarget]::Process)
[Environment]::SetEnvironmentVariable("PYTHONHOME", $null, [System.EnvironmentVariableTarget]::Process)

# 콘솔 창 즉시 숨김 (WPF 단독 팝업 표시)
Add-Type -Name Win32 -Namespace Native -MemberDefinition '
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
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

# 릴리즈 노트 로드
$releaseNotesText = ""
if ($NotesFile -and (Test-Path $NotesFile)) {
    try {
        $releaseNotesText = Get-Content $NotesFile -Raw -Encoding UTF8
    } catch {}
}
if (-not $releaseNotesText) {
    $releaseNotesText = "업데이트 상세 내용은 GitHub 릴리즈 페이지에서 확인하세요."
}

# ── WPF UI XAML ──────────────────────────────────────────────────────────────
$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="3M Instrument Logger 자동 업데이트"
        Height="520" Width="500"
        WindowStartupLocation="CenterScreen"
        WindowState="Normal"
        ShowActivated="True"
        Focusable="True"
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

                <!-- Release Notes (처음에는 숨김, 완료 후 표시) -->
                <Border x:Name="BoxNotes" Background="#1e293b" CornerRadius="8" Padding="12,10" Margin="0,12,0,0" BorderBrush="#334155" BorderThickness="1" Visibility="Collapsed">
                    <StackPanel>
                        <TextBlock Text="📋 이번 업데이트 주요 내용" Foreground="#38bdf8" FontWeight="Bold" FontSize="12" Margin="0,0,0,6"/>
                        <ScrollViewer MaxHeight="110" VerticalScrollBarVisibility="Auto">
                            <TextBlock x:Name="TxtNotes" Text="" Foreground="#cbd5e1" FontSize="11.5" TextWrapping="Wrap" LineHeight="18"/>
                        </ScrollViewer>
                    </StackPanel>
                </Border>

                <!-- Prompt Box (완료 후 표시: 새로운 프로그램 실행하시겠습니까?) -->
                <Border x:Name="BoxPrompt" Background="#0f2942" CornerRadius="8" Padding="10,8" Margin="0,10,0,0" BorderBrush="#38bdf8" BorderThickness="1.2" Visibility="Collapsed">
                    <TextBlock Text="💡 새로운 프로그램을 지금 실행하시겠습니까?" Foreground="#7dd3fc" FontWeight="Bold" FontSize="12.5" HorizontalAlignment="Center"/>
                </Border>
            </StackPanel>

            <!-- Bottom Action Row -->
            <Grid Grid.Row="2">
                <TextBlock x:Name="TxtFooter" Text="업데이트 중에는 창을 닫지 마세요." Foreground="#475569" FontSize="11" VerticalAlignment="Center"/>
                
                <!-- 진행 중 단일 버튼 (오류 시 닫기 등) -->
                <Button x:Name="BtnAction" Content="닫기" Width="100" Height="32" HorizontalAlignment="Right" Visibility="Collapsed"
                        Background="#ef4444" Foreground="White" FontWeight="Bold" BorderThickness="0" Cursor="Hand">
                    <Button.Resources>
                        <Style TargetType="Border">
                            <Setter Property="CornerRadius" Value="6"/>
                        </Style>
                    </Button.Resources>
                </Button>

                <!-- 완료 후 네/아니오 버튼 (처음에는 숨김) -->
                <StackPanel x:Name="PnlComplete" Orientation="Horizontal" HorizontalAlignment="Right" Visibility="Collapsed">
                    <Button x:Name="BtnNo" Content="아니오" Width="90" Height="34" Margin="0,0,8,0"
                            Background="#475569" Foreground="#e2e8f0" FontWeight="Bold" FontSize="13" BorderThickness="0" Cursor="Hand">
                        <Button.Resources>
                            <Style TargetType="Border">
                                <Setter Property="CornerRadius" Value="6"/>
                            </Style>
                        </Button.Resources>
                    </Button>
                    <Button x:Name="BtnYes" Content="네" Width="90" Height="34"
                            Background="#10b981" Foreground="White" FontWeight="Bold" FontSize="13" BorderThickness="0" Cursor="Hand">
                        <Button.Resources>
                            <Style TargetType="Border">
                                <Setter Property="CornerRadius" Value="6"/>
                            </Style>
                        </Button.Resources>
                    </Button>
                </StackPanel>
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
$boxNotes    = $window.FindName("BoxNotes")
$boxPrompt   = $window.FindName("BoxPrompt")
$txtNotes    = $window.FindName("TxtNotes")
$btnAction   = $window.FindName("BtnAction")
$pnlComplete = $window.FindName("PnlComplete")
$btnYes      = $window.FindName("BtnYes")
$btnNo       = $window.FindName("BtnNo")
$txtFooter   = $window.FindName("TxtFooter")

# "아니오" 클릭 → 업데이터만 닫기
$script:userChoice = "none"
$btnNo.Add_Click({
    $script:userChoice = "no"
    $window.Close()
})

# "네" 클릭 → 새 프로그램 실행 후 업데이터 닫기
$btnYes.Add_Click({
    $script:userChoice = "yes"
    $window.Close()
})

# 오류 시 닫기 버튼
$btnAction.Add_Click({
    $script:userChoice = "close"
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
            # ALT 키 탭 시뮬레이션으로 Windows Foreground Lockout 완전 해제
            [Native.Win32]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
            [Native.Win32]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)

            # SW_RESTORE (9) 로 창 표시 및 복원
            [Native.Win32]::ShowWindow($script:hWndWpf, 9) | Out-Null

            $fgWnd = [Native.Win32]::GetForegroundWindow()
            if ($fgWnd -ne [IntPtr]::Zero -and $fgWnd -ne $script:hWndWpf) {
                $fgThread = [Native.Win32]::GetWindowThreadProcessId($fgWnd, [IntPtr]::Zero)
                $curThread = [Native.Win32]::GetCurrentThreadId()
                if ($fgThread -ne $curThread -and $fgThread -ne 0) {
                    [Native.Win32]::AttachThreadInput($curThread, $fgThread, $true) | Out-Null
                    [Native.Win32]::SetForegroundWindow($script:hWndWpf) | Out-Null
                    [Native.Win32]::BringWindowToTop($script:hWndWpf) | Out-Null
                    [Native.Win32]::AttachThreadInput($curThread, $fgThread, $false) | Out-Null
                }
            }
            # HWND_TOPMOST (-1), SWP_NOMOVE(2) | SWP_NOSIZE(1) | SWP_SHOWWINDOW(0x40) = 0x43
            [Native.Win32]::SetWindowPos($script:hWndWpf, [IntPtr]-1, 0, 0, 0, 0, 0x0043) | Out-Null
            [Native.Win32]::BringWindowToTop($script:hWndWpf) | Out-Null
            [Native.Win32]::SetForegroundWindow($script:hWndWpf) | Out-Null
            [Native.Win32]::SwitchToThisWindow($script:hWndWpf, $true)
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

$window.Add_SourceInitialized({
    $interop = New-Object System.Windows.Interop.WindowInteropHelper($window)
    $script:hWndWpf = $interop.Handle
    ForceForeground
})

$window.Add_ContentRendered({
    # 창이 화면에 100% 렌더링되어 표시된 직후 실행 (작업표시줄에만 머무는 현상 원천 차단)
    $interop = New-Object System.Windows.Interop.WindowInteropHelper($window)
    $script:hWndWpf = $interop.Handle
    ForceForeground

    [System.Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvoke(
        [System.Windows.Threading.DispatcherPriority]::Background,
        [Action]{
            # 초기 3초간 100ms마다 창을 맨 앞으로 강제 유지 (탐색기 등에 가려짐 완전 방지)
            $fgTimer = New-Object System.Windows.Threading.DispatcherTimer
            $fgTimer.Interval = [TimeSpan]::FromMilliseconds(100)
            $script:fgTicks = 0
            $fgTimer.Add_Tick({
                $script:fgTicks++
                ForceForeground
                if ($script:fgTicks -ge 30) {
                    $fgTimer.Stop()
                }
            })
            $fgTimer.Start()

            try {
                # [Step 1] 메인 프로세스 즉각 종료 및 파일 잠금 해제 (대기 없이 즉시 종료)
        SetUI 5 "1단계: 메인 프로그램 안전 종료 중..." "기존 프로그램을 안전하게 닫고 파일 잠금을 해제합니다..." "프로세스 정리"
        
        if ($ParentPid -gt 0) {
            Stop-Process -Id $ParentPid -Force -ErrorAction SilentlyContinue
        }
        Get-Process -Name $exeBaseName -ErrorAction SilentlyContinue | ForEach-Object {
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
        # 구버전 프로세스 종료 후 남은 이전 _MEI 임시 디렉터리 정리
        Get-ChildItem -Path $env:TEMP -Directory -Filter "_MEI*" -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 200
        ForceForeground
        DoEvents

        SetUI 10 "1단계 완료: 메인 프로그램 종료됨" "프로그램이 안전하게 종료되어 파일 잠금이 해제되었습니다." "파일 잠금 해제"
        Start-Sleep -Milliseconds 200
        DoEvents

        # [Step 2] 최신 버전 패키지 다운로드 (15% ~ 80%)
        if (Test-Path $TempFile) {
            Remove-Item -Path $TempFile -Force -ErrorAction SilentlyContinue
        }

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

        # [Step 3] 이전 파일 삭제 및 새 파일로 교체 (80% ~ 98%)
        SetUI 85 "3단계: 이전 버전 삭제 및 최신 버전 설치 중..." "기존 $exeName 파일을 삭제하고 최신 버전으로 교체합니다..." "파일 교체 중"
        
        $copied = $false
        $attempts = 0
        while (-not $copied -and $attempts -lt 25) {
            $attempts += 1
            try {
                # 이전 파일 삭제
                if (Test-Path $TargetExe) {
                    Remove-Item -Path $TargetExe -Force -ErrorAction Stop
                }
                # 새 파일 이동
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

        SetUI 98 "3단계 완료: 파일 교체 성공" "최신 버전 파일 교체가 성공적으로 완료되었습니다." "교체 완료"
        
        # 임시 디렉터리 정리는 Step 1에서 완료됨 (새 프로그램 실행 중 오삭제 방지)

        # 임시 다운로드 파일 정리
        if (Test-Path $TempFile) {
            Remove-Item -Path $TempFile -Force -ErrorAction SilentlyContinue
        }

        DoEvents

        # [Step 4] 2초 대기 → 100% 완료 표시
        Start-Sleep -Milliseconds 2000
        DoEvents

        # ── 100% 완료 UI 전환 ────────────────────────────────────────────────────
        $progBar.Value = 100
        $txtPercent.Text = "100%"
        $txtStatus.Text = "🎉 업데이트가 완료되었습니다!"
        $txtStatus.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#4ade80")
        $txtDetail.Text = "최신 버전(v$Version)이 성공적으로 설치되었습니다."
        $txtDetail.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#cbd5e1")
        $boxDetail.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#059669")
        $boxDetail.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#064e3b")
        $progBar.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#10b981")
        $txtBytes.Text = "업데이트 완료"
        
        # 릴리즈 노트 및 실행 확인 안내 표시
        $txtNotes.Text = $releaseNotesText
        $boxNotes.Visibility = [System.Windows.Visibility]::Visible
        $boxPrompt.Visibility = [System.Windows.Visibility]::Visible

        # 하단 안내 및 네/아니오 버튼 표시
        $txtFooter.Text = "[네] 새 버전 실행  /  [아니오] 창 닫기"
        $txtFooter.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#94a3b8")
        $pnlComplete.Visibility = [System.Windows.Visibility]::Visible

        ForceForeground
        DoEvents

        # 사용자가 네/아니오를 누를 때까지 대기 (WPF ShowDialog가 자체 대기)

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
}) | Out-Null
})

$window.ShowDialog() | Out-Null

# ── 창 닫힌 후 사용자 선택에 따른 동작 ──────────────────────────────────────
if ($script:userChoice -eq "yes") {
    # "네" 선택 → 새 프로그램 실행

    # 환경변수 정화 (PyInstaller 부트로더 변수 소거)
    Remove-Item env:_MEIPASS* -ErrorAction SilentlyContinue
    Remove-Item env:PYI* -ErrorAction SilentlyContinue
    [Environment]::SetEnvironmentVariable("_MEIPASS2", $null, [System.EnvironmentVariableTarget]::Process)
    [Environment]::SetEnvironmentVariable("_MEIPASS", $null, [System.EnvironmentVariableTarget]::Process)
    [Environment]::SetEnvironmentVariable("PYI_PARENT_PID", $null, [System.EnvironmentVariableTarget]::Process)
    [Environment]::SetEnvironmentVariable("PYTHONPATH", $null, [System.EnvironmentVariableTarget]::Process)
    [Environment]::SetEnvironmentVariable("PYTHONHOME", $null, [System.EnvironmentVariableTarget]::Process)

    # Windows Explorer(데스크톱 셸)를 통해 완전히 독립된 프로세스로 기동
    # (탐색기 더블클릭과 100% 동일하여 콘솔 종속/환경변수 오염/조기 종료 문제 원천 방지)
    try {
        Start-Process -FilePath "explorer.exe" -ArgumentList "`"$TargetExe`""
        Start-Sleep -Milliseconds 300
    } catch {
        try {
            Start-Process -FilePath $TargetExe -WorkingDirectory $targetDir
        } catch {}
    }
}
# "아니오" 또는 "close" 선택 → 아무 동작 없이 스크립트 종료
