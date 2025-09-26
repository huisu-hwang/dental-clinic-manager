'use client'

import { useState, useEffect } from 'react'
import {
  UsersIcon,
  PlusIcon,
  CheckIcon,
  XMarkIcon,
  ClockIcon,
  EnvelopeIcon,
  PhoneIcon,
  ShieldCheckIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import { getSupabase } from '@/lib/supabase'
import { authService } from '@/lib/authService'
import type { User } from '@/types/auth'

interface JoinRequest {
  id: string
  user_email: string
  user_name: string
  user_phone: string
  requested_role: string
  message: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewed_at?: string
  review_note?: string
}

interface StaffManagementProps {
  currentUser: User
}

export default function StaffManagement({ currentUser }: StaffManagementProps) {
  const [activeTab, setActiveTab] = useState<'staff' | 'requests' | 'invite'>('staff')
  const [staff, setStaff] = useState<User[]>([])
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Invite form state
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'staff' as 'vice_director' | 'manager' | 'team_leader' | 'staff'
  })

  useEffect(() => {
    if (currentUser.clinic_id) {
      fetchStaff()
      fetchJoinRequests()
    }
  }, [currentUser.clinic_id])

  const fetchStaff = async () => {
    const supabase = getSupabase()
    if (!supabase || !currentUser.clinic_id) return

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('clinic_id', currentUser.clinic_id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching staff:', error)
      } else {
        const formattedStaff: User[] = (data || []).map((u: any) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          phone: u.phone,
          role: u.role,
          clinic_id: u.clinic_id,
          status: u.status,
          createdAt: new Date(u.created_at),
          updatedAt: new Date(u.updated_at),
          lastLoginAt: u.last_login_at ? new Date(u.last_login_at) : undefined,
          approvedBy: u.approved_by,
          approvedAt: u.approved_at ? new Date(u.approved_at) : undefined
        }))
        setStaff(formattedStaff)
      }
    } catch (err) {
      console.error('Error:', err)
    }
  }

  const fetchJoinRequests = async () => {
    setLoading(true)
    const supabase = getSupabase()
    if (!supabase || !currentUser.clinic_id) return

    try {
      const { data, error } = await supabase
        .from('clinic_join_requests')
        .select('*')
        .eq('clinic_id', currentUser.clinic_id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching join requests:', error)
        setError('가입 요청을 불러오는데 실패했습니다.')
      } else {
        setJoinRequests(data || [])
      }
    } catch (err) {
      console.error('Error:', err)
      setError('가입 요청을 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleApproveRequest = async (requestId: string, password: string) => {
    const supabase = getSupabase()
    if (!supabase) return

    try {
      const { data, error } = await (supabase as any)
        .rpc('approve_join_request', {
          p_request_id: requestId,
          p_reviewer_id: currentUser.id,
          p_password: password,
          p_review_note: '승인됨'
        })

      if (error || !data.success) {
        setError(data?.error || '승인 처리 중 오류가 발생했습니다.')
      } else {
        setSuccess('가입 요청이 승인되었습니다.')
        fetchJoinRequests()
        fetchStaff()
      }
    } catch (err) {
      console.error('Error:', err)
      setError('승인 처리 중 오류가 발생했습니다.')
    }
  }

  const handleRejectRequest = async (requestId: string, reason: string) => {
    const supabase = getSupabase()
    if (!supabase) return

    try {
      const { data, error } = await (supabase as any)
        .rpc('reject_join_request', {
          p_request_id: requestId,
          p_reviewer_id: currentUser.id,
          p_review_note: reason
        })

      if (error || !data.success) {
        setError(data?.error || '거부 처리 중 오류가 발생했습니다.')
      } else {
        setSuccess('가입 요청이 거부되었습니다.')
        fetchJoinRequests()
      }
    } catch (err) {
      console.error('Error:', err)
      setError('거부 처리 중 오류가 발생했습니다.')
    }
  }

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser.clinic_id) return

    setError('')
    setSuccess('')

    try {
      const result = await authService.inviteUser({
        clinicId: currentUser.clinic_id,
        email: inviteForm.email,
        role: inviteForm.role,
        invitedBy: currentUser.id
      })

      if (result.success) {
        setSuccess('초대 링크가 발송되었습니다.')
        setInviteForm({ email: '', role: 'staff' })
      } else {
        setError(result.error || '초대 발송에 실패했습니다.')
      }
    } catch (err) {
      setError('초대 발송 중 오류가 발생했습니다.')
    }
  }

  const handleSuspendUser = async (userId: string) => {
    const supabase = getSupabase()
    if (!supabase) return

    try {
      const { error } = await (supabase as any)
        .from('users')
        .update({ status: 'suspended' })
        .eq('id', userId)

      if (error) {
        setError('사용자 정지에 실패했습니다.')
      } else {
        setSuccess('사용자가 정지되었습니다.')
        fetchStaff()
      }
    } catch (err) {
      setError('사용자 정지 중 오류가 발생했습니다.')
    }
  }

  const getRoleLabel = (role: string) => {
    const roleLabels: Record<string, string> = {
      owner: '원장',
      vice_director: '부원장',
      manager: '실장',
      team_leader: '진료팀장',
      staff: '직원'
    }
    return roleLabels[role] || role
  }

  const getStatusBadge = (status: string) => {
    const badges = {
      active: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      suspended: 'bg-red-100 text-red-800'
    }
    const labels = {
      active: '활성',
      pending: '대기',
      suspended: '정지'
    }
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    )
  }

  const pendingRequests = joinRequests.filter(r => r.status === 'pending')

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <UsersIcon className="h-6 w-6 text-blue-600 mr-2" />
          <h2 className="text-xl font-bold text-slate-800">직원 관리</h2>
        </div>
        {pendingRequests.length > 0 && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            {pendingRequests.length}개의 대기 요청
          </span>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'staff', label: '직원 목록', icon: UsersIcon },
            { id: 'requests', label: `가입 요청 (${pendingRequests.length})`, icon: ClockIcon },
            { id: 'invite', label: '직원 초대', icon: PlusIcon }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm">
          {success}
        </div>
      )}

      {/* Staff List Tab */}
      {activeTab === 'staff' && (
        <div className="space-y-4">
          {staff.map((member) => (
            <div key={member.id} className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-semibold">
                      {member.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">{member.name}</h3>
                    <div className="flex items-center space-x-4 text-sm text-slate-600">
                      <span className="flex items-center">
                        <EnvelopeIcon className="h-4 w-4 mr-1" />
                        {member.email}
                      </span>
                      {member.phone && (
                        <span className="flex items-center">
                          <PhoneIcon className="h-4 w-4 mr-1" />
                          {member.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                    {getRoleLabel(member.role)}
                  </span>
                  {getStatusBadge(member.status)}
                  {member.role !== 'owner' && member.status === 'active' && (
                    <button
                      onClick={() => handleSuspendUser(member.id)}
                      className="text-red-600 hover:text-red-800 p-1"
                      title="사용자 정지"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Join Requests Tab */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-600">요청을 불러오는 중...</p>
            </div>
          ) : joinRequests.length === 0 ? (
            <div className="text-center py-8">
              <ClockIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">가입 요청이 없습니다.</p>
            </div>
          ) : (
            joinRequests.map((request) => (
              <div key={request.id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-slate-800">{request.user_name}</h3>
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {getRoleLabel(request.requested_role)}
                      </span>
                      {request.status === 'pending' ? (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          검토 대기
                        </span>
                      ) : request.status === 'approved' ? (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          승인됨
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                          거부됨
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-sm text-slate-600 mb-3">
                      <div className="flex items-center">
                        <EnvelopeIcon className="h-4 w-4 mr-2" />
                        {request.user_email}
                      </div>
                      {request.user_phone && (
                        <div className="flex items-center">
                          <PhoneIcon className="h-4 w-4 mr-2" />
                          {request.user_phone}
                        </div>
                      )}
                      <div className="flex items-center">
                        <ClockIcon className="h-4 w-4 mr-2" />
                        {new Date(request.created_at).toLocaleDateString('ko-KR')}
                      </div>
                    </div>
                    {request.message && (
                      <div className="bg-slate-50 p-3 rounded-md">
                        <p className="text-sm text-slate-700">{request.message}</p>
                      </div>
                    )}
                    {request.review_note && (
                      <div className="mt-3 bg-blue-50 p-3 rounded-md">
                        <p className="text-sm text-blue-700">
                          <strong>검토 의견:</strong> {request.review_note}
                        </p>
                      </div>
                    )}
                  </div>
                  {request.status === 'pending' && (
                    <div className="ml-4 flex space-x-2">
                      <button
                        onClick={() => {
                          const password = prompt('새 직원의 임시 비밀번호를 입력하세요:')
                          if (password) {
                            handleApproveRequest(request.id, password)
                          }
                        }}
                        className="flex items-center px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700"
                      >
                        <CheckIcon className="h-4 w-4 mr-1" />
                        승인
                      </button>
                      <button
                        onClick={() => {
                          const reason = prompt('거부 사유를 입력하세요:') || '조건에 맞지 않음'
                          handleRejectRequest(request.id, reason)
                        }}
                        className="flex items-center px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700"
                      >
                        <XMarkIcon className="h-4 w-4 mr-1" />
                        거부
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Invite Tab */}
      {activeTab === 'invite' && (
        <div className="max-w-md">
          <form onSubmit={handleInviteUser} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                이메일 주소 *
              </label>
              <input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="colleague@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                직급 *
              </label>
              <select
                value={inviteForm.role}
                onChange={(e) => setInviteForm({
                  ...inviteForm,
                  role: e.target.value as 'vice_director' | 'manager' | 'team_leader' | 'staff'
                })}
                className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="staff">직원</option>
                <option value="team_leader">진료팀장</option>
                <option value="manager">실장</option>
                <option value="vice_director">부원장</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-md transition-colors flex items-center justify-center"
            >
              <EnvelopeIcon className="h-4 w-4 mr-2" />
              초대 링크 발송
            </button>
          </form>
          <div className="mt-6 p-4 bg-blue-50 rounded-md">
            <h4 className="text-sm font-medium text-blue-800 mb-2">초대 방법:</h4>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• 이메일로 초대 링크가 발송됩니다</li>
              <li>• 링크는 7일간 유효합니다</li>
              <li>• 초대받은 사람이 계정을 생성하면 즉시 활성화됩니다</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}