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
    let pendingUpdate = false  // 새 버전 감지됐으나 사용자 입력 중이라 적용 보류

    // ─── 사용자 입력 보호 판정 ───
    // 사용자가 입력 필드에 포커스를 두고 있으면 reload로 입력 내용이 유실되므로 보류
    const isUserEditing = (): boolean => {
      const el = document.activeElement as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
    }

    // ─── 업데이트 실제 적용 ───
    const applyUpdateNow = () => {
      if (refreshing) return
      pendingUpdate = false
      if (registration?.waiting) {
        console.log('[SW] 자동 업데이트 적용 (waiting SW → SKIP_WAITING)')
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        // controllerchange가 발생하지 않는 경우 대비 폴백 (3초 후 강제 reload)
        setTimeout(() => {
          if (!refreshing) {
            refreshing = true
            window.location.reload()
          }
        }, 3000)
      } else {
        console.log('[SW] 자동 업데이트 적용 (직접 reload)')
        refreshing = true
        window.location.reload()
      }
    }

    // ─── 자동 업데이트 스케줄링 ───
    // 사용자 입력 중이면 pendingUpdate로 표시하고 focusout/visibility hidden 시 적용
    const scheduleAutoUpdate = () => {
      pendingUpdate = true
      if (!isUserEditing()) {
        applyUpdateNow()
      } else {
        console.log('[SW] 새 버전 감지 — 사용자 입력 중이라 적용 보류')
      }
    }

    const tryApplyPendingUpdate = () => {
      if (!pendingUpdate) return
      if (isUserEditing()) return
      applyUpdateNow()
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

        if (registration.waiting) {
          scheduleAutoUpdate()
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

          // SW 업데이트 트리거 후 자동 적용
          await checkSWUpdate('version-change')
          scheduleAutoUpdate()
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
                // 기존 SW가 있는 상태에서 새 SW 설치됨 → 자동 적용 (입력 중이면 보류)
                console.log('[SW] 새 버전 설치 완료, 자동 적용 시도')
                scheduleAutoUpdate()
              } else {
                // 최초 설치 (기존 SW 없음)
                console.log('[SW] 서비스 워커 최초 설치 완료')
              }
            }
          })
        })

        // 초기 로드 시 이미 대기 중인 SW가 있으면 자동 적용 시도
        if (reg.waiting) {
          console.log('[SW] 이미 대기 중인 새 버전 발견, 자동 적용 시도')
          scheduleAutoUpdate()
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

    // ─── 사용자 입력 보호 훅 ───
    // 포커스가 입력 요소 밖으로 나가는 순간 보류된 업데이트 적용
    const handleFocusOut = () => {
      // 다른 입력 요소로 포커스 이동한 경우는 계속 보류
      setTimeout(tryApplyPendingUpdate, 50)
    }
    document.addEventListener('focusout', handleFocusOut)

    // ─── 이벤트 핸들러들 ───

    // 1. 앱이 포그라운드로 돌아올 때 (모든 플랫폼)
    //    탭이 백그라운드로 가는 순간도 안전한 적용 시점
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSWUpdate('visibility-change')
        checkVersionAPI()
      } else {
        // hidden 상태면 입력 중일 수 없으므로 보류된 업데이트를 조용히 적용
        tryApplyPendingUpdate()
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
      document.removeEventListener('focusout', handleFocusOut)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('focus', handleFocus)
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      if (displayModeQuery) {
        displayModeQuery.removeEventListener('change', () => {})
      }
    }
  }, [])

  return null
}
