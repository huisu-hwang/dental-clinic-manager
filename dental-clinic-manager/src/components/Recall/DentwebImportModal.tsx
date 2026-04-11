'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Search,
  Download,
  Database,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Calendar
} from 'lucide-react'
import { dentwebService } from '@/lib/dentwebSyncService'
import type { DentwebPatient, DentwebPatientFilters } from '@/types/dentweb'
import { formatElapsedTime } from '@/types/recall'

interface DentwebImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: (importedCount: number, skippedCount: number) => void
}

export default function DentwebImportModal({
  isOpen,
  onClose,
  onImportComplete
}: DentwebImportModalProps) {
  const [patients, setPatients] = useState<DentwebPatient[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [lastVisitMonths, setLastVisitMonths] = useState<number>(6)
  const [isLoading, setIsLoading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalPatients, setTotalPatients] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const pageSize = 20

  const loadPatients = useCallback(async (page: number = 1) => {
    setIsLoading(true)
    setError(null)

    const filters: DentwebPatientFilters = {
      search: search || undefined,
      lastVisitMonthsAgo: lastVisitMonths > 0 ? lastVisitMonths : undefined,
      isActive: true,
      page,
      pageSize
    }

    const result = await dentwebService.patients.getPatients(filters)

    if (result.success && result.data) {
      setPatients(result.data.data)
      setTotalPages(result.data.totalPages)
      setTotalPatients(result.data.total)
      setCurrentPage(result.data.page)
    } else {
      setError(result.error || '환자 목록을 불러오는데 실패했습니다.')
      setPatients([])
    }

    setIsLoading(false)
  }, [search, lastVisitMonths, pageSize])

  // 모달 열릴 때 데이터 로드
  useEffect(() => {
    if (isOpen) {
      setSelectedIds([])
      setSearch('')
      setCurrentPage(1)
      loadPatients(1)
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // 검색/필터 변경 시 재로드
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setCurrentPage(1)
        loadPatients(1)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [search, lastVisitMonths]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectAll = () => {
    if (selectedIds.length === patients.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(patients.map(p => p.id))
    }
  }

  const handleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleImport = async () => {
    if (selectedIds.length === 0) return

    setIsImporting(true)
    const result = await dentwebService.patients.importToRecall(selectedIds)

    if (result.success) {
      onImportComplete(result.importedCount, result.skippedCount)
      onClose()
    } else {
      setError(result.error || '가져오기에 실패했습니다.')
    }

    setIsImporting(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col mx-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-at-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <Database className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-at-text">덴트웹에서 가져오기</h2>
              <p className="text-sm text-at-text-weak">
                덴트웹 환자를 리콜 대상으로 등록합니다
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-at-text-weak hover:text-at-text-secondary rounded-lg hover:bg-at-surface-hover">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 필터 영역 */}
        <div className="p-4 border-b border-at-border space-y-3">
          <div className="flex flex-wrap gap-3">
            {/* 검색 */}
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-at-text-weak" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름, 차트번호, 전화번호 검색..."
                className="w-full pl-10 pr-4 py-2 border border-at-border rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            {/* 미내원 기간 필터 */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-at-text-weak" />
              <select
                value={lastVisitMonths}
                onChange={(e) => setLastVisitMonths(parseInt(e.target.value))}
                className="px-3 py-2 border border-at-border rounded-xl text-sm focus:ring-2 focus:ring-teal-500"
              >
                <option value={0}>전체 환자</option>
                <option value={3}>3개월 이상 미내원</option>
                <option value={6}>6개월 이상 미내원</option>
                <option value={12}>1년 이상 미내원</option>
                <option value={24}>2년 이상 미내원</option>
              </select>
            </div>
          </div>

          {/* 결과 요약 */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-at-text-weak">
              총 <strong className="text-at-text-secondary">{totalPatients}</strong>명
              {selectedIds.length > 0 && (
                <span className="ml-2 text-teal-600">
                  (<strong>{selectedIds.length}</strong>명 선택)
                </span>
              )}
            </span>
            {selectedIds.length > 0 && (
              <button
                onClick={handleImport}
                disabled={isImporting}
                className="flex items-center gap-2 px-4 py-1.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 text-sm font-medium"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    가져오는 중...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    {selectedIds.length}명 리콜 등록
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mx-4 mt-3 flex items-center gap-2 p-3 bg-at-error-bg text-at-error rounded-xl text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* 환자 목록 */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
              <span className="ml-3 text-at-text-weak">환자 목록 로딩 중...</span>
            </div>
          ) : patients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-at-text-weak">
              <Database className="w-12 h-12 mb-3" />
              <p className="text-sm">
                {totalPatients === 0
                  ? '덴트웹 동기화 데이터가 없습니다. 브릿지 에이전트를 설정해주세요.'
                  : '검색 결과가 없습니다.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-at-surface-alt sticky top-0">
                <tr className="text-left text-at-text-secondary">
                  <th className="px-4 py-3 w-10">
                    <button onClick={handleSelectAll} className="text-at-text-weak hover:text-teal-600">
                      {selectedIds.length === patients.length && patients.length > 0 ? (
                        <CheckSquare className="w-5 h-5 text-teal-600" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3">차트번호</th>
                  <th className="px-4 py-3">환자명</th>
                  <th className="px-4 py-3">전화번호</th>
                  <th className="px-4 py-3">생년월일</th>
                  <th className="px-4 py-3">최종내원일</th>
                  <th className="px-4 py-3">최근치료</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-at-border">
                {patients.map(patient => (
                  <tr
                    key={patient.id}
                    onClick={() => handleSelect(patient.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedIds.includes(patient.id)
                        ? 'bg-teal-50'
                        : 'hover:bg-at-surface-hover'
                    }`}
                  >
                    <td className="px-4 py-3">
                      {selectedIds.includes(patient.id) ? (
                        <CheckSquare className="w-5 h-5 text-teal-600" />
                      ) : (
                        <Square className="w-5 h-5 text-at-text-weak" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-at-text-secondary">
                      {patient.chart_number || '-'}
                    </td>
                    <td className="px-4 py-3 font-medium text-at-text">
                      {patient.patient_name}
                    </td>
                    <td className="px-4 py-3 text-at-text-secondary">
                      {patient.phone_number || '-'}
                    </td>
                    <td className="px-4 py-3 text-at-text-secondary">
                      {patient.birth_date || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {patient.last_visit_date ? (
                        <div>
                          <span className="text-at-text-secondary">{patient.last_visit_date}</span>
                          <span className="ml-1 text-xs text-orange-500">
                            ({formatElapsedTime(patient.last_visit_date)})
                          </span>
                        </div>
                      ) : (
                        <span className="text-at-text-weak">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-at-text-secondary max-w-[150px] truncate">
                      {patient.last_treatment_type || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-4 border-t border-at-border">
            <button
              onClick={() => { setCurrentPage(prev => prev - 1); loadPatients(currentPage - 1) }}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-lg border border-at-border disabled:opacity-50 hover:bg-at-surface-hover"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-at-text-secondary px-3">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => { setCurrentPage(prev => prev + 1); loadPatients(currentPage + 1) }}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded-lg border border-at-border disabled:opacity-50 hover:bg-at-surface-hover"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
