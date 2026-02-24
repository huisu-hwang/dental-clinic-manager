'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { taskChecklistService } from '@/lib/taskChecklistService'
import type { TaskTemplate, TaskPeriod, TaskTemplateFormData, TaskTemplateStatus } from '@/types/taskChecklist'
import { TASK_PERIOD_LABELS, TEMPLATE_STATUS_LABELS } from '@/types/taskChecklist'
import * as XLSX from 'xlsx'
import {
  Plus, Edit3, Trash2, Send, X, Save,
  Clock, Sun, Moon, Users, Filter,
  AlertCircle, CheckCircle2, XCircle, FileEdit,
  Upload, Download, List
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

  // 일괄 입력 모드
  const [showBulkForm, setShowBulkForm] = useState(false)
  const [bulkAssignedUserId, setBulkAssignedUserId] = useState('')
  const [bulkItems, setBulkItems] = useState<Array<{
    title: string
    period: TaskPeriod
  }>>([{ title: '', period: 'before_treatment' }])
  const [bulkSaving, setBulkSaving] = useState(false)

  // 엑셀 업로드
  const [showExcelUpload, setShowExcelUpload] = useState(false)
  const [excelPreview, setExcelPreview] = useState<Array<{
    assigned_user_name: string
    assigned_user_id: string
    title: string
    description: string
    period: TaskPeriod
    valid: boolean
    error?: string
  }>>([])
  const [excelUploading, setExcelUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // === 일괄 입력 관련 ===
  const resetBulkForm = () => {
    setBulkAssignedUserId('')
    setBulkItems([{ title: '', period: 'before_treatment' }])
    setShowBulkForm(false)
  }

  const addBulkItem = () => {
    setBulkItems(prev => [...prev, { title: '', period: 'before_treatment' }])
  }

  const removeBulkItem = (index: number) => {
    setBulkItems(prev => prev.filter((_, i) => i !== index))
  }

  const updateBulkItem = (index: number, field: string, value: string) => {
    setBulkItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  const handleBulkSave = async () => {
    if (!user?.id || !bulkAssignedUserId) return
    const validItems = bulkItems.filter(item => item.title.trim())
    if (validItems.length === 0) {
      alert('입력된 항목이 없습니다.')
      return
    }
    setBulkSaving(true)
    try {
      const formDataItems: TaskTemplateFormData[] = validItems.map((item, idx) => ({
        assigned_user_id: bulkAssignedUserId,
        title: item.title.trim(),
        period: item.period,
        sort_order: idx,
      }))
      const { error } = await taskChecklistService.createTaskTemplatesBulk(formDataItems, user.id)
      if (error) {
        alert(`일괄 추가 실패: ${error}`)
        return
      }
      resetBulkForm()
      await fetchData()
    } finally {
      setBulkSaving(false)
    }
  }

  // === 엑셀 업로드 관련 ===
  const periodMap: Record<string, TaskPeriod> = {
    '진료시작 전': 'before_treatment',
    '진료시작전': 'before_treatment',
    '진료 전': 'before_treatment',
    '진료전': 'before_treatment',
    'before_treatment': 'before_treatment',
    '진료 중': 'during_treatment',
    '진료중': 'during_treatment',
    'during_treatment': 'during_treatment',
    '퇴근 전': 'before_leaving',
    '퇴근전': 'before_leaving',
    'before_leaving': 'before_leaving',
  }

  const findStaffByName = (name: string): { id: string; name: string } | undefined => {
    const trimmed = name.trim()
    return staff.find(s => s.name === trimmed)
  }

  const handleExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = evt.target?.result
      if (!data) return

      const workbook = XLSX.read(data, { type: 'binary' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet)

      const parsed = rows.map(row => {
        const staffName = (row['담당자'] || row['직원'] || row['이름'] || '').toString().trim()
        const title = (row['업무명'] || row['업무'] || row['제목'] || '').toString().trim()
        const description = (row['설명'] || row['비고'] || row['상세설명'] || '').toString().trim()
        const periodStr = (row['시간대'] || row['구분'] || '').toString().trim()

        const foundStaff = findStaffByName(staffName)
        const period = periodMap[periodStr] || 'before_treatment'

        let valid = true
        let error = ''
        if (!staffName) {
          valid = false
          error = '담당자 없음'
        } else if (!foundStaff) {
          valid = false
          error = `"${staffName}" 직원을 찾을 수 없음`
        }
        if (!title) {
          valid = false
          error = error ? `${error}, 업무명 없음` : '업무명 없음'
        }

        return {
          assigned_user_name: staffName,
          assigned_user_id: foundStaff?.id || '',
          title,
          description,
          period,
          valid,
          error,
        }
      })

      setExcelPreview(parsed)
      setShowExcelUpload(true)
    }
    reader.readAsBinaryString(file)

    // input 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleExcelUpload = async () => {
    if (!user?.id) return
    const validItems = excelPreview.filter(item => item.valid)
    if (validItems.length === 0) {
      alert('업로드할 유효한 항목이 없습니다.')
      return
    }
    setExcelUploading(true)
    try {
      const formDataItems: TaskTemplateFormData[] = validItems.map((item, idx) => ({
        assigned_user_id: item.assigned_user_id,
        title: item.title,
        description: item.description || undefined,
        period: item.period,
        sort_order: idx,
      }))
      const { error } = await taskChecklistService.createTaskTemplatesBulk(formDataItems, user.id)
      if (error) {
        alert(`엑셀 업로드 실패: ${error}`)
        return
      }
      setExcelPreview([])
      setShowExcelUpload(false)
      await fetchData()
    } finally {
      setExcelUploading(false)
    }
  }

  const downloadExcelTemplate = () => {
    const templateData = [
      { '담당자': '홍길동', '업무명': '진료실 소독 및 준비', '설명': '매일 아침 진료실 전체 소독', '시간대': '진료시작 전' },
      { '담당자': '홍길동', '업무명': '기구 세척 및 멸균', '설명': '', '시간대': '퇴근 전' },
    ]
    const ws = XLSX.utils.json_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '업무체크리스트')

    // 열 너비 설정
    ws['!cols'] = [
      { wch: 12 },
      { wch: 25 },
      { wch: 30 },
      { wch: 15 },
    ]

    XLSX.writeFile(wb, '업무체크리스트_양식.xlsx')
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
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
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
            <button
              onClick={() => { resetBulkForm(); setShowBulkForm(true); setShowForm(false); setShowExcelUpload(false) }}
              className="inline-flex items-center px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 transition-colors"
            >
              <List className="w-4 h-4 mr-1.5" />
              일괄 입력
            </button>
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                엑셀 업로드
              </button>
            </div>
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

      {/* 일괄 입력 폼 */}
      {showBulkForm && (
        <div className="bg-white rounded-xl shadow-sm border border-indigo-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800">업무 일괄 입력</h3>
            <button onClick={resetBulkForm} className="p-1 hover:bg-slate-100 rounded-lg">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* 담당 직원 선택 (상단 고정) */}
          <div className="mb-4 pb-4 border-b border-slate-100">
            <label className="block text-sm font-medium text-slate-700 mb-1">담당 직원 *</label>
            <select
              value={bulkAssignedUserId}
              onChange={(e) => setBulkAssignedUserId(e.target.value)}
              className="w-full sm:w-64 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">직원 선택</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({getRoleName(s.role)})</option>
              ))}
            </select>
          </div>

          {/* 업무 목록 입력 */}
          <p className="text-xs text-slate-500 mb-3">선택한 직원에게 할당할 업무를 입력하세요.</p>
          <div className="space-y-2">
            {/* 헤더 */}
            <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-medium text-slate-500 px-1">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-7">업무명 *</div>
              <div className="col-span-3">시간대</div>
              <div className="col-span-1"></div>
            </div>

            {bulkItems.map((item, index) => (
              <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-50 rounded-lg p-2 sm:p-1 sm:bg-transparent">
                <div className="hidden sm:flex sm:col-span-1 justify-center">
                  <span className="text-xs text-slate-400">{index + 1}</span>
                </div>
                <div className="sm:col-span-7">
                  <label className="sm:hidden text-xs text-slate-500 mb-1 block">업무명 *</label>
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => updateBulkItem(index, 'title', e.target.value)}
                    placeholder="예: 진료실 소독 및 준비"
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="sm:hidden text-xs text-slate-500 mb-1 block">시간대</label>
                  <select
                    value={item.period}
                    onChange={(e) => updateBulkItem(index, 'period', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {PERIOD_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-1 flex justify-end sm:justify-center">
                  {bulkItems.length > 1 && (
                    <button
                      onClick={() => removeBulkItem(index)}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      title="행 삭제"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
            <button
              onClick={addBulkItem}
              className="inline-flex items-center px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4 mr-1" />
              행 추가
            </button>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-500">
                {bulkItems.filter(i => i.title.trim()).length}개 항목 입력됨
              </span>
              <button
                onClick={resetBulkForm}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleBulkSave}
                disabled={bulkSaving || !bulkAssignedUserId || bulkItems.filter(i => i.title.trim()).length === 0}
                className="inline-flex items-center px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4 mr-1.5" />
                {bulkSaving ? '저장 중...' : '일괄 추가'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 엑셀 업로드 미리보기 */}
      {showExcelUpload && (
        <div className="bg-white rounded-xl shadow-sm border border-green-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800">엑셀 업로드 미리보기</h3>
            <button onClick={() => { setShowExcelUpload(false); setExcelPreview([]) }} className="p-1 hover:bg-slate-100 rounded-lg">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3 text-xs">
              <span className="text-slate-600">
                전체 {excelPreview.length}건
              </span>
              <span className="text-green-600">
                <CheckCircle2 className="w-3.5 h-3.5 inline mr-0.5" />
                유효 {excelPreview.filter(i => i.valid).length}건
              </span>
              {excelPreview.filter(i => !i.valid).length > 0 && (
                <span className="text-red-600">
                  <AlertCircle className="w-3.5 h-3.5 inline mr-0.5" />
                  오류 {excelPreview.filter(i => !i.valid).length}건
                </span>
              )}
            </div>
            <button
              onClick={downloadExcelTemplate}
              className="inline-flex items-center text-xs text-green-600 hover:text-green-800"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              양식 다운로드
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 w-8">상태</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">담당자</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">업무명</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">설명</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">시간대</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {excelPreview.map((item, idx) => (
                  <tr key={idx} className={item.valid ? '' : 'bg-red-50'}>
                    <td className="px-3 py-2">
                      {item.valid ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <div title={item.error}>
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-800">
                      {item.assigned_user_name}
                      {!item.valid && item.error && (
                        <span className="block text-xs text-red-500">{item.error}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-800">{item.title}</td>
                    <td className="px-3 py-2 text-slate-500">{item.description || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{TASK_PERIOD_LABELS[item.period]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end space-x-2 mt-4 pt-4 border-t border-slate-100">
            <button
              onClick={() => { setShowExcelUpload(false); setExcelPreview([]) }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleExcelUpload}
              disabled={excelUploading || excelPreview.filter(i => i.valid).length === 0}
              className="inline-flex items-center px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
            >
              <Upload className="w-4 h-4 mr-1.5" />
              {excelUploading ? '업로드 중...' : `유효 항목 ${excelPreview.filter(i => i.valid).length}건 업로드`}
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
