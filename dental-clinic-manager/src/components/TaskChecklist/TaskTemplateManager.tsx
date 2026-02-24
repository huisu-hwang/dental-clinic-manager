'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { taskChecklistService } from '@/lib/taskChecklistService'
import type { TaskTemplate, TaskPeriod, TaskTemplateFormData, TaskTemplateStatus, PeriodConfig } from '@/types/taskChecklist'
import { TEMPLATE_STATUS_LABELS, DEFAULT_PERIOD_KEYS, DEFAULT_PERIOD_LABELS, loadPeriodConfig, savePeriodConfig } from '@/types/taskChecklist'
import * as XLSX from 'xlsx'
import {
  Plus, Edit3, Trash2, Send, X, Save,
  Users, Filter, Settings, Clock,
  AlertCircle, CheckCircle2, XCircle, FileEdit,
  Upload, Download, List
} from 'lucide-react'

const PERIOD_COLORS = [
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-400' },
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-400' },
  { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-400' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', dot: 'bg-rose-400' },
  { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', dot: 'bg-violet-400' },
]

const STATUS_BADGE: Record<TaskTemplateStatus, { bg: string; text: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600' },
  pending_approval: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  approved: { bg: 'bg-green-100', text: 'text-green-700' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700' },
}

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
    period: TaskPeriod
    valid: boolean
    error: string
  }>>([])
  const [excelUploading, setExcelUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 선택된 템플릿 (일괄 결재 요청용)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 시간대 설정
  const [periodConfig, setPeriodConfig] = useState<PeriodConfig>(loadPeriodConfig)
  const [showPeriodSettings, setShowPeriodSettings] = useState(false)
  const [editingConfig, setEditingConfig] = useState<PeriodConfig>({ keys: [], labels: {} })

  const periodOptions = periodConfig.keys.map(key => ({ value: key, label: periodConfig.labels[key] || key }))

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

  const defaultPeriod = periodConfig.keys[0] || 'before_treatment'

  const resetForm = () => {
    setFormData({
      assigned_user_id: '',
      title: '',
      description: '',
      period: defaultPeriod,
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

  const isOwner = user?.role === 'owner'

  const handleSave = async () => {
    if (!user?.id || !formData.assigned_user_id || !formData.title.trim()) return
    setSaving(true)
    try {
      if (editingTemplate) {
        const { error } = await taskChecklistService.updateTaskTemplate(editingTemplate.id, formData, user.id, user.role)
        if (error) {
          alert(`수정 실패: ${error}`)
          return
        }
      } else {
        const { error } = await taskChecklistService.createTaskTemplate(formData, user.id, user.role)
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
    setSelectedIds(prev => { const next = new Set(prev); next.delete(templateId); return next })
    await fetchData()
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`선택한 ${selectedIds.size}개 업무를 삭제하시겠습니까?`)) return
    const ids = Array.from(selectedIds)
    const errors: string[] = []
    for (const id of ids) {
      const { error } = await taskChecklistService.deleteTaskTemplate(id)
      if (error) errors.push(error)
    }
    if (errors.length > 0) {
      alert(`${ids.length - errors.length}건 삭제 완료, ${errors.length}건 실패`)
    }
    setSelectedIds(new Set())
    await fetchData()
  }

  const handleSubmitForApproval = async (targetIds?: string[]) => {
    const idsToCheck = targetIds || Array.from(selectedIds)
    const draftIds = idsToCheck.filter(id => {
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
    setBulkItems([{ title: '', period: defaultPeriod }])
    setShowBulkForm(false)
  }

  const addBulkItem = () => {
    setBulkItems(prev => [...prev, { title: '', period: defaultPeriod }])
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
      const { error } = await taskChecklistService.createTaskTemplatesBulk(formDataItems, user.id, user.role)
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
  // 커스텀 라벨 + 기본 라벨 + 영문키 모두 매핑
  const periodMap: Record<string, TaskPeriod> = {
    ...Object.fromEntries(periodConfig.keys.map(k => [periodConfig.labels[k] || k, k])),
    ...Object.fromEntries(periodConfig.keys.map(k => [(periodConfig.labels[k] || k).replace(/\s/g, ''), k])),
    ...Object.fromEntries(periodConfig.keys.map(k => [k, k])),
    '진료시작 전': 'before_treatment',
    '진료시작전': 'before_treatment',
    '진료 전': 'before_treatment',
    '진료전': 'before_treatment',
    '진료 중': 'during_treatment',
    '진료중': 'during_treatment',
    '퇴근 전': 'before_leaving',
    '퇴근전': 'before_leaving',
  }

  const resetExcelUpload = () => {
    setShowExcelUpload(false)
    setExcelPreview([])
  }

  const updateExcelRow = (index: number, field: string, value: string) => {
    setExcelPreview(prev => prev.map((item, i) => {
      if (i !== index) return item
      if (field === 'assigned_user_id') {
        const s = staff.find(st => st.id === value)
        return {
          ...item,
          assigned_user_id: value,
          assigned_user_name: s?.name || '',
          valid: !!value && !!item.title,
          error: !value ? '담당자를 선택하세요' : !item.title ? '업무명 없음' : '',
        }
      }
      if (field === 'period') {
        return { ...item, period: value as TaskPeriod }
      }
      if (field === 'title') {
        return {
          ...item,
          title: value,
          valid: !!item.assigned_user_id && !!value.trim(),
          error: !item.assigned_user_id ? '담당자를 선택하세요' : !value.trim() ? '업무명 없음' : '',
        }
      }
      return item
    }))
  }

  const removeExcelRow = (index: number) => {
    setExcelPreview(prev => prev.filter((_, i) => i !== index))
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

      if (rows.length === 0) {
        alert('엑셀 파일에 데이터가 없습니다.')
        return
      }

      // 자동 분석: 각 행의 모든 셀을 스캔하여 이름/시간대/업무명 추출
      // 이름이 없는 행은 직전에 매칭된 직원을 자동으로 이어받음
      let lastMatchedStaff: Staff | undefined

      const parsed = rows.map(row => {
        const values = Object.values(row).map(v => (v ?? '').toString().trim()).filter(Boolean)

        let matchedStaff: Staff | undefined
        let matchedPeriod: TaskPeriod | undefined
        const remainingValues: string[] = []

        for (const val of values) {
          // 직원 이름 매칭
          if (!matchedStaff) {
            const found = staff.find(s => s.name === val)
            if (found) {
              matchedStaff = found
              continue
            }
          }
          // 시간대 매칭
          if (!matchedPeriod && periodMap[val]) {
            matchedPeriod = periodMap[val]
            continue
          }
          // 숫자만 있는 값(번호 등)은 건너뜀
          if (/^\d+$/.test(val)) continue
          remainingValues.push(val)
        }

        // 이름이 매칭되면 기억, 안 되면 직전 이름 사용
        if (matchedStaff) {
          lastMatchedStaff = matchedStaff
        } else {
          matchedStaff = lastMatchedStaff
        }

        // 나머지 값 중 가장 긴 것을 업무명으로 사용
        const title = remainingValues.sort((a, b) => b.length - a.length)[0] || ''
        const period = matchedPeriod || defaultPeriod

        let error = ''
        if (!matchedStaff) error = '담당자를 선택하세요'
        else if (!title) error = '업무명 없음'

        return {
          assigned_user_name: matchedStaff?.name || '',
          assigned_user_id: matchedStaff?.id || '',
          title,
          period,
          valid: !!matchedStaff && !!title,
          error,
        }
      })

      // 업무명이 비어있는 행 제거
      const filtered = parsed.filter(item => item.title)

      if (filtered.length === 0) {
        alert('엑셀 파일에서 업무 항목을 찾을 수 없습니다.')
        return
      }

      setExcelPreview(filtered)
      setShowExcelUpload(true)
    }
    reader.readAsBinaryString(file)

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
        period: item.period,
        sort_order: idx,
      }))
      const { error } = await taskChecklistService.createTaskTemplatesBulk(formDataItems, user.id, user.role)
      if (error) {
        alert(`엑셀 업로드 실패: ${error}`)
        return
      }
      resetExcelUpload()
      await fetchData()
    } finally {
      setExcelUploading(false)
    }
  }

  const downloadExcelTemplate = () => {
    const templateData = [
      { '담당자': '홍길동', '업무명': '진료실 소독 및 준비', '시간대': '진료시작 전' },
      { '담당자': '홍길동', '업무명': '기구 세척 및 멸균', '시간대': '퇴근 전' },
    ]
    const ws = XLSX.utils.json_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '업무체크리스트')

    ws['!cols'] = [
      { wch: 12 },
      { wch: 25 },
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
            <p className="text-sm text-slate-500 mt-1">
              {isOwner
                ? '직원별 업무를 생성하면 즉시 반영됩니다.'
                : '직원별 업무를 생성하고 원장에게 결재를 요청하세요.'}
            </p>
          </div>
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            {!isOwner && (() => {
              const allDraftCount = filteredTemplates.filter(t => t.status === 'draft' || t.status === 'rejected').length
              if (allDraftCount === 0) return null
              return (
                <button
                  onClick={() => handleSubmitForApproval(filteredTemplates.filter(t => t.status === 'draft' || t.status === 'rejected').map(t => t.id))}
                  disabled={submitting}
                  className="inline-flex items-center px-4 py-2 bg-yellow-500 text-white text-sm font-medium rounded-lg hover:bg-yellow-600 transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4 mr-1.5" />
                  {submitting ? '요청 중...' : `전체 결재 요청 (${allDraftCount})`}
                </button>
              )
            })()}
            <button
              onClick={() => { resetBulkForm(); setShowBulkForm(true); setShowForm(false); setShowExcelUpload(false) }}
              className="inline-flex items-center px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              업무 추가
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
            <button
              onClick={() => { setEditingConfig({ keys: [...periodConfig.keys], labels: { ...periodConfig.labels } }); setShowPeriodSettings(true) }}
              className="inline-flex items-center px-3 py-2 border border-slate-300 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
              title="시간대 설정"
            >
              <Settings className="w-4 h-4 mr-1.5" />
              시간대 설정
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
              <div className="flex gap-2">
                {periodOptions.map(opt => {
                  const selected = formData.period === opt.value
                  return (
                    <label
                      key={opt.value}
                      className={`flex-1 flex items-center justify-center cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors ${
                        selected
                          ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="period-single"
                        value={opt.value}
                        checked={selected}
                        onChange={(e) => setFormData(prev => ({ ...prev, period: e.target.value as TaskPeriod }))}
                        className="sr-only"
                      />
                      {opt.label}
                    </label>
                  )
                })}
              </div>
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
              <div className="col-span-5">업무명 *</div>
              <div className="col-span-5">시간대</div>
              <div className="col-span-1"></div>
            </div>

            {bulkItems.map((item, index) => (
              <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-50 rounded-lg p-2 sm:p-1 sm:bg-transparent">
                <div className="hidden sm:flex sm:col-span-1 justify-center">
                  <span className="text-xs text-slate-400">{index + 1}</span>
                </div>
                <div className="sm:col-span-5">
                  <label className="sm:hidden text-xs text-slate-500 mb-1 block">업무명 *</label>
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => updateBulkItem(index, 'title', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab' && !e.shiftKey) {
                        e.preventDefault()
                        // Tab: 첫 번째 시간대 선택 후 시간대 영역으로 포커스 이동
                        updateBulkItem(index, 'period', periodOptions[0].value)
                        const periodEl = document.querySelector<HTMLElement>(`[data-bulk-period="${index}"]`)
                        periodEl?.focus()
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        if (index === bulkItems.length - 1) {
                          addBulkItem()
                        }
                        setTimeout(() => {
                          const inputs = document.querySelectorAll<HTMLInputElement>('[data-bulk-title]')
                          inputs[index + 1]?.focus()
                        }, 0)
                      }
                    }}
                    data-bulk-title
                    placeholder="예: 진료실 소독 및 준비"
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="sm:col-span-5">
                  <label className="sm:hidden text-xs text-slate-500 mb-1 block">시간대</label>
                  <div
                    className="flex gap-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1"
                    tabIndex={0}
                    data-bulk-period={index}
                    role="radiogroup"
                    onKeyDown={(e) => {
                      const currentIdx = periodOptions.findIndex(o => o.value === item.period)
                      if (e.key === 'Tab' && !e.shiftKey) {
                        e.preventDefault()
                        const nextIdx = currentIdx + 1
                        if (nextIdx < periodOptions.length) {
                          // 다음 시간대로 이동
                          updateBulkItem(index, 'period', periodOptions[nextIdx].value)
                        } else {
                          // 마지막 시간대 → 다음 행의 업무명으로 이동
                          if (index === bulkItems.length - 1) {
                            addBulkItem()
                          }
                          setTimeout(() => {
                            const inputs = document.querySelectorAll<HTMLInputElement>('[data-bulk-title]')
                            inputs[index + 1]?.focus()
                          }, 0)
                        }
                      } else if (e.key === 'Tab' && e.shiftKey) {
                        e.preventDefault()
                        const prevIdx = currentIdx - 1
                        if (prevIdx >= 0) {
                          updateBulkItem(index, 'period', periodOptions[prevIdx].value)
                        } else {
                          // 첫 번째 시간대에서 Shift+Tab → 업무명으로 이동
                          const inputs = document.querySelectorAll<HTMLInputElement>('[data-bulk-title]')
                          inputs[index]?.focus()
                        }
                      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                        e.preventDefault()
                        const next = (currentIdx + 1) % periodOptions.length
                        updateBulkItem(index, 'period', periodOptions[next].value)
                      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                        e.preventDefault()
                        const prev = (currentIdx - 1 + periodOptions.length) % periodOptions.length
                        updateBulkItem(index, 'period', periodOptions[prev].value)
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        if (index === bulkItems.length - 1) {
                          addBulkItem()
                        }
                        setTimeout(() => {
                          const inputs = document.querySelectorAll<HTMLInputElement>('[data-bulk-title]')
                          inputs[index + 1]?.focus()
                        }, 0)
                      }
                    }}
                  >
                    {periodOptions.map(opt => {
                      const selected = item.period === opt.value
                      return (
                        <label
                          key={opt.value}
                          onClick={() => updateBulkItem(index, 'period', opt.value)}
                          className={`flex-1 flex items-center justify-center cursor-pointer rounded-lg border px-1.5 py-1.5 text-xs transition-colors ${
                            selected
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                              : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </label>
                      )
                    })}
                  </div>
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

      {/* 엑셀 업로드 - 자동 분석 결과 */}
      {showExcelUpload && (
        <div className="bg-white rounded-xl shadow-sm border border-green-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-800">엑셀 자동 분석 결과</h3>
              <p className="text-xs text-slate-500 mt-1">
                엑셀에서 직원 이름과 업무를 자동으로 인식했습니다. 필요시 수정 후 업로드하세요.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={downloadExcelTemplate}
                className="inline-flex items-center text-xs text-green-600 hover:text-green-800"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                양식 다운로드
              </button>
              <button onClick={resetExcelUpload} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs mb-3">
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
                수정 필요 {excelPreview.filter(i => !i.valid).length}건
              </span>
            )}
          </div>

          <div className="space-y-2">
            {/* 헤더 */}
            <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-medium text-slate-500 px-1">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-2">담당자</div>
              <div className="col-span-4">업무명</div>
              <div className="col-span-4">시간대</div>
              <div className="col-span-1"></div>
            </div>

            {excelPreview.map((item, idx) => (
              <div
                key={idx}
                className={`grid grid-cols-1 sm:grid-cols-12 gap-2 items-center rounded-lg p-2 ${
                  item.valid ? 'bg-slate-50' : 'bg-red-50 border border-red-200'
                }`}
              >
                <div className="hidden sm:flex sm:col-span-1 justify-center">
                  {item.valid ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="sm:hidden text-xs text-slate-500 mb-1 block">담당자</label>
                  <select
                    value={item.assigned_user_id}
                    onChange={(e) => updateExcelRow(idx, 'assigned_user_id', e.target.value)}
                    className={`w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                      item.assigned_user_id ? 'border-green-300' : 'border-red-300'
                    }`}
                  >
                    <option value="">직원 선택</option>
                    {staff.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-4">
                  <label className="sm:hidden text-xs text-slate-500 mb-1 block">업무명</label>
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => updateExcelRow(idx, 'title', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="sm:hidden text-xs text-slate-500 mb-1 block">시간대</label>
                  <div className="flex gap-1">
                    {periodOptions.map(opt => {
                      const selected = item.period === opt.value
                      return (
                        <label
                          key={opt.value}
                          className={`flex-1 flex items-center justify-center cursor-pointer rounded-lg border px-1.5 py-1.5 text-xs transition-colors ${
                            selected
                              ? 'border-green-500 bg-green-50 text-green-700 font-medium'
                              : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`period-excel-${idx}`}
                            value={opt.value}
                            checked={selected}
                            onChange={(e) => updateExcelRow(idx, 'period', e.target.value)}
                            className="sr-only"
                          />
                          {opt.label}
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div className="sm:col-span-1 flex justify-end sm:justify-center">
                  <button
                    onClick={() => removeExcelRow(idx)}
                    className="p-1.5 rounded-lg hover:bg-red-100 transition-colors"
                    title="행 삭제"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end space-x-2 mt-4 pt-4 border-t border-slate-100">
            <button
              onClick={resetExcelUpload}
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
            const periodOrder = Object.fromEntries(periodConfig.keys.map((k, i) => [k, i]))
            const pDiff = (periodOrder[a.period] ?? 999) - (periodOrder[b.period] ?? 999)
            if (pDiff !== 0) return pDiff
            return a.sort_order - b.sort_order
          })

          // 시간대별 그룹화
          const usedPeriods = [...new Set(sorted.map(t => t.period))]
          const orderedPeriods = periodConfig.keys.filter(k => usedPeriods.includes(k))
          for (const p of usedPeriods) {
            if (!orderedPeriods.includes(p)) orderedPeriods.push(p)
          }
          const groupedByPeriod = orderedPeriods.reduce((acc, period) => {
            acc[period] = sorted.filter(t => t.period === period)
            return acc
          }, {} as Record<string, TaskTemplate[]>)

          return (
            <div key={userId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={sorted.length > 0 && sorted.every(t => selectedIds.has(t.id))}
                    onChange={() => {
                      setSelectedIds(prev => {
                        const next = new Set(prev)
                        const allSelected = sorted.every(t => next.has(t.id))
                        if (allSelected) {
                          sorted.forEach(t => next.delete(t.id))
                        } else {
                          sorted.forEach(t => next.add(t.id))
                        }
                        return next
                      })
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    title={`${staffMember?.name || ''} 전체 선택`}
                  />
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

              {/* 직원별 결재 요청 바 */}
              {!isOwner && (() => {
                const userDrafts = sorted.filter(t => t.status === 'draft' || t.status === 'rejected')
                if (userDrafts.length === 0) return null
                return (
                  <div className="px-4 sm:px-6 py-2 bg-yellow-50 border-b border-yellow-200 flex items-center justify-between">
                    <span className="text-xs text-yellow-700">
                      결재 대기: 초안 {userDrafts.filter(t => t.status === 'draft').length}건
                      {userDrafts.some(t => t.status === 'rejected') && `, 반려 ${userDrafts.filter(t => t.status === 'rejected').length}건`}
                    </span>
                    <button
                      onClick={() => handleSubmitForApproval(userDrafts.map(t => t.id))}
                      disabled={submitting}
                      className="inline-flex items-center px-3 py-1 bg-yellow-500 text-white text-xs font-medium rounded-md hover:bg-yellow-600 transition-colors disabled:opacity-50"
                    >
                      <Send className="w-3 h-3 mr-1" />
                      {submitting ? '요청 중...' : `결재 요청 (${userDrafts.length})`}
                    </button>
                  </div>
                )
              })()}

              {orderedPeriods.map((period, periodIdx) => {
                const periodTemplates = groupedByPeriod[period]
                if (!periodTemplates || periodTemplates.length === 0) return null
                const color = PERIOD_COLORS[periodConfig.keys.indexOf(period) % PERIOD_COLORS.length] || PERIOD_COLORS[periodIdx % PERIOD_COLORS.length]
                const periodLabel = periodConfig.labels[period] || period

                return (
                  <div key={period}>
                    {/* 시간대 헤더 */}
                    <div className={`px-4 sm:px-6 py-2 ${color.bg} ${color.border} border-b flex items-center justify-between`}>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={periodTemplates.length > 0 && periodTemplates.every(t => selectedIds.has(t.id))}
                          onChange={() => {
                            setSelectedIds(prev => {
                              const next = new Set(prev)
                              const allSelected = periodTemplates.every(t => next.has(t.id))
                              if (allSelected) {
                                periodTemplates.forEach(t => next.delete(t.id))
                              } else {
                                periodTemplates.forEach(t => next.add(t.id))
                              }
                              return next
                            })
                          }}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          title={`${periodLabel} 전체 선택`}
                        />
                        <div className={`w-2 h-2 rounded-full ${color.dot}`} />
                        <span className={`text-xs font-semibold ${color.text}`}>{periodLabel}</span>
                      </div>
                      <span className={`text-xs ${color.text}`}>{periodTemplates.length}건</span>
                    </div>

                    {/* 해당 시간대 업무 목록 */}
                    <div className="divide-y divide-slate-100">
                      {periodTemplates.map(template => {
                        const statusBadge = STATUS_BADGE[template.status]

                        return (
                          <div
                            key={template.id}
                            className="px-4 sm:px-6 py-3 flex items-center space-x-3"
                          >
                            {/* 체크박스 */}
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
              })}
            </div>
          )
        })
      )}

      {/* 시간대 설정 모달 */}
      {showPeriodSettings && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">시간대 설정</h3>
              <button onClick={() => setShowPeriodSettings(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-sm text-slate-500">시간대를 추가, 삭제, 수정할 수 있습니다.</p>
              {editingConfig.keys.map((key, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-5 text-center">{idx + 1}</span>
                  <input
                    type="text"
                    value={editingConfig.labels[key] || ''}
                    onChange={(e) => {
                      const newLabels = { ...editingConfig.labels, [key]: e.target.value }
                      setEditingConfig(prev => ({ ...prev, labels: newLabels }))
                    }}
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="시간대 이름"
                  />
                  {editingConfig.keys.length > 1 && (
                    <button
                      onClick={() => {
                        const newKeys = editingConfig.keys.filter((_, i) => i !== idx)
                        const newLabels = { ...editingConfig.labels }
                        delete newLabels[key]
                        setEditingConfig({ keys: newKeys, labels: newLabels })
                      }}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => {
                  const newKey = `custom_${Date.now()}`
                  setEditingConfig(prev => ({
                    keys: [...prev.keys, newKey],
                    labels: { ...prev.labels, [newKey]: '' },
                  }))
                }}
                className="w-full flex items-center justify-center gap-1.5 border border-dashed border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 hover:border-slate-400 transition-colors"
              >
                <Plus className="w-4 h-4" />
                시간대 추가
              </button>
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
              <button
                onClick={() => {
                  setEditingConfig({ keys: [...DEFAULT_PERIOD_KEYS], labels: { ...DEFAULT_PERIOD_LABELS } })
                }}
                className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                기본값으로 초기화
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPeriodSettings(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    const finalKeys = editingConfig.keys.filter(k => (editingConfig.labels[k] || '').trim())
                    if (finalKeys.length === 0) {
                      alert('최소 1개 이상의 시간대가 필요합니다.')
                      return
                    }
                    const finalLabels: Record<string, string> = {}
                    for (const k of finalKeys) {
                      finalLabels[k] = (editingConfig.labels[k] || '').trim()
                    }
                    const config: PeriodConfig = { keys: finalKeys, labels: finalLabels }
                    setPeriodConfig(config)
                    savePeriodConfig(config)
                    setShowPeriodSettings(false)
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 선택 시 하단 플로팅 액션 바 */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-800 text-white rounded-xl shadow-2xl px-5 py-3 flex items-center space-x-4 animate-in fade-in slide-in-from-bottom-4">
          <span className="text-sm font-medium">{selectedIds.size}개 선택</span>
          <div className="w-px h-5 bg-slate-600" />
          <button
            onClick={handleBulkDelete}
            className="inline-flex items-center px-3 py-1.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            삭제
          </button>
          {!isOwner && (() => {
            const selectedDraftCount = Array.from(selectedIds).filter(id => {
              const t = templates.find(t => t.id === id)
              return t && (t.status === 'draft' || t.status === 'rejected')
            }).length
            if (selectedDraftCount === 0) return null
            return (
              <button
                onClick={() => handleSubmitForApproval()}
                disabled={submitting}
                className="inline-flex items-center px-3 py-1.5 bg-yellow-500 text-white text-sm font-medium rounded-lg hover:bg-yellow-600 transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4 mr-1" />
                {submitting ? '요청 중...' : `결재 요청 (${selectedDraftCount})`}
              </button>
            )
          })()}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors"
            title="선택 해제"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
