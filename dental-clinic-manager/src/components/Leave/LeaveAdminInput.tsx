'use client'

import { useState, useEffect } from 'react'
import { FileText, Plus, Trash2, User, Calendar, AlertCircle, CheckCircle } from 'lucide-react'
import { leaveService } from '@/lib/leaveService'
import type { LeaveType } from '@/types/leave'

interface LeaveAdminInputProps {
  year: number
  leaveTypes: LeaveType[]
  onSuccess: () => void
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

export default function LeaveAdminInput({ year, leaveTypes, onSuccess }: LeaveAdminInputProps) {
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<any[]>([])
  const [balances, setBalances] = useState<any[]>([])
  const [adjustments, setAdjustments] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // 조정 폼
  const [formData, setFormData] = useState({
    adjustment_type: 'deduct' as 'deduct' | 'add',
    days: '',
    reason: '',
    leave_type_id: '',
    use_date: '',
  })

  useEffect(() => {
    loadData()
  }, [year])

  useEffect(() => {
    if (selectedUser) {
      loadAdjustments(selectedUser)
    }
  }, [selectedUser])

  const loadData = async () => {
    setLoading(true)
    try {
      const [staffResult, balanceResult] = await Promise.all([
        leaveService.getStaffList(),
        leaveService.getAllEmployeeBalances(year),
      ])
      setStaff(staffResult.data || [])
      setBalances(balanceResult.data || [])
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadAdjustments = async (userId: string) => {
    const result = await leaveService.getAdjustments(userId, year)
    setAdjustments(result.data || [])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!selectedUser) {
      setError('직원을 선택해주세요.')
      return
    }
    if (!formData.days || Number(formData.days) <= 0) {
      setError('일수를 입력해주세요.')
      return
    }
    if (!formData.reason.trim()) {
      setError('사유를 입력해주세요.')
      return
    }

    setLoading(true)

    try {
      const result = await leaveService.addAdjustment({
        user_id: selectedUser,
        adjustment_type: formData.adjustment_type,
        days: Number(formData.days),
        year,
        reason: formData.reason,
        leave_type_id: formData.leave_type_id || undefined,
        use_date: formData.use_date || undefined,
      })

      if (result.error) {
        setError(result.error)
      } else {
        setSuccess('연차 조정이 완료되었습니다.')
        setFormData({
          adjustment_type: 'deduct',
          days: '',
          reason: '',
          leave_type_id: '',
          use_date: '',
        })
        loadAdjustments(selectedUser)
        loadData() // 잔여 연차 갱신
        onSuccess()
      }
    } catch (err) {
      console.error('Error adding adjustment:', err)
      setError('연차 조정 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAdjustment = async (adjustmentId: string) => {
    if (!confirm('이 조정을 삭제하시겠습니까?')) return

    const result = await leaveService.deleteAdjustment(adjustmentId)
    if (result.error) {
      setError(result.error)
    } else {
      setSuccess('조정이 삭제되었습니다.')
      loadAdjustments(selectedUser)
      loadData()
    }
    setTimeout(() => {
      setError('')
      setSuccess('')
    }, 3000)
  }

  const handleInitializeBalance = async (userId: string) => {
    setLoading(true)
    const result = await leaveService.initializeBalance(userId, year)
    if (result.error) {
      setError(result.error)
    } else {
      setSuccess('연차가 초기화되었습니다.')
      loadData()
    }
    setLoading(false)
    setTimeout(() => {
      setError('')
      setSuccess('')
    }, 3000)
  }

  // 선택된 직원의 잔여 연차
  const selectedBalance = balances.find(b => b.user_id === selectedUser)
  const selectedStaff = staff.find(s => s.id === selectedUser)

  if (loading && staff.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3 pb-3 mb-4 border-b border-slate-200">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-50 text-purple-600">
          <FileText className="w-4 h-4" />
        </div>
        <h3 className="text-base font-semibold text-slate-800">
          연차 관리 (소진 연차 입력)
        </h3>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 왼쪽: 직원 목록 */}
        <div className="border border-slate-200 rounded-lg">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h4 className="font-medium text-slate-800">직원 선택</h4>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {staff.map((member) => {
              const balance = balances.find(b => b.user_id === member.id)
              return (
                <div
                  key={member.id}
                  onClick={() => setSelectedUser(member.id)}
                  className={`p-4 border-b border-slate-100 cursor-pointer transition-colors ${
                    selectedUser === member.id
                      ? 'bg-blue-50 border-l-4 border-l-blue-500'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-slate-500" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{member.name}</p>
                        <p className="text-xs text-slate-500">{getRoleLabel(member.role)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-indigo-600">
                        잔여 {balance?.remaining_days ?? '-'}일
                      </p>
                      <p className="text-xs text-slate-400">
                        {balance ? `${balance.used_days}/${balance.total_days}` : '미설정'}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 오른쪽: 조정 입력 */}
        <div>
          {selectedUser ? (
            <div className="space-y-4">
              {/* 선택된 직원 정보 */}
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold text-slate-800">{selectedStaff?.name}</p>
                    <p className="text-xs text-slate-500">
                      {selectedStaff?.hire_date
                        ? `입사일: ${new Date(selectedStaff.hire_date).toLocaleDateString('ko-KR')}`
                        : '입사일 미등록'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleInitializeBalance(selectedUser)}
                    className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-white border border-blue-200 rounded-lg hover:bg-blue-50"
                  >
                    연차 재계산
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white rounded-lg p-2">
                    <p className="text-xs text-slate-500">총 연차</p>
                    <p className="font-bold text-blue-600">{selectedBalance?.total_days ?? 0}일</p>
                  </div>
                  <div className="bg-white rounded-lg p-2">
                    <p className="text-xs text-slate-500">사용</p>
                    <p className="font-bold text-green-600">{selectedBalance?.used_days ?? 0}일</p>
                  </div>
                  <div className="bg-white rounded-lg p-2">
                    <p className="text-xs text-slate-500">잔여</p>
                    <p className="font-bold text-indigo-600">{selectedBalance?.remaining_days ?? 0}일</p>
                  </div>
                </div>
              </div>

              {/* 조정 입력 폼 */}
              <form onSubmit={handleSubmit} className="border border-slate-200 rounded-lg p-4 space-y-4">
                <h5 className="font-medium text-slate-800 flex items-center">
                  <Plus className="w-4 h-4 mr-2" />
                  연차 조정 추가
                </h5>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      조정 유형 *
                    </label>
                    <select
                      value={formData.adjustment_type}
                      onChange={(e) => setFormData({ ...formData, adjustment_type: e.target.value as any })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    >
                      <option value="deduct">차감 (이미 사용한 연차)</option>
                      <option value="add">추가 (연차 부여)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      일수 *
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={formData.days}
                      onChange={(e) => setFormData({ ...formData, days: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      placeholder="1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      연차 종류
                    </label>
                    <select
                      value={formData.leave_type_id}
                      onChange={(e) => setFormData({ ...formData, leave_type_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    >
                      <option value="">선택 안함</option>
                      {leaveTypes.map((type) => (
                        <option key={type.id} value={type.id}>{type.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      사용일자
                    </label>
                    <input
                      type="date"
                      value={formData.use_date}
                      onChange={(e) => setFormData({ ...formData, use_date: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    사유 *
                  </label>
                  <textarea
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    placeholder="조정 사유를 입력해주세요 (예: 시스템 도입 전 사용한 연차)"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? '처리 중...' : '조정 추가'}
                </button>
              </form>

              {/* 조정 내역 */}
              {adjustments.length > 0 && (
                <div className="border border-slate-200 rounded-lg">
                  <div className="p-3 border-b border-slate-200 bg-slate-50">
                    <h5 className="font-medium text-slate-800 text-sm">조정 내역</h5>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {adjustments.map((adj) => (
                      <div key={adj.id} className="p-3 flex items-center justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                              adj.adjustment_type === 'deduct'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {adj.adjustment_type === 'deduct' ? '차감' : '추가'}
                            </span>
                            <span className="font-medium">{adj.days}일</span>
                            {adj.leave_types && (
                              <span className="text-xs text-slate-500">({adj.leave_types.name})</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">{adj.reason}</p>
                          <p className="text-xs text-slate-400">
                            {new Date(adj.adjusted_at).toLocaleDateString('ko-KR')} - {adj.adjusted_by_user?.name}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteAdjustment(adj.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 border border-slate-200 rounded-lg bg-slate-50">
              <div className="text-center text-slate-500">
                <User className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p>왼쪽에서 직원을 선택해주세요</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
