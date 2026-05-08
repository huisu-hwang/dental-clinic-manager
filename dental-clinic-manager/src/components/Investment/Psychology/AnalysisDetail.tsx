'use client'
import { useState } from 'react'
import { Loader2, Sparkles, AlertCircle, Brain } from 'lucide-react'
import ScoreGauge from './ScoreGauge'
import PsychologyChart from './PsychologyChart'
import OrderbookPressureBar from './OrderbookPressureBar'
import type { PsychologyAnalysisRecord } from '@/types/psychology'
import type { Market } from '@/types/investment'

interface Props {
  ticker: string
  market: Market
  latest: PsychologyAnalysisRecord | null
  onAnalyzed: (record: PsychologyAnalysisRecord) => void
}

export default function AnalysisDetail({ ticker, market, latest, onAnalyzed }: Props) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onAnalyze = async () => {
    setRunning(true); setError(null)
    try {
      const res = await fetch('/api/investment/psychology/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, market, triggerKind: 'manual' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '분석 실패'); return }
      onAnalyzed(data)
    } finally { setRunning(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl shadow-sm border border-at-border p-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-at-text truncate">{ticker}</h2>
          {latest ? (
            <p className="text-xs text-at-text-secondary mt-0.5">
              마지막 분석: {new Date(latest.created_at).toLocaleString('ko-KR')}
            </p>
          ) : (
            <p className="text-xs text-at-text-weak mt-0.5">아직 분석 이력이 없습니다</p>
          )}
        </div>
        <button onClick={onAnalyze} disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex-shrink-0">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          지금 분석하기
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {!latest && (
        <div className="bg-white rounded-3xl shadow-sm border border-at-border p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-at-accent-light flex items-center justify-center mx-auto mb-3">
            <Brain className="w-7 h-7 text-at-accent" />
          </div>
          <p className="text-sm text-at-text-secondary">
            &ldquo;지금 분석하기&rdquo;를 눌러 첫 분석을 실행하세요.
          </p>
        </div>
      )}

      {latest && (
        <>
          <ScoreGauge score={latest.psychology_score} label={latest.score_label} />
          {latest.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {latest.tags.map((t, i) => (
                <span key={i} className="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="bg-white rounded-3xl shadow-sm border border-at-border p-5">
            <h3 className="text-sm font-semibold text-at-text mb-2">해석</h3>
            <p className="text-sm leading-relaxed text-at-text-secondary whitespace-pre-wrap">
              {latest.narrative}
            </p>
          </div>
          <PsychologyChart candles={latest.input_snapshot.candles} markers={latest.markers} />
          {market === 'KR' && latest.orderbook_pressure && (
            <OrderbookPressureBar data={latest.orderbook_pressure} />
          )}
        </>
      )}
    </div>
  )
}
