'use client'

import { useState } from 'react'
import { Heart, MessageSquare, Flag, MoreVertical, Edit3, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { CommunityComment } from '@/types/community'
import { communityCommentService } from '@/lib/communityService'
import ProfileCard from './ProfileCard'
import CommentForm from './CommentForm'
import BlindedContentPlaceholder from './BlindedContentPlaceholder'

interface CommentItemProps {
  comment: CommunityComment
  profileId: string | null
  postId: string
  onReply: (parentId: string, content: string) => Promise<void>
  onDelete: (commentId: string) => Promise<void>
  onReport: (commentId: string) => void
  onLikeToggled: () => void
  depth?: number
}

export default function CommentItem({ comment, profileId, postId, onReply, onDelete, onReport, onLikeToggled, depth = 0 }: CommentItemProps) {
  const [showReply, setShowReply] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(comment.content)
  const [showMenu, setShowMenu] = useState(false)
  const [localLikeCount, setLocalLikeCount] = useState(comment.like_count)
  const [localIsLiked, setLocalIsLiked] = useState(comment.is_liked || false)

  const isOwner = profileId === comment.profile_id

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    if (minutes < 60) return `${minutes}분 전`
    if (hours < 24) return `${hours}시간 전`
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }

  const handleLike = async () => {
    if (!profileId) return
    const { data } = await communityCommentService.toggleLike(profileId, comment.id)
    if (data) {
      setLocalLikeCount(data.like_count)
      setLocalIsLiked(data.liked)
      onLikeToggled()
    }
  }

  const handleEdit = async () => {
    if (!editContent.trim()) return
    await communityCommentService.updateComment(comment.id, editContent.trim())
    setEditing(false)
    onLikeToggled() // refresh
  }

  if (comment.is_blinded) {
    return <BlindedContentPlaceholder type="comment" />
  }

  return (
    <div className={`${depth > 0 ? 'ml-8 border-l-2 border-gray-100 pl-4' : ''}`}>
      <div className="py-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {comment.profile && <ProfileCard profile={comment.profile} compact />}
            <span className="text-xs text-gray-400">{formatDate(comment.created_at)}</span>
          </div>
          {isOwner && (
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)} className="p-1 text-gray-400 hover:text-gray-600">
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 w-24">
                  <button onClick={() => { setEditing(true); setShowMenu(false) }} className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                    <Edit3 className="w-3 h-3" />수정
                  </button>
                  <button onClick={() => { onDelete(comment.id); setShowMenu(false) }} className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                    <Trash2 className="w-3 h-3" />삭제
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button size="sm" onClick={handleEdit}>저장</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>취소</Button>
          </div>
        ) : (
          <p className="text-sm text-gray-700 mt-1">{comment.content}</p>
        )}

        <div className="flex items-center gap-3 mt-2">
          <button onClick={handleLike} className={`flex items-center gap-1 text-xs ${localIsLiked ? 'text-red-500' : 'text-gray-400 hover:text-gray-600'}`}>
            <Heart className={`w-3 h-3 ${localIsLiked ? 'fill-red-500' : ''}`} />{localLikeCount > 0 && localLikeCount}
          </button>
          {profileId && depth === 0 && (
            <button onClick={() => setShowReply(!showReply)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <MessageSquare className="w-3 h-3" />답글
            </button>
          )}
          {profileId && !isOwner && (
            <button onClick={() => onReport(comment.id)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <Flag className="w-3 h-3" />신고
            </button>
          )}
        </div>

        {showReply && profileId && (
          <div className="mt-2">
            <CommentForm
              placeholder="답글을 입력하세요..."
              autoFocus
              onSubmit={async (content) => { await onReply(comment.id, content); setShowReply(false) }}
              onCancel={() => setShowReply(false)}
            />
          </div>
        )}
      </div>

      {/* 대댓글 */}
      {comment.replies && comment.replies.length > 0 && (
        <div>
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              profileId={profileId}
              postId={postId}
              onReply={onReply}
              onDelete={onDelete}
              onReport={onReport}
              onLikeToggled={onLikeToggled}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
