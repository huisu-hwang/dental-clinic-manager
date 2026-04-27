'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Pencil, Trash2, Eye, Share2, Paperclip, Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { communityPostService, communityPollService } from '@/lib/communityService'
import type { CommunityPost, CommunityPoll, CommunityPostAttachment } from '@/types/community'
import { COMMUNITY_CATEGORY_LABELS, COMMUNITY_CATEGORY_COLORS } from '@/types/community'
import ProfileCard from './ProfileCard'
import PostActions from './PostActions'
import SuggestionControlPanel from './SuggestionControlPanel'
import ContentProtectionWrapper from './ContentProtectionWrapper'
import WatermarkOverlay from './WatermarkOverlay'
import CommentList from './CommentList'
import PollDisplay from './PollDisplay'
import ReportModal from './ReportModal'
import ShareDialog from '@/components/shared/ShareDialog'
import { appConfirm } from '@/components/ui/AppDialog'
import { sanitizeHtml } from '@/utils/sanitize'

const isImageType = (type?: string) => !!type && type.startsWith('image/')

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function AttachmentSection({ attachments }: { attachments: CommunityPostAttachment[] }) {
  if (!attachments || attachments.length === 0) return null

  const images = attachments.filter((a) => isImageType(a.file_type))
  const others = attachments.filter((a) => !isImageType(a.file_type))

  return (
    <div className="mt-6 pt-4 border-t border-at-border">
      <div className="flex items-center gap-1.5 mb-3">
        <Paperclip className="w-4 h-4 text-at-text-secondary" />
        <h3 className="text-sm font-semibold text-at-text-secondary">
          첨부 파일 <span className="text-xs text-at-text-weak">({attachments.length})</span>
        </h3>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          {images.map((att) => (
            <a
              key={att.id}
              href={att.public_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block relative rounded-xl overflow-hidden border border-at-border bg-at-surface-alt hover:border-at-accent transition-colors group"
              title={`${att.file_name} (${formatBytes(att.file_size)})`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={att.public_url}
                alt={att.file_name}
                className="w-full h-32 object-cover group-hover:opacity-90 transition-opacity"
                loading="lazy"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-2 py-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                {att.file_name}
              </div>
            </a>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <ul className="space-y-1.5">
          {others.map((att) => (
            <li key={att.id}>
              <a
                href={att.public_url}
                target="_blank"
                rel="noopener noreferrer"
                download={att.file_name}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-at-border bg-white hover:bg-at-surface-hover transition-colors"
              >
                <FileText className="w-4 h-4 text-at-text-weak flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-at-text truncate">{att.file_name}</p>
                  <p className="text-[11px] text-at-text-weak">{formatBytes(att.file_size)}</p>
                </div>
                <Download className="w-4 h-4 text-at-text-weak flex-shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface CommunityPostDetailProps {
  postId: string
  myProfileId: string | null
  nickname: string
  labelMap?: Record<string, string>
  colorMap?: Record<string, string>
  onBack: () => void
  onEdit: (post: CommunityPost) => void
  onDeleted: () => void
}

export default function CommunityPostDetail({
  postId, myProfileId, nickname, labelMap, colorMap, onBack, onEdit, onDeleted,
}: CommunityPostDetailProps) {
  const labels = labelMap || COMMUNITY_CATEGORY_LABELS
  const colors = colorMap || COMMUNITY_CATEGORY_COLORS
  const [post, setPost] = useState<CommunityPost | null>(null)
  const [poll, setPoll] = useState<CommunityPoll | null>(null)
  const [loading, setLoading] = useState(true)
  const [showReport, setShowReport] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)

  const fetchPost = async () => {
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
    if (!post || !await appConfirm('정말 삭제하시겠습니까?')) return
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent"></div>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="text-center py-12">
        <p className="text-at-text-secondary">게시글을 찾을 수 없습니다.</p>
        <Button variant="outline" onClick={onBack} className="mt-4">돌아가기</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <nav className="flex items-center text-sm">
          <button onClick={onBack} className="text-at-accent hover:text-at-accent-hover font-medium transition-colors">
            자유게시판
          </button>
          <span className="mx-2 text-at-text-weak">›</span>
          <span className="text-at-text-secondary truncate max-w-[200px] sm:max-w-[400px]">{post?.title}</span>
        </nav>
      </div>

      {/* 게시글 본문 */}
      <div className="bg-white rounded-2xl border border-at-border overflow-hidden shadow-at-card">
        <div className="p-4 sm:p-6">
          {/* 카테고리 & 제목 */}
          <div className="mb-4">
            <span className={`text-xs px-2 py-0.5 rounded-full ${colors[post.category] || 'bg-at-surface-alt text-at-text-secondary'}`}>
              {labels[post.category] || post.category}
            </span>
            <h1 className="text-xl font-bold text-at-text mt-2">{post.title}</h1>
          </div>

          {/* 메타 정보 */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-at-border">
            <div className="flex items-center gap-3">
              {post.profile && <ProfileCard profile={post.profile} compact />}
              <span className="text-xs text-at-text-weak">{formatDate(post.created_at)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setShowShareDialog(true)} className="text-at-text-weak hover:text-at-accent hidden sm:inline-flex">
                <Share2 className="w-3.5 h-3.5 mr-1" />공유
              </Button>
              {isOwner && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => onEdit(post)} className="text-at-text-weak hover:text-at-text-secondary hidden sm:inline-flex">
                    <Pencil className="w-3.5 h-3.5 mr-1" />수정
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDelete} className="text-at-text-weak hover:text-at-error hidden sm:inline-flex">
                    <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* 본문 (보호 래퍼) */}
          <ContentProtectionWrapper nickname={nickname}>
            <div className="relative">
              <WatermarkOverlay nickname={nickname} />
              <div
                className="prose max-w-none relative z-0 community-print-block"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }}
              />
            </div>
          </ContentProtectionWrapper>

          {/* 첨부 파일 */}
          {post.attachments && post.attachments.length > 0 && (
            <AttachmentSection attachments={post.attachments} />
          )}

          {/* 투표 */}
          {poll && myProfileId && (
            <div className="mt-6">
              <PollDisplay poll={poll} profileId={myProfileId} onVoted={fetchPost} />
            </div>
          )}

          {/* AI 자동 구현 (제안 카테고리 · master_admin 전용) */}
          {post.category === 'suggestion' && (
            <div className="mt-6">
              <SuggestionControlPanel postId={post.id} />
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
        <div className="border-t border-at-border p-4 sm:p-6 bg-at-surface-alt">
          <CommentList postId={post.id} profileId={myProfileId} commentCount={post.comment_count} postCategory={post.category} />
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

      {/* 하단 액션 바 */}
      <div className="flex items-center justify-center gap-2 mt-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-at-text-secondary bg-white border border-at-border rounded-xl hover:bg-at-surface-hover transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          목록으로
        </button>
        <button
          onClick={() => setShowShareDialog(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-at-accent bg-white border border-at-border rounded-xl hover:bg-at-surface-hover transition-colors"
        >
          <Share2 className="w-4 h-4" />
          공유
        </button>
        {isOwner && (
          <>
            <button
              onClick={() => onEdit(post)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-at-text-secondary bg-white border border-at-border rounded-xl hover:bg-at-surface-hover transition-colors"
            >
              <Pencil className="w-4 h-4" />
              수정
            </button>
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-at-error bg-white border border-at-border rounded-xl hover:bg-at-error-bg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              삭제
            </button>
          </>
        )}
      </div>

      {/* 공유 다이얼로그 */}
      <ShareDialog
        isOpen={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        sourceType="community_post"
        sourceId={post.id}
      />
    </div>
  )
}
