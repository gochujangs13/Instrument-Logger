@echo off
title 3M Instrument Logger

echo =============================================
echo   3M Instrument Logger Starting...
echo =============================================

:: Kill existing server on port 8000
echo [1/4] Stopping existing server...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8000 "') do (
    taskkill /PID %%a /F > nul 2>&1
)
timeout /t 1 /nobreak > nul

:: Start server.py
echo [2/4] Starting server...
set PYTHON=C:\Python314\python.exe
set ROOT=%~dp0
start "3M Instrument Logger - Server" %PYTHON% "%ROOT%server.py"
timeout /t 2 /nobreak > nul

:: ADB reverse (find adb in common locations)
echo [3/4] Setting up ADB tunnel...
set ADB_EXE=
where adb >nul 2>&1
if %ERRORLEVEL%==0 (
    set ADB_EXE=adb
) else if exist "%USERPROFILE%\Downloads\platform-tools-latest-windows\platform-tools\adb.exe" (
    set ADB_EXE="%USERPROFILE%\Downloads\platform-tools-latest-windows\platform-tools\adb.exe"
) else if exist "%USERPROFILE%\Downloads\platform-tools\adb.exe" (
    set ADB_EXE="%USERPROFILE%\Downloads\platform-tools\adb.exe"
)

if defined ADB_EXE (
    %ADB_EXE% reverse tcp:8000 tcp:8000 > nul 2>&1
    if %ERRORLEVEL%==0 (
        echo      USB connected - ADB tunnel OK
    ) else (
        echo      USB not connected - use WiFi mode
    )
) else (
    echo      adb.exe not found - use WiFi mode
)

:: Open browser
echo [4/4] Opening browser...
start "" "http://localhost:8000/index.html"

echo.
echo =============================================
echo   Done! Keep this window open.
echo =============================================
timeout /t 3 /nobreak > nul