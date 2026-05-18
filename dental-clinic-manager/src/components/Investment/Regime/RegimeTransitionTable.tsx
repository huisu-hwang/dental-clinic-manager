'use client'

import { REGIME_COLOR, REGIME_EMOJI, REGIME_LABEL, REGIME_LABEL_KO, RegimeState } from './types'

const STATES: RegimeState[] = ['bull', 'sideways', 'bear', 'crisis']
const HORIZONS = ['5d', '10d', '30d'] as const

interface Props {
  transitions: {
    '5d'?: Record<string, number>
    '10d'?: Record<string, number>
    '30d'?: Record<string, number>
  }
  currentState: RegimeState
}

function pct(v: number | undefined) {
  if (v == null || !isFinite(v)) return '—'
  return `${(v * 100).toFixed(0)}%`
}

function cellBg(v: number | undefined) {
  if (v == null || !isFinite(v)) return 'transparent'
  const alpha = Math.min(0.6, Math.max(0.05, v))
  return `rgba(99, 102, 241, ${alpha})`
}

export default function RegimeTransitionTable({ transitions, currentState }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="text-gray-500">
            <th className="px-2 py-1 text-left font-medium">기간</th>
            {STATES.map(s => (
              <th key={s} className="px-2 py-1 text-center font-medium">
                <span className="inline-flex items-center gap-1">
                  <span>{REGIME_EMOJI[s]}</span>
                  <span style={{ color: REGIME_COLOR[s] }}>{REGIME_LABEL[s]}</span>
                </span>
                <div className="text-[10px] text-gray-400">({REGIME_LABEL_KO[s]})</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HORIZONS.map(h => {
            const row = (transitions[h] ?? {}) as Record<string, number>
            return (
              <tr key={h} className="border-t">
                <td className="px-2 py-1.5 text-gray-700 font-medium">{h}</td>
                {STATES.map(s => {
                  const v = row[s]
                  const isCurrent = s === currentState
                  return (
                    <td
                      key={s}
                      className={`px-2 py-1.5 text-center ${isCurrent ? 'font-semibold' : ''}`}
                      style={{ background: cellBg(v) }}
                    >
                      {pct(v)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-gray-500">
        HMM 전이행렬 P^n 기반 — 현재 상태({REGIME_LABEL[currentState]})에서 n일 후 도달 확률
      </p>
    </div>
  )
}
