'use client'

import { useCallback } from 'react'
import { appAlert } from '@/components/ui/AppDialog'

type WorkerType = 'marketing' | 'scraping' | 'seo'

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

const WORKER_LABELS: Record<WorkerType, { name: string; defaultFeature: string }> = {
  marketing: {
    name: '마케팅 워커',
    defaultFeature: '마케팅 기능',
  },
  scraping: {
    name: '스크래핑 워커',
    defaultFeature: '데이터 연동',
  },
  seo: {
    name: 'SEO 분석 워커',
    defaultFeature: 'SEO 키워드 분석',
  },
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
    return { installed: false, online: false }
  } catch {
    return { installed: false, online: false }
  }
}

/**
 * 워커 상태에 따라 안내 팝업을 띄운다.
 * - 미설치: 설치 요청 안내
 * - 설치됨 & 오프라인: 실행 요청 안내
 */
async function showGuardDialog(type: WorkerType, feature: string, state: WorkerState) {
  const label = WORKER_LABELS[type]

  if (!state.installed) {
    await appAlert({
      title: `${label.name} 미설치`,
      description: `${feature} 기능을 사용하려면 ${label.name}가 설치되어 있어야 합니다.\n\n${label.name}가 아직 설치되지 않았거나 한 번도 등록되지 않았습니다.\n관리자에게 워커 설치를 요청해주세요.`,
      variant: 'warning',
      buttonText: '확인',
    })
    return
  }

  await appAlert({
    title: `${label.name} 실행 필요`,
    description: `${feature} 기능을 사용하려면 ${label.name}가 실행 중이어야 합니다.\n\n${label.name}가 현재 실행되고 있지 않습니다.\n관리자에게 워커 실행을 요청해주세요.`,
    variant: 'warning',
    buttonText: '확인',
  })
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
    await showGuardDialog(type, feature, state)
    return false
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
  await showGuardDialog(type, feature, state)
  return false
}
