'use client'

import { useEffect } from 'react'

const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000 // 1시간마다 업데이트 확인

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let registration: ServiceWorkerRegistration | null = null

    const handleUpdate = (reg: ServiceWorkerRegistration) => {
      const waitingSW = reg.waiting
      if (waitingSW) {
        // 새 SW가 대기 중이면 즉시 활성화 요청
        waitingSW.postMessage({ type: 'SKIP_WAITING' })
      }
    }

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none', // 항상 서버에서 SW 파일 확인
        })
        registration = reg

        // 새 SW 설치 감지
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing
          if (!newSW) return

          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              // 새 버전이 설치되었고, 기존 SW가 제어 중 → 업데이트 적용
              console.log('[SW] 새 버전 감지, 업데이트 적용 중...')
              handleUpdate(reg)
            }
          })
        })

        // 이미 대기 중인 SW가 있으면 즉시 적용
        if (reg.waiting) {
          handleUpdate(reg)
        }
      } catch (err) {
        console.warn('[SW] Registration failed:', err)
      }
    }

    // SW 컨트롤러 변경 시 페이지 새로고침 (새 버전 적용)
    let refreshing = false
    const handleControllerChange = () => {
      if (refreshing) return
      refreshing = true
      console.log('[SW] 새 버전 활성화, 페이지 새로고침...')
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    // 주기적 업데이트 확인 (1시간)
    const updateInterval = setInterval(() => {
      if (registration) {
        registration.update().catch(() => {})
      }
    }, UPDATE_CHECK_INTERVAL)

    // 앱이 다시 포그라운드로 돌아올 때 업데이트 확인
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && registration) {
        registration.update().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    registerSW()

    return () => {
      clearInterval(updateInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  return null
}
