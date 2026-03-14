@echo off
chcp 65001 >nul 2>nul
title DentWeb Bridge Agent
cd /d "%~dp0"

:: Check build
if not exist "dist\index.js" (
    echo [!] Build required. Running build...
    call npm run build
    if %errorLevel% neq 0 (
        echo [X] Build failed. Please run setup.bat first.
        pause
        exit /b 1
    )
)

:: Run agent
echo Starting DentWeb Bridge Agent...
echo.
node dist/index.js

:: Process ended
echo.
echo Agent has stopped.
pause
