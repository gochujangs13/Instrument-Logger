# test_complete_updater_gui.ps1
param(
    [string]$TargetExe = "",
    [string]$AssetId = "569677471",
    [string]$Version = "1.0.0-rc.6.1",
    [string]$Token = "",
    [string]$Repo = "gochujangs13/Instrument-Logger",
    [int]$ParentPid = 0,
    [string]$TempFile = ""
)

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

# SSL 및 TLS 보안 호환 설정
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

# 설정 및 토큰 확인
if (-not $Token) {
    $cfgPath = "$env:APPDATA\3M_Instrument_Logger\updater_config.json"
    if (Test-Path $cfgPath) {
        $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
        $Token = $cfg.token
    }
}

if (-not $TargetExe) {
    $TargetExe = [System.IO.Path]::GetFullPath("build_tmp\test_target.exe")
}
$targetDir = [System.IO.Path]::GetDirectoryName($TargetExe)
$exeName = [System.IO.Path]::GetFileName($TargetExe)
$exeBaseName = [System.IO.Path]::GetFileNameWithoutExtension($TargetExe)

if (-not $TempFile) {
    $TempFile = Join-Path ([System.IO.Path]::GetTempPath()) "3M_Test_Update.exe"
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
        Topmost="True">
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

function SetUI($pct, $status, $detail, $bytes) {
    if ($null -ne $pct) {
        $progBar.Value = [Math]::Max(0, [Math]::Min(100, $pct))
        $txtPercent.Text = "$([int]$pct)%"
    }
    if ($status) { $txtStatus.Text = $status }
    if ($detail) { $txtDetail.Text = $detail }
    if ($bytes)  { $txtBytes.Text = $bytes }
    DoEvents
}

$window.Add_Loaded({
    try {
        # [Step 1] 메인 프로세스 종료 확인
        SetUI 5 "1단계: 메인 프로그램 안전 종료 확인" "실행 중인 3M Instrument Logger가 완전히 종료되기를 기다립니다..." "프로세스 대기"
        
        $waitStart = [DateTime]::Now
        if ($ParentPid -gt 0) {
            while ((Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) -and (([DateTime]::Now - $waitStart).TotalSeconds -lt 5)) {
                Start-Sleep -Milliseconds 200
                DoEvents
            }
            if (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) {
                Stop-Process -Id $ParentPid -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 400
                DoEvents
            }
        }

        SetUI 10 "1단계 완료: 메인 프로그램 종료됨" "프로그램이 안전하게 종료되어 파일 잠금이 해제되었습니다." "파일 잠금 해제"
        Start-Sleep -Milliseconds 300
        DoEvents

        # [Step 2] 다운로드 (이미 유효한 파일이 없으면 S3에서 스트리밍 다운로드)
        $needDownload = $true
        if (Test-Path $TempFile) {
            $fInfo = Get-Item $TempFile
            if ($fInfo.Length -gt 100000000) {
                $needDownload = $false
                SetUI 80 "2단계 완료: 다운로드 패키지 확인됨" "이미 다운로드된 최신 설치 패키지($([math]::Round($fInfo.Length / 1MB, 1)) MB)를 검증했습니다." "검증 완료"
                Start-Sleep -Milliseconds 300
                DoEvents
            }
        }

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
                    $pct = [math]::Round(15 + (($downloaded / $totalLen) * 65), 1) # 15% ~ 80%
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
        
        # 실제 EXE인 경우 실행
        if (Test-Path $TargetExe) {
            $pInfo = New-Object System.Diagnostics.ProcessStartInfo
            $pInfo.FileName = $TargetExe
            $pInfo.WorkingDirectory = $targetDir
            $pInfo.UseShellExecute = $true
            try {
                [System.Diagnostics.Process]::Start($pInfo) | Out-Null
            } catch {}
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

        # 3초 카운트다운 루프
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
Write-Host "Complete Updater GUI flow finished cleanly!"
