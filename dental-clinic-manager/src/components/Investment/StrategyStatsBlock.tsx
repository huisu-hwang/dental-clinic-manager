'use client'

/**
 * 전략 카드용 백테스트 통계 블록.
 * 전략 선택/조회 페이지의 카드에 공통으로 표시.
 */

import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react'

export interface StrategyBacktestStats {
  strategyId: string
  runs: number
  tickerCount: number
  avgReturn: number
  bestReturn: number
  worstReturn: number
  avgWinRate: number
  avgMDD: number
  avgSharpe: number
  totalTrades: number
  lastRunAt: string | null
}

interface Props {
  stats?: StrategyBacktestStats | null
  /** 작은 카드용 컴팩트 모드 (한 줄 요약) */
  compact?: boolean
}

const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
const colorPnl = (v: number) =>
  v > 0 ? 'text-red-600' : v < 0 ? 'text-blue-600' : 'text-at-text-secondary'

export default function StrategyStatsBlock({ stats, compact = false }: Props) {
  if (!stats || stats.runs === 0) {
    return (
      <div className="text-[11px] text-at-text-weak inline-flex items-center gap-1">
        <BarChart3 className="w-3 h-3" />
        백테스트 이력 없음
      </div>
    )
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="px-1.5 py-0.5 rounded bg-slate-50 text-slate-700 inline-flex items-center gap-0.5">
          <BarChart3 className="w-2.5 h-2.5" />
          {stats.runs}회
        </span>
        <span className={`px-1.5 py-0.5 rounded font-mono font-semibold ${stats.avgReturn >= 0 ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
          평균 {fmtPct(stats.avgReturn)}
        </span>
        {stats.bestReturn !== stats.avgReturn && (
          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono">
            최고 {fmtPct(stats.bestReturn)}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide inline-flex items-center gap-1">
          <BarChart3 className="w-3 h-3" />
          백테스트 통계
        </div>
        <div className="text-[10px] text-slate-500">
          {stats.runs}회 · {stats.tickerCount}종목
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="평균 수익률" value={fmtPct(stats.avgReturn)} colorClass={colorPnl(stats.avgReturn)} icon={stats.avgReturn >= 0 ? TrendingUp : TrendingDown} />
        <Stat label="최고" value={fmtPct(stats.bestReturn)} colorClass="text-emerald-600" />
        <Stat label="최저" value={fmtPct(stats.worstReturn)} colorClass="text-rose-600" />
        <Stat label="평균 승률" value={`${stats.avgWinRate.toFixed(0)}%`} />
        <Stat label="평균 MDD" value={fmtPct(-Math.abs(stats.avgMDD))} colorClass="text-blue-600" />
        <Stat label="평균 Sharpe" value={stats.avgSharpe.toFixed(2)} />
      </div>

      <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-200">
        <span>총 매매 {stats.totalTrades.toLocaleString()}건</span>
        {stats.lastRunAt && (
          <span>최근 {new Date(stats.lastRunAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}</span>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  colorClass,
  icon: Icon,
}: {
  label: string
  value: string
  colorClass?: string
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="bg-white rounded px-1.5 py-1 border border-slate-100">
      <p className="text-[9px] text-slate-500 leading-tight">{label}</p>
      <p className={`text-[11px] font-mono font-semibold inline-flex items-center gap-0.5 ${colorClass ?? 'text-slate-900'}`}>
        {Icon && <Icon className="w-2.5 h-2.5" />}
        {value}
      </p>
    </div>
  )
}
