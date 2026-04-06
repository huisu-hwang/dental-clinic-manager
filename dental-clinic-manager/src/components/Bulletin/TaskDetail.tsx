'use client'

import { useState, useEffect } from 'react'
import {
  Calendar,
  User,
  Edit2,
  Trash2,
  Clock,
  MessageCircle,
  Send,
  CheckCircle2,
  Circle,
  Loader2,
  Pause,
  XCircle,
  Eye
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { taskService, taskCommentService } from '@/lib/bulletinService'
import type { Task, TaskStatus, TaskComment } from '@/types/bulletin'
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS
} from '@/types/bulletin'
import { appConfirm } from '@/components/ui/AppDialog'

interface TaskDetailProps {
  task: Task
  onBack: () => void
  onEdit?: () => void
  onDelete?: () => void
  onStatusUpdate: (status: TaskStatus) => void
  onRefresh: () => void
}

export default function TaskDetail({
  task,
  onBack,
  onEdit,
  onDelete,
  onStatusUpdate,
  onRefresh,
}: TaskDetailProps) {
  const [comments, setComments] = useState<TaskComment[]>([])
  const [loadingComments, setLoadingComments] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [progress, setProgress] = useState(task.progress)
  const [updatingProgress, setUpdatingProgress] = useState(false)

  useEffect(() => {
    fetchComments()
  }, [task.id])

  const fetchComments = async () => {
    setLoadingComments(true)
    const { data } = await taskCommentService.getComments(task.id)
    if (data) {
      setComments(data)
    }
    setLoadingComments(false)
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return

    setSubmittingComment(true)
    const { error } = await taskCommentService.createComment(task.id, { content: newComment })
    if (!error) {
      setNewComment('')
      fetchComments()
      onRefresh()
    }
    setSubmittingComment(false)
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!await appConfirm('댓글을 삭제하시겠습니까?')) return

    const { success } = await taskCommentService.deleteComment(commentId)
    if (success) {
      fetchComments()
      onRefresh()
    }
  }

  const handleProgressChange = async (newProgress: number) => {
    setProgress(newProgress)
  }

  const handleProgressUpdate = async () => {
    if (progress === task.progress) return

    setUpdatingProgress(true)
    const { error } = await taskService.updateTaskProgress(task.id, progress)
    if (!error) {
      onRefresh()
    }
    setUpdatingProgress(false)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatShortDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
    })
  }

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'pending':
        return <Circle className="w-5 h-5" />
      case 'in_progress':
        return <Loader2 className="w-5 h-5" />
      case 'review':
        return <Eye className="w-5 h-5" />
      case 'completed':
        return <CheckCircle2 className="w-5 h-5" />
      case 'on_hold':
        return <Pause className="w-5 h-5" />
      case 'cancelled':
        return <XCircle className="w-5 h-5" />
    }
  }

  const isOverdue = () => {
    if (!task.due_date) return false
    if (task.status === 'completed' || task.status === 'cancelled') return false
    return new Date(task.due_date) < new Date()
  }

  const getCurrentUser = () => {
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

  const currentUser = getCurrentUser()
  const currentUserId = currentUser?.id || null
  const isAssignee = currentUserId === task.assignee_id
  const isOwner = currentUser?.role === 'owner'

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center text-sm">
          <button onClick={onBack} className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
            업무 지시
          </button>
          <span className="mx-2 text-gray-400">&rsaquo;</span>
          <span className="text-gray-500 truncate max-w-[200px] sm:max-w-[400px]">{task.title}</span>
        </nav>
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-2">
            {onEdit && (
              <Button variant="outline" onClick={onEdit} className="flex items-center gap-2">
                <Edit2 className="w-4 h-4" />
                수정
              </Button>
            )}
            {onDelete && (
              <Button
                variant="outline"
                onClick={onDelete}
                className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                삭제
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 업무 내용 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 제목 영역 */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs px-2 py-0.5 rounded-full ${TASK_PRIORITY_COLORS[task.priority]}`}>
              {TASK_PRIORITY_LABELS[task.priority]}
            </span>
            <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${TASK_STATUS_COLORS[task.status]}`}>
              {getStatusIcon(task.status)}
              {TASK_STATUS_LABELS[task.status]}
            </span>
            {isOverdue() && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                기한 초과
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-4">{task.title}</h1>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">담당자</span>
              <p className="flex items-center gap-1 font-medium text-gray-900 mt-1">
                <User className="w-4 h-4" />
                {task.assignee_name}
              </p>
            </div>
            <div>
              <span className="text-gray-500">할당자</span>
              <p className="flex items-center gap-1 font-medium text-gray-900 mt-1">
                <User className="w-4 h-4" />
                {task.assigner_name}
              </p>
            </div>
            <div>
              <span className="text-gray-500">생성일</span>
              <p className="flex items-center gap-1 font-medium text-gray-900 mt-1">
                <Clock className="w-4 h-4" />
                {formatShortDate(task.created_at)}
              </p>
            </div>
            <div>
              <span className="text-gray-500">마감일</span>
              <p className={`flex items-center gap-1 font-medium mt-1 ${isOverdue() ? 'text-red-600' : 'text-gray-900'}`}>
                <Calendar className="w-4 h-4" />
                {task.due_date ? formatShortDate(task.due_date) : '미정'}
              </p>
            </div>
          </div>

          {/* 상태 변경 버튼 (담당자, 원장, 관리자) */}
          {(isAssignee || isOwner || onEdit) && task.status !== 'cancelled' && task.status !== 'completed' && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500 mb-2">상태 변경</p>
              <div className="flex flex-wrap gap-2">
                {/* === 담당자/원장 워크플로우 === */}
                {/* 담당자 또는 원장: 업무 시작 (대기 → 진행 중) */}
                {(isAssignee || isOwner) && task.status === 'pending' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onStatusUpdate('in_progress')}
                    className="text-blue-600"
                  >
                    <Loader2 className="w-4 h-4 mr-1" />
                    업무 시작
                  </Button>
                )}
                {/* 담당자 또는 원장: 검토 요청 (진행 중 → 검토 요청) */}
                {(isAssignee || isOwner) && task.status === 'in_progress' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onStatusUpdate('review')}
                    className="text-purple-600"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    검토 요청
                  </Button>
                )}

                {/* === 결재자(관리자/원장) 워크플로우 === */}
                {/* 결재자: 검토 완료 승인 (검토 요청 → 완료) */}
                {(onEdit || isOwner) && task.status === 'review' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onStatusUpdate('completed')}
                      className="text-green-600"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      완료 승인
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onStatusUpdate('in_progress')}
                      className="text-blue-600"
                    >
                      <Loader2 className="w-4 h-4 mr-1" />
                      반려 (재작업)
                    </Button>
                  </>
                )}
                {/* 대표 원장: 어떤 상태에서든 완료 처리 가능 (review 상태 제외 - 위에서 처리) */}
                {isOwner && task.status !== 'review' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onStatusUpdate('completed')}
                    className="text-green-600"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    완료 처리
                  </Button>
                )}

                {/* === 관리자 추가 옵션 === */}
                {onEdit && (
                  <>
                    {task.status !== 'pending' && task.status !== 'review' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onStatusUpdate('pending')}
                        className="text-gray-600"
                      >
                        <Circle className="w-4 h-4 mr-1" />
                        대기로 변경
                      </Button>
                    )}
                    {task.status !== 'on_hold' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onStatusUpdate('on_hold')}
                        className="text-yellow-600"
                      >
                        <Pause className="w-4 h-4 mr-1" />
                        보류
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 설명 */}
        {task.description && (
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-2">상세 내용</h3>
            <div
              className="text-gray-600 prose prose-sm max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1"
              dangerouslySetInnerHTML={{ __html: task.description }}
            />
          </div>
        )}

        {/* 진행률 */}
        {task.status !== 'cancelled' && (
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">진행률</h3>
              <span className="text-sm font-medium text-gray-900">{progress}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={progress}
              onChange={(e) => handleProgressChange(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              disabled={!isAssignee && !onEdit}
            />
            {progress !== task.progress && (
              <div className="flex justify-end mt-2">
                <Button
                  size="sm"
                  onClick={handleProgressUpdate}
                  disabled={updatingProgress}
                >
                  {updatingProgress ? '저장 중...' : '진행률 저장'}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* 댓글 섹션 */}
        <div className="p-6">
          <h3 className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-4">
            <MessageCircle className="w-4 h-4" />
            댓글 ({comments.length})
          </h3>

          {/* 댓글 목록 */}
          {loadingComments ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">댓글이 없습니다.</p>
          ) : (
            <div className="space-y-4 mb-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{comment.author_name}</span>
                      <span className="text-xs text-gray-400">{formatDate(comment.created_at)}</span>
                      {comment.author_id === currentUserId && (
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 댓글 입력 */}
          <form onSubmit={handleSubmitComment} className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="댓글을 입력하세요..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button type="submit" disabled={submittingComment || !newComment.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
