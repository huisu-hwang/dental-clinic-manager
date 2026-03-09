@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>nul
title DentWeb Bridge Agent Setup

echo ==========================================
echo  DentWeb Bridge Agent - One-Click Setup
echo ==========================================
echo.

:: Check admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Administrator privileges required. Restarting as admin...
    powershell -Command "Start-Process cmd -ArgumentList '/c, cd /d %~dp0 && %~nx0' -Verb RunAs"
    exit /b
)

:: Check Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Node.js is not installed.
    echo [*] Installing Node.js automatically...
    echo.
    powershell -ExecutionPolicy Bypass -File "%~dp0scripts\install-node.ps1"
    if %errorLevel% neq 0 (
        echo [X] Node.js installation failed.
        echo     Please install manually from https://nodejs.org
        pause
        exit /b 1
    )
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
)

echo [OK] Node.js found
for /f "tokens=*" %%i in ('node -v') do echo      Version: %%i
echo.

:: Install dependencies
echo [*] Installing packages...
cd /d "%~dp0"
call npm install --production 2>nul
if %errorLevel% neq 0 (
    echo [!] npm install failed. Trying full install...
    call npm install
)
echo [OK] Packages installed
echo.

:: TypeScript build
echo [*] Building...
call npm run build
if %errorLevel% neq 0 (
    echo [X] Build failed. Please check errors above.
    pause
    exit /b 1
)
echo [OK] Build complete
echo.

:: ======================================
:: SQL Server Auto-Detection
:: ======================================
echo [*] Detecting DentWeb environment...

set "DETECTED_SERVER=localhost"

if exist "C:\DENTWEB" echo     DentWeb path found: C:\DENTWEB
if exist "C:\DENTWEBDB" echo     DB path found: C:\DENTWEBDB
if exist "D:\DENTWEB" echo     DentWeb path found: D:\DENTWEB

sc query MSSQLSERVER >nul 2>&1
if !errorLevel! equ 0 (
    echo     [OK] SQL Server default instance detected
    set "DETECTED_SERVER=localhost"
) else (
    sc query "MSSQL$SQLEXPRESS" >nul 2>&1
    if !errorLevel! equ 0 (
        echo     [OK] SQL Server Express detected
        set "DETECTED_SERVER=localhost\SQLEXPRESS"
    ) else (
        sc query "MSSQL$DENTWEB" >nul 2>&1
        if !errorLevel! equ 0 (
            echo     [OK] SQL Server DENTWEB instance detected
            set "DETECTED_SERVER=localhost\DENTWEB"
        ) else (
            echo     [!] SQL Server service not found
        )
    )
)
echo.

:: Check .env file
if exist "%~dp0.env" (
    :: .env already exists (downloaded from web or previous install)
    echo [OK] Existing .env config found - proceeding automatically
    echo.

    :: Update DB_SERVER in .env with detected SQL Server address
    echo [*] Updating .env with detected SQL Server address...
    powershell -Command "(Get-Content '%~dp0.env') -replace 'DENTWEB_DB_SERVER=.*', 'DENTWEB_DB_SERVER=!DETECTED_SERVER!' | Set-Content '%~dp0.env'"
    echo [OK] DB Server: !DETECTED_SERVER!
    echo.

) else (
    echo ==========================================
    echo  Manual Setup
    echo ==========================================
    echo.
    echo  [!] No .env config file found.
    echo.
    echo  Recommended: Download from web dashboard
    echo  (Recall Settings ^> DentWeb tab ^> "One-Click Install" button)
    echo.
    echo  Enter the following info for manual setup:
    echo.

    :: Default values
    set "DB_SERVER=!DETECTED_SERVER!"
    set "DB_PORT=1433"
    set "DB_DATABASE=DENTWEBDB"
    set "SUPABASE_URL_VALUE=https://beahjntkmkfhpcbhfnrr.supabase.co"

    :: Web dashboard connection info
    echo  Copy the following 2 values from web dashboard
    echo  (Recall Settings ^> DentWeb tab):
    echo.
    echo  [1] Clinic ID
    set /p "CLINIC_ID_INPUT=      Clinic ID: "
    echo.
    echo  [2] API Key (starts with dw_)
    set /p "API_KEY_INPUT=      API Key: "
    echo.

    :: Create .env with Windows auth
    echo [*] Setting Windows authentication mode (no password needed)
    echo.

    (
        echo # DentWeb DB Settings
        echo DENTWEB_DB_SERVER=!DB_SERVER!
        echo DENTWEB_DB_PORT=!DB_PORT!
        echo DENTWEB_DB_DATABASE=!DB_DATABASE!
        echo DENTWEB_DB_USER=
        echo DENTWEB_DB_PASSWORD=
        echo DENTWEB_DB_AUTH=windows
        echo.
        echo # Supabase API Settings
        echo SUPABASE_URL=!SUPABASE_URL_VALUE!
        echo CLINIC_ID=!CLINIC_ID_INPUT!
        echo API_KEY=!API_KEY_INPUT!
        echo.
        echo # Sync Settings
        echo SYNC_INTERVAL_SECONDS=300
        echo SYNC_TYPE=incremental
    ) > "%~dp0.env"

    echo [OK] Config saved
    echo.
)

:: ======================================
:: DB Connection Test (Windows auth first)
:: ======================================
echo [*] Testing DB connection with Windows authentication...
node dist/test-connection.js 2>nul
if !errorLevel! neq 0 (
    echo.
    echo [!] Windows authentication failed.
    echo     Switching to SQL Server authentication (password required).
    echo.
    echo  ==========================================
    echo   SQL Server Password Required
    echo  ==========================================
    echo.
    echo   Enter the SQL Server 'sa' account password.
    echo   (This is the SQL Server administrator password,
    echo    set during SQL Server installation.)
    echo.
    set /p "DB_PASSWORD=  SQL Server 'sa' password: "
    echo.
    set /p "DB_USER_IN=  DB account (default: sa, press Enter to skip): "
    if "!DB_USER_IN!"=="" set "DB_USER_IN=sa"
    echo.

    :: Update .env to SQL auth
    powershell -Command "(Get-Content '%~dp0.env') -replace 'DENTWEB_DB_USER=.*', 'DENTWEB_DB_USER=!DB_USER_IN!' -replace 'DENTWEB_DB_PASSWORD=.*', 'DENTWEB_DB_PASSWORD=!DB_PASSWORD!' -replace 'DENTWEB_DB_AUTH=.*', 'DENTWEB_DB_AUTH=sql' | Set-Content '%~dp0.env'"

    echo [*] Retrying with SQL authentication...
    echo.
    node dist/test-connection.js
    if !errorLevel! neq 0 (
        echo.
        echo  ==========================================
        echo   [FAILED] DB Connection Failed
        echo  ==========================================
        echo.
        echo   The password may be incorrect, or SQL Server
        echo   may not be running. Please check:
        echo.
        echo   1. Is SQL Server running?
        echo   2. Is the password correct?
        echo   3. Is DentWeb installed on this PC?
        echo.
        echo   Config file: %~dp0.env (edit with Notepad)
        echo.
        set /p "CONTINUE=  Install service anyway? (Y/N): "
        if /i not "!CONTINUE!"=="Y" (
            echo  Please run setup.bat again.
            pause
            exit /b 1
        )
    ) else (
        echo.
        echo  ==========================================
        echo   [OK] Password correct! DB connected.
        echo  ==========================================
        echo.
    )
) else (
    echo.
    echo  ==========================================
    echo   [OK] DB connected (Windows auth, no password needed)
    echo  ==========================================
    echo.
)

:: Register Windows service
echo [*] Registering as Windows service...
node scripts/install-service.js
if %errorLevel% neq 0 (
    echo [!] Service registration failed. Manual run:
    echo     cd %~dp0
    echo     npm start
    echo.
) else (
    echo [OK] Service registered!
    echo.
)

echo ==========================================
echo  Setup Complete!
echo ==========================================
echo.
echo  - Service: DentWeb Bridge Agent
echo  - Auto-starts on PC boot
echo  - Status: http://localhost:52800
echo  - Log: %~dp0logs\bridge-agent.log
echo  - Config: %~dp0.env (edit with Notepad)
echo.
echo  If issues occur: run setup.bat again
echo.
pause
endlocal
