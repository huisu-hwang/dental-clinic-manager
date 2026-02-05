'use client'

import { useState, useEffect } from 'react'
import { Calendar, AlertCircle, X, AlertTriangle } from 'lucide-react'
import { leaveService, getClinicWorkingDays, calculateWorkingDaysBetween } from '@/lib/leaveService'
import type { LeaveType, EmployeeLeaveBalance, HalfDayType } from '@/types/leave'

interface LeaveRequestFormProps {
  leaveTypes: LeaveType[]
  balance: EmployeeLeaveBalance | null
  existingRequests: any[] // 기존 연차 신청 목록 (중복 체크용)
  onSuccess: () => void
  onCancel: () => void
}

export default function LeaveRequestForm({
  leaveTypes,
  balance,
  existingRequests,
  onSuccess,
  onCancel,
}: LeaveRequestFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showUnpaidConfirm, setShowUnpaidConfirm] = useState(false)
  const [unpaidDays, setUnpaidDays] = useState(0)
  const [clinicWorkingDays, setClinicWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]) // 기본값: 월~금

  const [formData, setFormData] = useState({
    leave_type_id: '',
    start_date: '',
    end_date: '',
    half_day_type: '' as HalfDayType | '',
    reason: '',
    emergency: false,
  })

  // 병원 근무일 정보 로드
  useEffect(() => {
    const loadClinicWorkingDays = async () => {
      const result = await getClinicWorkingDays()
      if (result.data && result.data.length > 0) {
        setClinicWorkingDays(result.data)
      }
    }
    loadClinicWorkingDays()
  }, [])

  // 선택된 연차 종류
  const selectedType = leaveTypes.find(t => t.id === formData.leave_type_id)

  // 무급휴가 종류 찾기
  const unpaidLeaveType = leaveTypes.find(t => t.code === 'unpaid')

  // 총 신청 일수 계산 (병원 근무일 기준)
  const calculateTotalDays = (): number => {
    if (!formData.start_date || !formData.end_date) return 0

    const start = new Date(formData.start_date)
    const end = new Date(formData.end_date)

    // 날짜 유효성 검사
    if (end < start) return 0

    // 반차인 경우 0.5일
    if (selectedType?.code === 'half_day' || formData.half_day_type) {
      return 0.5
    }

    // 병원 근무일 기준 일수 계산
    const days = calculateWorkingDaysBetween(start, end, clinicWorkingDays)

    return days * (selectedType?.deduct_days || 1)
  }

  const totalDays = calculateTotalDays()

  // 폼이 제출 가능한 상태인지 확인
  const canSubmit = formData.leave_type_id && formData.start_date && formData.end_date

  // 기존 연차 신청과 날짜 중복 체크
  const checkDateOverlap = (): { isOverlapping: boolean; overlappingRequest: any | null } => {
    if (!formData.start_date || !formData.end_date) {
      return { isOverlapping: false, overlappingRequest: null }
    }

    const newStart = new Date(formData.start_date)
    const newEnd = new Date(selectedType?.code === 'half_day' ? formData.start_date : formData.end_date)

    // 승인 대기 중이거나 승인된 신청만 체크 (취소/반려된 건은 제외)
    const activeRequests = existingRequests.filter(
      req => req.status === 'pending' || req.status === 'approved'
    )

    for (const req of activeRequests) {
      const existingStart = new Date(req.start_date)
      const existingEnd = new Date(req.end_date)

      // 날짜 범위가 겹치는지 확인
      const isOverlapping = (newStart <= existingEnd && newEnd >= existingStart)

      if (isOverlapping) {
        return { isOverlapping: true, overlappingRequest: req }
      }
    }

    return { isOverlapping: false, overlappingRequest: null }
  }

  // 실제 연차 신청 처리
  const submitRequest = async (useUnpaidForExcess = false) => {
    setLoading(true)
    setShowUnpaidConfirm(false)

    try {
      const remainingDays = balance?.remaining_days ?? 0

      if (useUnpaidForExcess && unpaidDays > 0 && unpaidLeaveType) {
        // 잔여 연차만큼 연차로 신청
        if (remainingDays > 0) {
          const annualResult = await leaveService.createRequest({
            leave_type_id: formData.leave_type_id,
            start_date: formData.start_date,
            end_date: formData.end_date,
            half_day_type: formData.half_day_type || undefined,
            total_days: remainingDays,
            reason: formData.reason || undefined,
            emergency: formData.emergency,
            user_id: '',
            clinic_id: '',
          })

          if (annualResult.error) {
            setError(annualResult.error)
            setLoading(false)
            return
          }
        }

        // 초과분은 무급휴가로 신청 (연차 증가 시 자동 전환 가능하도록 [CONVERTIBLE] 태그 추가)
        const unpaidResult = await leaveService.createRequest({
          leave_type_id: unpaidLeaveType.id,
          start_date: formData.start_date,
          end_date: formData.end_date,
          half_day_type: formData.half_day_type || undefined,
          total_days: unpaidDays,
          reason: `[CONVERTIBLE][무급휴가] ${formData.reason || '연차 초과분'}`,
          emergency: formData.emergency,
          user_id: '',
          clinic_id: '',
        })

        if (unpaidResult.error) {
          setError(unpaidResult.error)
        } else {
          onSuccess()
        }
      } else {
        // 일반 연차 신청
        const result = await leaveService.createRequest({
          leave_type_id: formData.leave_type_id,
          start_date: formData.start_date,
          end_date: selectedType?.code === 'half_day' ? formData.start_date : formData.end_date,
          half_day_type: formData.half_day_type || undefined,
          total_days: totalDays,
          reason: formData.reason || undefined,
          emergency: formData.emergency,
          user_id: '',
          clinic_id: '',
        })

        if (result.error) {
          setError(result.error)
        } else {
          onSuccess()
        }
      }
    } catch (err) {
      console.error('Error creating leave request:', err)
      setError('연차 신청 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // 유효성 검사
    if (!formData.leave_type_id) {
      setError('연차 종류를 선택해주세요.')
      return
    }
    if (!formData.start_date) {
      setError('시작일을 선택해주세요.')
      return
    }
    if (!formData.end_date) {
      setError('종료일을 선택해주세요.')
      return
    }
    if (new Date(formData.end_date) < new Date(formData.start_date)) {
      setError('종료일은 시작일 이후여야 합니다.')
      return
    }

    if (totalDays === 0) {
      setError('선택한 기간에 병원 근무일이 없습니다. 날짜를 다시 확인해주세요.')
      return
    }

    // 반차인 경우 오전/오후 선택 확인
    if (selectedType?.code === 'half_day' && !formData.half_day_type) {
      setError('오전/오후를 선택해주세요.')
      return
    }

    // 날짜 중복 체크
    const { isOverlapping, overlappingRequest } = checkDateOverlap()
    if (isOverlapping && overlappingRequest) {
      const existingStart = new Date(overlappingRequest.start_date).toLocaleDateString('ko-KR')
      const existingEnd = new Date(overlappingRequest.end_date).toLocaleDateString('ko-KR')
      const typeName = overlappingRequest.leave_types?.name || '연차'
      setError(`이미 신청된 ${typeName}(${existingStart} ~ ${existingEnd})와 날짜가 겹칩니다. 날짜를 조정해주세요.`)
      return
    }

    // 잔여 연차 확인 (연차 차감 대상인 경우만)
    if (selectedType?.deduct_from_annual && balance) {
      const remainingDays = balance.remaining_days

      if (totalDays > remainingDays) {
        const excess = totalDays - remainingDays
        setUnpaidDays(excess)

        if (unpaidLeaveType) {
          // 무급휴가 옵션 있으면 확인 모달 표시
          setShowUnpaidConfirm(true)
          return
        } else {
          setError(`잔여 연차가 부족합니다. (잔여: ${remainingDays}일, 신청: ${totalDays}일)`)
          return
        }
      }
    }

    // 신청 진행
    await submitRequest(false)
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600">
            <Calendar className="w-4 h-4" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">연차 신청</h3>
        </div>
        <button
          onClick={onCancel}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 잔여 연차 안내 */}
      {balance && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">잔여 연차</span>
            <span className="font-semibold text-blue-600">{balance.remaining_days}일</span>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm flex items-center">
          <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* 무급휴가 확인 모달 팝업 */}
      {showUnpaidConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">잔여 연차가 부족합니다</h3>
            </div>

            <div className="bg-amber-50 rounded-lg p-4 mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-600">신청 일수</span>
                <span className="font-semibold text-slate-800">{totalDays}일</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-600">잔여 연차</span>
                <span className="font-semibold text-blue-600">{balance?.remaining_days ?? 0}일</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-amber-200">
                <span className="text-slate-600">부족한 일수</span>
                <span className="font-semibold text-amber-600">{unpaidDays}일</span>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              부족한 <span className="font-semibold text-amber-600">{unpaidDays}일</span>을 무급휴가로 신청하시겠습니까?
            </p>

            <div className="bg-blue-50 rounded-lg p-3 mb-6 border border-blue-100">
              <p className="text-xs text-blue-700">
                <span className="font-semibold">💡 안내:</span> 1년 미만 근무자의 경우, 매월 만근 시 연차가 1일씩 증가합니다.
                연차가 증가하면 무급휴가로 신청한 일수가 <span className="font-semibold">자동으로 유급휴가(연차)로 전환</span>됩니다.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowUnpaidConfirm(false)
                  setUnpaidDays(0)
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => submitRequest(true)}
                disabled={loading}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '처리 중...' : '무급휴가로 신청'}
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 연차 종류 선택 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            연차 종류 *
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {leaveTypes.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => setFormData({ ...formData, leave_type_id: type.id, half_day_type: '' })}
                className={`p-3 border rounded-lg text-left transition-all ${
                  formData.leave_type_id === type.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: type.color }}
                  />
                  <span className="font-medium text-sm">{type.name}</span>
                </div>
                {type.description && (
                  <p className="text-xs text-slate-500 mt-1">{type.description}</p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 날짜 선택 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              시작일 *
            </label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => {
                const newStartDate = e.target.value
                setFormData({
                  ...formData,
                  start_date: newStartDate,
                  // 반차이거나 종료일이 비어있거나 시작일보다 이전이면 시작일로 자동 설정
                  end_date: selectedType?.code === 'half_day' || !formData.end_date || formData.end_date < newStartDate
                    ? newStartDate
                    : formData.end_date,
                })
              }}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {selectedType?.code !== 'half_day' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                종료일 *
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                min={formData.start_date || new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          )}
        </div>

        {/* 반차 타입 선택 */}
        {selectedType?.code === 'half_day' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              오전/오후 선택 *
            </label>
            <div className="flex space-x-4">
              {(['AM', 'PM'] as HalfDayType[]).map((type) => (
                <label key={type} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="half_day_type"
                    value={type}
                    checked={formData.half_day_type === type}
                    onChange={(e) => setFormData({ ...formData, half_day_type: e.target.value as HalfDayType })}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm">{type === 'AM' ? '오전 반차' : '오후 반차'}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 신청 일수 표시 */}
        {formData.start_date && formData.end_date && (
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">신청 일수</span>
              <span className="text-lg font-semibold text-slate-800">
                {totalDays > 0 ? `${totalDays}일` : '0일'}
              </span>
            </div>
            {totalDays > 0 && selectedType?.deduct_from_annual && (
              <p className="text-xs text-slate-500 mt-1">
                * 연차에서 차감됩니다
              </p>
            )}
            {totalDays === 0 && selectedType?.code !== 'half_day' && (
              <p className="text-xs text-amber-600 mt-1">
                * 선택한 기간에 병원 근무일이 없습니다
              </p>
            )}
          </div>
        )}

        {/* 사유 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            신청 사유
            {selectedType?.requires_proof && <span className="text-red-500 ml-1">*</span>}
          </label>
          <textarea
            value={formData.reason}
            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="연차 사유를 입력해주세요"
            required={selectedType?.requires_proof}
          />
          {selectedType?.proof_description && (
            <p className="mt-1 text-xs text-amber-600">
              * {selectedType.proof_description} 필요
            </p>
          )}
        </div>

        {/* 긴급 여부 */}
        <div>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.emergency}
              onChange={(e) => setFormData({ ...formData, emergency: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-slate-700">긴급 신청</span>
          </label>
          <p className="text-xs text-slate-500 mt-1 ml-6">
            긴급한 경우 체크하면 승인자에게 알림이 발송됩니다
          </p>
        </div>

        {/* 버튼 */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '신청 중...' : '연차 신청'}
          </button>
        </div>
      </form>
    </div>
  )
}
