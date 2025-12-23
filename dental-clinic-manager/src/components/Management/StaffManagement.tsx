'use client'

import { useState, useEffect } from 'react'
import { Users, UserPlus, Clock, Mail, Phone, MapPin, IdCard, Pencil, Settings, X, Check, Calendar, UserX, UserCheck } from 'lucide-react'
import { getSupabase } from '@/lib/supabase'
import { authService } from '@/lib/authService'
import { dataService } from '@/lib/dataService'
import { UserProfile } from '@/contexts/AuthContext'
import PermissionSelector from './PermissionSelector'
import type { Permission } from '@/types/permissions'
import { decryptResidentNumber, encryptResidentNumber } from '@/utils/encryptionUtils'

// 섹션 헤더 컴포넌트
const SectionHeader = ({ number, title, icon: Icon }: { number: number; title: string; icon: React.ElementType }) => (
  <div className="flex items-center space-x-3 pb-3 mb-4 border-b border-slate-200">
    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600">
      <Icon className="w-4 h-4" />
    </div>
    <h3 className="text-base font-semibold text-slate-800">
      <span className="text-blue-600 mr-1">{number}.</span>
      {title}
    </h3>
  </div>
)

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
  const [activeTab, setActiveTab] = useState<'staff' | 'resigned' | 'requests' | 'invite'>('staff')
  const [staff, setStaff] = useState<UserProfile[]>([])
  const [resignedStaff, setResignedStaff] = useState<UserProfile[]>([])
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
    resident_registration_number: '',
    hire_date: ''
  })

  // 복호화된 주민번호 저장 (userId -> 복호화된 주민번호)
  const [decryptedResidentNumbers, setDecryptedResidentNumbers] = useState<Record<string, string>>({})

  // Invite form state
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'staff' as 'vice_director' | 'manager' | 'team_leader' | 'staff'
  })

  // 퇴사 처리 모달 상태
  const [resigningStaff, setResigningStaff] = useState<UserProfile | null>(null)

  // 재입사 처리 모달 상태
  const [rehiringStaff, setRehiringStaff] = useState<UserProfile | null>(null)

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
      fetchResignedStaff()
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
        const staffData = (data as UserProfile[] | null) ?? []
        setStaff(staffData)

        // 주민번호 복호화
        const decrypted: Record<string, string> = {}
        for (const member of staffData) {
          if (member.resident_registration_number) {
            try {
              const decryptedValue = await decryptResidentNumber(member.resident_registration_number)
              if (decryptedValue) {
                decrypted[member.id] = decryptedValue
              }
            } catch (err) {
              console.error(`Failed to decrypt resident number for user ${member.id}:`, err)
            }
          }
        }
        setDecryptedResidentNumbers(decrypted)
      }
    } catch (err) {
      console.error('Error:', err)
    }
  }

  const fetchResignedStaff = async () => {
    const supabase = getSupabase()
    if (!supabase || !currentUser.clinic_id) return

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('clinic_id', currentUser.clinic_id)
        .eq('status', 'resigned') // 퇴사한 직원만 표시
        .order('updated_at', { ascending: false })

      if (error) {
        console.error('Error fetching resigned staff:', error)
      } else {
        setResignedStaff((data as UserProfile[] | null) ?? [])
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

  const handleResignUser = async () => {
    if (!resigningStaff) return

    const supabase = getSupabase()
    if (!supabase) return

    try {
      const { error } = await (supabase as any)
        .from('users')
        .update({
          status: 'resigned',
          updated_at: new Date().toISOString()
        })
        .eq('id', resigningStaff.id)

      if (error) {
        setError('퇴사 처리에 실패했습니다.')
      } else {
        setSuccess(`${resigningStaff.name}님의 퇴사 처리가 완료되었습니다.`)
        setResigningStaff(null)
        fetchStaff()
        fetchResignedStaff()
      }
    } catch (err) {
      setError('퇴사 처리 중 오류가 발생했습니다.')
    }
  }

  const handleRehireUser = async () => {
    if (!rehiringStaff) return

    const supabase = getSupabase()
    if (!supabase) return

    try {
      const { error } = await (supabase as any)
        .from('users')
        .update({
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', rehiringStaff.id)

      if (error) {
        setError('재입사 처리에 실패했습니다.')
      } else {
        setSuccess(`${rehiringStaff.name}님의 재입사 처리가 완료되었습니다.`)
        setRehiringStaff(null)
        fetchStaff()
        fetchResignedStaff()
      }
    } catch (err) {
      setError('재입사 처리 중 오류가 발생했습니다.')
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
      // 주민번호 암호화
      let encryptedResidentNumber = ''
      if (editForm.resident_registration_number && editForm.resident_registration_number.trim()) {
        const encrypted = await encryptResidentNumber(editForm.resident_registration_number)
        if (!encrypted) {
          setError('주민등록번호 암호화에 실패했습니다.')
          return
        }
        encryptedResidentNumber = encrypted
      }

      const result = await dataService.updateStaffInfo(editingStaffInfo.id, {
        name: editForm.name,
        phone: editForm.phone || '',
        address: editForm.address || '',
        resident_registration_number: encryptedResidentNumber,
        hire_date: editForm.hire_date || undefined
      })

      if (result.error) {
        setError(result.error || '직원 정보 수정에 실패했습니다.')
      } else {
        setSuccess('직원 정보가 수정되었습니다.')
        setEditingStaffInfo(null)
        setEditForm({ name: '', phone: '', address: '', resident_registration_number: '', hire_date: '' })
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
      suspended: 'bg-red-100 text-red-800',
      resigned: 'bg-slate-100 text-slate-800'
    }
    const labels = {
      active: '활성',
      pending: '대기',
      suspended: '정지',
      resigned: '퇴사'
    }
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    )
  }

  const pendingRequests = joinRequests.filter(r => r.status === 'pending')

  return (
    <div className="space-y-6">
      {/* 내부 탭 네비게이션 */}
      <div className="flex flex-wrap gap-2 pb-4 border-b border-slate-200">
        {[
          { id: 'staff', label: '직원 목록', icon: Users },
          { id: 'resigned', label: `퇴사한 직원 (${resignedStaff.length})`, icon: UserX },
          { id: 'requests', label: `가입 요청 (${pendingRequests.length})`, icon: Clock, badge: pendingRequests.length > 0 },
          { id: 'invite', label: '직원 초대', icon: UserPlus }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-blue-50 text-blue-600'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <tab.icon className="w-4 h-4 mr-2" />
            {tab.label}
            {tab.badge && (
              <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-600">
                {pendingRequests.length}
              </span>
            )}
          </button>
        ))}
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
        <div>
          <SectionHeader number={1} title="직원 목록" icon={Users} />
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">직원</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">연락처</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">직급</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">상태</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {staff.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-600 font-semibold text-sm">
                            {(member.name || ' ').charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{member.name || '이름 없음'}</p>
                          <p className="text-xs text-slate-500">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-600 space-y-0.5">
                        {member.phone && (
                          <div className="flex items-center text-xs">
                            <Phone className="w-3 h-3 mr-1" />
                            {member.phone}
                          </div>
                        )}
                        {currentUser.role === 'owner' && member.address && (
                          <div className="flex items-center text-xs">
                            <MapPin className="w-3 h-3 mr-1" />
                            {member.address}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {getRoleLabel(member.role || '')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(member.status || '')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {member.role !== 'owner' && member.status === 'active' && currentUser.role === 'owner' && (
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => {
                              setEditingStaffInfo(member)
                              const decryptedRrn = decryptedResidentNumbers[member.id] || ''
                              setEditForm({
                                name: member.name || '',
                                phone: member.phone || '',
                                address: member.address || '',
                                resident_registration_number: decryptedRrn,
                                hire_date: member.hire_date || ''
                              })
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="정보 수정"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingStaffPermissions(member)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="권한 수정"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleSuspendUser(member.id)}
                            className="p-1.5 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="사용자 정지"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setResigningStaff(member)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="퇴사 처리"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      등록된 직원이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resigned Staff Tab */}
      {activeTab === 'resigned' && (
        <div>
          <SectionHeader number={1} title="퇴사한 직원 목록" icon={UserX} />
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">직원</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">연락처</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">직급</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">상태</th>
                  {currentUser.role === 'owner' && (
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">관리</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {resignedStaff.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50 bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-slate-500 font-semibold text-sm">
                            {(member.name || ' ').charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-600">{member.name || '이름 없음'}</p>
                          <p className="text-xs text-slate-400">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-500 space-y-0.5">
                        {member.phone && (
                          <div className="flex items-center text-xs">
                            <Phone className="w-3 h-3 mr-1" />
                            {member.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-600">
                        {getRoleLabel(member.role || '')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(member.status || '')}
                    </td>
                    {currentUser.role === 'owner' && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setRehiringStaff(member)}
                          className="p-1.5 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="재입사 처리"
                        >
                          <UserCheck className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {resignedStaff.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      퇴사한 직원이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Join Requests Tab */}
      {activeTab === 'requests' && (
        <div>
          <SectionHeader number={1} title="가입 요청 목록" icon={Clock} />
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-600">요청을 불러오는 중...</p>
            </div>
          ) : joinRequests.length === 0 ? (
            <div className="text-center py-8 border border-slate-200 rounded-lg">
              <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">가입 요청이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {joinRequests.map((request) => (
                <div key={request.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center flex-wrap gap-2 mb-2">
                        <h3 className="font-semibold text-slate-800">{request.name}</h3>
                        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          {getRoleLabel(request.role)}
                        </span>
                        {request.status === 'pending' ? (
                          <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            검토 대기
                          </span>
                        ) : request.status === 'approved' ? (
                          <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            승인됨
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                            거부됨
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-2">
                        <span className="flex items-center">
                          <Mail className="w-3 h-3 mr-1" />
                          {request.email}
                        </span>
                        {request.phone && (
                          <span className="flex items-center">
                            <Phone className="w-3 h-3 mr-1" />
                            {request.phone}
                          </span>
                        )}
                        <span className="flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {new Date(request.created_at).toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                      {request.message && (
                        <div className="bg-slate-100 p-2 rounded text-xs text-slate-600">
                          {request.message}
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
                          className="flex items-center px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          승인
                        </button>
                        <button
                          onClick={() => {
                            const reason = prompt('거부 사유를 입력하세요:') || '조건에 맞지 않음'
                            handleRejectRequest(request.id, reason)
                          }}
                          className="flex items-center px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"
                        >
                          <X className="w-3 h-3 mr-1" />
                          거부
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Invite Tab */}
      {activeTab === 'invite' && (
        <div>
          <SectionHeader number={1} title="직원 초대" icon={UserPlus} />
          <div className="max-w-md">
            <form onSubmit={handleInviteUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  이메일 주소 *
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="colleague@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  직급 *
                </label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({
                    ...inviteForm,
                    role: e.target.value as 'vice_director' | 'manager' | 'team_leader' | 'staff'
                  })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center"
              >
                <Mail className="w-4 h-4 mr-2" />
                초대 링크 발송
              </button>
            </form>
            <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="text-xs font-medium text-slate-600 mb-2">초대 방법</h4>
              <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
                <li>이메일로 초대 링크가 발송됩니다</li>
                <li>링크는 7일간 유효합니다</li>
                <li>초대받은 사람이 계정을 생성하면 즉시 활성화됩니다</li>
              </ul>
            </div>
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

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <Calendar className="w-4 h-4 inline-block mr-1" />
                  입사일
                </label>
                <input
                  type="date"
                  value={editForm.hire_date}
                  onChange={(e) => setEditForm({ ...editForm, hire_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-slate-500">
                  연차 계산의 기준일로 사용됩니다
                </p>
              </div>

              <div className="flex justify-end space-x-2 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setEditingStaffInfo(null)
                    setEditForm({ name: '', phone: '', address: '', resident_registration_number: '', hire_date: '' })
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

      {/* 퇴사 처리 확인 모달 */}
      {resigningStaff && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
              <UserX className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">퇴사 처리 확인</h3>
            <p className="text-sm text-slate-600 text-center mb-6">
              <span className="font-semibold text-slate-800">{resigningStaff.name}</span>님을 퇴사 처리하시겠습니까?
              <br />
              <span className="text-xs text-slate-500 mt-1 block">
                퇴사 처리된 직원은 시스템에 로그인할 수 없습니다.
              </span>
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setResigningStaff(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleResignUser}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                퇴사 처리
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 재입사 처리 확인 모달 */}
      {rehiringStaff && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mx-auto mb-4">
              <UserCheck className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">재입사 처리 확인</h3>
            <p className="text-sm text-slate-600 text-center mb-6">
              <span className="font-semibold text-slate-800">{rehiringStaff.name}</span>님을 재입사 처리하시겠습니까?
              <br />
              <span className="text-xs text-slate-500 mt-1 block">
                재입사 처리된 직원은 시스템에 다시 로그인할 수 있습니다.
              </span>
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setRehiringStaff(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleRehireUser}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >
                재입사 처리
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}