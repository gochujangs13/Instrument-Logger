$env:_MEIPASS2 = 'C:\fake\_MEI123'
$pInfo = New-Object System.Diagnostics.ProcessStartInfo
$pInfo.FileName = 'python.exe'
$pInfo.Arguments = '-c "import os; print(\"_MEIPASS2 is:\", repr(os.environ.get(\"_MEIPASS2\")))"'
$pInfo.UseShellExecute = $false
$pInfo.EnvironmentVariables.Remove('_MEIPASS2')
$proc = [System.Diagnostics.Process]::Start($pInfo)
$proc.WaitForExit()
