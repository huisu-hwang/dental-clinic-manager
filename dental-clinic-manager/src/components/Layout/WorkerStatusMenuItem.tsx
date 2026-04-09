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

/**
 * 좌측 메뉴 하단에 워커 상태를 표시하는 아이템
 *
 * - 통합 워커가 필요한 프리미엄 기능(`financial`, `marketing`)이 활성화된 사용자에게만 표시
 * - 30초마다 자동 갱신, 수동 새로고침 가능
 * - 클릭 시 상세(마케팅/스크래핑 각각) 토글
 * - 상태: 온라인(녹색) / 오프라인(주황) / 미설치(빨강) / 확인 중(회색)
 */
export default function WorkerStatusMenuItem() {
  const { hasPremiumFeature, isLoading: premiumLoading } = usePremiumFeatures()
  const needsMarketing = hasPremiumFeature('marketing')
  const needsScraping = hasPremiumFeature('financial')
  const needsAny = needsMarketing || needsScraping

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

  // 프리미엄 로딩 중이거나, 워커가 필요한 기능이 없으면 표시하지 않음
  if (premiumLoading || !needsAny) return null

  const marketingStatus = resolveStatus(status.marketing?.installed, status.marketing?.online, loading)
  const scrapingStatus = resolveStatus(status.scraping?.installed, status.scraping?.online, loading)

  // 통합 상태: 필요한 워커 중 하나라도 문제 있으면 전체 문제로 표기
  const overallStatus: Status = (() => {
    const relevant: Status[] = []
    if (needsMarketing) relevant.push(marketingStatus)
    if (needsScraping) relevant.push(scrapingStatus)
    if (relevant.length === 0 || relevant.includes('loading')) return 'loading'
    if (relevant.every((s) => s === 'online')) return 'online'
    if (relevant.some((s) => s === 'not-installed')) return 'not-installed'
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
        className="group flex items-center space-x-3 py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 w-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        title="워커 상태"
      >
        <div className="relative flex-shrink-0">
          <Server className="w-5 h-5 text-slate-400 group-hover:text-slate-600" />
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
          className="p-0.5 rounded hover:bg-slate-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${refreshing ? 'animate-spin' : ''}`} />
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="ml-3 mr-1 mt-1 mb-2 space-y-1.5 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
          {needsMarketing && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">마케팅 워커</span>
              <div className="flex items-center space-x-1.5">
                <span className={`w-2 h-2 rounded-full ${STATUS_COLOR[marketingStatus]}`} />
                <span className="text-slate-500">{STATUS_LABEL[marketingStatus]}</span>
              </div>
            </div>
          )}
          {needsScraping && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">스크래핑 워커</span>
              <div className="flex items-center space-x-1.5">
                <span className={`w-2 h-2 rounded-full ${STATUS_COLOR[scrapingStatus]}`} />
                <span className="text-slate-500">
                  {STATUS_LABEL[scrapingStatus]}
                  {scrapingStatus === 'online' && status.scraping?.workerCount
                    ? ` (${status.scraping.workerCount})`
                    : ''}
                </span>
              </div>
            </div>
          )}
          {overallStatus !== 'online' && overallStatus !== 'loading' && (
            <div className="pt-1 mt-1 border-t border-slate-200 text-[11px] text-slate-400 leading-snug">
              워커에 문제가 있습니다. 관리자에게 설치/실행을 요청하세요.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
