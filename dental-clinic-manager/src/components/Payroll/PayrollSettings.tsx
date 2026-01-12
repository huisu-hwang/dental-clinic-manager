'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { PayrollFormState, SalaryType } from '@/types/payroll'
import { DEFAULT_PAYROLL_FORM_STATE } from '@/types/payroll'
import {
  getEmployeesForPayroll,
  getEmployeeContract,
  extractSalaryInfoFromContract,
  getEstimatedInsurance
} from '@/lib/payrollService'
import { formatCurrency } from '@/utils/taxCalculationUtils'
import { Save, RefreshCw, Check, AlertCircle } from 'lucide-react'

interface Employee {
  id: string
  name: string
  email: string
  role: string
  hire_date?: string
  resident_registration_number?: string
  hasContract: boolean
}

interface SalarySetting {
  employeeId: string
  salaryType: SalaryType
  targetAmount: number
  baseSalary: number
  mealAllowance: number
  vehicleAllowance: number
  bonus: number
  nationalPension: number
  healthInsurance: number
  longTermCare: number
  employmentInsurance: number
  familyCount: number
  childCount: number
  otherDeductions: number
  // 근태 차감/수당 옵션
  deductLateMinutes: boolean
  deductEarlyLeaveMinutes: boolean
  includeOvertimePay: boolean
}

export default function PayrollSettings() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [formState, setFormState] = useState<PayrollFormState>(DEFAULT_PAYROLL_FORM_STATE)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loadingEmployee, setLoadingEmployee] = useState(false)
  const [savedSettings, setSavedSettings] = useState<Record<string, SalarySetting>>({})

  // 근태 차감/수당 옵션 상태
  const [deductLateMinutes, setDeductLateMinutes] = useState(true)
  const [deductEarlyLeaveMinutes, setDeductEarlyLeaveMinutes] = useState(true)
  const [includeOvertimePay, setIncludeOvertimePay] = useState(true)

  // 적용 범위 선택 상태
  const [applyToPast, setApplyToPast] = useState(false)
  const applyToPastRef = useRef(applyToPast)

  // applyToPast 상태 변경 추적 및 ref 동기화
  useEffect(() => {
    console.log('[PayrollSettings] applyToPast state changed to:', applyToPast)
    applyToPastRef.current = applyToPast
  }, [applyToPast])

  // 직원 목록 로드
  useEffect(() => {
    async function loadEmployees() {
      if (!user?.clinic_id) return

      setLoading(true)
      try {
        const data = await getEmployeesForPayroll(user.clinic_id)
        setEmployees(data)

        // 저장된 설정 로드
        await loadSavedSettings(user.clinic_id)
      } catch (error) {
        console.error('Error loading employees:', error)
      } finally {
        setLoading(false)
      }
    }

    loadEmployees()
  }, [user?.clinic_id])

  // 저장된 급여 설정 로드
  async function loadSavedSettings(clinicId: string) {
    try {
      const response = await fetch(`/api/payroll/settings?clinicId=${clinicId}`)
      const result = await response.json()

      if (result.success && result.data) {
        const settings: Record<string, SalarySetting> = {}
        result.data.forEach((item: any) => {
          settings[item.employee_user_id] = {
            employeeId: item.employee_user_id,
            salaryType: item.salary_type || 'net',
            targetAmount: item.target_amount || 0,
            baseSalary: item.base_salary || 0,
            mealAllowance: item.meal_allowance || 0,
            vehicleAllowance: item.vehicle_allowance || 0,
            bonus: item.bonus || 0,
            nationalPension: item.national_pension || 0,
            healthInsurance: item.health_insurance || 0,
            longTermCare: item.long_term_care || 0,
            employmentInsurance: item.employment_insurance || 0,
            familyCount: item.family_count || 1,
            childCount: item.child_count || 0,
            otherDeductions: item.other_deductions || 0,
            // 근태 차감/수당 옵션 (기본값: true)
            deductLateMinutes: item.deduct_late_minutes !== false,
            deductEarlyLeaveMinutes: item.deduct_early_leave_minutes !== false,
            includeOvertimePay: item.include_overtime_pay !== false
          }
        })
        setSavedSettings(settings)
      }
    } catch (error) {
      console.error('Error loading salary settings:', error)
    }
  }

  // 직원 선택 시 메시지 초기화
  useEffect(() => {
    setSaveMessage(null)
  }, [selectedEmployeeId])

  // 직원 선택 시 설정 로드
  useEffect(() => {
    async function loadEmployeeSettings() {
      if (!selectedEmployeeId || !user?.clinic_id) {
        setFormState(DEFAULT_PAYROLL_FORM_STATE)
        return
      }

      setLoadingEmployee(true)

      try {
        // 1. 저장된 설정이 있으면 사용
        if (savedSettings[selectedEmployeeId]) {
          const settings = savedSettings[selectedEmployeeId]
          setFormState(prev => ({
            ...prev,
            salaryType: settings.salaryType,
            targetAmount: settings.targetAmount,
            baseSalary: settings.baseSalary,
            mealAllowance: settings.mealAllowance,
            vehicleAllowance: settings.vehicleAllowance,
            bonus: settings.bonus,
            nationalPension: settings.nationalPension,
            healthInsurance: settings.healthInsurance,
            longTermCare: settings.longTermCare,
            employmentInsurance: settings.employmentInsurance,
            familyCount: settings.familyCount,
            childCount: settings.childCount,
            otherDeductions: settings.otherDeductions
          }))
          // 근태 차감/수당 옵션 설정
          setDeductLateMinutes(settings.deductLateMinutes)
          setDeductEarlyLeaveMinutes(settings.deductEarlyLeaveMinutes)
          setIncludeOvertimePay(settings.includeOvertimePay)
        } else {
          // 2. 계약서에서 정보 추출
          const employee = employees.find(e => e.id === selectedEmployeeId)
          const contract = await getEmployeeContract(selectedEmployeeId, user.clinic_id)

          if (contract && employee) {
            const salaryInfo = extractSalaryInfoFromContract(contract, {
              id: employee.id,
              name: employee.name,
              resident_registration_number: employee.resident_registration_number,
              hire_date: employee.hire_date
            })

            const estimatedInsurance = getEstimatedInsurance(salaryInfo.baseSalary)

            setFormState(prev => ({
              ...prev,
              salaryType: salaryInfo.salaryType,
              targetAmount: salaryInfo.baseSalary,
              baseSalary: salaryInfo.baseSalary,
              mealAllowance: salaryInfo.mealAllowance || 200000,
              nationalPension: estimatedInsurance.nationalPension,
              healthInsurance: estimatedInsurance.healthInsurance,
              longTermCare: estimatedInsurance.longTermCare,
              employmentInsurance: estimatedInsurance.employmentInsurance,
              familyCount: salaryInfo.familyCount,
              childCount: salaryInfo.childCount
            }))
          } else {
            setFormState({
              ...DEFAULT_PAYROLL_FORM_STATE,
              mealAllowance: 200000
            })
          }
          // 저장된 설정이 없으면 기본값으로 리셋
          setDeductLateMinutes(true)
          setDeductEarlyLeaveMinutes(true)
          setIncludeOvertimePay(true)
        }
      } catch (error) {
        console.error('Error loading employee settings:', error)
      } finally {
        setLoadingEmployee(false)
      }
    }

    loadEmployeeSettings()
  }, [selectedEmployeeId, user?.clinic_id, employees, savedSettings])

  // 폼 필드 변경 핸들러
  const handleFieldChange = (field: keyof PayrollFormState, value: any) => {
    setFormState(prev => ({ ...prev, [field]: value }))
    setSaveMessage(null)
  }

  // 급여 유형 변경 핸들러
  const handleSalaryTypeChange = (type: SalaryType) => {
    setFormState(prev => ({
      ...prev,
      salaryType: type
    }))
  }

  // 4대보험 재계산
  const handleRecalculateInsurance = () => {
    const baseAmount = formState.salaryType === 'net'
      ? formState.targetAmount
      : formState.baseSalary

    const estimated = getEstimatedInsurance(baseAmount + formState.mealAllowance)

    setFormState(prev => ({
      ...prev,
      nationalPension: estimated.nationalPension,
      healthInsurance: estimated.healthInsurance,
      longTermCare: estimated.longTermCare,
      employmentInsurance: estimated.employmentInsurance
    }))
  }

  // 설정 저장
  const handleSave = async () => {
    // Use ref value to ensure we get the latest state
    const currentApplyToPast = applyToPastRef.current
    console.log('[PayrollSettings] handleSave called, applyToPast state:', applyToPast, 'ref:', currentApplyToPast)

    if (!selectedEmployeeId || !user?.clinic_id) {
      setSaveMessage({ type: 'error', text: '직원을 선택해주세요.' })
      return
    }

    setSaving(true)
    setSaveMessage(null)

    try {
      const requestBody = {
        clinicId: user.clinic_id,
        employeeId: selectedEmployeeId,
        salaryType: formState.salaryType,
        targetAmount: formState.targetAmount,
        baseSalary: formState.baseSalary,
        mealAllowance: formState.mealAllowance,
        vehicleAllowance: formState.vehicleAllowance,
        bonus: formState.bonus,
        nationalPension: formState.nationalPension,
        healthInsurance: formState.healthInsurance,
        longTermCare: formState.longTermCare,
        employmentInsurance: formState.employmentInsurance,
        familyCount: formState.familyCount,
        childCount: formState.childCount,
        otherDeductions: formState.otherDeductions,
        // 근태 차감/수당 옵션
        deductLateMinutes,
        deductEarlyLeaveMinutes,
        includeOvertimePay,
        // 적용 범위 옵션 - use ref for latest value
        applyToPast: currentApplyToPast,
        updatedBy: user.id
      }

      console.log('[PayrollSettings] Saving with applyToPast:', currentApplyToPast, 'requestBody:', requestBody)

      const response = await fetch('/api/payroll/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      const result = await response.json()
      console.log('[PayrollSettings] API response:', result)

      if (result.success) {
        let message = '설정이 저장되었습니다.'
        if (currentApplyToPast && result.updatedStatementsCount > 0) {
          message = `설정이 저장되었습니다. ${result.updatedStatementsCount}개의 과거 급여명세서가 업데이트되었습니다.`
        } else if (currentApplyToPast) {
          message = '설정이 저장되었습니다. 업데이트할 과거 급여명세서가 없습니다.'
        }
        setSaveMessage({ type: 'success', text: message })
        // 3초 후 성공 메시지 자동 숨기기
        setTimeout(() => {
          setSaveMessage(null)
        }, 3000)
        // 저장 후 applyToPast 초기화 (다음 저장 시 다시 선택하도록)
        setApplyToPast(false)
        // 저장된 설정 업데이트
        setSavedSettings(prev => ({
          ...prev,
          [selectedEmployeeId]: {
            employeeId: selectedEmployeeId,
            salaryType: formState.salaryType,
            targetAmount: formState.targetAmount,
            baseSalary: formState.baseSalary,
            mealAllowance: formState.mealAllowance,
            vehicleAllowance: formState.vehicleAllowance,
            bonus: formState.bonus,
            nationalPension: formState.nationalPension,
            healthInsurance: formState.healthInsurance,
            longTermCare: formState.longTermCare,
            employmentInsurance: formState.employmentInsurance,
            familyCount: formState.familyCount,
            childCount: formState.childCount,
            otherDeductions: formState.otherDeductions,
            // 근태 차감/수당 옵션
            deductLateMinutes,
            deductEarlyLeaveMinutes,
            includeOvertimePay
          }
        }))
      } else {
        setSaveMessage({ type: 'error', text: result.error || '저장에 실패했습니다.' })
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      setSaveMessage({ type: 'error', text: '저장 중 오류가 발생했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId)
  const hasSavedSetting = selectedEmployeeId ? !!savedSettings[selectedEmployeeId] : false

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 안내 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-800 mb-2 flex items-center">
          <AlertCircle className="w-4 h-4 mr-2" />
          급여 설정 안내
        </h4>
        <ul className="list-disc list-inside text-blue-700 text-sm space-y-1">
          <li>직원별 급여 기본 설정을 저장하면 매월 급여명세서가 자동으로 생성됩니다.</li>
          <li>4대보험료는 매년 1월에 결정되어 연말까지 유지됩니다.</li>
          <li>설정 변경 시 다음 달 명세서부터 반영됩니다.</li>
        </ul>
      </div>

      {/* 직원 선택 */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">직원 선택</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              직원 <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedEmployeeId || ''}
              onChange={(e) => setSelectedEmployeeId(e.target.value || null)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">직원을 선택하세요</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                  {savedSettings[emp.id] ? ' ✓ (설정됨)' : emp.hasContract ? ' (계약서 있음)' : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedEmployee && (
            <div className="flex items-center">
              {hasSavedSetting ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-700">
                  <Check className="w-4 h-4 mr-1" />
                  급여 설정 완료
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-amber-100 text-amber-700">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  급여 설정 필요
                </span>
              )}
            </div>
          )}
        </div>

        {loadingEmployee && (
          <div className="mt-4 text-sm text-emerald-600">
            직원 정보를 불러오는 중...
          </div>
        )}
      </div>

      {/* 급여 설정 폼 */}
      {selectedEmployeeId && !loadingEmployee && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">
            급여 설정 - {selectedEmployee?.name}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 왼쪽: 지급 항목 */}
            <div className="space-y-4">
              <h4 className="font-medium text-slate-700 border-b pb-2">지급 항목</h4>

              {/* 급여 유형 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">급여 유형</label>
                <div className="flex space-x-4 mt-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="salaryType"
                      checked={formState.salaryType === 'net'}
                      onChange={() => handleSalaryTypeChange('net')}
                      className="mr-2"
                    />
                    <span className="text-sm">세후 (실수령액 기준)</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="salaryType"
                      checked={formState.salaryType === 'gross'}
                      onChange={() => handleSalaryTypeChange('gross')}
                      className="mr-2"
                    />
                    <span className="text-sm">세전</span>
                  </label>
                </div>
              </div>

              {/* 목표 금액 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {formState.salaryType === 'net' ? '목표 실수령액' : '기본급'} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={(formState.salaryType === 'net' ? formState.targetAmount : formState.baseSalary) || ''}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0
                      if (formState.salaryType === 'net') {
                        handleFieldChange('targetAmount', value)
                      } else {
                        handleFieldChange('baseSalary', value)
                      }
                    }}
                    className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                    placeholder="금액을 입력하세요"
                  />
                  <span className="absolute right-3 top-2 text-slate-500">원</span>
                </div>
              </div>

              {/* 상여 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">상여 (월정액)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={formState.bonus || ''}
                    onChange={(e) => handleFieldChange('bonus', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2 text-slate-500">원</span>
                </div>
              </div>

              {/* 식대 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  식대 <span className="text-xs text-green-600">(비과세, 최대 20만원)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={formState.mealAllowance || ''}
                    onChange={(e) => handleFieldChange('mealAllowance', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                    placeholder="200000"
                  />
                  <span className="absolute right-3 top-2 text-slate-500">원</span>
                </div>
              </div>

              {/* 자가운전 보조금 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  자가운전 보조금 <span className="text-xs text-green-600">(비과세, 최대 20만원)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={formState.vehicleAllowance || ''}
                    onChange={(e) => handleFieldChange('vehicleAllowance', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2 text-slate-500">원</span>
                </div>
              </div>
            </div>

            {/* 오른쪽: 공제 항목 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h4 className="font-medium text-slate-700">공제 항목</h4>
                <button
                  type="button"
                  onClick={handleRecalculateInsurance}
                  className="inline-flex items-center text-xs text-emerald-600 hover:text-emerald-800"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  4대보험 재계산
                </button>
              </div>

              {/* 4대보험 */}
              <div className="p-3 bg-slate-50 rounded-md space-y-3">
                <p className="text-xs text-slate-600 mb-2">
                  4대보험료는 1월에 결정되어 연말까지 유지됩니다.
                </p>

                {/* 국민연금 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">국민연금</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formState.nationalPension || ''}
                      onChange={(e) => handleFieldChange('nationalPension', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="absolute right-3 top-2 text-slate-500">원</span>
                  </div>
                </div>

                {/* 건강보험 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">건강보험</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formState.healthInsurance || ''}
                      onChange={(e) => handleFieldChange('healthInsurance', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="absolute right-3 top-2 text-slate-500">원</span>
                  </div>
                </div>

                {/* 장기요양보험료 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">장기요양보험료</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formState.longTermCare || ''}
                      onChange={(e) => handleFieldChange('longTermCare', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="absolute right-3 top-2 text-slate-500">원</span>
                  </div>
                </div>

                {/* 고용보험 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">고용보험</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formState.employmentInsurance || ''}
                      onChange={(e) => handleFieldChange('employmentInsurance', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="absolute right-3 top-2 text-slate-500">원</span>
                  </div>
                </div>
              </div>

              {/* 소득세 관련 정보 */}
              <div className="p-3 bg-blue-50 rounded-md space-y-3">
                <p className="text-xs text-blue-600 mb-2">
                  소득세는 간이세액표에 따라 자동 계산됩니다.
                </p>

                {/* 부양가족 수 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    공제대상 가족 수 (본인 포함)
                  </label>
                  <select
                    value={formState.familyCount}
                    onChange={(e) => handleFieldChange('familyCount', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(n => (
                      <option key={n} value={n}>{n}명</option>
                    ))}
                  </select>
                </div>

                {/* 자녀 수 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    8세~20세 자녀 수
                  </label>
                  <select
                    value={formState.childCount}
                    onChange={(e) => handleFieldChange('childCount', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                  >
                    {[0, 1, 2, 3, 4, 5].map(n => (
                      <option key={n} value={n}>{n}명</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 기타 공제 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">기타 공제액 (월정액)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={formState.otherDeductions || ''}
                    onChange={(e) => handleFieldChange('otherDeductions', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2 text-slate-500">원</span>
                </div>
              </div>
            </div>
          </div>

          {/* 근태 연동 설정 */}
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h4 className="font-medium text-amber-800 mb-4 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              근태 연동 설정
            </h4>
            <div className="space-y-4">
              {/* 지각 차감 */}
              <label className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-slate-700">지각 시간 급여 차감</span>
                  <p className="text-xs text-slate-500">지각 시간만큼 급여에서 차감합니다</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeductLateMinutes(!deductLateMinutes)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    deductLateMinutes ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      deductLateMinutes ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>

              {/* 조퇴 차감 */}
              <label className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-slate-700">조퇴 시간 급여 차감</span>
                  <p className="text-xs text-slate-500">조퇴 시간만큼 급여에서 차감합니다</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeductEarlyLeaveMinutes(!deductEarlyLeaveMinutes)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    deductEarlyLeaveMinutes ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      deductEarlyLeaveMinutes ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>

              {/* 초과근무 수당 */}
              <label className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-slate-700">초과근무 수당 포함</span>
                  <p className="text-xs text-slate-500">초과근무 시간에 대한 수당을 급여에 포함합니다</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIncludeOvertimePay(!includeOvertimePay)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    includeOvertimePay ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      includeOvertimePay ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          {/* 적용 범위 선택 */}
          <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <h4 className="font-medium text-slate-800 mb-3">
              적용 범위
              <span className="ml-2 text-xs text-slate-400">(debug: applyToPast={String(applyToPast)})</span>
            </h4>
            <div className="space-y-3">
              <label
                className="flex items-center cursor-pointer p-2 rounded hover:bg-slate-100 transition-colors"
                onClick={() => {
                  console.log('[PayrollSettings] Label clicked: future only')
                }}
              >
                <input
                  type="radio"
                  name="applyScope"
                  checked={!applyToPast}
                  onChange={() => {
                    console.log('[PayrollSettings] Radio onChange: Setting applyToPast to false')
                    setApplyToPast(false)
                  }}
                  className="mr-3 h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-700">앞으로의 급여명세서에만 적용</span>
                  <p className="text-xs text-slate-500">다음 달부터 생성되는 급여명세서에 적용됩니다.</p>
                </div>
              </label>
              <label
                className="flex items-center cursor-pointer p-2 rounded hover:bg-slate-100 transition-colors"
                onClick={() => {
                  console.log('[PayrollSettings] Label clicked: apply to past')
                }}
              >
                <input
                  type="radio"
                  name="applyScope"
                  checked={applyToPast}
                  onChange={() => {
                    console.log('[PayrollSettings] Radio onChange: Setting applyToPast to true')
                    setApplyToPast(true)
                  }}
                  className="mr-3 h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-700">과거 급여명세서에도 적용</span>
                  <p className="text-xs text-slate-500">이미 생성된 모든 급여명세서도 함께 수정됩니다.</p>
                </div>
              </label>
            </div>
          </div>

          {/* 저장 버튼 및 메시지 */}
          <div className="mt-6 flex items-center justify-end gap-4">
            {/* 저장 메시지 */}
            {saveMessage && (
              <div className={`flex items-center px-4 py-2 rounded-md text-sm font-medium animate-fade-in ${
                saveMessage.type === 'success'
                  ? 'bg-green-100 border border-green-300 text-green-700'
                  : 'bg-red-100 border border-red-300 text-red-700'
              }`}>
                {saveMessage.type === 'success' ? (
                  <Check className="w-4 h-4 mr-2" />
                ) : (
                  <AlertCircle className="w-4 h-4 mr-2" />
                )}
                {saveMessage.text}
              </div>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center px-6 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? '저장 중...' : '설정 저장'}
            </button>
          </div>
        </div>
      )}

      {/* 직원별 설정 현황 */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">직원별 설정 현황</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-slate-700">직원명</th>
                <th className="text-left py-2 px-3 font-medium text-slate-700">급여 유형</th>
                <th className="text-right py-2 px-3 font-medium text-slate-700">목표금액/기본급</th>
                <th className="text-right py-2 px-3 font-medium text-slate-700">4대보험 합계</th>
                <th className="text-center py-2 px-3 font-medium text-slate-700">상태</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const setting = savedSettings[emp.id]
                const insuranceTotal = setting
                  ? setting.nationalPension + setting.healthInsurance + setting.longTermCare + setting.employmentInsurance
                  : 0

                return (
                  <tr key={emp.id} className="border-b hover:bg-slate-50">
                    <td className="py-2 px-3">{emp.name}</td>
                    <td className="py-2 px-3">
                      {setting ? (setting.salaryType === 'net' ? '세후' : '세전') : '-'}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {setting
                        ? formatCurrency(setting.salaryType === 'net' ? setting.targetAmount : setting.baseSalary) + '원'
                        : '-'
                      }
                    </td>
                    <td className="py-2 px-3 text-right">
                      {setting ? formatCurrency(insuranceTotal) + '원' : '-'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {setting ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                          <Check className="w-3 h-3 mr-1" />
                          설정됨
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500">
                          미설정
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
