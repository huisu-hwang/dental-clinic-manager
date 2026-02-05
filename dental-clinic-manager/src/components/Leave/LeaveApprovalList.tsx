'use client'

import { useState, useEffect } from 'react'
import { Clock, CheckCircle, XCircle, User, Calendar, ChevronRight, AlertCircle } from 'lucide-react'
import { UserProfile } from '@/contexts/AuthContext'
import { leaveService, getApprovalStepsForRole } from '@/lib/leaveService'
import { LEAVE_STATUS_COLORS } from '@/types/leave'

interface LeaveApprovalListProps {
  currentUser: UserProfile
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

export default function LeaveApprovalList({ currentUser, onSuccess }: LeaveApprovalListProps) {
  const [loading, setLoading] = useState(true)
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [error, setError] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    loadPendingRequests(true)
  }, [])

  const loadPendingRequests = async (isInitialLoad = false) => {
    // 초기 로딩일 때만 로딩 스피너 표시 (깜빡임 방지)
    if (isInitialLoad) {
      setLoading(true)
    }
    setError('')

    try {
      const result = await leaveService.getPendingApprovals()
      if (result.error) {
        setError(result.error)
      } else {
        setPendingRequests(result.data || [])
      }
    } catch (err) {
      console.error('Error loading pending requests:', err)
      setError('승인 대기 목록을 불러오는 중 오류가 발생했습니다.')
    } finally {
      if (isInitialLoad) {
        setLoading(false)
      }
    }
  }

  const handleApprove = async (requestId: string) => {
    setProcessingId(requestId)
    setError('')

    try {
      const result = await leaveService.approveRequest(requestId)
      if (result.error) {
        setError(result.error)
      } else {
        // 낙관적 업데이트: 승인된 항목 즉시 제거
        setPendingRequests(prev => prev.filter(req => req.id !== requestId))
        onSuccess()
      }
    } catch (err) {
      console.error('Error approving request:', err)
      setError('승인 처리 중 오류가 발생했습니다.')
      // 에러 시 목록 새로고침
      loadPendingRequests(false)
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (requestId: string) => {
    if (!rejectReason.trim()) {
      setError('반려 사유를 입력해주세요.')
      return
    }

    setProcessingId(requestId)
    setError('')

    try {
      const result = await leaveService.rejectRequest(requestId, rejectReason)
      if (result.error) {
        setError(result.error)
      } else {
        setRejectingId(null)
        setRejectReason('')
        // 낙관적 업데이트: 반려된 항목 즉시 제거
        setPendingRequests(prev => prev.filter(req => req.id !== requestId))
        onSuccess()
      }
    } catch (err) {
      console.error('Error rejecting request:', err)
      setError('반려 처리 중 오류가 발생했습니다.')
      // 에러 시 목록 새로고침
      loadPendingRequests(false)
    } finally {
      setProcessingId(null)
    }
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
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-yellow-50 text-yellow-600">
          <Clock className="w-4 h-4" />
        </div>
        <h3 className="text-base font-semibold text-slate-800">
          승인 대기 목록
          {pendingRequests.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
              {pendingRequests.length}건
            </span>
          )}
        </h3>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm flex items-center">
          <AlertCircle className="w-4 h-4 mr-2" />
          {error}
        </div>
      )}

      {pendingRequests.length === 0 ? (
        <div className="text-center py-12 border border-slate-200 rounded-lg">
          <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">승인 대기 중인 연차 신청이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingRequests.map((request) => {
            const applicantRole = request.users?.role
            const steps = getApprovalStepsForRole(applicantRole)
            const currentStepInfo = steps[request.current_step - 1]
            const isLastStep = request.current_step >= steps.length

            return (
              <div
                key={request.id}
                className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* 신청자 정보 */}
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{request.users?.name}</p>
                        <p className="text-xs text-slate-500">{getRoleLabel(request.users?.role)}</p>
                      </div>
                      {request.emergency && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                          긴급
                        </span>
                      )}
                    </div>

                    {/* 신청 내용 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-slate-500 text-xs mb-1">연차 종류</p>
                        <span
                          className="inline-flex px-2 py-1 text-xs font-medium rounded-full"
                          style={{
                            backgroundColor: `${request.leave_types?.color}20`,
                            color: request.leave_types?.color,
                          }}
                        >
                          {request.leave_types?.name}
                        </span>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs mb-1">기간</p>
                        <p className="font-medium">
                          {new Date(request.start_date).toLocaleDateString('ko-KR')}
                          {request.start_date !== request.end_date && (
                            <> ~ {new Date(request.end_date).toLocaleDateString('ko-KR')}</>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs mb-1">일수</p>
                        <p className="font-medium">{request.total_days}일</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs mb-1">승인 단계</p>
                        <div className="flex items-center space-x-1">
                          {steps.map((step, idx) => (
                            <div key={idx} className="flex items-center">
                              <span
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                                  idx + 1 < request.current_step
                                    ? 'bg-green-100 text-green-600'
                                    : idx + 1 === request.current_step
                                    ? 'bg-yellow-100 text-yellow-600'
                                    : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                {idx + 1}
                              </span>
                              {idx < steps.length - 1 && (
                                <ChevronRight className="w-3 h-3 text-slate-300" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 사유 */}
                    {request.reason && (
                      <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">신청 사유</p>
                        <p className="text-sm text-slate-700">{request.reason}</p>
                      </div>
                    )}

                    {/* 신청일 */}
                    <p className="mt-3 text-xs text-slate-400">
                      신청일: {new Date(request.submitted_at).toLocaleString('ko-KR')}
                    </p>
                  </div>
                </div>

                {/* 반려 사유 입력 */}
                {rejectingId === request.id && (
                  <div className="mt-4 p-4 bg-red-50 rounded-lg">
                    <label className="block text-sm font-medium text-red-700 mb-2">
                      반려 사유
                    </label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      placeholder="반려 사유를 입력해주세요"
                    />
                  </div>
                )}

                {/* 버튼 */}
                <div className="mt-4 flex justify-end space-x-2">
                  {rejectingId === request.id ? (
                    <>
                      <button
                        onClick={() => {
                          setRejectingId(null)
                          setRejectReason('')
                        }}
                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                      >
                        취소
                      </button>
                      <button
                        onClick={() => handleReject(request.id)}
                        disabled={processingId === request.id}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        {processingId === request.id ? '처리 중...' : '반려 확인'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setRejectingId(request.id)}
                        disabled={processingId === request.id}
                        className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4 inline-block mr-1" />
                        반려
                      </button>
                      <button
                        onClick={() => handleApprove(request.id)}
                        disabled={processingId === request.id}
                        className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4 inline-block mr-1" />
                        {processingId === request.id
                          ? '처리 중...'
                          : isLastStep
                          ? '최종 승인'
                          : '승인'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
