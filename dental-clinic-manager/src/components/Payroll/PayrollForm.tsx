'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type {
  PayrollFormState,
  PayrollCalculationResult,
  SalaryType,
  AttendanceSummaryForPayroll,
  AttendanceDeduction,
  PayrollAccessResult
} from '@/types/payroll'
import { DEFAULT_PAYROLL_FORM_STATE } from '@/types/payroll'
import {
  calculatePayrollFromFormState,
  getEmployeesForPayroll,
  calculatePaymentDate,
  savePayrollStatement,
  getPayrollStatement,
  getAttendanceSummaryForPayroll,
  calculatePayrollBasis,
  calculateAttendanceDeduction,
  checkPayrollAccess
} from '@/lib/payrollService'
import { formatCurrency } from '@/utils/taxCalculationUtils'
import PayrollPreview from './PayrollPreview'
import { AlertCircle, FileText, Settings, Clock, Calendar, AlertTriangle, Lock } from 'lucide-react'
import type { WorkSchedule } from '@/types/workSchedule'
import { workScheduleService } from '@/lib/workScheduleService'

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

  // 근태 연동 관련 상태
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummaryForPayroll | null>(null)
  const [attendanceDeduction, setAttendanceDeduction] = useState<AttendanceDeduction | null>(null)
  const [accessResult, setAccessResult] = useState<PayrollAccessResult | null>(null)
  const [employeeWorkSchedule, setEmployeeWorkSchedule] = useState<WorkSchedule | null>(null)
  const [attendanceLoadError, setAttendanceLoadError] = useState<string | null>(null)

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
        setAttendanceSummary(null)
        setAttendanceDeduction(null)
        setAccessResult(null)
        setAttendanceLoadError(null)
        return
      }

      const employee = employees.find(e => e.id === selectedEmployeeId)
      if (!employee) return

      setSelectedEmployee(employee)
      setLoadingPayroll(true)
      setNoSettingsWarning(false)
      setAttendanceLoadError(null)

      // 접근 권한 확인
      const isOwnStatement = selectedEmployeeId === user.id
      const access = checkPayrollAccess(user.role || '', selectedYear, selectedMonth, isOwnStatement)
      setAccessResult(access)

      // 접근 권한이 없으면 더 이상 로드하지 않음
      if (!access.canAccess) {
        setLoadingPayroll(false)
        setCalculationResult(null)
        setAttendanceSummary(null)
        setAttendanceDeduction(null)
        return
      }

      try {
        const settings = salarySettings[selectedEmployeeId]

        // 급여 설정이 없으면 경고 표시
        if (!settings) {
          setNoSettingsWarning(true)
          setCalculationResult(null)
          setHasSavedPayroll(false)
          setAttendanceSummary(null)
          setAttendanceDeduction(null)
          setLoadingPayroll(false)
          return
        }

        // 직원 근무 스케줄 조회
        let workSchedule: WorkSchedule | undefined = undefined
        try {
          const scheduleResult = await workScheduleService.getUserWorkSchedule(selectedEmployeeId)
          if (scheduleResult.data) {
            workSchedule = scheduleResult.data
            setEmployeeWorkSchedule(scheduleResult.data)
          }
        } catch (error) {
          console.warn('Failed to fetch work schedule, using default:', error)
        }

        // 근태 요약 조회 (직원 근무 스케줄 기반으로 근무일 계산)
        const attendanceResult = await getAttendanceSummaryForPayroll(
          selectedEmployeeId,
          user.clinic_id,
          selectedYear,
          selectedMonth,
          workSchedule, // 근무 스케줄 전달하여 정확한 근무일수 계산
          employee.hire_date // 입사일 전달하여 정확한 연차 계산
        )

        let currentAttendanceSummary: AttendanceSummaryForPayroll | null = null
        let currentAttendanceDeduction: AttendanceDeduction | null = null

        if (attendanceResult.success && attendanceResult.data) {
          currentAttendanceSummary = attendanceResult.data
          setAttendanceSummary(currentAttendanceSummary)

          // 근태 기반 급여 차감 계산 (직원 근무 스케줄 반영)
          // 세후 계약의 경우 targetAmount를, 세전 계약의 경우 baseSalary를 기준으로 계산
          const basisAmount = settings.salaryType === 'net'
            ? settings.targetAmount
            : settings.baseSalary
          const basis = calculatePayrollBasis(basisAmount, workSchedule)

          console.log('[PayrollForm] 급여 기준 계산:', {
            employeeId: selectedEmployeeId,
            employeeName: employee.name,
            salaryType: settings.salaryType,
            targetAmount: settings.targetAmount,
            baseSalary: settings.baseSalary,
            basisAmount, // 실제 계산에 사용되는 금액
            workSchedule: workSchedule ? '설정됨' : '기본값 사용',
            dailyWage: basis.dailyWage,
            hourlyWage: basis.hourlyWage,
            monthlyWorkHours: basis.monthlyWorkHours
          })

          currentAttendanceDeduction = calculateAttendanceDeduction(basis, currentAttendanceSummary)
          setAttendanceDeduction(currentAttendanceDeduction)

          console.log('[PayrollForm] 근태 데이터 로드됨:', {
            employeeName: employee.name,
            totalWorkDays: currentAttendanceSummary.totalWorkDays,
            presentDays: currentAttendanceSummary.presentDays,
            absentDays: currentAttendanceSummary.absentDays,
            leaveDays: currentAttendanceSummary.leaveDays,
            totalDeduction: currentAttendanceDeduction.totalDeduction,
            deductionDetails: currentAttendanceDeduction.deductionDetails
          })
        } else {
          // 근태 데이터 로드 실패
          console.warn('[PayrollForm] 근태 데이터 로드 실패:', attendanceResult.error)
          setAttendanceLoadError(attendanceResult.error || '근태 데이터를 불러올 수 없습니다.')
          setAttendanceSummary(null)
          setAttendanceDeduction(null)
        }

        // 급여 설정이 있으면 항상 설정 기반으로 계산 (4대보험 값 정확히 반영)
        // 근태 차감 적용 방식:
        // - 세전(gross) 계약: 기타 공제에 추가하여 실수령액 감소
        // - 세후(net) 계약: 목표 실수령액에서 직접 차감 (targetAmount 조정)
        const attendanceDeductionAmount = currentAttendanceDeduction?.totalDeduction || 0

        // 세후 계약의 경우 targetAmount에서 근태 차감액을 빼고,
        // 세전 계약의 경우 기타공제에 추가
        const adjustedTargetAmount = settings.salaryType === 'net'
          ? Math.max(0, settings.targetAmount - attendanceDeductionAmount)
          : settings.targetAmount

        const adjustedOtherDeductions = settings.salaryType === 'gross'
          ? settings.otherDeductions + attendanceDeductionAmount
          : settings.otherDeductions

        const newFormState: PayrollFormState = {
          ...DEFAULT_PAYROLL_FORM_STATE,
          selectedEmployeeId,
          selectedYear,
          selectedMonth,
          salaryType: settings.salaryType,
          targetAmount: adjustedTargetAmount,
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
          otherDeductions: adjustedOtherDeductions
        }

        setFormState(newFormState)
        const result = calculatePayrollFromFormState(newFormState)
        setCalculationResult(result)

        // 저장된 급여명세서 확인
        const savedPayroll = await getPayrollStatement(
          user.clinic_id,
          selectedEmployeeId,
          selectedYear,
          selectedMonth
        )

        if (savedPayroll) {
          // 저장된 데이터가 있지만, 설정이 변경되었는지 확인
          const deductions = savedPayroll.deductions || {}
          const settingsChanged =
            deductions.nationalPension !== settings.nationalPension ||
            deductions.healthInsurance !== settings.healthInsurance ||
            deductions.longTermCare !== settings.longTermCare ||
            deductions.employmentInsurance !== settings.employmentInsurance ||
            savedPayroll.payments?.mealAllowance !== settings.mealAllowance ||
            savedPayroll.payments?.vehicleAllowance !== settings.vehicleAllowance ||
            savedPayroll.payments?.bonus !== settings.bonus

          if (settingsChanged && isOwner) {
            // 설정이 변경되었으면 새로운 값으로 저장
            await autoSavePayroll(employee, newFormState, result, currentAttendanceSummary, currentAttendanceDeduction)
          }
          setHasSavedPayroll(true)
        } else {
          // 저장된 명세서가 없으면 자동 저장 (owner만)
          if (isOwner) {
            await autoSavePayroll(employee, newFormState, result, currentAttendanceSummary, currentAttendanceDeduction)
          }
          setHasSavedPayroll(true)
        }
      } catch (error) {
        console.error('Error loading payroll:', error)
      } finally {
        setLoadingPayroll(false)
      }
    }

    loadOrGeneratePayroll()
  }, [selectedEmployeeId, selectedYear, selectedMonth, user?.clinic_id, user?.id, user?.role, employees, salarySettings, isOwner])

  // 자동 저장 함수
  async function autoSavePayroll(
    employee: Employee,
    state: PayrollFormState,
    result: PayrollCalculationResult,
    attendanceSummaryData?: AttendanceSummaryForPayroll | null,
    attendanceDeductionData?: AttendanceDeduction | null
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
          childCount: state.childCount,
          // 근태 정보 추가
          workDays: attendanceSummaryData?.presentDays,
          totalWorkHours: attendanceSummaryData ? Math.round(attendanceSummaryData.presentDays * 8) : undefined,
          overtimeHours: attendanceSummaryData ? Math.round(attendanceSummaryData.overtimeMinutes / 60) : undefined
        },
        // 근태 연동 정보 추가
        attendanceSummary: attendanceSummaryData || undefined,
        attendanceDeduction: attendanceDeductionData || undefined
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

      {/* 접근 권한 제한 메시지 */}
      {accessResult && !accessResult.canAccess && selectedEmployeeId && (
        <div className="bg-slate-100 border border-slate-300 rounded-lg p-6">
          <div className="flex items-start space-x-3">
            <Lock className="w-6 h-6 text-slate-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-slate-800 mb-2">급여 명세서 확인 불가</h4>
              <p className="text-sm text-slate-600 mb-2">
                {accessResult.reason}
              </p>
              {accessResult.availableDate && (
                <p className="text-sm text-slate-500">
                  <Calendar className="w-4 h-4 inline-block mr-1" />
                  확인 가능일: {accessResult.availableDate}
                </p>
              )}
              <p className="text-xs text-slate-400 mt-3">
                * 급여 명세서는 급여가 확정된 후(매월 말일) 확인할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 급여 설정 없음 경고 */}
      {noSettingsWarning && selectedEmployeeId && accessResult?.canAccess && (
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

      {/* 근태 데이터 로드 실패 경고 */}
      {attendanceLoadError && selectedEmployeeId && accessResult?.canAccess && !noSettingsWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-800 mb-2">근태 데이터를 불러올 수 없습니다</h4>
              <p className="text-sm text-amber-700 mb-2">
                {attendanceLoadError}
              </p>
              <p className="text-xs text-amber-600">
                * 근태 데이터가 없으면 결근 차감이 적용되지 않습니다. 근태 기록을 확인해주세요.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 근태 정보 요약 (owner 또는 차감이 있는 경우에만 표시) */}
      {attendanceSummary && accessResult?.canAccess && !noSettingsWarning && (
        (isOwner || (attendanceDeduction && attendanceDeduction.totalDeduction > 0)) && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center">
                <Clock className="w-5 h-5 mr-2 text-blue-500" />
                {selectedYear}년 {selectedMonth}월 근태 현황
              </h3>
              {attendanceDeduction && attendanceDeduction.totalDeduction > 0 && (
                <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-orange-100 text-orange-700">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  차감 발생
                </span>
              )}
            </div>

            {/* 근태 요약 그리드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="p-3 bg-emerald-50 rounded-lg text-center">
                <p className="text-xs text-emerald-600 mb-1">출근 일수</p>
                <p className="text-xl font-bold text-emerald-700">
                  {attendanceSummary.presentDays}일
                </p>
                <p className="text-xs text-emerald-500">
                  / {attendanceSummary.totalWorkDays}일
                </p>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg text-center">
                <p className="text-xs text-blue-600 mb-1">연차 사용</p>
                <p className="text-xl font-bold text-blue-700">
                  {attendanceSummary.leaveDays}일
                </p>
                <p className="text-xs text-blue-500">
                  잔여: {attendanceSummary.remainingAnnualLeave}일
                </p>
              </div>

              <div className={`p-3 rounded-lg text-center ${attendanceSummary.absentDays > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                <p className={`text-xs mb-1 ${attendanceSummary.absentDays > 0 ? 'text-red-600' : 'text-slate-600'}`}>결근</p>
                <p className={`text-xl font-bold ${attendanceSummary.absentDays > 0 ? 'text-red-700' : 'text-slate-700'}`}>
                  {attendanceSummary.absentDays}일
                </p>
              </div>

              <div className={`p-3 rounded-lg text-center ${attendanceSummary.lateCount > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
                <p className={`text-xs mb-1 ${attendanceSummary.lateCount > 0 ? 'text-amber-600' : 'text-slate-600'}`}>지각/조퇴</p>
                <p className={`text-xl font-bold ${attendanceSummary.lateCount > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
                  {attendanceSummary.lateCount + attendanceSummary.earlyLeaveCount}회
                </p>
                {(attendanceSummary.totalLateMinutes > 0 || attendanceSummary.totalEarlyLeaveMinutes > 0) && (
                  <p className="text-xs text-amber-500">
                    {attendanceSummary.totalLateMinutes + attendanceSummary.totalEarlyLeaveMinutes}분
                  </p>
                )}
              </div>
            </div>

            {/* 차감 상세 내역 */}
            {attendanceDeduction && attendanceDeduction.totalDeduction > 0 && (
              <div className="mt-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
                <h4 className="font-medium text-orange-800 mb-3 flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  근태 관련 급여 차감 내역 (근로기준법 기준)
                </h4>
                <div className="space-y-2 text-sm">
                  {attendanceDeduction.deductionDetails.map((detail, index) => (
                    <div key={index} className="flex justify-between items-center py-1 border-b border-orange-100">
                      <span className="text-orange-700">{detail.description}</span>
                      <span className="font-medium text-orange-800">-{formatCurrency(detail.amount)}원</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 font-medium">
                    <span className="text-orange-800">총 차감액</span>
                    <span className="text-lg text-orange-900">-{formatCurrency(attendanceDeduction.totalDeduction)}원</span>
                  </div>
                </div>
                <p className="text-xs text-orange-600 mt-3">
                  * 무단결근: 일급 × 결근일수 + 주휴수당 차감 | 지각/조퇴: 시급 × 해당 시간 차감
                </p>
              </div>
            )}

            {/* 초과근무 정보 */}
            {attendanceSummary.overtimeMinutes > 0 && (
              <div className="mt-4 p-4 bg-purple-50 rounded-lg">
                <h4 className="font-medium text-purple-800 mb-2">초과근무 정보</h4>
                <p className="text-sm text-purple-700">
                  연장근로: {Math.floor(attendanceSummary.overtimeMinutes / 60)}시간 {attendanceSummary.overtimeMinutes % 60}분
                </p>
              </div>
            )}
          </div>
        )
      )}

      {/* 계산 결과 표시 */}
      {calculationResult && selectedEmployeeId && !noSettingsWarning && accessResult?.canAccess && (
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
                  {/* 세후 계약에서 근태 차감이 적용된 경우 표시 */}
                  {formState.salaryType === 'net' && attendanceDeduction && attendanceDeduction.totalDeduction > 0 && (
                    <tr className="border-b bg-orange-50">
                      <td className="py-2 text-orange-700 text-xs">
                        ↳ 근태 차감 적용됨
                        <span className="block text-orange-500">
                          (원 목표: {formatCurrency(salarySettings[selectedEmployeeId || '']?.targetAmount || 0)}원)
                        </span>
                      </td>
                      <td className="py-2 text-right text-orange-700 text-xs">
                        -{formatCurrency(attendanceDeduction.totalDeduction)}원
                      </td>
                    </tr>
                  )}
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
                      <td className="py-2 text-slate-600">
                        기타공제
                        {/* 세전 계약에서 근태 차감이 포함된 경우 표시 */}
                        {formState.salaryType === 'gross' && attendanceDeduction && attendanceDeduction.totalDeduction > 0 && (
                          <span className="block text-xs text-orange-600">
                            (근태 차감 {formatCurrency(attendanceDeduction.totalDeduction)}원 포함)
                          </span>
                        )}
                      </td>
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
              familyCount: formState.familyCount,
              workDays: attendanceSummary?.presentDays,
              totalWorkHours: attendanceSummary ? Math.round(attendanceSummary.presentDays * 8) : undefined,
              overtimeHours: attendanceSummary ? Math.round(attendanceSummary.overtimeMinutes / 60) : undefined
            }
          }}
          clinicName={user.clinic_name || '치과의원'}
          onClose={() => setShowPreview(false)}
          attendanceSummary={attendanceSummary || undefined}
          attendanceDeduction={attendanceDeduction || undefined}
        />
      )}
    </div>
  )
}
