'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import type { Market } from '@/types/investment'

interface TickerResult {
  ticker: string
  name: string
  exchange: string
  type: string
  market: string
}

interface Props {
  /** 종목 선택 시 호출 (드롭다운 클릭 OR Enter 키) */
  onSelect: (ticker: string, name?: string) => void
  market: Market
  placeholder?: string
  className?: string
  /** 선택 후 입력 필드를 비울지 여부 (기본 true) */
  clearOnSelect?: boolean
}

export default function TickerSearch({ onSelect, market, placeholder, className, clearOnSelect = true }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TickerResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // IME 조합 상태 (한글 입력 시 자모 단위 처리 방지)
  const composingRef = useRef(false)

  // 외부 클릭 시 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // 시장 변경 시 결과 초기화
  useEffect(() => {
    setResults([])
    setOpen(false)
  }, [market])

  /**
   * 입력값이 "검색 가능한 상태"인지 판단
   * - 빈 문자열/공백만 있는 경우 false
   * - 한글 자모(ㄱㄴㄷㅏㅑ 등)만 포함된 경우 false (IME 조합 중)
   * - 완성형 한글, 영문, 숫자가 있으면 true
   */
  const isSearchable = (q: string): boolean => {
    const trimmed = q.trim()
    if (trimmed.length < 1) return false

    // 한글 자모 범위: U+3131~U+318F (ㄱ-ㅎ, ㅏ-ㅣ 등)
    // 완성형 한글: U+AC00~U+D7A3 (가-힣)
    // 자모만 포함 + 완성형 한글/영문/숫자 없음 → 조합 중
    const hasCompleted = /[\uAC00-\uD7A3a-zA-Z0-9]/.test(trimmed)
    return hasCompleted
  }

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 1) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/investment/ticker-search?q=${encodeURIComponent(trimmed)}&market=${market}`)
      const json = await res.json()
      setResults(json.results || [])
      setOpen(true)
      setHighlightIdx(-1)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [market])

  const scheduleSearch = useCallback((val: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    // 검색 가능한 상태가 아니면 예약 자체를 안 함
    if (!isSearchable(val)) {
      setResults([])
      return
    }
    // 한글 타이핑 속도 대응: 700ms debounce (완성된 단어 기다림)
    debounceRef.current = setTimeout(() => {
      // 실행 시점에 IME 조합 중이면 스킵 (레이스 대응)
      if (composingRef.current) return
      search(val)
    }, 700)
  }, [search])

  const handleInputChange = (val: string) => {
    setQuery(val)
    // IME 조합 중이면 검색 안 함 (compositionend에서 처리)
    if (composingRef.current) return
    scheduleSearch(val)
  }

  const handleCompositionStart = () => {
    composingRef.current = true
    // 조합 시작 시 기존 디바운스 취소
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    const val = (e.target as HTMLInputElement).value
    setQuery(val)
    // React 렌더 사이클과 IME 이벤트 순서 보장을 위해 짧은 지연 후 해제
    setTimeout(() => {
      composingRef.current = false
      scheduleSearch(val)
    }, 0)
  }

  const handleSelect = (result: TickerResult) => {
    onSelect(result.ticker, result.name)
    if (clearOnSelect) {
      setQuery('')
    } else {
      setQuery(result.ticker)
    }
    setOpen(false)
    setResults([])
    setHighlightIdx(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // IME 조합 중엔 키보드 이벤트 무시 (특히 Enter로 조합 완료되는 경우)
    if (composingRef.current || e.nativeEvent.isComposing) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIdx >= 0 && results[highlightIdx]) {
        handleSelect(results[highlightIdx])
      } else if (results.length > 0) {
        // 첫 번째 결과 자동 선택
        handleSelect(results[0])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    setOpen(false)
    setHighlightIdx(-1)
  }

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-at-text-weak" />
        <input
          type="text"
          value={query}
          onChange={e => handleInputChange(e.target.value)}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder || (market === 'KR' ? '종목명 또는 코드 검색 (예: 삼성전자, 005930)' : '종목명 또는 심볼 검색 (예: Apple, AAPL)')}
          className="w-full pl-9 pr-8 py-2 rounded-xl border border-at-border bg-white text-at-text text-sm focus:outline-none focus:border-at-accent"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-at-accent animate-spin" />
        )}
        {!loading && query && (
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-at-text-weak hover:text-at-text"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 검색 결과 드롭다운 */}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl shadow-lg border border-at-border max-h-60 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={`${r.ticker}-${i}`}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleSelect(r)}
              className={`w-full text-left px-3 py-2.5 transition-colors flex items-center gap-3 border-b border-at-border/50 last:border-0 ${
                highlightIdx === i ? 'bg-at-accent-light' : 'hover:bg-at-surface-alt'
              }`}
            >
              <span className="font-mono text-sm font-semibold text-at-accent min-w-[60px]">
                {r.ticker}
              </span>
              <span className="text-sm text-at-text truncate flex-1">{r.name}</span>
              <span className="text-[10px] text-at-text-weak px-1.5 py-0.5 bg-at-surface-alt rounded">
                {r.type === 'ETF' ? 'ETF' : r.exchange}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && !loading && isSearchable(query) && results.length === 0 && !composingRef.current && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl shadow-lg border border-at-border p-3 text-center text-sm text-at-text-weak">
          검색 결과가 없습니다
        </div>
      )}
    </div>
  )
}
