'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { taskChecklistService } from '@/lib/taskChecklistService'
import type { TaskTemplate, TaskPeriod } from '@/types/taskChecklist'
import { loadPeriodConfig } from '@/types/taskChecklist'
import { CheckCircle2, XCircle, Clock, AlertCircle, FileCheck } from 'lucide-react'

interface Staff {
  id: string
  name: string
  role: string
}

export default function TaskApproval() {
  const { user } = useAuth()
  const [pendingTemplates, setPendingTemplates] = useState<TaskTemplate[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectDialog, setShowRejectDialog] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [templatesResult, staffResult] = await Promise.all([
        taskChecklistService.getPendingTemplates(),
        taskChecklistService.getClinicStaff(),
      ])
      setPendingTemplates(templatesResult.data)
      setStaff(staffResult.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const getStaffName = (userId: string): string => {
    return staff.find(s => s.id === userId)?.name || '알 수 없음'
  }

  const getRoleName = (role: string): string => {
    const roleNames: Record<string, string> = {
      owner: '대표원장',
      vice_director: '부원장',
      manager: '실장',
      team_leader: '팀장',
      staff: '직원',
    }
    return roleNames[role] || role
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === pendingTemplates.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pendingTemplates.map(t => t.id)))
    }
  }

  const handleApprove = async () => {
    if (!user?.id || selectedIds.size === 0) return
    setProcessing(true)
    try {
      const { error } = await taskChecklistService.approveTemplates(
        Array.from(selectedIds), user.id
      )
      if (error) {
        alert(`승인 실패: ${error}`)
        return
      }
      setSelectedIds(new Set())
      await fetchData()
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!user?.id || selectedIds.size === 0 || !rejectionReason.trim()) return
    setProcessing(true)
    try {
      const { error } = await taskChecklistService.rejectTemplates(
        Array.from(selectedIds), user.id, rejectionReason.trim()
      )
      if (error) {
        alert(`반려 실패: ${error}`)
        return
      }
      setSelectedIds(new Set())
      setRejectionReason('')
      setShowRejectDialog(false)
      await fetchData()
    } finally {
      setProcessing(false)
    }
  }

  // 직원별로 그룹화
  const groupedByUser = pendingTemplates.reduce((acc, t) => {
    const key = t.assigned_user_id
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {} as Record<string, TaskTemplate[]>)

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-white rounded-2xl shadow-at-card border border-at-border p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-at-text">업무 체크리스트 결재</h2>
            <p className="text-sm text-at-text-weak mt-1">
              실장이 요청한 업무 체크리스트 변경사항을 검토하고 승인/반려하세요.
            </p>
          </div>
          {pendingTemplates.length > 0 && (
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-3 py-1 bg-at-warning-bg text-at-warning text-sm font-medium rounded-full">
                <Clock className="w-4 h-4 mr-1" />
                {pendingTemplates.length}건 대기 중
              </span>
            </div>
          )}
        </div>

        {/* 일괄 처리 버튼 */}
        {selectedIds.size > 0 && (
          <div className="flex items-center space-x-2 mt-4 pt-4 border-t border-at-border">
            <span className="text-sm text-at-text-weak">{selectedIds.size}건 선택됨</span>
            <button
              onClick={handleApprove}
              disabled={processing}
              className="inline-flex items-center px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              {processing ? '처리 중...' : '승인'}
            </button>
            <button
              onClick={() => setShowRejectDialog(true)}
              disabled={processing}
              className="inline-flex items-center px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4 mr-1.5" />
              반려
            </button>
          </div>
        )}
      </div>

      {/* 반려 사유 입력 다이얼로그 */}
      {showRejectDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-at-text mb-2">반려 사유 입력</h3>
            <p className="text-sm text-at-text-weak mb-4">선택한 {selectedIds.size}건의 업무에 대한 반려 사유를 입력하세요.</p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="반려 사유를 입력하세요..."
              rows={3}
              className="w-full border border-at-border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-at-error focus:border-at-error resize-none"
            />
            <div className="flex justify-end space-x-2 mt-4">
              <button
                onClick={() => { setShowRejectDialog(false); setRejectionReason('') }}
                className="px-4 py-2 text-sm font-medium text-at-text-secondary bg-at-surface-alt rounded-xl hover:bg-at-surface-hover"
              >
                취소
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectionReason.trim() || processing}
                className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {processing ? '처리 중...' : '반려'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 대기 중인 항목이 없는 경우 */}
      {pendingTemplates.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-at-card border border-at-border p-8 text-center">
          <div className="w-16 h-16 bg-at-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
            <FileCheck className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-at-text-weak text-sm">결재 대기 중인 항목이 없습니다.</p>
        </div>
      ) : (
        <>
          {/* 전체 선택 */}
          <div className="flex items-center justify-end">
            <button
              onClick={selectAll}
              className="text-sm text-at-accent hover:text-at-accent"
            >
              {selectedIds.size === pendingTemplates.length ? '선택 해제' : '전체 선택'}
            </button>
          </div>

          {/* 직원별 그룹 */}
          {Object.entries(groupedByUser).map(([userId, userTemplates]) => {
            const staffMember = staff.find(s => s.id === userId)
            const sorted = [...userTemplates].sort((a, b) => {
              const periodOrder: Record<string, number> = { before_treatment: 0, during_treatment: 1, before_leaving: 2 }
              const pDiff = (periodOrder[a.period] || 0) - (periodOrder[b.period] || 0)
              if (pDiff !== 0) return pDiff
              return a.sort_order - b.sort_order
            })

            return (
              <div key={userId} className="bg-white rounded-2xl shadow-at-card border border-at-border overflow-hidden">
                <div className="px-4 sm:px-6 py-3 bg-at-warning-bg border-b border-at-border flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-at-warning-bg rounded-full flex items-center justify-center">
                      <span className="text-sm font-semibold text-at-warning">
                        {staffMember?.name?.charAt(0) || '?'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-at-text">{staffMember?.name || '알 수 없음'}</span>
                      <span className="text-xs text-at-text-weak ml-2">
                        {staffMember ? getRoleName(staffMember.role) : ''}
                      </span>
                    </div>
                  </div>
                  <span className="text-sm text-at-warning font-medium">{sorted.length}건</span>
                </div>

                <div className="divide-y divide-at-border">
                  {sorted.map(template => (
                    <div key={template.id} className="px-4 sm:px-6 py-3 flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(template.id)}
                        onChange={() => toggleSelect(template.id)}
                        className="w-4 h-4 rounded border-at-border text-at-accent focus:ring-at-accent"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-at-text">{template.title}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-at-surface-alt text-at-text-secondary">
                            {loadPeriodConfig().labels[template.period] || template.period}
                          </span>
                        </div>
                        {template.description && (
                          <p className="text-xs text-at-text-weak mt-0.5">{template.description}</p>
                        )}
                        <p className="text-xs text-at-text-weak mt-0.5">
                          요청자: {getStaffName(template.created_by)}
                          {template.created_at && ` | ${new Date(template.created_at).toLocaleDateString('ko-KR')}`}
                        </p>
                      </div>

                      {/* 개별 승인/반려 */}
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={async () => {
                            if (!user?.id) return
                            setProcessing(true)
                            try {
                              const { error } = await taskChecklistService.approveTemplates([template.id], user.id)
                              if (!error) await fetchData()
                              else alert(`승인 실패: ${error}`)
                            } finally {
                              setProcessing(false)
                            }
                          }}
                          disabled={processing}
                          className="p-1.5 rounded-lg hover:bg-at-success-bg transition-colors"
                          title="승인"
                        >
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedIds(new Set([template.id]))
                            setShowRejectDialog(true)
                          }}
                          disabled={processing}
                          className="p-1.5 rounded-lg hover:bg-at-error-bg transition-colors"
                          title="반려"
                        >
                          <XCircle className="w-5 h-5 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
