import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
  ],
};

export default nextConfig;
