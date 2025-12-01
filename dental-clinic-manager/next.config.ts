import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // 빌드 시 ESLint 경고를 에러로 처리하지 않음
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
