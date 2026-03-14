'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ListTodo,
  Plus,
  Search,
  AlertCircle,
  Filter,
  CheckCircle2,
  ClipboardList,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { taskService } from '@/lib/bulletinService'
import type { Task, TaskStatus, TaskPriority } from '@/types/bulletin'
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
} from '@/types/bulletin'
import TaskDetail from './TaskDetail'
import TaskForm from './TaskForm'
import TaskCardView from './TaskCardView'
import { appConfirm, appAlert } from '@/components/ui/AppDialog'

type ViewTab = 'active' | 'completed'

interface TaskListProps {
  canCreate?: boolean
  showMyTasksOnly?: boolean
}

export default function TaskList({ canCreate = false, showMyTasksOnly = false }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPriority, setSelectedPriority] = useState<TaskPriority | ''>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [total, setTotal] = useState(0)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [activeTab, setActiveTab] = useState<ViewTab>('active')
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

    const { data, total: totalCount, error: fetchError } = await taskService.getTasks({
      priority: selectedPriority || undefined,
      search: searchQuery || undefined,
      limit: 100,
      offset: 0,
    })

    if (fetchError) {
      setError(fetchError)
    } else {
      setTasks(data || [])
      setTotal(totalCount)
    }
    setLoading(false)
  }, [selectedPriority, searchQuery, showMyTasksOnly])

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
    fetchTasks()
  }

  const handlePriorityChange = (priority: TaskPriority | '') => {
    setSelectedPriority(priority)
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

  // 탭에 따라 필터링
  const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
  const completedTasks = tasks.filter(t => t.status === 'completed')
  const displayedTasks = activeTab === 'active' ? activeTasks : completedTasks

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
          {!loading && (
            <span className="text-xs text-gray-400 font-normal ml-1">총 {total}건</span>
          )}
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
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
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
          <div className="bg-purple-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-purple-600">{stats.review}</p>
            <p className="text-xs text-gray-500">검토 요청</p>
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

      {/* 진행 중 / 완료 탭 */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'active'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          진행 업무
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            activeTab === 'active' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {activeTasks.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'completed'
              ? 'border-green-600 text-green-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          완료된 업무
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            activeTab === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {completedTasks.length}
          </span>
        </button>
      </div>

      {/* 필터 및 검색 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
        </div>
      ) : displayedTasks.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="w-16 h-16 bg-sky-50 rounded-full flex items-center justify-center mx-auto mb-4">
            {activeTab === 'active' ? (
              <ListTodo className="w-8 h-8 text-sky-300" />
            ) : (
              <CheckCircle2 className="w-8 h-8 text-green-300" />
            )}
          </div>
          <p className="font-medium text-gray-600 mb-1">
            {activeTab === 'active' ? '진행 중인 업무가 없습니다' : '완료된 업무가 없습니다'}
          </p>
          <p className="text-sm text-gray-400">
            {activeTab === 'active' ? '새로운 업무가 할당되면 여기에 표시됩니다.' : '업무가 완료되면 여기에 표시됩니다.'}
          </p>
        </div>
      ) : (
        <TaskCardView tasks={displayedTasks} onTaskClick={handleTaskClick} />
      )}
    </div>
  )
}
