'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  ClipboardList,
  RefreshCw,
  PlayCircle,
  Eye,
  CheckCircle2,
  Repeat,
  User,
  Calendar,
  Flag,
  Loader2,
  Inbox,
  Plus,
  Trash2,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { taskService, recurringTaskTemplateService } from '@/lib/bulletinService'
import type { Task, TaskStatus, TaskPriority } from '@/types/bulletin'
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from '@/types/bulletin'
import { appAlert, appConfirm } from '@/components/ui/AppDialog'

// TipTap 에디터 등 무거운 의존성을 대시보드 초기 번들에 포함시키지 않기 위해 동적 로드
const TaskForm = dynamic(() => import('@/components/Bulletin/TaskForm'), {
  ssr: false,
  loading: () => (
    <div className="py-12 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-at-accent" />
    </div>
  ),
})

const ADMIN_ROLES = ['master_admin', 'owner', 'vice_director', 'manager', 'team_leader']

type DashboardTab = 'toMe' | 'byMe'

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  urgent: 'text-at-error',
  high: 'text-orange-500',
  medium: 'text-at-accent',
  low: 'text-at-text-weak',
}

const STATUS_BADGE: Record<TaskStatus, string> = {
  pending: 'bg-at-surface-alt text-at-text-secondary border-at-border',
  in_progress: 'bg-at-accent-light text-at-accent border-at-border',
  review: 'bg-purple-50 text-purple-700 border-purple-200',
  completed: 'bg-at-success-bg text-at-success border-green-200',
  on_hold: 'bg-at-warning-bg text-yellow-700 border-yellow-200',
  cancelled: 'bg-at-error-bg text-at-error border-red-200',
}

const formatDate = (dateString?: string) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  return sameYear
    ? `${date.getMonth() + 1}/${date.getDate()}`
    : `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`
}

const isOverdue = (task: Task): boolean => {
  if (!task.due_date) return false
  if (task.status === 'completed' || task.status === 'cancelled') return false
  const due = new Date(task.due_date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

/**
 * 대시보드 홈 "내 업무" 위젯
 * - 일반 직원: 내게 할당된 미완료 업무만
 * - 관리자: 두 탭 (내 업무 / 내가 지시한 업무)
 * - 마운트 시 materializeDueInstances 호출 → 오늘 해당하는 반복 업무 즉시 생성
 * 디자인: AT 토큰 + DashboardHome 기존 섹션 스타일 (text-sm font-semibold header, rounded-2xl card)
 */
export default function MyTasksSection() {
  const { user } = useAuth()
  const router = useRouter()
  const isAdmin = !!(user?.role && ADMIN_ROLES.includes(user.role))
  const isOwner = user?.role === 'owner'

  const [tab, setTab] = useState<DashboardTab>('toMe')
  const [assignedToMe, setAssignedToMe] = useState<Task[]>([])
  const [assignedByMe, setAssignedByMe] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionTaskId, setActionTaskId] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)

  const load = useCallback(
    async (initial: boolean) => {
      if (initial) setLoading(true)
      else setRefreshing(true)

      // 오늘 해당하는 반복 업무 인스턴스를 먼저 materialize (역할 무관, RPC는 SECURITY DEFINER)
      try {
        await recurringTaskTemplateService.materializeDueInstances()
      } catch (err) {
        // materialize 실패는 목록 조회를 막지 않음 (RLS 등 이유일 수 있음)
        console.warn('[MyTasksSection] materialize failed:', err)
      }

      const { data, error } = await taskService.getDashboardTasks({
        includeAssignedByMe: isAdmin,
      })
      if (!error && data) {
        setAssignedToMe(data.assignedToMe)
        setAssignedByMe(data.assignedByMe)
      }
      if (initial) setLoading(false)
      setRefreshing(false)
    },
    [isAdmin]
  )

  useEffect(() => {
    if (!user) return
    load(true)
    // 5분 주기 재조회 + 포커스 복귀 시 재조회
    const intervalId = setInterval(() => load(false), 5 * 60 * 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user, load])

  const currentList = tab === 'toMe' ? assignedToMe : assignedByMe

  const handleTransition = async (task: Task, nextStatus: TaskStatus) => {
    setActionTaskId(task.id)
    // Optimistic: 완료/취소되면 즉시 제거, 그 외엔 상태 업데이트
    const isTerminal = nextStatus === 'completed' || nextStatus === 'cancelled'
    const prevToMe = assignedToMe
    const prevByMe = assignedByMe

    if (isTerminal) {
      setAssignedToMe((prev) => prev.filter((t) => t.id !== task.id))
      setAssignedByMe((prev) => prev.filter((t) => t.id !== task.id))
    } else {
      setAssignedToMe((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
      )
      setAssignedByMe((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
      )
    }

    const { error } = await taskService.updateTaskStatus(task.id, nextStatus)
    setActionTaskId(null)
    if (error) {
      // 롤백
      setAssignedToMe(prevToMe)
      setAssignedByMe(prevByMe)
      await appAlert(`상태 변경에 실패했습니다: ${error}`)
    }
  }

  const openDetail = (task: Task) => {
    router.push(`/dashboard/tasks?taskId=${task.id}`)
  }

  const handleDelete = async (task: Task) => {
    const confirmed = await appConfirm({
      title: '업무 삭제',
      description: `"${task.title}" 업무를 삭제하시겠습니까?\n삭제된 업무는 복구할 수 없습니다.`,
      variant: 'destructive',
      confirmText: '삭제',
      cancelText: '취소',
    })
    if (!confirmed) return

    setDeletingTaskId(task.id)
    const prevToMe = assignedToMe
    const prevByMe = assignedByMe
    // Optimistic remove
    setAssignedToMe((prev) => prev.filter((t) => t.id !== task.id))
    setAssignedByMe((prev) => prev.filter((t) => t.id !== task.id))

    const { success, error } = await taskService.deleteTask(task.id)
    setDeletingTaskId(null)
    if (!success) {
      // 롤백
      setAssignedToMe(prevToMe)
      setAssignedByMe(prevByMe)
      await appAlert(`삭제에 실패했습니다: ${error}`)
    }
  }

  const renderActions = (task: Task) => {
    const isActing = actionTaskId === task.id
    const status = task.status

    // 내가 지시한 업무 탭: 검토요청 상태일 때만 "완료 승인" 노출
    if (tab === 'byMe') {
      if (status === 'review') {
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleTransition(task, 'completed')
            }}
            disabled={isActing}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-at-success hover:bg-green-700 rounded-xl transition-colors disabled:opacity-50"
          >
            {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">완료 승인</span>
          </button>
        )
      }
      return null
    }

    // 내 업무 탭: 시작 / 검토요청 / 완료
    const actions: { label: string; next: TaskStatus; icon: React.ReactNode; cls: string }[] = []

    if (status === 'pending' || status === 'on_hold') {
      actions.push({
        label: '시작',
        next: 'in_progress',
        icon: <PlayCircle className="w-3.5 h-3.5" />,
        cls: 'text-at-accent bg-at-accent-light hover:bg-at-tag border border-at-border',
      })
    }
    if (status === 'in_progress') {
      actions.push({
        label: '검토요청',
        next: 'review',
        icon: <Eye className="w-3.5 h-3.5" />,
        cls: 'text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200',
      })
      actions.push({
        label: '완료',
        next: 'completed',
        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
        cls: 'text-white bg-at-success hover:bg-green-700 border border-transparent',
      })
    }
    if (status === 'review') {
      actions.push({
        label: '완료',
        next: 'completed',
        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
        cls: 'text-white bg-at-success hover:bg-green-700 border border-transparent',
      })
    }

    if (actions.length === 0) return null

    return (
      <div className="flex items-center gap-1.5">
        {actions.map((a) => (
          <button
            key={a.next}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleTransition(task, a.next)
            }}
            disabled={isActing}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-xl transition-colors disabled:opacity-50 ${a.cls}`}
          >
            {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : a.icon}
            <span className="hidden sm:inline">{a.label}</span>
          </button>
        ))}
      </div>
    )
  }

  // 숨김 조건: 로그인하지 않은 경우
  if (!user) return null

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-at-text tracking-[0.08px] flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-at-accent" />
          내 업무
          {!loading && (
            <span className="text-xs text-at-text-weak font-normal ml-0.5">
              {isAdmin
                ? `담당 ${assignedToMe.length} · 지시 ${assignedByMe.length}`
                : `${assignedToMe.length}건`}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1.5">
          {isOwner && (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-at-accent hover:bg-at-accent/90 rounded-lg transition-colors"
              title="업무 추가"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">추가</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => load(false)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-at-text-secondary hover:text-at-text bg-at-surface-alt hover:bg-at-surface-hover border border-at-border rounded-lg transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 관리자 탭 */}
      {isAdmin && (
        <div className="flex items-center gap-1 mb-2">
          <button
            type="button"
            onClick={() => setTab('toMe')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors ${
              tab === 'toMe'
                ? 'bg-at-accent text-white border-at-accent'
                : 'bg-white text-at-text-secondary border-at-border hover:bg-at-surface-alt'
            }`}
          >
            내 업무
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                tab === 'toMe' ? 'bg-white/20 text-white' : 'bg-at-surface-alt text-at-text-weak'
              }`}
            >
              {assignedToMe.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab('byMe')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors ${
              tab === 'byMe'
                ? 'bg-at-accent text-white border-at-accent'
                : 'bg-white text-at-text-secondary border-at-border hover:bg-at-surface-alt'
            }`}
          >
            내가 지시한 업무
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                tab === 'byMe' ? 'bg-white/20 text-white' : 'bg-at-surface-alt text-at-text-weak'
              }`}
            >
              {assignedByMe.length}
            </span>
          </button>
        </div>
      )}

      {/* 본문 */}
      {loading ? (
        <div className="flex items-center justify-center py-8 bg-at-surface-alt rounded-2xl border border-at-border">
          <Loader2 className="w-5 h-5 animate-spin text-at-accent" />
        </div>
      ) : currentList.length === 0 ? (
        <div className="bg-at-surface-alt rounded-2xl border border-at-border px-4 py-8 text-center">
          <Inbox className="w-8 h-8 text-at-text-weak/50 mx-auto mb-2" />
          <p className="text-sm text-at-text-secondary">
            {tab === 'toMe' ? '처리할 업무가 없습니다' : '내가 지시한 진행 중 업무가 없습니다'}
          </p>
          <p className="text-xs text-at-text-weak mt-0.5">
            {tab === 'toMe'
              ? '새로운 업무가 할당되면 여기에 표시됩니다.'
              : '담당자가 검토 요청을 올리면 여기서 승인할 수 있습니다.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-at-border divide-y divide-at-border max-h-[420px] overflow-y-auto">
          {currentList.map((task) => {
            const overdue = isOverdue(task)
            return (
              <div
                key={task.id}
                onClick={() => openDetail(task)}
                className="group cursor-pointer hover:bg-at-surface-alt transition-colors"
              >
                <div className="flex items-start gap-3 px-4 py-3">
                  {/* 본문 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-1.5 mb-1">
                      {task.recurring_template_id && (
                        <Repeat
                          className="w-3 h-3 text-at-accent flex-shrink-0"
                          aria-label="반복 업무"
                        />
                      )}
                      <span className="text-sm font-medium text-at-text truncate group-hover:text-at-accent transition-colors">
                        {task.title}
                      </span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full border ${STATUS_BADGE[task.status]}`}
                      >
                        {TASK_STATUS_LABELS[task.status]}
                      </span>
                      {overdue && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-at-error-bg text-at-error border border-red-200">
                          기한 초과
                        </span>
                      )}
                    </div>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-at-text-weak">
                      <span className={`inline-flex items-center gap-1 ${PRIORITY_STYLES[task.priority]}`}>
                        <Flag className="w-3 h-3" />
                        {TASK_PRIORITY_LABELS[task.priority]}
                      </span>
                      {task.due_date && (
                        <span
                          className={`inline-flex items-center gap-1 ${
                            overdue ? 'text-at-error font-medium' : ''
                          }`}
                        >
                          <Calendar className="w-3 h-3" />
                          {formatDate(task.due_date)}
                        </span>
                      )}
                      {(tab === 'byMe' || isAdmin) && task.assignee_name && (
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {task.assignee_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 액션 */}
                  <div className="flex-shrink-0 flex items-center gap-1.5">
                    {renderActions(task)}
                    {isOwner && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(task)
                        }}
                        disabled={deletingTaskId === task.id}
                        className="inline-flex items-center justify-center w-7 h-7 text-at-text-weak hover:text-at-error hover:bg-at-error-bg rounded-lg transition-colors disabled:opacity-50"
                        title="업무 삭제"
                        aria-label="업무 삭제"
                      >
                        {deletingTaskId === task.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 업무 추가 모달 (대표원장 전용) */}
      {isOwner && isCreateOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setIsCreateOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full my-8 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <TaskForm
              onSubmit={() => {
                setIsCreateOpen(false)
                load(false)
              }}
              onCancel={() => setIsCreateOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
