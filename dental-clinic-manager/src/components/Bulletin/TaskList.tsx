'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ListTodo,
  Plus,
  Search,
  Calendar,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  User,
  Clock,
  CheckCircle2,
  Circle,
  Loader2,
  Pause,
  XCircle,
  MessageCircle
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { taskService } from '@/lib/bulletinService'
import type { Task, TaskStatus, TaskPriority } from '@/types/bulletin'
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS
} from '@/types/bulletin'
import TaskDetail from './TaskDetail'
import TaskForm from './TaskForm'

interface TaskListProps {
  canCreate?: boolean
  showMyTasksOnly?: boolean
}

export default function TaskList({ canCreate = false, showMyTasksOnly = false }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus | ''>('')
  const [selectedPriority, setSelectedPriority] = useState<TaskPriority | ''>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [stats, setStats] = useState<{
    total: number
    pending: number
    in_progress: number
    completed: number
    overdue: number
  } | null>(null)

  const ITEMS_PER_PAGE = 10

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)

    const fetchFn = showMyTasksOnly ? taskService.getMyTasks : taskService.getTasks

    const { data, total: totalCount, error: fetchError } = await taskService.getTasks({
      status: selectedStatus || undefined,
      priority: selectedPriority || undefined,
      search: searchQuery || undefined,
      limit: ITEMS_PER_PAGE,
      offset: (page - 1) * ITEMS_PER_PAGE,
    })

    if (fetchError) {
      setError(fetchError)
    } else {
      setTasks(data || [])
      setTotal(totalCount)
    }
    setLoading(false)
  }, [selectedStatus, selectedPriority, searchQuery, page, showMyTasksOnly])

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchTasks()
  }

  const handleStatusChange = (status: TaskStatus | '') => {
    setSelectedStatus(status)
    setPage(1)
  }

  const handlePriorityChange = (priority: TaskPriority | '') => {
    setSelectedPriority(priority)
    setPage(1)
  }

  const handleTaskClick = async (task: Task) => {
    const { data } = await taskService.getTask(task.id)
    if (data) {
      setSelectedTask(data)
    }
  }

  const handleEdit = (task: Task) => {
    setEditingTask(task)
    setShowForm(true)
    setSelectedTask(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    const { success, error: deleteError } = await taskService.deleteTask(id)
    if (success) {
      fetchTasks()
      fetchStats()
      setSelectedTask(null)
    } else {
      alert(deleteError || '삭제에 실패했습니다.')
    }
  }

  const handleStatusUpdate = async (id: string, status: TaskStatus) => {
    const { error: updateError } = await taskService.updateTaskStatus(id, status)
    if (!updateError) {
      fetchTasks()
      fetchStats()
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
    fetchStats()
  }

  const handleFormCancel = () => {
    setShowForm(false)
    setEditingTask(null)
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'pending':
        return <Circle className="w-4 h-4" />
      case 'in_progress':
        return <Loader2 className="w-4 h-4" />
      case 'completed':
        return <CheckCircle2 className="w-4 h-4" />
      case 'on_hold':
        return <Pause className="w-4 h-4" />
      case 'cancelled':
        return <XCircle className="w-4 h-4" />
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
    })
  }

  const isOverdue = (task: Task) => {
    if (!task.due_date) return false
    if (task.status === 'completed' || task.status === 'cancelled') return false
    return new Date(task.due_date) < new Date()
  }

  if (showForm) {
    return (
      <TaskForm
        task={editingTask}
        onSubmit={handleFormSubmit}
        onCancel={handleFormCancel}
      />
    )
  }

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <ListTodo className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">업무 관리</h2>
        </div>
        {canCreate && (
          <Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            새 업무 할당
          </Button>
        )}
      </div>

      {/* 통계 */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500">전체</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-600">{stats.pending}</p>
            <p className="text-xs text-gray-500">대기</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.in_progress}</p>
            <p className="text-xs text-gray-500">진행 중</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            <p className="text-xs text-gray-500">완료</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
            <p className="text-xs text-gray-500">기한 초과</p>
          </div>
        </div>
      )}

      {/* 필터 및 검색 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={selectedStatus}
            onChange={(e) => handleStatusChange(e.target.value as TaskStatus | '')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체 상태</option>
            {Object.entries(TASK_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={selectedPriority}
            onChange={(e) => handlePriorityChange(e.target.value as TaskPriority | '')}
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

      {/* 로딩 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <ListTodo className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>등록된 업무가 없습니다.</p>
        </div>
      ) : (
        <>
          {/* 업무 목록 */}
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
            {tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => handleTaskClick(task)}
                className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${isOverdue(task) ? 'bg-red-50 hover:bg-red-100' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* 상태 아이콘 */}
                  <div className={`flex-shrink-0 mt-1 p-1 rounded ${TASK_STATUS_COLORS[task.status]}`}>
                    {getStatusIcon(task.status)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${TASK_PRIORITY_COLORS[task.priority]}`}>
                        {TASK_PRIORITY_LABELS[task.priority]}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${TASK_STATUS_COLORS[task.status]}`}>
                        {TASK_STATUS_LABELS[task.status]}
                      </span>
                      {isOverdue(task) && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                          기한 초과
                        </span>
                      )}
                    </div>
                    <h3 className="text-gray-900 font-medium">{task.title}</h3>
                    {task.description && (
                      <p className="text-sm text-gray-500 truncate mt-1">{task.description}</p>
                    )}

                    {/* 진행률 바 */}
                    {task.status !== 'cancelled' && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>진행률</span>
                          <span>{task.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${task.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${task.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {task.assignee_name}
                      </span>
                      {task.due_date && (
                        <span className={`flex items-center gap-1 ${isOverdue(task) ? 'text-red-600' : ''}`}>
                          <Calendar className="w-3 h-3" />
                          {formatDate(task.due_date)}
                        </span>
                      )}
                      {task.comments_count > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          {task.comments_count}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 빠른 상태 변경 버튼 */}
                  <div className="flex-shrink-0 flex gap-1">
                    {task.status === 'pending' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleStatusUpdate(task.id, 'in_progress')
                        }}
                        className="text-blue-600"
                      >
                        시작
                      </Button>
                    )}
                    {task.status === 'in_progress' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleStatusUpdate(task.id, 'completed')
                        }}
                        className="text-green-600"
                      >
                        완료
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
