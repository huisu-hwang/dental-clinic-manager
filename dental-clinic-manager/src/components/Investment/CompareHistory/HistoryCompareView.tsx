'use client'

import { useMemo } from 'react'
import { X } from 'lucide-react'
import type { BacktestRunRow } from './HistoryTab'

interface StrategyOption {
  id: string
  name: string
  strategy_type: 'rule' | 'rl_portfolio' | 'rl_single'
}

interface Props {
  rows: BacktestRunRow[]
  strategies: StrategyOption[]
  onClose: () => void
}

const PALETTE = ['#1b61c9', '#c5221f', '#1b7a3d', '#c4720a', '#6b3fa0']

const formatPct = (v: number | null | undefined): string => v == null ? '-' : `${(v * 100).toFixed(1)}%`

function normalize(curve: Array<{ date: string; equity: number }>): Array<{ idx: number; pct: number }> {
  if (curve.length === 0) return []
  const base = curve[0].equity
  return curve.map((p, i) => ({ idx: i, pct: (p.equity / base - 1) * 100 }))
}

function Overlay({ rows }: { rows: BacktestRunRow[] }) {
  const series = useMemo(
    () => rows.map((r, i) => ({
      id: r.id, color: PALETTE[i % PALETTE.length],
      points: r.equity_curve ? normalize(r.equity_curve) : [],
    })),
    [rows],
  )
  const allPoints = series.flatMap(s => s.points)
  if (allPoints.length === 0) return <div className="text-sm text-at-text-secondary">자산곡선 데이터 없음</div>

  const width = 600
  const height = 200
  const maxIdx = Math.max(...series.map(s => s.points.length - 1), 1)
  const ys = allPoints.map(p => p.pct)
  const minY = Math.min(...ys, 0)
  const maxY = Math.max(...ys, 0)
  const yRange = Math.max(maxY - minY, 1)
  const yToPx = (v: number) => height - ((v - minY) / yRange) * height
  const zeroY = yToPx(0)

  return (
    <svg width={width} height={height} className="w-full h-auto">
      <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="#e0e2e6" strokeDasharray="2 2" />
      {series.map(s => {
        if (s.points.length < 2) return null
        const path = s.points.map((p, i) => {
          const x = (p.idx / maxIdx) * width
          const y = yToPx(p.pct)
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
        }).join(' ')
        return <path key={s.id} d={path} fill="none" stroke={s.color} strokeWidth={1.5} />
      })}
    </svg>
  )
}

export default function HistoryCompareView({ rows, strategies, onClose }: Props) {
  const strategyById = useMemo(() => {
    const map = new Map<string, StrategyOption>()
    for (const s of strategies) map.set(s.id, s)
    return map
  }, [strategies])

  // 컬럼별 best 표시: total_return / sharpe_ratio 가장 높은 row
  const bestReturn = useMemo(() => {
    let best: string | null = null
    let bestVal = -Infinity
    for (const r of rows) {
      const v = r.total_return ?? -Infinity
      if (v > bestVal) { bestVal = v; best = r.id }
    }
    return best
  }, [rows])
  const bestSharpe = useMemo(() => {
    let best: string | null = null
    let bestVal = -Infinity
    for (const r of rows) {
      const v = r.sharpe_ratio ?? -Infinity
      if (v > bestVal) { bestVal = v; best = r.id }
    }
    return best
  }, [rows])

  return (
    <div className="bg-white border border-at-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-at-text">선택 {rows.length}개 비교</h3>
        <button
          onClick={onClose}
          aria-label="비교 닫기"
          title="닫기"
          className="p-1.5 rounded-xl hover:bg-at-surface-alt text-at-text-secondary"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-at-border">
        <table className="min-w-[640px] w-full text-sm">
          <thead className="bg-at-surface-alt">
            <tr>
              {['전략', '종목', '기간', '수익률', 'Sharpe', '최대 손실', '거래/Reb'].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-at-border">
            {rows.map((r) => {
              const strat = r.strategy_id ? strategyById.get(r.strategy_id) : null
              return (
                <tr key={r.id} className="hover:bg-at-surface-alt">
                  <td className="px-3 py-2">{strat?.name ?? '-'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.ticker === 'PORTFOLIO' ? 'Portfolio' : r.ticker}</td>
                  <td className="px-3 py-2 text-xs text-at-text-secondary">{r.start_date} ~ {r.end_date}</td>
                  <td className={`px-3 py-2 font-medium ${(r.total_return ?? 0) >= 0 ? 'text-at-success' : 'text-at-error'}`}>
                    {formatPct(r.total_return)} {bestReturn === r.id && <span aria-label="최고">★</span>}
                  </td>
                  <td className="px-3 py-2">
                    {(r.sharpe_ratio ?? 0).toFixed(2)} {bestSharpe === r.id && <span aria-label="최고">★</span>}
                  </td>
                  <td className="px-3 py-2 text-at-error">{formatPct(r.max_drawdown)}</td>
                  <td className="px-3 py-2 text-at-text-secondary">{r.total_trades ?? 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-3 py-2 text-xs text-at-text-weak bg-at-surface-alt">★ = 컬럼별 최고</div>
      </div>

      <div className="bg-at-surface-alt border border-at-border rounded-xl p-3">
        <div className="text-xs font-medium text-at-text-secondary mb-2">자산곡선 비교 (시작 = 0%)</div>
        <Overlay rows={rows} />
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {rows.map((r, i) => {
            const strat = r.strategy_id ? strategyById.get(r.strategy_id) : null
            return (
              <span key={r.id} className="inline-flex items-center gap-1">
                <span style={{ background: PALETTE[i % PALETTE.length] }} className="w-2 h-2 rounded-full" aria-hidden="true" />
                <span>{strat?.name ?? '-'} ({r.ticker})</span>
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
