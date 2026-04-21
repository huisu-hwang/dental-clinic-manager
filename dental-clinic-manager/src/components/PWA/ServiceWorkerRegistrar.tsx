'use client'

import { useEffect } from 'react'

// 플랫폼별 업데이트 체크 간격
const UPDATE_INTERVALS = {
  PERIODIC: 5 * 60 * 1000,     // 5분마다 주기적 확인
  IOS_RESUME: 5 * 60 * 1000,   // iOS: 앱 복귀 시 최소 5분 경과 후 확인
  VERSION_POLL: 2 * 60 * 1000, // 2분마다 버전 API 폴링
} as const

// 플랫폼 감지 유틸리티
function getPlatformInfo() {
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/.test(ua)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone)
  const isMobile = isIOS || isAndroid

  return { isIOS, isAndroid, isStandalone, isMobile }
}

/**
 * 서비스 워커 등록 및 자동 업데이트 관리
 *
 * 업데이트 감지 전략 (모든 플랫폼):
 * 1. Service Worker update() - SW 파일 변경 감지
 * 2. /api/version 폴링 - 빌드 ID 변경 감지 (SW 변경 없어도 감지 가능)
 * 3. visibilitychange - 앱이 포그라운드로 돌아올 때
 * 4. pageshow (bfcache) - iOS Safari PWA에서 캐시 복원 시
 * 5. online 이벤트 - 오프라인→온라인 전환 시
 * 6. focus 이벤트 - 윈도우 포커스 시 (데스크톱)
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const platform = getPlatformInfo()
    let registration: ServiceWorkerRegistration | null = null
    let currentBuildId: string | null = null
    let lastUpdateCheck = 0
    let refreshing = false

    // ─── 업데이트 알림 발송 ───
    const notifyUpdate = () => {
      window.dispatchEvent(new CustomEvent('pwa-update-available'))
    }

    // ─── 대기 중인 SW 활성화 ───
    const activateWaitingSW = (reg: ServiceWorkerRegistration) => {
      const waiting = reg.waiting
      if (waiting) {
        console.log('[SW] 대기 중인 서비스 워커 활성화 요청')
        waiting.postMessage({ type: 'SKIP_WAITING' })
      }
    }

    // ─── SW 업데이트 확인 (쓰로틀링) ───
    const checkSWUpdate = async (source: string) => {
      if (!registration) return

      const now = Date.now()
      // 최소 30초 간격으로 업데이트 확인 (과도한 요청 방지)
      if (now - lastUpdateCheck < 30_000) return
      lastUpdateCheck = now

      try {
        console.log(`[SW] 업데이트 확인 (${source})`)
        await registration.update()

        // 대기 중인 SW가 있으면 배너 표시 (즉시 활성화하지 않음)
        if (registration.waiting) {
          notifyUpdate()
        }
      } catch (err) {
        // 네트워크 오류 등은 무시 (오프라인 상태일 수 있음)
        console.warn(`[SW] 업데이트 확인 실패 (${source}):`, err)
      }
    }

    // ─── 버전 API 폴링 ───
    const checkVersionAPI = async () => {
      try {
        const res = await fetch('/api/version', {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        })
        if (!res.ok) return

        const data = await res.json()
        const newBuildId = data.buildId

        if (!currentBuildId) {
          // 최초 로드 시 현재 버전 저장
          currentBuildId = newBuildId
          // localStorage에도 저장 (iOS PWA 재시작 시 비교용)
          try { localStorage.setItem('pwa-build-id', newBuildId) } catch {}
          return
        }

        if (newBuildId !== currentBuildId) {
          console.log(`[SW] 새 버전 감지: ${currentBuildId} → ${newBuildId}`)
          currentBuildId = newBuildId
          try { localStorage.setItem('pwa-build-id', newBuildId) } catch {}

          // SW 업데이트 트리거
          await checkSWUpdate('version-change')
          notifyUpdate()
        }
      } catch {
        // 네트워크 오류 무시
      }
    }

    // ─── 서비스 워커 등록 ───
    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none', // 항상 서버에서 SW 파일 확인
        })
        registration = reg
        console.log('[SW] 등록 완료, scope:', reg.scope)

        // 새 SW 설치 감지
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing
          if (!newSW) return

          console.log('[SW] 새 서비스 워커 설치 중...')

          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // 기존 SW가 있는 상태에서 새 SW 설치됨 → 배너 표시 (즉시 활성화 X)
                console.log('[SW] 새 버전 설치 완료, 배너 표시')
                notifyUpdate()
              } else {
                // 최초 설치 (기존 SW 없음)
                console.log('[SW] 서비스 워커 최초 설치 완료')
              }
            }
          })
        })

        // 초기 로드 시 이미 대기 중인 SW가 있으면 배너만 표시 (즉시 활성화 X)
        if (reg.waiting) {
          console.log('[SW] 이미 대기 중인 새 버전 발견, 배너 표시')
          notifyUpdate()
        }

        // iOS PWA: localStorage의 이전 빌드 ID와 비교
        if (platform.isIOS && platform.isStandalone) {
          try {
            const savedBuildId = localStorage.getItem('pwa-build-id')
            if (savedBuildId) {
              currentBuildId = savedBuildId
            }
          } catch {}
          // iOS PWA는 즉시 버전 확인
          checkVersionAPI()
        }
      } catch (err) {
        console.warn('[SW] 등록 실패:', err)
      }
    }

    // ─── SW 컨트롤러 변경 시 새로고침 ───
    const handleControllerChange = () => {
      if (refreshing) return
      refreshing = true
      console.log('[SW] 새 버전 활성화됨, 페이지 새로고침...')
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    // ─── UpdatePrompt로부터 업데이트 적용 요청 수신 ───
    // 사용자가 '지금 새로고침' 버튼을 눌렀거나 자동 카운트다운이 끝난 시점에 호출됨.
    // waiting SW가 있으면 SKIP_WAITING을 보내 controllerchange로 자연스럽게 reload 되고,
    // 없으면(SW 변경은 없고 빌드 ID만 변경된 케이스) 직접 reload 한다.
    const handleApplyUpdate = () => {
      if (refreshing) return
      if (registration?.waiting) {
        console.log('[SW] 사용자 요청으로 업데이트 적용')
        activateWaitingSW(registration)
        // controllerchange가 발생하지 않는 경우 대비 폴백 (3초 후 강제 reload)
        setTimeout(() => {
          if (!refreshing) {
            refreshing = true
            window.location.reload()
          }
        }, 3000)
      } else {
        console.log('[SW] 대기 중인 SW 없음 → 바로 reload')
        refreshing = true
        window.location.reload()
      }
    }
    window.addEventListener('pwa-apply-update', handleApplyUpdate)

    // ─── 이벤트 핸들러들 ───

    // 1. 앱이 포그라운드로 돌아올 때 (모든 플랫폼)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSWUpdate('visibility-change')
        checkVersionAPI()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // 2. bfcache 복원 (iOS Safari PWA에서 중요)
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        console.log('[SW] bfcache에서 복원')
        checkSWUpdate('bfcache-restore')
        checkVersionAPI()
      }
    }
    window.addEventListener('pageshow', handlePageShow)

    // 3. 오프라인→온라인 전환 (모바일에서 중요)
    const handleOnline = () => {
      console.log('[SW] 네트워크 복원')
      checkSWUpdate('online')
      checkVersionAPI()
    }
    window.addEventListener('online', handleOnline)

    // 4. 윈도우 포커스 (데스크톱: Windows, Mac)
    const handleFocus = () => {
      checkSWUpdate('window-focus')
    }
    window.addEventListener('focus', handleFocus)

    // 5. iOS standalone 앱: appinstalled/resume 감지
    // iOS는 display-mode가 변경될 때도 확인
    let displayModeQuery: MediaQueryList | null = null
    if (platform.isIOS) {
      displayModeQuery = window.matchMedia('(display-mode: standalone)')
      const handleDisplayModeChange = () => {
        checkSWUpdate('display-mode-change')
        checkVersionAPI()
      }
      displayModeQuery.addEventListener('change', handleDisplayModeChange)
    }

    // ─── 주기적 업데이트 확인 ───

    // SW 업데이트 체크 (30분)
    const swUpdateInterval = setInterval(() => {
      checkSWUpdate('periodic')
    }, UPDATE_INTERVALS.PERIODIC)

    // 버전 API 폴링 (10분)
    const versionPollInterval = setInterval(() => {
      checkVersionAPI()
    }, UPDATE_INTERVALS.VERSION_POLL)

    // ─── 초기화 ───
    registerSW()

    // 초기 버전 확인 (등록 후 약간의 딜레이)
    const initialVersionCheck = setTimeout(() => {
      checkVersionAPI()
    }, 3000)

    // ─── 클린업 ───
    return () => {
      clearInterval(swUpdateInterval)
      clearInterval(versionPollInterval)
      clearTimeout(initialVersionCheck)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pwa-apply-update', handleApplyUpdate)
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      if (displayModeQuery) {
        displayModeQuery.removeEventListener('change', () => {})
      }
    }
  }, [])

  return null
}
