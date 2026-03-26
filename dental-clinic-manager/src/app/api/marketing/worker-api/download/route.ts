import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// 인증된 유저 확인 (마케팅 페이지 접근 가능한 유저면 다운로드 허용)
async function checkAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await checkAuth();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const os = searchParams.get('os') || 'mac';

    // API 키 조회
    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin client error' }, { status: 500 });

    const { data } = await admin
      .from('marketing_worker_control')
      .select('worker_api_key')
      .eq('id', 'main')
      .single();

    if (!data?.worker_api_key) {
      return NextResponse.json({ error: 'API 키가 생성되지 않았습니다.' }, { status: 500 });
    }

    // 대시보드 URL (현재 요청의 origin 사용)
    const dashboardUrl = new URL(request.url).origin;
    const apiKey = data.worker_api_key;

    // GitHub raw URL for marketing-worker
    const repoUrl = 'https://github.com/huisu-hwang/dental-clinic-manager';

    let script: string;
    let filename: string;
    let contentType: string;

    if (os === 'windows') {
      filename = 'marketing-worker-setup.bat';
      contentType = 'application/x-bat';
      script = generateWindowsScript(dashboardUrl, apiKey, repoUrl);
    } else {
      // macOS / Linux 공용 (.command는 macOS에서 더블클릭 가능)
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

set -e

INSTALL_DIR="$HOME/marketing-worker"
DASHBOARD_URL="${dashboardUrl}"
WORKER_API_KEY="${apiKey}"
REPO_URL="${repoUrl}"

echo "============================================"
echo " 하얀치과 마케팅 워커"
echo "============================================"
echo ""

# Node.js 확인
if ! command -v node &> /dev/null; then
  echo "[오류] Node.js가 설치되어 있지 않습니다."
  echo ""
  echo "아래 명령어로 설치해주세요:"
  echo "  brew install node"
  echo ""
  echo "또는 https://nodejs.org 에서 다운로드해주세요."
  echo ""
  read -p "엔터를 누르면 종료합니다..."
  exit 1
fi

echo "[OK] Node.js $(node -v) 감지"

# 설치 여부 확인
if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/package.json" ]; then
  echo "[OK] 이미 설치됨: $INSTALL_DIR"
  echo ""

  # .env.local 업데이트 (API 키가 변경되었을 수 있음)
  cat > "$INSTALL_DIR/.env.local" << ENVEOF
DASHBOARD_API_URL=$DASHBOARD_URL
WORKER_API_KEY=$WORKER_API_KEY
MARKETING_WORKER_PORT=4001
ENVEOF

  echo "[OK] 설정 업데이트 완료"
  echo ""
  echo "워커를 시작합니다..."
  echo ""
  cd "$INSTALL_DIR"
  npm run supervisor
else
  echo ""
  echo "[1/5] 설치 디렉토리 생성: $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"

  echo "[2/5] 마케팅 워커 다운로드 중..."
  cd "$INSTALL_DIR"

  # Git이 있으면 sparse checkout으로 marketing-worker만 다운로드
  if command -v git &> /dev/null; then
    git clone --depth 1 --filter=blob:none --sparse "$REPO_URL.git" _temp 2>/dev/null
    cd _temp
    git sparse-checkout set dental-clinic-manager/marketing-worker 2>/dev/null
    cp -r dental-clinic-manager/marketing-worker/* "$INSTALL_DIR/"
    cd "$INSTALL_DIR"
    rm -rf _temp
  else
    # Git 없으면 tarball로 다운로드
    curl -sL "$REPO_URL/archive/refs/heads/develop.tar.gz" | tar xz --strip-components=2 -C "$INSTALL_DIR" "*/dental-clinic-manager/marketing-worker"
  fi

  echo "[3/5] 패키지 설치 중..."
  npm install

  echo "[4/5] Chromium 브라우저 설치 중..."
  npx playwright install chromium

  echo "[5/5] 환경 설정 중..."
  cat > "$INSTALL_DIR/.env.local" << ENVEOF
DASHBOARD_API_URL=$DASHBOARD_URL
WORKER_API_KEY=$WORKER_API_KEY
MARKETING_WORKER_PORT=4001
ENVEOF

  npm run build

  echo ""
  echo "============================================"
  echo " 설치 완료!"
  echo "============================================"
  echo ""
  echo "워커를 시작합니다..."
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
  pause
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
  echo 워커를 시작합니다...
  echo.
  cd /d "%INSTALL_DIR%"
  npm run supervisor
) else (
  echo.
  echo [1/5] 설치 디렉토리 생성: %INSTALL_DIR%
  mkdir "%INSTALL_DIR%" 2>nul

  echo [2/5] 마케팅 워커 다운로드 중...
  cd /d "%INSTALL_DIR%"
  git clone --depth 1 --filter=blob:none --sparse "%REPO_URL%.git" _temp
  cd _temp
  git sparse-checkout set dental-clinic-manager/marketing-worker
  xcopy /s /e /y "dental-clinic-manager\\marketing-worker\\*" "%INSTALL_DIR%\\"
  cd /d "%INSTALL_DIR%"
  rmdir /s /q _temp

  echo [3/5] 패키지 설치 중...
  npm install

  echo [4/5] Chromium 브라우저 설치 중...
  npx playwright install chromium

  echo [5/5] 환경 설정 중...
  echo DASHBOARD_API_URL=%DASHBOARD_URL%> "%INSTALL_DIR%\\.env.local"
  echo WORKER_API_KEY=%WORKER_API_KEY%>> "%INSTALL_DIR%\\.env.local"
  echo MARKETING_WORKER_PORT=4001>> "%INSTALL_DIR%\\.env.local"

  npm run build

  echo.
  echo ============================================
  echo  설치 완료!
  echo ============================================
  echo.
  echo 워커를 시작합니다...
  echo.

  npm run supervisor
)
`;
}
