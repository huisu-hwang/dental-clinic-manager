'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileText } from 'lucide-react'
import {
  leaveService,
  calculateLeavePeriod,
  calculateYearsOfService,
} from '@/lib/leaveService'
import type { LeaveType } from '@/types/leave'
import { appConfirm } from '@/components/ui/AppDialog'
import Toast from '@/components/ui/Toast'
import EmployeeSelector from './EmployeeSelector'
import EmployeeSummary from './EmployeeSummary'
import LeaveActionBar from './LeaveActionBar'
import LeaveHistoryTabs from './LeaveHistoryTabs'
import ApprovedRequestsTable from './ApprovedRequestsTable'
import AdjustmentsTable from './AdjustmentsTable'
import AdjustmentModal from './modals/AdjustmentModal'
import EditApprovedModal from './modals/EditApprovedModal'
import EditAdjustmentModal from './modals/EditAdjustmentModal'

interface LeaveEditPanelProps {
  leaveTypes: LeaveType[]
  onSuccess?: () => void
}

interface StaffMember {
  id: string
  name: string
  role: string
  hire_date?: string | null
}

interface BalanceRow {
  user_id: string
  total_days: number
  used_days: number
  pending_days: number
  remaining_days: number
  family_event_days?: number
  unpaid_days?: number
}

type ToastState = {
  show: boolean
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
}

const getCurrentYearForUser = (hireDate?: string | null): number => {
  if (hireDate) {
    try {
      const period = calculateLeavePeriod(new Date(hireDate))
      return new Date(period.startDate).getFullYear()
    } catch {
      return new Date().getFullYear()
    }
  }
  return new Date().getFullYear()
}

export default function LeaveEditPanel({ leaveTypes, onSuccess }: LeaveEditPanelProps) {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [balances, setBalances] = useState<BalanceRow[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [approvedRequests, setApprovedRequests] = useState<any[]>([])
  const [adjustments, setAdjustments] = useState<any[]>([])
  const [historyTab, setHistoryTab] = useState<'approved' | 'adjustments'>('approved')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)

  const [adjustmentModal, setAdjustmentModal] = useState<{
    open: boolean
    mode: 'add' | 'deduct'
  }>({ open: false, mode: 'add' })
  const [editApprovedModal, setEditApprovedModal] = useState<{
    open: boolean
    request: any | null
  }>({ open: false, request: null })
  const [editAdjustmentModal, setEditAdjustmentModal] = useState<{
    open: boolean
    adjustment: any | null
  }>({ open: false, adjustment: null })

  const [toast, setToast] = useState<ToastState>({
    show: false,
    message: '',
    type: 'success',
  })

  const showToast = useCallback(
    (message: string, type: ToastState['type'] = 'success') => {
      setToast({ show: true, message, type })
    },
    [],
  )

  const selectedEmployee = useMemo(
    () => staff.find((s) => s.id === selectedUserId) ?? null,
    [staff, selectedUserId],
  )

  const selectedBalance = useMemo(
    () => balances.find((b) => b.user_id === selectedUserId) ?? null,
    [balances, selectedUserId],
  )

  const selectedYear = useMemo(
    () => getCurrentYearForUser(selectedEmployee?.hire_date),
    [selectedEmployee],
  )

  const yearsOfService = useMemo(() => {
    if (!selectedEmployee?.hire_date) return 0
    try {
      return calculateYearsOfService(new Date(selectedEmployee.hire_date))
    } catch {
      return 0
    }
  }, [selectedEmployee])

  const loadStaffAndBalances = useCallback(async () => {
    const currentYear = new Date().getFullYear()
    const [staffResult, balanceResult] = await Promise.all([
      leaveService.getStaffList(),
      leaveService.getAllEmployeeBalances(currentYear),
    ])
    setStaff((staffResult.data ?? []) as StaffMember[])
    setBalances((balanceResult.data ?? []) as BalanceRow[])
  }, [])

  const loadDetail = useCallback(async (userId: string, year: number) => {
    setDetailLoading(true)
    try {
      const [requestsResult, adjustmentsResult] = await Promise.all([
        leaveService.getAllRequests({ userId, status: 'approved' }),
        leaveService.getAdjustments(userId, year),
      ])
      setApprovedRequests(requestsResult.data ?? [])
      setAdjustments(adjustmentsResult.data ?? [])
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadStaffAndBalances().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [loadStaffAndBalances])

  useEffect(() => {
    if (!selectedUserId) {
      setApprovedRequests([])
      setAdjustments([])
      return
    }
    loadDetail(selectedUserId, selectedYear)
  }, [selectedUserId, selectedYear, loadDetail])

  const refreshAll = useCallback(async () => {
    await loadStaffAndBalances()
    if (selectedUserId) {
      await loadDetail(selectedUserId, selectedYear)
    }
    onSuccess?.()
  }, [loadStaffAndBalances, loadDetail, selectedUserId, selectedYear, onSuccess])

  const handleAdjustmentSuccess = useCallback(
    async (mode: 'add' | 'deduct') => {
      setAdjustmentModal({ open: false, mode })
      showToast(mode === 'add' ? '연차가 추가되었습니다.' : '연차가 차감되었습니다.', 'success')
      await refreshAll()
    },
    [refreshAll, showToast],
  )

  const handleEditApprovedSuccess = useCallback(async () => {
    setEditApprovedModal({ open: false, request: null })
    showToast('연차 신청이 수정되었습니다.', 'success')
    await refreshAll()
  }, [refreshAll, showToast])

  const handleEditAdjustmentSuccess = useCallback(async () => {
    setEditAdjustmentModal({ open: false, adjustment: null })
    showToast('조정 내역이 수정되었습니다.', 'success')
    await refreshAll()
  }, [refreshAll, showToast])

  const handleDeleteRequest = useCallback(
    async (request: any) => {
      const confirmed = await appConfirm({
        title: '연차 삭제',
        description: '이 승인된 연차를 삭제하면 잔여 연차가 복구됩니다. 계속하시겠습니까?',
        variant: 'destructive',
        confirmText: '삭제',
        cancelText: '취소',
      })
      if (!confirmed) return
      const result = await leaveService.deleteApprovedRequest(request.id)
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast('연차가 삭제되었습니다.', 'success')
        await refreshAll()
      }
    },
    [refreshAll, showToast],
  )

  const handleDeleteAdjustment = useCallback(
    async (adjustment: any) => {
      const confirmed = await appConfirm({
        title: '조정 내역 삭제',
        description: '이 조정 내역을 삭제하면 잔여 연차가 다시 계산됩니다. 계속하시겠습니까?',
        variant: 'destructive',
        confirmText: '삭제',
        cancelText: '취소',
      })
      if (!confirmed) return
      const result = await leaveService.deleteAdjustment(adjustment.id)
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast('조정 내역이 삭제되었습니다.', 'success')
        await refreshAll()
      }
    },
    [refreshAll, showToast],
  )

  if (loading && staff.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3 pb-3 border-b border-at-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-at-accent-light text-at-accent">
          <FileText className="w-4 h-4" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-at-text">연차 수정</h3>
          <p className="text-xs text-at-text-secondary">
            직원을 선택해 연차를 추가/차감하거나, 이미 승인된 연차나 조정 내역을 수정할 수 있습니다.
          </p>
        </div>
      </div>

      {/* 모바일: 직원 선택 안 됐을 때 직원 목록만 풀스크린 */}
      <div className="md:hidden">
        {!selectedUserId ? (
          <EmployeeSelector
            staff={staff}
            balances={balances}
            selectedUserId={selectedUserId}
            onSelect={setSelectedUserId}
          />
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSelectedUserId(null)}
              className="inline-flex items-center gap-1 text-sm font-medium text-at-accent hover:text-at-accent-hover"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              직원 목록으로
            </button>
            <EmployeeSummary
              employee={selectedEmployee}
              balance={selectedBalance}
              yearsOfService={yearsOfService}
            />
            <LeaveActionBar
              disabled={false}
              onAdd={() => setAdjustmentModal({ open: true, mode: 'add' })}
              onDeduct={() => setAdjustmentModal({ open: true, mode: 'deduct' })}
            />
            <LeaveHistoryTabs
              approvedCount={approvedRequests.length}
              adjustmentCount={adjustments.length}
              activeTab={historyTab}
              onTabChange={setHistoryTab}
            >
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-at-accent" />
                </div>
              ) : historyTab === 'approved' ? (
                <ApprovedRequestsTable
                  requests={approvedRequests}
                  onEdit={(request) =>
                    setEditApprovedModal({ open: true, request })
                  }
                  onDelete={handleDeleteRequest}
                />
              ) : (
                <AdjustmentsTable
                  adjustments={adjustments}
                  onEdit={(adjustment) =>
                    setEditAdjustmentModal({ open: true, adjustment })
                  }
                  onDelete={handleDeleteAdjustment}
                />
              )}
            </LeaveHistoryTabs>
          </div>
        )}
      </div>

      {/* 데스크탑: 좌우 분할 */}
      <div className="hidden md:grid md:grid-cols-[280px_1fr] gap-4">
        <EmployeeSelector
          staff={staff}
          balances={balances}
          selectedUserId={selectedUserId}
          onSelect={setSelectedUserId}
        />

        <div className="space-y-4">
          <EmployeeSummary
            employee={selectedEmployee}
            balance={selectedBalance}
            yearsOfService={yearsOfService}
          />
          {selectedEmployee && (
            <>
              <LeaveActionBar
                disabled={false}
                onAdd={() => setAdjustmentModal({ open: true, mode: 'add' })}
                onDeduct={() => setAdjustmentModal({ open: true, mode: 'deduct' })}
              />
              <LeaveHistoryTabs
                approvedCount={approvedRequests.length}
                adjustmentCount={adjustments.length}
                activeTab={historyTab}
                onTabChange={setHistoryTab}
              >
                {detailLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-at-accent" />
                  </div>
                ) : historyTab === 'approved' ? (
                  <ApprovedRequestsTable
                    requests={approvedRequests}
                    onEdit={(request) =>
                      setEditApprovedModal({ open: true, request })
                    }
                    onDelete={handleDeleteRequest}
                  />
                ) : (
                  <AdjustmentsTable
                    adjustments={adjustments}
                    onEdit={(adjustment) =>
                      setEditAdjustmentModal({ open: true, adjustment })
                    }
                    onDelete={handleDeleteAdjustment}
                  />
                )}
              </LeaveHistoryTabs>
            </>
          )}
        </div>
      </div>

      {/* 모달 */}
      {selectedEmployee && (
        <AdjustmentModal
          open={adjustmentModal.open}
          mode={adjustmentModal.mode}
          userId={selectedEmployee.id}
          userName={selectedEmployee.name}
          year={selectedYear}
          leaveTypes={leaveTypes}
          onClose={() => setAdjustmentModal((s) => ({ ...s, open: false }))}
          onSuccess={() => handleAdjustmentSuccess(adjustmentModal.mode)}
        />
      )}

      {editApprovedModal.request && (
        <EditApprovedModal
          open={editApprovedModal.open}
          request={editApprovedModal.request}
          leaveTypes={leaveTypes}
          onClose={() => setEditApprovedModal({ open: false, request: null })}
          onSuccess={handleEditApprovedSuccess}
        />
      )}

      {editAdjustmentModal.adjustment && (
        <EditAdjustmentModal
          open={editAdjustmentModal.open}
          adjustment={editAdjustmentModal.adjustment}
          leaveTypes={leaveTypes}
          onClose={() => setEditAdjustmentModal({ open: false, adjustment: null })}
          onSuccess={handleEditAdjustmentSuccess}
        />
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast((prev) => ({ ...prev, show: false }))}
      />
    </div>
  )
}
