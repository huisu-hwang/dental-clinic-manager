'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Repeat,
  Pencil,
  Trash2,
  User,
  CalendarRange,
  AlertCircle,
  Loader2,
  Download,
  Users,
  X,
} from 'lucide-react'
import { recurringTaskTemplateService } from '@/lib/bulletinService'
import type { RecurringTaskTemplate } from '@/types/bulletin'
import {
  TASK_PRIORITY_LABELS,
  formatRecurrenceRule,
} from '@/types/bulletin'
import { appConfirm, appAlert } from '@/components/ui/AppDialog'
import RecurringTaskTemplateForm from './RecurringTaskTemplateForm'
import BulkAssigneeChangeModal from './BulkAssigneeChangeModal'
import { Button } from '@/components/ui/Button'

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-at-error-bg text-at-error',
  high: 'bg-orange-50 text-orange-600',
  medium: 'bg-at-accent-light text-at-accent',
  low: 'bg-at-surface-alt text-at-text-weak',
}

const formatDate = (dateString: string) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

// 현재 사용자 role 체크 (담당자 일괄 변경/삭제 권한)
const getCurrentUserRole = (): string | null => {
  if (typeof window === 'undefined') return null
  const userStr = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
  if (!userStr) return null
  try {
    return JSON.parse(userStr).role || null
  } catch {
    return null
  }
}

/**
 * 반복 업무 템플릿 관리 목록
 * TaskList의 "반복 템플릿" 탭 안에서 렌더링됨. 관리자 전용.
 */
export default function RecurringTaskTemplateList() {
  const [templates, setTemplates] = useState<RecurringTaskTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<RecurringTaskTemplate | null>(null)
  const [seeding, setSeeding] = useState(false)

  // 다중 선택 (대표 원장/마스터)
  const role = getCurrentUserRole()
  const canBulk = role === 'owner' || role === 'master_admin'
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkAssigneeModal, setShowBulkAssigneeModal] = useState(false)

  const fetchTemplates = useCallback(async () => {
    setError(null)
    const { data, error: fetchError } = await recurringTaskTemplateService.listTemplates()
    if (fetchError) {
      setError(fetchError)
    } else {
      setTemplates(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (prev.size === templates.length && templates.length > 0) return new Set()
      return new Set(templates.map(t => t.id))
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleDelete = async (template: RecurringTaskTemplate) => {
    const confirmed = await appConfirm(
      `"${template.title}" 템플릿을 삭제하시겠습니까?\n\n` +
        '이미 생성된 과거 업무 인스턴스는 그대로 유지됩니다.\n' +
        '이후로는 새 인스턴스가 자동 생성되지 않습니다.'
    )
    if (!confirmed) return

    const { success, error: deleteError } = await recurringTaskTemplateService.deleteTemplate(template.id)
    if (!success) {
      await appAlert(`삭제에 실패했습니다: ${deleteError}`)
      return
    }
    fetchTemplates()
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const ok = await appConfirm(
      `선택한 ${selectedIds.size}개 반복 템플릿을 삭제하시겠습니까?\n\n` +
        '이미 생성된 과거 업무 인스턴스는 그대로 유지됩니다.\n' +
        '이후로는 새 인스턴스가 자동 생성되지 않습니다.'
    )
    if (!ok) return
    const { success, deletedCount, error } = await recurringTaskTemplateService.bulkDeleteTemplates(
      Array.from(selectedIds)
    )
    if (!success) {
      await appAlert(error || '삭제에 실패했습니다.')
      return
    }
    clearSelection()
    await fetchTemplates()
    await appAlert(`${deletedCount}개 템플릿이 삭제되었습니다.`)
  }

  const handleBulkAssigneeSuccess = async (updatedCount: number) => {
    setShowBulkAssigneeModal(false)
    clearSelection()
    await fetchTemplates()
    await appAlert(`${updatedCount}개 템플릿의 담당자가 변경되었습니다.`)
  }

  const handleSeedDefaults = async () => {
    const confirmed = await appConfirm(
      '치과 운영에 필수적인 반복 업무 39개(주간 5 · 월간 8 · 분기별 16 · 연간 10)를\n' +
        '기본 템플릿으로 일괄 등록합니다.\n\n' +
        '모든 템플릿의 담당자는 현재 로그인한 사용자로 설정되며,\n' +
        '등록 후 각 항목의 담당자를 편집할 수 있습니다.\n\n' +
        '이미 동일 제목의 템플릿이 있으면 건너뜁니다.\n\n' +
        '계속하시겠습니까?'
    )
    if (!confirmed) return

    setSeeding(true)
    const { created, skipped, error: seedError } = await recurringTaskTemplateService.seedDefaultTemplates()
    setSeeding(false)

    if (seedError) {
      await appAlert(`기본 템플릿 등록에 실패했습니다: ${seedError}`)
      return
    }

    const msg =
      skipped > 0
        ? `${created}개 등록 완료, ${skipped}개는 이미 존재하여 건너뛰었습니다.`
        : `${created}개 기본 템플릿을 등록했습니다.`
    await appAlert(msg)
    fetchTemplates()
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-at-accent-light text-at-accent">
          <Repeat className="w-3.5 h-3.5" />
        </div>
        <h3 className="text-sm sm:text-base font-semibold text-at-text">반복 업무 템플릿</h3>
        {!loading && (
          <span className="text-xs text-at-text-weak font-normal ml-1">총 {templates.length}건</span>
        )}
      </div>

      {/* 안내 문구 + 기본 템플릿 불러오기 */}
      <div className="p-3 bg-at-accent-light/40 border border-at-border rounded-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="text-xs text-at-text-secondary leading-relaxed flex-1">
            주간·월간·분기·연간 주기로 반복되는 업무를 등록하면, 해당일이 될 때마다 담당자의
            대시보드에 자동으로 업무가 생성됩니다. 새 템플릿 등록은 <strong>새 업무 할당</strong>{' '}
            버튼에서 <strong>&ldquo;반복 업무로 지정&rdquo;</strong>을 체크하여 만들 수 있습니다.
          </div>
          <button
            type="button"
            onClick={handleSeedDefaults}
            disabled={seeding || loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-at-accent bg-white hover:bg-at-surface-alt border border-at-border rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap flex-shrink-0"
          >
            {seeding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            기본 템플릿 불러오기
          </button>
        </div>
      </div>

      {/* 일괄 선택 액션바 */}
      {canBulk && selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 bg-at-accent-light border border-at-accent rounded-xl">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-at-accent">
              {selectedIds.size}개 선택됨
            </span>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-sm font-medium text-at-accent hover:underline"
            >
              {selectedIds.size === templates.length && templates.length > 0
                ? '전체 해제'
                : '전체 선택'}
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => setShowBulkAssigneeModal(true)}
              className="flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              담당자 일괄 변경
            </Button>
            <Button
              variant="outline"
              onClick={handleBulkDelete}
              className="flex items-center gap-2 text-at-error hover:text-at-error hover:bg-at-error-bg border-red-200"
            >
              <Trash2 className="w-4 h-4" />
              일괄 삭제
            </Button>
            <Button variant="outline" onClick={clearSelection} className="flex items-center gap-2">
              <X className="w-4 h-4" />
              선택 해제
            </Button>
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-at-error-bg text-at-error rounded-xl">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-at-text-weak">
          <div className="w-16 h-16 bg-at-accent-light rounded-full flex items-center justify-center mx-auto mb-4">
            <Repeat className="w-8 h-8 text-at-accent opacity-60" />
          </div>
          <p className="font-medium text-at-text-secondary mb-1">등록된 반복 업무 템플릿이 없습니다</p>
          <p className="text-sm text-at-text-weak">
            &ldquo;새 업무 할당&rdquo;에서 반복 업무로 지정하여 만들어보세요.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-at-border divide-y divide-at-border">
          {templates.map((template) => {
            const isChecked = selectedIds.has(template.id)
            return (
              <div
                key={template.id}
                className={`px-4 py-3 transition-colors ${
                  isChecked ? 'bg-at-accent-light/40' : 'hover:bg-at-surface-alt'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  {/* 왼쪽: 체크박스 + 정보 */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {canBulk && (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(template.id)}
                        className="mt-1 w-4 h-4 rounded border-at-border text-at-accent focus:ring-2 focus:ring-at-accent flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        <Repeat className="w-3.5 h-3.5 text-at-accent flex-shrink-0" />
                        <span className="text-sm font-medium text-at-text truncate">
                          {template.title}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full ${
                            PRIORITY_BADGE[template.priority] || PRIORITY_BADGE.medium
                          }`}
                        >
                          {TASK_PRIORITY_LABELS[template.priority]}
                        </span>
                      </div>
                      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-at-text-secondary">
                        <span className="inline-flex items-center gap-1">
                          <Repeat className="w-3 h-3" />
                          {formatRecurrenceRule(template)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {template.assignee_name || '미지정'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarRange className="w-3 h-3" />
                          {formatDate(template.start_date)}
                          {template.end_date ? ` ~ ${formatDate(template.end_date)}` : ' ~'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 오른쪽: 편집 / 삭제 (일시정지 제거) */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing(template)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-at-accent bg-at-accent-light hover:bg-at-tag border border-at-border rounded-xl transition-colors"
                      title="편집"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">편집</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(template)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-at-error bg-at-error-bg hover:bg-red-100 border border-at-border rounded-xl transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">삭제</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 편집 모달 */}
      {editing && (
        <RecurringTaskTemplateForm
          template={editing}
          onSubmit={() => {
            setEditing(null)
            fetchTemplates()
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* 담당자 일괄 변경 모달 */}
      {showBulkAssigneeModal && (
        <BulkAssigneeChangeModal
          selectedCount={selectedIds.size}
          itemLabel="반복 템플릿"
          onConfirm={(newAssigneeId) =>
            recurringTaskTemplateService.bulkUpdateAssignee(Array.from(selectedIds), newAssigneeId)
          }
          onClose={() => setShowBulkAssigneeModal(false)}
          onSuccess={handleBulkAssigneeSuccess}
        />
      )}
    </div>
  )
}
