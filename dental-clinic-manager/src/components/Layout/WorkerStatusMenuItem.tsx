'use client'

import { useEffect, useState, useCallback } from 'react'
import { Server, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { usePremiumFeatures } from '@/hooks/usePremiumFeatures'

interface WorkerStatusResponse {
  marketing?: {
    installed: boolean
    online: boolean
    currentVersion: string | null
    latestVersion: string | null
    updateAvailable: boolean
  }
  scraping?: {
    installed: boolean
    online: boolean
    workerCount: number
  }
  seo?: {
    installed: boolean
    online: boolean
    workerCount: number
  }
  email?: {
    installed: boolean
    online: boolean
  }
  dentweb?: {
    installed: boolean
    online: boolean
    lastSyncStatus: string | null
  }
}

type Status = 'online' | 'offline' | 'not-installed' | 'loading'

const STATUS_COLOR: Record<Status, string> = {
  online: 'bg-green-500',
  offline: 'bg-amber-500',
  'not-installed': 'bg-red-400',
  loading: 'bg-slate-300 animate-pulse',
}

const STATUS_LABEL: Record<Status, string> = {
  online: '온라인',
  offline: '오프라인',
  'not-installed': '미설치',
  loading: '확인 중',
}

function resolveStatus(installed: boolean | undefined, online: boolean | undefined, loading: boolean): Status {
  if (loading) return 'loading'
  if (!installed) return 'not-installed'
  return online ? 'online' : 'offline'
}

/** 워커 항목 정의 (표시 순서) */
interface WorkerDef {
  key: 'marketing' | 'scraping' | 'seo' | 'email' | 'dentweb'
  label: string
  /** 이 워커가 필요한 프리미엄 기능 ID */
  premiumId: string
  /** 온라인 시 부가 정보 (예: workerCount) */
  getExtra?: (status: WorkerStatusResponse) => string
}

const WORKER_DEFS: WorkerDef[] = [
  {
    key: 'marketing',
    label: '마케팅 (발행)',
    premiumId: 'marketing',
  },
  {
    key: 'seo',
    label: 'SEO 분석',
    premiumId: 'marketing',
    getExtra: (s) => s.seo?.online && s.seo.workerCount ? ` (${s.seo.workerCount})` : '',
  },
  {
    key: 'email',
    label: '이메일 모니터',
    premiumId: 'financial',
  },
  {
    key: 'scraping',
    label: '홈택스 스크래핑',
    premiumId: 'financial',
    getExtra: (s) => s.scraping?.online && s.scraping.workerCount ? ` (${s.scraping.workerCount})` : '',
  },
  {
    key: 'dentweb',
    label: '덴트웹 동기화',
    premiumId: 'marketing',
  },
]

/**
 * 좌측 메뉴 하단에 워커 상태를 표시하는 아이템
 *
 * - 통합 워커가 필요한 프리미엄 기능(`financial`, `marketing`)이 활성화된 사용자에게만 표시
 * - 30초마다 자동 갱신, 수동 새로고침 가능
 * - 클릭 시 4개 워커 각각의 상태 토글
 */
export default function WorkerStatusMenuItem() {
  const { hasPremiumFeature, isLoading: premiumLoading } = usePremiumFeatures()
  const needsMarketing = hasPremiumFeature('marketing')
  const needsFinancial = hasPremiumFeature('financial')
  const needsAny = needsMarketing || needsFinancial

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [status, setStatus] = useState<WorkerStatusResponse>({})
  const [expanded, setExpanded] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      setRefreshing(true)
      const res = await fetch('/api/workers/status?type=all', {
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const data: WorkerStatusResponse = await res.json()
        setStatus(data)
      }
    } catch {
      // 네트워크 오류 무시 (다음 주기에 재시도)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (!needsAny) return
    fetchStatus()
    const interval = setInterval(fetchStatus, 30_000)
    return () => clearInterval(interval)
  }, [needsAny, fetchStatus])

  // 프리미엄 로딩 중이거나 워커가 필요한 기능이 없으면 미노출
  if (premiumLoading || !needsAny) return null

  // 활성화된 프리미엄에 해당하는 워커만 필터
  const activeWorkers = WORKER_DEFS.filter((w) => hasPremiumFeature(w.premiumId))

  // 개별 상태 계산
  const workerStatuses = activeWorkers.map((w) => {
    const s = status[w.key]
    return {
      ...w,
      status: resolveStatus(s?.installed, s?.online, loading),
    }
  })

  // 통합 상태
  const overallStatus: Status = (() => {
    const statuses = workerStatuses.map((w) => w.status)
    if (statuses.length === 0 || statuses.includes('loading')) return 'loading'
    if (statuses.every((s) => s === 'online')) return 'online'
    if (statuses.some((s) => s === 'not-installed')) return 'not-installed'
    return 'offline'
  })()

  const overallLabel = (() => {
    switch (overallStatus) {
      case 'loading':
        return '워커 확인 중...'
      case 'online':
        return '워커 정상'
      case 'offline':
        return '워커 오프라인'
      case 'not-installed':
        return '워커 미설치'
    }
  })()

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (refreshing) return
    fetchStatus()
  }

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="group flex items-center space-x-3 py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 w-full text-at-text-secondary hover:bg-at-surface-hover hover:text-at-text"
        title="워커 상태"
      >
        <div className="relative flex-shrink-0">
          <Server className="w-5 h-5 text-at-text-weak group-hover:text-at-text-secondary" />
          <span
            className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${STATUS_COLOR[overallStatus]}`}
            aria-hidden
          />
        </div>
        <span className="truncate flex-1 text-left">{overallLabel}</span>
        <span
          onClick={handleRefresh}
          role="button"
          aria-label="워커 상태 새로고침"
          className="p-0.5 rounded hover:bg-at-surface-hover"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-at-text-weak ${refreshing ? 'animate-spin' : ''}`} />
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-at-text-weak" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-at-text-weak" />
        )}
      </button>

      {expanded && (
        <div className="ml-3 mr-1 mt-1 mb-2 space-y-1.5 px-3 py-2 rounded-lg bg-at-surface-alt border border-at-border">
          {workerStatuses.map((w) => (
            <div key={w.key} className="flex items-center justify-between text-xs">
              <span className="text-at-text-secondary">{w.label}</span>
              <div className="flex items-center space-x-1.5">
                <span className={`w-2 h-2 rounded-full ${STATUS_COLOR[w.status]}`} />
                <span className="text-at-text-secondary">
                  {STATUS_LABEL[w.status]}
                  {w.status === 'online' && w.getExtra ? w.getExtra(status) : ''}
                </span>
              </div>
            </div>
          ))}
          {overallStatus !== 'online' && overallStatus !== 'loading' && (
            <div className="pt-1 mt-1 border-t border-at-border text-[11px] text-at-text-weak leading-snug">
              워커에 문제가 있습니다. 관리자에게 설치/실행을 요청하세요.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
