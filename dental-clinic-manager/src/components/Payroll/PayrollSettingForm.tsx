'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, Plus, Trash2, DollarSign, Info } from 'lucide-react'
import type { PayrollSetting, SalaryType, Allowances, COMMON_ALLOWANCES } from '@/types/payroll'
import { ALLOWANCE_TO_NON_TAXABLE_TYPE } from '@/types/payroll'

interface PayrollSettingFormProps {
  setting: PayrollSetting | null
  employees: any[]
  existingSettings: PayrollSetting[]
  onSave: (data: any) => void
  onCancel: () => void
}

const COMMON_ALLOWANCES_LIST = [
  '식대',
  '교통비',
  '자가운전보조금',
  '자녀보육수당',
  '직책수당',
  '자격수당',
  '근속수당',
  '가족수당',
  '야간수당',
  '휴일수당'
]

// 비과세 항목 확인
const isNonTaxableAllowance = (name: string): boolean => {
  return !!ALLOWANCE_TO_NON_TAXABLE_TYPE[name]
}

export default function PayrollSettingForm({
  setting,
  employees,
  existingSettings,
  onSave,
  onCancel
}: PayrollSettingFormProps) {
  // 기존 설정이 있으면 총급여 계산, 없으면 0
  const initialTotalSalary = setting
    ? setting.base_salary + Object.values(setting.allowances || {}).reduce((sum, val) => sum + (Number(val) || 0), 0)
    : 0

  const [formData, setFormData] = useState({
    employee_user_id: setting?.employee_user_id || '',
    salary_type: (setting?.salary_type || 'gross') as SalaryType,
    total_salary: initialTotalSalary, // 총급여 (새로 추가)
    allowances: setting?.allowances || {} as Allowances,
    payment_day: setting?.payment_day || 25,
    national_pension: setting?.national_pension ?? true,
    health_insurance: setting?.health_insurance ?? true,
    long_term_care: setting?.long_term_care ?? true,
    employment_insurance: setting?.employment_insurance ?? true,
    income_tax_enabled: setting?.income_tax_enabled ?? true,
    dependents_count: setting?.dependents_count || 1,
    kakao_notification_enabled: setting?.kakao_notification_enabled ?? false,
    kakao_phone_number: setting?.kakao_phone_number || '',
    notes: setting?.notes || ''
  })

  const [newAllowanceName, setNewAllowanceName] = useState('')
  const [newAllowanceAmount, setNewAllowanceAmount] = useState(0)

  // 이미 설정된 직원은 선택 불가 (수정 시 제외)
  const availableEmployees = useMemo(() => {
    const settingEmployeeIds = existingSettings
      .filter(s => s.id !== setting?.id)
      .map(s => s.employee_user_id)
    return employees.filter(e => !settingEmployeeIds.includes(e.id))
  }, [employees, existingSettings, setting])

  // 선택된 직원의 전화번호로 카카오 전화번호 자동 설정
  useEffect(() => {
    if (formData.employee_user_id && !setting) {
      const employee = employees.find(e => e.id === formData.employee_user_id)
      if (employee?.phone) {
        setFormData(prev => ({
          ...prev,
          kakao_phone_number: employee.phone
        }))
      }
    }
  }, [formData.employee_user_id, employees, setting])

  // 수당 총액 계산
  const allowancesTotal = useMemo(() => {
    return Object.values(formData.allowances).reduce((sum, val) => sum + (Number(val) || 0), 0)
  }, [formData.allowances])

  // 기본급 자동 계산 (총급여 - 수당)
  const calculatedBaseSalary = useMemo(() => {
    return Math.max(0, formData.total_salary - allowancesTotal)
  }, [formData.total_salary, allowancesTotal])

  // 비과세 수당 총액 계산
  const nonTaxableTotal = useMemo(() => {
    let total = 0
    for (const [name, amount] of Object.entries(formData.allowances)) {
      if (isNonTaxableAllowance(name)) {
        total += Math.min(Number(amount) || 0, 200000) // 한도 20만원
      }
    }
    return total
  }, [formData.allowances])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.employee_user_id) {
      alert('직원을 선택해주세요.')
      return
    }

    if (formData.total_salary <= 0) {
      alert('총 급여를 입력해주세요.')
      return
    }

    if (calculatedBaseSalary < 0) {
      alert('수당 합계가 총 급여를 초과합니다.')
      return
    }

    // 저장할 데이터 (base_salary는 계산된 값 사용)
    const saveData = {
      employee_user_id: formData.employee_user_id,
      salary_type: formData.salary_type,
      base_salary: formData.total_salary, // 세후 모드에서는 총급여가 base_salary
      allowances: formData.allowances,
      payment_day: formData.payment_day,
      national_pension: formData.national_pension,
      health_insurance: formData.health_insurance,
      long_term_care: formData.long_term_care,
      employment_insurance: formData.employment_insurance,
      income_tax_enabled: formData.income_tax_enabled,
      dependents_count: formData.dependents_count,
      kakao_notification_enabled: formData.kakao_notification_enabled,
      kakao_phone_number: formData.kakao_phone_number,
      notes: formData.notes
    }

    onSave(saveData)
  }

  const addAllowance = () => {
    if (!newAllowanceName.trim() || newAllowanceName === '__custom__') {
      alert('수당 항목명을 입력해주세요.')
      return
    }

    if (newAllowanceAmount > formData.total_salary - allowancesTotal) {
      alert('수당 합계가 총 급여를 초과할 수 없습니다.')
      return
    }

    setFormData(prev => ({
      ...prev,
      allowances: {
        ...prev.allowances,
        [newAllowanceName.trim()]: newAllowanceAmount
      }
    }))
    setNewAllowanceName('')
    setNewAllowanceAmount(0)
  }

  const removeAllowance = (name: string) => {
    setFormData(prev => {
      const newAllowances = { ...prev.allowances }
      delete newAllowances[name]
      return { ...prev, allowances: newAllowances }
    })
  }

  const updateAllowanceAmount = (name: string, amount: number) => {
    // 수당 합계가 총급여를 초과하지 않도록 제한
    const otherAllowancesTotal = Object.entries(formData.allowances)
      .filter(([key]) => key !== name)
      .reduce((sum, [, val]) => sum + (Number(val) || 0), 0)

    const maxAmount = formData.total_salary - otherAllowancesTotal
    const adjustedAmount = Math.min(amount, maxAmount)

    setFormData(prev => ({
      ...prev,
      allowances: {
        ...prev.allowances,
        [name]: Math.max(0, adjustedAmount)
      }
    }))
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* 헤더 */}
      <div className="flex items-center justify-between p-6 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800">
          {setting ? '급여 설정 수정' : '급여 설정 추가'}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-slate-500" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* 직원 선택 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            직원 선택 <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.employee_user_id}
            onChange={e => setFormData(prev => ({ ...prev, employee_user_id: e.target.value }))}
            disabled={!!setting}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
          >
            <option value="">직원을 선택하세요</option>
            {availableEmployees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.role === 'owner' ? '원장' : emp.role === 'vice_director' ? '부원장' : emp.role === 'manager' ? '실장' : emp.role === 'team_leader' ? '팀장' : '직원'})
              </option>
            ))}
          </select>
        </div>

        {/* 급여 유형 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            급여 입력 기준 <span className="text-red-500">*</span>
          </label>
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="salary_type"
                value="gross"
                checked={formData.salary_type === 'gross'}
                onChange={e => setFormData(prev => ({ ...prev, salary_type: e.target.value as SalaryType }))}
                className="mr-2 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-600">세전 (총 급여 기준)</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="salary_type"
                value="net"
                checked={formData.salary_type === 'net'}
                onChange={e => setFormData(prev => ({ ...prev, salary_type: e.target.value as SalaryType }))}
                className="mr-2 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-600">세후 (실수령액 기준)</span>
            </label>
          </div>
          {formData.salary_type === 'net' && (
            <p className="mt-2 text-xs text-blue-600 flex items-center">
              <Info className="w-3 h-3 mr-1" />
              세후 기준: 입력한 총 급여가 실수령액이 되도록 세전 급여를 역산합니다.
            </p>
          )}
        </div>

        {/* 총 급여 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            {formData.salary_type === 'net' ? '목표 실수령액 (월)' : '총 급여 (월)'} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="number"
              value={formData.total_salary || ''}
              onChange={e => setFormData(prev => ({ ...prev, total_salary: parseInt(e.target.value) || 0 }))}
              className="w-full pl-10 pr-12 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="4000000"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">원</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            수당을 포함한 총 급여를 입력하세요. 기본급은 자동 계산됩니다.
          </p>
        </div>

        {/* 수당 항목 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            수당 항목 (총 급여에서 분리)
          </label>

          {/* 기존 수당 목록 */}
          {Object.entries(formData.allowances).length > 0 && (
            <div className="space-y-2 mb-4">
              {Object.entries(formData.allowances).map(([name, amount]) => (
                <div key={name} className="flex items-center space-x-2">
                  <span className="flex-1 px-3 py-2 bg-slate-100 rounded-lg text-sm">
                    {name}
                    {isNonTaxableAllowance(name) && (
                      <span className="ml-2 text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded">비과세</span>
                    )}
                  </span>
                  <div className="relative">
                    <input
                      type="number"
                      value={amount || ''}
                      onChange={e => updateAllowanceAmount(name, parseInt(e.target.value) || 0)}
                      className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">원</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAllowance(name)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 새 수당 추가 */}
          <div className="flex items-center space-x-2">
            <select
              value={newAllowanceName}
              onChange={e => setNewAllowanceName(e.target.value)}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">수당 항목 선택</option>
              {COMMON_ALLOWANCES_LIST.filter(a => !formData.allowances[a]).map(name => (
                <option key={name} value={name}>
                  {name} {isNonTaxableAllowance(name) ? '(비과세)' : ''}
                </option>
              ))}
              <option value="__custom__">직접 입력</option>
            </select>
            {newAllowanceName === '__custom__' && (
              <input
                type="text"
                placeholder="수당 항목명"
                value=""
                onChange={e => setNewAllowanceName(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            )}
            <div className="relative">
              <input
                type="number"
                value={newAllowanceAmount || ''}
                onChange={e => setNewAllowanceAmount(parseInt(e.target.value) || 0)}
                placeholder="금액"
                className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">원</span>
            </div>
            <button
              type="button"
              onClick={addAllowance}
              disabled={!newAllowanceName || newAllowanceName === '__custom__'}
              className="p-2 bg-blue-100 text-blue-600 hover:bg-blue-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* 급여 내역 표시 */}
          <div className="mt-4 p-4 bg-slate-50 rounded-lg space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600">총 급여</span>
              <span className="font-medium text-slate-800">
                {formData.total_salary.toLocaleString()}원
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600">- 수당 합계</span>
              <span className="text-slate-600">
                {allowancesTotal.toLocaleString()}원
              </span>
            </div>
            {nonTaxableTotal > 0 && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-green-600 ml-4">(비과세 수당: {nonTaxableTotal.toLocaleString()}원)</span>
              </div>
            )}
            <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
              <span className="text-sm font-medium text-slate-700">= 기본급</span>
              <span className={`text-lg font-bold ${calculatedBaseSalary >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                {calculatedBaseSalary.toLocaleString()}원
              </span>
            </div>
          </div>
        </div>

        {/* 급여일 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            급여 지급일
          </label>
          <div className="flex items-center space-x-2">
            <span className="text-slate-600">매월</span>
            <input
              type="number"
              min="1"
              max="31"
              value={formData.payment_day}
              onChange={e => setFormData(prev => ({ ...prev, payment_day: parseInt(e.target.value) || 25 }))}
              className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-center"
            />
            <span className="text-slate-600">일</span>
          </div>
        </div>

        {/* 4대보험 설정 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            4대보험 공제
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center p-3 bg-slate-50 rounded-lg">
              <input
                type="checkbox"
                checked={formData.national_pension}
                onChange={e => setFormData(prev => ({ ...prev, national_pension: e.target.checked }))}
                className="mr-3 text-blue-600 focus:ring-blue-500 rounded"
              />
              <div>
                <span className="text-sm text-slate-700">국민연금</span>
                <span className="block text-xs text-slate-500">4.5%</span>
              </div>
            </label>
            <label className="flex items-center p-3 bg-slate-50 rounded-lg">
              <input
                type="checkbox"
                checked={formData.health_insurance}
                onChange={e => setFormData(prev => ({ ...prev, health_insurance: e.target.checked }))}
                className="mr-3 text-blue-600 focus:ring-blue-500 rounded"
              />
              <div>
                <span className="text-sm text-slate-700">건강보험</span>
                <span className="block text-xs text-slate-500">3.545%</span>
              </div>
            </label>
            <label className="flex items-center p-3 bg-slate-50 rounded-lg">
              <input
                type="checkbox"
                checked={formData.long_term_care}
                onChange={e => setFormData(prev => ({ ...prev, long_term_care: e.target.checked }))}
                className="mr-3 text-blue-600 focus:ring-blue-500 rounded"
              />
              <div>
                <span className="text-sm text-slate-700">장기요양보험</span>
                <span className="block text-xs text-slate-500">건강보험의 12.95%</span>
              </div>
            </label>
            <label className="flex items-center p-3 bg-slate-50 rounded-lg">
              <input
                type="checkbox"
                checked={formData.employment_insurance}
                onChange={e => setFormData(prev => ({ ...prev, employment_insurance: e.target.checked }))}
                className="mr-3 text-blue-600 focus:ring-blue-500 rounded"
              />
              <div>
                <span className="text-sm text-slate-700">고용보험</span>
                <span className="block text-xs text-slate-500">0.9%</span>
              </div>
            </label>
          </div>
        </div>

        {/* 소득세 설정 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            소득세 공제
          </label>
          <div className="space-y-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.income_tax_enabled}
                onChange={e => setFormData(prev => ({ ...prev, income_tax_enabled: e.target.checked }))}
                className="mr-3 text-blue-600 focus:ring-blue-500 rounded"
              />
              <span className="text-sm text-slate-700">소득세 공제 적용</span>
            </label>

            {formData.income_tax_enabled && (
              <div className="ml-6">
                <label className="block text-sm text-slate-600 mb-1">부양가족 수</label>
                <input
                  type="number"
                  min="1"
                  value={formData.dependents_count}
                  onChange={e => setFormData(prev => ({ ...prev, dependents_count: parseInt(e.target.value) || 1 }))}
                  className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-center"
                />
                <span className="ml-2 text-sm text-slate-500">명 (본인 포함)</span>
              </div>
            )}
          </div>
        </div>

        {/* 카카오톡 발송 설정 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            카카오톡 알림 설정
          </label>
          <div className="space-y-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.kakao_notification_enabled}
                onChange={e => setFormData(prev => ({ ...prev, kakao_notification_enabled: e.target.checked }))}
                className="mr-3 text-blue-600 focus:ring-blue-500 rounded"
              />
              <span className="text-sm text-slate-700">급여 명세서 카카오톡 알림 발송</span>
            </label>

            {formData.kakao_notification_enabled && (
              <div className="ml-6">
                <label className="block text-sm text-slate-600 mb-1">발송 전화번호</label>
                <input
                  type="tel"
                  value={formData.kakao_phone_number}
                  onChange={e => setFormData(prev => ({ ...prev, kakao_phone_number: e.target.value }))}
                  placeholder="010-0000-0000"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* 메모 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            메모
          </label>
          <textarea
            value={formData.notes}
            onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            rows={3}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="급여 관련 메모를 입력하세요..."
          />
        </div>
      </div>

      {/* 푸터 */}
      <div className="flex justify-end space-x-3 p-6 border-t border-slate-200 bg-slate-50 rounded-b-xl">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          취소
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          저장
        </button>
      </div>
    </form>
  )
}
