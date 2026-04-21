'use client'

import { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { recurringTaskTemplateService } from '@/lib/bulletinService'
import { ensureConnection } from '@/lib/supabase/connectionCheck'
import type { RecurringTaskTemplate, TaskPriority } from '@/types/bulletin'
import { TASK_PRIORITY_LABELS } from '@/types/bulletin'
import RecurrenceFields, { validateRecurrence, type RecurrenceFieldsValue } from './RecurrenceFields'

interface StaffMember {
  id: string
  name: string
  role: string
}

interface RecurringTaskTemplateFormProps {
  template: RecurringTaskTemplate
  onSubmit: () => void
  onCancel: () => void
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

/**
 * 반복 업무 템플릿 편집 모달
 * 디자인: AT 토큰, rounded-xl, border-at-border
 */
export default function RecurringTaskTemplateForm({
  template,
  onSubmit,
  onCancel,
}: RecurringTaskTemplateFormProps) {
  const [title, setTitle] = useState(template.title)
  const [description, setDescription] = useState(template.description || '')
  const [priority, setPriority] = useState<TaskPriority>(template.priority)
  const [assigneeId, setAssigneeId] = useState(template.assignee_id)
  const [recurrence, setRecurrence] = useState<RecurrenceFieldsValue>({
    enabled: true,
    recurrence_type: template.recurrence_type,
    recurrence_weekday: template.recurrence_weekday ?? undefined,
    recurrence_day_of_month: template.recurrence_day_of_month ?? undefined,
    recurrence_month: template.recurrence_month ?? undefined,
    start_date: template.start_date,
    end_date: template.end_date || undefined,
  })

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStaff = async () => {
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
        setStaffMembers(data || [])
      } catch (err) {
        console.error('[RecurringTaskTemplateForm] fetchStaff error:', err)
      }
    }
    fetchStaff()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('업무명을 입력해주세요.')
      return
    }
    if (!assigneeId) {
      setError('담당자를 선택해주세요.')
      return
    }
    const recurrenceError = validateRecurrence(recurrence)
    if (recurrenceError) {
      setError(recurrenceError)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { error: updateError } = await recurringTaskTemplateService.updateTemplate(template.id, {
        title: title.trim(),
        description: description || undefined,
        priority,
        assignee_id: assigneeId,
        recurrence_type: recurrence.recurrence_type,
        recurrence_weekday: recurrence.recurrence_weekday ?? null,
        recurrence_day_of_month: recurrence.recurrence_day_of_month ?? null,
        recurrence_month: recurrence.recurrence_month ?? null,
        start_date: recurrence.start_date,
        end_date: recurrence.end_date || null,
      })
      if (updateError) throw new Error(updateError)
      onSubmit()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl border border-at-border w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between pb-3 px-6 pt-5 border-b border-at-border">
          <h3 className="text-base font-semibold text-at-text">반복 업무 템플릿 편집</h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-at-surface-hover text-at-text-weak transition-colors"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-at-error-bg text-at-error rounded-xl text-sm">{error}</div>
          )}

          {/* 업무명 */}
          <div>
            <label className="block text-sm font-medium text-at-text mb-1.5">
              업무명 <span className="text-at-error">*</span>
            </label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="업무 제목을 입력하세요"
            />
          </div>

          {/* 담당자 */}
          <div>
            <label className="block text-sm font-medium text-at-text mb-1.5">
              담당자 <span className="text-at-error">*</span>
            </label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors bg-white"
            >
              <option value="">담당자를 선택하세요</option>
              {staffMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} ({roleLabel(member.role)})
                </option>
              ))}
            </select>
          </div>

          {/* 우선순위 */}
          <div>
            <label className="block text-sm font-medium text-at-text mb-1.5">우선순위</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors bg-white"
            >
              {Object.entries(TASK_PRIORITY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* 상세 내용 */}
          <div>
            <label className="block text-sm font-medium text-at-text mb-1.5">상세 내용</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="업무 설명을 입력하세요 (선택)"
              className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors resize-none"
            />
          </div>

          {/* 반복 주기 */}
          <RecurrenceFields value={recurrence} onChange={setRecurrence} forceEnabled />

          {/* 버튼 */}
          <div className="flex justify-end gap-2 pt-4 border-t border-at-border">
            <Button type="button" variant="outline" onClick={onCancel}>
              취소
            </Button>
            <Button type="submit" disabled={loading} className="flex items-center gap-2">
              <Save className="w-4 h-4" />
              {loading ? '저장 중...' : '저장'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
