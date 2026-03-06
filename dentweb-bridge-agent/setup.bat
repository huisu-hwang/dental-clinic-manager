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

:: .env 파일 확인
if not exist "%~dp0.env" (
    echo ==========================================
    echo  간편 설정 (대부분 자동 감지됩니다)
    echo ==========================================
    echo.

    :: 기본값 설정
    set "DB_SERVER=localhost"
    set "DB_PORT=1433"
    set "DB_DATABASE=DENTWEBDB"
    set "DB_USER=sa"
    set "DB_PASSWORD="
    set "SUPABASE_URL_VALUE=https://beahjntkmkfhpcbhfnrr.supabase.co"

    :: ======================================
    :: 1단계: 덴트웹 DB 자동 감지
    :: ======================================
    echo [*] 덴트웹 DB 자동 감지 중...

    :: 덴트웹 설치 경로 확인
    if exist "C:\DENTWEB" (
        echo     발견: C:\DENTWEB
    )
    if exist "C:\DENTWEBDB" (
        echo     발견: C:\DENTWEBDB
    )
    if exist "D:\DENTWEB" (
        echo     발견: D:\DENTWEB
    )

    :: SQL Server 인스턴스 자동 감지
    sc query MSSQLSERVER >nul 2>&1
    if !errorLevel! equ 0 (
        echo     [OK] SQL Server 기본 인스턴스 감지
        set "DB_SERVER=localhost"
    ) else (
        sc query "MSSQL$SQLEXPRESS" >nul 2>&1
        if !errorLevel! equ 0 (
            echo     [OK] SQL Server Express 감지
            set "DB_SERVER=localhost\SQLEXPRESS"
        ) else (
            sc query "MSSQL$DENTWEB" >nul 2>&1
            if !errorLevel! equ 0 (
                echo     [OK] SQL Server DENTWEB 인스턴스 감지
                set "DB_SERVER=localhost\DENTWEB"
            ) else (
                echo     [!] SQL Server 서비스를 찾지 못했습니다
            )
        )
    )
    echo.

    :: ======================================
    :: 2단계: 사용자 입력 (최소한만)
    :: ======================================
    echo ------------------------------------------
    echo  자동 감지된 DB 설정:
    echo    서버: !DB_SERVER!
    echo    포트: !DB_PORT!
    echo    DB명: !DB_DATABASE!
    echo    계정: sa
    echo ------------------------------------------
    echo.
    echo  [1] DB 비밀번호를 입력해주세요
    echo      (덴트웹 설치 시 설정한 SQL Server 비밀번호)
    echo.
    set /p "DB_PASSWORD=  비밀번호: "
    echo.

    :: ======================================
    :: 3단계: API 키 (웹 대시보드에서 복사)
    :: ======================================
    echo  [2] 웹 대시보드에서 API 키를 복사해주세요
    echo      (리콜 설정 ^> 덴트웹 탭 ^> API 키 생성 ^> 복사)
    echo.
    set /p "API_KEY_INPUT=  API 키: "
    echo.

    echo  [3] 웹 대시보드에서 Clinic ID를 복사해주세요
    echo      (리콜 설정 ^> 덴트웹 탭에서 확인)
    echo.
    set /p "CLINIC_ID_INPUT=  Clinic ID: "
    echo.

    :: ======================================
    :: 4단계: 고급 설정 (선택)
    :: ======================================
    set /p "ADVANCED=  DB 설정을 변경하시겠습니까? (Y/N, 기본: N): "
    if /i "!ADVANCED!"=="Y" (
        echo.
        set /p "DB_SERVER_IN=  DB 서버 (기본: !DB_SERVER!): "
        set /p "DB_PORT_IN=  DB 포트 (기본: !DB_PORT!): "
        set /p "DB_USER_IN=  DB 계정 (기본: sa): "
        set /p "DB_DATABASE_IN=  DB 이름 (기본: DENTWEBDB): "
        if not "!DB_SERVER_IN!"=="" set "DB_SERVER=!DB_SERVER_IN!"
        if not "!DB_PORT_IN!"=="" set "DB_PORT=!DB_PORT_IN!"
        if not "!DB_USER_IN!"=="" set "DB_USER=!DB_USER_IN!"
        if not "!DB_DATABASE_IN!"=="" set "DB_DATABASE=!DB_DATABASE_IN!"
    )
    echo.

    :: .env 파일 작성
    (
        echo # 덴트웹 DB 설정 (자동 감지)
        echo DENTWEB_DB_SERVER=!DB_SERVER!
        echo DENTWEB_DB_PORT=!DB_PORT!
        echo DENTWEB_DB_DATABASE=!DB_DATABASE!
        echo DENTWEB_DB_USER=!DB_USER!
        echo DENTWEB_DB_PASSWORD=!DB_PASSWORD!
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
) else (
    echo [OK] 기존 .env 설정 사용
)
echo.

:: 연결 테스트
echo [*] 덴트웹 DB 연결 테스트 중...
node dist/test-connection.js 2>nul
if %errorLevel% neq 0 (
    echo.
    echo [!] DB 연결에 실패했습니다.
    echo.
    echo  확인해주세요:
    echo   - SQL Server 서비스가 실행 중인가요?
    echo   - DB 비밀번호가 정확한가요?
    echo   - 덴트웹이 이 PC에 설치되어 있나요?
    echo.
    echo  설정 수정: 메모장으로 %~dp0.env 파일을 열어 수정 가능
    echo.
    set /p "CONTINUE=  그래도 서비스를 설치할까요? (Y/N): "
    if /i not "!CONTINUE!"=="Y" (
        echo.
        echo  .env 파일을 수정한 후 setup.bat을 다시 실행해주세요.
        pause
        exit /b 1
    )
) else (
    echo [OK] DB 연결 성공!
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
echo  - 로그: %~dp0logs\bridge-agent.log
echo  - 설정: %~dp0.env (메모장으로 수정)
echo.
echo  문제시: setup.bat을 다시 실행하세요
echo.
pause
endlocal
