# test_wpf_doevents.ps1
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Test WPF DoEvents" Height="200" Width="400">
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

function DoEvents {
    $frame = New-Object System.Windows.Threading.DispatcherFrame
    [System.Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvoke(
        [System.Windows.Threading.DispatcherPriority]::Background,
        [Action[System.Windows.Threading.DispatcherFrame]]{ param($f) $f.Continue = $false },
        $frame
    ) | Out-Null
    [System.Windows.Threading.Dispatcher]::PushFrame($frame)
}

$window.Add_Loaded({
    for ($i = 1; $i -le 100; $i += 5) {
        $bar.Value = $i
        $txt.Text = "Progress: $i%"
        Start-Sleep -Milliseconds 50
        DoEvents
    }
    $txt.Text = "Finished!"
    DoEvents
    Start-Sleep -Milliseconds 500
    $window.Close()
})

$window.ShowDialog() | Out-Null
Write-Host "WPF DoEvents works cleanly!"
