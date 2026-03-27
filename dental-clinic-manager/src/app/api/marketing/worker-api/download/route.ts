import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 안정적인 대시보드 URL (Vercel preview URL 대신 프로덕션 URL 사용)
const PRODUCTION_URL = 'https://dental-clinic-manager.vercel.app';

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
    const repoUrl = 'https://github.com/huisu-hwang/dental-clinic-manager';

    let script: string;
    let filename: string;
    let contentType: string;

    if (os === 'windows') {
      filename = 'marketing-worker-setup.bat';
      contentType = 'application/x-bat';
      script = generateWindowsScript(dashboardUrl, apiKey, repoUrl);
    } else {
      filename = os === 'mac' ? 'marketing-worker-setup.command' : 'marketing-worker-setup.sh';
      contentType = 'application/x-sh';
      script = generateUnixScript(dashboardUrl, apiKey, repoUrl);
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

function generateUnixScript(dashboardUrl: string, apiKey: string, repoUrl: string): string {
  return `#!/bin/bash
# ============================================
# 하얀치과 마케팅 워커 설치 및 실행
# 더블클릭하면 자동으로 설치 및 실행됩니다
# ============================================

# --- 기본 설정 ---
# PATH에 homebrew, nvm, fnm 등 일반적인 node 설치 경로 추가
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
# nvm 로드
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
# fnm 로드
command -v fnm &>/dev/null && eval "$(fnm env)"

INSTALL_DIR="$HOME/marketing-worker"
DASHBOARD_URL="${dashboardUrl}"
WORKER_API_KEY="${apiKey}"
REPO_URL="${repoUrl}"

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

  # tarball로 다운로드 (가장 안정적인 방법)
  TEMP_DIR=$(mktemp -d)
  echo "       임시 디렉토리: $TEMP_DIR"

  if curl -fsSL "$REPO_URL/archive/refs/heads/develop.tar.gz" -o "$TEMP_DIR/repo.tar.gz"; then
    echo "       다운로드 완료. 압축 해제 중..."
    tar xzf "$TEMP_DIR/repo.tar.gz" -C "$TEMP_DIR"

    # 압축 해제된 디렉토리 찾기
    EXTRACTED_DIR=$(ls -d "$TEMP_DIR"/dental-clinic-manager-* 2>/dev/null | head -1)
    if [ -z "$EXTRACTED_DIR" ]; then
      echo "[오류] 압축 해제 실패: 디렉토리를 찾을 수 없습니다."
      rm -rf "$TEMP_DIR"
      exit 1
    fi

    WORKER_SRC="$EXTRACTED_DIR/dental-clinic-manager/marketing-worker"
    if [ ! -d "$WORKER_SRC" ]; then
      echo "[오류] marketing-worker 디렉토리를 찾을 수 없습니다."
      echo "       경로: $WORKER_SRC"
      ls -la "$EXTRACTED_DIR/" 2>/dev/null
      rm -rf "$TEMP_DIR"
      exit 1
    fi

    cp -r "$WORKER_SRC"/* "$INSTALL_DIR/" 2>/dev/null
    cp -r "$WORKER_SRC"/.[!.]* "$INSTALL_DIR/" 2>/dev/null
    rm -rf "$TEMP_DIR"
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

function generateWindowsScript(dashboardUrl: string, apiKey: string, repoUrl: string): string {
  return `@echo off
chcp 65001 >nul
REM ============================================
REM 하얀치과 마케팅 워커 설치 및 실행
REM 더블클릭하면 자동으로 설치 및 실행됩니다
REM ============================================

REM 메인 로직 실행 후 항상 pause로 터미널 유지
call :main
echo.
echo ============================================
echo  워커가 종료되었습니다.
echo ============================================
echo.
pause
exit /b

:main
set INSTALL_DIR=%USERPROFILE%\\marketing-worker
set DASHBOARD_URL=${dashboardUrl}
set WORKER_API_KEY=${apiKey}
set REPO_URL=${repoUrl}

echo ============================================
echo  하얀치과 마케팅 워커
echo ============================================
echo.

REM Node.js 확인
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo [오류] Node.js가 설치되어 있지 않습니다.
  echo https://nodejs.org 에서 Node.js를 설치해주세요.
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do echo [OK] Node.js %%v 감지

REM 설치 여부 확인
if exist "%INSTALL_DIR%\\package.json" (
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
  npm run supervisor
  exit /b
)

echo.
echo [1/5] 설치 디렉토리 생성: %INSTALL_DIR%
mkdir "%INSTALL_DIR%" 2>nul

echo [2/5] 마케팅 워커 다운로드 중...

REM tarball로 다운로드 (curl 사용)
set TEMP_DIR=%TEMP%\\marketing-worker-dl
mkdir "%TEMP_DIR%" 2>nul
curl -fsSL "%REPO_URL%/archive/refs/heads/develop.tar.gz" -o "%TEMP_DIR%\\repo.tar.gz"
if %ERRORLEVEL% NEQ 0 (
  echo [오류] 다운로드 실패. 네트워크를 확인해주세요.
  exit /b 1
)

echo        다운로드 완료. 압축 해제 중...
cd /d "%TEMP_DIR%"
tar xzf repo.tar.gz
if %ERRORLEVEL% NEQ 0 (
  echo [오류] 압축 해제 실패.
  exit /b 1
)

REM 압축 해제된 디렉토리에서 marketing-worker 복사
for /d %%d in (dental-clinic-manager-*) do (
  xcopy /s /e /y "%%d\\dental-clinic-manager\\marketing-worker\\*" "%INSTALL_DIR%\\" >nul
)
cd /d "%INSTALL_DIR%"
rmdir /s /q "%TEMP_DIR%" 2>nul
echo        [OK] 파일 복사 완료

echo [3/5] 패키지 설치 중... (시간이 걸릴 수 있습니다)
call npm install
if %ERRORLEVEL% NEQ 0 (
  echo [오류] npm install 실패
  exit /b 1
)

echo [4/5] Chromium 브라우저 설치 중... (시간이 걸릴 수 있습니다)
call npx playwright install chromium
if %ERRORLEVEL% NEQ 0 (
  echo [오류] Chromium 설치 실패
  exit /b 1
)

echo [5/5] 환경 설정 중...
echo DASHBOARD_API_URL=%DASHBOARD_URL%> "%INSTALL_DIR%\\.env.local"
echo WORKER_API_KEY=%WORKER_API_KEY%>> "%INSTALL_DIR%\\.env.local"
echo MARKETING_WORKER_PORT=4001>> "%INSTALL_DIR%\\.env.local"

echo        TypeScript 빌드 중...
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo [오류] 빌드 실패
  exit /b 1
)

echo.
echo ============================================
echo  설치 완료!
echo ============================================
echo.
echo 워커를 시작합니다... (종료: Ctrl+C)
echo.

npm run supervisor
exit /b
`;
}
