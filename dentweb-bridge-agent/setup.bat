@echo off
chcp 65001 >nul
title 덴트웹 브릿지 에이전트 설치

echo ==========================================
echo  덴트웹 브릿지 에이전트 - 원클릭 설치
echo ==========================================
echo.

:: 관리자 권한 확인
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] 관리자 권한이 필요합니다. 관리자 권한으로 다시 실행합니다...
    powershell -Command "Start-Process cmd -ArgumentList '/c, cd /d %~dp0 && %~nx0' -Verb RunAs"
    exit /b
)

:: Node.js 확인
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Node.js가 설치되어 있지 않습니다.
    echo [*] Node.js를 자동으로 설치합니다...
    echo.
    powershell -ExecutionPolicy Bypass -File "%~dp0scripts\install-node.ps1"
    if %errorLevel% neq 0 (
        echo [X] Node.js 설치에 실패했습니다.
        echo     https://nodejs.org 에서 직접 설치해주세요.
        pause
        exit /b 1
    )
    :: PATH 새로고침
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
)

echo [OK] Node.js 확인 완료
for /f "tokens=*" %%i in ('node -v') do echo      버전: %%i
echo.

:: 의존성 설치
echo [*] 패키지 설치 중...
cd /d "%~dp0"
call npm install --production 2>nul
if %errorLevel% neq 0 (
    echo [!] npm install 실패. 전체 설치를 시도합니다...
    call npm install
)
echo [OK] 패키지 설치 완료
echo.

:: TypeScript 빌드
echo [*] 빌드 중...
call npm run build
if %errorLevel% neq 0 (
    echo [X] 빌드 실패. 오류를 확인해주세요.
    pause
    exit /b 1
)
echo [OK] 빌드 완료
echo.

:: .env 파일 확인
if not exist "%~dp0.env" (
    echo ==========================================
    echo  환경 설정이 필요합니다
    echo ==========================================
    echo.
    copy "%~dp0.env.example" "%~dp0.env" >nul

    echo .env 파일이 생성되었습니다.
    echo 아래 정보를 입력해주세요:
    echo.

    set /p DB_SERVER="덴트웹 DB 서버 주소 (기본: localhost): "
    set /p DB_PORT="덴트웹 DB 포트 (기본: 1433): "
    set /p DB_USER="덴트웹 DB 사용자명: "
    set /p DB_PASSWORD="덴트웹 DB 비밀번호: "
    set /p SUPABASE_URL_INPUT="Supabase URL: "
    set /p CLINIC_ID_INPUT="Clinic ID: "
    set /p API_KEY_INPUT="API Key: "

    if "%DB_SERVER%"=="" set DB_SERVER=localhost
    if "%DB_PORT%"=="" set DB_PORT=1433

    :: .env 파일 작성
    (
        echo # 덴트웹 DB 설정
        echo DENTWEB_DB_SERVER=%DB_SERVER%
        echo DENTWEB_DB_PORT=%DB_PORT%
        echo DENTWEB_DB_DATABASE=DENTWEBDB
        echo DENTWEB_DB_USER=%DB_USER%
        echo DENTWEB_DB_PASSWORD=%DB_PASSWORD%
        echo.
        echo # Supabase API 설정
        echo SUPABASE_URL=%SUPABASE_URL_INPUT%
        echo CLINIC_ID=%CLINIC_ID_INPUT%
        echo API_KEY=%API_KEY_INPUT%
        echo.
        echo # 동기화 설정
        echo SYNC_INTERVAL_SECONDS=300
        echo SYNC_TYPE=incremental
    ) > "%~dp0.env"

    echo.
    echo [OK] 환경 설정 저장 완료
) else (
    echo [OK] .env 설정 파일 확인 완료
)
echo.

:: 연결 테스트
echo [*] 연결 테스트 중...
node dist/test-connection.js 2>nul
if %errorLevel% neq 0 (
    echo [!] 연결 테스트 실패. .env 파일의 설정을 확인해주세요.
    echo     파일 위치: %~dp0.env
    echo.
    set /p CONTINUE="그래도 서비스를 설치하시겠습니까? (Y/N): "
    if /i not "%CONTINUE%"=="Y" (
        pause
        exit /b 1
    )
)
echo.

:: Windows 서비스 등록
echo [*] Windows 서비스로 등록 중...
node scripts/install-service.js
if %errorLevel% neq 0 (
    echo [!] 서비스 등록 실패. 수동으로 실행할 수 있습니다:
    echo     cd %~dp0
    echo     npm start
    echo.
) else (
    echo [OK] Windows 서비스 등록 완료
    echo.
)

echo ==========================================
echo  설치가 완료되었습니다!
echo ==========================================
echo.
echo  - 서비스 이름: DentWeb Bridge Agent
echo  - PC 시작 시 자동 실행됩니다
echo  - 로그 파일: %~dp0logs\bridge-agent.log
echo  - 설정 변경: %~dp0.env
echo.
echo  수동 실행: npm start
echo  서비스 제거: node scripts/install-service.js --uninstall
echo.
pause
