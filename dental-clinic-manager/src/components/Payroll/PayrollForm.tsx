'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { PayrollFormState, PayrollCalculationResult, SalaryType } from '@/types/payroll'
import { DEFAULT_PAYROLL_FORM_STATE } from '@/types/payroll'
import {
  calculatePayrollFromFormState,
  getEmployeesForPayroll,
  calculatePaymentDate,
  savePayrollStatement,
  getPayrollStatement
} from '@/lib/payrollService'
import { formatCurrency } from '@/utils/taxCalculationUtils'
import PayrollPreview from './PayrollPreview'
import { AlertCircle, FileText, Settings } from 'lucide-react'

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
}

// 2025년 12월부터 시작하는 연월 옵션 생성
function generatePayrollYearMonthOptions(): { year: number; month: number; label: string }[] {
  const options: { year: number; month: number; label: string }[] = []
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  // 2025년 12월부터 현재까지
  for (let y = currentYear; y >= 2025; y--) {
    const startMonth = y === currentYear ? currentMonth : 12
    const endMonth = y === 2025 ? 12 : 1 // 2025년은 12월부터만

    for (let m = startMonth; m >= endMonth; m--) {
      options.push({
        year: y,
        month: m,
        label: `${y}년 ${m}월`
      })
    }
  }

  return options
}

export default function PayrollForm() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [calculationResult, setCalculationResult] = useState<PayrollCalculationResult | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [loadingPayroll, setLoadingPayroll] = useState(false)
  const [salarySettings, setSalarySettings] = useState<Record<string, SalarySetting>>({})
  const [hasSavedPayroll, setHasSavedPayroll] = useState(false)
  const [noSettingsWarning, setNoSettingsWarning] = useState(false)
  const [formState, setFormState] = useState<PayrollFormState>(DEFAULT_PAYROLL_FORM_STATE)

  const yearMonthOptions = useMemo(() => generatePayrollYearMonthOptions(), [])

  // 권한 체크
  const isOwner = user?.role === 'owner'

  // 직원 목록 및 급여 설정 로드
  useEffect(() => {
    async function loadData() {
      if (!user?.clinic_id) return

      setLoading(true)
      try {
        // 직원 목록 로드
        const employeeData = await getEmployeesForPayroll(user.clinic_id)

        // 원장이 아닌 경우 본인만 표시
        if (user.role !== 'owner') {
          const selfOnly = employeeData.filter(emp => emp.id === user.id)
          setEmployees(selfOnly)
          if (selfOnly.length > 0) {
            setSelectedEmployeeId(user.id)
          }
        } else {
          setEmployees(employeeData)
        }

        // 급여 설정 로드
        const settingsResponse = await fetch(`/api/payroll/settings?clinicId=${user.clinic_id}`)
        const settingsResult = await settingsResponse.json()

        if (settingsResult.success && settingsResult.data) {
          const settings: Record<string, SalarySetting> = {}
          settingsResult.data.forEach((item: any) => {
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
              otherDeductions: item.other_deductions || 0
            }
          })
          setSalarySettings(settings)
        }
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user?.clinic_id, user?.role, user?.id])

  // 직원/기간 선택 시 급여 명세서 로드 또는 생성
  useEffect(() => {
    async function loadOrGeneratePayroll() {
      if (!selectedEmployeeId || !user?.clinic_id) {
        setSelectedEmployee(null)
        setCalculationResult(null)
        setNoSettingsWarning(false)
        return
      }

      const employee = employees.find(e => e.id === selectedEmployeeId)
      if (!employee) return

      setSelectedEmployee(employee)
      setLoadingPayroll(true)
      setNoSettingsWarning(false)

      try {
        // 1. 먼저 저장된 급여명세서 확인
        const savedPayroll = await getPayrollStatement(
          user.clinic_id,
          selectedEmployeeId,
          selectedYear,
          selectedMonth
        )

        if (savedPayroll) {
          // 저장된 데이터 사용
          setHasSavedPayroll(true)
          setCalculationResult({
            payments: savedPayroll.payments,
            totalPayment: savedPayroll.totalPayment,
            deductions: savedPayroll.deductions,
            totalDeduction: savedPayroll.totalDeduction,
            netPay: savedPayroll.netPay,
            nonTaxableTotal: savedPayroll.nonTaxableTotal,
            taxableIncome: savedPayroll.totalPayment - savedPayroll.nonTaxableTotal
          })

          // formState도 업데이트 (미리보기용)
          const payments = savedPayroll.payments || {}
          const deductions = savedPayroll.deductions || {}
          setFormState(prev => ({
            ...prev,
            selectedEmployeeId,
            selectedYear,
            selectedMonth,
            salaryType: savedPayroll.salaryType || 'net',
            targetAmount: savedPayroll.netPay || 0,
            baseSalary: payments.baseSalary || 0,
            mealAllowance: payments.mealAllowance || 0,
            vehicleAllowance: payments.vehicleAllowance || 0,
            bonus: payments.bonus || 0,
            nationalPension: deductions.nationalPension || 0,
            healthInsurance: deductions.healthInsurance || 0,
            longTermCare: deductions.longTermCare || 0,
            employmentInsurance: deductions.employmentInsurance || 0,
            familyCount: savedPayroll.workInfo?.familyCount || 1,
            childCount: savedPayroll.workInfo?.childCount || 0,
            otherDeductions: deductions.otherDeductions || 0
          }))
        } else {
          // 2. 저장된 명세서가 없으면 급여 설정 기반으로 생성
          setHasSavedPayroll(false)
          const settings = salarySettings[selectedEmployeeId]

          if (settings) {
            // 급여 설정 기반으로 계산
            const newFormState: PayrollFormState = {
              ...DEFAULT_PAYROLL_FORM_STATE,
              selectedEmployeeId,
              selectedYear,
              selectedMonth,
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
            }

            setFormState(newFormState)
            const result = calculatePayrollFromFormState(newFormState)
            setCalculationResult(result)

            // 자동 저장 (owner만)
            if (isOwner) {
              await autoSavePayroll(employee, newFormState, result)
            }
          } else {
            // 급여 설정이 없음
            setNoSettingsWarning(true)
            setCalculationResult(null)
          }
        }
      } catch (error) {
        console.error('Error loading payroll:', error)
      } finally {
        setLoadingPayroll(false)
      }
    }

    loadOrGeneratePayroll()
  }, [selectedEmployeeId, selectedYear, selectedMonth, user?.clinic_id, employees, salarySettings, isOwner])

  // 자동 저장 함수
  async function autoSavePayroll(
    employee: Employee,
    state: PayrollFormState,
    result: PayrollCalculationResult
  ) {
    if (!user?.clinic_id) return

    try {
      const payments = {
        baseSalary: result.payments.baseSalary,
        bonus: state.bonus > 0 ? state.bonus : undefined,
        mealAllowance: state.mealAllowance > 0 ? state.mealAllowance : undefined,
        vehicleAllowance: state.vehicleAllowance > 0 ? state.vehicleAllowance : undefined,
      }

      const deductions = {
        nationalPension: state.nationalPension,
        healthInsurance: state.healthInsurance,
        longTermCare: state.longTermCare,
        employmentInsurance: state.employmentInsurance,
        incomeTax: result.deductions.incomeTax,
        localIncomeTax: result.deductions.localIncomeTax,
        otherDeductions: state.otherDeductions > 0 ? state.otherDeductions : undefined,
      }

      const statement = {
        clinicId: user.clinic_id,
        employeeId: employee.id,
        statementYear: selectedYear,
        statementMonth: selectedMonth,
        paymentDate: calculatePaymentDate(selectedYear, selectedMonth, 25),
        employeeName: employee.name,
        employeeResidentNumber: employee.resident_registration_number,
        hireDate: employee.hire_date,
        salaryType: state.salaryType,
        payments,
        totalPayment: result.totalPayment,
        deductions,
        totalDeduction: result.totalDeduction,
        netPay: result.netPay,
        nonTaxableTotal: result.nonTaxableTotal,
        workInfo: {
          familyCount: state.familyCount,
          childCount: state.childCount
        }
      }

      await savePayrollStatement(statement, user.id)
      setHasSavedPayroll(true)
    } catch (error) {
      console.error('Error auto-saving payroll:', error)
    }
  }

  // 명세서 미리보기
  const handlePreview = () => {
    if (calculationResult && selectedEmployee) {
      setShowPreview(true)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 직원 및 기간 선택 */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">급여 명세서 조회</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 직원 선택 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              직원 선택 <span className="text-red-500">*</span>
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
                  {salarySettings[emp.id] ? ' ✓' : ''}
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
              value={`${selectedYear}-${selectedMonth}`}
              onChange={(e) => {
                const [year, month] = e.target.value.split('-').map(Number)
                setSelectedYear(year)
                setSelectedMonth(month)
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              {yearMonthOptions.map(opt => (
                <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loadingPayroll && (
          <div className="mt-4 text-sm text-emerald-600">
            급여 명세서를 불러오는 중...
          </div>
        )}
      </div>

      {/* 급여 설정 없음 경고 */}
      {noSettingsWarning && selectedEmployeeId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-800 mb-2">급여 설정이 필요합니다</h4>
              <p className="text-sm text-amber-700 mb-4">
                {selectedEmployee?.name}님의 급여 설정이 아직 등록되지 않았습니다.
                {isOwner ? (
                  <> 급여 명세서를 생성하려면 먼저 <strong>급여 설정</strong> 탭에서 설정을 완료해주세요.</>
                ) : (
                  <> 원장님께 급여 설정을 요청해주세요.</>
                )}
              </p>
              {isOwner && (
                <div className="flex items-center text-sm text-amber-600">
                  <Settings className="w-4 h-4 mr-1" />
                  상단의 "급여 설정" 탭에서 설정할 수 있습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 계산 결과 표시 */}
      {calculationResult && selectedEmployeeId && !noSettingsWarning && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">
              {selectedEmployee?.name}님의 {selectedYear}년 {selectedMonth}월 급여 명세서
            </h3>
            {hasSavedPayroll && (
              <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-green-100 text-green-700">
                <FileText className="w-3 h-3 mr-1" />
                저장됨
              </span>
            )}
          </div>

          {/* 요약 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
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
            </div>
          </div>

          {/* 상세 내역 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h4 className="font-medium text-slate-700 mb-3 border-b pb-2">지급 항목</h4>
              <table className="w-full">
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 text-slate-600">기본급</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(calculationResult.payments.baseSalary || 0)}원</td>
                  </tr>
                  {calculationResult.payments.bonus && calculationResult.payments.bonus > 0 && (
                    <tr className="border-b">
                      <td className="py-2 text-slate-600">상여</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(calculationResult.payments.bonus)}원</td>
                    </tr>
                  )}
                  {calculationResult.payments.mealAllowance && calculationResult.payments.mealAllowance > 0 && (
                    <tr className="border-b">
                      <td className="py-2 text-slate-600">
                        식대 <span className="text-xs text-green-600">(비과세)</span>
                      </td>
                      <td className="py-2 text-right font-medium">{formatCurrency(calculationResult.payments.mealAllowance)}원</td>
                    </tr>
                  )}
                  {calculationResult.payments.vehicleAllowance && calculationResult.payments.vehicleAllowance > 0 && (
                    <tr className="border-b">
                      <td className="py-2 text-slate-600">
                        자가운전 보조금 <span className="text-xs text-green-600">(비과세)</span>
                      </td>
                      <td className="py-2 text-right font-medium">{formatCurrency(calculationResult.payments.vehicleAllowance)}원</td>
                    </tr>
                  )}
                  {calculationResult.payments.overtimePay && calculationResult.payments.overtimePay > 0 && (
                    <tr className="border-b">
                      <td className="py-2 text-slate-600">초과근무수당</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(calculationResult.payments.overtimePay)}원</td>
                    </tr>
                  )}
                  <tr className="bg-slate-50">
                    <td className="py-2 font-medium text-slate-800">합계</td>
                    <td className="py-2 text-right font-bold text-blue-600">{formatCurrency(calculationResult.totalPayment)}원</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h4 className="font-medium text-slate-700 mb-3 border-b pb-2">공제 항목</h4>
              <table className="w-full">
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 text-slate-600">국민연금</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(calculationResult.deductions.nationalPension)}원</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 text-slate-600">건강보험</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(calculationResult.deductions.healthInsurance)}원</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 text-slate-600">장기요양보험료</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(calculationResult.deductions.longTermCare)}원</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 text-slate-600">고용보험</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(calculationResult.deductions.employmentInsurance)}원</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 text-slate-600">소득세</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(calculationResult.deductions.incomeTax)}원</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 text-slate-600">지방소득세</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(calculationResult.deductions.localIncomeTax)}원</td>
                  </tr>
                  {calculationResult.deductions.otherDeductions && calculationResult.deductions.otherDeductions > 0 && (
                    <tr className="border-b">
                      <td className="py-2 text-slate-600">기타공제</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(calculationResult.deductions.otherDeductions)}원</td>
                    </tr>
                  )}
                  <tr className="bg-slate-50">
                    <td className="py-2 font-medium text-slate-800">합계</td>
                    <td className="py-2 text-right font-bold text-red-600">{formatCurrency(calculationResult.totalDeduction)}원</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 버튼 */}
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handlePreview}
              className="px-6 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              명세서 미리보기 / 인쇄
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
            statementYear: selectedYear,
            statementMonth: selectedMonth,
            paymentDate: calculatePaymentDate(selectedYear, selectedMonth, 25),
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
              familyCount: formState.familyCount
            }
          }}
          clinicName={user.clinic_name || '치과의원'}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
}
