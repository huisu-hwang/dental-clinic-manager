'use client'

import { useState, useEffect } from 'react'
import { Building2, Plus, Trash2, Calendar, Users, AlertCircle, CheckCircle, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { leaveService } from '@/lib/leaveService'
import { UserProfile } from '@/contexts/AuthContext'
import { appConfirm } from '@/components/ui/AppDialog'

interface ClinicHolidayManagerProps {
  currentUser: UserProfile
  year: number
  onSuccess?: () => void
}

// 직급 라벨
const getRoleLabel = (role: string) => {
  const labels: Record<string, string> = {
    owner: '원장',
    vice_director: '부원장',
    manager: '실장',
    team_leader: '진료팀장',
    staff: '직원',
  }
  return labels[role] || role
}

// 휴무일 타입 라벨
const getHolidayTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    company: '회사지정',
    public: '공휴일',
    special: '특별휴일',
  }
  return labels[type] || type
}

export default function ClinicHolidayManager({ currentUser, year, onSuccess }: ClinicHolidayManagerProps) {
  const [loading, setLoading] = useState(true)
  const [holidays, setHolidays] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [expandedHoliday, setExpandedHoliday] = useState<string | null>(null)
  const [applications, setApplications] = useState<Record<string, any[]>>({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // 폼 데이터
  const [formData, setFormData] = useState({
    holiday_name: '',
    holiday_type: 'company' as 'company' | 'public' | 'special',
    start_date: '',
    end_date: '',
    deduct_from_annual: true,
    deduct_days: '',
    apply_to_all: true,
    excluded_roles: [] as string[],
    description: '',
  })

  const isOwner = currentUser.role === 'owner'

  useEffect(() => {
    loadHolidays()
  }, [])

  const loadHolidays = async () => {
    try {
      // 연도에 상관없이 모든 휴무일 조회
      const result = await leaveService.getClinicHolidays()
      setHolidays(result.data || [])
    } catch (err) {
      console.error('Error loading holidays:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadApplications = async (holidayId: string) => {
    const result = await leaveService.getHolidayApplications(holidayId)
    setApplications(prev => ({
      ...prev,
      [holidayId]: result.data || []
    }))
  }

  const toggleExpand = (holidayId: string) => {
    if (expandedHoliday === holidayId) {
      setExpandedHoliday(null)
    } else {
      setExpandedHoliday(holidayId)
      if (!applications[holidayId]) {
        loadApplications(holidayId)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!formData.holiday_name.trim()) {
      setError('휴무일 이름을 입력해주세요.')
      return
    }
    if (!formData.start_date || !formData.end_date) {
      setError('휴무일 기간을 선택해주세요.')
      return
    }
    if (new Date(formData.start_date) > new Date(formData.end_date)) {
      setError('종료일은 시작일 이후여야 합니다.')
      return
    }

    try {
      const result = await leaveService.createClinicHoliday({
        holiday_name: formData.holiday_name,
        holiday_type: formData.holiday_type,
        start_date: formData.start_date,
        end_date: formData.end_date,
        deduct_from_annual: formData.deduct_from_annual,
        deduct_days: formData.deduct_days ? Number(formData.deduct_days) : undefined,
        apply_to_all: formData.apply_to_all,
        excluded_roles: formData.excluded_roles,
        description: formData.description || undefined,
      })

      if (result.error) {
        setError(result.error)
      } else {
        setSuccess('휴무일이 등록되었습니다.')
        setFormData({
          holiday_name: '',
          holiday_type: 'company',
          start_date: '',
          end_date: '',
          deduct_from_annual: true,
          deduct_days: '',
          apply_to_all: true,
          excluded_roles: [],
          description: '',
        })
        setShowForm(false)
        loadHolidays()
        onSuccess?.()
      }
    } catch (err) {
      console.error('Error creating holiday:', err)
      setError('휴무일 등록 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
      setTimeout(() => {
        setError('')
        setSuccess('')
      }, 3000)
    }
  }

  const handleDelete = async (holidayId: string, isApplied: boolean) => {
    const message = isApplied
      ? '이 휴무일을 삭제하시겠습니까?\n직원들에게 차감된 연차가 모두 복구됩니다.'
      : '이 휴무일을 삭제하시겠습니까?'

    if (!await appConfirm(message)) return

    const result = await leaveService.deleteClinicHoliday(holidayId)
    if (result.error) {
      setError(result.error)
    } else {
      setSuccess('휴무일이 삭제되었습니다.')
      loadHolidays()
      onSuccess?.()
    }
    setTimeout(() => {
      setError('')
      setSuccess('')
    }, 3000)
  }

  const handleExcludedRoleToggle = (role: string) => {
    setFormData(prev => ({
      ...prev,
      excluded_roles: prev.excluded_roles.includes(role)
        ? prev.excluded_roles.filter(r => r !== role)
        : [...prev.excluded_roles, role]
    }))
  }

  if (loading && holidays.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-at-border">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-orange-50 text-orange-600">
            <Building2 className="w-4 h-4" />
          </div>
          <h3 className="text-base font-semibold text-at-text">
            병원 휴무일 관리
          </h3>
        </div>
        {isOwner && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 text-sm font-medium text-white bg-orange-500 rounded-xl hover:bg-orange-600 flex items-center"
          >
            <Plus className="w-4 h-4 mr-1" />
            휴무일 등록
          </button>
        )}
      </div>

      {error && (
        <div className="bg-at-error-bg border border-red-200 text-at-error px-4 py-3 rounded-md text-sm flex items-center">
          <AlertCircle className="w-4 h-4 mr-2" />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-at-success-bg border border-green-200 text-at-success px-4 py-3 rounded-md text-sm flex items-center">
          <CheckCircle className="w-4 h-4 mr-2" />
          {success}
        </div>
      )}

      {/* 안내 메시지 */}
      <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-orange-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-orange-800">병원 휴무일 일괄 적용</p>
            <p className="text-xs text-orange-600 mt-1">
              여름휴가, 겨울휴가 등 병원 휴무일을 등록하고 직원들의 연차에 일괄 적용할 수 있습니다.
              적용된 휴무일은 각 직원의 연차에서 자동으로 차감됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* 휴무일 등록 폼 */}
      {showForm && isOwner && (
        <form onSubmit={handleSubmit} className="border border-at-border rounded-xl p-4 space-y-4 bg-at-surface-alt">
          <h4 className="font-medium text-at-text">새 휴무일 등록</h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-at-text mb-1">
                휴무일 이름 *
              </label>
              <input
                type="text"
                value={formData.holiday_name}
                onChange={(e) => setFormData({ ...formData, holiday_name: e.target.value })}
                className="w-full px-3 py-2 border border-at-border rounded-xl"
                placeholder="예: 2024 여름휴가"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-at-text mb-1">
                휴무일 유형
              </label>
              <select
                value={formData.holiday_type}
                onChange={(e) => setFormData({ ...formData, holiday_type: e.target.value as any })}
                className="w-full px-3 py-2 border border-at-border rounded-xl"
              >
                <option value="company">회사지정휴일</option>
                <option value="public">공휴일</option>
                <option value="special">특별휴일</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-at-text mb-1">
                시작일 *
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-at-border rounded-xl"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-at-text mb-1">
                종료일 *
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-at-border rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.deduct_from_annual}
                  onChange={(e) => setFormData({ ...formData, deduct_from_annual: e.target.checked })}
                  className="w-4 h-4 text-orange-600 rounded"
                />
                <span className="text-sm text-at-text">직원 연차에서 차감</span>
              </label>
            </div>

            {formData.deduct_from_annual && (
              <div>
                <label className="block text-sm font-medium text-at-text mb-1">
                  차감 일수 (비워두면 주말 제외 자동 계산)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={formData.deduct_days}
                  onChange={(e) => setFormData({ ...formData, deduct_days: e.target.value })}
                  className="w-32 px-3 py-2 border border-at-border rounded-xl"
                  placeholder="자동 계산"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-at-text mb-2">
              제외할 직급 (체크한 직급은 연차 차감에서 제외)
            </label>
            <div className="flex flex-wrap gap-2">
              {['owner', 'vice_director', 'manager', 'team_leader', 'staff'].map((role) => (
                <label
                  key={role}
                  className={`px-3 py-1.5 text-sm rounded-full cursor-pointer transition-colors ${
                    formData.excluded_roles.includes(role)
                      ? 'bg-orange-100 text-orange-700 border border-orange-300'
                      : 'bg-at-surface-alt text-at-text border border-at-border hover:bg-at-border'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.excluded_roles.includes(role)}
                    onChange={() => handleExcludedRoleToggle(role)}
                    className="sr-only"
                  />
                  {getRoleLabel(role)}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-at-text mb-1">
              설명 (선택)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-at-border rounded-xl"
              placeholder="휴무일에 대한 추가 설명"
            />
          </div>

          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm font-medium text-at-text bg-white border border-at-border rounded-xl hover:bg-at-surface-alt"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-xl hover:bg-orange-600 disabled:opacity-50"
            >
              {loading ? '등록 중...' : '등록'}
            </button>
          </div>
        </form>
      )}

      {/* 휴무일 목록 */}
      <div className="space-y-3">
        {holidays.length === 0 ? (
          <div className="text-center py-12 border border-at-border rounded-xl bg-at-surface-alt">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-at-text" />
            <p className="text-at-text">등록된 휴무일이 없습니다.</p>
            {isOwner && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 px-4 py-2 text-sm font-medium text-orange-600 bg-orange-50 rounded-xl hover:bg-orange-100"
              >
                휴무일 등록하기
              </button>
            )}
          </div>
        ) : (
          holidays.map((holiday) => (
            <div key={holiday.id} className="border border-at-border rounded-xl overflow-hidden">
              {/* 휴무일 헤더 */}
              <div
                className="p-4 bg-white cursor-pointer hover:bg-at-surface-alt transition-colors"
                onClick={() => toggleExpand(holiday.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      holiday.is_applied
                        ? 'bg-at-success-bg text-at-success'
                        : 'bg-orange-100 text-orange-600'
                    }`}>
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="font-medium text-at-text">{holiday.holiday_name}</h4>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          holiday.is_applied
                            ? 'bg-at-success-bg text-at-success'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {holiday.is_applied ? '적용완료' : '미적용'}
                        </span>
                      </div>
                      <p className="text-sm text-at-text">
                        {new Date(holiday.start_date).toLocaleDateString('ko-KR')} ~ {new Date(holiday.end_date).toLocaleDateString('ko-KR')}
                        <span className="ml-2">({holiday.total_days}일)</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {holiday.deduct_from_annual && (
                      <span className="px-2 py-1 text-xs font-medium bg-at-error-bg text-at-error rounded">
                        차감 {holiday.deduct_days}일
                      </span>
                    )}
                    <span className="px-2 py-1 text-xs font-medium bg-at-surface-alt text-at-text rounded">
                      {getHolidayTypeLabel(holiday.holiday_type)}
                    </span>
                    {expandedHoliday === holiday.id ? (
                      <ChevronUp className="w-5 h-5 text-at-text" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-at-text" />
                    )}
                  </div>
                </div>
              </div>

              {/* 확장된 상세 정보 */}
              {expandedHoliday === holiday.id && (
                <div className="border-t border-at-border p-4 bg-at-surface-alt space-y-4">
                  {/* 상세 정보 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-at-text">등록일</p>
                      <p className="font-medium">{new Date(holiday.created_at).toLocaleDateString('ko-KR')}</p>
                    </div>
                    <div>
                      <p className="text-at-text">등록자</p>
                      <p className="font-medium">{holiday.created_by_user?.name || '-'}</p>
                    </div>
                    {holiday.is_applied && (
                      <>
                        <div>
                          <p className="text-at-text">적용일</p>
                          <p className="font-medium">{new Date(holiday.applied_at).toLocaleDateString('ko-KR')}</p>
                        </div>
                        <div>
                          <p className="text-at-text">적용자</p>
                          <p className="font-medium">{holiday.applied_by_user?.name || '-'}</p>
                        </div>
                      </>
                    )}
                  </div>

                  {holiday.description && (
                    <div className="p-3 bg-white rounded-xl border border-at-border">
                      <p className="text-sm text-at-text">{holiday.description}</p>
                    </div>
                  )}

                  {/* 제외 역할 표시 */}
                  {holiday.excluded_roles && holiday.excluded_roles.length > 0 && (
                    <div>
                      <p className="text-sm text-at-text mb-1">차감 제외 직급:</p>
                      <div className="flex flex-wrap gap-1">
                        {holiday.excluded_roles.map((role: string) => (
                          <span key={role} className="px-2 py-0.5 text-xs bg-at-border text-at-text rounded-full">
                            {getRoleLabel(role)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 적용 기록 */}
                  {holiday.is_applied && applications[holiday.id] && applications[holiday.id].length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-at-text mb-2 flex items-center">
                        <Users className="w-4 h-4 mr-1" />
                        적용된 직원 ({applications[holiday.id].length}명)
                      </p>
                      <div className="max-h-40 overflow-y-auto border border-at-border rounded-xl bg-white">
                        <div className="divide-y divide-at-border">
                          {applications[holiday.id].map((app: any) => (
                            <div key={app.id} className="px-3 py-2 flex items-center justify-between text-sm">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-at-text">{app.users?.name}</span>
                                <span className="text-xs text-at-text">({getRoleLabel(app.users?.role)})</span>
                              </div>
                              <span className="text-at-error">-{app.deducted_days}일</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 액션 버튼 */}
                  {isOwner && (
                    <div className="flex justify-end space-x-2 pt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(holiday.id, holiday.is_applied)
                        }}
                        className="px-3 py-1.5 text-sm font-medium text-at-error bg-white border border-red-200 rounded-xl hover:bg-at-error-bg flex items-center"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
