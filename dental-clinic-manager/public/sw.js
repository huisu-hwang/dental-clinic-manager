// Minimal service worker for PWA install prompt support
// No offline caching — all requests pass through to network

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Network passthrough — do not intercept
  return
})
