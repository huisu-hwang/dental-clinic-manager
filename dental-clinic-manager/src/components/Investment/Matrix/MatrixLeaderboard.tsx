'use client'

import type { MatrixAggregateRow, MarketFilter, PeriodWindow } from './types'

interface Props {
  rows: MatrixAggregateRow[]
  market: MarketFilter
  periodWindow: PeriodWindow
  strategyNames: Map<string, string>
}

// DB 저장 단위: total_return / annualized / mdd / win_rate 는 모두 % (백분율 그대로)
function formatPct(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function returnColor(v: number | null) {
  if (v == null) return 'text-gray-500'
  if (v > 20) return 'text-green-700'
  if (v > 0) return 'text-green-600'
  if (v < -20) return 'text-red-700'
  if (v < 0) return 'text-red-600'
  return 'text-gray-600'
}

export default function MatrixLeaderboard({ rows, market, periodWindow, strategyNames }: Props) {
  // 시장별 분할비교 모드: KR/US 두 컬럼으로 표시
  if (market === 'SPLIT') {
    const byEntry = new Map<string, { kr?: MatrixAggregateRow; us?: MatrixAggregateRow }>()
    for (const r of rows) {
      const key = `${r.entry_type}|${r.entry_id}`
      const acc = byEntry.get(key) ?? {}
      if (r.market === 'KR') acc.kr = r
      else if (r.market === 'US') acc.us = r
      byEntry.set(key, acc)
    }
    const list = Array.from(byEntry.entries()).map(([key, v]) => {
      const [type, id] = key.split('|')
      return {
        type, id,
        name: strategyNames.get(id) ?? id,
        kr: v.kr,
        us: v.us,
        diff: ((v.kr?.avg_return ?? 0) - (v.us?.avg_return ?? 0)),
      }
    })
    list.sort((a, b) => ((b.kr?.avg_return ?? 0) + (b.us?.avg_return ?? 0)) - ((a.kr?.avg_return ?? 0) + (a.us?.avg_return ?? 0)))

    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-base font-semibold text-gray-800">시장별 분할 비교 ({periodWindow})</h3>
          <span className="text-xs text-gray-500">동일 전략의 KR vs US 평균 수익률</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">전략</th>
                <th className="px-3 py-2 text-right">KR 평균</th>
                <th className="px-3 py-2 text-right">KR 표본</th>
                <th className="px-3 py-2 text-right">US 평균</th>
                <th className="px-3 py-2 text-right">US 표본</th>
                <th className="px-3 py-2 text-right">차이 (KR-US)</th>
              </tr>
            </thead>
            <tbody>
              {list.map(item => (
                <tr key={`${item.type}|${item.id}`} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {item.name}
                    {item.type === 'shared' && (
                      <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">공유</span>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold ${returnColor(item.kr?.avg_return ?? null)}`}>
                    {formatPct(item.kr?.avg_return)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">{item.kr?.sample_size ?? 0}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${returnColor(item.us?.avg_return ?? null)}`}>
                    {formatPct(item.us?.avg_return)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">{item.us?.sample_size ?? 0}</td>
                  <td className={`px-3 py-2 text-right ${item.diff > 0 ? 'text-blue-600' : item.diff < 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                    {item.diff === 0 ? '—' : `${item.diff > 0 ? '▲' : '▼'} ${Math.abs(item.diff).toFixed(2)}%`}
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-400">데이터 없음</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // 단일 시장 / ALL 모드
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-gray-800">
          전략 랭킹 ({market === 'ALL' ? '전체' : market}, {periodWindow})
        </h3>
        <span className="text-xs text-gray-500">평균 수익률 기준 정렬</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">전략</th>
              {market === 'ALL' && <th className="px-3 py-2 text-left">시장</th>}
              <th className="px-3 py-2 text-right">평균 수익률</th>
              <th className="px-3 py-2 text-right">Sharpe</th>
              <th className="px-3 py-2 text-right">MDD</th>
              <th className="px-3 py-2 text-right">승률</th>
              <th className="px-3 py-2 text-right">최고</th>
              <th className="px-3 py-2 text-right">최저</th>
              <th className="px-3 py-2 text-right">표본수</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={`${r.entry_type}|${r.entry_id}|${r.market}`} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium text-gray-800">
                  {strategyNames.get(r.entry_id) ?? r.entry_id}
                  {r.entry_type === 'shared' && (
                    <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">공유</span>
                  )}
                </td>
                {market === 'ALL' && (
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${r.market === 'KR' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                      {r.market}
                    </span>
                  </td>
                )}
                <td className={`px-3 py-2 text-right font-semibold ${returnColor(r.avg_return)}`}>
                  {formatPct(r.avg_return)}
                </td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {r.avg_sharpe != null ? r.avg_sharpe.toFixed(2) : '—'}
                </td>
                <td className="px-3 py-2 text-right text-red-600">
                  {r.avg_mdd != null ? `${r.avg_mdd.toFixed(1)}%` : '—'}
                </td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {r.avg_winrate != null ? `${r.avg_winrate.toFixed(0)}%` : '—'}
                </td>
                <td className={`px-3 py-2 text-right ${returnColor(r.best_return)}`}>
                  {formatPct(r.best_return)}
                </td>
                <td className={`px-3 py-2 text-right ${returnColor(r.worst_return)}`}>
                  {formatPct(r.worst_return)}
                </td>
                <td className="px-3 py-2 text-right text-gray-500">{r.sample_size}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={market === 'ALL' ? 9 : 8} className="px-3 py-6 text-center text-gray-400">데이터 없음</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
