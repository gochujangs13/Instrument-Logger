Add-Type -AssemblyName System.ComponentModel
$bw = New-Object System.ComponentModel.BackgroundWorker
$bw.WorkerReportsProgress = $true
$bw.add_DoWork({
    param($s, $e)
    $s.ReportProgress(50)
})
$bw.add_ProgressChanged({
    param($s, $e)
    Write-Host "Progress: $($e.ProgressPercentage)%"
})
$bw.add_RunWorkerCompleted({
    Write-Host "Completed!"
})
$bw.RunWorkerAsync()
Start-Sleep -Seconds 1
