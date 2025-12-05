'use client'

import { useState, useEffect } from 'react'
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
  Building2,
} from 'lucide-react'
import { UserProfile } from '@/contexts/AuthContext'
import { leaveService, calculateAnnualLeaveDays, calculateYearsOfService } from '@/lib/leaveService'
import { usePermissions } from '@/hooks/usePermissions'
import type { EmployeeLeaveBalance, LeaveType } from '@/types/leave'
import { LEAVE_STATUS_NAMES, LEAVE_STATUS_COLORS } from '@/types/leave'
import LeaveRequestForm from './LeaveRequestForm'
import LeaveApprovalList from './LeaveApprovalList'
import LeaveAdminInput from './LeaveAdminInput'
import LeavePolicySettings from './LeavePolicySettings'
import ClinicHolidayManager from './ClinicHolidayManager'

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
          <p className="text-2xl font-bold text-indigo-600">{balance?.remaining_days ?? 0}일</p>
        </div>
      </div>

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
}

export default function LeaveManagement({ currentUser }: LeaveManagementProps) {
  const { hasPermission } = usePermissions()
  const [activeTab, setActiveTab] = useState<'my' | 'request' | 'approval' | 'all' | 'admin' | 'holiday' | 'policy'>('my')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // 데이터 상태
  const [myBalance, setMyBalance] = useState<EmployeeLeaveBalance | null>(null)
  const [myRequests, setMyRequests] = useState<any[]>([])
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  // 권한 확인
  const canApprove = hasPermission('leave_approve_step1') || hasPermission('leave_approve_step2') || hasPermission('leave_approve_final')
  const canManageBalance = hasPermission('leave_balance_manage')
  const canManagePolicy = hasPermission('leave_policy_manage')
  const canViewAll = hasPermission('leave_request_view_all')

  useEffect(() => {
    fetchInitialData()
  }, [selectedYear])

  const fetchInitialData = async () => {
    setLoading(true)
    setError('')

    try {
      // 병렬로 데이터 로드
      const [balanceResult, requestsResult, typesResult] = await Promise.all([
        leaveService.getMyBalance(selectedYear),
        leaveService.getMyRequests(selectedYear),
        leaveService.getLeaveTypes(),
      ])

      if (balanceResult.error && !balanceResult.data) {
        // 잔여가 없으면 초기화
        await leaveService.initializeBalance(currentUser.id, selectedYear)
        const newBalance = await leaveService.getMyBalance(selectedYear)
        setMyBalance(newBalance.data)
      } else {
        setMyBalance(balanceResult.data)
      }

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
      setLoading(false)
    }
  }

  const handleRequestSuccess = () => {
    setSuccess('연차가 신청되었습니다.')
    setActiveTab('my')
    fetchInitialData()
    setTimeout(() => setSuccess(''), 3000)
  }

  const handleApprovalSuccess = () => {
    setSuccess('처리가 완료되었습니다.')
    fetchInitialData()
    setTimeout(() => setSuccess(''), 3000)
  }

  const handleCancelRequest = async (requestId: string) => {
    if (!confirm('연차 신청을 취소하시겠습니까?')) return

    const result = await leaveService.cancelRequest(requestId)
    if (result.error) {
      setError(result.error)
    } else {
      setSuccess('연차 신청이 취소되었습니다.')
      fetchInitialData()
    }
    setTimeout(() => {
      setError('')
      setSuccess('')
    }, 3000)
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

      {/* 알림 메시지 */}
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

      {/* 내 연차 탭 */}
      {activeTab === 'my' && (
        <div className="space-y-6">
          <SectionHeader number={1} title="내 연차 현황" icon={Calendar} />

          {/* 연도 선택 */}
          <div className="flex items-center gap-2">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              {[0, -1, -2].map(offset => {
                const year = new Date().getFullYear() + offset
                return <option key={year} value={year}>{year}년</option>
              })}
            </select>
          </div>

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
          <AllEmployeeBalances year={selectedYear} />
        </div>
      )}

      {/* 연차 관리 탭 (소진 연차 입력) */}
      {activeTab === 'admin' && canManageBalance && (
        <LeaveAdminInput
          year={selectedYear}
          leaveTypes={leaveTypes}
          onSuccess={handleApprovalSuccess}
        />
      )}

      {/* 병원 휴무일 관리 탭 */}
      {activeTab === 'holiday' && currentUser.role === 'owner' && (
        <ClinicHolidayManager
          currentUser={currentUser}
          year={selectedYear}
          onSuccess={fetchInitialData}
        />
      )}

      {/* 정책 설정 탭 */}
      {activeTab === 'policy' && canManagePolicy && (
        <LeavePolicySettings />
      )}
    </div>
  )
}

// 전체 직원 연차 현황 컴포넌트
function AllEmployeeBalances({ year }: { year: number }) {
  const [balances, setBalances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBalances()
  }, [year])

  const loadBalances = async () => {
    setLoading(true)
    const result = await leaveService.getAllEmployeeBalances(year)
    setBalances(result.data || [])
    setLoading(false)
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
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">사용</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">대기</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">잔여</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">사용률</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {balances.map((item) => {
            const usageRate = item.total_days > 0
              ? Math.round((item.used_days / item.total_days) * 100)
              : 0
            return (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">
                  {item.user_name || '알 수 없음'}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                    {getRoleLabel(item.user_role)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">{item.total_days}일</td>
                <td className="px-4 py-3 text-center text-green-600">{item.used_days}일</td>
                <td className="px-4 py-3 text-center text-yellow-600">{item.pending_days}일</td>
                <td className="px-4 py-3 text-center font-semibold text-indigo-600">
                  {item.remaining_days}일
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
            )
          })}
          {balances.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                등록된 연차 현황이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
