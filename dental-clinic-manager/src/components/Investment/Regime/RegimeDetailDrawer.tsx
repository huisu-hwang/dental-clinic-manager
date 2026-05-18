'use client'

import { useEffect, useState } from 'react'
import {
  REGIME_LABEL, REGIME_LABEL_KO, REGIME_EMOJI, REGIME_COLOR,
  RegimeRun, RegimeState,
} from './types'
import RegimeTimelineChart from './RegimeTimelineChart'
import RegimeTransitionTable from './RegimeTransitionTable'
import RegimeModelVotes from './RegimeModelVotes'
import RegimeBestStrategies from './RegimeBestStrategies'
import RegimeSignals from './RegimeSignals'

const KR_MARKETS = new Set(['KOSPI', 'KOSDAQ'])

function scopeIdToMarket(scope: 'market' | 'sector' | 'ticker', scopeId: string): 'KR' | 'US' | null {
  if (scope !== 'market') return null
  return KR_MARKETS.has(scopeId) ? 'KR' : 'US'
}

interface Props {
  scope: 'market' | 'sector' | 'ticker'
  scopeId: string
  scopeLabel: string
  run: RegimeRun
  onClose: () => void
}

interface HistoryRow {
  date: string
  state: RegimeState
  confidence: number
}

export default function RegimeDetailDrawer({ scope, scopeId, scopeLabel, run, onClose }: Props) {
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [days, setDays] = useState<number>(180)

  useEffect(() => {
    let alive = true
    setHistoryLoading(true)
    setHistoryError(null)
    fetch(`/api/investment/regime/history?scope=${scope}&id=${scopeId}&days=${days}`)
      .then(async r => {
        const j = await r.json()
        if (!alive) return
        if (!r.ok) {
          setHistoryError(j.error ?? '히스토리 조회 실패')
          setHistory([])
        } else {
          setHistory(j.data ?? [])
        }
      })
      .catch(e => {
        if (alive) setHistoryError(String(e))
      })
      .finally(() => {
        if (alive) setHistoryLoading(false)
      })
    return () => { alive = false }
  }, [scope, scopeId, days])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const state = run.current_state
  const stateProbs = run.state_probabilities ?? {}
  const ensembleProbs: Record<string, number> = {
    bull: stateProbs.bull ?? 0,
    sideways: stateProbs.sideways ?? 0,
    bear: stateProbs.bear ?? 0,
    crisis: stateProbs.crisis ?? 0,
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="닫기 배경" />
      <aside className="relative ml-auto h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl">
        <header className="sticky top-0 z-10 border-b bg-white px-5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs text-gray-500">{scope.toUpperCase()} · {scopeId}</div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">{scopeLabel}</h2>
                <span className="text-2xl">{REGIME_EMOJI[state]}</span>
                <span className="text-base font-semibold" style={{ color: REGIME_COLOR[state] }}>
                  {REGIME_LABEL[state]} ({REGIME_LABEL_KO[state]})
                </span>
                <span className="text-xs text-gray-500">신뢰도 {(run.current_confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="mt-0.5 text-[11px] text-gray-400">
                기준일 {run.data_as_of} · 추론일 {run.as_of_date}
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="space-y-5 p-5">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">국면 타임라인</h3>
              <div className="flex gap-1 text-[11px]">
                {[90, 180, 365].map(d => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={`rounded px-2 py-0.5 ${days === d ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            {historyLoading ? (
              <div className="py-8 text-center text-sm text-gray-400">로딩 중...</div>
            ) : historyError ? (
              <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">{historyError}</div>
            ) : (
              <RegimeTimelineChart history={history} />
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-800">현재 국면 판단 근거</h3>
            <RegimeSignals signals={run.signals} currentState={state} />
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-800">N일 후 국면 전환 예측</h3>
            <RegimeTransitionTable
              transitions={run.transition_probabilities ?? {}}
              reservoirPredictions={run.reservoir_predictions}
              currentState={state}
            />
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-800">모델 투표</h3>
            <RegimeModelVotes
              votes={run.model_votes ?? {}}
              ensemble={{ state, confidence: run.current_confidence, probs: ensembleProbs }}
            />
          </section>

          {(() => {
            const market = scopeIdToMarket(scope, scopeId)
            if (!market) return null
            return (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-800">
                  이 국면에서 잘 작동한 전략 Top 10
                </h3>
                <RegimeBestStrategies market={market} state={state} />
              </section>
            )
          })()}
        </div>
      </aside>
    </div>
  )
}
