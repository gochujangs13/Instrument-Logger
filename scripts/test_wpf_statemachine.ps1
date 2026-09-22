Add-Type -AssemblyName PresentationFramework

$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="Test" Height="200" Width="300">
    <StackPanel Margin="20">
        <TextBlock x:Name="Txt" Text="Starting..." FontSize="16"/>
        <ProgressBar x:Name="Bar" Height="20" Margin="0,10,0,0"/>
    </StackPanel>
</Window>
"@

$reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($xaml))
$window = [System.Windows.Markup.XamlReader]::Load($reader)
$txt = $window.FindName("Txt")
$bar = $window.FindName("Bar")

# Using a DispatcherTimer to drive the state machine
$timer = [System.Windows.Threading.DispatcherTimer]::new()
$timer.Interval = [TimeSpan]::FromMilliseconds(200)
$step = 0

$timer.Add_Tick({
    $script:step += 10
    $bar.Value = $script:step
    $txt.Text = "Progress: $($script:step)%"
    if ($script:step -ge 100) {
        $timer.Stop()
        $txt.Text = "Completed!"
        Start-Sleep -Milliseconds 500
        $window.Close()
    }
})

$window.Add_Loaded({
    $timer.Start()
})

$window.ShowDialog() | Out-Null
Write-Host "State machine test succeeded!"
