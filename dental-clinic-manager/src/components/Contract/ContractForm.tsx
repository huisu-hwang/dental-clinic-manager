'use client'

/**
 * ContractForm Component
 * Form for creating new employment contracts with auto-fill functionality
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { contractService } from '@/lib/contractService'
import { workScheduleService } from '@/lib/workScheduleService'
import { convertWorkScheduleToContractData, formatDaySchedule } from '@/utils/workScheduleUtils'
import type { ContractFormData, ContractData } from '@/types/contract'
import type { User } from '@/types/auth'
import type { UserProfile } from '@/contexts/AuthContext'
import { formatResidentNumber } from '@/utils/residentNumberUtils'
import { decryptResidentNumber } from '@/utils/encryptionUtils'
import type { DaySchedule, WorkSchedule, DayName } from '@/types/workSchedule'

interface ContractFormProps {
  currentUser: UserProfile
  employees: User[]
  onSuccess?: (contractId: string) => void
  onCancel?: () => void
}

export default function ContractForm({ currentUser, employees, onSuccess, onCancel }: ContractFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null)
  const [formData, setFormData] = useState<Partial<ContractData>>({
    employment_period_start: new Date().toISOString().split('T')[0],
    salary_base: 0,
    salary_payment_day: 25,
    annual_leave_days: 15,
    social_insurance: true,
    health_insurance: true,
    employment_insurance: true,
    pension_insurance: true,
    is_permanent: true
  })

  // Debug logging for employees prop
  useEffect(() => {
    console.log('[ContractForm] Received employees prop:', employees)
    console.log('[ContractForm] Employee count:', employees?.length || 0)
    console.log('[ContractForm] Current user:', currentUser)
  }, [employees, currentUser])

  // Auto-fill when employee is selected
  useEffect(() => {
    const loadEmployeeData = async () => {
      if (selectedEmployee) {
        console.log('[ContractForm] Employee selected, loading data:', selectedEmployee.id)

        // 1. 주민번호 복호화
        console.log('[ContractForm] Decrypting resident number...')
        const decryptedResidentNumber = selectedEmployee.resident_registration_number
          ? await decryptResidentNumber(selectedEmployee.resident_registration_number)
          : ''

        if (!decryptedResidentNumber && selectedEmployee.resident_registration_number) {
          console.warn('[ContractForm] Failed to decrypt resident number')
        }

        // 2. 기본 직원 정보 자동 입력
        setFormData(prev => ({
          ...prev,
          employee_name: selectedEmployee.name,
          employee_address: selectedEmployee.address || '',
          employee_phone: selectedEmployee.phone || '',
          employee_resident_number: decryptedResidentNumber || ''
        }))

        // 2. 직원의 근무 스케줄 조회
        try {
          const workScheduleResult = await workScheduleService.getUserWorkSchedule(selectedEmployee.id)

          if (workScheduleResult.data) {
            console.log('[ContractForm] Work schedule loaded:', workScheduleResult.data)

            // 3. 근무 스케줄을 근로계약서 형식으로 변환
            const contractWorkData = convertWorkScheduleToContractData(workScheduleResult.data)

            console.log('[ContractForm] Auto-filling work hours from schedule:', contractWorkData)

            // 4. 근로시간 필드에 자동 입력
            setFormData(prev => ({
              ...prev,
              work_start_time: contractWorkData.work_start_time,
              work_end_time: contractWorkData.work_end_time,
              work_days_per_week: contractWorkData.work_days_per_week,
              work_hours_detail: contractWorkData.work_hours_detail
            }))
          } else {
            console.warn('[ContractForm] No work schedule found for employee:', workScheduleResult.error)
          }
        } catch (error) {
          console.error('[ContractForm] Error loading work schedule:', error)
        }
      }
    }

    loadEmployeeData()
  }, [selectedEmployee])

  const handleEmployeeSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const employeeId = e.target.value
    const employee = employees.find(emp => emp.id === employeeId)
    setSelectedEmployee(employee || null)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target

    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked
      setFormData(prev => ({ ...prev, [name]: checked }))
    } else if (type === 'number') {
      setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  // 주당 근무일수 계산
  const calculateWorkDaysPerWeek = useCallback((schedule: WorkSchedule): number => {
    return Object.values(schedule).filter(day => day.isWorking).length
  }, [])

  // 요일별 근무 여부 토글
  const handleDayWorkingToggle = (dayKey: DayName, isWorking: boolean) => {
    setFormData(prev => {
      const currentSchedule = prev.work_hours_detail as WorkSchedule
      const updatedSchedule: WorkSchedule = {
        ...currentSchedule,
        [dayKey]: {
          ...currentSchedule[dayKey],
          isWorking,
          // 근무 안 함으로 변경 시 시간도 초기화
          ...(isWorking ? {} : { start: null, end: null, breakStart: null, breakEnd: null })
        }
      }
      return {
        ...prev,
        work_hours_detail: updatedSchedule,
        work_days_per_week: calculateWorkDaysPerWeek(updatedSchedule)
      }
    })
  }

  // 요일별 시간 변경
  const handleDayTimeChange = (dayKey: DayName, field: keyof DaySchedule, value: string) => {
    setFormData(prev => {
      const currentSchedule = prev.work_hours_detail as WorkSchedule
      const updatedSchedule: WorkSchedule = {
        ...currentSchedule,
        [dayKey]: {
          ...currentSchedule[dayKey],
          [field]: value || null
        }
      }
      return {
        ...prev,
        work_hours_detail: updatedSchedule
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedEmployee) {
      alert('직원을 선택해주세요.')
      return
    }

    if (!formData.employment_period_start || !formData.salary_base) {
      alert('필수 항목을 입력해주세요.')
      return
    }

    setLoading(true)

    try {
      const contractFormData: ContractFormData = {
        employee_user_id: selectedEmployee.id,
        template_id: undefined, // Will use default template
        contract_data: formData as ContractData
      }

      const response = await contractService.createContract(contractFormData, currentUser.id)

      if (response.success && response.contract) {
        alert('근로계약서가 성공적으로 생성되었습니다.')
        if (onSuccess) {
          onSuccess(response.contract.id)
        } else {
          router.push(`/dashboard/contracts/${response.contract.id}`)
        }
      } else {
        alert(`오류: ${response.error}`)
      }
    } catch (error) {
      console.error('Failed to create contract:', error)
      alert('근로계약서 생성 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6">근로계약서 작성</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Employee Selection */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            직원 선택 <span className="text-red-500">*</span>
          </label>
          <select
            onChange={handleEmployeeSelect}
            value={selectedEmployee?.id || ''}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">-- 직원을 선택하세요 --</option>
            {employees.map(employee => (
              <option key={employee.id} value={employee.id}>
                {employee.name} ({employee.email})
              </option>
            ))}
          </select>
          {selectedEmployee && (
            <p className="mt-2 text-sm text-gray-600">
              선택된 직원의 정보가 자동으로 입력됩니다.
            </p>
          )}
        </div>

        {/* Employee Information (Auto-filled) */}
        {selectedEmployee && (
          <div className="border border-gray-200 p-4 rounded-lg bg-gray-50">
            <h3 className="text-lg font-semibold mb-3">근로자 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">성명</label>
                <input
                  type="text"
                  value={formData.employee_name || ''}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">주민등록번호</label>
                <input
                  type="text"
                  value={formatResidentNumber(formData.employee_resident_number || '')}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                <input
                  type="text"
                  value={formData.employee_phone || ''}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
                <input
                  type="text"
                  value={formData.employee_address || ''}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* Contract Period */}
        <div className="border border-gray-200 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-3">근로 기간</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                시작일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="employment_period_start"
                value={formData.employment_period_start || ''}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
              <input
                type="date"
                name="employment_period_end"
                value={formData.employment_period_end || ''}
                onChange={handleInputChange}
                disabled={formData.is_permanent}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              />
            </div>
          </div>
          <div className="mt-2">
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                name="is_permanent"
                checked={formData.is_permanent || false}
                onChange={handleInputChange}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">무기한 계약 (종료일 없음)</span>
            </label>
          </div>
        </div>

        {/* Salary Information */}
        <div className="border border-gray-200 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-3">급여 정보</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                기본급 (월) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="salary_base"
                value={formData.salary_base || ''}
                onChange={handleInputChange}
                required
                min="0"
                step="10000"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">급여 지급일</label>
              <input
                type="number"
                name="salary_payment_day"
                value={formData.salary_payment_day || 25}
                onChange={handleInputChange}
                min="1"
                max="31"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Allowances */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">식대</label>
              <input
                type="number"
                name="allowance_meal"
                value={formData.allowance_meal || ''}
                onChange={handleInputChange}
                min="0"
                step="10000"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">교통비</label>
              <input
                type="number"
                name="allowance_transport"
                value={formData.allowance_transport || ''}
                onChange={handleInputChange}
                min="0"
                step="10000"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">기타 수당</label>
              <input
                type="number"
                name="allowance_other"
                value={formData.allowance_other || ''}
                onChange={handleInputChange}
                min="0"
                step="10000"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Work Schedule */}
        <div className="border border-gray-200 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-3">근무 스케줄</h3>
          {selectedEmployee && formData.work_hours_detail ? (
            <>
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">{selectedEmployee.name}</span>님의 개인 근무 스케줄이 자동으로 반영되었습니다.
                  필요시 아래에서 수정할 수 있습니다.
                  (주 <span className="font-semibold">{formData.work_days_per_week || 0}일</span> 근무)
                </p>
              </div>

              {/* 요일별 스케줄 수정 가능 */}
              <div className="space-y-3">
                {[
                  { key: 'monday' as DayName, label: '월요일' },
                  { key: 'tuesday' as DayName, label: '화요일' },
                  { key: 'wednesday' as DayName, label: '수요일' },
                  { key: 'thursday' as DayName, label: '목요일' },
                  { key: 'friday' as DayName, label: '금요일' },
                  { key: 'saturday' as DayName, label: '토요일' },
                  { key: 'sunday' as DayName, label: '일요일' },
                ].map(({ key, label }) => {
                  const daySchedule = formData.work_hours_detail?.[key]
                  const isWorking = daySchedule?.isWorking ?? false
                  return (
                    <div key={key} className={`p-3 rounded-md border ${isWorking ? 'bg-white border-gray-300' : 'bg-gray-100 border-gray-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isWorking}
                            onChange={(e) => handleDayWorkingToggle(key, e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                          />
                          <span className={`font-medium ${isWorking ? 'text-gray-900' : 'text-gray-500'}`}>
                            {label}
                          </span>
                        </label>
                        {!isWorking && (
                          <span className="text-sm text-gray-500">휴무</span>
                        )}
                      </div>

                      {isWorking && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">시작</label>
                            <input
                              type="time"
                              value={daySchedule?.start || ''}
                              onChange={(e) => handleDayTimeChange(key, 'start', e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">종료</label>
                            <input
                              type="time"
                              value={daySchedule?.end || ''}
                              onChange={(e) => handleDayTimeChange(key, 'end', e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">휴게 시작</label>
                            <input
                              type="time"
                              value={daySchedule?.breakStart || ''}
                              onChange={(e) => handleDayTimeChange(key, 'breakStart', e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">휴게 종료</label>
                            <input
                              type="time"
                              value={daySchedule?.breakEnd || ''}
                              onChange={(e) => handleDayTimeChange(key, 'breakEnd', e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* 연차 휴가일수 */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">연차 휴가일수</label>
                <input
                  type="number"
                  name="annual_leave_days"
                  value={formData.annual_leave_days || 15}
                  onChange={handleInputChange}
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          ) : (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                직원을 선택하면 근무 스케줄이 자동으로 표시됩니다.
              </p>
            </div>
          )}
        </div>

        {/* Social Insurance */}
        <div className="border border-gray-200 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-3">4대보험 가입</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                name="social_insurance"
                checked={formData.social_insurance || false}
                onChange={handleInputChange}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm">국민연금</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                name="health_insurance"
                checked={formData.health_insurance || false}
                onChange={handleInputChange}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm">건강보험</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                name="employment_insurance"
                checked={formData.employment_insurance || false}
                onChange={handleInputChange}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm">고용보험</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                name="pension_insurance"
                checked={formData.pension_insurance || false}
                onChange={handleInputChange}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm">산재보험</span>
            </label>
          </div>
        </div>

        {/* Additional Notes */}
        <div className="border border-gray-200 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-3">특약 사항</h3>
          <textarea
            name="special_terms"
            value={formData.special_terms || ''}
            onChange={handleInputChange}
            rows={4}
            placeholder="특별한 근로 조건이나 약정 사항을 입력하세요."
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={loading || !selectedEmployee}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {loading ? '생성 중...' : '근로계약서 생성'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              취소
            </button>
          )}
        </div>
      </form>

      {/* Info Notice */}
      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          <span className="font-semibold">📝 안내:</span> 근로계약서 생성 후 원장과 근로자가 각각 서명해야 계약이 완료됩니다.
        </p>
      </div>
    </div>
  )
}
