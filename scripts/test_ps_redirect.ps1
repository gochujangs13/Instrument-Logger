$cfgPath = "$env:APPDATA\3M_Instrument_Logger\updater_config.json"
if (Test-Path $cfgPath) {
    $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
    $token = $cfg.token
} else {
    Write-Host "Config not found"
    exit 1
}

$url = 'https://api.github.com/repos/gochujangs13/Instrument-Logger/releases/assets/569677471'
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

$req = [System.Net.HttpWebRequest]::Create($url)
$req.AllowAutoRedirect = $false
$req.Headers.Add('Authorization', "Bearer $token")
$req.UserAgent = '3M-Instrument-Logger-Updater'
$req.Accept = 'application/octet-stream'

try {
    $resp = [System.Net.HttpWebResponse]$req.GetResponse()
    Write-Host "Status: $([int]$resp.StatusCode) $($resp.StatusCode)"
    $loc = $resp.GetResponseHeader('Location')
    Write-Host "Redirect Location found: $($loc.Length) chars"
    Write-Host "Redirect Domain: $([System.Uri]::new($loc).Host)"
    $s3Req = [System.Net.HttpWebRequest]::Create($loc)
    $s3Req.UserAgent = '3M-Instrument-Logger-Updater'
    $s3Resp = $s3Req.GetResponse()
    Write-Host "S3 Resp Status: $([int]$s3Resp.StatusCode)"
    Write-Host "S3 Content-Length: $($s3Resp.ContentLength) bytes"
    $s3Resp.Close()
    $resp.Close()
} catch [System.Net.WebException] {
    $r = [System.Net.HttpWebResponse]$_.Exception.Response
    if ($r) {
        Write-Host "WebException Status: $([int]$r.StatusCode) $($r.StatusCode)"
        $loc = $r.GetResponseHeader('Location')
        Write-Host "WebException Redirect Location: $loc"
    } else {
        Write-Host "Error without response: $($_.Exception.Message)"
    }
}
