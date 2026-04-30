'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ListTodo,
  Plus,
  Search,
  AlertCircle,
  Filter,
  CheckCircle2,
  ClipboardList,
  LayoutGrid,
  CalendarDays,
  Users,
  Repeat,
  CheckSquare,
  X,
  Tag,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { taskService } from '@/lib/bulletinService'
import type { Task, TaskStatus, TaskPriority, TaskPeriod } from '@/types/bulletin'
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_PERIOD_LABELS,
} from '@/types/bulletin'
import TaskDetail from './TaskDetail'
import TaskForm from './TaskForm'
import TaskCardView from './TaskCardView'
import RecurringTaskTemplateList from './RecurringTaskTemplateList'
import BulkAssigneeChangeModal from './BulkAssigneeChangeModal'
import { appConfirm, appAlert } from '@/components/ui/AppDialog'

type ViewTab = 'active' | 'completed' | 'recurring'
type CompletedPeriod = 'all' | '1w' | '1m' | '3m' | '6m'

const COMPLETED_PERIOD_LABELS: Record<CompletedPeriod, string> = {
  all: '전체 기간',
  '1w': '최근 1주',
  '1m': '최근 1개월',
  '3m': '최근 3개월',
  '6m': '최근 6개월',
}

const getDateThreshold = (period: CompletedPeriod): Date | null => {
  if (period === 'all') return null
  const now = new Date()
  switch (period) {
    case '1w': now.setDate(now.getDate() - 7); break
    case '1m': now.setMonth(now.getMonth() - 1); break
    case '3m': now.setMonth(now.getMonth() - 3); break
    case '6m': now.setMonth(now.getMonth() - 6); break
  }
  return now
}

interface TaskListProps {
  canCreate?: boolean
  showMyTasksOnly?: boolean
}

// 현재 사용자 ID 가져오기
const getCurrentUserId = (): string | null => {
  if (typeof window === 'undefined') return null
  const userStr = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
  if (!userStr) return null
  try {
    const user = JSON.parse(userStr)
    return user.id
  } catch {
    return null
  }
}

// 현재 사용자 role 가져오기 (대표 원장 일괄 변경 권한 체크용)
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

export default function TaskList({ canCreate = false, showMyTasksOnly = false }: TaskListProps) {
  const searchParams = useSearchParams()
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const currentUserId = getCurrentUserId()
  const currentUserRole = getCurrentUserRole()
  const canBulkReassign = currentUserRole === 'owner' || currentUserRole === 'master_admin'
  const autoOpenedRef = useRef(false)
  const [selectedPriority, setSelectedPriority] = useState<TaskPriority | ''>('')
  const [periodFilter, setPeriodFilter] = useState<TaskPeriod | ''>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [activeTab, setActiveTab] = useState<ViewTab>('active')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'overdue' | ''>('')
  const [completedPeriod, setCompletedPeriod] = useState<CompletedPeriod>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')
  const [completedSearchQuery, setCompletedSearchQuery] = useState('')
  // 일괄 선택 모드 (대표 원장만 사용)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkAssigneeModal, setShowBulkAssigneeModal] = useState(false)
  const [stats, setStats] = useState<{
    total: number
    pending: number
    in_progress: number
    review: number
    completed: number
    overdue: number
  } | null>(null)

  const fetchTasks = useCallback(async () => {
    setError(null)
    const { data, error: fetchError } = await taskService.getTasks({
      priority: selectedPriority || undefined,
      search: searchQuery || undefined,
      assignee_id: showMyTasksOnly ? (currentUserId || undefined) : undefined,
      limit: 500,
      offset: 0,
    })
    if (fetchError) {
      setError(fetchError)
    } else {
      setAllTasks(data || [])
    }
    setLoading(false)
  }, [selectedPriority, searchQuery, showMyTasksOnly, currentUserId])

  const fetchStats = useCallback(async () => {
    const { data } = await taskService.getTaskStats()
    if (data) {
      setStats(data)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
    fetchStats()
  }, [fetchTasks, fetchStats])

  // URL의 taskId 파라미터로 해당 업무 상세 자동 오픈
  useEffect(() => {
    const taskId = searchParams.get('taskId')
    if (taskId && !autoOpenedRef.current && !loading) {
      autoOpenedRef.current = true
      taskService.getTask(taskId).then(({ data }) => {
        if (data) setSelectedTask(data)
      })
    }
  }, [searchParams, loading])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchTasks()
  }

  const handleTaskClick = async (task: Task) => {
    const { data } = await taskService.getTask(task.id)
    if (data) setSelectedTask(data)
  }

  const handleEdit = (task: Task) => {
    setEditingTask(task)
    setShowForm(true)
    setSelectedTask(null)
  }

  const handleDelete = async (id: string) => {
    if (!await appConfirm('정말 삭제하시겠습니까?')) return
    const { success, error: deleteError } = await taskService.deleteTask(id)
    if (success) {
      fetchTasks()
      fetchStats()
      setSelectedTask(null)
    } else {
      await appAlert(deleteError || '삭제에 실패했습니다.')
    }
  }

  const handleStatusUpdate = async (id: string, status: TaskStatus) => {
    const { error: updateError } = await taskService.updateTaskStatus(id, status)
    if (updateError) {
      await appAlert(`상태 변경에 실패했습니다: ${updateError}`)
      return
    }
    await Promise.all([fetchTasks(), fetchStats()])
    if (selectedTask?.id === id) {
      const { data } = await taskService.getTask(id)
      if (data) setSelectedTask(data)
    }
  }

  const handleFormSubmit = () => {
    setShowForm(false)
    setEditingTask(null)
    fetchTasks()
    fetchStats()
  }

  const handleFormCancel = () => {
    setShowForm(false)
    setEditingTask(null)
  }

  const handleStatClick = (filter: TaskStatus | 'overdue' | 'all') => {
    if (filter === 'all') {
      setStatusFilter('')
      return
    }
    // 같은 필터 다시 클릭하면 해제
    if (statusFilter === filter) {
      setStatusFilter('')
      return
    }
    setStatusFilter(filter)
    // 완료 필터 클릭 시 완료 탭으로 자동 전환
    if (filter === 'completed') {
      setActiveTab('completed')
    } else {
      setActiveTab('active')
    }
  }

  const isOverdue = (task: Task) => {
    if (!task.due_date) return false
    if (task.status === 'completed' || task.status === 'cancelled') return false
    return new Date(task.due_date) < new Date()
  }

  // 탭에 따라 필터링
  const activeTasks = useMemo(() =>
    allTasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled'),
    [allTasks]
  )
  const completedTasks = useMemo(() =>
    allTasks.filter(t => t.status === 'completed'),
    [allTasks]
  )

  // 완료된 업무의 고유 담당자 목록
  const completedAssignees = useMemo(() => {
    const map = new Map<string, string>()
    completedTasks.forEach(t => {
      if (t.assignee_id && t.assignee_name) {
        map.set(t.assignee_id, t.assignee_name)
      }
    })
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [completedTasks])

  // 완료 탭 전용 필터 적용 (기간 + 담당자 + 검색)
  const filteredCompletedTasks = useMemo(() => {
    let filtered = completedTasks

    // 기간 필터
    const threshold = getDateThreshold(completedPeriod)
    if (threshold) {
      filtered = filtered.filter(t => {
        const completedDate = t.completed_at ? new Date(t.completed_at) : new Date(t.updated_at)
        return completedDate >= threshold
      })
    }

    // 담당자 필터
    if (assigneeFilter) {
      filtered = filtered.filter(t => t.assignee_id === assigneeFilter)
    }

    // 완료 탭 전용 검색
    if (completedSearchQuery.trim()) {
      const q = completedSearchQuery.trim().toLowerCase()
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.assignee_name && t.assignee_name.toLowerCase().includes(q)) ||
        (t.assigner_name && t.assigner_name.toLowerCase().includes(q))
      )
    }

    // 완료일 기준 최신순 정렬
    filtered.sort((a, b) => {
      const dateA = a.completed_at || a.updated_at
      const dateB = b.completed_at || b.updated_at
      return new Date(dateB).getTime() - new Date(dateA).getTime()
    })

    return filtered
  }, [completedTasks, completedPeriod, assigneeFilter, completedSearchQuery])

  // 상태 필터 적용
  const displayedTasks = useMemo(() => {
    let base: Task[]
    if (statusFilter === 'overdue') {
      base = allTasks.filter(t => isOverdue(t))
    } else if (statusFilter === 'completed') {
      base = filteredCompletedTasks
    } else if (statusFilter) {
      base = allTasks.filter(t => t.status === statusFilter)
    } else {
      base = activeTab === 'active' ? activeTasks : filteredCompletedTasks
    }
    // 분류(주간/월간/분기/연간/일반) 필터
    if (periodFilter) {
      base = base.filter(t => (t.task_period || 'general') === periodFilter)
    }
    return base
  }, [allTasks, activeTasks, filteredCompletedTasks, statusFilter, activeTab, periodFilter])

  const toggleSelect = useCallback((taskId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === displayedTasks.length && displayedTasks.length > 0) {
        return new Set()
      }
      return new Set(displayedTasks.map(t => t.id))
    })
  }, [displayedTasks])

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  const handleBulkAssigneeSuccess = useCallback(async (updatedCount: number) => {
    setShowBulkAssigneeModal(false)
    exitSelectionMode()
    await Promise.all([fetchTasks(), fetchStats()])
    await appAlert(`${updatedCount}건의 담당자가 변경되었습니다.`)
  }, [exitSelectionMode, fetchTasks, fetchStats])

  // TaskForm 표시
  if (showForm) {
    return (
      <TaskForm
        task={editingTask}
        onSubmit={handleFormSubmit}
        onCancel={handleFormCancel}
      />
    )
  }

  // TaskDetail 표시
  if (selectedTask) {
    return (
      <TaskDetail
        task={selectedTask}
        onBack={() => setSelectedTask(null)}
        onEdit={canCreate ? () => handleEdit(selectedTask) : undefined}
        onDelete={canCreate ? () => handleDelete(selectedTask.id) : undefined}
        onStatusUpdate={(status) => handleStatusUpdate(selectedTask.id, status)}
        onRefresh={async () => {
          const { data } = await taskService.getTask(selectedTask.id)
          if (data) setSelectedTask(data)
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-at-text">업무 지시</h2>
          {!loading && (
            <span className="text-xs text-at-text-weak font-normal ml-1">총 {allTasks.length}건</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canBulkReassign && activeTab !== 'recurring' && !selectionMode && (
            <Button
              variant="outline"
              onClick={() => setSelectionMode(true)}
              className="flex items-center gap-2"
            >
              <CheckSquare className="w-4 h-4" />
              일괄 선택
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              새 업무 할당
            </Button>
          )}
        </div>
      </div>

      {/* 일괄 선택 모드 액션바 */}
      {selectionMode && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 bg-at-accent-light border border-at-accent rounded-xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-sm font-medium text-at-accent hover:underline"
            >
              {selectedIds.size === displayedTasks.length && displayedTasks.length > 0
                ? '전체 해제'
                : '현재 보이는 업무 전체 선택'}
            </button>
            <span className="text-sm text-at-text-secondary">
              {selectedIds.size}건 선택됨
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowBulkAssigneeModal(true)}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              담당자 일괄 변경
            </Button>
            <Button variant="outline" onClick={exitSelectionMode} className="flex items-center gap-2">
              <X className="w-4 h-4" />
              취소
            </Button>
          </div>
        </div>
      )}

      {/* 통계 (클릭하면 해당 상태 필터링) */}
      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <button
            onClick={() => handleStatClick('all')}
            className={`rounded-xl p-3 text-center transition-all ${statusFilter === '' ? 'bg-at-surface-alt ring-2 ring-at-border' : 'bg-at-surface-alt hover:bg-at-surface-alt'}`}
          >
            <p className="text-2xl font-bold text-at-text">{stats.total}</p>
            <p className="text-xs text-at-text-weak">전체</p>
          </button>
          <button
            onClick={() => handleStatClick('pending')}
            className={`rounded-xl p-3 text-center transition-all ${statusFilter === 'pending' ? 'bg-at-border ring-2 ring-at-border' : 'bg-at-surface-alt hover:bg-at-surface-alt'}`}
          >
            <p className="text-2xl font-bold text-at-text-secondary">{stats.pending}</p>
            <p className="text-xs text-at-text-weak">대기</p>
          </button>
          <button
            onClick={() => handleStatClick('in_progress')}
            className={`rounded-xl p-3 text-center transition-all ${statusFilter === 'in_progress' ? 'bg-at-tag ring-2 ring-at-accent' : 'bg-at-accent-light hover:bg-at-tag'}`}
          >
            <p className="text-2xl font-bold text-at-accent">{stats.in_progress}</p>
            <p className="text-xs text-at-text-weak">진행 중</p>
          </button>
          <button
            onClick={() => handleStatClick('review')}
            className={`rounded-xl p-3 text-center transition-all ${statusFilter === 'review' ? 'bg-purple-100 ring-2 ring-purple-500' : 'bg-purple-50 hover:bg-purple-100'}`}
          >
            <p className="text-2xl font-bold text-purple-600">{stats.review}</p>
            <p className="text-xs text-at-text-weak">검토 요청</p>
          </button>
          <button
            onClick={() => handleStatClick('completed')}
            className={`rounded-xl p-3 text-center transition-all ${statusFilter === 'completed' ? 'bg-at-success-bg ring-2 ring-green-500' : 'bg-at-success-bg hover:bg-at-success-bg'}`}
          >
            <p className="text-2xl font-bold text-at-success">{stats.completed}</p>
            <p className="text-xs text-at-text-weak">완료</p>
          </button>
          <button
            onClick={() => handleStatClick('overdue')}
            className={`rounded-xl p-3 text-center transition-all ${statusFilter === 'overdue' ? 'bg-at-error-bg ring-2 ring-red-500' : 'bg-at-error-bg hover:bg-at-error-bg'}`}
          >
            <p className="text-2xl font-bold text-at-error">{stats.overdue}</p>
            <p className="text-xs text-at-text-weak">기한 초과</p>
          </button>
        </div>
      )}

      {/* 진행 중 / 완료 / 반복 템플릿 탭 */}
      <div className="flex items-center gap-1 border-b border-at-border">
        <button
          onClick={() => { setActiveTab('active'); setStatusFilter('') }}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'active'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-at-text-weak hover:text-at-text-secondary'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          진행 업무
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            activeTab === 'active' ? 'bg-purple-100 text-purple-700' : 'bg-at-surface-alt text-at-text-weak'
          }`}>
            {activeTasks.length}
          </span>
        </button>
        <button
          onClick={() => { setActiveTab('completed'); setStatusFilter('') }}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'completed'
              ? 'border-green-600 text-at-success'
              : 'border-transparent text-at-text-weak hover:text-at-text-secondary'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          완료된 업무
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            activeTab === 'completed' ? 'bg-at-success-bg text-at-success' : 'bg-at-surface-alt text-at-text-weak'
          }`}>
            {completedTasks.length}
          </span>
        </button>
        {canCreate && (
          <button
            onClick={() => { setActiveTab('recurring'); setStatusFilter('') }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'recurring'
                ? 'border-at-accent text-at-accent'
                : 'border-transparent text-at-text-weak hover:text-at-text-secondary'
            }`}
          >
            <Repeat className="w-4 h-4" />
            반복 템플릿
          </button>
        )}
      </div>

      {/* 반복 템플릿 탭: 전용 컴포넌트 렌더링 후 조기 반환 */}
      {activeTab === 'recurring' && canCreate && (
        <RecurringTaskTemplateList />
      )}

      {/* 진행 업무 탭: 검색 및 우선순위 + 분류 필터 */}
      {activeTab === 'active' && !statusFilter && (
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-at-text-weak" />
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value as TaskPriority | '')}
              className="border border-at-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-at-accent"
            >
              <option value="">전체 우선순위</option>
              {Object.entries(TASK_PRIORITY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-at-text-weak" />
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as TaskPeriod | '')}
              className="border border-at-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-at-accent"
            >
              <option value="">전체 분류</option>
              {Object.entries(TASK_PERIOD_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <form onSubmit={handleSearch} className="flex-1 flex gap-2 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-at-text-weak" />
              <Input
                type="text"
                placeholder="업무명 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" variant="outline">검색</Button>
          </form>
        </div>
      )}

      {/* 상태 필터 활성 시 필터 표시 */}
      {statusFilter && statusFilter !== 'completed' && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-at-text-weak" />
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value as TaskPriority | '')}
              className="border border-at-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-at-accent"
            >
              <option value="">전체 우선순위</option>
              {Object.entries(TASK_PRIORITY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-at-text-weak" />
              <Input
                type="text"
                placeholder="업무명 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" variant="outline">검색</Button>
          </form>
        </div>
      )}

      {/* 완료 탭 전용 필터 */}
      {(activeTab === 'completed' || statusFilter === 'completed') && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* 기간 필터 */}
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-at-text-weak" />
              <select
                value={completedPeriod}
                onChange={(e) => setCompletedPeriod(e.target.value as CompletedPeriod)}
                className="border border-at-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {Object.entries(COMPLETED_PERIOD_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* 담당자 필터 */}
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-at-text-weak" />
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="border border-at-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">전체 담당자</option>
                {completedAssignees.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>

            {/* 검색 */}
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-at-text-weak" />
                <Input
                  type="text"
                  placeholder="업무명, 담당자, 지시자 검색..."
                  value={completedSearchQuery}
                  onChange={(e) => setCompletedSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* 필터 결과 요약 */}
          <div className="flex items-center gap-2 text-sm text-at-text-weak">
            <span>
              {filteredCompletedTasks.length === completedTasks.length
                ? `완료된 업무 ${completedTasks.length}건`
                : `완료된 업무 ${completedTasks.length}건 중 ${filteredCompletedTasks.length}건 표시`}
            </span>
            {(completedPeriod !== 'all' || assigneeFilter || completedSearchQuery) && (
              <button
                onClick={() => {
                  setCompletedPeriod('all')
                  setAssigneeFilter('')
                  setCompletedSearchQuery('')
                }}
                className="text-at-success hover:text-at-success font-medium underline underline-offset-2"
              >
                필터 초기화
              </button>
            )}
          </div>
        </div>
      )}

      {/* 에러 표시 */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-at-error-bg text-at-error rounded-xl">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* 업무 보드 (반복 템플릿 탭이 아닐 때만) */}
      {activeTab !== 'recurring' && (loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
        </div>
      ) : displayedTasks.length === 0 ? (
        <div className="text-center py-16 text-at-text-weak">
          <div className="w-16 h-16 bg-sky-50 rounded-full flex items-center justify-center mx-auto mb-4">
            {activeTab === 'active' ? (
              <ListTodo className="w-8 h-8 text-sky-300" />
            ) : (
              <CheckCircle2 className="w-8 h-8 text-green-300" />
            )}
          </div>
          <p className="font-medium text-at-text-secondary mb-1">
            {statusFilter && statusFilter !== 'overdue'
              ? `${TASK_STATUS_LABELS[statusFilter as TaskStatus]} 상태의 업무가 없습니다`
              : statusFilter === 'overdue'
                ? '기한 초과된 업무가 없습니다'
                : activeTab === 'active' ? '진행 중인 업무가 없습니다' : '완료된 업무가 없습니다'}
          </p>
          <p className="text-sm text-at-text-weak">
            {statusFilter
              ? '다른 상태를 선택하거나 전체 보기를 눌러주세요.'
              : activeTab === 'active' ? '새로운 업무가 할당되면 여기에 표시됩니다.' : '업무가 완료되면 여기에 표시됩니다.'}
          </p>
        </div>
      ) : (
        <TaskCardView
          tasks={displayedTasks}
          onTaskClick={handleTaskClick}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      ))}

      {/* 담당자 일괄 변경 모달 */}
      {showBulkAssigneeModal && (
        <BulkAssigneeChangeModal
          selectedCount={selectedIds.size}
          selectedTaskIds={Array.from(selectedIds)}
          onClose={() => setShowBulkAssigneeModal(false)}
          onSuccess={handleBulkAssigneeSuccess}
        />
      )}
    </div>
  )
}
