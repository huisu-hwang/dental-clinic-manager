'use client'

/**
 * 스크리너 결과 뷰 — 라이브 스캔 결과와 히스토리 단건 조회 뷰에서 공용 사용.
 *
 * 시총 순위로 정렬 + 매치 종목 행 클릭 시 onSelectTicker 콜백.
 */

import { useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight, Info, Zap } from 'lucide-react'
import { topByMarketCap as topUSByMarketCap } from '@/lib/usTickerCatalog'
import { getKRMarketCapRank } from '@/lib/krTickerCatalog'
import type { Market } from '@/types/investment'

interface ScreenerMatch {
  ticker: string
  market: Market
  name: string
  price: number
  asOfDate: string
  matchedConditions: string[]
  indicators: Record<string, unknown>
}

interface FailedEntry {
  ticker: string
  market: Market
  reason: string
}

export interface ScreenerResultsData {
  asOfDate: string
  universeLabel: string
  realtime: boolean
  total: number
  processed: number
  strategyKeys: string[]
  strategyNames: Record<string, string>
  matchesByStrategy: Record<string, ScreenerMatch[]>
  failedByStrategy: Record<string, FailedEntry[]>
}

interface Props {
  data: ScreenerResultsData
  onSelectTicker?: (ticker: string, market: Market, name: string) => void
  /** 헤더 메시지 prefix 변경 (예: '🎯 매수 조건 충족 종목' 기본) */
  headerLabel?: string
}

let _usRankIndex: Map<string, number> | null = null
function getMarketCapRank(ticker: string, market: Market): number | null {
  if (market === 'KR') return getKRMarketCapRank(ticker)
  if (!_usRankIndex) {
    const list = topUSByMarketCap(10000)
    _usRankIndex = new Map(list.map((e, i) => [e.ticker, i + 1]))
  }
  return _usRankIndex.get((ticker ?? '').toUpperCase()) ?? null
}

export default function ScreenerResultsView({
  data,
  onSelectTicker,
  headerLabel = '🎯 매수 조건 충족 종목',
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const totalMatches = Object.values(data.matchesByStrategy).reduce(
    (sum, arr) => sum + arr.length,
    0,
  )

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (data.strategyKeys.length === 0) {
    return (
      <div className="text-xs text-at-text-weak text-center py-6">
        실행된 전략이 없습니다.
      </div>
    )
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-semibold text-at-text">
          {headerLabel} (전체 {totalMatches}건 / {data.processed}/{data.total} 평가)
        </h2>
        <div className="flex items-center gap-2 text-xs text-at-text-secondary">
          <span>기준일: <span className="font-mono">{data.asOfDate}</span></span>
          <span>·</span>
          <span>{data.universeLabel}</span>
          {data.realtime && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-0.5 text-amber-700 font-semibold">
                <Zap className="w-3 h-3" /> 실시간
              </span>
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {data.strategyKeys.map((strategyKey) => {
          const rawMatches = data.matchesByStrategy[strategyKey] || []
          const matches = rawMatches
            .map((m) => ({ ...m, _rank: getMarketCapRank(m.ticker, m.market) }))
            .sort((a, b) => {
              const ra = a._rank ?? Number.POSITIVE_INFINITY
              const rb = b._rank ?? Number.POSITIVE_INFINITY
              return ra - rb
            })
          const failed = data.failedByStrategy[strategyKey] || []
          const strategyName = data.strategyNames[strategyKey] || strategyKey
          const isCollapsed = collapsed.has(strategyKey)

          return (
            <div key={strategyKey} className="rounded-xl border border-at-border bg-white">
              <button
                onClick={() => toggle(strategyKey)}
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-at-surface-alt hover:bg-at-bg rounded-t-xl"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-at-text-weak" /> : <ChevronDown className="w-4 h-4 text-at-text-weak" />}
                  <span className="font-semibold text-sm text-at-text">{strategyName}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    matches.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-at-surface text-at-text-weak'
                  }`}>
                    {matches.length}건 충족
                  </span>
                </div>
                {failed.length > 0 && (
                  <span className="text-[10px] text-at-text-weak">실패 {failed.length}건</span>
                )}
              </button>

              {!isCollapsed && (
                <>
                  {matches.length === 0 ? (
                    <div className="p-6 text-center">
                      <AlertCircle className="w-6 h-6 mx-auto text-at-text-weak mb-1.5 opacity-60" />
                      <p className="text-xs text-at-text-secondary">충족 종목 없음</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-at-surface-alt/40 border-t border-at-border/60">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-at-text-secondary w-16">시총 순위</th>
                            <th className="px-3 py-2 text-left font-medium text-at-text-secondary">시장</th>
                            <th className="px-3 py-2 text-left font-medium text-at-text-secondary">종목</th>
                            <th className="px-3 py-2 text-left font-medium text-at-text-secondary">이름</th>
                            <th className="px-3 py-2 text-right font-medium text-at-text-secondary">기준일 종가</th>
                            <th className="px-3 py-2 text-left font-medium text-at-text-secondary">충족 조건</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matches.map((m) => {
                            const rowKey = `${strategyKey}|${m.market}:${m.ticker}`
                            return (
                              <tr
                                key={rowKey}
                                className={`border-t border-at-border ${onSelectTicker ? 'hover:bg-at-surface-alt cursor-pointer' : ''}`}
                                onClick={() => onSelectTicker?.(m.ticker, m.market, m.name)}
                              >
                                <td className="px-3 py-2 font-mono text-at-text-secondary">
                                  {m._rank == null ? '—' : `#${m._rank}`}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                    m.market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                  }`}>
                                    {m.market === 'KR' ? '국내' : '미국'}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-mono font-semibold text-at-accent">{m.ticker}</td>
                                <td className="px-3 py-2 text-at-text">{m.name}</td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {m.market === 'KR' ? `${Math.round(m.price).toLocaleString()}원` : `$${m.price.toFixed(2)}`}
                                </td>
                                <td className="px-3 py-2 text-at-text-secondary text-[11px]">
                                  {m.matchedConditions.length === 0 ? '—' :
                                    m.matchedConditions.length === 1 ? m.matchedConditions[0] :
                                    `${m.matchedConditions[0]} 외 ${m.matchedConditions.length - 1}건`}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {failed.length > 0 && (
                    <div className="px-3 py-2 text-xs text-at-text-weak border-t border-at-border/60">
                      <details>
                        <summary className="cursor-pointer hover:text-at-text">
                          평가 실패 {failed.length}건
                        </summary>
                        <ul className="mt-2 space-y-0.5 ml-4">
                          {failed.slice(0, 10).map((f, i) => (
                            <li key={i}>[{f.market}] {f.ticker} — {f.reason}</li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {onSelectTicker && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-at-text-weak">
          <Info className="w-3 h-3" />
          <span>각 종목 행 클릭 시 펀더멘털·차트·충족 조건 상세 모달 오픈. 전략 헤더 클릭으로 섹션 접기/펼치기.</span>
        </div>
      )}
    </section>
  )
}
