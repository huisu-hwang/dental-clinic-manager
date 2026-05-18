'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PRESET_STRATEGIES } from '@/components/Investment/StrategyBuilder/presets'
import { REGIME_EMOJI, REGIME_LABEL, RegimeState } from './types'

type Market = 'KR' | 'US'
type Window = '1Y' | '3Y' | '5Y' | '10Y'

interface Row {
  entry_id: string
  sample_size: number
  avg_return: number
  avg_sharpe: number
  avg_mdd: number
  avg_winrate: number
}

interface Props {
  market: Market
  state: RegimeState
}

function fmtPct(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function fmtNum(v: number | null | undefined, digits = 2) {
  if (v == null || !isFinite(v)) return '—'
  return v.toFixed(digits)
}

export default function RegimeBestStrategies({ market, state }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [totalSamples, setTotalSamples] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [windowSel, setWindowSel] = useState<Window>('3Y')

  const presetNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of PRESET_STRATEGIES) m.set(p.id, p.name)
    return m
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    fetch(`/api/investment/regime/best-strategies?market=${market}&state=${state}&window=${windowSel}&limit=10`)
      .then(async r => {
        const j = await r.json()
        if (!alive) return
        if (!r.ok) {
          setError(j.error ?? '조회 실패')
          setRows([])
        } else {
          setRows(j.data ?? [])
          setTotalSamples(j.total_samples ?? 0)
        }
      })
      .catch(e => { if (alive) setError(String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [market, state, windowSel])

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] text-gray-500">
          {REGIME_EMOJI[state]} {REGIME_LABEL[state]} 국면 ({market}) · 기간 {windowSel} · 표본 {totalSamples.toLocaleString()}건
        </div>
        <div className="flex gap-1 text-[11px]">
          {(['1Y', '3Y', '5Y', '10Y'] as Window[]).map(w => (
            <button
              key={w}
              onClick={() => setWindowSel(w)}
              className={`rounded px-2 py-0.5 ${windowSel === w ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-gray-400">로딩 중...</div>
      ) : error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">
          이 조건의 백테스트 데이터가 부족합니다
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="px-2 py-1 text-left font-medium">전략</th>
                <th className="px-2 py-1 text-right font-medium">평균 수익</th>
                <th className="px-2 py-1 text-right font-medium">Sharpe</th>
                <th className="px-2 py-1 text-right font-medium">MDD</th>
                <th className="px-2 py-1 text-right font-medium">승률</th>
                <th className="px-2 py-1 text-right font-medium">표본</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const name = presetNameMap.get(r.entry_id) ?? r.entry_id
                return (
                  <tr key={r.entry_id} className="border-t hover:bg-gray-50">
                    <td className="px-2 py-1.5 font-medium text-gray-800">
                      <span className="mr-1 text-gray-400">#{i + 1}</span>
                      {name}
                    </td>
                    <td className={`px-2 py-1.5 text-right font-semibold ${r.avg_return >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {fmtPct(r.avg_return)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-700">{fmtNum(r.avg_sharpe)}</td>
                    <td className="px-2 py-1.5 text-right text-gray-700">{fmtPct(r.avg_mdd)}</td>
                    <td className="px-2 py-1.5 text-right text-gray-700">{fmtPct(r.avg_winrate)}</td>
                    <td className="px-2 py-1.5 text-right text-gray-400">{r.sample_size}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-gray-500">
            <Link href="/investment/compare/matrix" className="text-indigo-600 hover:underline">전체 매트릭스 보기 →</Link>
          </p>
        </div>
      )}
    </div>
  )
}
