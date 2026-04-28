'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { SeoKeywordMiningResult } from '@/types/marketing'

export type SeoPreviewStatus = 'idle' | 'completed' | 'pending' | 'running' | 'failed'

interface PreviewApiResponse {
  status: 'completed' | 'pending' | 'running' | 'failed'
  progress: number
  step: string
  data?: SeoKeywordMiningResult
  error?: string
  jobId?: string
}

interface SeoPreviewState {
  status: SeoPreviewStatus
  progress: number
  step: string
  error: string
  result: SeoKeywordMiningResult | null
  appliedKeyword: string
}

interface SeoPreviewContextType extends SeoPreviewState {
  /** "분석 실행" — POST 큐잉 + 폴링 시작 */
  start: (keyword: string) => Promise<void>
  /** 폴링/상태 초기화 */
  reset: () => void
  /** 분석 진행 중인지 (UI에서 입력 비활성화 등에 사용) */
  isBusy: boolean
}

const SeoPreviewContext = createContext<SeoPreviewContextType | null>(null)

const POLL_INTERVAL_MS = 3000
const POLL_MAX_DURATION_MS = 5 * 60 * 1000

const STORAGE_KEY = 'seo-preview-state-v1'

interface PersistedState {
  status: SeoPreviewStatus
  progress: number
  step: string
  error: string
  result: SeoKeywordMiningResult | null
  appliedKeyword: string
  /** 폴링 만료 시각 (Date.now() 기반) */
  pollDeadline: number
}

/** 모든 활성 상태(idle 제외)를 sessionStorage에 저장하여 페이지 reload 후 폴링 재개 */
function persistFullState(state: SeoPreviewState, pollDeadline: number) {
  try {
    if (state.status === 'idle') {
      sessionStorage.removeItem(STORAGE_KEY)
      return
    }
    const persist: PersistedState = { ...state, pollDeadline }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persist))
  } catch { /* sessionStorage unavailable */ }
}

function loadPersistedState(): PersistedState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedState
  } catch {
    return null
  }
}

export function SeoPreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SeoPreviewState>(() => {
    if (typeof window === 'undefined') {
      return { status: 'idle', progress: 0, step: '', error: '', result: null, appliedKeyword: '' }
    }
    const restored = loadPersistedState()
    if (restored) {
      return {
        status: restored.status,
        progress: restored.progress,
        step: restored.step,
        error: restored.error,
        result: restored.result,
        appliedKeyword: restored.appliedKeyword,
      }
    }
    return { status: 'idle', progress: 0, step: '', error: '', result: null, appliedKeyword: '' }
  })

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollDeadlineRef = useRef<number>(0)
  const activeKeywordRef = useRef<string>('')

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    stopPolling()
    activeKeywordRef.current = ''
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
    setState({ status: 'idle', progress: 0, step: '', error: '', result: null, appliedKeyword: '' })
  }, [stopPolling])

  const applyResponse = useCallback((keyword: string, body: PreviewApiResponse) => {
    if (activeKeywordRef.current !== keyword) return
    setState((prev) => {
      const next: SeoPreviewState = {
        ...prev,
        status: body.status,
        progress: body.progress,
        step: body.step,
        error: body.error || '',
        result: body.status === 'completed' ? (body.data || prev.result) : prev.result,
        appliedKeyword: keyword,
      }
      persistFullState(next, pollDeadlineRef.current)
      return next
    })
  }, [])

  const pollOnce = useCallback(async (keyword: string) => {
    try {
      const res = await fetch(`/api/marketing/seo/preview?keyword=${encodeURIComponent(keyword)}`)
      const body: PreviewApiResponse = await res.json()
      applyResponse(keyword, body)
      if (body.status === 'completed' || body.status === 'failed') {
        stopPolling()
        return
      }
    } catch (err) {
      console.warn('[SeoPreview] poll error:', err)
    }
    if (Date.now() > pollDeadlineRef.current) {
      stopPolling()
      setState((prev) => {
        const next: SeoPreviewState = {
          ...prev,
          status: 'failed',
          error: '분석 시간이 너무 오래 걸려 중단했습니다. 잠시 후 다시 시도해주세요.',
        }
        persistFullState(next, pollDeadlineRef.current)
        return next
      })
      return
    }
    pollTimerRef.current = setTimeout(() => {
      if (activeKeywordRef.current === keyword) {
        pollOnce(keyword)
      }
    }, POLL_INTERVAL_MS)
  }, [applyResponse, stopPolling])

  const start = useCallback(async (keyword: string) => {
    const trimmed = keyword.trim()
    if (!trimmed) return

    stopPolling()
    activeKeywordRef.current = trimmed
    pollDeadlineRef.current = Date.now() + POLL_MAX_DURATION_MS
    const initial: SeoPreviewState = { status: 'pending', progress: 5, step: '분석을 요청하고 있습니다...', error: '', result: null, appliedKeyword: trimmed }
    setState(initial)
    persistFullState(initial, pollDeadlineRef.current)

    try {
      const res = await fetch('/api/marketing/seo/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: trimmed }),
      })
      const body: PreviewApiResponse = await res.json()
      applyResponse(trimmed, body)

      if (body.status === 'completed' || body.status === 'failed') return

      pollTimerRef.current = setTimeout(() => {
        if (activeKeywordRef.current === trimmed) {
          pollOnce(trimmed)
        }
      }, POLL_INTERVAL_MS)
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: 'failed',
        error: err instanceof Error ? err.message : '네트워크 오류',
      }))
    }
  }, [applyResponse, pollOnce, stopPolling])

  // Provider unmount 시 (앱 전체 종료 시) 폴링 정리
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  // 마운트 시 sessionStorage에서 진행 중 분석을 복원하면 폴링을 자동 재개
  useEffect(() => {
    if (typeof window === 'undefined') return
    const restored = loadPersistedState()
    if (!restored) return

    // 이미 완료/실패한 상태는 한 번만 최신 데이터로 동기화
    if (restored.status === 'completed' && restored.appliedKeyword) {
      // 더 최신 캐시가 있을 수 있으니 가볍게 한번 갱신 시도
      let cancelled = false
      fetch(`/api/marketing/seo/preview?keyword=${encodeURIComponent(restored.appliedKeyword)}`)
        .then((r) => r.json())
        .then((body: PreviewApiResponse) => {
          if (cancelled) return
          if (body.status === 'completed' && body.data) {
            setState((prev) => {
              const next = { ...prev, result: body.data || prev.result }
              persistFullState(next, pollDeadlineRef.current)
              return next
            })
          }
        })
        .catch(() => { /* ignore */ })
      return () => { cancelled = true }
    }

    // 진행 중(pending/running)이었으면 폴링 재개
    if ((restored.status === 'pending' || restored.status === 'running') && restored.appliedKeyword) {
      activeKeywordRef.current = restored.appliedKeyword
      // 만료 시각을 복원 (단, 최소 30초는 더 보장)
      pollDeadlineRef.current = Math.max(restored.pollDeadline, Date.now() + 30_000)
      pollTimerRef.current = setTimeout(() => {
        if (activeKeywordRef.current === restored.appliedKeyword) {
          pollOnce(restored.appliedKeyword)
        }
      }, 500) // 마운트 직후 빠르게 한번 확인
    }
    // 마운트 시 1회만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isBusy = state.status === 'pending' || state.status === 'running'

  return (
    <SeoPreviewContext.Provider value={{ ...state, start, reset, isBusy }}>
      {children}
    </SeoPreviewContext.Provider>
  )
}

export function useSeoPreview(): SeoPreviewContextType {
  const ctx = useContext(SeoPreviewContext)
  if (!ctx) throw new Error('useSeoPreview must be used within SeoPreviewProvider')
  return ctx
}
