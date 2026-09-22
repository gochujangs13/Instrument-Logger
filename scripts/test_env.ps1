[Environment]::SetEnvironmentVariable('TEST_FOO', 'BAR', 'Process')
$before = [Environment]::GetEnvironmentVariable('TEST_FOO', 'Process')
Write-Host "Before: $before"
[Environment]::SetEnvironmentVariable('TEST_FOO', $null, 'Process')
$after = [Environment]::GetEnvironmentVariable('TEST_FOO', 'Process')
Write-Host "AfterNull: '$after'"
Write-Host "IsNull: $($null -eq $after)"

# Also test child process inheritance!
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cmd.exe"
$psi.Arguments = "/c echo FOO=%TEST_FOO%"
$psi.UseShellExecute = $true
$psi.CreateNoWindow = $true
$p = [System.Diagnostics.Process]::Start($psi)
$p.WaitForExit()
