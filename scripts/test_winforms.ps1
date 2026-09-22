# test_winforms.ps1
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "3M Instrument Logger 자동 업데이트"
$form.Size = New-Object System.Drawing.Size(460, 260)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(15, 23, 42)
$form.ForeColor = [System.Drawing.Color]::FromArgb(241, 245, 249)

$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = "3M Instrument Logger 최신 버전 업데이트"
$lblTitle.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$lblTitle.Location = New-Object System.Drawing.Point(20, 20)
$lblTitle.Size = New-Object System.Drawing.Size(400, 25)
$form.Controls.Add($lblTitle)

$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Text = "업데이트 준비 중..."
$lblStatus.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$lblStatus.ForeColor = [System.Drawing.Color]::FromArgb(56, 189, 248)
$lblStatus.Location = New-Object System.Drawing.Point(20, 55)
$lblStatus.Size = New-Object System.Drawing.Size(400, 22)
$form.Controls.Add($lblStatus)

$pbar = New-Object System.Windows.Forms.ProgressBar
$pbar.Location = New-Object System.Drawing.Point(20, 85)
$pbar.Size = New-Object System.Drawing.Size(400, 20)
$pbar.Minimum = 0
$pbar.Maximum = 100
$pbar.Value = 0
$form.Controls.Add($pbar)

$lblDetail = New-Object System.Windows.Forms.Label
$lblDetail.Text = "대기 중..."
$lblDetail.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$lblDetail.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
$lblDetail.Location = New-Object System.Drawing.Point(20, 115)
$lblDetail.Size = New-Object System.Drawing.Size(400, 22)
$form.Controls.Add($lblDetail)

$btnDone = New-Object System.Windows.Forms.Button
$btnDone.Text = "확인 (3s)"
$btnDone.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$btnDone.BackColor = [System.Drawing.Color]::FromArgb(16, 185, 129)
$btnDone.ForeColor = [System.Drawing.Color]::White
$btnDone.FlatStyle = "Flat"
$btnDone.FlatAppearance.BorderSize = 0
$btnDone.Location = New-Object System.Drawing.Point(320, 160)
$btnDone.Size = New-Object System.Drawing.Size(100, 32)
$btnDone.Visible = $false
$btnDone.Add_Click({ $form.Close() })
$form.Controls.Add($btnDone)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$step = 0
$timer.Add_Tick({
    $script:step += 10
    if ($script:step -le 100) {
        $pbar.Value = $script:step
        $lblStatus.Text = "다운로드 진행 중 ($($script:step)%)"
        $lblDetail.Text = "$([math]::Round(150.8 * $script:step / 100, 1)) MB / 150.8 MB"
    } else {
        $timer.Stop()
        $lblStatus.Text = "🎉 최신 버전 업데이트가 완료되었습니다!"
        $lblStatus.ForeColor = [System.Drawing.Color]::FromArgb(74, 222, 128)
        $lblDetail.Text = "최신 버전이 정상 실행되었습니다. 잠시 후 창이 닫힙니다."
        $btnDone.Visible = $true
        
        $closeTimer = New-Object System.Windows.Forms.Timer
        $closeTimer.Interval = 1000
        $script:countdown = 3
        $closeTimer.Add_Tick({
            $script:countdown -= 1
            if ($script:countdown -le 0) {
                $closeTimer.Stop()
                $form.Close()
            } else {
                $btnDone.Text = "확인 ($($script:countdown)s)"
            }
        })
        $closeTimer.Start()
    }
})

$form.Add_Shown({
    $timer.Start()
})

$form.ShowDialog() | Out-Null
Write-Host "Form completed successfully!"
