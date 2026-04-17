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
  value: string
  onChange: (ticker: string, name?: string) => void
  market: Market
  placeholder?: string
  className?: string
}

export default function TickerSearch({ value, onChange, market, placeholder, className }: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<TickerResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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

  // value prop 변경 시 동기화
  useEffect(() => {
    setQuery(value)
  }, [value])

  const search = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/investment/ticker-search?q=${encodeURIComponent(q)}&market=${market}`)
      const json = await res.json()
      setResults(json.results || [])
      setOpen(true)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [market])

  const handleInputChange = (val: string) => {
    setQuery(val)
    onChange(val)

    // 디바운스 검색 (300ms)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  const handleSelect = (result: TickerResult) => {
    setQuery(result.ticker)
    onChange(result.ticker, result.name)
    setOpen(false)
    setResults([])
  }

  const handleClear = () => {
    setQuery('')
    onChange('')
    setResults([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-at-text-weak" />
        <input
          type="text"
          value={query}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder || (market === 'KR' ? '종목명 또는 코드 (예: 삼성전자, 005930)' : '종목명 또는 심볼 (예: Apple, AAPL)')}
          className="w-full pl-9 pr-8 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-at-accent animate-spin" />
        )}
        {!loading && query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-at-text-weak hover:text-at-text"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 검색 결과 드롭다운 */}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-at-surface rounded-xl shadow-lg border border-at-border max-h-60 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={`${r.ticker}-${i}`}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2.5 hover:bg-at-bg transition-colors flex items-center gap-3 border-b border-at-border/50 last:border-0"
            >
              <span className="font-mono text-sm font-semibold text-at-accent min-w-[60px]">
                {r.ticker}
              </span>
              <span className="text-sm text-at-text truncate flex-1">{r.name}</span>
              <span className="text-[10px] text-at-text-weak px-1.5 py-0.5 bg-at-bg rounded">
                {r.type === 'ETF' ? 'ETF' : r.exchange}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && !loading && query.length >= 1 && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-at-surface rounded-xl shadow-lg border border-at-border p-3 text-center text-sm text-at-text-weak">
          검색 결과가 없습니다
        </div>
      )}
    </div>
  )
}
