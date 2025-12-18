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

// 연차 현황 카드
const LeaveBalanceCard = ({ balance, hireDate }: { balance: EmployeeLeaveBalance | null; hireDate?: string }) => {
  const yearsOfService = hireDate ? calculateYearsOfService(new Date(hireDate)) : 0
  const hasSpecialLeave = (balance?.family_event_days ?? 0) > 0 || (balance?.unpaid_days ?? 0) > 0

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
      <h4 className="text-sm font-medium text-slate-600 mb-4">내 연차 현황</h4>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">총 연차</p>
          <p className="text-2xl font-bold text-blue-600">{balance?.total_days ?? 0}일</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">사용</p>
          <p className="text-2xl font-bold text-green-600">{balance?.used_days ?? 0}일</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">승인 대기</p>
          <p className="text-2xl font-bold text-yellow-600">{balance?.pending_days ?? 0}일</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">잔여</p>
          <p className={`text-2xl font-bold ${(balance?.remaining_days ?? 0) < 0 ? 'text-red-600' : 'text-indigo-600'}`}>
            {balance?.remaining_days ?? 0}일
          </p>
          {(balance?.remaining_days ?? 0) < 0 && (
            <p className="text-xs text-red-500 mt-1">무급휴가 사용</p>
          )}
        </div>
      </div>

      {/* 특별휴가 사용 현황 (경조사, 무급휴가) */}
      {hasSpecialLeave && (
        <div className="mt-4 pt-4 border-t border-blue-200">
          <p className="text-xs text-slate-500 mb-2">특별휴가 사용 현황</p>
          <div className="flex gap-4">
            {(balance?.family_event_days ?? 0) > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                <span className="text-sm text-purple-700">경조사 {balance?.family_event_days}일</span>
              </div>
            )}
            {(balance?.unpaid_days ?? 0) > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                <span className="text-sm text-gray-700">무급휴가 {balance?.unpaid_days}일</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
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
    if (!confirm('연차 신청을 취소하시겠습니까?')) return

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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 탭 네비게이션 */}
      <div className="flex flex-wrap gap-2 pb-4 border-b border-slate-200">
        {tabs.map((tab) => (
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
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-600">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm flex items-center">
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

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">기간</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">종류</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">일수</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">사유</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">상태</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {myRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-slate-50">
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
                        <span className="ml-2 text-xs text-slate-500">
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
                    <td className="px-4 py-3 text-slate-600">{request.total_days}일</td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                      {request.reason || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${LEAVE_STATUS_COLORS[request.status as keyof typeof LEAVE_STATUS_COLORS]}`}>
                        {LEAVE_STATUS_NAMES[request.status as keyof typeof LEAVE_STATUS_NAMES]}
                      </span>
                      {request.status === 'pending' && request.current_step && request.total_steps && (
                        <span className="ml-2 text-xs text-slate-400">
                          ({request.current_step}/{request.total_steps}단계)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {request.status === 'pending' && (
                        <button
                          onClick={() => handleCancelRequest(request.id)}
                          className="text-red-600 hover:text-red-700 text-sm"
                        >
                          취소
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {myRequests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
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
// 연차 비차감 종류 (경조사, 대체휴가)
const NON_DEDUCT_LEAVE_TYPES: LeaveTypeCode[] = ['family_event', 'compensatory']

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
    return <span className="text-slate-400">{emptyText}</span>
  }

  // 필터가 있으면 해당 종류만 표시
  const filteredEntries = Object.entries(byType).filter(([code, days]) => {
    if (days <= 0) return false
    if (filterTypes) return filterTypes.includes(code as LeaveTypeCode)
    return true
  })

  if (filteredEntries.length === 0) {
    return <span className="text-slate-400">{emptyText}</span>
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

// 전체 직원 연차 현황 컴포넌트
function AllEmployeeBalances() {
  const [balances, setBalances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedUserRequests, setSelectedUserRequests] = useState<any[]>([])
  const [loadingRequests, setLoadingRequests] = useState(false)

  useEffect(() => {
    loadBalances()
  }, [])

  const loadBalances = async () => {
    setLoading(true)
    // 연도 필터 없이 전체 조회
    const result = await leaveService.getAllEmployeeBalances()
    setBalances(result.data || [])
    setLoading(false)
  }

  const handleRowClick = async (userId: string) => {
    // 같은 직원 클릭 시 닫기
    if (selectedUserId === userId) {
      setSelectedUserId(null)
      setSelectedUserRequests([])
      return
    }

    setSelectedUserId(userId)
    setLoadingRequests(true)

    // 승인된 연차 내역 조회 (연도 필터 없이 전체)
    const result = await leaveService.getAllRequests({ userId, status: 'approved' })
    setSelectedUserRequests(result.data || [])
    setLoadingRequests(false)
  }

  // 날짜 포맷팅
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  // 연차 상태 표시 (사용 완료 vs 예정)
  const getLeaveStatus = (startDate: string) => {
    const today = new Date().toISOString().split('T')[0]
    return startDate <= today ? '사용 완료' : '사용 예정'
  }

  // 종류별 합계 계산 (차감 대상만)
  const calculateDeductTotal = (byType?: Record<string, number>) => {
    if (!byType) return 0
    return DEDUCT_LEAVE_TYPES.reduce((sum, code) => sum + (byType[code] || 0), 0)
  }

  // 종류별 합계 계산 (비차감 대상만)
  const calculateNonDeductTotal = (byType?: Record<string, number>) => {
    if (!byType) return 0
    return NON_DEDUCT_LEAVE_TYPES.reduce((sum, code) => sum + (byType[code] || 0), 0)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">직원</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">직급</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">총 연차</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">
              <div>이미 사용</div>
              <div className="text-[10px] text-slate-400 font-normal">(연차/반차/병가)</div>
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">
              <div>사용 예정</div>
              <div className="text-[10px] text-slate-400 font-normal">(연차/반차/병가)</div>
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">잔여</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-purple-600">
              <div>경조사/대체휴가</div>
              <div className="text-[10px] text-purple-400 font-normal">(연차 비차감)</div>
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">무급휴가</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">사용률</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {balances.map((item) => {
            const usageRate = item.total_days > 0
              ? Math.round((item.used_days / item.total_days) * 100)
              : 0
            const isSelected = selectedUserId === item.user_id

            // 이미 사용 (차감 대상만)
            const usedDeductTotal = calculateDeductTotal(item.used_by_type)
            // 사용 예정 (차감 대상만)
            const pendingDeductTotal = calculateDeductTotal(item.pending_by_type)
            // 경조사/대체휴가 (이미 사용 + 사용 예정)
            const usedNonDeductTotal = calculateNonDeductTotal(item.used_by_type)
            const pendingNonDeductTotal = calculateNonDeductTotal(item.pending_by_type)
            const totalNonDeduct = usedNonDeductTotal + pendingNonDeductTotal

            return (
              <React.Fragment key={item.id}>
                <tr
                  className={`hover:bg-slate-50 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                  onClick={() => handleRowClick(item.user_id)}
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <div className="flex items-center gap-2">
                      {isSelected ? (
                        <ChevronDown className="w-4 h-4 text-blue-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                      <div>
                        <div>{item.user_name || '알 수 없음'}</div>
                        {item.leave_period_start && item.leave_period_end && (
                          <div className="text-[10px] text-slate-400 font-normal">
                            {item.leave_period_start.slice(5).replace('-', '/')} ~ {item.leave_period_end.slice(5).replace('-', '/')}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {getRoleLabel(item.user_role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-medium">{item.total_days}일</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-medium text-green-600">{usedDeductTotal}일</span>
                      <LeaveByTypeCell byType={item.used_by_type} emptyText="" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-medium text-yellow-600">{pendingDeductTotal}일</span>
                      <LeaveByTypeCell byType={item.pending_by_type} emptyText="" />
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-center font-semibold ${item.remaining_days < 0 ? 'text-red-600' : 'text-indigo-600'}`}>
                    {item.remaining_days}일
                  </td>
                  <td className="px-4 py-3 text-center">
                    {totalNonDeduct > 0 ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-medium text-purple-600">{totalNonDeduct}일</span>
                        <div className="flex flex-col gap-0.5">
                          {/* 이미 사용 (경조사/대체휴가) */}
                          {usedNonDeductTotal > 0 && (
                            <div className="text-[10px] text-green-600">
                              사용: <LeaveByTypeCell byType={item.used_by_type} filterTypes={NON_DEDUCT_LEAVE_TYPES} emptyText="" />
                            </div>
                          )}
                          {/* 사용 예정 (경조사/대체휴가) */}
                          {pendingNonDeductTotal > 0 && (
                            <div className="text-[10px] text-yellow-600">
                              예정: <LeaveByTypeCell byType={item.pending_by_type} filterTypes={NON_DEDUCT_LEAVE_TYPES} emptyText="" />
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {(item.unpaid_days ?? 0) > 0 ? `${item.unpaid_days}일` : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${Math.min(usageRate, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{usageRate}%</span>
                    </div>
                  </td>
                </tr>
                {/* 선택된 직원의 연차 내역 */}
                {isSelected && (
                  <tr>
                    <td colSpan={9} className="px-0 py-0 bg-slate-50">
                      <div className="px-6 py-4 border-t border-slate-200">
                        <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {item.user_name}님의 연차 사용 내역
                        </h4>
                        {loadingRequests ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                          </div>
                        ) : selectedUserRequests.length > 0 ? (
                          <div className="space-y-2">
                            {selectedUserRequests.map((request) => {
                              const status = getLeaveStatus(request.start_date)
                              const isCompleted = status === '사용 완료'
                              return (
                                <div
                                  key={request.id}
                                  className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-slate-200"
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
                                    <span className="text-sm text-slate-700">
                                      {formatDate(request.start_date)}
                                      {request.start_date !== request.end_date && ` ~ ${formatDate(request.end_date)}`}
                                    </span>
                                    <span className="text-sm text-slate-500">
                                      ({request.total_days}일)
                                    </span>
                                    {request.reason && (
                                      <span className="text-xs text-slate-400 truncate max-w-[200px]">
                                        {request.reason}
                                      </span>
                                    )}
                                  </div>
                                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                                    isCompleted
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-yellow-100 text-yellow-700'
                                  }`}>
                                    {status}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500 text-center py-4">
                            승인된 연차 내역이 없습니다.
                          </p>
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
              <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                등록된 연차 현황이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
