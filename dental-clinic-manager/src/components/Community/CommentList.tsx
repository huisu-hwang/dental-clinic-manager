'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Lock } from 'lucide-react'
import { communityCommentService } from '@/lib/communityService'
import type { CommunityComment } from '@/types/community'
import CommentForm from './CommentForm'
import CommentItem from './CommentItem'
import ReportModal from './ReportModal'
import { appConfirm } from '@/components/ui/AppDialog'
import { useAuth } from '@/contexts/AuthContext'

interface CommentListProps {
  postId: string
  profileId: string | null
  commentCount: number
  postCategory?: string
}

export default function CommentList({ postId, profileId, commentCount, postCategory }: CommentListProps) {
  const { user } = useAuth()
  const showFollowupHint = user?.role === 'master_admin' && postCategory === 'suggestion'
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [loading, setLoading] = useState(true)
  const [reportCommentId, setReportCommentId] = useState<string | null>(null)

  const fetchComments = useCallback(async () => {
    const { data } = await communityCommentService.getComments(postId)
    setComments(data || [])
    setLoading(false)
  }, [postId])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  const handleCreateComment = async (content: string) => {
    if (!profileId) return
    await communityCommentService.createComment(postId, profileId, { content })
    fetchComments()
  }

  const handleReply = async (parentId: string, content: string) => {
    if (!profileId) return
    await communityCommentService.createComment(postId, profileId, { content, parent_id: parentId })
    fetchComments()
  }

  const handleDelete = async (commentId: string) => {
    if (!await appConfirm('댓글을 삭제하시겠습니까?')) return
    await communityCommentService.deleteComment(commentId)
    fetchComments()
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-4 h-4 text-at-text-secondary" />
        <h3 className="text-sm font-semibold text-at-text">댓글 {commentCount > 0 && `(${commentCount})`}</h3>
      </div>

      {/* 댓글 작성 */}
      {profileId && (
        <div className="mb-4">
          {showFollowupHint && (
            <div className="mb-2 flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                마스터 댓글은 자동으로 <span className="font-semibold">마스터 전용</span>으로 저장되며, 원본 PR이 있으면 댓글 내용이 follow-up 수정 요청으로 Claude Code에 자동 전달됩니다.
              </div>
            </div>
          )}
          <CommentForm onSubmit={handleCreateComment} />
        </div>
      )}

      {/* 댓글 목록 */}
      {loading ? (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-at-accent"></div>
        </div>
      ) : comments.length === 0 ? (
        <p className="text-center py-6 text-sm text-at-text-weak">첫 댓글을 남겨보세요!</p>
      ) : (
        <div className="divide-y divide-at-border">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              profileId={profileId}
              postId={postId}
              onReply={handleReply}
              onDelete={handleDelete}
              onReport={(commentId) => setReportCommentId(commentId)}
              onLikeToggled={fetchComments}
            />
          ))}
        </div>
      )}

      {/* 신고 모달 */}
      {reportCommentId && profileId && (
        <ReportModal
          commentId={reportCommentId}
          profileId={profileId}
          onClose={() => setReportCommentId(null)}
        />
      )}
    </div>
  )
}
