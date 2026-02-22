'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { taskChecklistService } from '@/lib/taskChecklistService'
import type { TaskTemplate, TaskPeriod, TaskTemplateFormData, TaskTemplateStatus } from '@/types/taskChecklist'
import { TASK_PERIOD_LABELS, TEMPLATE_STATUS_LABELS } from '@/types/taskChecklist'
import {
  Plus, Edit3, Trash2, Send, X, Save,
  Clock, Sun, Moon, Users, Filter,
  AlertCircle, CheckCircle2, XCircle, FileEdit
} from 'lucide-react'

const STATUS_BADGE: Record<TaskTemplateStatus, { bg: string; text: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600' },
  pending_approval: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  approved: { bg: 'bg-green-100', text: 'text-green-700' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700' },
}

const PERIOD_OPTIONS: { value: TaskPeriod; label: string; icon: React.ElementType }[] = [
  { value: 'before_treatment', label: '진료시작 전', icon: Sun },
  { value: 'during_treatment', label: '진료 중', icon: Clock },
  { value: 'before_leaving', label: '퇴근 전', icon: Moon },
]

interface Staff {
  id: string
  name: string
  role: string
}

export default function TaskTemplateManager() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 필터
  const [filterUser, setFilterUser] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // 폼 상태
  const [showForm, setShowForm] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null)
  const [formData, setFormData] = useState<TaskTemplateFormData>({
    assigned_user_id: '',
    title: '',
    description: '',
    period: 'before_treatment',
    sort_order: 0,
  })

  // 선택된 템플릿 (일괄 결재 요청용)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [templatesResult, staffResult] = await Promise.all([
        taskChecklistService.getAllTemplates(),
        taskChecklistService.getClinicStaff(),
      ])
      setTemplates(templatesResult.data)
      setStaff(staffResult.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const resetForm = () => {
    setFormData({
      assigned_user_id: '',
      title: '',
      description: '',
      period: 'before_treatment',
      sort_order: 0,
    })
    setEditingTemplate(null)
    setShowForm(false)
  }

  const handleEdit = (template: TaskTemplate) => {
    setEditingTemplate(template)
    setFormData({
      assigned_user_id: template.assigned_user_id,
      title: template.title,
      description: template.description || '',
      period: template.period,
      sort_order: template.sort_order,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!user?.id || !formData.assigned_user_id || !formData.title.trim()) return
    setSaving(true)
    try {
      if (editingTemplate) {
        const { error } = await taskChecklistService.updateTaskTemplate(editingTemplate.id, formData)
        if (error) {
          alert(`수정 실패: ${error}`)
          return
        }
      } else {
        const { error } = await taskChecklistService.createTaskTemplate(formData, user.id)
        if (error) {
          alert(`생성 실패: ${error}`)
          return
        }
      }
      resetForm()
      await fetchData()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (templateId: string) => {
    if (!confirm('이 업무를 삭제하시겠습니까?')) return
    const { error } = await taskChecklistService.deleteTaskTemplate(templateId)
    if (error) {
      alert(`삭제 실패: ${error}`)
      return
    }
    await fetchData()
  }

  const handleSubmitForApproval = async () => {
    const draftIds = Array.from(selectedIds).filter(id => {
      const t = templates.find(t => t.id === id)
      return t && (t.status === 'draft' || t.status === 'rejected')
    })
    if (draftIds.length === 0) {
      alert('결재 요청할 수 있는 항목이 없습니다. (초안 또는 반려 상태만 가능)')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await taskChecklistService.submitForApproval(draftIds)
      if (error) {
        alert(`결재 요청 실패: ${error}`)
        return
      }
      setSelectedIds(new Set())
      await fetchData()
    } finally {
      setSubmitting(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    const filtered = getFilteredTemplates()
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(t => t.id)))
    }
  }

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

  const getFilteredTemplates = () => {
    return templates.filter(t => {
      if (!t.is_active) return false
      if (filterUser !== 'all' && t.assigned_user_id !== filterUser) return false
      if (filterStatus !== 'all' && t.status !== filterStatus) return false
      return true
    })
  }

  const filteredTemplates = getFilteredTemplates()

  // 직원별로 그룹화
  const groupedByUser = filteredTemplates.reduce((acc, t) => {
    const key = t.assigned_user_id
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {} as Record<string, TaskTemplate[]>)

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">업무 체크리스트 관리</h2>
            <p className="text-sm text-slate-500 mt-1">직원별 업무를 생성하고 원장에게 결재를 요청하세요.</p>
          </div>
          <div className="flex items-center space-x-2">
            {selectedIds.size > 0 && (
              <button
                onClick={handleSubmitForApproval}
                disabled={submitting}
                className="inline-flex items-center px-4 py-2 bg-yellow-500 text-white text-sm font-medium rounded-lg hover:bg-yellow-600 transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4 mr-1.5" />
                {submitting ? '요청 중...' : `결재 요청 (${selectedIds.size})`}
              </button>
            )}
            <button
              onClick={() => { resetForm(); setShowForm(true) }}
              className="inline-flex items-center px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              업무 추가
            </button>
          </div>
        </div>

        {/* 필터 */}
        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-slate-400" />
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">전체 직원</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({getRoleName(s.role)})</option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">전체 상태</option>
              <option value="draft">초안</option>
              <option value="pending_approval">결재 대기</option>
              <option value="approved">승인됨</option>
              <option value="rejected">반려됨</option>
            </select>
          </div>
          {filteredTemplates.length > 0 && (
            <button
              onClick={selectAll}
              className="text-sm text-blue-600 hover:text-blue-800 ml-auto"
            >
              {selectedIds.size === filteredTemplates.length ? '선택 해제' : '전체 선택'}
            </button>
          )}
        </div>
      </div>

      {/* 업무 추가/수정 폼 */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800">
              {editingTemplate ? '업무 수정' : '새 업무 추가'}
            </h3>
            <button onClick={resetForm} className="p-1 hover:bg-slate-100 rounded-lg">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">담당 직원 *</label>
              <select
                value={formData.assigned_user_id}
                onChange={(e) => setFormData(prev => ({ ...prev, assigned_user_id: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">직원 선택</option>
                {staff.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({getRoleName(s.role)})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">시간대 *</label>
              <select
                value={formData.period}
                onChange={(e) => setFormData(prev => ({ ...prev, period: e.target.value as TaskPeriod }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {PERIOD_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">업무명 *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="예: 진료실 소독 및 준비"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">설명</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="업무에 대한 상세 설명 (선택)"
                rows={2}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">정렬 순서</label>
              <input
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 mt-4 pt-4 border-t border-slate-100">
            <button
              onClick={resetForm}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !formData.assigned_user_id || !formData.title.trim()}
              className="inline-flex items-center px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-1.5" />
              {saving ? '저장 중...' : editingTemplate ? '수정' : '추가'}
            </button>
          </div>
        </div>
      )}

      {/* 직원별 업무 목록 */}
      {Object.keys(groupedByUser).length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileEdit className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-slate-500 text-sm">등록된 업무가 없습니다.</p>
          <p className="text-slate-400 text-xs mt-1">&quot;업무 추가&quot; 버튼을 눌러 직원별 업무를 등록하세요.</p>
        </div>
      ) : (
        Object.entries(groupedByUser).map(([userId, userTemplates]) => {
          const staffMember = staff.find(s => s.id === userId)
          // 시간대별로 정렬
          const sorted = [...userTemplates].sort((a, b) => {
            const periodOrder: Record<string, number> = { before_treatment: 0, during_treatment: 1, before_leaving: 2 }
            const pDiff = (periodOrder[a.period] || 0) - (periodOrder[b.period] || 0)
            if (pDiff !== 0) return pDiff
            return a.sort_order - b.sort_order
          })

          return (
            <div key={userId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-semibold text-blue-600">
                      {staffMember?.name?.charAt(0) || '?'}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-slate-800">{staffMember?.name || '알 수 없음'}</span>
                    <span className="text-xs text-slate-500 ml-2">
                      {staffMember ? getRoleName(staffMember.role) : ''}
                    </span>
                  </div>
                </div>
                <span className="text-sm text-slate-500">{sorted.length}개 업무</span>
              </div>

              <div className="divide-y divide-slate-100">
                {sorted.map(template => {
                  const statusBadge = STATUS_BADGE[template.status]

                  return (
                    <div
                      key={template.id}
                      className="px-4 sm:px-6 py-3 flex items-center space-x-3"
                    >
                      {/* 체크박스 (결재 요청용 선택) */}
                      <input
                        type="checkbox"
                        checked={selectedIds.has(template.id)}
                        onChange={() => toggleSelect(template.id)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />

                      {/* 업무 내용 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-slate-800">{template.title}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}>
                            {TEMPLATE_STATUS_LABELS[template.status]}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                            {TASK_PERIOD_LABELS[template.period]}
                          </span>
                        </div>
                        {template.description && (
                          <p className="text-xs text-slate-500 mt-0.5">{template.description}</p>
                        )}
                        {template.status === 'rejected' && template.rejection_reason && (
                          <p className="text-xs text-red-500 mt-0.5 flex items-center">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            반려 사유: {template.rejection_reason}
                          </p>
                        )}
                      </div>

                      {/* 액션 */}
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleEdit(template)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                          title="수정"
                        >
                          <Edit3 className="w-4 h-4 text-slate-400" />
                        </button>
                        <button
                          onClick={() => handleDelete(template.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
