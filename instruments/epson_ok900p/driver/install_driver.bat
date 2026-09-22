@echo off
chcp 65001 >nul
title EPSON OK900P 드라이버 원클릭 자동 설치

echo ============================================================
echo   EPSON PRIFIA OK900P 라벨 프린터 드라이버 설치
echo ============================================================
echo.

:: 1. 관리자 권한 확인 및 자동 승격
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [안내] 관리자 권한이 필요합니다. 권한 승격을 요청합니다...
    powershell -NoProfile -Command "Start-Process -FilePath cmd.exe -WorkingDirectory '%~dp0' -ArgumentList '/k \"%~nx0\"' -Verb RunAs"
    exit /b
)

echo [1/3] Windows 드라이버 스토어에 드라이버 패키지 등록 및 설치 중...
set "INF_PATH=%~dp0LW900P.inf"

if not exist "%INF_PATH%" (
    echo [오류] 드라이버 파일(LW900P.inf)을 찾을 수 없습니다: %INF_PATH%
    pause
    exit /b 1
)

pnputil.exe /add-driver "%INF_PATH%" /install
if %errorLevel% neq 0 (
    echo [경고] pnputil 실행 중 반환 코드: %errorLevel% (이미 등록되어 있을 수 있습니다)
)

echo.
echo [2/3] Windows 프린터 스풀러에 드라이버 등록 중...
powershell -NoProfile -Command "try { Add-PrinterDriver -Name 'EPSON OK900P' -ErrorAction Stop; Write-Host '  -> Add-PrinterDriver 성공' -ForegroundColor Green } catch { Write-Host '  -> 드라이버가 이미 등록되어 있거나 PnP로 대기 중입니다.' -ForegroundColor Yellow }"

echo.
echo [3/3] 연결된 USB 장치 확인 및 드라이버 바인딩 확인...
powershell -NoProfile -Command "$dev = Get-PnpDevice | Where-Object { $_.InstanceId -match '04B8.*0704|OK900' }; if ($dev) { Write-Host '  -> OK900P USB 하드웨어 감지됨: ' $dev[0].Status -ForegroundColor Green } else { Write-Host '  -> 참고: 프린터 USB 케이블을 PC에 연결하고 전원을 켜주세요.' -ForegroundColor Cyan }"

echo.
echo ============================================================
echo   [설치 완료] EPSON OK900P 드라이버 설치가 완료되었습니다!
echo   프로그램 웹 화면에서 [새로고침] 버튼을 눌러주세요.
echo ============================================================
echo.
pause
