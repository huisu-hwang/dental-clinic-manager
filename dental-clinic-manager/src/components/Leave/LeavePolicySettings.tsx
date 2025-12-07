'use client'

import { useState, useEffect } from 'react'
import { Settings, Save, AlertCircle, CheckCircle, Info } from 'lucide-react'
import { leaveService } from '@/lib/leaveService'
import type { LeavePolicy, YearlyLeaveRule } from '@/types/leave'

// 대한민국 근로기준법 기본 연차 규칙
const DEFAULT_KOREA_LABOR_RULES: YearlyLeaveRule[] = [
  { min_years: 0, max_years: 1, days: 11, rule: 'monthly', description: '1년 미만: 월 1일 (최대 11일)' },
  { min_years: 1, max_years: 3, days: 15, description: '1년 이상: 15일' },
  { min_years: 3, max_years: 5, days: 16, description: '3년 이상: 16일' },
  { min_years: 5, max_years: 7, days: 17, description: '5년 이상: 17일' },
  { min_years: 7, max_years: 9, days: 18, description: '7년 이상: 18일' },
  { min_years: 9, max_years: 11, days: 19, description: '9년 이상: 19일' },
  { min_years: 11, max_years: 13, days: 20, description: '11년 이상: 20일' },
  { min_years: 13, max_years: 15, days: 21, description: '13년 이상: 21일' },
  { min_years: 15, max_years: 17, days: 22, description: '15년 이상: 22일' },
  { min_years: 17, max_years: 19, days: 23, description: '17년 이상: 23일' },
  { min_years: 19, max_years: 21, days: 24, description: '19년 이상: 24일' },
  { min_years: 21, max_years: 100, days: 25, description: '21년 이상: 25일 (최대)' },
]

export default function LeavePolicySettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [policy, setPolicy] = useState<LeavePolicy | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // 폼 데이터
  const [formData, setFormData] = useState({
    policy_name: '기본 연차 정책 (근로기준법)',
    description: '대한민국 근로기준법에 따른 연차 정책',
    base_annual_days: 15,
    carryover_enabled: false,
    carryover_max_days: 0,
    carryover_expiry_months: 12,
    min_attendance_rate: 80,
    require_manager_approval: true, // 실장 결재 포함 여부
    use_custom_rules: false,
    days_per_year: DEFAULT_KOREA_LABOR_RULES,
  })

  useEffect(() => {
    loadPolicy()
  }, [])

  const loadPolicy = async () => {
    setLoading(true)
    try {
      const result = await leaveService.getDefaultPolicy()
      if (result.data) {
        setPolicy(result.data)
        setFormData({
          policy_name: result.data.policy_name || '기본 연차 정책 (근로기준법)',
          description: result.data.description || '',
          base_annual_days: result.data.base_annual_days || 15,
          carryover_enabled: result.data.carryover_enabled || false,
          carryover_max_days: result.data.carryover_max_days || 0,
          carryover_expiry_months: result.data.carryover_expiry_months || 12,
          min_attendance_rate: result.data.min_attendance_rate || 80,
          require_manager_approval: result.data.require_manager_approval ?? true, // 기본값 true
          use_custom_rules: false, // 커스텀 규칙 사용 여부
          days_per_year: result.data.days_per_year || DEFAULT_KOREA_LABOR_RULES,
        })
      }
    } catch (err) {
      console.error('Error loading policy:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)

    try {
      const policyData: Partial<LeavePolicy> = {
        id: policy?.id,
        policy_name: formData.policy_name,
        description: formData.description,
        base_annual_days: formData.base_annual_days,
        carryover_enabled: formData.carryover_enabled,
        carryover_max_days: formData.carryover_enabled ? formData.carryover_max_days : null,
        carryover_expiry_months: formData.carryover_expiry_months,
        min_attendance_rate: formData.min_attendance_rate,
        require_manager_approval: formData.require_manager_approval,
        days_per_year: formData.days_per_year,
        is_active: true,
        is_default: true,
      }

      const result = await leaveService.upsertPolicy(policyData)

      if (result.error) {
        setError(result.error)
      } else {
        setSuccess('연차 정책이 저장되었습니다.')
        setPolicy(result.data)
      }
    } catch (err) {
      console.error('Error saving policy:', err)
      setError('정책 저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
      setTimeout(() => {
        setError('')
        setSuccess('')
      }, 3000)
    }
  }

  const handleResetToDefault = () => {
    if (!confirm('근로기준법 기본 설정으로 초기화하시겠습니까?')) return

    setFormData({
      ...formData,
      days_per_year: DEFAULT_KOREA_LABOR_RULES,
      use_custom_rules: false,
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3 pb-3 mb-4 border-b border-slate-200">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-600">
          <Settings className="w-4 h-4" />
        </div>
        <h3 className="text-base font-semibold text-slate-800">연차 정책 설정</h3>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm flex items-center">
          <AlertCircle className="w-4 h-4 mr-2" />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm flex items-center">
          <CheckCircle className="w-4 h-4 mr-2" />
          {success}
        </div>
      )}

      {/* 안내 메시지 */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-blue-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">대한민국 근로기준법 기준</p>
            <p className="text-xs text-blue-600 mt-1">
              기본적으로 근로기준법에 따라 연차가 계산됩니다. 병원 사정에 따라 커스텀 설정이 가능합니다.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 기본 정보 */}
        <div className="border border-slate-200 rounded-lg p-4 space-y-4">
          <h4 className="font-medium text-slate-800">기본 정보</h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                정책 이름
              </label>
              <input
                type="text"
                value={formData.policy_name}
                onChange={(e) => setFormData({ ...formData, policy_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                기본 연차 일수
              </label>
              <input
                type="number"
                value={formData.base_annual_days}
                onChange={(e) => setFormData({ ...formData, base_annual_days: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              설명
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        {/* 근속연수별 연차 */}
        <div className="border border-slate-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-slate-800">근속연수별 연차 일수</h4>
            <button
              type="button"
              onClick={handleResetToDefault}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              기본값으로 초기화
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">근속연수</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600">연차 일수</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">설명</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {formData.days_per_year.map((rule, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-700">
                      {rule.min_years}년 ~ {rule.max_years === 100 ? '이상' : `${rule.max_years}년`}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        value={rule.days}
                        onChange={(e) => {
                          const newRules = [...formData.days_per_year]
                          newRules[idx] = { ...rule, days: Number(e.target.value) }
                          setFormData({ ...formData, days_per_year: newRules })
                        }}
                        className="w-16 px-2 py-1 text-center border border-slate-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{rule.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 이월 정책 */}
        <div className="border border-slate-200 rounded-lg p-4 space-y-4">
          <h4 className="font-medium text-slate-800">이월 정책</h4>

          <div className="flex items-center space-x-3">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.carryover_enabled}
                onChange={(e) => setFormData({ ...formData, carryover_enabled: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-slate-700">연차 이월 허용</span>
            </label>
          </div>

          {formData.carryover_enabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  최대 이월 일수
                </label>
                <input
                  type="number"
                  value={formData.carryover_max_days}
                  onChange={(e) => setFormData({ ...formData, carryover_max_days: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  placeholder="0 = 무제한"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  이월 연차 만료 (개월)
                </label>
                <input
                  type="number"
                  value={formData.carryover_expiry_months}
                  onChange={(e) => setFormData({ ...formData, carryover_expiry_months: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          )}
        </div>

        {/* 출근율 요건 */}
        <div className="border border-slate-200 rounded-lg p-4 space-y-4">
          <h4 className="font-medium text-slate-800">출근율 요건</h4>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              최소 출근율 (%)
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                value={formData.min_attendance_rate}
                onChange={(e) => setFormData({ ...formData, min_attendance_rate: Number(e.target.value) })}
                min="0"
                max="100"
                className="w-24 px-3 py-2 border border-slate-300 rounded-lg"
              />
              <span className="text-sm text-slate-500">% 이상 출근 시 연차 발생</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              * 근로기준법 기준 80% (연차 발생 조건)
            </p>
          </div>
        </div>

        {/* 결재 프로세스 설정 */}
        <div className="border border-slate-200 rounded-lg p-4 space-y-4">
          <h4 className="font-medium text-slate-800">결재 프로세스 설정</h4>

          <div className="space-y-3">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.require_manager_approval}
                onChange={(e) => setFormData({ ...formData, require_manager_approval: e.target.checked })}
                className="w-4 h-4 mt-0.5 text-blue-600 rounded"
              />
              <div>
                <span className="text-sm font-medium text-slate-700">실장 결재 포함</span>
                <p className="text-xs text-slate-500 mt-0.5">
                  체크 시: 직원/팀장 → <span className="font-medium text-blue-600">실장 1차 승인</span> → 원장 최종 승인
                </p>
                <p className="text-xs text-slate-500">
                  해제 시: 직원/팀장 → 원장 직접 승인
                </p>
              </div>
            </label>
          </div>

          <div className="mt-3 p-3 bg-slate-50 rounded-lg">
            <p className="text-xs font-medium text-slate-600 mb-2">현재 결재 흐름</p>
            <div className="space-y-1.5">
              <div className="flex items-center text-xs text-slate-600">
                <span className="w-16 text-slate-500">직원/팀장:</span>
                {formData.require_manager_approval ? (
                  <span>신청 → <span className="text-blue-600 font-medium">실장 승인</span> → <span className="text-green-600 font-medium">원장 최종 승인</span></span>
                ) : (
                  <span>신청 → <span className="text-green-600 font-medium">원장 직접 승인</span></span>
                )}
              </div>
              <div className="flex items-center text-xs text-slate-600">
                <span className="w-16 text-slate-500">부원장:</span>
                <span>신청 → <span className="text-green-600 font-medium">원장 직접 승인</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* 저장 버튼 */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? '저장 중...' : '정책 저장'}
          </button>
        </div>
      </form>
    </div>
  )
}
