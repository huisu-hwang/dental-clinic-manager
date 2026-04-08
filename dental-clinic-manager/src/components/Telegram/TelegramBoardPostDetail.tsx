'use client'

import { useState, useMemo } from 'react'
import { ArrowLeft, Eye, FileText, Link2, Brain, Download, ExternalLink, Calendar, PenLine, Pencil, Trash2, Vote } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { TelegramBoardPost, TelegramGroupVisibility } from '@/types/telegram'
import { TELEGRAM_POST_TYPE_LABELS, TELEGRAM_POST_TYPE_COLORS } from '@/types/telegram'
import TelegramBoardCommentSection from './TelegramBoardCommentSection'
import TelegramBoardPostActions from './TelegramBoardPostActions'
import ContributionVoteDisplay from './ContributionVoteDisplay'
import LinkPreviewCard from './LinkPreviewCard'
import { telegramBoardPostService } from '@/lib/telegramService'
import { sanitizeHtml } from '@/utils/sanitize'

interface TelegramBoardPostDetailProps {
  post: TelegramBoardPost
  onBack: () => void
  currentUserId?: string | null
  isMasterAdmin?: boolean
  isGroupCreator?: boolean
  onEdit?: (post: TelegramBoardPost) => void
  onDelete?: (post: TelegramBoardPost) => void
  isMember?: boolean
  groupVisibility?: TelegramGroupVisibility
}

export default function TelegramBoardPostDetail({
  post,
  onBack,
  currentUserId,
  isMasterAdmin = false,
  isGroupCreator = false,
  onEdit,
  onDelete,
  isMember = true,
  groupVisibility = 'private',
}: TelegramBoardPostDetailProps) {
  const [isLiked, setIsLiked] = useState(post.is_liked ?? false)
  const [isScraped, setIsScraped] = useState(post.is_scraped ?? false)
  const [likeCount, setLikeCount] = useState(post.like_count ?? 0)
  const [scrapCount, setScrapCount] = useState(post.scrap_count ?? 0)

  const handleToggleLike = async () => {
    if (!currentUserId) return
    const { data } = await telegramBoardPostService.toggleLike(currentUserId, post.id)
    if (data) {
      setIsLiked(data.liked)
      setLikeCount(data.like_count)
    }
  }

  const handleToggleScrap = async () => {
    if (!currentUserId) return
    const { data } = await telegramBoardPostService.toggleScrap(currentUserId, post.id)
    if (data) {
      setIsScraped(data.scraped)
      setScrapCount(data.scrap_count)
    }
  }

  // 본문에서 링크 추출 (link_urls + content 내 a 태그)
  const extractedLinks = useMemo(() => {
    const links = new Set<string>()
    // link_urls에서
    post.link_urls?.forEach(l => links.add(l.url))
    // content HTML에서 a 태그 추출
    if (post.content) {
      const regex = /<a[^>]+href=["']([^"']+)["']/gi
      let match
      while ((match = regex.exec(post.content)) !== null) {
        const href = match[1]
        // 외부 링크만 (내부 앵커 제외)
        if (href.startsWith('http://') || href.startsWith('https://')) {
          links.add(href)
        }
      }
    }
    return Array.from(links).slice(0, 5) // 최대 5개
  }, [post.content, post.link_urls])

  const canModify = post.post_type === 'general' && (
    post.created_by === currentUserId || isMasterAdmin
  )
  const canDelete = isMasterAdmin || isGroupCreator || (
    (post.post_type === 'general' || post.post_type === 'vote') &&
    post.created_by === currentUserId
  )
  const typeColor = TELEGRAM_POST_TYPE_COLORS[post.post_type] || { bg: 'bg-gray-100', text: 'text-gray-700' }
  const typeLabel = TELEGRAM_POST_TYPE_LABELS[post.post_type] || post.post_type

  const TypeIcon = post.post_type === 'summary' ? Brain
    : post.post_type === 'file' ? FileText
    : post.post_type === 'general' ? PenLine
    : post.post_type === 'vote' ? Vote
    : Link2

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / 1048576).toFixed(1)}MB`
  }

  return (
    <div>
      {/* 상단 네비게이션 */}
      <div className="flex items-center justify-between mb-4">
        <nav className="flex items-center text-sm">
          <button onClick={onBack} className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
            게시판
          </button>
          <span className="mx-2 text-gray-400">›</span>
          <span className="text-gray-500 truncate max-w-[200px] sm:max-w-[400px]">{post.title}</span>
        </nav>
      </div>

      {/* 게시글 헤더 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 sm:p-6">
          {/* 타입 뱃지 + 메타 */}
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1 font-medium ${typeColor.bg} ${typeColor.text}`}>
              <TypeIcon className="w-3.5 h-3.5" />
              {typeLabel}
            </span>
            {post.summary_date && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {post.summary_date} 요약
              </span>
            )}
            {post.ai_model && (
              <span className="text-xs text-gray-400">
                by {post.ai_model}
              </span>
            )}
          </div>

          {/* 제목 */}
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 mb-3">
            {post.title}
          </h1>

          {/* 메타 정보 */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              {(post.author?.name || post.telegram_sender_name) && (
                <span className="text-gray-600 font-medium">{post.author?.name || post.telegram_sender_name}</span>
              )}
              <span>{formatDate(post.created_at)}</span>
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />{post.view_count}
              </span>
            </div>
            {(canModify || canDelete) && (
              <div className="flex items-center gap-1">
                {canModify && onEdit && (
                  <Button variant="ghost" size="sm" onClick={() => onEdit(post)} className="text-gray-400 hover:text-gray-600 hidden sm:inline-flex">
                    <Pencil className="w-3.5 h-3.5 mr-1" />수정
                  </Button>
                )}
                {canDelete && onDelete && (
                  <Button variant="ghost" size="sm" onClick={() => onDelete(post)} className="text-gray-400 hover:text-red-500 hidden sm:inline-flex">
                    <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* 파일 목록 */}
          {(post.file_urls?.length ?? 0) > 0 && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-1">
                <FileText className="w-4 h-4" />첨부 파일
              </h4>
              <div className="space-y-2">
                {post.file_urls.map((file, i) => (
                  <a
                    key={i}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    <Download className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{file.name || `파일 ${i + 1}`}</span>
                    {file.size && (
                      <span className="text-xs text-blue-400 flex-shrink-0">
                        ({formatFileSize(file.size)})
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 링크 목록 */}
          {(post.link_urls?.length ?? 0) > 0 && (
            <div className="mb-4 p-3 bg-green-50 rounded-lg">
              <h4 className="text-sm font-medium text-green-800 mb-2 flex items-center gap-1">
                <Link2 className="w-4 h-4" />공유 링크
              </h4>
              <div className="space-y-2">
                {post.link_urls.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-green-600 hover:text-green-800 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{link.title || link.url}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 본문 콘텐츠 */}
          {post.content && (
            <div
              className="prose prose-sm max-w-none text-gray-700
                prose-headings:text-gray-900 prose-headings:font-semibold
                prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2
                prose-ul:my-2 prose-li:my-0.5
                prose-p:my-2 prose-a:text-blue-600
                [&_video]:rounded-lg [&_video]:max-w-full [&_video]:my-4"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }}
            />
          )}

          {/* 링크 미리보기 */}
          {extractedLinks.length > 0 && (
            <div className="mt-4 space-y-2">
              {extractedLinks.map((link, i) => (
                <LinkPreviewCard key={i} url={link} />
              ))}
            </div>
          )}

          {/* 기여도 투표 표시 */}
          {post.post_type === 'vote' && (
            <ContributionVoteDisplay
              postId={post.id}
              groupId={post.telegram_group_id}
              currentUserId={currentUserId}
              isMasterAdmin={isMasterAdmin}
              postCreatedBy={post.created_by}
            />
          )}

          {/* 좋아요/스크랩 액션 */}
          {currentUserId && (
            <div className="mt-6">
              <TelegramBoardPostActions
                isLiked={isLiked}
                isScraped={isScraped}
                likeCount={likeCount}
                scrapCount={scrapCount}
                onToggleLike={handleToggleLike}
                onToggleScrap={handleToggleScrap}
              />
            </div>
          )}

          {/* 댓글 섹션 */}
          <TelegramBoardCommentSection
            postId={post.id}
            currentUserId={currentUserId ?? null}
            isMasterAdmin={isMasterAdmin}
            isMember={isMember}
            groupVisibility={groupVisibility}
          />
        </div>
      </div>

      {/* 하단 액션 바 */}
      <div className="flex items-center justify-center gap-2 mt-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          목록으로
        </button>
        {canModify && onEdit && (
          <button
            onClick={() => onEdit(post)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Pencil className="w-4 h-4" />
            수정
          </button>
        )}
        {canDelete && onDelete && (
          <button
            onClick={() => onDelete(post)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            삭제
          </button>
        )}
      </div>
    </div>
  )
}
