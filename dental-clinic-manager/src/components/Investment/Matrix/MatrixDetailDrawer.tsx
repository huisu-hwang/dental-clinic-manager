'use client'

import { useEffect, useState } from 'react'
import type { MatrixRow } from './types'

interface Props {
  row: MatrixRow | null
  strategyNames: Map<string, string>
  onClose: () => void
}

// DB 저장 단위: total_return / annualized / mdd / win_rate / buy_hold 모두 % (백분율 그대로)
function formatPct(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

export default function MatrixDetailDrawer({ row, strategyNames, onClose }: Props) {
  const [detail, setDetail] = useState<MatrixRow | null>(null)
  const [otherMarket, setOtherMarket] = useState<MatrixRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [showCrossMarket, setShowCrossMarket] = useState(false)

  useEffect(() => {
    if (!row) {
      setDetail(null)
      setOtherMarket(null)
      return
    }
    setLoading(true)
    // equity curve 포함 단건 조회
    const params = new URLSearchParams({
      market: row.market,
      period_window: row.period_window,
      tickers: row.ticker,
      entry_ids: row.entry_id,
      include_curve: '1',
      limit: '5',
    })
    fetch(`/api/investment/matrix/query?${params.toString()}`)
      .then(r => r.json())
      .then(j => {
        const found = (j.data ?? []).find((d: MatrixRow) => d.id === row.id) ?? j.data?.[0] ?? row
        setDetail(found)
      })
      .finally(() => setLoading(false))
  }, [row])

  useEffect(() => {
    if (!row || !showCrossMarket) {
      setOtherMarket(null)
      return
    }
    const opposite = row.market === 'KR' ? 'US' : 'KR'
    const params = new URLSearchParams({
      market: opposite,
      period_window: row.period_window,
      entry_ids: row.entry_id,
      include_curve: '0',
      limit: '20',
    })
    fetch(`/api/investment/matrix/query?${params.toString()}`)
      .then(r => r.json())
      .then(j => {
        // 평균값 계산
        const list = (j.data ?? []) as MatrixRow[]
        if (list.length === 0) {
          setOtherMarket(null)
        } else {
          const avg = list.reduce((acc, r) => acc + (r.total_return ?? 0), 0) / list.length
          setOtherMarket({
            ...list[0],
            total_return: avg,
            sharpe_ratio: list.reduce((a, r) => a + (r.sharpe_ratio ?? 0), 0) / list.length,
            max_drawdown: list.reduce((a, r) => a + (r.max_drawdown ?? 0), 0) / list.length,
          })
        }
      })
  }, [row, showCrossMarket])

  if (!row) return null

  const d = detail ?? row

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${d.market === 'KR' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                {d.market}
              </span>
              <h2 className="text-lg font-semibold text-gray-900">{d.ticker}</h2>
              <span className="text-sm text-gray-500">· {d.period_window}</span>
            </div>
            <div className="mt-1 text-sm text-gray-600">
              {strategyNames.get(d.entry_id) ?? d.entry_id}
              {d.entry_type === 'shared' && (
                <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">공유</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 px-6 py-5">
          {/* 메트릭 카드 */}
          <div className="grid grid-cols-2 gap-3">
            <Metric label="수익률" value={formatPct(d.total_return)} color={(d.total_return ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'} />
            <Metric label="연환산 수익률" value={formatPct(d.annualized_return)} />
            <Metric label="Buy & Hold" value={formatPct(d.buy_hold_return)} />
            <Metric label="Sharpe Ratio" value={d.sharpe_ratio?.toFixed(2) ?? '—'} />
            <Metric label="최대낙폭 (MDD)" value={d.max_drawdown != null ? `${d.max_drawdown.toFixed(2)}%` : '—'} color="text-red-600" />
            <Metric label="승률" value={d.win_rate != null ? `${d.win_rate.toFixed(1)}%` : '—'} />
            <Metric label="Profit Factor" value={d.profit_factor != null ? d.profit_factor.toFixed(2) : '—'} />
            <Metric label="총 거래" value={d.total_trades != null ? `${d.total_trades}건` : '—'} />
          </div>

          {/* 기간 정보 */}
          <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-600">
            <div>기간: {d.start_date} ~ {d.end_date}</div>
            <div>초기자본: {d.initial_capital.toLocaleString()}원</div>
            <div>엔진 버전: {d.engine_version} · 계산: {new Date(d.computed_at).toLocaleString('ko-KR')}</div>
          </div>

          {/* equity curve 미니 차트 */}
          {d.equity_curve_compact && d.equity_curve_compact.length > 0 && (
            <EquityCurveMiniChart data={d.equity_curve_compact} initial={d.initial_capital} />
          )}

          {/* 다른 시장 성과 토글 */}
          <div>
            <button
              type="button"
              onClick={() => setShowCrossMarket(v => !v)}
              className="w-full rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              {showCrossMarket ? '▾' : '▸'} 동일 전략 다른 시장 평균 성과 보기 ({d.market === 'KR' ? 'US' : 'KR'})
            </button>
            {showCrossMarket && (
              <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
                {otherMarket ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-sm">
                      <div className="text-xs text-gray-500">{d.market} 단일 ({d.ticker})</div>
                      <div className={`text-lg font-bold ${(d.total_return ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPct(d.total_return)}
                      </div>
                    </div>
                    <div className="text-sm">
                      <div className="text-xs text-gray-500">{d.market === 'KR' ? 'US' : 'KR'} 평균</div>
                      <div className={`text-lg font-bold ${(otherMarket.total_return ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPct(otherMarket.total_return)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">{loading ? '조회 중...' : '비교 데이터 없음'}</div>
                )}
              </div>
            )}
          </div>

          {/* ad-hoc 백테스트 링크 */}
          <a
            href={`/dashboard?tab=investment&sub=compare&ticker=${d.ticker}&market=${d.market}`}
            className="block w-full rounded-md bg-gray-800 px-4 py-2 text-center text-sm font-medium text-white hover:bg-gray-700"
          >
            이 전략으로 ad-hoc 백테스트 실행 →
          </a>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${color ?? 'text-gray-800'}`}>{value}</div>
    </div>
  )
}

function EquityCurveMiniChart({ data, initial }: { data: Array<{ d: string; e: number }>; initial: number }) {
  if (data.length === 0) return null
  const values = data.map(p => p.e)
  const min = Math.min(initial, ...values)
  const max = Math.max(initial, ...values)
  const range = Math.max(max - min, 1)
  const W = 600
  const H = 160
  const padding = 8
  const xs = (i: number) => padding + (i / (data.length - 1 || 1)) * (W - 2 * padding)
  const ys = (v: number) => H - padding - ((v - min) / range) * (H - 2 * padding)

  const linePath = data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(p.e).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${xs(data.length - 1).toFixed(1)} ${(H - padding).toFixed(1)} L ${xs(0).toFixed(1)} ${(H - padding).toFixed(1)} Z`
  const lastReturn = (data[data.length - 1].e - initial) / initial

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-sm font-medium text-gray-700">자본 곡선 (월말 샘플링)</div>
        <div className={`text-sm font-semibold ${lastReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {lastReturn >= 0 ? '+' : ''}{(lastReturn * 100).toFixed(2)}%
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* 초기자본 기준선 */}
        <line
          x1={padding} x2={W - padding}
          y1={ys(initial)} y2={ys(initial)}
          stroke="#9ca3af" strokeWidth={1} strokeDasharray="3 3"
        />
        <path d={areaPath} fill={lastReturn >= 0 ? '#dcfce7' : '#fee2e2'} opacity={0.6} />
        <path d={linePath} fill="none" stroke={lastReturn >= 0 ? '#16a34a' : '#dc2626'} strokeWidth={1.5} />
      </svg>
      <div className="mt-1 flex justify-between text-xxs text-gray-500">
        <span>{data[0]?.d}</span>
        <span>{data[data.length - 1]?.d}</span>
      </div>
    </div>
  )
}
