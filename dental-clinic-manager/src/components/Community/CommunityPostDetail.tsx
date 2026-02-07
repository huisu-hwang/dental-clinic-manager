'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, Edit3, Trash2, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { communityPostService, communityPollService } from '@/lib/communityService'
import type { CommunityPost, CommunityPoll } from '@/types/community'
import { COMMUNITY_CATEGORY_LABELS, COMMUNITY_CATEGORY_COLORS } from '@/types/community'
import ProfileCard from './ProfileCard'
import PostActions from './PostActions'
import ContentProtectionWrapper from './ContentProtectionWrapper'
import WatermarkOverlay from './WatermarkOverlay'
import CommentList from './CommentList'
import PollDisplay from './PollDisplay'
import ReportModal from './ReportModal'

interface CommunityPostDetailProps {
  postId: string
  myProfileId: string | null
  nickname: string
  onBack: () => void
  onEdit: (post: CommunityPost) => void
  onDeleted: () => void
}

export default function CommunityPostDetail({
  postId, myProfileId, nickname, onBack, onEdit, onDeleted,
}: CommunityPostDetailProps) {
  const [post, setPost] = useState<CommunityPost | null>(null)
  const [poll, setPoll] = useState<CommunityPoll | null>(null)
  const [loading, setLoading] = useState(true)
  const [showReport, setShowReport] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const fetchPost = async () => {
    setLoading(true)
    const { data } = await communityPostService.getPost(postId)
    if (data) {
      setPost(data)
      if (data.has_poll) {
        const { data: pollData } = await communityPollService.getPoll(postId)
        setPoll(pollData)
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchPost()
  }, [postId])

  const isOwner = myProfileId && post?.profile_id === myProfileId

  const handleToggleLike = async () => {
    if (!myProfileId || !post) return
    const { data } = await communityPostService.toggleLike(myProfileId, post.id)
    if (data) {
      setPost(prev => prev ? { ...prev, is_liked: data.liked, like_count: data.like_count } : null)
    }
  }

  const handleToggleBookmark = async () => {
    if (!myProfileId || !post) return
    const { data } = await communityPostService.toggleBookmark(myProfileId, post.id)
    if (data) {
      setPost(prev => prev ? { ...prev, is_bookmarked: data.bookmarked, bookmark_count: prev.bookmark_count + (data.bookmarked ? 1 : -1) } : null)
    }
  }

  const handleDelete = async () => {
    if (!post || !confirm('정말 삭제하시겠습니까?')) return
    const { success } = await communityPostService.deletePost(post.id)
    if (success) onDeleted()
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">게시글을 찾을 수 없습니다.</p>
        <Button variant="outline" onClick={onBack} className="mt-4">돌아가기</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-1" />목록
        </Button>
        {isOwner && (
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setShowMenu(!showMenu)}>
              <MoreVertical className="w-4 h-4" />
            </Button>
            {showMenu && (
              <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 w-32">
                <button onClick={() => { onEdit(post); setShowMenu(false) }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <Edit3 className="w-4 h-4" />수정
                </button>
                <button onClick={() => { handleDelete(); setShowMenu(false) }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />삭제
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 게시글 본문 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-4 sm:p-6">
          {/* 카테고리 & 제목 */}
          <div className="mb-4">
            <span className={`text-xs px-2 py-0.5 rounded-full ${COMMUNITY_CATEGORY_COLORS[post.category]}`}>
              {COMMUNITY_CATEGORY_LABELS[post.category]}
            </span>
            <h1 className="text-xl font-bold text-gray-900 mt-2">{post.title}</h1>
          </div>

          {/* 작성자 정보 */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
            {post.profile && <ProfileCard profile={post.profile} compact />}
            <span className="text-xs text-gray-400">{formatDate(post.created_at)}</span>
          </div>

          {/* 본문 (보호 래퍼) */}
          <ContentProtectionWrapper nickname={nickname}>
            <div className="relative">
              <WatermarkOverlay nickname={nickname} />
              <div
                className="prose max-w-none relative z-0 community-print-block"
                dangerouslySetInnerHTML={{ __html: post.content }}
              />
            </div>
          </ContentProtectionWrapper>

          {/* 투표 */}
          {poll && myProfileId && (
            <div className="mt-6">
              <PollDisplay poll={poll} profileId={myProfileId} onVoted={fetchPost} />
            </div>
          )}

          {/* 액션 버튼 */}
          {myProfileId && (
            <PostActions
              isLiked={post.is_liked || false}
              isBookmarked={post.is_bookmarked || false}
              likeCount={post.like_count}
              bookmarkCount={post.bookmark_count}
              onToggleLike={handleToggleLike}
              onToggleBookmark={handleToggleBookmark}
              onReport={() => setShowReport(true)}
            />
          )}
        </div>

        {/* 댓글 */}
        <div className="border-t border-gray-200 p-4 sm:p-6 bg-gray-50">
          <CommentList postId={post.id} profileId={myProfileId} commentCount={post.comment_count} />
        </div>
      </div>

      {/* 신고 모달 */}
      {showReport && myProfileId && (
        <ReportModal
          postId={post.id}
          profileId={myProfileId}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  )
}
