'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

interface UseSeoPreviewState {
  status: SeoPreviewStatus
  progress: number
  step: string
  error: string
  result: SeoKeywordMiningResult | null
  appliedKeyword: string
}

interface UseSeoPreviewReturn extends UseSeoPreviewState {
  /** "분석 실행" 액션 — POST로 큐잉 + 폴링 시작 */
  start: (keyword: string) => Promise<void>
  /** 폴링/상태 초기화 (모달 닫을 때 등) */
  reset: () => void
  /** 분석 진행 중인지 (UI에서 입력 비활성화 등에 사용) */
  isBusy: boolean
}

const POLL_INTERVAL_MS = 3000
const POLL_MAX_DURATION_MS = 5 * 60 * 1000 // 5분

/**
 * SEO 분석 미리보기 폴링 훅
 * - start(keyword) 호출 → POST로 잡 등록 → GET 폴링으로 진행률 갱신
 * - 완료/실패 시 polling 중단
 */
export function useSeoPreview(): UseSeoPreviewReturn {
  const [state, setState] = useState<UseSeoPreviewState>({
    status: 'idle',
    progress: 0,
    step: '',
    error: '',
    result: null,
    appliedKeyword: '',
  })

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollDeadlineRef = useRef<number>(0)
  const activeKeywordRef = useRef<string>('')
  const cancelledRef = useRef<boolean>(false)

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    cancelledRef.current = true
    stopPolling()
    activeKeywordRef.current = ''
    setState({ status: 'idle', progress: 0, step: '', error: '', result: null, appliedKeyword: '' })
  }, [stopPolling])

  // 컴포넌트 unmount 시 polling 정리
  useEffect(() => {
    return () => {
      cancelledRef.current = true
      stopPolling()
    }
  }, [stopPolling])

  const applyResponse = useCallback((keyword: string, body: PreviewApiResponse) => {
    if (cancelledRef.current || activeKeywordRef.current !== keyword) return
    setState((prev) => ({
      ...prev,
      status: body.status,
      progress: body.progress,
      step: body.step,
      error: body.error || '',
      result: body.status === 'completed' ? (body.data || prev.result) : prev.result,
      appliedKeyword: keyword,
    }))
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
      // 일시적 네트워크 오류는 계속 폴링
      console.warn('[SeoPreview] poll error:', err)
    }
    // 마감 시간 초과 시 중단
    if (Date.now() > pollDeadlineRef.current) {
      stopPolling()
      setState((prev) => ({
        ...prev,
        status: 'failed',
        error: '분석 시간이 너무 오래 걸려 중단했습니다. 잠시 후 다시 시도해주세요.',
      }))
      return
    }
    // 다음 폴링 예약
    pollTimerRef.current = setTimeout(() => {
      if (!cancelledRef.current && activeKeywordRef.current === keyword) {
        pollOnce(keyword)
      }
    }, POLL_INTERVAL_MS)
  }, [applyResponse, stopPolling])

  const start = useCallback(async (keyword: string) => {
    const trimmed = keyword.trim()
    if (!trimmed) return

    cancelledRef.current = false
    stopPolling()
    activeKeywordRef.current = trimmed
    pollDeadlineRef.current = Date.now() + POLL_MAX_DURATION_MS
    setState({ status: 'pending', progress: 5, step: '분석을 요청하고 있습니다...', error: '', result: null, appliedKeyword: trimmed })

    try {
      const res = await fetch('/api/marketing/seo/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: trimmed }),
      })
      const body: PreviewApiResponse = await res.json()
      applyResponse(trimmed, body)

      if (body.status === 'completed' || body.status === 'failed') {
        return
      }

      // 폴링 시작
      pollTimerRef.current = setTimeout(() => {
        if (!cancelledRef.current && activeKeywordRef.current === trimmed) {
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

  const isBusy = state.status === 'pending' || state.status === 'running'

  return { ...state, start, reset, isBusy }
}
