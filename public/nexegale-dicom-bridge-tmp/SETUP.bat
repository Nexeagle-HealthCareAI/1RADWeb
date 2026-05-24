@echo off
title NexEgale DICOM Bridge — Setup
color 0A
cls

echo.
echo  =====================================================
echo   NexEgale DICOM Bridge  ^|  Production Setup
echo  =====================================================
echo.

:: ── Check Node.js ────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Node.js is not installed.
    echo  Download from: https://nodejs.org  (LTS version)
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  [OK] Node.js %NODE_VER% found
echo.

:: ── Install dependencies ─────────────────────────────────
echo  Installing dependencies...
call npm install --silent
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
)
echo  [OK] Dependencies installed
echo.

:: ── Create .env if missing ───────────────────────────────
if not exist .env (
    copy .env.example .env >nul
    echo  [OK] Created .env from template
) else (
    echo  [OK] .env already exists
)
echo.

:: ── Prompt for configuration ─────────────────────────────
echo  =====================================================
echo   Configuration
echo  =====================================================
echo.
echo  Press ENTER to keep the current value shown in [brackets].
echo.

:: Read current values
for /f "tokens=2 delims==" %%a in ('findstr "ORTHANC_URL" .env') do set CUR_ORTHANC_URL=%%a
for /f "tokens=2 delims==" %%a in ('findstr "ORTHANC_USER" .env') do set CUR_ORTHANC_USER=%%a
for /f "tokens=2 delims==" %%a in ('findstr "ONERAD_IDENTIFIER" .env') do set CUR_IDENTIFIER=%%a

set /p ORTHANC_URL=  Orthanc URL [%CUR_ORTHANC_URL%]:
if "%ORTHANC_URL%"=="" set ORTHANC_URL=%CUR_ORTHANC_URL%

set /p ORTHANC_USER=  Orthanc Username [%CUR_ORTHANC_USER%]:
if "%ORTHANC_USER%"=="" set ORTHANC_USER=%CUR_ORTHANC_USER%

set /p ORTHANC_PASS=  Orthanc Password:

set /p ONERAD_ID=  1Rad Mobile Number [%CUR_IDENTIFIER%]:
if "%ONERAD_ID%"=="" set ONERAD_ID=%CUR_IDENTIFIER%

set /p ONERAD_PASS=  1Rad Password:

:: Write values to .env using PowerShell (handles special chars)
powershell -Command "(Get-Content .env) -replace 'ORTHANC_URL=.*', 'ORTHANC_URL=%ORTHANC_URL%' | Set-Content .env"
powershell -Command "(Get-Content .env) -replace 'ORTHANC_USER=.*', 'ORTHANC_USER=%ORTHANC_USER%' | Set-Content .env"
powershell -Command "(Get-Content .env) -replace 'ORTHANC_PASS=.*', 'ORTHANC_PASS=%ORTHANC_PASS%' | Set-Content .env"
powershell -Command "(Get-Content .env) -replace 'ONERAD_IDENTIFIER=.*|ONERAD_EMAIL=.*', 'ONERAD_IDENTIFIER=%ONERAD_ID%' | Set-Content .env"
powershell -Command "(Get-Content .env) -replace 'ONERAD_PASSWORD=.*', 'ONERAD_PASSWORD=%ONERAD_PASS%' | Set-Content .env"

echo.
echo  [OK] Configuration saved to .env
echo.

:: ── Test connection ──────────────────────────────────────
echo  =====================================================
echo   Testing Connection
echo  =====================================================
echo.
echo  Running connection test (10 seconds)...
echo.

node scripts/test-connection.js
if %errorlevel% neq 0 (
    color 0E
    echo.
    echo  [WARN] Connection test failed. Check your credentials.
    echo  You can still install the service and fix .env later.
    echo.
    set /p CONTINUE=  Continue with installation anyway? (y/n):
    if /i "%CONTINUE%" neq "y" (
        echo  Aborted. Fix .env and run SETUP.bat again.
        pause
        exit /b 1
    )
) else (
    echo  [OK] Connection test passed
)
echo.

:: ── Install Windows Service ──────────────────────────────
echo  =====================================================
echo   Installing Windows Service
echo  =====================================================
echo.
echo  This requires Administrator privileges.
echo.

:: Re-launch as admin if not already
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  Requesting Administrator access...
    powershell -Command "Start-Process cmd -ArgumentList '/c cd /d %CD% && node scripts/uninstall-service.js & node scripts/install-service.js & pause' -Verb RunAs"
    goto :done
)

:: Already admin — run directly
node scripts/uninstall-service.js 2>nul
timeout /t 2 /nobreak >nul
node scripts/install-service.js

:done
echo.
echo  =====================================================
echo   Setup Complete
echo  =====================================================
echo.
echo  The bridge will now start automatically on every boot.
echo.
echo  Monitor it at:  http://localhost:5173/dicom-bridge
echo  View logs at:   C:\ProgramData\NexEgale\bridge\logs\
echo  Check status:   npm run status
echo.
pause
