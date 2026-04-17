'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { taskService, recurringTaskTemplateService } from '@/lib/bulletinService'
import { ensureConnection } from '@/lib/supabase/connectionCheck'
import type { Task, TaskPriority, CreateTaskDto } from '@/types/bulletin'
import { TASK_PRIORITY_LABELS } from '@/types/bulletin'
import EnhancedTiptapEditor from '@/components/Protocol/EnhancedTiptapEditor'
import RecurrenceFields, { validateRecurrence, type RecurrenceFieldsValue } from './RecurrenceFields'

interface TaskFormProps {
  task?: Task | null
  onSubmit: () => void
  onCancel: () => void
}

interface StaffMember {
  id: string
  name: string
  role: string
}

export default function TaskForm({
  task,
  onSubmit,
  onCancel,
}: TaskFormProps) {
  const [formData, setFormData] = useState<CreateTaskDto>({
    title: task?.title || '',
    description: task?.description || '',
    priority: task?.priority || 'medium',
    assignee_id: task?.assignee_id || '',
    due_date: task?.due_date || '',
  })
  const todayStr = new Date().toISOString().split('T')[0]
  const [recurrence, setRecurrence] = useState<RecurrenceFieldsValue>({
    enabled: false,
    recurrence_type: 'weekly',
    recurrence_weekday: new Date().getDay(),
    start_date: todayStr,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([])
  const [loadingStaff, setLoadingStaff] = useState(true)

  const isEditing = !!task

  useEffect(() => {
    fetchStaffMembers()
  }, [])

  const fetchStaffMembers = async () => {
    setLoadingStaff(true)
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = sessionStorage.getItem('dental_clinic_id') || localStorage.getItem('dental_clinic_id')
      if (!clinicId) throw new Error('Clinic not found')

      const { data, error: fetchError } = await (supabase as any)
        .from('users')
        .select('id, name, role')
        .eq('clinic_id', clinicId)
        .eq('status', 'active')
        .order('name')

      if (fetchError) throw fetchError

      setStaffMembers(data || [])
    } catch (err) {
      console.error('Error fetching staff members:', err)
    } finally {
      setLoadingStaff(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      setError('업무명을 입력해주세요.')
      return
    }
    if (!formData.assignee_id) {
      setError('담당자를 선택해주세요.')
      return
    }

    // 반복 설정 유효성 검증 (신규 생성 모드에서만)
    if (!isEditing && recurrence.enabled) {
      const recurrenceError = validateRecurrence(recurrence)
      if (recurrenceError) {
        setError(recurrenceError)
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      if (isEditing) {
        const { error: updateError } = await taskService.updateTask(task.id, formData)
        if (updateError) throw new Error(updateError)
      } else if (recurrence.enabled) {
        // 반복 업무 템플릿 생성
        const { error: createError } = await recurringTaskTemplateService.createTemplate({
          title: formData.title,
          description: formData.description,
          priority: formData.priority,
          assignee_id: formData.assignee_id,
          recurrence_type: recurrence.recurrence_type,
          recurrence_weekday: recurrence.recurrence_weekday,
          recurrence_day_of_month: recurrence.recurrence_day_of_month,
          recurrence_month: recurrence.recurrence_month,
          start_date: recurrence.start_date,
          end_date: recurrence.end_date,
        })
        if (createError) throw new Error(createError)

        // 오늘 해당 패턴과 일치하면 즉시 첫 인스턴스 생성
        await recurringTaskTemplateService.materializeDueInstances()
      } else {
        const { error: createError } = await taskService.createTask(formData)
        if (createError) throw new Error(createError)
      }
      onSubmit()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const getRoleLabel = (role: string) => {
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

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onCancel} className="flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          취소
        </Button>
        <h2 className="text-lg font-semibold text-at-text">
          {isEditing ? '업무 수정' : '새 업무 할당'}
        </h2>
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-at-border p-6 space-y-6">
        {error && (
          <div className="p-4 bg-at-error-bg text-at-error rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* 업무명 */}
        <div>
          <label className="block text-sm font-medium text-at-text-secondary mb-2">
            업무명 <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="업무 제목을 입력하세요"
          />
        </div>

        {/* 담당자 */}
        <div>
          <label className="block text-sm font-medium text-at-text-secondary mb-2">
            담당자 <span className="text-red-500">*</span>
          </label>
          {loadingStaff ? (
            <div className="flex items-center gap-2 text-at-text-weak">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-at-accent"></div>
              <span className="text-sm">직원 목록 불러오는 중...</span>
            </div>
          ) : (
            <select
              value={formData.assignee_id}
              onChange={(e) => setFormData({ ...formData, assignee_id: e.target.value })}
              className="w-full border border-at-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-at-accent"
            >
              <option value="">담당자를 선택하세요</option>
              {staffMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} ({getRoleLabel(member.role)})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 우선순위 */}
        <div>
          <label className="block text-sm font-medium text-at-text-secondary mb-2">
            우선순위
          </label>
          <select
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}
            className="w-full border border-at-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-at-accent"
          >
            {Object.entries(TASK_PRIORITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* 마감일 (일회성 업무용) */}
        {(!recurrence.enabled || isEditing) && (
          <div>
            <label className="block text-sm font-medium text-at-text-secondary mb-2">
              마감일
            </label>
            <Input
              type="date"
              value={formData.due_date || ''}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
            />
          </div>
        )}

        {/* 반복 업무 설정 (신규 생성 모드에서만 노출 — 기존 업무 편집 시 숨김) */}
        {!isEditing && (
          <RecurrenceFields value={recurrence} onChange={setRecurrence} />
        )}

        {/* 상세 내용 */}
        <div>
          <label className="block text-sm font-medium text-at-text-secondary mb-2">
            상세 내용
          </label>
          <EnhancedTiptapEditor
            content={formData.description || ''}
            onChange={(description) => setFormData({ ...formData, description })}
            placeholder="업무에 대한 상세 설명을 입력하세요"
          />
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-3 pt-4 border-t border-at-border">
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button type="submit" disabled={loading || loadingStaff} className="flex items-center gap-2">
            <Save className="w-4 h-4" />
            {loading
              ? '저장 중...'
              : isEditing
                ? '수정'
                : recurrence.enabled
                  ? '반복 등록'
                  : '할당'}
          </Button>
        </div>
      </form>
    </div>
  )
}
