'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  REGIME_LABEL, REGIME_LABEL_KO, REGIME_EMOJI, REGIME_COLOR,
  RegimeRun, RegimeState,
} from './types'
import RegimeDetailDrawer from './RegimeDetailDrawer'

// scope_id (US_TECH, KR_SEMI 등) → label / region 라벨링
const SECTOR_LABEL: Record<string, string> = {
  US_TECH: 'Technology',
  US_FIN: 'Financials',
  US_HEALTH: 'Health Care',
  US_ENERGY: 'Energy',
  US_INDUS: 'Industrials',
  US_CONS_DISC: 'Consumer Discretionary',
  US_CONS_STAPLE: 'Consumer Staples',
  US_UTIL: 'Utilities',
  US_MATERIAL: 'Materials',
  US_REIT: 'Real Estate',
  US_COMM: 'Communication Services',
  KR_SEMI: '반도체',
  KR_BANK: '은행',
  KR_AUTO: '자동차',
  KR_BIO: '바이오',
  KR_SECURITIES: '증권',
  KR_BUILD: '건설',
  KR_STEEL: '철강',
  KR_ENERGY_CHEM: '에너지화학',
  KR_IT: 'IT',
  KR_CONS: '필수소비재',
  KR_TRANSPORT: '운송',
}

type Region = 'ALL' | 'US' | 'KR'

interface SectorRow {
  scope_id: string
  current_state: RegimeState
  current_confidence: number
  state_probabilities: Record<string, number> | null
  transition_probabilities: Record<string, Record<string, number>> | null
  data_as_of: string
  as_of_date: string
}

export default function RegimeSectorGrid() {
  const [region, setRegion] = useState<Region>('ALL')
  const [rows, setRows] = useState<SectorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = region === 'ALL' ? '' : `?region=${region}`
    fetch(`/api/investment/regime/sectors${params}`)
      .then(async r => {
        const j = await r.json()
        if (!alive) return
        if (!r.ok) {
          setError(j.error ?? '조회 실패')
          setRows([])
        } else {
          setRows((j.data ?? []) as SectorRow[])
          setError(null)
        }
      })
      .catch(e => { if (alive) setError(String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [region])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => a.scope_id.localeCompare(b.scope_id))
  }, [rows])

  const selectedRun = selected
    ? (rows.find(r => r.scope_id === selected.id) as RegimeRun | undefined) ?? null
    : null

  return (
    <div className="space-y-3">
      <div className="flex gap-1 text-xs">
        {(['ALL', 'US', 'KR'] as Region[]).map(r => (
          <button
            key={r}
            onClick={() => setRegion(r)}
            className={`rounded px-2.5 py-1 ${region === r ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {r === 'ALL' ? '전체' : r}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-500">로딩 중...</div>
      ) : error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">오류: {error}</div>
      ) : sorted.length === 0 ? (
        <div className="rounded border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          섹터 학습 대기 — Mac mini 워커가 처리 중 (KST 20:30 일배치)
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {sorted.map(r => {
            const state = r.current_state as RegimeState
            const label = SECTOR_LABEL[r.scope_id] ?? r.scope_id
            const isUS = r.scope_id.startsWith('US_')
            const trans5d = (r.transition_probabilities?.['5d'] ?? {}) as Partial<Record<RegimeState, number>>
            const transOther = Math.round((1 - (trans5d[state] ?? 0)) * 100)
            return (
              <button
                key={r.scope_id}
                type="button"
                onClick={() => setSelected({ id: r.scope_id, label })}
                className="rounded-md border bg-white p-3 text-left transition hover:shadow focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700 font-medium truncate">{label}</div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{isUS ? 'US' : 'KR'}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span>{REGIME_EMOJI[state]}</span>
                  <span className="text-base font-semibold" style={{ color: REGIME_COLOR[state] }}>
                    {REGIME_LABEL[state]}
                  </span>
                  <span className="text-xs text-gray-500">({REGIME_LABEL_KO[state]})</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">확신도 {(r.current_confidence * 100).toFixed(0)}%</div>
                <div className="mt-2 h-1.5 w-full bg-gray-200 rounded overflow-hidden">
                  <div className="h-full" style={{
                    width: `${r.current_confidence * 100}%`,
                    background: REGIME_COLOR[state],
                  }} />
                </div>
                <div className="mt-2 text-xs text-gray-500 flex justify-between">
                  <span>5d 전환</span>
                  <span className="font-medium">{transOther}%</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selected && selectedRun && (
        <RegimeDetailDrawer
          scope="sector"
          scopeId={selected.id}
          scopeLabel={selected.label}
          run={selectedRun}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
