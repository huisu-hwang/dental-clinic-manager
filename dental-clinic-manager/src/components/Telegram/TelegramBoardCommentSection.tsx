'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageCircle, Loader2, Pencil, Trash2, Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { telegramBoardCommentService } from '@/lib/telegramService'
import type { TelegramBoardComment, TelegramGroupVisibility } from '@/types/telegram'
import { appConfirm } from '@/components/ui/AppDialog'

interface TelegramBoardCommentSectionProps {
  postId: string
  currentUserId: string | null
  isMasterAdmin: boolean
  isMember?: boolean
  groupVisibility?: TelegramGroupVisibility
}

export default function TelegramBoardCommentSection({
  postId,
  currentUserId,
  isMasterAdmin,
  isMember = true,
  groupVisibility = 'private',
}: TelegramBoardCommentSectionProps) {
  const canComment = isMember || groupVisibility === 'public_full'
  const [comments, setComments] = useState<TelegramBoardComment[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const fetchComments = useCallback(async () => {
    setLoading(true)
    const { data } = await telegramBoardCommentService.getComments(postId)
    if (data) setComments(data)
    setLoading(false)
  }, [postId])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || submitting) return

    setSubmitting(true)
    const { data, error } = await telegramBoardCommentService.createComment(postId, newComment.trim())
    if (!error && data) {
      setComments(prev => [...prev, data])
      setNewComment('')
    }
    setSubmitting(false)
  }

  const handleEdit = async (commentId: string) => {
    if (!editContent.trim()) return
    setSubmitting(true)
    const { data, error } = await telegramBoardCommentService.updateComment(postId, commentId, editContent.trim())
    if (!error && data) {
      setComments(prev => prev.map(c => c.id === commentId ? data : c))
      setEditingId(null)
      setEditContent('')
    }
    setSubmitting(false)
  }

  const handleDelete = async (commentId: string) => {
    if (!(await appConfirm('댓글을 삭제하시겠습니까?'))) return
    const { error } = await telegramBoardCommentService.deleteComment(postId, commentId)
    if (!error) {
      setComments(prev => prev.filter(c => c.id !== commentId))
    }
  }

  const canModify = (comment: TelegramBoardComment) => {
    return comment.user_id === currentUserId || isMasterAdmin
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '방금 전'
    if (minutes < 60) return `${minutes}분 전`
    if (hours < 24) return `${hours}시간 전`
    if (days < 7) return `${days}일 전`
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="mt-6 border-t border-at-border pt-4">
      {/* 헤더 */}
      <h4 className="text-sm font-semibold text-at-text flex items-center gap-1.5 mb-4">
        <MessageCircle className="w-4 h-4" />
        댓글 {comments.length > 0 && <span className="text-at-text-weak">({comments.length})</span>}
      </h4>

      {/* 댓글 목록 */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-at-text-weak" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-at-text-weak text-center py-4">아직 댓글이 없습니다</p>
      ) : (
        <div className="space-y-3 mb-4">
          {comments.map(comment => (
            <div key={comment.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-at-tag text-at-accent flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5">
                {(comment.user?.name || '?')[0]}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-at-text">
                    {comment.user?.name || '알 수 없음'}
                  </span>
                  <span className="text-xs text-at-text-weak">{formatDate(comment.created_at)}</span>
                  {comment.created_at !== comment.updated_at && (
                    <span className="text-xs text-at-text-weak">(수정됨)</span>
                  )}
                </div>

                {editingId === comment.id ? (
                  <div className="flex gap-2 mt-1">
                    <input
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      className="flex-1 text-sm border border-at-border rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-at-accent"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleEdit(comment.id)
                        }
                        if (e.key === 'Escape') {
                          setEditingId(null)
                          setEditContent('')
                        }
                      }}
                    />
                    <Button size="sm" onClick={() => handleEdit(comment.id)} disabled={submitting || !editContent.trim()}>
                      저장
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditContent('') }}>
                      취소
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-at-text-secondary whitespace-pre-wrap break-words">{comment.content}</p>
                )}

                {canModify(comment) && editingId !== comment.id && (
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => {
                        setEditingId(comment.id)
                        setEditContent(comment.content)
                      }}
                      className="text-xs text-at-text-weak hover:text-at-text-secondary flex items-center gap-0.5"
                    >
                      <Pencil className="w-3 h-3" />수정
                    </button>
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="text-xs text-at-text-weak hover:text-at-error flex items-center gap-0.5"
                    >
                      <Trash2 className="w-3 h-3" />삭제
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 댓글 입력 */}
      {currentUserId && canComment && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="댓글을 입력하세요..."
            className="flex-1 text-sm border border-at-border rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-at-accent"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
          />
          <Button type="submit" size="sm" disabled={submitting || !newComment.trim()}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      )}
    </div>
  )
}
