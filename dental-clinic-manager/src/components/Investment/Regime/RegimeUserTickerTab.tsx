'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  REGIME_LABEL, REGIME_LABEL_KO, REGIME_EMOJI, REGIME_COLOR,
  RegimeRun, RegimeState,
} from './types'
import RegimeDetailDrawer from './RegimeDetailDrawer'

interface SearchSuggestion {
  ticker: string
  name: string
  market: 'KR' | 'US'
}

interface JobRow {
  job_id: number
  ticker: string
  status: 'queued' | 'running' | 'done' | 'failed'
  requested_at: string
  finished_at: string | null
  error: string | null
  result: {
    state: RegimeState
    confidence: number
    as_of_date: string
  } | null
}

const STATUS_LABEL: Record<JobRow['status'], string> = {
  queued: '대기 중',
  running: '학습 중',
  done: '완료',
  failed: '실패',
}

const STATUS_COLOR: Record<JobRow['status'], string> = {
  queued: 'bg-gray-100 text-gray-600',
  running: 'bg-blue-50 text-blue-700',
  done: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
}

function relTime(iso: string) {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  if (diff < 60_000) return '방금 전'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`
  return new Date(iso).toLocaleDateString('ko-KR')
}

export default function RegimeUserTickerTab() {
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ticker, setTicker] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<RegimeRun | null>(null)
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestionAbortRef = useRef<AbortController | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const r = await fetch('/api/investment/regime/jobs?limit=30')
      const j = await r.json()
      if (!r.ok) {
        setError(j.error ?? '조회 실패')
        return
      }
      setJobs(j.data ?? [])
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
    // 진행 중 job 이 있으면 5초마다 폴링
    const id = setInterval(() => {
      setJobs(prev => {
        const hasRunning = prev.some(j => j.status === 'queued' || j.status === 'running')
        if (hasRunning) fetchJobs()
        return prev
      })
    }, 5000)
    return () => clearInterval(id)
  }, [fetchJobs])

  // 입력 변경 시 자동완성 검색 (debounce 200ms, 한글/영문 모두)
  useEffect(() => {
    const q = ticker.trim()
    if (q.length < 1) {
      setSuggestions([])
      return
    }
    const handle = setTimeout(() => {
      suggestionAbortRef.current?.abort()
      const ctrl = new AbortController()
      suggestionAbortRef.current = ctrl
      fetch(`/api/investment/regime/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then(r => r.json())
        .then(j => {
          if (!ctrl.signal.aborted) setSuggestions(j.data ?? [])
        })
        .catch(() => {})
    }, 200)
    return () => clearTimeout(handle)
  }, [ticker])

  const submitWith = async (rawInput: string) => {
    const t = rawInput.trim()
    if (!t) return
    setSubmitting(true)
    setMessage(null)
    setShowSuggestions(false)
    try {
      const r = await fetch('/api/investment/regime/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: t }),
      })
      const j = await r.json()
      if (!r.ok) {
        setMessage(`❌ ${j.error ?? '요청 실패'}`)
      } else {
        const display = j.data?.resolved_name
          ? `${j.data.ticker} (${j.data.resolved_name})`
          : j.data?.ticker ?? t
        if (j.data?.already_running) {
          setMessage(`⏳ ${display} 분석이 이미 진행 중입니다`)
        } else {
          setMessage(`✅ ${display} 분석 큐에 추가됨 (Mac mini 워커가 처리)`)
          setTicker('')
          setSuggestions([])
          fetchJobs()
        }
      }
    } catch (err) {
      setMessage(`❌ ${String(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    submitWith(ticker)
  }

  const openDetail = async (t: string) => {
    setSelectedTicker(t)
    setSelectedRun(null)
    try {
      const r = await fetch(`/api/investment/regime/current?scope=ticker&id=${encodeURIComponent(t)}`)
      const j = await r.json()
      if (r.ok && j.data) setSelectedRun(j.data as RegimeRun)
    } catch {}
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="rounded-md border bg-white p-3">
        <div className="text-sm font-medium text-gray-800">종목 분석 요청</div>
        <div className="mt-1 text-xs text-gray-500">
          종목 코드(예: 005930, AAPL) 또는 이름(예: 삼성전자, 애플, Apple) 입력. Mac mini 워커가 학습(약 30~60초)
        </div>
        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <input
              value={ticker}
              onChange={e => { setTicker(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="005930 / AAPL / 삼성전자 / 애플"
              maxLength={30}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
              disabled={submitting}
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                {suggestions.map(s => (
                  <li key={`${s.market}-${s.ticker}`}>
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); submitWith(s.ticker) }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-indigo-50"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">{s.ticker}</span>
                        <span className="text-gray-800">{s.name}</span>
                      </span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{s.market}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="submit"
            disabled={submitting || !ticker.trim()}
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? '요청 중...' : '분석 요청'}
          </button>
        </div>
        {message && (
          <div className="mt-2 text-xs text-gray-700">{message}</div>
        )}
      </form>

      <div className="rounded-md border bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium text-gray-800">내 분석 목록</div>
          <button
            onClick={fetchJobs}
            className="rounded px-2 py-0.5 text-[11px] text-gray-500 hover:bg-gray-100"
          >
            새로고침
          </button>
        </div>
        {loading ? (
          <div className="py-6 text-center text-sm text-gray-400">로딩 중...</div>
        ) : error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
        ) : jobs.length === 0 ? (
          <div className="rounded border border-dashed border-gray-200 py-8 text-center text-xs text-gray-400">
            아직 분석한 종목이 없습니다
          </div>
        ) : (
          <ul className="divide-y">
            {jobs.map(j => (
              <li key={j.job_id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-gray-800">{j.ticker}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_COLOR[j.status]}`}>
                      {STATUS_LABEL[j.status]}
                    </span>
                    {j.result && (
                      <span className="flex items-center gap-1 text-xs">
                        <span>{REGIME_EMOJI[j.result.state]}</span>
                        <span style={{ color: REGIME_COLOR[j.result.state] }} className="font-semibold">
                          {REGIME_LABEL[j.result.state]} ({REGIME_LABEL_KO[j.result.state]})
                        </span>
                        <span className="text-gray-500">{(j.result.confidence * 100).toFixed(0)}%</span>
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-400">
                    요청 {relTime(j.requested_at)}
                    {j.finished_at && ` · 완료 ${relTime(j.finished_at)}`}
                    {j.error && <span className="text-red-500"> · {j.error}</span>}
                  </div>
                </div>
                {j.result && (
                  <button
                    onClick={() => openDetail(j.ticker)}
                    className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                  >
                    상세 보기
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-gray-400">
          ⓘ 학습은 Mac mini 워커에서 처리됩니다. 워커가 꺼져 있으면 큐가 대기 상태로 남습니다.
        </p>
      </div>

      {selectedTicker && selectedRun && (
        <RegimeDetailDrawer
          scope="ticker"
          scopeId={selectedTicker}
          scopeLabel={selectedTicker}
          run={selectedRun}
          onClose={() => { setSelectedTicker(null); setSelectedRun(null) }}
        />
      )}
    </div>
  )
}
