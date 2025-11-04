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
  TrashIcon,
  CogIcon,
  MapPinIcon,
  IdentificationIcon,
  PencilIcon
} from '@heroicons/react/24/outline'
import { getSupabase } from '@/lib/supabase'
import { authService } from '@/lib/authService'
import { dataService } from '@/lib/dataService'
import { UserProfile } from '@/contexts/AuthContext'
import PermissionSelector from './PermissionSelector'
import type { Permission } from '@/types/permissions'

interface JoinRequest {
  id: string
  email: string
  name: string
  phone?: string
  role: string
  message?: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  approved_at?: string
  approved_by?: string
  review_note?: string
  clinic_id: string
}

interface StaffManagementProps {
  currentUser: UserProfile
}

export default function StaffManagement({ currentUser }: StaffManagementProps) {
  const [activeTab, setActiveTab] = useState<'staff' | 'requests' | 'invite'>('staff')
  const [staff, setStaff] = useState<UserProfile[]>([])
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<JoinRequest | null>(null)
  const [editingStaffPermissions, setEditingStaffPermissions] = useState<UserProfile | null>(null)
  const [editingStaffInfo, setEditingStaffInfo] = useState<UserProfile | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    address: '',
    resident_registration_number: ''
  })

  // Invite form state
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'staff' as 'vice_director' | 'manager' | 'team_leader' | 'staff'
  })

  // 주민번호 마스킹 함수
  const maskResidentNumber = (rrn: string) => {
    if (!rrn) return ''
    const cleaned = rrn.replace(/-/g, '')
    if (cleaned.length === 13) {
      return cleaned.substring(0, 6) + '-' + cleaned.substring(6, 7) + '******'
    }
    return rrn.substring(0, 8) + '******'
  }

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
        .eq('status', 'active') // 승인된 직원만 표시
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching staff:', error)
      } else {
        setStaff((data as UserProfile[] | null) ?? [])
      }
    } catch (err) {
      console.error('Error:', err)
    }
  }

  const fetchJoinRequests = async () => {
    setLoading(true)
    const supabase = getSupabase()
    if (!supabase || !currentUser.clinic_id) {
      setLoading(false)
      return
    }

    try {
      // 승인 대기 중인 사용자들을 users 테이블에서 직접 조회
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('clinic_id', currentUser.clinic_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching pending users:', error.message || error)
        setJoinRequests([])
      } else {
        // users 테이블 데이터를 JoinRequest 형식으로 직접 사용
        setJoinRequests((data as JoinRequest[] | null) ?? [])
      }
    } catch (err) {
      console.log('Join requests feature not available')
      setJoinRequests([])
    } finally {
      setLoading(false)
    }
  }

  const handleApproveRequest = async (requestId: string, permissions?: Permission[]) => {
    if (!currentUser.clinic_id) return

    try {
      const result = await dataService.approveUser(requestId, currentUser.clinic_id, permissions)

      if (result.error) {
        setError(result.error || '승인 처리에 실패했습니다.')
      } else {
        setSuccess('가입 요청이 승인되었습니다.')
        setShowPermissionModal(false)
        setSelectedRequest(null)
        fetchJoinRequests()
        fetchStaff()
      }
    } catch (err) {
      console.error('Error:', err)
      setError('승인 처리 중 오류가 발생했습니다.')
    }
  }

  const handleRejectRequest = async (requestId: string, reason: string) => {
    if (!currentUser.clinic_id) return

    try {
      const result = await dataService.rejectUser(requestId, currentUser.clinic_id, reason)

      if (result.error) {
        setError(result.error || '거부 처리에 실패했습니다.')
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

  const handleUpdateStaffInfo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingStaffInfo) return

    setError('')
    setSuccess('')

    // 유효성 검증
    if (!editForm.name.trim()) {
      setError('이름을 입력해주세요.')
      return
    }

    // 주민번호 검증 (값이 있을 때만)
    if (editForm.resident_registration_number && editForm.resident_registration_number.trim()) {
      const cleaned = editForm.resident_registration_number.replace(/-/g, '')
      if (cleaned.length !== 13 || !/^\d{13}$/.test(cleaned)) {
        setError('주민등록번호는 13자리 숫자여야 합니다.')
        return
      }
    }

    try {
      const result = await dataService.updateStaffInfo(editingStaffInfo.id, {
        name: editForm.name,
        phone: editForm.phone || '',
        address: editForm.address || '',
        resident_registration_number: editForm.resident_registration_number || ''
      })

      if (result.error) {
        setError(result.error || '직원 정보 수정에 실패했습니다.')
      } else {
        setSuccess('직원 정보가 수정되었습니다.')
        setEditingStaffInfo(null)
        setEditForm({ name: '', phone: '', address: '', resident_registration_number: '' })
        fetchStaff()
      }
    } catch (err) {
      console.error('Error updating staff info:', err)
      setError('직원 정보 수정 중 오류가 발생했습니다.')
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
                      {(member.name || ' ').charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">{member.name || '이름 없음'}</h3>
                    <div className="space-y-1 text-sm text-slate-600">
                      <div className="flex items-center">
                        <EnvelopeIcon className="h-4 w-4 mr-1" />
                        {member.email}
                      </div>
                      {member.phone && (
                        <div className="flex items-center">
                          <PhoneIcon className="h-4 w-4 mr-1" />
                          {member.phone}
                        </div>
                      )}
                      {currentUser.role === 'owner' && member.address && (
                        <div className="flex items-center">
                          <MapPinIcon className="h-4 w-4 mr-1" />
                          {member.address}
                        </div>
                      )}
                      {currentUser.role === 'owner' && member.resident_registration_number && (
                        <div className="flex items-center">
                          <IdentificationIcon className="h-4 w-4 mr-1" />
                          {maskResidentNumber(member.resident_registration_number)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                    {getRoleLabel(member.role || '')}
                  </span>
                  {getStatusBadge(member.status || '')}
                  {member.role !== 'owner' && member.status === 'active' && currentUser.role === 'owner' && (
                    <>
                      <button
                        onClick={() => {
                          setEditingStaffInfo(member)
                          // 주민번호가 13자리 숫자가 아니면 빈 문자열로 (암호화된 값 제외)
                          const rrn = member.resident_registration_number || ''
                          const cleanedRrn = rrn.replace(/-/g, '')
                          const isValidFormat = cleanedRrn.length === 13 && /^\d{13}$/.test(cleanedRrn)

                          setEditForm({
                            name: member.name || '',
                            phone: member.phone || '',
                            address: member.address || '',
                            resident_registration_number: isValidFormat ? rrn : ''
                          })
                        }}
                        className="text-blue-600 hover:text-blue-800 p-1"
                        title="정보 수정"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditingStaffPermissions(member)}
                        className="text-blue-600 hover:text-blue-800 p-1"
                        title="권한 수정"
                      >
                        <CogIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleSuspendUser(member.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="사용자 정지"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </>
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
                      <h3 className="text-lg font-semibold text-slate-800">{request.name}</h3>
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {getRoleLabel(request.role)}
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
                        {request.email}
                      </div>
                      {request.phone && (
                        <div className="flex items-center">
                          <PhoneIcon className="h-4 w-4 mr-2" />
                          {request.phone}
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
                          setSelectedRequest(request)
                          setShowPermissionModal(true)
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

      {/* Permission Selection Modal */}
      {showPermissionModal && selectedRequest && (
        <PermissionSelector
          role={selectedRequest.role}
          onSave={(permissions) => {
            handleApproveRequest(selectedRequest.id, permissions)
          }}
          onCancel={() => {
            setShowPermissionModal(false)
            setSelectedRequest(null)
          }}
        />
      )}

      {/* Edit Staff Permissions Modal */}
      {editingStaffPermissions && (
        <PermissionSelector
          role={editingStaffPermissions.role || ''}
          initialPermissions={editingStaffPermissions.permissions}
          onSave={async (permissions) => {
            try {
              const result = await dataService.updateUserPermissions(
                editingStaffPermissions.id,
                permissions
              )

              if (result.error) {
                setError(result.error || '권한 수정에 실패했습니다.')
              } else {
                setSuccess('권한이 수정되었습니다.')
                fetchStaff()
                setEditingStaffPermissions(null)
              }
            } catch (err) {
              setError('권한 수정 중 오류가 발생했습니다.')
            }
          }}
          onCancel={() => setEditingStaffPermissions(null)}
        />
      )}

      {/* Edit Staff Info Modal */}
      {editingStaffInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-slate-800 mb-4">직원 정보 수정</h3>
            <form onSubmit={handleUpdateStaffInfo} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  이름 *
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="홍길동"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  전화번호
                </label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="010-1234-5678"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  주소
                </label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="서울시 강남구..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  주민등록번호
                </label>
                <input
                  type="text"
                  value={editForm.resident_registration_number}
                  onChange={(e) => setEditForm({ ...editForm, resident_registration_number: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="900101-1234567"
                  maxLength={14}
                />
                <p className="mt-1 text-xs text-slate-500">
                  13자리 숫자로 입력 (하이픈 포함 가능)
                </p>
              </div>

              <div className="flex justify-end space-x-2 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setEditingStaffInfo(null)
                    setEditForm({ name: '', phone: '', address: '', resident_registration_number: '' })
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}