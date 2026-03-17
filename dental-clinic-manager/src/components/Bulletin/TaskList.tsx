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
  ClipboardList,
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

// 상태 탭 순서
const STATUS_TABS: (TaskStatus | 'all')[] = ['all', 'pending', 'in_progress', 'on_hold', 'completed', 'cancelled']

// 상태 탭 라벨
const STATUS_TAB_LABELS: Record<string, string> = {
  all: '전체',
  ...TASK_STATUS_LABELS,
}

// 상태별 dot 색상
const STATUS_DOT_COLORS: Record<TaskStatus, string> = {
  pending: 'bg-gray-400',
  in_progress: 'bg-blue-500',
  completed: 'bg-green-500',
  on_hold: 'bg-amber-400',
  cancelled: 'bg-red-400',
}

// 상태별 탭 활성 색상
const STATUS_TAB_ACTIVE_COLORS: Record<string, string> = {
  all: 'border-purple-500 text-purple-600',
  pending: 'border-gray-500 text-gray-700',
  in_progress: 'border-blue-500 text-blue-600',
  completed: 'border-green-500 text-green-600',
  on_hold: 'border-amber-500 text-amber-600',
  cancelled: 'border-red-500 text-red-600',
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
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus | 'all'>('all')
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

  // 상태별 카운트
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allTasks.length }
    for (const status of ['pending', 'in_progress', 'on_hold', 'completed', 'cancelled'] as TaskStatus[]) {
      counts[status] = allTasks.filter(t => t.status === status).length
    }
    return counts
  }, [allTasks])

  // 필터 + 우선순위/마감일 정렬
  const filteredTasks = useMemo(() => {
    const filtered = selectedStatus === 'all' ? allTasks : allTasks.filter(t => t.status === selectedStatus)
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
    return [...filtered].sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 2
      const pb = priorityOrder[b.priority] ?? 2
      if (pa !== pb) return pa - pb
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      if (a.due_date) return -1
      if (b.due_date) return 1
      return 0
    })
  }, [allTasks, selectedStatus])

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

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'pending': return <Circle className="w-3.5 h-3.5" />
      case 'in_progress': return <Loader2 className="w-3.5 h-3.5" />
      case 'completed': return <CheckCircle2 className="w-3.5 h-3.5" />
      case 'on_hold': return <Pause className="w-3.5 h-3.5" />
      case 'cancelled': return <XCircle className="w-3.5 h-3.5" />
    }
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-purple-600" />
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

      {/* 상태별 탭 필터 */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-1 overflow-x-auto scrollbar-hide -mb-px" aria-label="상태 필터">
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setSelectedStatus(tab)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                selectedStatus === tab
                  ? STATUS_TAB_ACTIVE_COLORS[tab]
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab !== 'all' && <div className={`w-2 h-2 rounded-full ${STATUS_DOT_COLORS[tab]}`} />}
              {STATUS_TAB_LABELS[tab]}
              <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                selectedStatus === tab ? 'bg-gray-100' : 'bg-gray-50 text-gray-400'
              }`}>
                {statusCounts[tab] || 0}
              </span>
            </button>
          ))}
        </nav>
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

      {/* 업무 리스트 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="w-16 h-16 bg-sky-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ListTodo className="w-8 h-8 text-sky-300" />
          </div>
          <p className="font-medium text-gray-600 mb-1">
            {selectedStatus === 'all' ? '등록된 업무가 없습니다' : `${STATUS_TAB_LABELS[selectedStatus]} 상태의 업무가 없습니다`}
          </p>
          <p className="text-sm text-gray-400">새로운 업무가 할당되면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map(task => (
            <div
              key={task.id}
              role="button"
              tabIndex={0}
              onClick={() => handleTaskClick(task)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleTaskClick(task)
                }
              }}
              className={`bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isOverdue(task) ? 'ring-1 ring-red-200 border-red-200' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                {/* 상태 아이콘 */}
                <div className={`mt-0.5 flex-shrink-0 ${STATUS_DOT_COLORS[task.status].replace('bg-', 'text-')}`}>
                  {getStatusIcon(task.status)}
                </div>

                {/* 메인 콘텐츠 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TASK_PRIORITY_COLORS[task.priority]}`}>
                      {TASK_PRIORITY_LABELS[task.priority]}
                    </span>
                    {isOverdue(task) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">
                        기한초과
                      </span>
                    )}
                    {selectedStatus === 'all' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        task.status === 'pending' ? 'bg-gray-100 text-gray-600' :
                        task.status === 'in_progress' ? 'bg-blue-50 text-blue-600' :
                        task.status === 'completed' ? 'bg-green-50 text-green-600' :
                        task.status === 'on_hold' ? 'bg-amber-50 text-amber-600' :
                        'bg-red-50 text-red-600'
                      }`}>
                        {TASK_STATUS_LABELS[task.status]}
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-medium text-gray-900 mb-1 line-clamp-1">
                    {task.title}
                  </h4>

                  {task.description && (
                    <p className="text-xs text-gray-400 line-clamp-1 mb-2">
                      {stripHtml(task.description)}
                    </p>
                  )}

                  {/* 진행률 바 */}
                  {task.status !== 'cancelled' && task.progress > 0 && (
                    <div className="mb-2 max-w-xs">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${
                              task.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">{task.progress}%</span>
                      </div>
                    </div>
                  )}

                  {/* 하단 정보 */}
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {task.assignee_name}
                    </span>
                    {task.due_date && (
                      <span className={`flex items-center gap-1 ${
                        isOverdue(task) ? 'text-red-500 font-medium' : ''
                      }`}>
                        <Calendar className="w-3 h-3" />
                        {formatDate(task.due_date)}
                      </span>
                    )}
                    {task.comments_count > 0 && (
                      <span className="flex items-center gap-1 text-gray-400">
                        <MessageCircle className="w-3 h-3" />
                        {task.comments_count}
                      </span>
                    )}
                  </div>
                </div>

                {/* 빠른 상태 변경 버튼 (담당자 또는 원장) */}
                <div className="flex-shrink-0 flex items-center gap-2">
                  {task.status === 'pending' && (currentUserId === task.assignee_id || isOwner) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStatusUpdate(task.id, 'in_progress')
                      }}
                      className="text-xs px-3 py-1.5 rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors font-medium whitespace-nowrap"
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
                      className="text-xs px-3 py-1.5 rounded-md border border-green-200 text-green-600 hover:bg-green-50 transition-colors font-medium whitespace-nowrap"
                    >
                      완료 보고
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
