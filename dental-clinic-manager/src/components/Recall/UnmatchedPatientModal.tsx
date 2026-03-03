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

  // 초기화
  useEffect(() => {
    if (isOpen && unmatchedPatients.length > 0) {
      setItems([...unmatchedPatients])
      // 검색어 자동 채움 (이름 또는 전화번호)
      const initialQueries: Record<number, string> = {}
      unmatchedPatients.forEach((p, i) => {
        initialQueries[i] = p.uploadData.patient_name || p.uploadData.phone_number || ''
      })
      setSearchQueries(initialQueries)
      setSearchResults({})
      setSearchLoading({})
      setMatchingIndex(null)
    }
  }, [isOpen, unmatchedPatients])

  // 검색 실행 (300ms 디바운스)
  const handleSearch = useCallback((index: number, query: string) => {
    setSearchQueries(prev => ({ ...prev, [index]: query }))

    if (debounceTimers.current[index]) {
      clearTimeout(debounceTimers.current[index])
    }

    if (!query.trim()) {
      setSearchResults(prev => ({ ...prev, [index]: [] }))
      return
    }

    debounceTimers.current[index] = setTimeout(async () => {
      setSearchLoading(prev => ({ ...prev, [index]: true }))
      const result = await recallService.patients.searchPatientsForMatching(query)
      if (result.success && result.data) {
        setSearchResults(prev => ({ ...prev, [index]: result.data! }))
      }
      setSearchLoading(prev => ({ ...prev, [index]: false }))
    }, 300)
  }, [])

  // cleanup timers
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout)
    }
  }, [])

  // 매칭 처리
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

  // 건너뛰기
  const handleSkip = (index: number) => {
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, status: 'skipped' as const } : item
    ))
  }

  // 매칭 취소
  const handleUndoMatch = (index: number) => {
    setItems(prev => prev.map((item, i) =>
      i === index
        ? { ...item, status: 'pending' as const, matchedPatientId: undefined, matchedPatientName: undefined }
        : item
    ))
  }

  // 전체 건너뛰기
  const handleSkipAll = () => {
    setItems(prev => prev.map(item =>
      item.status === 'pending' ? { ...item, status: 'skipped' as const } : item
    ))
  }

  // 완료
  const handleComplete = () => {
    const matched = items.filter(i => i.status === 'matched').length
    const skipped = items.filter(i => i.status === 'skipped').length
    onComplete()
    onClose()
  }

  // 닫기 (미처리 확인)
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
      {/* 오버레이 */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* 모달 */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-bold text-slate-800">미매칭 환자 수동 매칭</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              매칭되지 않은 환자 {totalCount}명
              <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                제외 사유: {EXCLUDE_REASON_LABELS[excludeReason]}
              </span>
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* 진행 상태 바 */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>진행: <strong className="text-slate-800">{matchedCount + skippedCount}/{totalCount}</strong> 완료</span>
            {matchedCount > 0 && <span className="text-green-600">매칭 {matchedCount}</span>}
            {skippedCount > 0 && <span className="text-slate-400">건너뛰기 {skippedCount}</span>}
            {pendingCount > 0 && <span className="text-amber-600">남은 {pendingCount}</span>}
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <button
                onClick={handleSkipAll}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                전체 건너뛰기
              </button>
            )}
            <button
              onClick={handleComplete}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
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
              className={`border rounded-lg transition-all ${
                item.status === 'matched'
                  ? 'border-green-200 bg-green-50'
                  : item.status === 'skipped'
                  ? 'border-slate-200 bg-slate-50 opacity-60'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="p-3">
                {/* 환자 정보 헤더 */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {item.status === 'matched' && <Check className="w-4 h-4 text-green-600" />}
                    {item.status === 'skipped' && <SkipForward className="w-4 h-4 text-slate-400" />}
                    {item.status === 'pending' && <AlertCircle className="w-4 h-4 text-amber-500" />}
                    <span className="text-sm font-medium text-slate-700">
                      업로드: {item.uploadData.patient_name || '이름 없음'}
                      {item.uploadData.phone_number && (
                        <span className="text-slate-400 ml-1">/ {item.uploadData.phone_number}</span>
                      )}
                    </span>
                  </div>

                  {/* 상태별 액션 */}
                  {item.status === 'matched' && (
                    <button
                      onClick={() => handleUndoMatch(index)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                    >
                      <Undo2 className="w-3 h-3" />
                      매칭 취소
                    </button>
                  )}
                  {item.status === 'pending' && (
                    <button
                      onClick={() => handleSkip(index)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                    >
                      <SkipForward className="w-3 h-3" />
                      건너뛰기
                    </button>
                  )}
                </div>

                {/* 매칭 완료 표시 */}
                {item.status === 'matched' && (
                  <div className="text-sm text-green-700 bg-green-100 rounded px-2.5 py-1.5">
                    <Check className="w-3.5 h-3.5 inline mr-1" />
                    {item.uploadData.patient_name || '이름 없음'} → {item.matchedPatientName} 매칭 완료
                  </div>
                )}

                {/* 검색 UI (pending 상태만) */}
                {item.status === 'pending' && (
                  <div className="space-y-2">
                    {/* 검색 입력 */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={searchQueries[index] || ''}
                        onChange={(e) => handleSearch(index, e.target.value)}
                        placeholder="환자 이름, 전화번호, 차트번호로 검색..."
                        className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      {searchLoading[index] && (
                        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                      )}
                    </div>

                    {/* 검색 결과 */}
                    {searchResults[index] && searchResults[index].length > 0 && (
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        {searchResults[index].map((patient) => (
                          <button
                            key={patient.id}
                            onClick={() => handleMatch(index, patient)}
                            disabled={matchingIndex === index}
                            className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-b-0 transition-colors text-left disabled:opacity-50"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-700">{patient.patient_name}</span>
                              <span className="text-slate-400">{patient.phone_number}</span>
                              {patient.chart_number && (
                                <span className="text-slate-400 text-xs">({patient.chart_number})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {patient.exclude_reason && (
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${EXCLUDE_REASON_COLORS[patient.exclude_reason]}`}>
                                  제외:{EXCLUDE_REASON_LABELS[patient.exclude_reason]}
                                </span>
                              )}
                              {matchingIndex === index ? (
                                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4 text-blue-500" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 검색 결과 없음 */}
                    {searchResults[index] && searchResults[index].length === 0 && searchQueries[index]?.trim() && !searchLoading[index] && (
                      <p className="text-xs text-slate-400 text-center py-2">검색 결과가 없습니다.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 하단 요약 */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between rounded-b-xl">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            {matchedCount > 0 && <span className="text-green-600 font-medium">매칭 {matchedCount}명</span>}
            {skippedCount > 0 && <span className="text-slate-500">건너뛰기 {skippedCount}명</span>}
            {pendingCount > 0 && <span className="text-amber-600">남은 {pendingCount}명</span>}
          </div>
          <button
            onClick={handleComplete}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  )
}
