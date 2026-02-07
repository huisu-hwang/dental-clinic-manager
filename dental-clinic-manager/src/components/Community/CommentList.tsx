'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageSquare } from 'lucide-react'
import { communityCommentService } from '@/lib/communityService'
import type { CommunityComment } from '@/types/community'
import CommentForm from './CommentForm'
import CommentItem from './CommentItem'
import ReportModal from './ReportModal'

interface CommentListProps {
  postId: string
  profileId: string | null
  commentCount: number
}

export default function CommentList({ postId, profileId, commentCount }: CommentListProps) {
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
    if (!confirm('댓글을 삭제하시겠습니까?')) return
    await communityCommentService.deleteComment(commentId)
    fetchComments()
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">댓글 {commentCount > 0 && `(${commentCount})`}</h3>
      </div>

      {/* 댓글 작성 */}
      {profileId && (
        <div className="mb-4">
          <CommentForm onSubmit={handleCreateComment} />
        </div>
      )}

      {/* 댓글 목록 */}
      {loading ? (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
      ) : comments.length === 0 ? (
        <p className="text-center py-6 text-sm text-gray-400">첫 댓글을 남겨보세요!</p>
      ) : (
        <div className="divide-y divide-gray-100">
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
