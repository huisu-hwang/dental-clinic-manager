@echo off
setlocal enabledelayedexpansion
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

:: ======================================
:: SQL Server 자동 감지 (공통)
:: ======================================
echo [*] 덴트웹 환경 자동 감지 중...

set "DETECTED_SERVER=localhost"

if exist "C:\DENTWEB" echo     덴트웹 경로 발견: C:\DENTWEB
if exist "C:\DENTWEBDB" echo     DB 경로 발견: C:\DENTWEBDB
if exist "D:\DENTWEB" echo     덴트웹 경로 발견: D:\DENTWEB

sc query MSSQLSERVER >nul 2>&1
if !errorLevel! equ 0 (
    echo     [OK] SQL Server 기본 인스턴스 감지
    set "DETECTED_SERVER=localhost"
) else (
    sc query "MSSQL$SQLEXPRESS" >nul 2>&1
    if !errorLevel! equ 0 (
        echo     [OK] SQL Server Express 감지
        set "DETECTED_SERVER=localhost\SQLEXPRESS"
    ) else (
        sc query "MSSQL$DENTWEB" >nul 2>&1
        if !errorLevel! equ 0 (
            echo     [OK] SQL Server DENTWEB 인스턴스 감지
            set "DETECTED_SERVER=localhost\DENTWEB"
        ) else (
            echo     [!] SQL Server 서비스를 찾지 못했습니다
        )
    )
)
echo.

:: .env 파일 확인
if exist "%~dp0.env" (
    :: .env가 이미 있음 (웹에서 다운로드했거나 이전 설치)
    echo [OK] 기존 .env 설정 발견 - 사용자 입력 없이 자동 진행합니다
    echo.

    :: 감지된 SQL Server 주소로 .env의 DB_SERVER 업데이트
    echo [*] 감지된 SQL Server 주소를 .env에 반영 중...
    powershell -Command "(Get-Content '%~dp0.env') -replace 'DENTWEB_DB_SERVER=.*', 'DENTWEB_DB_SERVER=!DETECTED_SERVER!' | Set-Content '%~dp0.env'"
    echo [OK] DB 서버: !DETECTED_SERVER!
    echo.

) else (
    echo ==========================================
    echo  간편 설정 (대부분 자동으로 처리됩니다)
    echo ==========================================
    echo.
    echo  [!] .env 설정 파일이 없습니다.
    echo.
    echo  권장: 웹 대시보드(리콜 설정 ^> 덴트웹 탭)에서
    echo        "설정 파일(.env) 다운로드" 버튼으로 자동 생성할 수 있습니다.
    echo.
    echo  수동 설정을 진행하려면 아래 정보를 입력해주세요.
    echo.

    :: 기본값
    set "DB_SERVER=!DETECTED_SERVER!"
    set "DB_PORT=1433"
    set "DB_DATABASE=DENTWEBDB"
    set "SUPABASE_URL_VALUE=https://beahjntkmkfhpcbhfnrr.supabase.co"

    :: 웹 대시보드 연동 정보 입력
    echo  웹 대시보드(리콜 설정 ^> 덴트웹 탭)에서
    echo  아래 2개 정보를 복사해서 붙여넣으세요.
    echo.
    echo  [1] Clinic ID
    set /p "CLINIC_ID_INPUT=      Clinic ID: "
    echo.
    echo  [2] API 키 (dw_로 시작)
    set /p "API_KEY_INPUT=      API 키: "
    echo.

    :: Windows 인증으로 .env 생성
    echo [*] Windows 인증 모드로 설정합니다 (비밀번호 불필요)
    echo.

    (
        echo # 덴트웹 DB 설정
        echo DENTWEB_DB_SERVER=!DB_SERVER!
        echo DENTWEB_DB_PORT=!DB_PORT!
        echo DENTWEB_DB_DATABASE=!DB_DATABASE!
        echo DENTWEB_DB_USER=
        echo DENTWEB_DB_PASSWORD=
        echo DENTWEB_DB_AUTH=windows
        echo.
        echo # Supabase API 설정
        echo SUPABASE_URL=!SUPABASE_URL_VALUE!
        echo CLINIC_ID=!CLINIC_ID_INPUT!
        echo API_KEY=!API_KEY_INPUT!
        echo.
        echo # 동기화 설정
        echo SYNC_INTERVAL_SECONDS=300
        echo SYNC_TYPE=incremental
    ) > "%~dp0.env"

    echo [OK] 설정 저장 완료
    echo.
)

:: ======================================
:: DB 연결 테스트 (Windows 인증 우선)
:: ======================================
echo [*] Windows 인증으로 DB 연결 테스트 중...
node dist/test-connection.js 2>nul
if !errorLevel! neq 0 (
    echo.
    echo [!] Windows 인증 연결 실패.
    echo     SQL Server 인증(비밀번호)으로 전환합니다.
    echo.
    set /p "DB_PASSWORD=  DB 비밀번호를 입력해주세요: "
    echo.
    set /p "DB_USER_IN=  DB 계정 (기본: sa, Enter로 건너뛰기): "
    if "!DB_USER_IN!"=="" set "DB_USER_IN=sa"
    echo.

    :: SQL 인증으로 .env 업데이트
    powershell -Command "(Get-Content '%~dp0.env') -replace 'DENTWEB_DB_USER=.*', 'DENTWEB_DB_USER=!DB_USER_IN!' -replace 'DENTWEB_DB_PASSWORD=.*', 'DENTWEB_DB_PASSWORD=!DB_PASSWORD!' -replace 'DENTWEB_DB_AUTH=.*', 'DENTWEB_DB_AUTH=sql' | Set-Content '%~dp0.env'"

    echo [*] SQL 인증으로 재시도 중...
    node dist/test-connection.js 2>nul
    if !errorLevel! neq 0 (
        echo.
        echo [!] DB 연결 실패.
        echo  확인사항:
        echo   - SQL Server가 실행 중인가요?
        echo   - 비밀번호가 정확한가요?
        echo   - 덴트웹이 이 PC에 설치되어 있나요?
        echo.
        echo  설정 파일: %~dp0.env (메모장으로 수정 가능)
        echo.
        set /p "CONTINUE=  그래도 서비스를 설치할까요? (Y/N): "
        if /i not "!CONTINUE!"=="Y" (
            echo  setup.bat을 다시 실행해주세요.
            pause
            exit /b 1
        )
    ) else (
        echo [OK] SQL 인증으로 DB 연결 성공!
    )
) else (
    echo [OK] Windows 인증으로 DB 연결 성공! (비밀번호 입력 불필요)
)
echo.

:: Windows 서비스 등록
echo [*] Windows 서비스로 등록 중...
node scripts/install-service.js
if %errorLevel% neq 0 (
    echo [!] 서비스 등록 실패. 수동 실행 가능:
    echo     cd %~dp0
    echo     npm start
    echo.
) else (
    echo [OK] 서비스 등록 완료!
    echo.
)

echo ==========================================
echo  설치가 완료되었습니다!
echo ==========================================
echo.
echo  - 서비스: DentWeb Bridge Agent
echo  - PC 부팅 시 자동 시작됩니다
echo  - 상태 확인: http://localhost:52800
echo    (브라우저에서 에이전트 상태를 확인할 수 있습니다)
echo  - 로그: %~dp0logs\bridge-agent.log
echo  - 설정: %~dp0.env (메모장으로 수정)
echo.
echo  문제시: setup.bat을 다시 실행하세요
echo.
pause
endlocal
