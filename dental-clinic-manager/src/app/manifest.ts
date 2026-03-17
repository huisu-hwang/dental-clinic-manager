import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '클리닉 매니저 - 치과 업무 관리 시스템',
    short_name: '클리닉 매니저',
    description: '치과 데스크 업무를 효율적이고 체계적으로 관리하는 스마트 솔루션',
    start_url: '/',
    display: 'standalone',
    background_color: '#f1f5f9',
    theme_color: '#3b82f6',
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
  }
}
