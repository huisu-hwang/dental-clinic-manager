// Service Worker for PWA install & auto-update support
// No offline caching — all requests pass through to network

self.addEventListener('install', () => {
  // 새 SW 설치 즉시 활성화
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Network passthrough — do not intercept
  return
})

// 클라이언트에서 SKIP_WAITING 메시지를 받으면 즉시 활성화
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
