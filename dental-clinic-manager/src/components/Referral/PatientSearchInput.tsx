'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Loader2, X } from 'lucide-react'
import { referralService } from '@/lib/referralService'
import type { PatientSearchResult } from '@/types/referral'

interface Props {
  clinicId: string
  selected: PatientSearchResult | null
  onSelect: (p: PatientSearchResult | null) => void
  placeholder?: string
  excludeId?: string
  autoFocus?: boolean
}

export default function PatientSearchInput({
  clinicId,
  selected,
  onSelect,
  placeholder = '이름, 차트번호, 전화번호로 검색',
  excludeId,
  autoFocus,
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PatientSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const data = await referralService.searchPatients(clinicId, q, 12)
      setResults(excludeId ? data.filter(d => d.id !== excludeId) : data)
    } catch (e) {
      console.error(e)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [clinicId, excludeId])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(query), 280)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, runSearch])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-[var(--at-border)] bg-[var(--at-accent-light)] px-3 py-2.5">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[var(--at-text-primary)]">{selected.patient_name}</span>
          <span className="text-xs text-[var(--at-text-secondary)]">
            {selected.chart_number ?? '차트번호 없음'} · {selected.phone_number ?? '전화번호 없음'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="rounded-md p-1 text-[var(--at-text-weak)] hover:bg-white hover:text-[var(--at-error)]"
          aria-label="선택 해제"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-[var(--at-border)] bg-white px-3 py-2.5 focus-within:border-[var(--at-accent)] focus-within:ring-1 focus-within:ring-[var(--at-accent)]">
        <Search className="h-4 w-4 text-[var(--at-text-weak)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--at-text-weak)]"
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-[var(--at-accent)]" />}
      </div>

      {open && query.trim() && (
        <div className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-[var(--at-border)] bg-white shadow-[var(--shadow-at-card)]">
          {!loading && results.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-[var(--at-text-weak)]">
              검색 결과가 없습니다.
            </div>
          )}
          {results.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => { onSelect(r); setOpen(false); setQuery('') }}
              className="flex w-full items-center justify-between border-b border-[var(--at-border)] px-3 py-2.5 text-left last:border-b-0 hover:bg-[var(--at-surface-hover)]"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-[var(--at-text-primary)]">{r.patient_name}</span>
                <span className="text-xs text-[var(--at-text-secondary)]">
                  {r.chart_number ?? '차트번호 없음'} · {r.phone_number ?? '전화번호 없음'}
                </span>
              </div>
              {r.acquisition_channel === '소개' && (
                <span className="rounded-full bg-[var(--at-accent-tag)] px-2 py-0.5 text-xs font-medium text-[var(--at-accent)]">
                  소개
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
