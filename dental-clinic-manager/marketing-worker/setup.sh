#!/bin/bash
# ============================================
# 마케팅 워커 설치 스크립트
# 유저 PC에서 독립 실행하기 위한 원클릭 설치
# ============================================

set -e

echo "============================================"
echo " 마케팅 워커 설치"
echo "============================================"
echo ""

# 1. Node.js 확인
if ! command -v node &> /dev/null; then
  echo "[오류] Node.js가 설치되어 있지 않습니다."
  echo "https://nodejs.org 에서 Node.js 22 이상을 설치해주세요."
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
echo "[OK] Node.js $(node -v) 감지"

# 2. npm install
echo ""
echo "[1/4] 패키지 설치 중..."
npm install

# 3. Playwright Chromium 설치
echo ""
echo "[2/4] Chromium 브라우저 설치 중..."
npx playwright install chromium

# 4. .env.local 생성 안내
echo ""
if [ -f ".env.local" ]; then
  echo "[OK] .env.local 파일이 이미 존재합니다."
else
  echo "[3/4] .env.local 파일을 생성합니다."
  echo ""

  read -p "  Supabase URL을 입력하세요: " SUPABASE_URL
  read -p "  Supabase Service Role Key를 입력하세요: " SUPABASE_KEY

  cat > .env.local << EOF
# 마케팅 워커 환경 변수
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_KEY}

# 네이버 블로그 설정 (DB에서 자동 로드되므로 비워두어도 됨)
NAVER_BLOG_ID=
NAVER_LOGIN_COOKIE=

# 워커 포트 (기본: 4001)
MARKETING_WORKER_PORT=4001
EOF

  echo ""
  echo "[OK] .env.local 파일 생성 완료"
fi

# 5. 빌드
echo ""
echo "[4/4] TypeScript 빌드 중..."
npm run build

echo ""
echo "============================================"
echo " 설치 완료!"
echo "============================================"
echo ""
echo "  실행 방법:"
echo "    npm run supervisor    # 백그라운드 감시자 (대시보드에서 제어)"
echo "    npm start             # 워커 직접 실행 (테스트용)"
echo ""
echo "  대시보드에서 '워커 시작' 버튼을 누르면"
echo "  supervisor가 자동으로 워커를 시작합니다."
echo ""
