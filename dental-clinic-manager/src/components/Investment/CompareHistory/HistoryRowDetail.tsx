'use client'

import { useMemo } from 'react'
import type { BacktestRunRow } from './HistoryTab'

interface Props {
  row: BacktestRunRow
}

const formatPct = (v: number | null | undefined): string => {
  if (v == null) return '-'
  return `${(v * 100).toFixed(1)}%`
}

function sampleCurve(curve: Array<{ date: string; equity: number }>, maxPoints: number): Array<{ date: string; equity: number }> {
  if (curve.length <= maxPoints) return curve
  const step = curve.length / maxPoints
  const out: Array<{ date: string; equity: number }> = []
  for (let i = 0; i < maxPoints; i++) {
    out.push(curve[Math.floor(i * step)])
  }
  out[out.length - 1] = curve[curve.length - 1]
  return out
}

function Sparkline({ points, width = 320, height = 60 }: { points: Array<{ date: string; equity: number }>; width?: number; height?: number }) {
  if (points.length < 2) {
    return <div className="text-xs text-at-text-weak">곡선 데이터 부족</div>
  }
  const min = Math.min(...points.map(p => p.equity))
  const max = Math.max(...points.map(p => p.equity))
  const range = Math.max(max - min, 1e-6)
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width
    const y = height - ((p.equity - min) / range) * height
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  const lastY = height - ((points[points.length - 1].equity - min) / range) * height
  const firstY = height - ((points[0].equity - min) / range) * height
  const isUp = points[points.length - 1].equity >= points[0].equity
  const color = isUp ? '#1b7a3d' : '#c5221f'  // at-success / at-error 헥스 (svg는 토큰 미해석)
  return (
    <svg width={width} height={height} className="block">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
      <line x1={0} y1={firstY} x2={width} y2={firstY} stroke="#e0e2e6" strokeDasharray="2 2" />
      <circle cx={width} cy={lastY} r={3} fill={color} />
    </svg>
  )
}

export default function HistoryRowDetail({ row }: Props) {
  const sampled = useMemo(
    () => row.equity_curve ? sampleCurve(row.equity_curve, 60) : [],
    [row.equity_curve],
  )
  const trades = (row.trades ?? []) as Array<Record<string, unknown>>
  const previewTrades = trades.slice(0, 5)
  const isRLPortfolio = row.ticker === 'PORTFOLIO'

  return (
    <div className="space-y-3">
      {sampled.length > 0 && (
        <div className="bg-white border border-at-border rounded-xl p-3">
          <div className="text-xs text-at-text-secondary mb-1">자산곡선 (period: {row.start_date} ~ {row.end_date})</div>
          <Sparkline points={sampled} />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-at-border rounded-xl p-3">
          <div className="text-xs text-at-text-secondary">총 수익률</div>
          <div className={`text-xl font-bold ${(row.total_return ?? 0) >= 0 ? 'text-at-success' : 'text-at-error'}`}>
            {formatPct(row.total_return)}
          </div>
        </div>
        <div className="bg-white border border-at-border rounded-xl p-3">
          <div className="text-xs text-at-text-secondary">Sharpe</div>
          <div className="text-xl font-bold text-at-text">{(row.sharpe_ratio ?? 0).toFixed(2)}</div>
        </div>
        <div className="bg-white border border-at-border rounded-xl p-3">
          <div className="text-xs text-at-text-secondary">최대 손실</div>
          <div className="text-xl font-bold text-at-error">{formatPct(row.max_drawdown)}</div>
        </div>
        <div className="bg-white border border-at-border rounded-xl p-3">
          <div className="text-xs text-at-text-secondary">{isRLPortfolio ? 'Rebalance' : '거래 수'}</div>
          <div className="text-xl font-bold text-at-text">{row.total_trades ?? 0}</div>
        </div>
      </div>

      {!isRLPortfolio && previewTrades.length > 0 && (
        <div className="bg-white border border-at-border rounded-xl p-3">
          <div className="text-xs font-medium text-at-text-secondary mb-2">최근 거래 ({previewTrades.length} / {trades.length})</div>
          <div className="overflow-x-auto">
            <table className="min-w-[480px] w-full text-xs">
              <thead className="text-at-text-weak">
                <tr>
                  <th className="text-left px-2 py-1">진입</th>
                  <th className="text-left px-2 py-1">청산</th>
                  <th className="text-right px-2 py-1">수익률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-at-border">
                {previewTrades.map((t, i) => {
                  const entry = (t.entryDate ?? t.entry_date ?? '') as string
                  const exit = (t.exitDate ?? t.exit_date ?? '') as string
                  const pnl = (t.returnPct ?? t.return_pct ?? null) as number | null
                  return (
                    <tr key={i}>
                      <td className="px-2 py-1 font-mono">{entry || '-'}</td>
                      <td className="px-2 py-1 font-mono">{exit || '-'}</td>
                      <td className={`px-2 py-1 text-right ${pnl == null ? '' : pnl >= 0 ? 'text-at-success' : 'text-at-error'}`}>
                        {pnl == null ? '-' : formatPct(pnl / 100)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isRLPortfolio && (
        <div className="bg-at-surface-alt border border-at-border rounded-xl p-3 text-xs text-at-text-secondary">
          이 백테스트는 RL portfolio (다종목 동시 결정) 결과로 개별 trade 대신 매월 rebalance 단위로 계산되었습니다.
        </div>
      )}
    </div>
  )
}
