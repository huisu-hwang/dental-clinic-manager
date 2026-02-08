'use client'

import { useState, useMemo } from 'react'
import {
  Phone,
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Calendar,
  PhoneOff,
  PhoneMissed,
  Ban,
  History,
  UserX,
  Heart,
  ShieldOff,
  Undo2,
  EyeOff
} from 'lucide-react'
import type {
  RecallPatient,
  PatientRecallStatus,
  RecallExcludeReason,
  RecallPatientFilters
} from '@/types/recall'
import {
  RECALL_STATUS_LABELS,
  RECALL_STATUS_COLORS,
  MANUAL_STATUS_OPTIONS,
  GENDER_LABELS,
  EXCLUDE_REASON_LABELS,
  EXCLUDE_REASON_COLORS,
  calculateAge
} from '@/types/recall'
import { displayPhoneNumber } from '@/lib/phoneCallService'

interface PatientListProps {
  patients: RecallPatient[]
  selectedPatients: string[]
  onSelectPatient: (id: string) => void
  onSelectAll: (selected: boolean) => void
  onCallPatient: (patient: RecallPatient) => void
  onSmsPatient: (patient: RecallPatient) => void
  onUpdateStatus: (patient: RecallPatient, newStatus?: PatientRecallStatus) => void
  onViewHistory: (patient: RecallPatient) => void
  onExcludePatient: (patient: RecallPatient, reason: RecallExcludeReason | null) => void
  filters: RecallPatientFilters
  onFiltersChange: (filters: RecallPatientFilters) => void
  isLoading?: boolean
  // 페이지네이션
  currentPage?: number
  totalPages?: number
  totalPatients?: number
  onPageChange?: (page: number) => void
}

// 상태별 아이콘
const STATUS_ICONS: Record<PatientRecallStatus, React.ReactNode> = {
  pending: <Clock className="w-3.5 h-3.5" />,
  sms_sent: <MessageSquare className="w-3.5 h-3.5" />,
  appointment_made: <CheckCircle className="w-3.5 h-3.5" />,
  call_rejected: <PhoneOff className="w-3.5 h-3.5" />,
  visit_refused: <Ban className="w-3.5 h-3.5" />,
  invalid_number: <XCircle className="w-3.5 h-3.5" />,
  no_answer: <PhoneMissed className="w-3.5 h-3.5" />
}

export default function PatientList({
  patients,
  selectedPatients,
  onSelectPatient,
  onSelectAll,
  onCallPatient,
  onSmsPatient,
  onUpdateStatus,
  onViewHistory,
  onExcludePatient,
  filters,
  onFiltersChange,
  isLoading,
  currentPage = 1,
  totalPages = 1,
  totalPatients = 0,
  onPageChange
}: PatientListProps) {
  const [sortField, setSortField] = useState<'patient_name' | 'status' | 'last_contact_date'>('patient_name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [showFilters, setShowFilters] = useState(false)

  // 정렬된 환자 목록
  const sortedPatients = useMemo(() => {
    return [...patients].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'patient_name':
          comparison = a.patient_name.localeCompare(b.patient_name)
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
        case 'last_contact_date':
          const dateA = a.last_contact_date || ''
          const dateB = b.last_contact_date || ''
          comparison = dateA.localeCompare(dateB)
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [patients, sortField, sortDirection])

  // 정렬 토글
  const handleSort = (field: 'patient_name' | 'status' | 'last_contact_date') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // 전체 선택 상태
  const isAllSelected = patients.length > 0 && selectedPatients.length === patients.length
  const isPartiallySelected = selectedPatients.length > 0 && selectedPatients.length < patients.length

  // 상태별 필터 옵션 (간소화된 상태)
  const statusOptions: { value: PatientRecallStatus | 'all'; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'pending', label: '대기중' },
    { value: 'sms_sent', label: '문자발송' },
    { value: 'appointment_made', label: '예약완료' },
    { value: 'no_answer', label: '부재중' },
    { value: 'call_rejected', label: '통화거부' },
    { value: 'visit_refused', label: '내원거부' },
    { value: 'invalid_number', label: '없는번호' }
  ]

  // 상태 변경 핸들러
  const handleStatusChange = (patient: RecallPatient, newStatus: PatientRecallStatus) => {
    if (patient.status !== newStatus) {
      onUpdateStatus(patient, newStatus)
    }
  }

  // 나이/성별 포맷
  const formatAgeGender = (patient: RecallPatient): string => {
    const parts: string[] = []
    const age = calculateAge(patient.birth_date)
    if (age !== null) {
      parts.push(`${age}세`)
    }
    if (patient.gender && GENDER_LABELS[patient.gender]) {
      parts.push(GENDER_LABELS[patient.gender])
    }
    return parts.length > 0 ? parts.join('/') : ''
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* 헤더 및 필터 */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* 검색 */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="환자명, 전화번호, 차트번호 검색..."
              value={filters.search || ''}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* 상태 필터 */}
          <select
            value={filters.status || 'all'}
            onChange={(e) => onFiltersChange({ ...filters, status: e.target.value as PatientRecallStatus | 'all' })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* 제외 환자 보기 토글 */}
          <button
            onClick={() => onFiltersChange({
              ...filters,
              showExcluded: !filters.showExcluded
            })}
            className={`px-4 py-2 border rounded-lg flex items-center gap-2 text-sm transition-colors ${
              filters.showExcluded
                ? 'border-rose-400 bg-rose-50 text-rose-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
            title={filters.showExcluded ? '일반 환자 보기' : '제외 환자 보기'}
          >
            <EyeOff className="w-4 h-4" />
            {filters.showExcluded ? '제외 환자' : '제외 목록'}
          </button>

          {/* 필터 토글 */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 border rounded-lg flex items-center gap-2 ${
              showFilters ? 'border-blue-500 text-blue-600' : 'border-gray-300 text-gray-700'
            }`}
          >
            <Filter className="w-4 h-4" />
            필터
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* 확장 필터 */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">등록일 (시작)</label>
              <input
                type="date"
                value={filters.dateFrom || ''}
                onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">등록일 (종료)</label>
              <input
                type="date"
                value={filters.dateTo || ''}
                onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            {filters.showExcluded && (
              <div>
                <label className="block text-sm text-gray-600 mb-1">제외 사유</label>
                <select
                  value={filters.excludeReason || 'all'}
                  onChange={(e) => onFiltersChange({ ...filters, excludeReason: e.target.value as RecallExcludeReason | 'all' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="all">전체</option>
                  <option value="family">친인척/가족</option>
                  <option value="unfavorable">비우호적</option>
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 제외 환자 보기 모드 배너 */}
      {filters.showExcluded && (
        <div className="p-3 bg-rose-50 border-b border-rose-100 flex items-center gap-2">
          <EyeOff className="w-4 h-4 text-rose-500" />
          <span className="text-sm text-rose-700 font-medium">
            리콜 제외 환자 목록을 보고 있습니다
          </span>
          <span className="text-xs text-rose-500">
            (이 환자들은 리콜 통계 및 대상에서 제외됩니다)
          </span>
        </div>
      )}

      {/* 선택 정보 및 액션 */}
      {selectedPatients.length > 0 && (
        <div className="p-4 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
          <span className="text-blue-700">
            {selectedPatients.length}명 선택됨
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onSelectAll(false)}
              className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
            >
              선택 해제
            </button>
          </div>
        </div>
      )}

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isPartiallySelected
                  }}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('patient_name')}
                  className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  환자 정보
                  {sortField === 'patient_name' && (
                    sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('status')}
                  className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  상태
                  {sortField === 'status' && (
                    sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('last_contact_date')}
                  className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  마지막 연락
                  {sortField === 'last_contact_date' && (
                    sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">리콜 시간</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">예약 정보</th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">액션</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    <span>로딩 중...</span>
                  </div>
                </td>
              </tr>
            ) : sortedPatients.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-2">
                    <User className="w-12 h-12 text-gray-300" />
                    <span>환자 목록이 없습니다.</span>
                  </div>
                </td>
              </tr>
            ) : (
              sortedPatients.map((patient) => (
                <tr
                  key={patient.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 ${
                    selectedPatients.includes(patient.id) ? 'bg-blue-50' : ''
                  }`}
                >
                  {/* 체크박스 */}
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedPatients.includes(patient.id)}
                      onChange={() => onSelectPatient(patient.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>

                  {/* 환자 정보 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                        <User className="w-5 h-5 text-gray-500" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">{patient.patient_name}</p>
                          {formatAgeGender(patient) && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                              {formatAgeGender(patient)}
                            </span>
                          )}
                          {patient.exclude_reason && (
                            <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${EXCLUDE_REASON_COLORS[patient.exclude_reason]}`}>
                              {patient.exclude_reason === 'family' ? <Heart className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
                              {EXCLUDE_REASON_LABELS[patient.exclude_reason]}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{displayPhoneNumber(patient.phone_number)}</p>
                        {patient.chart_number && (
                          <p className="text-xs text-gray-400">차트: {patient.chart_number}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 상태 - 버튼으로 표시 */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {MANUAL_STATUS_OPTIONS.map((status) => (
                        <button
                          key={status}
                          onClick={() => handleStatusChange(patient, status)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                            patient.status === status
                              ? `${RECALL_STATUS_COLORS[status]} ring-2 ring-offset-1 ring-current`
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {STATUS_ICONS[status]}
                          {RECALL_STATUS_LABELS[status]}
                        </button>
                      ))}
                      {/* 문자발송 상태는 자동으로만 설정됨 - 표시만 */}
                      {patient.status === 'sms_sent' && (
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ring-2 ring-offset-1 ring-current ${RECALL_STATUS_COLORS['sms_sent']}`}>
                          {STATUS_ICONS['sms_sent']}
                          {RECALL_STATUS_LABELS['sms_sent']}
                        </span>
                      )}
                    </div>
                    {patient.contact_count > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        연락 {patient.contact_count}회
                      </p>
                    )}
                  </td>

                  {/* 리콜 시간 */}
                  <td className="px-4 py-3">
                    {patient.recall_datetime ? (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-indigo-500" />
                        <div>
                          <p className="text-sm text-gray-900">
                            {new Date(patient.recall_datetime).toLocaleDateString('ko-KR', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                          <p className="text-xs text-indigo-600">
                            {new Date(patient.recall_datetime).toLocaleTimeString('ko-KR', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>

                  {/* 마지막 연락 */}
                  <td className="px-4 py-3">
                    {patient.last_contact_date ? (
                      <div>
                        <p className="text-sm text-gray-900">
                          {new Date(patient.last_contact_date).toLocaleDateString('ko-KR')}
                        </p>
                        <p className="text-xs text-gray-500">
                          {patient.last_contact_type === 'sms' ? '문자' : '전화'}
                        </p>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>

                  {/* 예약 정보 */}
                  <td className="px-4 py-3">
                    {patient.appointment_date ? (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-green-500" />
                        <div>
                          <p className="text-sm text-gray-900">{patient.appointment_date}</p>
                          {patient.appointment_time && (
                            <p className="text-xs text-gray-500">{patient.appointment_time}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>

                  {/* 액션 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {patient.exclude_reason ? (
                        /* 제외 환자: 전화 + 문자 + 이력 + 복원 */
                        <>
                          <button
                            onClick={() => onCallPatient(patient)}
                            title="전화 걸기"
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          >
                            <Phone className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => onSmsPatient(patient)}
                            title="문자 보내기"
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <MessageSquare className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => onViewHistory(patient)}
                            title="연락 이력"
                            className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <History className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => onExcludePatient(patient, null)}
                            title="리콜 대상으로 복원"
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            <Undo2 className="w-5 h-5" />
                          </button>
                        </>
                      ) : (
                        /* 일반 환자: 기존 액션 + 제외 버튼 */
                        <>
                          <button
                            onClick={() => onCallPatient(patient)}
                            title="전화 걸기"
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          >
                            <Phone className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => onSmsPatient(patient)}
                            title="문자 보내기"
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <MessageSquare className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => onViewHistory(patient)}
                            title="연락 이력"
                            className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <History className="w-5 h-5" />
                          </button>
                          {/* 제외 드롭다운 */}
                          <div className="relative group">
                            <button
                              title="리콜 제외"
                              className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <UserX className="w-5 h-5" />
                            </button>
                            <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-30 hidden group-hover:block">
                              <button
                                onClick={() => onExcludePatient(patient, 'family')}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-amber-50 flex items-center gap-2 text-gray-700"
                              >
                                <Heart className="w-4 h-4 text-amber-500" />
                                친인척/가족
                              </button>
                              <button
                                onClick={() => onExcludePatient(patient, 'unfavorable')}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-rose-50 flex items-center gap-2 text-gray-700"
                              >
                                <ShieldOff className="w-4 h-4 text-rose-500" />
                                비우호적
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div className="p-4 border-t border-gray-200 flex items-center justify-between">
        <span className="text-sm text-gray-600">
          총 {totalPatients}명 중 {patients.length}명 표시
        </span>

        {totalPages > 1 && onPageChange && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1">
              {/* 페이지 번호들 */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => {
                  // 현재 페이지 주변 2개씩, 첫/끝 페이지 표시
                  return page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 2
                })
                .map((page, index, arr) => {
                  // 생략 부호 표시
                  const showEllipsis = index > 0 && page - arr[index - 1] > 1

                  return (
                    <span key={page} className="flex items-center">
                      {showEllipsis && (
                        <span className="px-2 text-gray-400">...</span>
                      )}
                      <button
                        onClick={() => onPageChange(page)}
                        className={`min-w-[36px] h-9 px-3 rounded-lg text-sm font-medium transition-colors ${
                          page === currentPage
                            ? 'bg-indigo-600 text-white'
                            : 'border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    </span>
                  )
                })}
            </div>

            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
