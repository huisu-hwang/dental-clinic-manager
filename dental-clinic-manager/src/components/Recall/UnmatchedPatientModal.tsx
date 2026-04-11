'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X,
  Search,
  Check,
  SkipForward,
  Undo2,
  AlertCircle,
  Loader2
} from 'lucide-react'
import type {
  UnmatchedPatientItem,
  RecallPatient,
  RecallExcludeReason
} from '@/types/recall'
import { EXCLUDE_REASON_LABELS, EXCLUDE_REASON_COLORS } from '@/types/recall'
import { recallService } from '@/lib/recallService'

interface UnmatchedPatientModalProps {
  isOpen: boolean
  onClose: () => void
  unmatchedPatients: UnmatchedPatientItem[]
  excludeReason: RecallExcludeReason
  onComplete: () => void
}

export default function UnmatchedPatientModal({
  isOpen,
  onClose,
  unmatchedPatients,
  excludeReason,
  onComplete
}: UnmatchedPatientModalProps) {
  const [items, setItems] = useState<UnmatchedPatientItem[]>([])
  const [searchQueries, setSearchQueries] = useState<Record<number, string>>({})
  const [searchResults, setSearchResults] = useState<Record<number, RecallPatient[]>>({})
  const [searchLoading, setSearchLoading] = useState<Record<number, boolean>>({})
  const [matchingIndex, setMatchingIndex] = useState<number | null>(null)
  const debounceTimers = useRef<Record<number, NodeJS.Timeout>>({})

  const executeSearch = useCallback(async (index: number, query: string) => {
    const q = query.trim()
    if (!q) {
      setSearchResults(prev => ({ ...prev, [index]: [] }))
      return
    }
    setSearchLoading(prev => ({ ...prev, [index]: true }))
    try {
      const result = await recallService.patients.searchPatientsForMatching(q)
      if (result.success && result.data) {
        setSearchResults(prev => ({ ...prev, [index]: result.data! }))
      } else {
        setSearchResults(prev => ({ ...prev, [index]: [] }))
      }
    } catch (err) {
      console.error('Search exception:', err)
      setSearchResults(prev => ({ ...prev, [index]: [] }))
    }
    setSearchLoading(prev => ({ ...prev, [index]: false }))
  }, [])

  useEffect(() => {
    if (isOpen && unmatchedPatients.length > 0) {
      setItems([...unmatchedPatients])
      setSearchResults({})
      setSearchLoading({})
      setMatchingIndex(null)

      const initialQueries: Record<number, string> = {}
      unmatchedPatients.forEach((p, i) => {
        initialQueries[i] = p.uploadData.patient_name || p.uploadData.phone_number || ''
      })
      setSearchQueries(initialQueries)

      unmatchedPatients.forEach((p, i) => {
        const q = p.uploadData.patient_name || p.uploadData.phone_number || ''
        if (q.trim()) {
          executeSearch(i, q)
        }
      })
    }
  }, [isOpen, unmatchedPatients, executeSearch])

  const handleSearch = useCallback((index: number, query: string) => {
    setSearchQueries(prev => ({ ...prev, [index]: query }))

    if (debounceTimers.current[index]) {
      clearTimeout(debounceTimers.current[index])
    }

    if (!query.trim()) {
      setSearchResults(prev => ({ ...prev, [index]: [] }))
      return
    }

    debounceTimers.current[index] = setTimeout(() => {
      executeSearch(index, query)
    }, 300)
  }, [executeSearch])

  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout)
    }
  }, [])

  const handleMatch = async (index: number, patient: RecallPatient) => {
    setMatchingIndex(index)
    const result = await recallService.patients.manualMatchExclude(patient.id, excludeReason)
    if (result.success) {
      setItems(prev => prev.map((item, i) =>
        i === index
          ? { ...item, status: 'matched' as const, matchedPatientId: patient.id, matchedPatientName: patient.patient_name }
          : item
      ))
      setSearchResults(prev => ({ ...prev, [index]: [] }))
    }
    setMatchingIndex(null)
  }

  const handleSkip = (index: number) => {
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, status: 'skipped' as const } : item
    ))
  }

  const handleUndoMatch = async (index: number) => {
    const item = items[index]
    if (!item?.matchedPatientId) return

    setMatchingIndex(index)
    const result = await recallService.patients.manualMatchExclude(item.matchedPatientId, null)
    if (result.success) {
      setItems(prev => prev.map((it, i) =>
        i === index
          ? { ...it, status: 'pending' as const, matchedPatientId: undefined, matchedPatientName: undefined }
          : it
      ))
    }
    setMatchingIndex(null)
  }

  const handleSkipAll = () => {
    setItems(prev => prev.map(item =>
      item.status === 'pending' ? { ...item, status: 'skipped' as const } : item
    ))
  }

  const handleComplete = () => {
    onComplete()
    onClose()
  }

  const handleClose = () => {
    const pendingCount = items.filter(i => i.status === 'pending').length
    if (pendingCount > 0) {
      const confirmed = window.confirm(`미처리 ${pendingCount}명은 건너뛰기 처리됩니다. 닫으시겠습니까?`)
      if (!confirmed) return
    }
    handleComplete()
  }

  if (!isOpen) return null

  const matchedCount = items.filter(i => i.status === 'matched').length
  const skippedCount = items.filter(i => i.status === 'skipped').length
  const pendingCount = items.filter(i => i.status === 'pending').length
  const totalCount = items.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div className="relative bg-white rounded-2xl shadow-at-card w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-at-border">
          <div>
            <h3 className="text-lg font-bold text-at-text">미매칭 환자 수동 매칭</h3>
            <p className="text-sm text-at-text-weak mt-0.5">
              매칭되지 않은 환자 {totalCount}명
              <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-at-warning-bg text-at-warning">
                제외 사유: {EXCLUDE_REASON_LABELS[excludeReason]}
              </span>
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-at-surface-hover rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-at-text-weak" />
          </button>
        </div>

        {/* 진행 상태 바 */}
        <div className="px-5 py-3 border-b border-at-border bg-at-surface-alt flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-at-text-secondary">
            <span>진행: <strong className="text-at-text">{matchedCount + skippedCount}/{totalCount}</strong> 완료</span>
            {matchedCount > 0 && <span className="text-at-success">매칭 {matchedCount}</span>}
            {skippedCount > 0 && <span className="text-at-text-weak">건너뛰기 {skippedCount}</span>}
            {pendingCount > 0 && <span className="text-at-warning">남은 {pendingCount}</span>}
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <button
                onClick={handleSkipAll}
                className="px-3 py-1.5 text-xs font-medium text-at-text-secondary bg-white border border-at-border rounded-xl hover:bg-at-surface-hover transition-colors"
              >
                전체 건너뛰기
              </button>
            )}
            <button
              onClick={handleComplete}
              className="px-3 py-1.5 text-xs font-medium text-white bg-at-accent rounded-xl hover:bg-at-accent-hover transition-colors"
            >
              완료
            </button>
          </div>
        </div>

        {/* 환자 카드 목록 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 max-h-[60vh]">
          {items.map((item, index) => (
            <div
              key={index}
              className={`border rounded-xl transition-all ${
                item.status === 'matched'
                  ? 'border-green-200 bg-at-success-bg'
                  : item.status === 'skipped'
                  ? 'border-at-border bg-at-surface-alt opacity-60'
                  : 'border-at-border bg-white'
              }`}
            >
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {item.status === 'matched' && <Check className="w-4 h-4 text-at-success" />}
                    {item.status === 'skipped' && <SkipForward className="w-4 h-4 text-at-text-weak" />}
                    {item.status === 'pending' && <AlertCircle className="w-4 h-4 text-at-warning" />}
                    <span className="text-sm font-medium text-at-text-secondary">
                      업로드: {item.uploadData.patient_name || '이름 없음'}
                      {item.uploadData.phone_number && (
                        <span className="text-at-text-weak ml-1">/ {item.uploadData.phone_number}</span>
                      )}
                    </span>
                  </div>

                  {item.status === 'matched' && (
                    <button
                      onClick={() => handleUndoMatch(index)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-hover rounded-lg transition-colors"
                    >
                      <Undo2 className="w-3 h-3" />
                      매칭 취소
                    </button>
                  )}
                  {item.status === 'pending' && (
                    <button
                      onClick={() => handleSkip(index)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-hover rounded-lg transition-colors"
                    >
                      <SkipForward className="w-3 h-3" />
                      건너뛰기
                    </button>
                  )}
                </div>

                {item.status === 'matched' && (
                  <div className="text-sm text-at-success bg-green-100 rounded-lg px-2.5 py-1.5">
                    <Check className="w-3.5 h-3.5 inline mr-1" />
                    {item.uploadData.patient_name || '이름 없음'} → {item.matchedPatientName} 매칭 완료
                  </div>
                )}

                {item.status === 'pending' && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-at-text-weak" />
                      <input
                        type="text"
                        value={searchQueries[index] || ''}
                        onChange={(e) => handleSearch(index, e.target.value)}
                        placeholder="환자 이름, 전화번호, 차트번호로 검색..."
                        className="w-full pl-8 pr-3 py-2 text-sm border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent"
                      />
                      {searchLoading[index] && (
                        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-at-text-weak animate-spin" />
                      )}
                    </div>

                    {searchResults[index] && searchResults[index].length > 0 && (
                      <div className="border border-at-border rounded-xl overflow-hidden">
                        {searchResults[index].map((patient) => (
                          <button
                            key={patient.id}
                            onClick={() => handleMatch(index, patient)}
                            disabled={matchingIndex === index}
                            className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-at-accent-light border-b border-at-border last:border-b-0 transition-colors text-left disabled:opacity-50"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-at-text-secondary">{patient.patient_name}</span>
                              <span className="text-at-text-weak">{patient.phone_number}</span>
                              {patient.chart_number && (
                                <span className="text-at-text-weak text-xs">({patient.chart_number})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {patient.exclude_reason && (
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${EXCLUDE_REASON_COLORS[patient.exclude_reason]}`}>
                                  제외:{EXCLUDE_REASON_LABELS[patient.exclude_reason]}
                                </span>
                              )}
                              {matchingIndex === index ? (
                                <Loader2 className="w-4 h-4 text-at-accent animate-spin" />
                              ) : (
                                <Check className="w-4 h-4 text-at-accent" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {searchResults[index] && searchResults[index].length === 0 && searchQueries[index]?.trim() && !searchLoading[index] && (
                      <p className="text-xs text-at-text-weak text-center py-2">검색 결과가 없습니다.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 하단 요약 */}
        <div className="px-5 py-3 border-t border-at-border bg-at-surface-alt flex items-center justify-between rounded-b-2xl">
          <div className="flex items-center gap-3 text-sm text-at-text-secondary">
            {matchedCount > 0 && <span className="text-at-success font-medium">매칭 {matchedCount}명</span>}
            {skippedCount > 0 && <span className="text-at-text-weak">건너뛰기 {skippedCount}명</span>}
            {pendingCount > 0 && <span className="text-at-warning">남은 {pendingCount}명</span>}
          </div>
          <button
            onClick={handleComplete}
            className="px-4 py-2 text-sm font-medium text-white bg-at-accent rounded-xl hover:bg-at-accent-hover transition-colors"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  )
}
