'use client'

import React, { useState, useEffect } from 'react'
import {
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  Users,
  Settings,
  FileText,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Building2,
  Pencil,
  Trash2,
  Save,
  X,
} from 'lucide-react'
import { UserProfile } from '@/contexts/AuthContext'
import { leaveService, calculateAnnualLeaveDays, calculateYearsOfService } from '@/lib/leaveService'
import { usePermissions } from '@/hooks/usePermissions'
import type { EmployeeLeaveBalance, LeaveType, LeaveTypeCode } from '@/types/leave'
import { LEAVE_STATUS_NAMES, LEAVE_STATUS_COLORS, LEAVE_TYPE_NAMES } from '@/types/leave'
import LeaveRequestForm from './LeaveRequestForm'
import LeaveApprovalList from './LeaveApprovalList'
import LeaveAdminInput from './LeaveAdminInput'
import LeavePolicySettings from './LeavePolicySettings'
import ClinicHolidayManager from './ClinicHolidayManager'
import Toast from '@/components/ui/Toast'
import { appConfirm } from '@/components/ui/AppDialog'

// 섹션 헤더 컴포넌트
const SectionHeader = ({ number, title, icon: Icon }: { number: number; title: string; icon: React.ElementType }) => (
  <div className="flex items-center space-x-3 pb-3 mb-4 border-b border-at-border">
    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-at-accent-light text-at-accent">
      <Icon className="w-4 h-4" />
    </div>
    <h3 className="text-base font-semibold text-at-text">
      <span className="text-at-accent mr-1">{number}.</span>
      {title}
    </h3>
  </div>
)

// 연차 현황 카드
const LeaveBalanceCard = ({ balance, hireDate }: { balance: EmployeeLeaveBalance | null; hireDate?: string }) => {
  const yearsOfService = hireDate ? calculateYearsOfService(new Date(hireDate)) : 0
  const hasSpecialLeave = (balance?.family_event_days ?? 0) > 0 || (balance?.unpaid_days ?? 0) > 0

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-at-border">
      <h4 className="text-sm font-medium text-at-text-secondary mb-4">내 연차 현황</h4>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-xs text-at-text-weak mb-1">총 연차</p>
          <p className="text-2xl font-bold text-at-accent">{balance?.total_days ?? 0}일</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-xs text-at-text-weak mb-1">사용</p>
          <p className="text-2xl font-bold text-at-success">{balance?.used_days ?? 0}일</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-xs text-at-text-weak mb-1">승인 대기</p>
          <p className="text-2xl font-bold text-at-warning">{balance?.pending_days ?? 0}일</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-xs text-at-text-weak mb-1">잔여</p>
          <p className={`text-2xl font-bold ${(balance?.remaining_days ?? 0) < 0 ? 'text-at-error' : 'text-indigo-600'}`}>
            {balance?.remaining_days ?? 0}일
          </p>
          {(balance?.remaining_days ?? 0) < 0 && (
            <p className="text-xs text-red-500 mt-1">무급휴가 사용</p>
          )}
        </div>
      </div>

      {/* 특별휴가 사용 현황 (경조사, 무급휴가) */}
      {hasSpecialLeave && (
        <div className="mt-4 pt-4 border-t border-at-border">
          <p className="text-xs text-at-text-weak mb-2">특별휴가 사용 현황</p>
          <div className="flex gap-4">
            {(balance?.family_event_days ?? 0) > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                <span className="text-sm text-purple-700">경조사 {balance?.family_event_days}일</span>
              </div>
            )}
            {(balance?.unpaid_days ?? 0) > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-at-surface-alt rounded-lg">
                <span className="w-2 h-2 rounded-full bg-at-text-weak"></span>
                <span className="text-sm text-at-text-secondary">무급휴가 {balance?.unpaid_days}일</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-at-text-weak">
        <span>근속연수: {yearsOfService.toFixed(1)}년</span>
        {hireDate && <span>입사일: {new Date(hireDate).toLocaleDateString('ko-KR')}</span>}
      </div>
    </div>
  )
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

interface LeaveManagementProps {
  currentUser: UserProfile
  initialSubtab?: string | null  // URL에서 전달받는 subtab 파라미터
}

export default function LeaveManagement({ currentUser, initialSubtab }: LeaveManagementProps) {
  const { hasPermission } = usePermissions()

  // initialSubtab이 'approval'이면 승인 대기 탭으로 시작
  const getInitialTab = () => {
    if (initialSubtab === 'approval') return 'approval'
    return 'my'
  }
  const [activeTab, setActiveTab] = useState<'my' | 'request' | 'approval' | 'all' | 'admin' | 'holiday' | 'policy'>(getInitialTab())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'warning' | 'info'
  }>({ show: false, message: '', type: 'info' })

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ show: true, message, type })
  }

  // 데이터 상태
  const [myBalance, setMyBalance] = useState<EmployeeLeaveBalance | null>(null)
  const [myRequests, setMyRequests] = useState<any[]>([])
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [pendingCount, setPendingCount] = useState(0)

  // 권한 확인
  const canApprove = hasPermission('leave_approve_step1') || hasPermission('leave_approve_step2') || hasPermission('leave_approve_final')
  const canManageBalance = hasPermission('leave_balance_manage')
  const canManagePolicy = hasPermission('leave_policy_manage')
  const canViewAll = hasPermission('leave_request_view_all')

  // initialSubtab 변경 시 탭 동기화 (알림 클릭으로 URL 변경 시)
  useEffect(() => {
    if (initialSubtab === 'approval' && canApprove) {
      setActiveTab('approval')
    }
  }, [initialSubtab, canApprove])

  useEffect(() => {
    fetchInitialData(true)
  }, [])

  const fetchInitialData = async (isInitialLoad = false) => {
    // 초기 로딩일 때만 전체 로딩 스피너 표시 (깜빡임 방지)
    if (isInitialLoad) {
      setLoading(true)
    }
    setError('')

    try {
      // 병렬로 데이터 로드 (연도 필터 없이 전체 조회)
      const [balanceResult, requestsResult, typesResult] = await Promise.all([
        leaveService.getMyBalance(),
        leaveService.getMyRequests(),
        leaveService.getLeaveTypes(),
      ])

      // getMyBalance가 자동으로 입사일 기준 연차를 계산/갱신함
      setMyBalance(balanceResult.data)

      setMyRequests(requestsResult.data || [])

      // 연차 종류가 없으면 기본 생성
      if (typesResult.data.length === 0) {
        await leaveService.createDefaultLeaveTypes()
        const newTypes = await leaveService.getLeaveTypes()
        setLeaveTypes(newTypes.data)
      } else {
        setLeaveTypes(typesResult.data)
      }

      // 승인 대기 건수 조회
      if (canApprove) {
        const pendingResult = await leaveService.getPendingApprovals()
        setPendingCount(pendingResult.data?.length || 0)
      }
    } catch (err) {
      console.error('Error fetching leave data:', err)
      setError('데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      if (isInitialLoad) {
        setLoading(false)
      }
    }
  }

  const handleRequestSuccess = () => {
    showToast('연차가 신청되었습니다.', 'success')
    setActiveTab('my')
    fetchInitialData(false)
  }

  const handleApprovalSuccess = () => {
    showToast('처리가 완료되었습니다.', 'success')
    fetchInitialData(false)
  }

  const handleCancelRequest = async (requestId: string) => {
    if (!await appConfirm('연차 신청을 취소하시겠습니까?')) return

    const result = await leaveService.cancelRequest(requestId)
    if (result.error) {
      showToast(result.error, 'error')
    } else {
      showToast('연차 신청이 취소되었습니다.', 'success')
      fetchInitialData(false)
    }
  }

  // 탭 구성
  const tabs = [
    { id: 'my', label: '내 연차', icon: Calendar, show: true },
    { id: 'request', label: '연차 신청', icon: Plus, show: hasPermission('leave_request_create') },
    { id: 'approval', label: '승인 대기', icon: Clock, badge: pendingCount, show: canApprove },
    { id: 'all', label: '전체 현황', icon: Users, show: canViewAll },
    { id: 'admin', label: '연차 관리', icon: FileText, show: canManageBalance },
    { id: 'holiday', label: '휴무일 관리', icon: Building2, show: currentUser.role === 'owner' },
    { id: 'policy', label: '정책 설정', icon: Settings, show: canManagePolicy },
  ].filter(tab => tab.show)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 탭 네비게이션 */}
      <div className="flex flex-wrap gap-2 pb-4 border-b border-at-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-at-accent-light text-at-accent'
                : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
            }`}
          >
            <tab.icon className="w-4 h-4 mr-2" />
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-at-error-bg text-at-error">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="bg-at-error-bg border border-red-200 text-at-error px-4 py-3 rounded-xl text-sm flex items-center">
          <AlertCircle className="w-4 h-4 mr-2" />
          {error}
        </div>
      )}

      {/* 내 연차 탭 */}
      {activeTab === 'my' && (
        <div className="space-y-6">
          <SectionHeader number={1} title="내 연차 현황" icon={Calendar} />

          <LeaveBalanceCard balance={myBalance} hireDate={currentUser.hire_date} />

          <SectionHeader number={2} title="내 연차 신청 내역" icon={FileText} />

          <div className="overflow-x-auto border border-at-border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-at-surface-alt border-b border-at-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-at-text-secondary">기간</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-at-text-secondary">종류</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-at-text-secondary">일수</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-at-text-secondary">사유</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-at-text-secondary">상태</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-at-text-secondary">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-at-border">
                {myRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-at-surface-alt">
                    <td className="px-4 py-3">
                      <span className="font-medium">
                        {new Date(request.start_date).toLocaleDateString('ko-KR')}
                      </span>
                      {request.start_date !== request.end_date && (
                        <>
                          <span className="mx-1">~</span>
                          <span>{new Date(request.end_date).toLocaleDateString('ko-KR')}</span>
                        </>
                      )}
                      {request.half_day_type && (
                        <span className="ml-2 text-xs text-at-text-weak">
                          ({request.half_day_type === 'AM' ? '오전' : '오후'})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex px-2 py-1 text-xs font-medium rounded-full"
                        style={{
                          backgroundColor: `${request.leave_types?.color}20`,
                          color: request.leave_types?.color,
                        }}
                      >
                        {request.leave_types?.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-at-text-secondary">{request.total_days}일</td>
                    <td className="px-4 py-3 text-at-text-secondary max-w-xs truncate">
                      {request.reason || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${LEAVE_STATUS_COLORS[request.status as keyof typeof LEAVE_STATUS_COLORS]}`}>
                        {LEAVE_STATUS_NAMES[request.status as keyof typeof LEAVE_STATUS_NAMES]}
                      </span>
                      {request.status === 'pending' && request.current_step && request.total_steps && (
                        <span className="ml-2 text-xs text-at-text-weak">
                          ({request.current_step}/{request.total_steps}단계)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {request.status === 'pending' && (
                        <button
                          onClick={() => handleCancelRequest(request.id)}
                          className="text-at-error hover:text-at-error text-sm"
                        >
                          취소
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {myRequests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-at-text-weak">
                      연차 신청 내역이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 연차 신청 탭 */}
      {activeTab === 'request' && (
        <LeaveRequestForm
          leaveTypes={leaveTypes}
          balance={myBalance}
          existingRequests={myRequests}
          onSuccess={handleRequestSuccess}
          onCancel={() => setActiveTab('my')}
        />
      )}

      {/* 승인 대기 탭 */}
      {activeTab === 'approval' && canApprove && (
        <LeaveApprovalList
          currentUser={currentUser}
          onSuccess={handleApprovalSuccess}
        />
      )}

      {/* 전체 현황 탭 */}
      {activeTab === 'all' && canViewAll && (
        <div className="space-y-6">
          <SectionHeader number={1} title="전체 직원 연차 현황" icon={Users} />
          <AllEmployeeBalances />
        </div>
      )}

      {/* 연차 관리 탭 (소진 연차 입력) */}
      {activeTab === 'admin' && canManageBalance && (
        <LeaveAdminInput
          year={new Date().getFullYear()}
          leaveTypes={leaveTypes}
          onSuccess={handleApprovalSuccess}
        />
      )}

      {/* 병원 휴무일 관리 탭 */}
      {activeTab === 'holiday' && currentUser.role === 'owner' && (
        <ClinicHolidayManager
          currentUser={currentUser}
          year={new Date().getFullYear()}
          onSuccess={fetchInitialData}
        />
      )}

      {/* 정책 설정 탭 */}
      {activeTab === 'policy' && canManagePolicy && (
        <LeavePolicySettings />
      )}

      {/* Toast 팝업 */}
      <Toast
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />
    </div>
  )
}

// 연차 종류별 색상 매핑
const LEAVE_TYPE_COLORS: Record<string, string> = {
  annual: '#3B82F6',      // 파랑 - 연차
  half_day: '#10B981',    // 초록 - 반차
  sick: '#F59E0B',        // 주황 - 병가
  family_event: '#8B5CF6', // 보라 - 경조사
  compensatory: '#06B6D4', // 청록 - 대체휴가
  unpaid: '#6B7280',      // 회색 - 무급휴가
}

// 연차 차감 대상 종류 (총 연차에서 차감되는 종류)
const DEDUCT_LEAVE_TYPES: LeaveTypeCode[] = ['annual', 'half_day', 'sick']

// 종류별 사용 내역 표시 컴포넌트
const LeaveByTypeCell = ({
  byType,
  filterTypes,
  emptyText = '-'
}: {
  byType?: Record<string, number>
  filterTypes?: LeaveTypeCode[]
  emptyText?: string
}) => {
  if (!byType || Object.keys(byType).length === 0) {
    return <span className="text-at-text-weak">{emptyText}</span>
  }

  // 필터가 있으면 해당 종류만 표시
  const filteredEntries = Object.entries(byType).filter(([code, days]) => {
    if (days <= 0) return false
    if (filterTypes) return filterTypes.includes(code as LeaveTypeCode)
    return true
  })

  if (filteredEntries.length === 0) {
    return <span className="text-at-text-weak">{emptyText}</span>
  }

  return (
    <div className="flex flex-col gap-0.5">
      {filteredEntries.map(([code, days]) => (
        <div
          key={code}
          className="flex items-center gap-1 text-xs"
          style={{ color: LEAVE_TYPE_COLORS[code] || '#64748b' }}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LEAVE_TYPE_COLORS[code] || '#64748b' }}></span>
          <span>{LEAVE_TYPE_NAMES[code as LeaveTypeCode] || code}</span>
          <span className="font-medium">{days}일</span>
        </div>
      ))}
    </div>
  )
}

// 연차 내역 수정 폼 상태 타입
interface EditingRequest {
  id: string
  start_date: string
  end_date: string
  leave_type_id: string
  total_days: number
  half_day_type: string | null
  reason: string
}

// 전체 직원 연차 현황 컴포넌트
function AllEmployeeBalances() {
  const { hasPermission } = usePermissions()
  const canManageBalance = hasPermission('leave_balance_manage')

  const [balances, setBalances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedUserRequests, setSelectedUserRequests] = useState<any[]>([])
  const [selectedUserHolidayDetails, setSelectedUserHolidayDetails] = useState<{
    publicHolidays: Array<{ date: string; name: string }>
    clinicHolidays: Array<{ holiday_name: string; start_date: string; deduct_days: number }>
    clinicHolidayAdjustments: Array<{ reason: string; days: number }>
  } | null>(null)
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [editingRequest, setEditingRequest] = useState<EditingRequest | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  useEffect(() => {
    loadBalances()
    loadLeaveTypes()
  }, [])

  const loadBalances = async () => {
    const result = await leaveService.getAllEmployeeBalances()
    setBalances(result.data || [])
    setLoading(false)
  }

  const loadLeaveTypes = async () => {
    const result = await leaveService.getLeaveTypes()
    setLeaveTypes(result.data || [])
  }

  const handleRowClick = async (userId: string) => {
    if (selectedUserId === userId) {
      setSelectedUserId(null)
      setSelectedUserRequests([])
      setSelectedUserHolidayDetails(null)
      setEditingRequest(null)
      return
    }

    setSelectedUserId(userId)
    setLoadingRequests(true)
    setEditingRequest(null)
    setSelectedUserHolidayDetails(null)

    const item = balances.find(b => b.user_id === userId)

    const [requestsResult, holidayDetailsResult] = await Promise.all([
      leaveService.getAllRequests({ userId, status: 'approved' }),
      item?.leave_period_start && item?.leave_period_end
        ? leaveService.getHolidayDeductionDetails({
            userId,
            periodStart: item.leave_period_start,
            periodEnd: item.leave_period_end,
            periodYear: parseInt(item.leave_period_start.substring(0, 4)),
          })
        : Promise.resolve({ publicHolidays: [], clinicHolidays: [], clinicHolidayAdjustments: [], error: null }),
    ])

    setSelectedUserRequests(requestsResult.data || [])
    setSelectedUserHolidayDetails(holidayDetailsResult)
    setLoadingRequests(false)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  const getLeaveStatus = (startDate: string) => {
    const today = new Date().toISOString().split('T')[0]
    return startDate <= today ? '사용 완료' : '사용 예정'
  }

  const calculateDeductTotal = (byType?: Record<string, number>) => {
    if (!byType) return 0
    return DEDUCT_LEAVE_TYPES.reduce((sum, code) => sum + (byType[code] || 0), 0)
  }

  // 수정 모드 시작
  const startEditing = (request: any) => {
    setEditingRequest({
      id: request.id,
      start_date: request.start_date,
      end_date: request.end_date,
      leave_type_id: request.leave_type_id,
      total_days: request.total_days,
      half_day_type: request.half_day_type || null,
      reason: request.reason || '',
    })
  }

  // 수정 취소
  const cancelEditing = () => {
    setEditingRequest(null)
  }

  // 수정 저장
  const saveEditing = async () => {
    if (!editingRequest) return
    setSaving(true)

    const result = await leaveService.updateApprovedRequest(editingRequest.id, {
      start_date: editingRequest.start_date,
      end_date: editingRequest.end_date,
      leave_type_id: editingRequest.leave_type_id,
      total_days: editingRequest.total_days,
      half_day_type: editingRequest.half_day_type,
      reason: editingRequest.reason,
    })

    setSaving(false)

    if (result.error) {
      setToast({ show: true, message: result.error, type: 'error' })
    } else {
      setToast({ show: true, message: '연차 내역이 수정되었습니다.', type: 'success' })
      setEditingRequest(null)
      // 데이터 새로고침
      if (selectedUserId) {
        const res = await leaveService.getAllRequests({ userId: selectedUserId, status: 'approved' })
        setSelectedUserRequests(res.data || [])
      }
      await loadBalances()
    }
  }

  // 삭제
  const handleDelete = async (requestId: string, userName: string) => {
    if (!await appConfirm(`${userName}님의 이 연차 내역을 삭제하시겠습니까?\n삭제하면 연차 잔여일이 재계산됩니다.`)) return

    const result = await leaveService.deleteApprovedRequest(requestId)

    if (result.error) {
      setToast({ show: true, message: result.error, type: 'error' })
    } else {
      setToast({ show: true, message: '연차 내역이 삭제되었습니다.', type: 'success' })
      if (selectedUserId) {
        const res = await leaveService.getAllRequests({ userId: selectedUserId, status: 'approved' })
        setSelectedUserRequests(res.data || [])
      }
      await loadBalances()
    }
  }

  // 수정 폼 필드 업데이트
  const updateEditField = (field: keyof EditingRequest, value: any) => {
    if (!editingRequest) return
    const updated = { ...editingRequest, [field]: value }

    // 날짜 변경 시 일수 자동 계산
    if (field === 'start_date' || field === 'end_date') {
      if (updated.half_day_type) {
        updated.total_days = 0.5
      } else if (updated.start_date && updated.end_date) {
        const start = new Date(updated.start_date)
        const end = new Date(updated.end_date)
        let days = 0
        const current = new Date(start)
        while (current <= end) {
          const day = current.getDay()
          if (day !== 0 && day !== 6) days++
          current.setDate(current.getDate() + 1)
        }
        updated.total_days = days
      }
    }

    // 반차 선택 시 일수 0.5로, end_date = start_date로
    if (field === 'half_day_type') {
      if (value) {
        updated.total_days = 0.5
        updated.end_date = updated.start_date
      } else {
        // 반차 해제 시 1일로
        updated.total_days = 1
      }
    }

    // 연차 종류 변경 시 반차 타입 조회
    if (field === 'leave_type_id') {
      const selectedType = leaveTypes.find(t => t.id === value)
      if (selectedType?.code === 'half_day') {
        updated.half_day_type = updated.half_day_type || 'AM'
        updated.total_days = 0.5
        updated.end_date = updated.start_date
      } else {
        updated.half_day_type = null
      }
    }

    setEditingRequest(updated)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-at-accent"></div>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto border border-at-border rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-at-surface-alt border-b border-at-border">
              <th className="px-4 py-3 text-left text-xs font-semibold text-at-text-secondary">직원</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-at-text-secondary">직급</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-at-text-secondary">총 연차</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-at-text-secondary">
                <div>이미 사용</div>
                <div className="text-[10px] text-at-text-weak font-normal">(연차/반차/병가)</div>
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-at-text-secondary">
                <div>사용 예정</div>
                <div className="text-[10px] text-at-text-weak font-normal">(연차/반차/병가)</div>
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-at-text-secondary">잔여</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-at-text-secondary">사용률</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-at-border">
            {balances.map((item) => {
              const usageRate = item.total_days > 0
                ? Math.round((item.used_days / item.total_days) * 100)
                : 0
              const isSelected = selectedUserId === item.user_id

              const usedDeductTotal = calculateDeductTotal(item.used_by_type)
              const pendingDeductTotal = calculateDeductTotal(item.pending_by_type)

              return (
                <React.Fragment key={item.id}>
                  <tr
                    className={`hover:bg-at-surface-alt cursor-pointer transition-colors ${isSelected ? 'bg-at-accent-light' : ''}`}
                    onClick={() => handleRowClick(item.user_id)}
                  >
                    <td className="px-4 py-3 font-medium text-at-text">
                      <div className="flex items-center gap-2">
                        {isSelected ? (
                          <ChevronDown className="w-4 h-4 text-at-accent" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-at-text-weak" />
                        )}
                        <div>
                          <div>{item.user_name || '알 수 없음'}</div>
                          {item.leave_period_start && item.leave_period_end && (
                            <div className="text-[10px] text-at-text-weak font-normal">
                              {item.leave_period_start.slice(5).replace('-', '/')} ~ {item.leave_period_end.slice(5).replace('-', '/')}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-at-tag text-at-accent">
                        {getRoleLabel(item.user_role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-medium">{item.total_days}일</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-medium text-at-success">{item.used_days}일</span>
                        <LeaveByTypeCell byType={item.used_by_type} filterTypes={DEDUCT_LEAVE_TYPES} emptyText="" />
                        {(item.public_holiday_deduct_days ?? 0) > 0 && (
                          <div className="flex items-center gap-1 text-xs" style={{ color: '#6366F1' }}>
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#6366F1' }}></span>
                            <span>법정 공휴일</span>
                            <span className="font-medium">{item.public_holiday_deduct_days}일</span>
                          </div>
                        )}
                        {(item.clinic_holiday_deduct_days ?? 0) > 0 && (
                          <div className="flex items-center gap-1 text-xs" style={{ color: '#F97316' }}>
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#F97316' }}></span>
                            <span>병원 지정 휴무일</span>
                            <span className="font-medium">{item.clinic_holiday_deduct_days}일</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-medium text-at-warning">{pendingDeductTotal}일</span>
                        <LeaveByTypeCell byType={item.pending_by_type} emptyText="" />
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-center font-semibold ${item.remaining_days < 0 ? 'text-at-error' : 'text-indigo-600'}`}>
                      {item.remaining_days}일
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 bg-at-border rounded-full h-2">
                          <div
                            className="bg-at-accent h-2 rounded-full"
                            style={{ width: `${Math.min(usageRate, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-at-text-weak">{usageRate}%</span>
                      </div>
                    </td>
                  </tr>
                  {/* 선택된 직원의 연차 내역 */}
                  {isSelected && (
                    <tr>
                      <td colSpan={7} className="px-0 py-0 bg-at-surface-alt">
                        <div className="px-6 py-4 border-t border-at-border">
                          <h4 className="text-sm font-semibold text-at-text-secondary mb-3 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            {item.user_name}님의 연차 사용 내역
                          </h4>
                          {loadingRequests ? (
                            <div className="flex justify-center py-4">
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-at-accent"></div>
                            </div>
                          ) : selectedUserRequests.length > 0 ? (
                            <div className="space-y-2">
                              {selectedUserRequests.map((request) => {
                                const status = getLeaveStatus(request.start_date)
                                const isCompleted = status === '사용 완료'
                                const isEditing = editingRequest?.id === request.id

                                if (isEditing && editingRequest) {
                                  // 수정 모드 UI
                                  return (
                                    <div
                                      key={request.id}
                                      className="bg-white rounded-lg px-4 py-4 border-2 border-blue-300 space-y-3"
                                    >
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                        {/* 연차 종류 */}
                                        <div>
                                          <label className="block text-xs font-medium text-at-text-weak mb-1">종류</label>
                                          <select
                                            className="w-full px-2 py-1.5 text-sm border border-at-border rounded-xl focus:outline-none focus:ring-1 focus:ring-at-accent"
                                            value={editingRequest.leave_type_id}
                                            onChange={(e) => updateEditField('leave_type_id', e.target.value)}
                                          >
                                            {leaveTypes.filter(t => t.is_active).map((type) => (
                                              <option key={type.id} value={type.id}>{type.name}</option>
                                            ))}
                                          </select>
                                        </div>

                                        {/* 시작일 */}
                                        <div>
                                          <label className="block text-xs font-medium text-at-text-weak mb-1">시작일</label>
                                          <input
                                            type="date"
                                            className="w-full px-2 py-1.5 text-sm border border-at-border rounded-xl focus:outline-none focus:ring-1 focus:ring-at-accent"
                                            value={editingRequest.start_date}
                                            onChange={(e) => updateEditField('start_date', e.target.value)}
                                          />
                                        </div>

                                        {/* 종료일 */}
                                        <div>
                                          <label className="block text-xs font-medium text-at-text-weak mb-1">종료일</label>
                                          <input
                                            type="date"
                                            className="w-full px-2 py-1.5 text-sm border border-at-border rounded-xl focus:outline-none focus:ring-1 focus:ring-at-accent"
                                            value={editingRequest.end_date}
                                            min={editingRequest.start_date}
                                            onChange={(e) => updateEditField('end_date', e.target.value)}
                                            disabled={!!editingRequest.half_day_type}
                                          />
                                        </div>

                                        {/* 일수 */}
                                        <div>
                                          <label className="block text-xs font-medium text-at-text-weak mb-1">일수</label>
                                          <input
                                            type="number"
                                            step="0.5"
                                            min="0.5"
                                            className="w-full px-2 py-1.5 text-sm border border-at-border rounded-xl focus:outline-none focus:ring-1 focus:ring-at-accent"
                                            value={editingRequest.total_days}
                                            onChange={(e) => updateEditField('total_days', parseFloat(e.target.value) || 0)}
                                          />
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {/* 반차 타입 */}
                                        <div>
                                          <label className="block text-xs font-medium text-at-text-weak mb-1">반차</label>
                                          <select
                                            className="w-full px-2 py-1.5 text-sm border border-at-border rounded-xl focus:outline-none focus:ring-1 focus:ring-at-accent"
                                            value={editingRequest.half_day_type || ''}
                                            onChange={(e) => updateEditField('half_day_type', e.target.value || null)}
                                          >
                                            <option value="">해당 없음</option>
                                            <option value="AM">오전 반차</option>
                                            <option value="PM">오후 반차</option>
                                          </select>
                                        </div>

                                        {/* 사유 */}
                                        <div>
                                          <label className="block text-xs font-medium text-at-text-weak mb-1">사유</label>
                                          <input
                                            type="text"
                                            className="w-full px-2 py-1.5 text-sm border border-at-border rounded-xl focus:outline-none focus:ring-1 focus:ring-at-accent"
                                            placeholder="사유 입력"
                                            value={editingRequest.reason}
                                            onChange={(e) => updateEditField('reason', e.target.value)}
                                          />
                                        </div>
                                      </div>

                                      {/* 저장/취소 버튼 */}
                                      <div className="flex justify-end gap-2 pt-1">
                                        <button
                                          onClick={cancelEditing}
                                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-at-text-secondary bg-at-surface-alt hover:bg-at-border rounded-xl transition-colors"
                                          disabled={saving}
                                        >
                                          <X className="w-3 h-3" />
                                          취소
                                        </button>
                                        <button
                                          onClick={saveEditing}
                                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-at-accent hover:bg-at-accent-hover rounded-xl transition-colors disabled:opacity-50"
                                          disabled={saving}
                                        >
                                          <Save className="w-3 h-3" />
                                          {saving ? '저장 중...' : '저장'}
                                        </button>
                                      </div>
                                    </div>
                                  )
                                }

                                // 보기 모드 UI
                                return (
                                  <div
                                    key={request.id}
                                    className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-at-border group"
                                  >
                                    <div className="flex items-center gap-4">
                                      <span
                                        className="px-2 py-1 text-xs font-medium rounded"
                                        style={{
                                          backgroundColor: request.leave_types?.color ? `${request.leave_types.color}20` : '#e2e8f0',
                                          color: request.leave_types?.color || '#64748b'
                                        }}
                                      >
                                        {request.leave_types?.name || '연차'}
                                      </span>
                                      <span className="text-sm text-at-text-secondary">
                                        {formatDate(request.start_date)}
                                        {request.start_date !== request.end_date && ` ~ ${formatDate(request.end_date)}`}
                                      </span>
                                      {request.half_day_type && (
                                        <span className="text-xs text-at-text-weak">
                                          ({request.half_day_type === 'AM' ? '오전' : '오후'})
                                        </span>
                                      )}
                                      <span className="text-sm text-at-text-weak">
                                        ({request.total_days}일)
                                      </span>
                                      {request.reason && (
                                        <span className="text-xs text-at-text-weak truncate max-w-[200px]">
                                          {request.reason}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                                        isCompleted
                                          ? 'bg-at-success-bg text-at-success'
                                          : 'bg-at-warning-bg text-at-warning'
                                      }`}>
                                        {status}
                                      </span>
                                      {canManageBalance && (
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              startEditing(request)
                                            }}
                                            className="p-1.5 text-at-text-weak hover:text-at-accent hover:bg-at-accent-light rounded-xl transition-colors"
                                            title="수정"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleDelete(request.id, item.user_name)
                                            }}
                                            className="p-1.5 text-at-text-weak hover:text-at-error hover:bg-at-error-bg rounded-xl transition-colors"
                                            title="삭제"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-at-text-weak text-center py-4">
                              승인된 연차 내역이 없습니다.
                            </p>
                          )}

                          {/* 법정 공휴일 차감 내역 */}
                          {!loadingRequests && selectedUserHolidayDetails && selectedUserHolidayDetails.publicHolidays.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-at-border">
                              <h5 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: '#6366F1' }}>
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#6366F1' }}></span>
                                법정 공휴일 차감 내역 ({selectedUserHolidayDetails.publicHolidays.length}건)
                              </h5>
                              <div className="space-y-1">
                                {selectedUserHolidayDetails.publicHolidays.map(({ date, name }) => (
                                  <div
                                    key={date}
                                    className="flex items-center justify-between rounded-lg px-3 py-2 border"
                                    style={{ backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }}
                                  >
                                    <div className="flex items-center gap-3">
                                      <span
                                        className="text-xs px-2 py-0.5 rounded font-medium"
                                        style={{ backgroundColor: '#C7D2FE', color: '#4338CA' }}
                                      >
                                        공휴일
                                      </span>
                                      <span className="text-sm text-at-text-secondary">{formatDate(date)}</span>
                                      <span className="text-sm text-at-text-weak">{name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold" style={{ color: '#6366F1' }}>1일</span>
                                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-at-success-bg text-at-success">사용 완료</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 병원 지정 휴무일 차감 내역 */}
                          {!loadingRequests && selectedUserHolidayDetails && (
                            selectedUserHolidayDetails.clinicHolidays.length > 0 ||
                            selectedUserHolidayDetails.clinicHolidayAdjustments.length > 0
                          ) && (
                            <div className="mt-3">
                              <h5 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: '#F97316' }}>
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#F97316' }}></span>
                                {`병원 지정 휴무일 차감 내역 (${selectedUserHolidayDetails.clinicHolidays.length + selectedUserHolidayDetails.clinicHolidayAdjustments.length}건)`}
                              </h5>
                              <div className="space-y-1">
                                {selectedUserHolidayDetails.clinicHolidays.map((holiday, i) => (
                                  <div
                                    key={`ch-${i}`}
                                    className="flex items-center justify-between rounded-lg px-3 py-2 border"
                                    style={{ backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }}
                                  >
                                    <div className="flex items-center gap-3">
                                      <span
                                        className="text-xs px-2 py-0.5 rounded font-medium"
                                        style={{ backgroundColor: '#FED7AA', color: '#C2410C' }}
                                      >
                                        휴무일
                                      </span>
                                      <span className="text-sm text-at-text-secondary">{formatDate(holiday.start_date)}</span>
                                      <span className="text-sm text-at-text-weak">{holiday.holiday_name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold" style={{ color: '#F97316' }}>{holiday.deduct_days}일</span>
                                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-at-success-bg text-at-success">사용 완료</span>
                                    </div>
                                  </div>
                                ))}
                                {selectedUserHolidayDetails.clinicHolidayAdjustments.map((adj, i) => (
                                  <div
                                    key={`adj-${i}`}
                                    className="flex items-center justify-between rounded-lg px-3 py-2 border"
                                    style={{ backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }}
                                  >
                                    <div className="flex items-center gap-3">
                                      <span
                                        className="text-xs px-2 py-0.5 rounded font-medium"
                                        style={{ backgroundColor: '#FED7AA', color: '#C2410C' }}
                                      >
                                        휴무일
                                      </span>
                                      <span className="text-sm text-at-text-weak">{adj.reason.replace('[병원휴무]', '').trim()}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold" style={{ color: '#F97316' }}>{adj.days}일</span>
                                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-at-success-bg text-at-success">사용 완료</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
            {balances.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-at-text-weak">
                  등록된 연차 현황이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />
    </>
  )
}
