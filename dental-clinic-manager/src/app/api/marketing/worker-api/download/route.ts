import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 안정적인 대시보드 URL (프로덕션 도메인)
const PRODUCTION_URL = 'https://www.hi-clinic.co.kr';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const os = searchParams.get('os') || 'mac';

    // API 키 조회
    const { data } = await supabase
      .from('marketing_worker_control')
      .select('worker_api_key')
      .eq('id', 'main')
      .single();

    if (!data?.worker_api_key) {
      return NextResponse.json({ error: 'API 키가 생성되지 않았습니다.' }, { status: 500 });
    }

    // 대시보드 URL: 프로덕션 URL 우선, 없으면 현재 origin
    const origin = new URL(request.url).origin;
    const dashboardUrl = origin.includes('vercel.app') && !origin.includes('dental-clinic-manager.vercel.app')
      ? PRODUCTION_URL
      : origin;
    const apiKey = data.worker_api_key;

    let script: string;
    let filename: string;
    let contentType: string;

    if (os === 'windows') {
      filename = 'marketing-worker-setup.bat';
      contentType = 'application/x-bat';
      // Windows .bat 파일은 반드시 CRLF 줄바꿈 필요
      script = generateWindowsScript(dashboardUrl, apiKey).replace(/\n/g, '\r\n');
    } else {
      filename = os === 'mac' ? 'marketing-worker-setup.command' : 'marketing-worker-setup.sh';
      contentType = 'application/x-sh';
      script = generateUnixScript(dashboardUrl, apiKey);
    }

    return new NextResponse(script, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[worker-api/download]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function generateUnixScript(dashboardUrl: string, apiKey: string): string {
  return `#!/bin/bash
# ============================================
# 하얀치과 마케팅 워커 설치 및 실행
# 더블클릭하면 자동으로 설치 및 실행됩니다
# ============================================

# --- 기본 설정 ---
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
command -v fnm &>/dev/null && eval "$(fnm env)"

INSTALL_DIR="$HOME/marketing-worker"
DASHBOARD_URL="${dashboardUrl}"
WORKER_API_KEY="${apiKey}"
DOWNLOAD_URL="${dashboardUrl}/downloads/marketing-worker.tar.gz"

# 종료 시 항상 터미널 유지
cleanup() {
  echo ""
  echo "============================================"
  echo " 워커가 종료되었습니다."
  echo "============================================"
  echo ""
  read -p "엔터를 누르면 창을 닫습니다..."
}
trap cleanup EXIT

echo "============================================"
echo " 하얀치과 마케팅 워커"
echo "============================================"
echo ""

# --- Node.js 확인 ---
if ! command -v node &> /dev/null; then
  echo "[오류] Node.js가 설치되어 있지 않습니다."
  echo ""
  echo "아래 명령어로 설치해주세요:"
  echo "  brew install node"
  echo ""
  echo "또는 https://nodejs.org 에서 다운로드해주세요."
  exit 1
fi

NODE_VER=$(node -v)
echo "[OK] Node.js $NODE_VER 감지"

# --- 설치 여부 확인 ---
if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/package.json" ]; then
  echo "[OK] 이미 설치됨: $INSTALL_DIR"
  echo ""

  # .env.local 업데이트
  cat > "$INSTALL_DIR/.env.local" << 'ENVEOF'
DASHBOARD_API_URL=${dashboardUrl}
WORKER_API_KEY=${apiKey}
MARKETING_WORKER_PORT=4001
ENVEOF

  echo "[OK] 설정 업데이트 완료"
  echo ""
  echo "워커를 시작합니다... (종료: Ctrl+C)"
  echo ""
  cd "$INSTALL_DIR"
  npm run supervisor
else
  echo ""
  echo "[1/5] 설치 디렉토리 생성: $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"

  echo "[2/5] 마케팅 워커 다운로드 중..."
  echo "       URL: $DOWNLOAD_URL"

  TEMP_DIR=$(mktemp -d)

  if curl -fsSL "$DOWNLOAD_URL" -o "$TEMP_DIR/marketing-worker.tar.gz"; then
    echo "       다운로드 완료. 압축 해제 중..."
    tar xzf "$TEMP_DIR/marketing-worker.tar.gz" -C "$INSTALL_DIR" --strip-components=1
    rm -rf "$TEMP_DIR"

    if [ ! -f "$INSTALL_DIR/package.json" ]; then
      echo "[오류] 압축 해제 실패: package.json을 찾을 수 없습니다."
      exit 1
    fi
    echo "       [OK] 파일 복사 완료"
  else
    echo "[오류] 다운로드 실패. 네트워크를 확인해주세요."
    rm -rf "$TEMP_DIR"
    exit 1
  fi

  cd "$INSTALL_DIR"

  echo "[3/5] 패키지 설치 중... (시간이 걸릴 수 있습니다)"
  npm install || { echo "[오류] npm install 실패"; exit 1; }

  echo "[4/5] Chromium 브라우저 설치 중... (시간이 걸릴 수 있습니다)"
  npx playwright install chromium || { echo "[오류] Chromium 설치 실패"; exit 1; }

  echo "[5/5] 환경 설정 중..."
  cat > "$INSTALL_DIR/.env.local" << 'ENVEOF'
DASHBOARD_API_URL=${dashboardUrl}
WORKER_API_KEY=${apiKey}
MARKETING_WORKER_PORT=4001
ENVEOF

  echo "       TypeScript 빌드 중..."
  npm run build || { echo "[오류] 빌드 실패"; exit 1; }

  echo ""
  echo "============================================"
  echo " 설치 완료!"
  echo "============================================"
  echo ""
  echo "워커를 시작합니다... (종료: Ctrl+C)"
  echo ""

  npm run supervisor
fi
`;
}

function generateWindowsScript(dashboardUrl: string, apiKey: string): string {
  return `@echo off
chcp 65001 >nul
title 하얀치과 마케팅 워커
REM ============================================
REM 하얀치과 마케팅 워커 설치 및 실행
REM 더블클릭하면 자동으로 설치 및 실행됩니다
REM ============================================

REM 메인 로직 실행 후 항상 pause로 터미널 유지
call :main
goto :done

:done
echo.
echo ============================================
echo  워커가 종료되었습니다.
echo ============================================
echo.
pause
exit /b

:main
set "INSTALL_DIR=%USERPROFILE%\\marketing-worker"
set "DASHBOARD_URL=${dashboardUrl}"
set "WORKER_API_KEY=${apiKey}"
set "DOWNLOAD_URL=${dashboardUrl}/downloads/marketing-worker.tar.gz"

echo ============================================
echo  하얀치과 마케팅 워커
echo ============================================
echo.

REM Node.js 확인
where node >nul 2>nul
if errorlevel 1 goto :no_node
for /f "tokens=*" %%v in ('node -v') do echo [OK] Node.js %%v 감지
goto :check_install

:no_node
echo [오류] Node.js가 설치되어 있지 않습니다.
echo https://nodejs.org 에서 Node.js를 설치해주세요.
exit /b 1

:check_install
REM node_modules가 있으면 이미 설치 완료된 것
if not exist "%INSTALL_DIR%\\node_modules" goto :fresh_install
if not exist "%INSTALL_DIR%\\package.json" goto :fresh_install

REM === 이미 설치됨 - 설정 업데이트 후 실행 ===
echo [OK] 이미 설치됨: %INSTALL_DIR%
echo.

echo DASHBOARD_API_URL=%DASHBOARD_URL%> "%INSTALL_DIR%\\.env.local"
echo WORKER_API_KEY=%WORKER_API_KEY%>> "%INSTALL_DIR%\\.env.local"
echo MARKETING_WORKER_PORT=4001>> "%INSTALL_DIR%\\.env.local"

echo [OK] 설정 업데이트 완료
echo.
echo 워커를 시작합니다... (종료: Ctrl+C)
echo.
cd /d "%INSTALL_DIR%"
call npm run supervisor
exit /b

:fresh_install
REM === 신규 설치 ===
REM 이전 실패한 설치 정리
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%" 2>nul

echo.
echo [1/5] 설치 디렉토리 생성: %INSTALL_DIR%
mkdir "%INSTALL_DIR%"
if errorlevel 1 goto :err_mkdir

echo [2/5] 마케팅 워커 다운로드 중...
echo        URL: %DOWNLOAD_URL%

REM 대시보드 서버에서 직접 다운로드 (GitHub 접속 불필요)
set "TEMP_FILE=%TEMP%\\marketing-worker.tar.gz"
curl -fsSL "%DOWNLOAD_URL%" -o "%TEMP_FILE%"
if errorlevel 1 goto :err_download

echo        다운로드 완료. 압축 해제 중...
cd /d "%INSTALL_DIR%"
tar xzf "%TEMP_FILE%" --strip-components=1
if errorlevel 1 goto :err_extract
del "%TEMP_FILE%" 2>nul

if not exist "%INSTALL_DIR%\\package.json" goto :err_no_pkg
echo        [OK] 파일 복사 완료

echo [3/5] 패키지 설치 중... (시간이 걸릴 수 있습니다)
call npm install
if errorlevel 1 goto :err_npm

echo [4/5] Chromium 브라우저 설치 중... (시간이 걸릴 수 있습니다)
call npx playwright install chromium
if errorlevel 1 goto :err_chromium

echo [5/5] 환경 설정 중...
echo DASHBOARD_API_URL=%DASHBOARD_URL%> "%INSTALL_DIR%\\.env.local"
echo WORKER_API_KEY=%WORKER_API_KEY%>> "%INSTALL_DIR%\\.env.local"
echo MARKETING_WORKER_PORT=4001>> "%INSTALL_DIR%\\.env.local"

echo.
echo ============================================
echo  설치 완료!
echo ============================================
echo.
echo 워커를 시작합니다... (종료: Ctrl+C)
echo.
call npm run supervisor
exit /b

:err_mkdir
echo [오류] 설치 디렉토리 생성 실패: %INSTALL_DIR%
exit /b 1
:err_download
echo [오류] 다운로드 실패. 네트워크를 확인해주세요.
echo        URL: %DOWNLOAD_URL%
exit /b 1
:err_extract
echo [오류] 압축 해제 실패.
exit /b 1
:err_no_pkg
echo [오류] 압축 해제 후 package.json을 찾을 수 없습니다.
exit /b 1
:err_npm
echo [오류] npm install 실패
exit /b 1
:err_chromium
echo [오류] Chromium 설치 실패
exit /b 1
`;
}
