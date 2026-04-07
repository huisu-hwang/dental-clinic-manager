'use client'

import {
  Calendar,
  User,
  MessageCircle,
  Circle,
  Loader2,
  CheckCircle2,
  Pause,
  XCircle,
  Flag,
  Eye,
} from 'lucide-react'
import type { Task, TaskStatus, TaskPriority } from '@/types/bulletin'
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
} from '@/types/bulletin'

interface TaskCardViewProps {
  tasks: Task[]
  onTaskClick: (task: Task) => void
}

const STATUS_ORDER: TaskStatus[] = ['pending', 'in_progress', 'review', 'completed', 'on_hold', 'cancelled']

const STATUS_BADGE_STYLES: Record<TaskStatus, { bg: string; text: string; dot: string; border: string }> = {
  pending: { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400', border: 'border-gray-200' },
  in_progress: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', border: 'border-blue-200' },
  review: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500', border: 'border-purple-200' },
  completed: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500', border: 'border-green-200' },
  on_hold: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500', border: 'border-yellow-200' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400', border: 'border-red-200' },
}

const PRIORITY_STYLES: Record<TaskPriority, { color: string; label: string }> = {
  urgent: { color: 'text-red-600', label: '긴급' },
  high: { color: 'text-orange-500', label: '높음' },
  medium: { color: 'text-blue-500', label: '보통' },
  low: { color: 'text-gray-400', label: '낮음' },
}

const getStatusIcon = (status: TaskStatus) => {
  switch (status) {
    case 'pending': return <Circle className="w-3.5 h-3.5" />
    case 'in_progress': return <Loader2 className="w-3.5 h-3.5" />
    case 'review': return <Eye className="w-3.5 h-3.5" />
    case 'completed': return <CheckCircle2 className="w-3.5 h-3.5" />
    case 'on_hold': return <Pause className="w-3.5 h-3.5" />
    case 'cancelled': return <XCircle className="w-3.5 h-3.5" />
  }
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(2)}`
}

const isOverdue = (task: Task) => {
  if (!task.due_date) return false
  if (task.status === 'completed' || task.status === 'cancelled') return false
  return new Date(task.due_date) < new Date()
}

// 이니셜 추출 (한글 이름이면 첫 글자, 영어면 첫 두 글자)
const getInitials = (name: string) => {
  if (!name) return '?'
  const trimmed = name.trim()
  // 한글인 경우 마지막 2글자 (성 제외)
  if (/[가-힣]/.test(trimmed)) {
    return trimmed.length > 2 ? trimmed.slice(-2) : trimmed
  }
  // 영어인 경우 첫 두 글자 대문자
  return trimmed.slice(0, 2).toUpperCase()
}

// 이름 기반 일관된 색상 선택
const AVATAR_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
  'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-cyan-500',
]

const getAvatarColor = (name: string) => {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function TaskCardView({ tasks, onTaskClick }: TaskCardViewProps) {
  // 상태별로 그룹핑
  const grouped = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = tasks.filter(t => t.status === status)
    return acc
  }, {} as Record<TaskStatus, Task[]>)

  // 업무가 있는 상태만 표시
  const activeStatuses = STATUS_ORDER.filter(s => grouped[s].length > 0)

  if (tasks.length === 0) return null

  return (
    <div className="space-y-6">
      {activeStatuses.map((status) => {
        const style = STATUS_BADGE_STYLES[status]
        const statusTasks = grouped[status]

        return (
          <div key={status}>
            {/* 상태 헤더 */}
            <div className="flex items-center gap-2 mb-3">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${style.bg} ${style.text} border ${style.border}`}>
                <span className={`w-2 h-2 rounded-full ${style.dot}`}></span>
                {TASK_STATUS_LABELS[status]}
              </span>
              <span className="text-sm text-gray-400 font-medium">{statusTasks.length}</span>
            </div>

            {/* 테이블 헤더 */}
            <div className={`hidden sm:grid ${status === 'completed' ? 'sm:grid-cols-[1fr_120px_120px_120px_100px]' : 'sm:grid-cols-[1fr_120px_120px_100px]'} gap-4 px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider`}>
              <span>업무명</span>
              <span>담당자</span>
              <span>마감일</span>
              {status === 'completed' && <span>완료일</span>}
              <span>우선순위</span>
            </div>

            {/* 업무 카드 목록 */}
            <div className={`bg-white rounded-xl border ${style.border} divide-y divide-gray-100`}>
              {statusTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onTaskClick(task)}
                  className="px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors group"
                >
                  {/* 모바일 레이아웃 */}
                  <div className="sm:hidden space-y-2">
                    <div className="flex items-start gap-2">
                      <div className={`mt-0.5 ${style.text}`}>
                        {getStatusIcon(task.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-gray-900 truncate">{task.title}</h4>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {task.assignee_name || '미지정'}
                          </span>
                          {task.due_date && (
                            <span className={`flex items-center gap-1 ${isOverdue(task) ? 'text-red-600 font-medium' : ''}`}>
                              <Calendar className="w-3 h-3" />
                              {formatDate(task.due_date)}
                            </span>
                          )}
                          <span className={`flex items-center gap-1 ${PRIORITY_STYLES[task.priority].color}`}>
                            <Flag className="w-3 h-3" />
                            {TASK_PRIORITY_LABELS[task.priority]}
                          </span>
                          {task.status === 'completed' && task.completed_at && (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="w-3 h-3" />
                              {formatDate(task.completed_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 데스크탑 레이아웃 (테이블 형태) */}
                  <div className={`hidden sm:grid ${status === 'completed' ? 'sm:grid-cols-[1fr_120px_120px_120px_100px]' : 'sm:grid-cols-[1fr_120px_120px_100px]'} gap-4 items-center`}>
                    {/* 업무명 */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex-shrink-0 ${style.text}`}>
                        {getStatusIcon(task.status)}
                      </div>
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                          {task.title}
                        </span>
                        {task.comments_count > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-gray-400 flex-shrink-0">
                            <MessageCircle className="w-3 h-3" />
                            {task.comments_count}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 담당자 */}
                    <div className="flex items-center gap-2">
                      {task.assignee_name ? (
                        <>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${getAvatarColor(task.assignee_name)}`}>
                            {getInitials(task.assignee_name)}
                          </div>
                          <span className="text-sm text-gray-700 truncate">{task.assignee_name}</span>
                        </>
                      ) : (
                        <span className="text-sm text-gray-400">미지정</span>
                      )}
                    </div>

                    {/* 마감일 */}
                    <div>
                      {task.due_date ? (
                        <span className={`text-sm ${isOverdue(task) ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                          {formatDate(task.due_date)}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-300">—</span>
                      )}
                    </div>

                    {/* 완료일 (완료 상태일 때만 표시) */}
                    {status === 'completed' && (
                      <div>
                        {task.completed_at ? (
                          <span className="text-sm text-green-600">
                            {formatDate(task.completed_at)}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </div>
                    )}

                    {/* 우선순위 */}
                    <div>
                      <span className={`inline-flex items-center gap-1 text-sm font-medium ${PRIORITY_STYLES[task.priority].color}`}>
                        <Flag className="w-3.5 h-3.5" />
                        {TASK_PRIORITY_LABELS[task.priority]}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
