'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ListTodo,
  Plus,
  Search,
  Calendar,
  AlertCircle,
  Filter,
  User,
  CheckCircle2,
  Circle,
  Loader2,
  Pause,
  XCircle,
  MessageCircle,
  LayoutGrid,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { taskService } from '@/lib/bulletinService'
import type { Task, TaskStatus, TaskPriority } from '@/types/bulletin'
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS
} from '@/types/bulletin'
import TaskDetail from './TaskDetail'
import TaskForm from './TaskForm'
import { appConfirm, appAlert } from '@/components/ui/AppDialog'

interface TaskListProps {
  canCreate?: boolean
  showMyTasksOnly?: boolean
}

// 상태 컬럼 순서 (ClickUp 스타일 워크플로우)
const STATUS_ORDER: TaskStatus[] = ['pending', 'in_progress', 'on_hold', 'completed', 'cancelled']

// 상태별 컬럼 상단 테두리 색상
const STATUS_BORDER_COLORS: Record<TaskStatus, string> = {
  pending: '#9ca3af',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  on_hold: '#f59e0b',
  cancelled: '#ef4444',
}

// 상태별 dot 색상
const STATUS_DOT_COLORS: Record<TaskStatus, string> = {
  pending: 'bg-gray-400',
  in_progress: 'bg-blue-500',
  completed: 'bg-green-500',
  on_hold: 'bg-amber-400',
  cancelled: 'bg-red-400',
}

// 상태별 카운트 배지 색상
const STATUS_COUNT_COLORS: Record<TaskStatus, string> = {
  pending: 'bg-gray-200 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-600',
  completed: 'bg-green-100 text-green-600',
  on_hold: 'bg-amber-100 text-amber-600',
  cancelled: 'bg-red-100 text-red-600',
}

// 현재 사용자 정보 가져오기
const getCurrentUser = (): { id: string; role: string } | null => {
  if (typeof window === 'undefined') return null
  const userStr = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
  if (!userStr) return null
  try {
    const user = JSON.parse(userStr)
    return { id: user.id, role: user.role }
  } catch {
    return null
  }
}

export default function TaskList({ canCreate = false, showMyTasksOnly = false }: TaskListProps) {
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const currentUser = getCurrentUser()
  const currentUserId = currentUser?.id || null
  const isOwner = currentUser?.role === 'owner'
  const [selectedPriority, setSelectedPriority] = useState<TaskPriority | ''>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

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

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // 상태별 그룹화 + 우선순위/마감일 정렬
  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      pending: [],
      in_progress: [],
      completed: [],
      on_hold: [],
      cancelled: [],
    }
    allTasks.forEach(task => {
      if (grouped[task.status]) {
        grouped[task.status].push(task)
      }
    })
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
    for (const status of Object.keys(grouped) as TaskStatus[]) {
      grouped[status].sort((a, b) => {
        const pa = priorityOrder[a.priority] ?? 2
        const pb = priorityOrder[b.priority] ?? 2
        if (pa !== pb) return pa - pb
        if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
        if (a.due_date) return -1
        if (b.due_date) return 1
        return 0
      })
    }
    return grouped
  }, [allTasks])

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
      setSelectedTask(null)
    } else {
      await appAlert(deleteError || '삭제에 실패했습니다.')
    }
  }

  const handleStatusUpdate = async (id: string, status: TaskStatus) => {
    const { error: updateError } = await taskService.updateTaskStatus(id, status)
    if (!updateError) {
      fetchTasks()
      if (selectedTask?.id === id) {
        const { data } = await taskService.getTask(id)
        if (data) setSelectedTask(data)
      }
    }
  }

  const handleFormSubmit = () => {
    setShowForm(false)
    setEditingTask(null)
    fetchTasks()
  }

  const handleFormCancel = () => {
    setShowForm(false)
    setEditingTask(null)
  }

  const stripHtml = (html: string) => {
    if (!html) return ''
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
    })
  }

  const isOverdue = (task: Task) => {
    if (!task.due_date) return false
    if (task.status === 'completed' || task.status === 'cancelled') return false
    return new Date(task.due_date) < new Date()
  }

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
          <h2 className="text-lg font-semibold text-gray-900">업무 지시</h2>
          {!loading && (
            <span className="text-xs text-gray-400 font-normal ml-1">총 {allTasks.length}건</span>
          )}
        </div>
        {canCreate && (
          <Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            새 업무 할당
          </Button>
        )}
      </div>

      {/* 검색 및 우선순위 필터 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value as TaskPriority | '')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체 우선순위</option>
            {Object.entries(TASK_PRIORITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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

      {/* 에러 표시 */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* 칸반 보드 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
        </div>
      ) : allTasks.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="w-16 h-16 bg-sky-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ListTodo className="w-8 h-8 text-sky-300" />
          </div>
          <p className="font-medium text-gray-600 mb-1">등록된 업무가 없습니다</p>
          <p className="text-sm text-gray-400">새로운 업무가 할당되면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory">
          {STATUS_ORDER.map(status => {
            const columnTasks = tasksByStatus[status]
            return (
              <div
                key={status}
                className="flex-shrink-0 w-64 sm:w-72 rounded-xl bg-slate-50 snap-start"
                style={{ borderTop: `3px solid ${STATUS_BORDER_COLORS[status]}` }}
              >
                {/* 컬럼 헤더 */}
                <div className="px-3 py-2.5 flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${STATUS_DOT_COLORS[status]}`} />
                  <span className="text-sm font-semibold text-gray-700">
                    {TASK_STATUS_LABELS[status]}
                  </span>
                  <span className={`text-[11px] rounded-full px-1.5 py-0.5 font-medium ${STATUS_COUNT_COLORS[status]}`}>
                    {columnTasks.length}
                  </span>
                </div>

                {/* 태스크 카드 목록 */}
                <div role="list" aria-label={`${TASK_STATUS_LABELS[status]} 업무 목록`} className="px-2 pb-2 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {columnTasks.length === 0 ? (
                    <div className="text-center py-10 text-gray-300 text-xs">
                      업무 없음
                    </div>
                  ) : (
                    columnTasks.map(task => (
                      <div
                        key={task.id}
                        role="listitem"
                        tabIndex={0}
                        onClick={() => handleTaskClick(task)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleTaskClick(task)
                          }
                        }}
                        className={`bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isOverdue(task) ? 'ring-1 ring-red-200 border-red-200' : ''
                        }`}
                      >
                        {/* 우선순위 + 기한초과 배지 */}
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TASK_PRIORITY_COLORS[task.priority]}`}>
                            {TASK_PRIORITY_LABELS[task.priority]}
                          </span>
                          {isOverdue(task) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">
                              기한초과
                            </span>
                          )}
                        </div>

                        {/* 제목 */}
                        <h4 className="text-sm font-medium text-gray-900 mb-1 line-clamp-2 leading-snug">
                          {task.title}
                        </h4>

                        {/* 설명 미리보기 */}
                        {task.description && (
                          <p className="text-xs text-gray-400 line-clamp-1 mb-2">
                            {stripHtml(task.description)}
                          </p>
                        )}

                        {/* 진행률 바 */}
                        {task.status !== 'cancelled' && task.progress > 0 && (
                          <div className="mb-2">
                            <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
                              <span>진행률</span>
                              <span>{task.progress}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1">
                              <div
                                className={`h-1 rounded-full transition-all ${
                                  task.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                                }`}
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* 하단: 담당자, 마감일, 댓글 */}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                          <div className="flex items-center gap-2 text-[11px] text-gray-500 min-w-0">
                            <span className="flex items-center gap-0.5 truncate">
                              <User className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{task.assignee_name}</span>
                            </span>
                            {task.due_date && (
                              <span className={`flex items-center gap-0.5 flex-shrink-0 ${
                                isOverdue(task) ? 'text-red-500 font-medium' : ''
                              }`}>
                                <Calendar className="w-3 h-3" />
                                {formatDate(task.due_date)}
                              </span>
                            )}
                          </div>
                          {task.comments_count > 0 && (
                            <span className="flex items-center gap-0.5 text-[11px] text-gray-400 flex-shrink-0">
                              <MessageCircle className="w-3 h-3" />
                              {task.comments_count}
                            </span>
                          )}
                        </div>

                        {/* 빠른 상태 변경 버튼 (담당자 또는 원장) */}
                        {task.status === 'pending' && (currentUserId === task.assignee_id || isOwner) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStatusUpdate(task.id, 'in_progress')
                            }}
                            className="mt-2 w-full text-xs py-1.5 rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors font-medium"
                          >
                            업무 시작
                          </button>
                        )}
                        {task.status === 'in_progress' && (currentUserId === task.assignee_id || isOwner) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStatusUpdate(task.id, 'completed')
                            }}
                            className="mt-2 w-full text-xs py-1.5 rounded-md border border-green-200 text-green-600 hover:bg-green-50 transition-colors font-medium"
                          >
                            완료 보고
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
