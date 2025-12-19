'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Save, User } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { taskService } from '@/lib/bulletinService'
import { ensureConnection } from '@/lib/supabase/connectionCheck'
import type { Task, TaskPriority, CreateTaskDto } from '@/types/bulletin'
import { TASK_PRIORITY_LABELS } from '@/types/bulletin'

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

    setLoading(true)
    setError(null)

    try {
      if (isEditing) {
        const { error: updateError } = await taskService.updateTask(task.id, formData)
        if (updateError) throw new Error(updateError)
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
        <h2 className="text-lg font-semibold text-gray-900">
          {isEditing ? '업무 수정' : '새 업무 할당'}
        </h2>
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* 업무명 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            담당자 <span className="text-red-500">*</span>
          </label>
          {loadingStaff ? (
            <div className="flex items-center gap-2 text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-sm">직원 목록 불러오는 중...</span>
            </div>
          ) : (
            <select
              value={formData.assignee_id}
              onChange={(e) => setFormData({ ...formData, assignee_id: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            우선순위
          </label>
          <select
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(TASK_PRIORITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* 마감일 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            마감일
          </label>
          <Input
            type="date"
            value={formData.due_date || ''}
            onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
          />
        </div>

        {/* 상세 내용 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            상세 내용
          </label>
          <textarea
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="업무에 대한 상세 설명을 입력하세요"
            rows={6}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button type="submit" disabled={loading || loadingStaff} className="flex items-center gap-2">
            <Save className="w-4 h-4" />
            {loading ? '저장 중...' : (isEditing ? '수정' : '할당')}
          </Button>
        </div>
      </form>
    </div>
  )
}
