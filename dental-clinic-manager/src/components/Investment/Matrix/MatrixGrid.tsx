'use client'

import { useMemo } from 'react'
import type { MatrixRow, MarketFilter } from './types'

interface Props {
  rows: MatrixRow[]
  market: MarketFilter
  strategyNames: Map<string, string>
  onCellClick?: (row: MatrixRow) => void
}

// DB 단위: % (백분율 그대로 저장). 임계값도 % 단위.
function returnBgClass(v: number | null) {
  if (v == null) return 'bg-gray-50 text-gray-400'
  if (v >= 100) return 'bg-green-700 text-white'
  if (v >= 50) return 'bg-green-600 text-white'
  if (v >= 20) return 'bg-green-500 text-white'
  if (v >= 5) return 'bg-green-200 text-green-900'
  if (v >= -5) return 'bg-gray-100 text-gray-700'
  if (v >= -20) return 'bg-red-200 text-red-900'
  if (v >= -50) return 'bg-red-500 text-white'
  return 'bg-red-700 text-white'
}

function formatPct(v: number | null) {
  if (v == null || !isFinite(v)) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

export default function MatrixGrid({ rows, market, strategyNames, onCellClick }: Props) {
  const { tickers, strategies, cellMap } = useMemo(() => {
    const tickerSet = new Map<string, { ticker: string; market: 'KR' | 'US' }>()
    const stratSet = new Map<string, { id: string; type: 'preset' | 'shared' }>()
    const cellMap = new Map<string, MatrixRow>()
    for (const r of rows) {
      tickerSet.set(r.ticker, { ticker: r.ticker, market: r.market })
      stratSet.set(r.entry_id, { id: r.entry_id, type: r.entry_type })
      cellMap.set(`${r.entry_id}|${r.ticker}`, r)
    }
    const tickers = Array.from(tickerSet.values())
    // 분할비교 모드: KR 그룹 → US 그룹 순으로 정렬
    if (market === 'SPLIT' || market === 'ALL') {
      tickers.sort((a, b) => {
        if (a.market !== b.market) return a.market === 'KR' ? -1 : 1
        return a.ticker.localeCompare(b.ticker)
      })
    } else {
      tickers.sort((a, b) => a.ticker.localeCompare(b.ticker))
    }
    const strategies = Array.from(stratSet.values())
    return { tickers, strategies, cellMap }
  }, [rows, market])

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
        조건에 맞는 매트릭스 데이터가 없습니다. 필터를 조정하거나 사전계산 배치가 끝났는지 확인하세요.
      </div>
    )
  }

  // KR과 US 사이 시각적 분할 인덱스
  const splitIndex = (market === 'SPLIT' || market === 'ALL')
    ? tickers.findIndex(t => t.market === 'US')
    : -1

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-gray-800">전략 × 종목 매트릭스</h3>
        <span className="text-xs text-gray-500">
          {strategies.length}개 전략 × {tickers.length}개 종목 ({rows.length} cells)
        </span>
      </div>
      <div className="overflow-auto" style={{ maxHeight: '600px' }}>
        <table className="text-xs">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th className="sticky left-0 z-20 min-w-[160px] bg-gray-50 px-2 py-2 text-left font-medium text-gray-700">
                전략 / 종목
              </th>
              {tickers.map((t, i) => (
                <th
                  key={t.ticker}
                  className={`bg-gray-50 px-1.5 py-2 text-center font-mono font-medium text-gray-700 ${
                    i === splitIndex ? 'border-l-2 border-gray-400' : ''
                  }`}
                  style={{ minWidth: 60 }}
                >
                  <span className={`block text-xxs ${t.market === 'KR' ? 'text-red-600' : 'text-blue-600'}`}>
                    {t.market}
                  </span>
                  {t.ticker}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strategies.map(s => (
              <tr key={s.id} className="border-t border-gray-100">
                <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-medium text-gray-800">
                  {strategyNames.get(s.id) ?? s.id}
                  {s.type === 'shared' && (
                    <span className="ml-1 rounded bg-purple-100 px-1 text-xxs text-purple-700">공유</span>
                  )}
                </td>
                {tickers.map((t, i) => {
                  const cell = cellMap.get(`${s.id}|${t.ticker}`)
                  return (
                    <td
                      key={t.ticker}
                      className={`px-1 py-1.5 text-center font-mono ${returnBgClass(cell?.total_return ?? null)} ${
                        i === splitIndex ? 'border-l-2 border-gray-400' : ''
                      } ${cell ? 'cursor-pointer transition hover:opacity-80' : ''}`}
                      title={cell
                        ? `${strategyNames.get(s.id) ?? s.id} · ${t.market} ${t.ticker}\n수익률: ${formatPct(cell.total_return)}\nMDD: ${cell.max_drawdown != null ? cell.max_drawdown.toFixed(1) + '%' : '—'}\nSharpe: ${cell.sharpe_ratio?.toFixed(2) ?? '—'}\n거래: ${cell.total_trades ?? 0}건`
                        : '데이터 없음'}
                      onClick={() => cell && onCellClick?.(cell)}
                    >
                      {cell ? formatPct(cell.total_return) : '·'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-1 text-xxs text-gray-500">
        <span>색상 범례:</span>
        <span className="rounded bg-red-700 px-1.5 py-0.5 text-white">≤-50%</span>
        <span className="rounded bg-red-200 px-1.5 py-0.5 text-red-900">~-5%</span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5">±5%</span>
        <span className="rounded bg-green-200 px-1.5 py-0.5 text-green-900">+5~20%</span>
        <span className="rounded bg-green-600 px-1.5 py-0.5 text-white">+50%↑</span>
        <span className="rounded bg-green-700 px-1.5 py-0.5 text-white">+100%↑</span>
      </div>
    </div>
  )
}
