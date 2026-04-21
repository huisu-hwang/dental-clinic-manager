// Service Worker for PWA install & auto-update support
// 배포마다 이 파일의 내용이 변경되어야 브라우저가 업데이트를 감지함
// SW_VERSION은 빌드 스크립트(prebuild)에서 자동 갱신됨
const SW_VERSION = 'v1776604688827'

// 캐시 이름 (버전별)
const CACHE_NAME = `clinic-manager-${SW_VERSION}`

self.addEventListener('install', () => {
  console.log(`[SW] Installing version: ${SW_VERSION}`)
  // skipWaiting은 클라이언트의 SKIP_WAITING 메시지 수신 시에만 호출
  // (UpdatePrompt에서 사용자가 확인 버튼을 누르거나 자동 카운트다운이 끝난 시점)
  // 이렇게 해야 사용자 작업 도중 예고 없이 페이지가 reload되지 않음
})

self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating version: ${SW_VERSION}`)
  event.waitUntil(
    // 이전 버전 캐시 삭제
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key.startsWith('clinic-manager-'))
          .map((key) => {
            console.log(`[SW] Deleting old cache: ${key}`)
            return caches.delete(key)
          })
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', () => {
  // Network passthrough — do not intercept
  return
})

// 클라이언트에서 SKIP_WAITING 메시지를 받으면 즉시 활성화
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING received, activating...')
    self.skipWaiting()
  }

  // 버전 확인 요청에 응답
  if (event.data && event.data.type === 'GET_VERSION') {
    event.source?.postMessage({
      type: 'SW_VERSION',
      version: SW_VERSION,
    })
  }
})
