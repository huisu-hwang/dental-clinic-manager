'use client'
import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{ticker} <span className="text-sm text-gray-500">({market})</span></h2>
          {latest && (
            <p className="text-xs text-gray-500">
              마지막 분석: {new Date(latest.created_at).toLocaleString('ko-KR')}
            </p>
          )}
        </div>
        <button onClick={onAnalyze} disabled={running}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          지금 분석하기
        </button>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {!latest && (
        <div className="text-center text-gray-500 py-12 border rounded-xl bg-gray-50">
          분석 이력이 없습니다. &ldquo;지금 분석하기&rdquo;를 눌러주세요.
        </div>
      )}

      {latest && (
        <>
          <ScoreGauge score={latest.psychology_score} label={latest.score_label} />
          <div className="flex flex-wrap gap-2">
            {latest.tags.map((t, i) => (
              <span key={i} className="inline-block px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">{t}</span>
            ))}
          </div>
          <div className="rounded-xl border bg-white p-4 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
            {latest.narrative}
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
