@echo off
chcp 65001 >nul
title 덴트웹 브릿지 에이전트
cd /d "%~dp0"

:: 빌드 확인
if not exist "dist\index.js" (
    echo [!] 빌드가 필요합니다. 빌드를 실행합니다...
    call npm run build
    if %errorLevel% neq 0 (
        echo [X] 빌드 실패. setup.bat을 먼저 실행해주세요.
        pause
        exit /b 1
    )
)

:: 에이전트 실행 (오류 발생 시에도 창이 닫히지 않음)
echo 덴트웹 브릿지 에이전트를 시작합니다...
echo.
node dist/index.js

:: 프로세스가 종료되면 여기로 옴 (정상 종료 또는 오류)
echo.
echo 에이전트가 종료되었습니다.
pause
