'use client'

import { useEffect, useState } from 'react'
import { X, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ensureConnection } from '@/lib/supabase/connectionCheck'
import { taskService } from '@/lib/bulletinService'
import { appAlert } from '@/components/ui/AppDialog'

interface StaffMember {
  id: string
  name: string
  role: string
}

interface BulkAssigneeChangeModalProps {
  selectedCount: number
  selectedTaskIds: string[]
  onClose: () => void
  onSuccess: (updatedCount: number) => void
}

const roleLabel = (role: string) => {
  const labels: Record<string, string> = {
    master_admin: '마스터 관리자',
    owner: '원장',
    vice_director: '부원장',
    manager: '매니저',
    team_leader: '팀장',
    staff: '직원',
  }
  return labels[role] || role
}

export default function BulkAssigneeChangeModal({
  selectedCount,
  selectedTaskIds,
  onClose,
  onSuccess,
}: BulkAssigneeChangeModalProps) {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [newAssigneeId, setNewAssigneeId] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStaff, setLoadingStaff] = useState(true)

  useEffect(() => {
    const fetchStaff = async () => {
      setLoadingStaff(true)
      try {
        const supabase = await ensureConnection()
        if (!supabase) return
        const clinicId =
          sessionStorage.getItem('dental_clinic_id') || localStorage.getItem('dental_clinic_id')
        if (!clinicId) return
        const { data } = await (supabase as any)
          .from('users')
          .select('id, name, role')
          .eq('clinic_id', clinicId)
          .eq('status', 'active')
          .order('name')
        setStaff(data || [])
      } catch (err) {
        console.error('[BulkAssigneeChangeModal] fetchStaff error:', err)
      } finally {
        setLoadingStaff(false)
      }
    }
    fetchStaff()
  }, [])

  const handleSubmit = async () => {
    if (!newAssigneeId) {
      await appAlert('변경할 담당자를 선택해주세요.')
      return
    }
    setLoading(true)
    const { success, updatedCount, error } = await taskService.bulkUpdateAssignee(
      selectedTaskIds,
      newAssigneeId
    )
    setLoading(false)
    if (!success) {
      await appAlert(error || '담당자 변경에 실패했습니다.')
      return
    }
    onSuccess(updatedCount)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-at-border w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-at-border">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-at-accent" />
            <h3 className="text-base font-semibold text-at-text">담당자 일괄 변경</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-at-surface-hover text-at-text-weak transition-colors"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-at-text-secondary">
            선택된 <span className="font-semibold text-at-accent">{selectedCount}건</span>의
            업무 담당자를 한꺼번에 변경합니다.
          </p>

          <div>
            <label className="block text-sm font-medium text-at-text mb-1.5">
              새 담당자 <span className="text-at-error">*</span>
            </label>
            {loadingStaff ? (
              <div className="text-sm text-at-text-weak">직원 목록을 불러오는 중...</div>
            ) : (
              <select
                value={newAssigneeId}
                onChange={(e) => setNewAssigneeId(e.target.value)}
                className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors bg-white"
              >
                <option value="">담당자를 선택하세요</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({roleLabel(s.role)})
                  </option>
                ))}
              </select>
            )}
          </div>

          <p className="text-xs text-at-text-weak">
            변경된 담당자에게는 업무 할당 알림이 발송됩니다.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-at-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            취소
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={loading || loadingStaff}>
            {loading ? '변경 중...' : `${selectedCount}건 담당자 변경`}
          </Button>
        </div>
      </div>
    </div>
  )
}
