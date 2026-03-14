FROM node:20-slim

# Playwright 시스템 의존성 설치
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libwayland-client0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 패키지 파일 복사 및 의존성 설치
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Playwright Chromium만 설치
RUN npx playwright install chromium

# 소스 코드 복사
COPY tsconfig.json ./
COPY src/ ./src/

# TypeScript 빌드
RUN npm run build

# 환경변수
ENV NODE_ENV=production
ENV PLAYWRIGHT_HEADLESS=true

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "console.log('ok')" || exit 1

# 실행 (빌드된 JS 사용)
CMD ["node", "dist/index.js"]
