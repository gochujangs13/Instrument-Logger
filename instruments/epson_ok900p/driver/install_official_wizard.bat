@echo off
chcp 65001 >nul
title EPSON OK900P 공식 드라이버 설치 마법사

echo ============================================================
echo   EPSON 공식 프린터 드라이버 마법사(dinst64.exe) 실행
echo ============================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [안내] 관리자 권한으로 마법사를 실행합니다...
    powershell -Command "Start-Process cmd -ArgumentList '/c cd /d \"\"%~dp0official_wizard\"\" && dinst64.exe' -Verb RunAs"
    exit /b
)

cd /d "%~dp0official_wizard"
if exist "dinst64.exe" (
    start "" "dinst64.exe"
) else (
    echo [오류] dinst64.exe 파일을 찾을 수 없습니다.
    pause
)
