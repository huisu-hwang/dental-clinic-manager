import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://hi-clinic.co.kr'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '클리닉 매니저 - 치과 업무 관리 시스템',
    short_name: '클리닉 매니저',
    description: '치과 데스크 업무를 효율적이고 체계적으로 관리하는 스마트 솔루션',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    launch_handler: {
      client_mode: 'navigate-new',
    },
    background_color: '#f1f5f9',
    theme_color: '#3b82f6',
    // 이미 설치된 같은 도메인 PWA를 getInstalledRelatedApps()로 감지하려면
    // 현재 사이트의 manifest URL을 정확히 가리켜야 함.
    prefer_related_applications: false,
    related_applications: [
      {
        platform: 'webapp',
        url: `${SITE_URL}/manifest.webmanifest`,
      },
    ],
    categories: ['medical', 'productivity', 'business'],
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: '대시보드',
        short_name: '대시보드',
        url: '/dashboard',
        icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192' }],
      },
    ],
  }
}
