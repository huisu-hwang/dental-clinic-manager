import path from "path";
import type { NextConfig } from "next";

// 같은 프로세스 내 모든 참조가 동일 ID를 사용하도록 모듈 로드 시 1회만 계산
const BUILD_ID = process.env.NEXT_BUILD_ID ?? `build-${Date.now()}`;

const nextConfig: NextConfig = {
  /* config options here */
  // workspace root: 레포 루트를 가리킴 (scraping-worker 등 하위 패키지 포함)
  outputFileTracingRoot: path.join(__dirname, "../"),
  eslint: {
    // 빌드 시 ESLint 경고를 에러로 처리하지 않음
    ignoreDuringBuilds: true,
  },
  // @google/genai 패키지의 node-fetch 의존성 문제 해결
  // 서버 사이드에서 이 패키지들을 Node.js 런타임으로 처리
  serverExternalPackages: [
    '@google/genai',
    'google-auth-library',
    'gaxios',
    'node-fetch',
    'pdfjs-dist',
  ],
  // pdfjs-dist의 한국어 cMap/표준 폰트 파일을 Vercel 함수 번들에 포함
  // (없으면 한글 PDF 텍스트 추출이 실패함)
  outputFileTracingIncludes: {
    '/api/payroll/tax-office-files': [
      './node_modules/pdfjs-dist/cmaps/**',
      './node_modules/pdfjs-dist/standard_fonts/**',
    ],
    '/api/payroll/tax-office-files/parse-zip': [
      './node_modules/pdfjs-dist/cmaps/**',
      './node_modules/pdfjs-dist/standard_fonts/**',
    ],
  },
  generateBuildId: async () => BUILD_ID,
  env: {
    BUILD_TIMESTAMP: BUILD_ID.replace(/^build-/, ''),
    NEXT_BUILD_ID: BUILD_ID,
  },
  async redirects() {
    return [
      // 매트릭스는 dashboard 통합 sub 탭으로만 진입. 별도 라우트로 들어오면
      // /investment/layout.tsx 의 투자 전용 사이드바가 잠깐 보였다가 redirect 되어
      // 사용자가 "새 페이지로 열린다" 고 느낌. 서버 단 영구 redirect 로 layout 노출 자체를 차단.
      {
        source: '/investment/compare/matrix',
        destination: '/dashboard?tab=investment&sub=matrix',
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
