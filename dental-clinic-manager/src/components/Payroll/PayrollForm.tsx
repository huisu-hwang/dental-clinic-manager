'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { PayrollFormState, PayrollCalculationResult, SalaryType, EmployeeSalaryInfo } from '@/types/payroll'
import { DEFAULT_PAYROLL_FORM_STATE } from '@/types/payroll'
import {
  calculatePayrollFromFormState,
  getEmployeesForPayroll,
  getEmployeeContract,
  extractSalaryInfoFromContract,
  getEstimatedInsurance,
  generateYearMonthOptions,
  calculatePaymentDate,
  savePayrollStatement,
  getPayrollStatement
} from '@/lib/payrollService'
import { formatCurrency } from '@/utils/taxCalculationUtils'
import PayrollPreview from './PayrollPreview'

interface Employee {
  id: string
  name: string
  email: string
  role: string
  hire_date?: string
  resident_registration_number?: string
  hasContract: boolean
}

export default function PayrollForm() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [formState, setFormState] = useState<PayrollFormState>(DEFAULT_PAYROLL_FORM_STATE)
  const [calculationResult, setCalculationResult] = useState<PayrollCalculationResult | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [loadingContract, setLoadingContract] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [hasSavedData, setHasSavedData] = useState(false)
  const skipRecalculation = useRef(false)

  const yearMonthOptions = useMemo(() => generateYearMonthOptions(2), [])

  // 권한 체크: 원장(owner)인지 확인
  const isOwner = user?.role === 'owner'
  // 읽기 전용 모드: 직원이 본인의 명세서를 볼 때
  const isReadOnly = !isOwner && formState.selectedEmployeeId === user?.id

  // 직원 목록 로드
  useEffect(() => {
    async function loadEmployees() {
      if (!user?.clinic_id) return

      setLoading(true)
      try {
        const data = await getEmployeesForPayroll(user.clinic_id)

        // 원장이 아닌 경우 본인만 표시
        if (user.role !== 'owner') {
          const selfOnly = data.filter(emp => emp.id === user.id)
          setEmployees(selfOnly)
          // 본인 자동 선택
          if (selfOnly.length > 0) {
            setFormState(prev => ({ ...prev, selectedEmployeeId: user.id }))
          }
        } else {
          setEmployees(data)
        }
      } catch (error) {
        console.error('Error loading employees:', error)
      } finally {
        setLoading(false)
      }
    }

    loadEmployees()
  }, [user?.clinic_id, user?.role, user?.id])

  // 직원 선택 시 저장된 급여명세서 또는 계약서 정보 로드
  useEffect(() => {
    async function loadPayrollOrContractInfo() {
      if (!formState.selectedEmployeeId || !user?.clinic_id) {
        setSelectedEmployee(null)
        setHasSavedData(false)
        return
      }

      const employee = employees.find(e => e.id === formState.selectedEmployeeId)
      if (!employee) return

      setSelectedEmployee(employee)
      setLoadingContract(true)
      setSaveMessage(null)

      try {
        // 1. 먼저 저장된 급여명세서 확인
        const savedPayroll = await getPayrollStatement(
          user.clinic_id,
          formState.selectedEmployeeId,
          formState.selectedYear,
          formState.selectedMonth
        )

        if (savedPayroll) {
          // 저장된 데이터가 있으면 그 값을 사용 (재계산 없이 그대로 표시)
          setHasSavedData(true)
          const payments = savedPayroll.payments || {}
          const deductions = savedPayroll.deductions || {}

          // 폼 상태 업데이트
          setFormState(prev => ({
            ...prev,
            salaryType: savedPayroll.salaryType || 'net',
            targetAmount: savedPayroll.netPay || 0,
            baseSalary: payments.baseSalary || 0,
            bonus: payments.bonus || 0,
            mealAllowance: payments.mealAllowance || 0,
            vehicleAllowance: payments.vehicleAllowance || 0,
            annualLeaveAllowance: payments.annualLeaveAllowance || 0,
            overtimePay: payments.overtimePay || 0,
            nationalPension: deductions.nationalPension || 0,
            healthInsurance: deductions.healthInsurance || 0,
            longTermCare: deductions.longTermCare || 0,
            employmentInsurance: deductions.employmentInsurance || 0,
            otherDeductions: deductions.otherDeductions || 0,
            familyCount: savedPayroll.workInfo?.familyCount || 1,
            childCount: savedPayroll.workInfo?.childCount || 0,
            workDays: savedPayroll.workInfo?.workDays || 0,
            totalWorkHours: savedPayroll.workInfo?.totalWorkHours || 0,
            overtimeHours: savedPayroll.workInfo?.overtimeHours || 0
          }))

          // 저장된 계산 결과 직접 설정 (재계산 방지)
          skipRecalculation.current = true
          setCalculationResult({
            payments: savedPayroll.payments,
            totalPayment: savedPayroll.totalPayment,
            deductions: savedPayroll.deductions,
            totalDeduction: savedPayroll.totalDeduction,
            netPay: savedPayroll.netPay,
            nonTaxableTotal: savedPayroll.nonTaxableTotal,
            taxableIncome: savedPayroll.totalPayment - savedPayroll.nonTaxableTotal
          })
        } else {
          // 2. 저장된 데이터가 없으면 계약서 정보 로드
          setHasSavedData(false)
          const contract = await getEmployeeContract(formState.selectedEmployeeId, user.clinic_id)

          if (contract) {
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
            setFormState(prev => ({
              ...DEFAULT_PAYROLL_FORM_STATE,
              selectedEmployeeId: prev.selectedEmployeeId,
              selectedYear: prev.selectedYear,
              selectedMonth: prev.selectedMonth
            }))
          }
        }
      } catch (error) {
        console.error('Error loading payroll/contract:', error)
      } finally {
        setLoadingContract(false)
      }
    }

    loadPayrollOrContractInfo()
  }, [formState.selectedEmployeeId, formState.selectedYear, formState.selectedMonth, user?.clinic_id, employees])

  // 폼 값 변경 시 자동 계산
  useEffect(() => {
    // 저장된 데이터를 로드했을 때는 재계산 건너뛰기
    if (skipRecalculation.current) {
      skipRecalculation.current = false
      return
    }

    if (formState.targetAmount > 0 || formState.baseSalary > 0) {
      const result = calculatePayrollFromFormState(formState)
      setCalculationResult(result)
    } else {
      setCalculationResult(null)
    }
  }, [formState])

  // 폼 필드 변경 핸들러
  const handleFieldChange = (field: keyof PayrollFormState, value: any) => {
    // 사용자가 값을 변경하면 저장된 데이터 표시 해제
    if (hasSavedData) {
      setHasSavedData(false)
    }
    setFormState(prev => ({ ...prev, [field]: value }))
  }

  // 급여 유형 변경 핸들러
  const handleSalaryTypeChange = (type: SalaryType) => {
    setFormState(prev => ({
      ...prev,
      salaryType: type,
      targetAmount: type === 'net' ? prev.targetAmount : prev.baseSalary
    }))
  }

  // 4대보험 재계산
  const handleRecalculateInsurance = () => {
    const baseAmount = formState.salaryType === 'net'
      ? (calculationResult?.totalPayment || formState.targetAmount)
      : (formState.baseSalary + formState.mealAllowance)

    const estimated = getEstimatedInsurance(baseAmount)

    setFormState(prev => ({
      ...prev,
      nationalPension: estimated.nationalPension,
      healthInsurance: estimated.healthInsurance,
      longTermCare: estimated.longTermCare,
      employmentInsurance: estimated.employmentInsurance
    }))
  }

  // 명세서 미리보기
  const handlePreview = () => {
    if (calculationResult && selectedEmployee) {
      setShowPreview(true)
    }
  }

  // 명세서 저장
  const handleSave = async () => {
    if (!calculationResult || !selectedEmployee || !user) {
      setSaveMessage({ type: 'error', text: '저장할 수 없습니다. 직원과 급여 정보를 확인해주세요.' })
      return
    }

    setSaving(true)
    setSaveMessage(null)

    try {
      const statement = {
        clinicId: user.clinic_id || '',
        employeeId: selectedEmployee.id,
        statementYear: formState.selectedYear,
        statementMonth: formState.selectedMonth,
        paymentDate: calculatePaymentDate(formState.selectedYear, formState.selectedMonth, 25),
        employeeName: selectedEmployee.name,
        employeeResidentNumber: selectedEmployee.resident_registration_number,
        hireDate: selectedEmployee.hire_date,
        salaryType: formState.salaryType,
        payments: calculationResult.payments,
        totalPayment: calculationResult.totalPayment,
        deductions: calculationResult.deductions,
        totalDeduction: calculationResult.totalDeduction,
        netPay: calculationResult.netPay,
        nonTaxableTotal: calculationResult.nonTaxableTotal,
        workInfo: {
          workDays: formState.workDays || undefined,
          totalWorkHours: formState.totalWorkHours || undefined,
          overtimeHours: formState.overtimeHours || undefined,
          nightWorkHours: formState.nightWorkHours || undefined,
          holidayWorkHours: formState.holidayWorkHours || undefined,
          hourlyRate: formState.hourlyRate || undefined,
          familyCount: formState.familyCount
        }
      }

      const result = await savePayrollStatement(statement, user.id)

      if (result.success) {
        setSaveMessage({ type: 'success', text: result.message || '급여 명세서가 저장되었습니다.' })
      } else {
        setSaveMessage({ type: 'error', text: result.error || '저장에 실패했습니다.' })
      }
    } catch (error) {
      console.error('Error saving payroll:', error)
      setSaveMessage({ type: 'error', text: '저장 중 오류가 발생했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 직원 및 기간 선택 */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">기본 정보</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 직원 선택 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              직원 선택 <span className="text-red-500">*</span>
            </label>
            <select
              value={formState.selectedEmployeeId || ''}
              onChange={(e) => handleFieldChange('selectedEmployeeId', e.target.value || null)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">직원을 선택하세요</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.hasContract ? '(계약서 있음)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 연월 선택 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              급여 기간 <span className="text-red-500">*</span>
            </label>
            <select
              value={`${formState.selectedYear}-${formState.selectedMonth}`}
              onChange={(e) => {
                const [year, month] = e.target.value.split('-').map(Number)
                handleFieldChange('selectedYear', year)
                handleFieldChange('selectedMonth', month)
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {yearMonthOptions.map(opt => (
                <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 급여 유형 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              급여 유형 <span className="text-red-500">*</span>
            </label>
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
        </div>

        {loadingContract && (
          <div className="mt-4 text-sm text-blue-600">
            계약서 정보를 불러오는 중...
          </div>
        )}

        {selectedEmployee && selectedEmployee.hasContract && !loadingContract && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-700">
              ✓ 근로계약서에서 급여 정보를 불러왔습니다. 필요시 수정할 수 있습니다.
            </p>
          </div>
        )}

        {selectedEmployee && !selectedEmployee.hasContract && !loadingContract && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-sm text-amber-700">
              ⚠ 근로계약서가 없습니다. 급여 정보를 직접 입력해주세요.
            </p>
          </div>
        )}
      </div>

      {/* 급여 입력 */}
      {formState.selectedEmployeeId && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          {/* 직원용 읽기 전용 안내 */}
          {!isOwner && (
            <div className="mb-4 p-3 bg-slate-100 border border-slate-300 rounded-md">
              <p className="text-sm text-slate-600">
                📋 급여 명세서 조회 모드입니다. 수정은 원장님만 가능합니다.
              </p>
            </div>
          )}

          <h3 className="text-lg font-semibold text-slate-800 mb-4">
            {formState.salaryType === 'net' ? '세후 급여 입력' : '세전 급여 입력'}
          </h3>

          <fieldset disabled={!isOwner} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 왼쪽: 지급 항목 */}
            <div className="space-y-4">
              <h4 className="font-medium text-slate-700 border-b pb-2">지급 항목</h4>

              {/* 목표 금액 (세후) 또는 기본급 (세전) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {formState.salaryType === 'net' ? '목표 실수령액' : '기본급'} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={formState.salaryType === 'net' ? formState.targetAmount : formState.baseSalary}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0
                      if (formState.salaryType === 'net') {
                        handleFieldChange('targetAmount', value)
                      } else {
                        handleFieldChange('baseSalary', value)
                      }
                    }}
                    className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2 text-slate-500">원</span>
                </div>
                {formState.salaryType === 'net' && (
                  <p className="text-xs text-slate-500 mt-1">
                    실제 받는 금액을 입력하면 세전 급여가 자동 계산됩니다.
                  </p>
                )}
              </div>

              {/* 상여 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">상여</label>
                <div className="relative">
                  <input
                    type="number"
                    value={formState.bonus || ''}
                    onChange={(e) => handleFieldChange('bonus', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2 text-slate-500">원</span>
                </div>
              </div>

              {/* 식대 (비과세) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  식대 <span className="text-xs text-green-600">(비과세, 최대 20만원)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={formState.mealAllowance || ''}
                    onChange={(e) => handleFieldChange('mealAllowance', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="200000"
                  />
                  <span className="absolute right-3 top-2 text-slate-500">원</span>
                </div>
              </div>

              {/* 자가운전 보조금 (비과세) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  자가운전 보조금 <span className="text-xs text-green-600">(비과세, 최대 20만원)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={formState.vehicleAllowance || ''}
                    onChange={(e) => handleFieldChange('vehicleAllowance', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2 text-slate-500">원</span>
                </div>
              </div>

              {/* 연차수당 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">연차수당</label>
                <div className="relative">
                  <input
                    type="number"
                    value={formState.annualLeaveAllowance || ''}
                    onChange={(e) => handleFieldChange('annualLeaveAllowance', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2 text-slate-500">원</span>
                </div>
              </div>

              {/* 초과근무수당 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">초과근무수당</label>
                <div className="relative">
                  <input
                    type="number"
                    value={formState.overtimePay || ''}
                    onChange={(e) => handleFieldChange('overtimePay', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  4대보험 재계산
                </button>
              </div>

              {/* 4대보험 */}
              <div className="p-3 bg-slate-50 rounded-md space-y-3">
                <p className="text-xs text-slate-600 mb-2">
                  4대보험료는 1월에 결정되어 연말까지 유지됩니다. 필요시 직접 수정할 수 있습니다.
                </p>

                {/* 국민연금 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">국민연금</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formState.nationalPension || ''}
                      onChange={(e) => handleFieldChange('nationalPension', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                      className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                      className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                      className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    {[0, 1, 2, 3, 4, 5].map(n => (
                      <option key={n} value={n}>{n}명</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 기타 공제 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">기타공제액</label>
                <div className="relative">
                  <input
                    type="number"
                    value={formState.otherDeductions || ''}
                    onChange={(e) => handleFieldChange('otherDeductions', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 pr-12 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2 text-slate-500">원</span>
                </div>
              </div>
            </div>
          </fieldset>
        </div>
      )}

      {/* 계산 결과 요약 */}
      {calculationResult && formState.selectedEmployeeId && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">계산 결과</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 지급액계 */}
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-600 mb-1">지급액계</p>
              <p className="text-2xl font-bold text-blue-800">
                {formatCurrency(calculationResult.totalPayment)}원
              </p>
              <p className="text-xs text-blue-500 mt-1">
                비과세: {formatCurrency(calculationResult.nonTaxableTotal)}원 포함
              </p>
            </div>

            {/* 공제액계 */}
            <div className="p-4 bg-red-50 rounded-lg">
              <p className="text-sm text-red-600 mb-1">공제액계</p>
              <p className="text-2xl font-bold text-red-800">
                {formatCurrency(calculationResult.totalDeduction)}원
              </p>
              <p className="text-xs text-red-500 mt-1">
                소득세: {formatCurrency(calculationResult.deductions.incomeTax)}원
              </p>
            </div>

            {/* 실수령액 */}
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-600 mb-1">실수령액</p>
              <p className="text-2xl font-bold text-green-800">
                {formatCurrency(calculationResult.netPay)}원
              </p>
              {formState.salaryType === 'net' && (
                <p className="text-xs text-green-500 mt-1">
                  목표 금액과 일치합니다
                </p>
              )}
            </div>
          </div>

          {/* 상세 내역 */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium text-slate-700 mb-2">지급 항목 상세</h4>
              <table className="w-full">
                <tbody>
                  <tr className="border-b">
                    <td className="py-1 text-slate-600">기본급</td>
                    <td className="py-1 text-right">{formatCurrency(calculationResult.payments.baseSalary || 0)}원</td>
                  </tr>
                  {calculationResult.payments.bonus && (
                    <tr className="border-b">
                      <td className="py-1 text-slate-600">상여</td>
                      <td className="py-1 text-right">{formatCurrency(calculationResult.payments.bonus)}원</td>
                    </tr>
                  )}
                  {calculationResult.payments.mealAllowance && (
                    <tr className="border-b">
                      <td className="py-1 text-slate-600">식대 (비과세)</td>
                      <td className="py-1 text-right">{formatCurrency(calculationResult.payments.mealAllowance)}원</td>
                    </tr>
                  )}
                  {calculationResult.payments.vehicleAllowance && (
                    <tr className="border-b">
                      <td className="py-1 text-slate-600">자가운전 (비과세)</td>
                      <td className="py-1 text-right">{formatCurrency(calculationResult.payments.vehicleAllowance)}원</td>
                    </tr>
                  )}
                  {calculationResult.payments.overtimePay && (
                    <tr className="border-b">
                      <td className="py-1 text-slate-600">초과근무수당</td>
                      <td className="py-1 text-right">{formatCurrency(calculationResult.payments.overtimePay)}원</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <h4 className="font-medium text-slate-700 mb-2">공제 항목 상세</h4>
              <table className="w-full">
                <tbody>
                  <tr className="border-b">
                    <td className="py-1 text-slate-600">국민연금</td>
                    <td className="py-1 text-right">{formatCurrency(calculationResult.deductions.nationalPension)}원</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1 text-slate-600">건강보험</td>
                    <td className="py-1 text-right">{formatCurrency(calculationResult.deductions.healthInsurance)}원</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1 text-slate-600">장기요양보험료</td>
                    <td className="py-1 text-right">{formatCurrency(calculationResult.deductions.longTermCare)}원</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1 text-slate-600">고용보험</td>
                    <td className="py-1 text-right">{formatCurrency(calculationResult.deductions.employmentInsurance)}원</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1 text-slate-600">소득세</td>
                    <td className="py-1 text-right">{formatCurrency(calculationResult.deductions.incomeTax)}원</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1 text-slate-600">지방소득세</td>
                    <td className="py-1 text-right">{formatCurrency(calculationResult.deductions.localIncomeTax)}원</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 데이터 상태 표시 */}
          {hasSavedData && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-700">
                ✓ 저장된 급여명세서를 불러왔습니다. ({formState.selectedYear}년 {formState.selectedMonth}월)
              </p>
            </div>
          )}

          {/* 저장 메시지 */}
          {saveMessage && (
            <div className={`mt-4 p-3 rounded-md ${
              saveMessage.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {saveMessage.text}
            </div>
          )}

          {/* 버튼 */}
          <div className="mt-6 flex justify-end space-x-3">
            {/* 원장만 저장 가능 */}
            {isOwner && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            )}
            <button
              type="button"
              onClick={handlePreview}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              명세서 미리보기
            </button>
          </div>
        </div>
      )}

      {/* 명세서 미리보기 모달 */}
      {showPreview && calculationResult && selectedEmployee && user && (
        <PayrollPreview
          statement={{
            clinicId: user.clinic_id || '',
            employeeId: selectedEmployee.id,
            statementYear: formState.selectedYear,
            statementMonth: formState.selectedMonth,
            paymentDate: calculatePaymentDate(formState.selectedYear, formState.selectedMonth, 25),
            employeeName: selectedEmployee.name,
            employeeResidentNumber: selectedEmployee.resident_registration_number,
            hireDate: selectedEmployee.hire_date,
            salaryType: formState.salaryType,
            payments: calculationResult.payments,
            totalPayment: calculationResult.totalPayment,
            deductions: calculationResult.deductions,
            totalDeduction: calculationResult.totalDeduction,
            netPay: calculationResult.netPay,
            nonTaxableTotal: calculationResult.nonTaxableTotal,
            workInfo: {
              workDays: formState.workDays || undefined,
              totalWorkHours: formState.totalWorkHours || undefined,
              overtimeHours: formState.overtimeHours || undefined,
              nightWorkHours: formState.nightWorkHours || undefined,
              holidayWorkHours: formState.holidayWorkHours || undefined,
              hourlyRate: formState.hourlyRate || undefined,
              familyCount: formState.familyCount
            }
          }}
          clinicName={user.clinic_name || '하안치과의원'}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
}
