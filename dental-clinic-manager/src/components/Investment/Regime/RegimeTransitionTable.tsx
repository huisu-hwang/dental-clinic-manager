'use client'

import { REGIME_COLOR, REGIME_EMOJI, REGIME_LABEL, REGIME_LABEL_KO, RegimeState } from './types'

const STATES: RegimeState[] = ['bull', 'sideways', 'bear', 'crisis']
const HORIZONS = ['5d', '10d', '30d'] as const

type TransitionMap = {
  '5d'?: Record<string, number>
  '10d'?: Record<string, number>
  '30d'?: Record<string, number>
}

interface Props {
  transitions: TransitionMap
  reservoirPredictions?: TransitionMap | null
  currentState: RegimeState
}

function pct(v: number | undefined) {
  if (v == null || !isFinite(v)) return '—'
  return `${(v * 100).toFixed(0)}%`
}

function cellBg(v: number | undefined, color: string) {
  if (v == null || !isFinite(v)) return 'transparent'
  const alpha = Math.min(0.6, Math.max(0.05, v))
  return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
}

function MatrixTable({
  title,
  description,
  rows,
  currentState,
  cellColor,
}: {
  title: string
  description: string
  rows: TransitionMap
  currentState: RegimeState
  cellColor: string
}) {
  return (
    <div className="rounded-md border p-2">
      <div className="mb-1 text-xs font-semibold text-gray-800">{title}</div>
      <div className="mb-2 text-[10px] text-gray-500">{description}</div>
      <table className="min-w-full text-xs">
        <thead>
          <tr className="text-gray-500">
            <th className="px-2 py-1 text-left font-medium">기간</th>
            {STATES.map(s => (
              <th key={s} className="px-2 py-1 text-center font-medium">
                <span className="inline-flex items-center gap-0.5">
                  <span>{REGIME_EMOJI[s]}</span>
                  <span style={{ color: REGIME_COLOR[s] }}>{REGIME_LABEL[s]}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HORIZONS.map(h => {
            const row = (rows[h] ?? {}) as Record<string, number>
            return (
              <tr key={h} className="border-t">
                <td className="px-2 py-1 text-gray-700 font-medium">{h}</td>
                {STATES.map(s => {
                  const v = row[s]
                  const isCurrent = s === currentState
                  return (
                    <td
                      key={s}
                      className={`px-2 py-1 text-center ${isCurrent ? 'font-semibold' : ''}`}
                      style={{ background: cellBg(v, cellColor) }}
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
    </div>
  )
}

export default function RegimeTransitionTable({ transitions, reservoirPredictions, currentState }: Props) {
  const hasReservoir = reservoirPredictions && Object.keys(reservoirPredictions).length > 0
  const hasHmm = transitions && Object.keys(transitions).length > 0

  return (
    <div className="space-y-2">
      {hasHmm && (
        <MatrixTable
          title="① HMM Transition Matrix (P^n)"
          description={`현재 상태(${REGIME_LABEL[currentState]})에서 N일 후 도달 확률 — 통계적 마르코프 전이`}
          rows={transitions}
          currentState={currentState}
          cellColor="rgb(99, 102, 241)"
        />
      )}
      {hasReservoir && (
        <MatrixTable
          title="② Reservoir Hypernet N-step 예측 (Sun 2025)"
          description="시계열 동학 기반 N일 후 라벨 분포 — auto-regressive next-step"
          rows={reservoirPredictions!}
          currentState={currentState}
          cellColor="rgb(16, 185, 129)"
        />
      )}
      {!hasHmm && !hasReservoir && (
        <div className="rounded border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400">
          전환 예측 데이터 없음
        </div>
      )}
      {(hasHmm || hasReservoir) && (
        <p className="text-[10px] text-gray-500">
          💡 HMM은 통계적 전이행렬 거듭제곱(P^n)으로 안정적, Reservoir는 시계열 동학을 직접 모델링하여 단기 예측에 강점.
          두 결과가 일치할수록 신뢰도 높음.
        </p>
      )}
    </div>
  )
}
