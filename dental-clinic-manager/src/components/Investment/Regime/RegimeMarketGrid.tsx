'use client'

import { useEffect, useState } from 'react'
import {
  REGIME_LABEL, REGIME_LABEL_KO, REGIME_EMOJI, REGIME_COLOR,
  RegimeRun, RegimeState,
} from './types'
import RegimeDetailDrawer from './RegimeDetailDrawer'

const MARKETS = [
  { id: 'KOSPI', label: 'KOSPI', region: 'KR' },
  { id: 'KOSDAQ', label: 'KOSDAQ', region: 'KR' },
  { id: 'SP500', label: 'S&P 500', region: 'US' },
  { id: 'NASDAQ', label: 'NASDAQ', region: 'US' },
  { id: 'DOW', label: 'DOW', region: 'US' },
  { id: 'RUSSELL2000', label: 'Russell 2000', region: 'US' },
] as const

interface RunsState {
  data: Record<string, RegimeRun | null>
  loading: boolean
  error: string | null
}

export default function RegimeMarketGrid() {
  const [{ data: runs, loading, error }, setState] = useState<RunsState>({
    data: {},
    loading: true,
    error: null,
  })
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all(MARKETS.map(async m => {
      try {
        const r = await fetch(`/api/investment/regime/current?scope=market&id=${m.id}`)
        if (!r.ok) return [m.id, null] as const
        const j = await r.json()
        return [m.id, j.data as RegimeRun] as const
      } catch {
        return [m.id, null] as const
      }
    })).then(pairs => {
      if (!alive) return
      setState({
        data: Object.fromEntries(pairs),
        loading: false,
        error: null,
      })
    }).catch(e => {
      if (!alive) return
      setState({ data: {}, loading: false, error: String(e) })
    })
    return () => { alive = false }
  }, [])

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-500">로딩 중...</div>
  }
  if (error) {
    return <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">오류: {error}</div>
  }

  const selectedRun = selected ? runs[selected.id] : null

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {MARKETS.map(m => {
          const r = runs[m.id]
          if (!r) {
            return (
              <div key={m.id} className="rounded-md border bg-gray-50 p-3">
                <div className="text-sm text-gray-700 font-medium">{m.label}</div>
                <div className="mt-2 text-xs text-gray-400">학습 대기</div>
              </div>
            )
          }
          const state = r.current_state
          const trans5d = (r.transition_probabilities?.['5d'] ?? {}) as Partial<Record<RegimeState, number>>
          const transOther = Math.round((1 - (trans5d[state] ?? 0)) * 100)
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelected({ id: m.id, label: m.label })}
              className="rounded-md border bg-white p-3 text-left transition hover:shadow focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700 font-medium">{m.label}</div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{m.region}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span>{REGIME_EMOJI[state as RegimeState]}</span>
                <span className="text-lg font-semibold" style={{ color: REGIME_COLOR[state as RegimeState] }}>
                  {REGIME_LABEL[state as RegimeState]}
                </span>
                <span className="text-xs text-gray-500">({REGIME_LABEL_KO[state as RegimeState]})</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">확신도 {(r.current_confidence * 100).toFixed(0)}%</div>
              <div className="mt-2 h-1.5 w-full bg-gray-200 rounded overflow-hidden">
                <div className="h-full" style={{
                  width: `${r.current_confidence * 100}%`,
                  background: REGIME_COLOR[state as RegimeState],
                }} />
              </div>
              <div className="mt-2 text-xs text-gray-500 flex justify-between">
                <span>5d 전환 확률</span>
                <span className="font-medium">{transOther}%</span>
              </div>
              <div className="mt-1 text-[10px] text-gray-400">기준: {r.data_as_of} · 클릭하여 상세 보기</div>
            </button>
          )
        })}
      </div>
      {selected && selectedRun && (
        <RegimeDetailDrawer
          scope="market"
          scopeId={selected.id}
          scopeLabel={selected.label}
          run={selectedRun}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
