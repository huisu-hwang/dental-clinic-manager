'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Repeat,
  Pencil,
  Trash2,
  Play,
  Pause,
  User,
  CalendarRange,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { recurringTaskTemplateService } from '@/lib/bulletinService'
import type { RecurringTaskTemplate } from '@/types/bulletin'
import {
  TASK_PRIORITY_LABELS,
  formatRecurrenceRule,
} from '@/types/bulletin'
import { appConfirm, appAlert } from '@/components/ui/AppDialog'
import RecurringTaskTemplateForm from './RecurringTaskTemplateForm'

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

/**
 * 반복 업무 템플릿 관리 목록
 * TaskList의 "반복 템플릿" 탭 안에서 렌더링됨. 관리자 전용.
 * 디자인: AT 토큰, rounded-xl, 기존 TaskCardView 카드 스타일과 동일 계열
 */
export default function RecurringTaskTemplateList() {
  const [templates, setTemplates] = useState<RecurringTaskTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<RecurringTaskTemplate | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

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

  const handleToggleActive = async (template: RecurringTaskTemplate) => {
    setUpdatingId(template.id)
    const { error: updateError } = await recurringTaskTemplateService.updateTemplate(template.id, {
      is_active: !template.is_active,
    })
    setUpdatingId(null)
    if (updateError) {
      await appAlert(`상태 변경에 실패했습니다: ${updateError}`)
      return
    }
    fetchTemplates()
  }

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

      {/* 안내 문구 */}
      <div className="p-3 bg-at-accent-light/40 border border-at-border rounded-xl">
        <div className="text-xs text-at-text-secondary leading-relaxed">
          주간·월간·연간 주기로 반복되는 업무를 등록하면, 해당일이 될 때마다 담당자의
          대시보드에 자동으로 업무가 생성됩니다. 새 템플릿 등록은 <strong>새 업무 할당</strong>{' '}
          버튼에서 <strong>&ldquo;반복 업무로 지정&rdquo;</strong>을 체크하여 만들 수 있습니다.
        </div>
      </div>

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
            const isInactive = !template.is_active
            return (
              <div
                key={template.id}
                className={`px-4 py-3 transition-colors ${
                  isInactive ? 'opacity-60 bg-at-surface-alt/40' : 'hover:bg-at-surface-alt'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  {/* 왼쪽: 정보 */}
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
                      {isInactive && (
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full bg-at-surface-alt text-at-text-weak border border-at-border">
                          일시중지
                        </span>
                      )}
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

                  {/* 오른쪽: 액션 */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(template)}
                      disabled={updatingId === template.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-at-text-secondary bg-white hover:bg-at-surface-alt border border-at-border rounded-xl transition-colors disabled:opacity-50"
                      title={isInactive ? '재개' : '일시중지'}
                    >
                      {updatingId === template.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isInactive ? (
                        <Play className="w-3.5 h-3.5" />
                      ) : (
                        <Pause className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">{isInactive ? '재개' : '일시중지'}</span>
                    </button>
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
    </div>
  )
}
