'use client'

import { REGIME_COLOR, REGIME_EMOJI, REGIME_LABEL, REGIME_LABEL_KO, RegimeState } from './types'

const STATES: RegimeState[] = ['bull', 'sideways', 'bear', 'crisis']

interface Vote {
  state: RegimeState
  confidence: number
  probs?: Record<string, number>
}

interface Props {
  votes: Record<string, Vote>
  ensemble: { state: RegimeState; confidence: number; probs: Record<string, number> }
}

function MODEL_LABEL(key: string) {
  const map: Record<string, string> = {
    hmm: 'HMM',
    xgboost: 'XGBoost',
    randomforest: 'RandomForest',
    bagging: 'Bagging',
    kernel_markov: 'Kernel Markov',
    reservoir: 'Reservoir',
  }
  return map[key] ?? key
}

function ProbBar({ probs }: { probs: Record<string, number> }) {
  const ordered = STATES.map(s => ({ s, v: probs[s] ?? 0 }))
  const total = ordered.reduce((a, b) => a + b.v, 0) || 1
  return (
    <div className="flex h-3 w-full overflow-hidden rounded bg-gray-100">
      {ordered.map(({ s, v }) => (
        <div
          key={s}
          title={`${REGIME_LABEL[s]} ${(v * 100).toFixed(0)}%`}
          style={{
            width: `${(v / total) * 100}%`,
            background: REGIME_COLOR[s],
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  )
}

export default function RegimeModelVotes({ votes, ensemble }: Props) {
  const modelEntries = Object.entries(votes)

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-indigo-700">앙상블 (소프트 보팅)</div>
          <div className="flex items-center gap-1.5">
            <span>{REGIME_EMOJI[ensemble.state]}</span>
            <span className="text-sm font-semibold" style={{ color: REGIME_COLOR[ensemble.state] }}>
              {REGIME_LABEL[ensemble.state]} ({REGIME_LABEL_KO[ensemble.state]})
            </span>
            <span className="text-xs text-gray-500">{(ensemble.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div className="mt-2"><ProbBar probs={ensemble.probs} /></div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium text-gray-700">모델별 투표</div>
        {modelEntries.length === 0 ? (
          <div className="rounded border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400">
            모델 투표 정보 없음
          </div>
        ) : (
          <ul className="space-y-2">
            {modelEntries.map(([key, v]) => (
              <li key={key} className="rounded border border-gray-200 p-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">{MODEL_LABEL(key)}</span>
                  <span className="flex items-center gap-1">
                    <span>{REGIME_EMOJI[v.state]}</span>
                    <span style={{ color: REGIME_COLOR[v.state] }} className="font-semibold">
                      {REGIME_LABEL[v.state]}
                    </span>
                    <span className="text-gray-500">{(v.confidence * 100).toFixed(0)}%</span>
                  </span>
                </div>
                {v.probs && (
                  <div className="mt-1.5"><ProbBar probs={v.probs} /></div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
