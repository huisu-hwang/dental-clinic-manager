'use client'

import { useCallback } from 'react'
import { openWorkerGuardModal, type GuardState } from '@/components/WorkerGuardModal'

type WorkerType = 'marketing' | 'scraping' | 'seo' | 'dentweb' | 'email'

interface WorkerGuardOptions {
  /** 워커 타입 */
  type: WorkerType
  /** 오프라인 시 팝업에 표시할 기능명 (예: 'AI 글 발행') */
  featureName?: string
}

interface WorkerState {
  installed: boolean
  online: boolean
}

const WORKER_LABELS: Record<WorkerType, { defaultFeature: string }> = {
  marketing: { defaultFeature: '마케팅 기능' },
  scraping:  { defaultFeature: '데이터 연동' },
  seo:       { defaultFeature: 'SEO 키워드 분석' },
  dentweb:   { defaultFeature: '덴트웹 매출 동기화' },
  email:     { defaultFeature: '이메일 알림' },
}

/**
 * 워커 설치/온라인 여부를 체크하는 유틸 (API 호출 1회)
 */
async function checkWorkerState(type: WorkerType): Promise<WorkerState> {
  try {
    const res = await fetch(`/api/workers/status?type=${type}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return { installed: false, online: false }

    const data = await res.json()
    if (type === 'marketing') {
      return {
        installed: data.marketing?.installed ?? false,
        online: data.marketing?.online ?? false,
      }
    }
    if (type === 'scraping') {
      return {
        installed: data.scraping?.installed ?? false,
        online: data.scraping?.online ?? false,
      }
    }
    if (type === 'seo') {
      return {
        installed: data.seo?.installed ?? false,
        online: data.seo?.online ?? false,
      }
    }
    if (type === 'dentweb') {
      return {
        installed: data.dentweb?.installed ?? false,
        online: data.dentweb?.online ?? false,
      }
    }
    if (type === 'email') {
      return {
        installed: data.email?.installed ?? false,
        online: data.email?.online ?? false,
      }
    }
    return { installed: false, online: false }
  } catch {
    return { installed: false, online: false }
  }
}

/**
 * 워커 상태에 따라 WorkerGuardModal을 띄운다.
 * - 미설치: 'not_installed' 상태로 모달 표시
 * - 설치됨 & 오프라인: 'offline' 상태로 모달 표시
 * 모달 결과(true/false)를 반환한다.
 */
async function showGuardDialog(
  type: WorkerType,
  feature: string,
  state: WorkerState
): Promise<boolean> {
  const guardState: GuardState = !state.installed ? 'not_installed' : 'offline'
  return openWorkerGuardModal({ type, featureName: feature, state: guardState })
}

/**
 * 워커 가드 훅
 *
 * 기능 실행 전 워커의 설치 여부와 온라인 여부를 차례로 확인하고,
 * 조건을 만족하지 못하면 안내 팝업을 띄운 뒤 false를 반환합니다.
 *
 * ⚠️ 프리미엄 기능 활성화 여부는 호출부에서 `usePremiumFeatures().hasPremiumFeature()`로
 *    선행 체크해야 합니다. (활성화되지 않은 사용자는 이 가드를 실행하지 않음)
 *
 * @example
 * ```tsx
 * const { guardAction } = useWorkerGuard({ type: 'marketing', featureName: 'AI 글 발행' })
 * const { hasPremiumFeature } = usePremiumFeatures()
 *
 * const handlePublish = async () => {
 *   if (!hasPremiumFeature('marketing')) return
 *   if (!await guardAction()) return
 *   // 기능이 활성화되고 워커가 설치 + 실행 중일 때만 실행
 * }
 * ```
 */
export function useWorkerGuard({ type, featureName }: WorkerGuardOptions) {
  const label = WORKER_LABELS[type]
  const feature = featureName || label.defaultFeature

  /**
   * 워커 설치 + 온라인 상태를 확인하고,
   * 조건 미충족 시 안내 팝업을 띄우고 false 반환. 충족 시 true.
   */
  const guardAction = useCallback(async (): Promise<boolean> => {
    const state = await checkWorkerState(type)
    if (state.installed && state.online) return true
    return await showGuardDialog(type, feature, state)
  }, [type, feature])

  return { guardAction }
}

/**
 * 비-훅 버전: 컴포넌트 외부나 이벤트 핸들러에서 직접 사용
 *
 * ⚠️ 프리미엄 기능 활성화 여부는 호출부에서 선행 체크해야 합니다.
 *
 * @example
 * ```ts
 * if (!hasPremiumFeature('marketing')) return
 * const canProceed = await requireWorker('marketing', 'AI 글 발행')
 * if (!canProceed) return
 * ```
 */
export async function requireWorker(type: WorkerType, featureName?: string): Promise<boolean> {
  const label = WORKER_LABELS[type]
  const feature = featureName || label.defaultFeature
  const state = await checkWorkerState(type)
  if (state.installed && state.online) return true
  return await showGuardDialog(type, feature, state)
}
