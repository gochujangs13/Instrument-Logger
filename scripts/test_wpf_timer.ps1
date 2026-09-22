# test_wpf_timer.ps1
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="3M Instrument Logger 자동 업데이트"
        Height="360" Width="480"
        WindowStartupLocation="CenterScreen"
        WindowStyle="None"
        AllowsTransparency="True"
        Background="Transparent">
    <Border Background="#0f172a" CornerRadius="12" BorderBrush="#334155" BorderThickness="1.5">
        <Border.Effect>
            <DropShadowEffect Color="#000000" BlurRadius="25" ShadowDepth="8" Opacity="0.6"/>
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
                        <TextBlock x:Name="TxtSubTitle" Text="최신 버전(v1.0.0-rc.6.1) 자동 업데이트" Foreground="#94a3b8" FontSize="12" Margin="0,2,0,0"/>
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
$txtStatus = $window.FindName("TxtStatus")
$progBar = $window.FindName("ProgBar")
$txtPercent = $window.FindName("TxtPercent")
$txtBytes = $window.FindName("TxtBytes")
$txtDetail = $window.FindName("TxtDetail")
$boxDetail = $window.FindName("BoxDetail")
$btnAction = $window.FindName("BtnAction")
$txtFooter = $window.FindName("TxtFooter")

$btnAction.Add_Click({ $window.Close() })

$script:pct = 0
$mainTimer = [System.Windows.Threading.DispatcherTimer]::new()
$mainTimer.Interval = [TimeSpan]::FromMilliseconds(150)

$mainTimer.Add_Tick({
    $script:pct += 5
    if ($script:pct -le 100) {
        $progBar.Value = $script:pct
        $txtPercent.Text = "$($script:pct)%"
        $txtStatus.Text = "최신 버전 다운로드 중..."
        $txtDetail.Text = "GitHub 보안 저장소에서 최신 패키지를 안전하게 내려받고 있습니다."
        $mb = [math]::Round(150.8 * $script:pct / 100, 1)
        $txtBytes.Text = "$mb MB / 150.8 MB"
    } else {
        $mainTimer.Stop()
        $txtStatus.Text = "🎉 최신 버전 업데이트가 완료되었습니다!"
        $txtStatus.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#4ade80")
        $txtDetail.Text = "최신 버전 프로그램이 정상적으로 실행되었습니다. 이 창은 잠시 후 자동으로 닫힙니다."
        $txtDetail.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#cbd5e1")
        $boxDetail.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#059669")
        $boxDetail.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#064e3b")
        $progBar.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#10b981")
        $btnAction.Visibility = [System.Windows.Visibility]::Visible

        $closeTimer = [System.Windows.Threading.DispatcherTimer]::new()
        $closeTimer.Interval = [TimeSpan]::FromSeconds(1)
        $script:countdown = 3
        $closeTimer.Add_Tick({
            $script:countdown -= 1
            if ($script:countdown -le 0) {
                $closeTimer.Stop()
                $window.Close()
            } else {
                $btnAction.Content = "확인 및 닫기 ($($script:countdown)s)"
            }
        })
        $closeTimer.Start()
    }
})

$window.Add_Loaded({
    $mainTimer.Start()
})

$window.ShowDialog() | Out-Null
Write-Host "WPF Flow completed successfully!"
