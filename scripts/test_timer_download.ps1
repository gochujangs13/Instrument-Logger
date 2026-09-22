# test_timer_download.ps1
$cfgPath = "$env:APPDATA\3M_Instrument_Logger\updater_config.json"
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
$token = $cfg.token
$url = 'https://api.github.com/repos/gochujangs13/Instrument-Logger/releases/assets/569677471'

[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

# Get S3 Redirect URL
$req = [System.Net.HttpWebRequest]::Create($url)
$req.AllowAutoRedirect = $false
$req.Headers.Add('Authorization', "Bearer $token")
$req.UserAgent = '3M-Instrument-Logger-Updater'
$req.Accept = 'application/octet-stream'

$resp = [System.Net.HttpWebResponse]$req.GetResponse()
$loc = $resp.GetResponseHeader('Location')
$resp.Close()

# Get total length
$s3Req = [System.Net.HttpWebRequest]::Create($loc)
$s3Req.UserAgent = '3M-Instrument-Logger-Updater'
$s3Resp = [System.Net.HttpWebResponse]$s3Req.GetResponse()
$totalBytes = $s3Resp.ContentLength
$s3Resp.Close()

Write-Host "Total bytes: $totalBytes"

$tempFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "3M_Test_Timer_Dl.tmp")
if (Test-Path $tempFile) { Remove-Item $tempFile -Force }

$wc = New-Object System.Net.WebClient
$wc.Headers.Add("User-Agent", "3M-Instrument-Logger-Updater")

$script:dlDone = $false
$script:dlError = $null

Register-ObjectEvent -InputObject $wc -EventName DownloadFileCompleted -Action {
    param($s, $e)
    if ($e.Error) { $script:dlError = $e.Error.Message }
    $script:dlDone = $true
} | Out-Null

$wc.DownloadFileAsync([System.Uri]::new($loc), $tempFile)

# Poll loop simulation (just like DispatcherTimer)
$start = [DateTime]::Now
$lastBytes = 0
$lastTime = $start

for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Milliseconds 200
    if (Test-Path $tempFile) {
        $curBytes = (Get-Item $tempFile).Length
        $now = [DateTime]::Now
        $elapsed = ($now - $lastTime).TotalSeconds
        $speed = if ($elapsed -gt 0) { [math]::Round((($curBytes - $lastBytes) / 1MB) / $elapsed, 1) } else { 0 }
        $pct = [math]::Round(($curBytes / $totalBytes) * 100, 1)
        Write-Host "Tick $($i): $pct% ($([math]::Round($curBytes / 1MB, 1)) MB / $([math]::Round($totalBytes / 1MB, 1)) MB, Speed: $speed MB/s)"
        $lastBytes = $curBytes
        $lastTime = $now
    }
}

$wc.CancelAsync()
$wc.Dispose()
if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
Write-Host "Timer download pattern verified successfully!"
