'use client'

import { useCallback } from 'react'
import { appAlert } from '@/components/ui/AppDialog'

type WorkerType = 'marketing' | 'scraping'

interface WorkerGuardOptions {
  /** 워커 타입 */
  type: WorkerType
  /** 오프라인 시 팝업에 표시할 기능명 (예: 'AI 글 발행') */
  featureName?: string
}

const WORKER_LABELS: Record<WorkerType, { name: string; defaultFeature: string; guide: string }> = {
  marketing: {
    name: '마케팅 워커',
    defaultFeature: '마케팅 기능',
    guide: '마케팅 워커가 실행 중이지 않습니다.\n\n이 기능을 사용하려면 마케팅 워커를 먼저 실행해주세요.\n\n관리자에게 워커 실행을 요청하세요.',
  },
  scraping: {
    name: '스크래핑 워커',
    defaultFeature: '데이터 연동',
    guide: '스크래핑 워커가 실행 중이지 않습니다.\n\n이 기능을 사용하려면 스크래핑 워커를 먼저 실행해주세요.\n\n관리자에게 워커 실행을 요청하세요.',
  },
}

/**
 * 워커 온라인 여부를 체크하는 유틸 (API 호출 1회)
 */
async function checkWorkerOnline(type: WorkerType): Promise<boolean> {
  try {
    const res = await fetch(`/api/workers/status?type=${type}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return false

    const data = await res.json()
    if (type === 'marketing') return data.marketing?.online ?? false
    if (type === 'scraping') return data.scraping?.online ?? false
    return false
  } catch {
    return false
  }
}

/**
 * 워커 가드 훅
 *
 * 기능 실행 전 워커 온라인 여부를 확인하고,
 * 오프라인이면 설치/실행 안내 팝업을 띄운 뒤 false를 반환합니다.
 *
 * @example
 * ```tsx
 * const { guardAction } = useWorkerGuard({ type: 'marketing', featureName: 'AI 글 발행' })
 *
 * const handlePublish = async () => {
 *   if (!await guardAction()) return
 *   // 워커가 온라인일 때만 실행되는 코드
 * }
 * ```
 */
export function useWorkerGuard({ type, featureName }: WorkerGuardOptions) {
  const label = WORKER_LABELS[type]
  const feature = featureName || label.defaultFeature

  /**
   * 워커 상태를 확인하고, 오프라인이면 팝업을 띄우고 false 반환.
   * 온라인이면 true 반환.
   */
  const guardAction = useCallback(async (): Promise<boolean> => {
    const online = await checkWorkerOnline(type)
    if (online) return true

    await appAlert({
      title: `${label.name} 필요`,
      description: `${feature} 기능을 사용하려면 ${label.name}가 실행 중이어야 합니다.\n\n${label.name}가 현재 실행되고 있지 않습니다.\n관리자에게 워커 실행을 요청해주세요.`,
      variant: 'warning',
      buttonText: '확인',
    })
    return false
  }, [type, label.name, feature])

  return { guardAction }
}

/**
 * 비-훅 버전: 컴포넌트 외부나 이벤트 핸들러에서 직접 사용
 *
 * @example
 * ```ts
 * const canProceed = await requireWorker('marketing', 'AI 글 발행')
 * if (!canProceed) return
 * ```
 */
export async function requireWorker(type: WorkerType, featureName?: string): Promise<boolean> {
  const label = WORKER_LABELS[type]
  const feature = featureName || label.defaultFeature
  const online = await checkWorkerOnline(type)
  if (online) return true

  await appAlert({
    title: `${label.name} 필요`,
    description: `${feature} 기능을 사용하려면 ${label.name}가 실행 중이어야 합니다.\n\n${label.name}가 현재 실행되고 있지 않습니다.\n관리자에게 워커 실행을 요청해주세요.`,
    variant: 'warning',
    buttonText: '확인',
  })
  return false
}
