'use client'

/**
 * 공유 전략 랭킹 — 항목별 상위 N
 *
 * 다른 구독자가 공개한 전략들을 백테스트 통계 기준으로 정렬해 보여주고,
 * 클론 버튼으로 내 계정에 복사할 수 있음.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Trophy, TrendingUp, TrendingDown, Target as TargetIcon, BarChart3, Activity,
  Share2, Copy, Loader2, RefreshCw, Award, Users,
} from 'lucide-react'
import type { Market } from '@/types/investment'

type SortKey =
  | 'avgReturn' | 'bestReturn' | 'avgWinRate' | 'avgSharpe'
  | 'avgPF' | 'avgMDD' | 'totalTrades' | 'cloneCount'

interface Ranking {
  strategyId: string
  name: string
  description: string | null
  targetMarket: Market
  authorAlias: string
  sharedAt: string | null
  cloneCount: number
  isMine: boolean
  runs: number
  tickerCount: number
  avgReturn: number
  bestReturn: number
  worstReturn: number
  avgWinRate: number
  avgSharpe: number
  avgMDD: number
  avgPF: number
  totalTrades: number
  lastRunAt: string | null
}

const SORT_OPTIONS: Array<{ key: SortKey; label: string; desc: string; icon: React.ReactNode }> = [
  { key: 'avgReturn', label: '평균 수익률', desc: '백테스트 수익률 평균', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { key: 'bestReturn', label: '최고 수익률', desc: '단일 백테스트 최고치', icon: <Trophy className="w-3.5 h-3.5" /> },
  { key: 'avgWinRate', label: '승률', desc: '평균 승률', icon: <TargetIcon className="w-3.5 h-3.5" /> },
  { key: 'avgSharpe', label: 'Sharpe', desc: '위험 대비 수익', icon: <Activity className="w-3.5 h-3.5" /> },
  { key: 'avgPF', label: 'PF', desc: '수익/손실 비율', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { key: 'avgMDD', label: 'MDD ↓', desc: '최저 낙폭(낮을수록 좋음)', icon: <TrendingDown className="w-3.5 h-3.5" /> },
  { key: 'totalTrades', label: '거래 수', desc: '백테스트 거래 합계', icon: <Activity className="w-3.5 h-3.5" /> },
  { key: 'cloneCount', label: '인기', desc: '클론된 횟수', icon: <Users className="w-3.5 h-3.5" /> },
]

const MARKET_LABELS: Record<string, string> = { ALL: '전체', KR: '국내', US: '미국' }

export default function RankingsPage() {
  const [market, setMarket] = useState<'ALL' | Market>('ALL')
  const [sortBy, setSortBy] = useState<SortKey>('avgReturn')
  const [items, setItems] = useState<Ranking[]>([])
  const [totalShared, setTotalShared] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [cloning, setCloning] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/investment/strategies/rankings?market=${market}&sortBy=${sortBy}&limit=100`, {
        cache: 'no-store',
      })
      const json = await res.json()
      if (res.ok) {
        setItems(json.data ?? [])
        setTotalShared(json.totalShared ?? 0)
      } else {
        setItems([])
        setTotalShared(0)
      }
    } finally {
      setLoading(false)
    }
  }, [market, sortBy])

  useEffect(() => { load() }, [load])

  const sortLabel = useMemo(
    () => SORT_OPTIONS.find(o => o.key === sortBy)?.label ?? '평균 수익률',
    [sortBy],
  )

  const handleClone = async (strategyId: string, name: string) => {
    if (!confirm(`"${name}" 을(를) 내 전략으로 복사하시겠습니까?`)) return
    setCloning(strategyId)
    try {
      const res = await fetch('/api/investment/strategies/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '클론 실패')
        return
      }
      alert(`✅ 내 전략에 복사되었습니다. "전략 관리" 페이지에서 확인하세요.`)
      // 클론 후 인기 카운트 갱신
      load()
    } finally {
      setCloning(null)
    }
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div>
        <div className="flex items-center gap-2">
          <Trophy className="w-6 h-6 text-amber-500" />
          <h1 className="text-xl font-bold text-at-text">전략 랭킹</h1>
        </div>
        <p className="text-sm text-at-text-secondary mt-1">
          다른 구독자들이 공유한 전략을 백테스트 통계 기준으로 정렬해 보여줍니다. 마음에 드는 전략은 내 계정으로 복사할 수 있어요.
        </p>
      </div>

      {/* 필터/정렬 영역 */}
      <section className="bg-white rounded-2xl border border-at-border p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          {/* 시장 필터 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-at-text-secondary">시장</span>
            <div className="inline-flex rounded-xl bg-at-surface-alt p-0.5">
              {(['ALL', 'KR', 'US'] as const).map(m => {
                const active = market === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMarket(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active ? 'bg-white text-at-accent shadow-sm' : 'text-at-text-secondary hover:text-at-text'
                    }`}
                  >
                    {MARKET_LABELS[m]}
                  </button>
                )
              })}
            </div>
            <span className="ml-auto text-[11px] text-at-text-weak">
              총 공유 전략 <span className="font-semibold text-at-text">{totalShared}</span>개
              {items.length > 0 && (
                <span> · 통계 충분 {items.length}개</span>
              )}
            </span>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-at-text-secondary hover:bg-at-surface-alt"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              새로고침
            </button>
          </div>

          {/* 정렬 기준 */}
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-xs font-semibold text-at-text-secondary mt-1.5">정렬 기준</span>
            <div className="flex flex-wrap gap-1">
              {SORT_OPTIONS.map(opt => {
                const active = sortBy === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSortBy(opt.key)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active
                        ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
                        : 'bg-at-surface-alt text-at-text-secondary hover:bg-at-bg'
                    }`}
                    title={opt.desc}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 랭킹 결과 */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-at-border p-8 text-center text-at-text-secondary">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          랭킹 불러오는 중...
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-at-border p-10 text-center text-at-text-secondary">
          <Share2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">
            {totalShared === 0
              ? '아직 공유된 전략이 없습니다. 전략 관리 페이지에서 본인 전략을 공유해보세요.'
              : '백테스트 횟수가 충분한 전략이 없습니다 (각 전략당 최소 3회 이상 백테스트 필요).'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-at-text-weak">
            {sortLabel} 기준 상위 {items.length}개 전략
          </p>
          {items.map((it, idx) => (
            <RankingCard
              key={it.strategyId}
              rank={idx + 1}
              item={it}
              sortBy={sortBy}
              onClone={() => handleClone(it.strategyId, it.name)}
              cloning={cloning === it.strategyId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RankingCard({
  rank, item, sortBy, onClone, cloning,
}: {
  rank: number
  item: Ranking
  sortBy: SortKey
  onClone: () => void
  cloning: boolean
}) {
  const featureValue = (() => {
    switch (sortBy) {
      case 'avgReturn': return `${item.avgReturn > 0 ? '+' : ''}${item.avgReturn.toFixed(2)}%`
      case 'bestReturn': return `${item.bestReturn > 0 ? '+' : ''}${item.bestReturn.toFixed(2)}%`
      case 'avgWinRate': return `${item.avgWinRate.toFixed(1)}%`
      case 'avgSharpe': return item.avgSharpe.toFixed(2)
      case 'avgPF': return item.avgPF.toFixed(2)
      case 'avgMDD': return `${item.avgMDD.toFixed(2)}%`
      case 'totalTrades': return `${item.totalTrades}회`
      case 'cloneCount': return `${item.cloneCount}회`
    }
  })()
  const isTop3 = rank <= 3
  const rankBg = rank === 1 ? 'bg-amber-500' : rank === 2 ? 'bg-slate-400' : rank === 3 ? 'bg-orange-400' : 'bg-slate-200 text-slate-700'

  return (
    <div className={`bg-white rounded-2xl border ${isTop3 ? 'border-amber-200 ring-1 ring-amber-100' : 'border-at-border'} shadow-sm p-4`}>
      <div className="flex items-start gap-3">
        {/* 순위 뱃지 */}
        <div className={`flex-shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center text-sm font-bold text-white ${rankBg}`}>
          {isTop3 ? <Award className="w-4 h-4" /> : rank}
        </div>

        {/* 본문 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-at-text break-all">{item.name}</h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
              item.targetMarket === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
            }`}>
              {item.targetMarket === 'KR' ? '국내' : '미국'}
            </span>
            {item.isMine && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">내 전략</span>
            )}
            <span className="text-[10px] text-at-text-weak inline-flex items-center gap-0.5">
              👤 {item.authorAlias}
            </span>
          </div>
          {item.description && (
            <p className="text-xs text-at-text-secondary mt-1 line-clamp-2">{item.description}</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
            <Metric label="평균 수익률" value={`${item.avgReturn > 0 ? '+' : ''}${item.avgReturn.toFixed(1)}%`} highlight={sortBy === 'avgReturn'} positive={item.avgReturn > 0} />
            <Metric label="최고" value={`${item.bestReturn > 0 ? '+' : ''}${item.bestReturn.toFixed(1)}%`} highlight={sortBy === 'bestReturn'} positive={item.bestReturn > 0} />
            <Metric label="승률" value={`${item.avgWinRate.toFixed(0)}%`} highlight={sortBy === 'avgWinRate'} />
            <Metric label="Sharpe" value={item.avgSharpe.toFixed(2)} highlight={sortBy === 'avgSharpe'} />
            <Metric label="MDD" value={`${item.avgMDD.toFixed(1)}%`} highlight={sortBy === 'avgMDD'} positive={false} />
            <Metric label="PF" value={item.avgPF.toFixed(2)} highlight={sortBy === 'avgPF'} />
            <Metric label="거래" value={`${item.totalTrades}회`} highlight={sortBy === 'totalTrades'} />
            <Metric label="백테스트" value={`${item.runs}회 / ${item.tickerCount}종목`} />
          </div>
        </div>

        {/* 우측 — 핵심 지표 + 클론 버튼 */}
        <div className="flex-shrink-0 flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="text-[10px] text-at-text-weak">{SORT_OPTIONS.find(o => o.key === sortBy)?.label}</div>
            <div className="text-lg font-bold text-amber-700 font-mono">{featureValue}</div>
          </div>
          {item.cloneCount > 0 && (
            <span className="text-[10px] text-at-text-weak inline-flex items-center gap-0.5">
              <Users className="w-3 h-3" />
              {item.cloneCount}회 클론됨
            </span>
          )}
          <button
            type="button"
            onClick={onClone}
            disabled={cloning || item.isMine}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-at-accent text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            title={item.isMine ? '본인 전략은 클론할 필요가 없습니다' : '내 전략으로 복사'}
          >
            {cloning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
            {item.isMine ? '내 전략' : '내 전략으로 복사'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Metric({
  label, value, highlight, positive,
}: {
  label: string
  value: string
  highlight?: boolean
  positive?: boolean
}) {
  let valueCls = 'text-at-text font-mono font-semibold'
  if (positive === true) valueCls = 'text-rose-600 font-mono font-semibold'
  else if (positive === false) valueCls = 'text-blue-600 font-mono font-semibold'
  return (
    <div className={`rounded-lg px-2 py-1 ${highlight ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-at-surface-alt'}`}>
      <div className="text-[10px] text-at-text-weak">{label}</div>
      <div className={valueCls}>{value}</div>
    </div>
  )
}
