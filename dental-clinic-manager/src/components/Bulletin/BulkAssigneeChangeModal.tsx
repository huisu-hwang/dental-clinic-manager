'use client'

import { FormEvent, useEffect, useState } from 'react'
import { X, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ensureConnection } from '@/lib/supabase/connectionCheck'
import { appAlert } from '@/components/ui/AppDialog'

interface StaffMember {
  id: string
  name: string
  role: string
}

interface BulkAssigneeChangeModalProps {
  selectedCount: number
  /** 헤더 타이틀 (default: "담당자 일괄 변경") */
  title?: string
  /** 본문 설명에 들어갈 대상 명사 (default: "업무") — "선택된 N건의 {label} 담당자를…" */
  itemLabel?: string
  /** 실제 변경 동작 — 호출자가 적절한 service 함수를 주입 */
  onConfirm: (
    newAssigneeId: string
  ) => Promise<{ success: boolean; updatedCount: number; error: string | null }>
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
  title = '담당자 일괄 변경',
  itemLabel = '업무',
  onConfirm,
  onClose,
  onSuccess,
}: BulkAssigneeChangeModalProps) {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [newAssigneeId, setNewAssigneeId] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    const fetchStaff = async () => {
      if (!cancelled) {
        setLoadingStaff(true)
        setErrorMessage('')
      }

      try {
        const supabase = await ensureConnection()
        if (!supabase) {
          if (!cancelled) {
            setStaff([])
            setErrorMessage('직원 목록을 불러오지 못했습니다.')
          }
          return
        }
        const clinicId =
          sessionStorage.getItem('dental_clinic_id') || localStorage.getItem('dental_clinic_id')
        if (!clinicId) {
          if (!cancelled) {
            setStaff([])
            setErrorMessage('직원 목록을 불러오지 못했습니다.')
          }
          return
        }
        const { data, error } = await (supabase as any)
          .from('users')
          .select('id, name, role')
          .eq('clinic_id', clinicId)
          .eq('status', 'active')
          .order('name')

        if (error) {
          console.error('[BulkAssigneeChangeModal] fetchStaff error:', error)
          if (!cancelled) {
            setStaff([])
            setErrorMessage('직원 목록을 불러오지 못했습니다.')
          }
          return
        }

        if (!cancelled) {
          setStaff(data || [])
        }
      } catch (err) {
        console.error('[BulkAssigneeChangeModal] fetchStaff error:', err)
        if (!cancelled) {
          setStaff([])
          setErrorMessage('직원 목록을 불러오지 못했습니다.')
        }
      } finally {
        if (!cancelled) {
          setLoadingStaff(false)
        }
      }
    }

    fetchStaff()

    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (loading) return

    if (!newAssigneeId) {
      await appAlert('변경할 담당자를 선택해주세요.')
      return
    }

    try {
      setLoading(true)
      const { success, updatedCount, error } = await onConfirm(newAssigneeId)

      if (!success) {
        await appAlert(error || '담당자 변경에 실패했습니다.')
        return
      }

      onSuccess(updatedCount)
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : '담당자 변경에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl border border-at-border w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-at-border">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-at-accent" />
            <h3 className="text-base font-semibold text-at-text">{title}</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-at-surface-hover text-at-text-weak transition-colors"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <p className="text-sm text-at-text-secondary">
              선택된 <span className="font-semibold text-at-accent">{selectedCount}건</span>의
              {' '}{itemLabel} 담당자를 한꺼번에 변경합니다.
            </p>

            <div>
              <label className="block text-sm font-medium text-at-text mb-1.5">
                새 담당자 <span className="text-at-error">*</span>
              </label>
              {errorMessage && (
                <div className="mb-2 text-sm text-at-error">{errorMessage}</div>
              )}
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
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-at-border">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              취소
            </Button>
            <Button type="submit" disabled={loading || loadingStaff}>
              {loading ? '변경 중...' : `${selectedCount}건 담당자 변경`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
