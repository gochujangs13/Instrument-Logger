# test_webclient_download.ps1
$cfgPath = "$env:APPDATA\3M_Instrument_Logger\updater_config.json"
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
$token = $cfg.token
$url = 'https://api.github.com/repos/gochujangs13/Instrument-Logger/releases/assets/569677471'

[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

$req = [System.Net.HttpWebRequest]::Create($url)
$req.AllowAutoRedirect = $false
$req.Headers.Add('Authorization', "Bearer $token")
$req.UserAgent = '3M-Instrument-Logger-Updater'
$req.Accept = 'application/octet-stream'

$resp = [System.Net.HttpWebResponse]$req.GetResponse()
$loc = $resp.GetResponseHeader('Location')
$resp.Close()

Write-Host "Direct S3 Download URL obtained!"

$wc = New-Object System.Net.WebClient
$wc.Headers.Add("User-Agent", "3M-Instrument-Logger-Updater")

Register-ObjectEvent -InputObject $wc -EventName DownloadProgressChanged -Action {
    $e = $EventArgs
    $mb = [math]::Round($e.BytesReceived / 1MB, 1)
    $tot = [math]::Round($e.TotalBytesToReceive / 1MB, 1)
    Write-Host "Progress: $($e.ProgressPercentage)% ($mb MB / $tot MB)"
} | Out-Null

Register-ObjectEvent -InputObject $wc -EventName DownloadFileCompleted -Action {
    Write-Host "Download Complete!"
    $script:done = $true
} | Out-Null

$tempFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "3M_Test_Chunk.tmp")
$wc.DownloadFileAsync([System.Uri]::new($loc), $tempFile)

# Wait up to 3 seconds just to see progress events firing
$start = [System.DateTime]::Now
while (-not $script:done -and ([System.DateTime]::Now - $start).TotalSeconds -lt 3) {
    Start-Sleep -Milliseconds 200
}
$wc.CancelAsync()
$wc.Dispose()
if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
Write-Host "WebClient test succeeded!"
