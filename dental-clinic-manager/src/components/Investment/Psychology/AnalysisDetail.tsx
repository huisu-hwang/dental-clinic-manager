'use client'
import { useState } from 'react'
import { Loader2, Sparkles, AlertCircle, Brain, Clock, History } from 'lucide-react'
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

type Mode = 'now' | 'past'

/** datetime-local 입력값 (YYYY-MM-DDTHH:mm) → ISO string. 로컬 시간으로 해석. */
function localInputToIso(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Date → datetime-local 입력값 형식 */
function dateToLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AnalysisDetail({ ticker, market, latest, onAnalyzed }: Props) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('now')
  // 기본값: 어제 같은 시간
  const [asOfLocal, setAsOfLocal] = useState<string>(() => {
    const d = new Date(Date.now() - 24 * 3600 * 1000)
    return dateToLocalInput(d)
  })

  const minLocal = (() => {
    // 7일 전 (yahoo / KIS 한도)
    return dateToLocalInput(new Date(Date.now() - 7 * 24 * 3600 * 1000))
  })()
  const maxLocal = dateToLocalInput(new Date())

  const onAnalyze = async () => {
    setRunning(true); setError(null)
    try {
      const body: Record<string, unknown> = {
        ticker,
        market,
        triggerKind: 'manual',
      }
      if (mode === 'past') {
        const iso = localInputToIso(asOfLocal)
        if (!iso) { setError('분석 시점이 올바르지 않습니다'); return }
        body.asOf = iso
      }
      const res = await fetch('/api/investment/psychology/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '분석 실패'); return }
      onAnalyzed(data)
    } finally { setRunning(false) }
  }

  // latest record에서 분석 시점 추출
  const latestAsOf = (() => {
    const snap = latest?.input_snapshot as { as_of?: string } | undefined
    return snap?.as_of ?? null
  })()

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl shadow-sm border border-at-border p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-at-text truncate">{ticker}</h2>
            {latest ? (
              <p className="text-xs text-at-text-secondary mt-0.5">
                마지막 분석: {new Date(latest.created_at).toLocaleString('ko-KR')}
                {latestAsOf && (
                  <span className="ml-2 inline-flex items-center gap-1 text-at-accent">
                    <History className="w-3 h-3" />
                    분석 시점 {new Date(latestAsOf).toLocaleString('ko-KR')}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-xs text-at-text-weak mt-0.5">아직 분석 이력이 없습니다</p>
            )}
          </div>
          <button onClick={onAnalyze} disabled={running}
            className="inline-flex items-center gap-2 px-4 py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex-shrink-0">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            분석 실행
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-3 border-t border-at-border">
          <div className="inline-flex rounded-xl bg-at-surface-alt p-0.5 self-start">
            {(['now', 'past'] as const).map(m => {
              const active = mode === m
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1 ${
                    active
                      ? 'bg-white text-at-accent shadow-sm'
                      : 'text-at-text-secondary hover:text-at-text'
                  }`}
                >
                  {m === 'now' ? <Clock className="w-3.5 h-3.5" /> : <History className="w-3.5 h-3.5" />}
                  {m === 'now' ? '현재' : '과거 시점'}
                </button>
              )
            })}
          </div>
          {mode === 'past' && (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="datetime-local"
                value={asOfLocal}
                onChange={e => setAsOfLocal(e.target.value)}
                min={minLocal}
                max={maxLocal}
                className="flex-1 sm:flex-none border border-at-border rounded-xl px-3 py-1.5 text-sm text-at-text bg-white focus:outline-none focus:ring-2 focus:ring-at-accent focus:border-transparent"
              />
              <span className="text-[11px] text-at-text-weak">기준 직전 60분 분석 (최근 7일 이내)</span>
            </div>
          )}
        </div>
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
            현재 또는 과거 시점을 선택하고 &ldquo;분석 실행&rdquo;을 눌러주세요.
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
