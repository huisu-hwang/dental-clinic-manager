'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Brain, FileText, Link2, PenLine, Loader2, Inbox, Plus, Heart, Bookmark, Vote, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import TelegramBoardPostCard from './TelegramBoardPostCard'
import TelegramBoardPostDetail from './TelegramBoardPostDetail'
import TelegramBoardPostForm from './TelegramBoardPostForm'
import ContributionVoteForm from './ContributionVoteForm'
import { telegramBoardPostService, telegramBoardVoteService } from '@/lib/telegramService'
import type { TelegramBoardPost, CreateContributionVoteDto } from '@/types/telegram'

interface TelegramBoardPostListProps {
  groupId: string
  currentUserId?: string | null
  isMasterAdmin?: boolean
  initialPostId?: string | null
}

const POST_TYPE_FILTERS = [
  { key: 'all', label: '전체', icon: null },
  { key: 'summary', label: 'AI 요약', icon: Brain },
  { key: 'file', label: '파일', icon: FileText },
  { key: 'link', label: '링크', icon: Link2 },
  { key: 'general', label: '일반 글', icon: PenLine },
  { key: 'vote', label: '기여도 투표', icon: Vote },
] as const

const PAGE_SIZE = 20

export default function TelegramBoardPostList({
  groupId,
  currentUserId,
  isMasterAdmin = false,
  initialPostId,
}: TelegramBoardPostListProps) {
  const [posts, setPosts] = useState<TelegramBoardPost[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const [selectedPost, setSelectedPost] = useState<TelegramBoardPost | null>(null)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editingPost, setEditingPost] = useState<TelegramBoardPost | null>(null)
  const [voteFormMode, setVoteFormMode] = useState(false)
  const [writeMenuOpen, setWriteMenuOpen] = useState(false)

  const fetchPosts = useCallback(async () => {
    setLoading(true)

    if (activeFilter === 'my_likes' && currentUserId) {
      const { data, total: totalCount, error } = await telegramBoardPostService.getMyLikes(currentUserId, groupId, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      if (!error && data) {
        setPosts(data)
        setTotal(totalCount)
      }
    } else if (activeFilter === 'my_scraps' && currentUserId) {
      const { data, total: totalCount, error } = await telegramBoardPostService.getMyScraps(currentUserId, groupId, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      if (!error && data) {
        setPosts(data)
        setTotal(totalCount)
      }
    } else {
      const { data, total: totalCount, error } = await telegramBoardPostService.getPosts(groupId, {
        postType: activeFilter === 'all' ? undefined : activeFilter as 'summary' | 'file' | 'link' | 'general' | 'vote',
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: searchQuery || undefined,
      })
      if (!error && data) {
        setPosts(data)
        setTotal(totalCount)
      }
    }
    setLoading(false)
  }, [groupId, activeFilter, searchQuery, page, currentUserId])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  // URL의 postId 파라미터로 특정 글 바로 열기
  useEffect(() => {
    if (initialPostId && !selectedPost) {
      const openPost = async () => {
        const { data } = await telegramBoardPostService.getPost(initialPostId)
        if (data) setSelectedPost(data)
      }
      openPost()
    }
  }, [initialPostId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 필터 변경 시 페이지 리셋
  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter)
    setPage(0)
  }

  // 검색
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(0)
    fetchPosts()
  }

  // 게시글 클릭 → 상세 보기 (조회수 증가)
  const handlePostClick = async (post: TelegramBoardPost) => {
    const { data } = await telegramBoardPostService.getPost(post.id)
    setSelectedPost(data || post)
  }

  // 상세에서 목록으로 돌아가기
  const handleBack = () => {
    setSelectedPost(null)
    fetchPosts()
  }

  // 글쓰기 폼 열기
  const handleOpenCreate = () => {
    setFormMode('create')
    setEditingPost(null)
  }

  // 수정 폼 열기
  const handleEdit = (post: TelegramBoardPost) => {
    setFormMode('edit')
    setEditingPost(post)
    setSelectedPost(null)
  }

  // 글 삭제
  const handleDelete = async (post: TelegramBoardPost) => {
    if (!confirm('게시글을 삭제하시겠습니까?')) return
    const { error } = await telegramBoardPostService.deletePost(post.id)
    if (!error) {
      setSelectedPost(null)
      fetchPosts()
    } else {
      alert(error)
    }
  }

  // 폼 제출 (생성/수정)
  const handleFormSubmit = async (data: { title: string; content: string; notifyTelegram: boolean }) => {
    if (formMode === 'create') {
      const { error } = await telegramBoardPostService.createPost(groupId, {
        title: data.title,
        content: data.content,
        notify_telegram: data.notifyTelegram,
      })
      if (error) {
        alert(error)
        return
      }
    } else if (formMode === 'edit' && editingPost) {
      const { error } = await telegramBoardPostService.updatePost(editingPost.id, {
        title: data.title,
        content: data.content,
      })
      if (error) {
        alert(error)
        return
      }
    }
    setFormMode(null)
    setEditingPost(null)
    fetchPosts()
  }

  // 투표 폼 제출
  const handleVoteFormSubmit = async (data: CreateContributionVoteDto) => {
    const { error } = await telegramBoardVoteService.createVote(groupId, data)
    if (error) {
      alert(error)
      return
    }
    setVoteFormMode(false)
    fetchPosts()
  }

  // 투표 폼 모드
  if (voteFormMode) {
    return (
      <ContributionVoteForm
        onSubmit={handleVoteFormSubmit}
        onCancel={() => setVoteFormMode(false)}
      />
    )
  }

  // 폼 모드
  if (formMode) {
    return (
      <TelegramBoardPostForm
        mode={formMode}
        post={editingPost}
        onSubmit={handleFormSubmit}
        onCancel={() => { setFormMode(null); setEditingPost(null) }}
      />
    )
  }

  // 상세 보기 모드
  if (selectedPost) {
    return (
      <TelegramBoardPostDetail
        post={selectedPost}
        onBack={handleBack}
        currentUserId={currentUserId}
        isMasterAdmin={isMasterAdmin}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    )
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      {/* 글쓰기 버튼 + 검색 + 필터 */}
      <div className="mb-4 space-y-3">
        {/* 필터 탭 + 글쓰기 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1 overflow-x-auto pb-1 flex-1">
            {POST_TYPE_FILTERS.map(f => {
              const Icon = f.icon
              return (
                <button
                  key={f.key}
                  onClick={() => handleFilterChange(f.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors inline-flex items-center gap-1 ${
                    activeFilter === f.key
                      ? 'bg-sky-100 text-sky-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  {f.label}
                </button>
              )
            })}
            {currentUserId && (
              <>
                <span className="w-px h-4 bg-gray-200 mx-0.5" />
                <button
                  onClick={() => handleFilterChange('my_likes')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors inline-flex items-center gap-1 ${
                    activeFilter === 'my_likes'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  <Heart className="w-3 h-3" />내 좋아요
                </button>
                <button
                  onClick={() => handleFilterChange('my_scraps')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors inline-flex items-center gap-1 ${
                    activeFilter === 'my_scraps'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  <Bookmark className="w-3 h-3" />내 스크랩
                </button>
              </>
            )}
          </div>
          {currentUserId && (
            <div className="relative flex-shrink-0">
              <Button
                size="sm"
                onClick={() => setWriteMenuOpen(!writeMenuOpen)}
                className="flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />글쓰기
                <ChevronDown className="w-3 h-3" />
              </Button>
              {writeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setWriteMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
                    <button
                      onClick={() => { handleOpenCreate(); setWriteMenuOpen(false) }}
                      className="w-full px-3 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                    >
                      <PenLine className="w-4 h-4 text-gray-500" />일반 글쓰기
                    </button>
                    <button
                      onClick={() => { setVoteFormMode(true); setWriteMenuOpen(false) }}
                      className="w-full px-3 py-2.5 text-left text-sm hover:bg-orange-50 flex items-center gap-2"
                    >
                      <Vote className="w-4 h-4 text-orange-500" />투표 만들기
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* 검색바 */}
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="게시글 검색..."
            className="pl-9 h-9 text-sm"
          />
        </form>
      </div>

      {/* 게시글 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Inbox className="w-10 h-10 mb-2" />
            <p className="text-sm">게시글이 없습니다</p>
          </div>
        ) : (
          posts.map(post => (
            <TelegramBoardPostCard key={post.id} post={post} onClick={handlePostClick} />
          ))
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            이전
          </button>
          <span className="text-xs text-gray-500">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            다음
          </button>
        </div>
      )}
    </div>
  )
}
