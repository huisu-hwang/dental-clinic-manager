'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PeriodWindow, MarketFilter, SortKey, SortDir } from './types'
import { searchKRTicker } from '@/lib/krTickerDict'
import { searchUSTicker } from '@/lib/usTickerDict'

interface Props {
  market: MarketFilter
  onMarketChange: (m: MarketFilter) => void
  periodWindow: PeriodWindow
  onPeriodChange: (w: PeriodWindow) => void
  selectedStrategies: string[]
  onStrategiesChange: (ids: string[]) => void
  availableStrategies: Array<{ id: string; name: string; type: 'preset' | 'shared' }>
  tickersText: string
  onTickersChange: (v: string) => void
  sortKey: SortKey
  sortDir: SortDir
  onSortKeyChange: (k: SortKey) => void
  onSortDirToggle: () => void
  loading?: boolean
}

const MARKETS: Array<{ value: MarketFilter; label: string; desc: string }> = [
  { value: 'ALL', label: '전체', desc: 'KR + US 통합' },
  { value: 'KR', label: 'KR만', desc: '국내 종목' },
  { value: 'US', label: 'US만', desc: '미국 종목' },
  { value: 'SPLIT', label: 'KR/US 분할비교', desc: '시장별 좌우 비교' },
]

const WINDOWS: PeriodWindow[] = ['1Y', '3Y', '5Y', '10Y']

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'avg_return', label: '평균 수익률' },
  { value: 'avg_annualized', label: '연환산 수익률' },
  { value: 'avg_sharpe', label: 'Sharpe' },
  { value: 'avg_mdd', label: 'MDD (최대낙폭)' },
  { value: 'avg_winrate', label: '승률' },
  { value: 'avg_profit_factor', label: 'Profit Factor' },
  { value: 'best_return', label: '최고 수익률' },
  { value: 'worst_return', label: '최저 수익률' },
  { value: 'sample_size', label: '표본 수' },
]

export default function MatrixFilters(props: Props) {
  const {
    market, onMarketChange,
    periodWindow, onPeriodChange,
    selectedStrategies, onStrategiesChange,
    availableStrategies,
    tickersText, onTickersChange,
    sortKey, sortDir, onSortKeyChange, onSortDirToggle,
    loading,
  } = props

  const presets = useMemo(() => availableStrategies.filter(s => s.type === 'preset'), [availableStrategies])
  const shared = useMemo(() => availableStrategies.filter(s => s.type === 'shared'), [availableStrategies])

  const toggleStrategy = (id: string) => {
    if (selectedStrategies.includes(id)) {
      onStrategiesChange(selectedStrategies.filter(s => s !== id))
    } else {
      onStrategiesChange([...selectedStrategies, id])
    }
  }

  const selectAll = () => onStrategiesChange(availableStrategies.map(s => s.id))
  const clearAll = () => onStrategiesChange([])

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {/* 시장 토글 */}
      <div>
        <div className="mb-2 text-sm font-medium text-gray-700">시장</div>
        <div className="flex flex-wrap gap-2">
          {MARKETS.map(m => (
            <button
              key={m.value}
              type="button"
              onClick={() => onMarketChange(m.value)}
              disabled={loading}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                market === m.value
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
              title={m.desc}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* 기간 */}
      <div>
        <div className="mb-2 text-sm font-medium text-gray-700">기간 (Window)</div>
        <div className="flex gap-2">
          {WINDOWS.map(w => (
            <button
              key={w}
              type="button"
              onClick={() => onPeriodChange(w)}
              disabled={loading}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                periodWindow === w
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* 종목 필터 — self-isolated 컴포넌트 (외부 re-render/loading 영향 차단) */}
      <TickersInput value={tickersText} onCommit={onTickersChange} />

      {/* 정렬 */}
      <div>
        <div className="mb-2 text-sm font-medium text-gray-700">
          정렬 <span className="text-xs text-gray-400">(Leaderboard 컬럼 헤더 클릭으로도 가능)</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={sortKey}
            onChange={e => onSortKeyChange(e.target.value as SortKey)}
            disabled={loading}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={onSortDirToggle}
            disabled={loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            title={sortDir === 'asc' ? '오름차순 → 내림차순' : '내림차순 → 오름차순'}
          >
            {sortDir === 'asc' ? '오름차순 ▲' : '내림차순 ▼'}
          </button>
        </div>
      </div>

      {/* 전략 다중 선택 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium text-gray-700">
            전략 선택{' '}
            <span className="text-xs text-gray-400">
              ({selectedStrategies.length} / {availableStrategies.length})
            </span>
          </div>
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={selectAll} className="text-blue-600 hover:underline">전체</button>
            <button type="button" onClick={clearAll} className="text-gray-500 hover:underline">해제</button>
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 p-2">
          {presets.length > 0 && (
            <>
              <div className="mb-1 text-xs font-semibold text-gray-500">프리셋</div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {presets.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStrategy(s.id)}
                    className={`rounded border px-2 py-0.5 text-xs ${
                      selectedStrategies.includes(s.id)
                        ? 'border-blue-500 bg-blue-100 text-blue-800'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {shared.length > 0 && (
            <>
              <div className="mb-1 text-xs font-semibold text-gray-500">공유 사용자 전략</div>
              <div className="flex flex-wrap gap-1.5">
                {shared.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStrategy(s.id)}
                    className={`rounded border px-2 py-0.5 text-xs ${
                      selectedStrategies.includes(s.id)
                        ? 'border-purple-500 bg-purple-100 text-purple-800'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 한글/영문/코드 토큰 1개를 ticker 코드로 변환.
 * 매칭 안 되면 raw token 을 그대로 반환 (사용자가 미등록 종목 코드 직접 입력한 경우).
 */
function resolveToken(token: string): { ticker: string; matched: { ticker: string; name: string } | null } {
  const t = token.trim()
  if (!t) return { ticker: '', matched: null }

  // 1) KR 6자리 숫자 코드 → 그대로
  if (/^\d{6}$/.test(t)) return { ticker: t, matched: null }
  // 2) 영문/숫자 조합으로만 1~5자 → US ticker 로 그대로 시도 + dict 매칭
  if (/^[A-Za-z][A-Za-z0-9.\-]{0,9}$/.test(t)) {
    const upper = t.toUpperCase()
    const us = searchUSTicker(upper, 1)
    if (us.length > 0 && us[0].ticker.toUpperCase() === upper) {
      return { ticker: us[0].ticker, matched: { ticker: us[0].ticker, name: us[0].name } }
    }
    // dict 매칭 없어도 사용자가 입력한 ticker 그대로 시도 (등록 안 된 미국 종목 가능성)
    return { ticker: upper, matched: null }
  }

  // 3) 한글 또는 한영 혼합 → KR 우선 검색, 없으면 US 검색
  const kr = searchKRTicker(t, 1)
  if (kr.length > 0) {
    return { ticker: kr[0].ticker, matched: { ticker: kr[0].ticker, name: kr[0].name } }
  }
  const us = searchUSTicker(t, 1)
  if (us.length > 0) {
    return { ticker: us[0].ticker, matched: { ticker: us[0].ticker, name: us[0].name } }
  }
  return { ticker: t, matched: null }
}

/**
 * 종목 필터 입력 — self-isolated.
 * 외부 loading state / re-render 로 인해 input 이 disabled 되거나 value 가 reset 되는
 * 문제를 차단하기 위해 local state 로 보관. 350ms 디바운스 후 부모(onCommit)에 전달.
 *
 * 한글/영문 종목명 입력 지원: '삼성전자', '애플' 같은 토큰을 ticker 코드로 자동 변환하여
 * 부모에 전달 (UI 에는 사용자가 친 raw 텍스트 유지 + 변환 결과 안내 표시).
 */
function TickersInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [local, setLocal] = useState(value)
  const lastExternalRef = useRef(value)

  useEffect(() => {
    if (value !== lastExternalRef.current) {
      lastExternalRef.current = value
      setLocal(value)
    }
  }, [value])

  // raw 토큰 → resolved ticker 배열 (입력 즉시 매칭 결과 보여줌)
  const resolved = useMemo(() => {
    const tokens = local.split(',').map(s => s.trim()).filter(Boolean)
    return tokens.map(t => ({ raw: t, ...resolveToken(t) }))
  }, [local])

  useEffect(() => {
    const id = setTimeout(() => {
      // 부모에는 변환된 ticker 코드만 전달
      const tickers = resolved.map(r => r.ticker).filter(Boolean).join(',')
      lastExternalRef.current = tickers
      onCommit(tickers)
    }, 350)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved])

  const hasUnresolved = resolved.some(r => !r.matched && !/^\d{6}$/.test(r.raw) && !/^[A-Z][A-Z0-9.\-]*$/.test(r.raw))

  return (
    <div>
      <div className="mb-2 text-sm font-medium text-gray-700">
        종목 필터{' '}
        <span className="text-xs text-gray-400">
          (콤마구분 · 비우면 전체 · 한글·영문·코드 모두 지원: 삼성전자, 애플, 005930, AAPL)
        </span>
      </div>
      <input
        type="text"
        value={local}
        onChange={e => setLocal(e.target.value)}
        placeholder="예: 삼성전자, 애플, 카카오, TSLA"
        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {resolved.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          <div className="text-xs text-blue-600">
            {resolved.length}개 종목 필터 적용 중 (Leaderboard·Grid 모두)
          </div>
          <div className="flex flex-wrap gap-1">
            {resolved.map((r, i) => (
              <span
                key={`${r.raw}-${i}`}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-mono ${
                  r.matched
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
                title={r.matched ? `${r.matched.name} (${r.matched.ticker})` : `${r.raw} (사전 미등록 — ticker 그대로 검색)`}
              >
                {r.matched ? (
                  <>
                    <span>{r.matched.name}</span>
                    <span className="text-blue-400">→</span>
                    <span>{r.ticker}</span>
                  </>
                ) : (
                  <span>{r.ticker}</span>
                )}
              </span>
            ))}
          </div>
          {hasUnresolved && (
            <div className="text-[11px] text-amber-700">
              일부 입력은 종목명 사전에서 매칭되지 않았습니다. 정확한 종목명 또는 ticker 코드를 입력해 보세요.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
