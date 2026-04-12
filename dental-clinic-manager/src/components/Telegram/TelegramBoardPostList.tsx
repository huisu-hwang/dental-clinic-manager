'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Brain, FileText, Link2, PenLine, Loader2, Inbox, Plus, Heart, Bookmark, Vote, ChevronDown, CheckSquare, X, FolderInput, Settings2, Sparkles } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import TelegramBoardPostCard from './TelegramBoardPostCard'
import TelegramBoardPostDetail from './TelegramBoardPostDetail'
import TelegramBoardPostForm from './TelegramBoardPostForm'
import ContributionVoteForm from './ContributionVoteForm'
import TelegramBoardCategoryManager from './TelegramBoardCategoryManager'
import { telegramBoardPostService, telegramBoardVoteService, telegramBoardCategoryService } from '@/lib/telegramService'
import type { TelegramBoardPost, TelegramBoardCategory, CreateContributionVoteDto, TelegramGroupVisibility } from '@/types/telegram'
import { getCategoryColorClasses } from '@/types/telegram'
import { appConfirm, appAlert } from '@/components/ui/AppDialog'

interface TelegramBoardPostListProps {
  groupId: string
  currentUserId?: string | null
  isMasterAdmin?: boolean
  isGroupCreator?: boolean
  initialPostId?: string | null
  isMember?: boolean
  groupVisibility?: TelegramGroupVisibility
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
  isGroupCreator = false,
  initialPostId,
  isMember = true,
  groupVisibility = 'private',
}: TelegramBoardPostListProps) {
  // 비멤버는 글쓰기 불가
  const canWrite = isMember
  const [posts, setPosts] = useState<TelegramBoardPost[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [categories, setCategories] = useState<TelegramBoardCategory[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const [selectedPost, setSelectedPost] = useState<TelegramBoardPost | null>(null)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editingPost, setEditingPost] = useState<TelegramBoardPost | null>(null)
  const [voteFormMode, setVoteFormMode] = useState(false)
  const [writeMenuOpen, setWriteMenuOpen] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkMoving, setBulkMoving] = useState(false)
  const [moveMenuOpen, setMoveMenuOpen] = useState(false)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [classifyingAll, setClassifyingAll] = useState(false)
  const moveMenuRef = useRef<HTMLDivElement>(null)

  // 카테고리 목록 조회
  const fetchCategories = useCallback(async () => {
    const { data } = await telegramBoardCategoryService.getCategories(groupId)
    if (data) setCategories(data)
  }, [groupId])

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
        categoryId: activeCategory === 'all' ? undefined : activeCategory,
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
  }, [groupId, activeFilter, activeCategory, searchQuery, page, currentUserId])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

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

  // 카테고리 변경 시 페이지 리셋
  const handleCategoryChange = (categoryId: string) => {
    setActiveCategory(categoryId)
    setPage(0)
  }

  // 필터 변경 시 페이지 리셋
  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter)
    setPage(0)
  }

  // 일괄 AI 분류
  const handleClassifyAll = async () => {
    if (!(await appConfirm('미분류 게시글을 AI로 자동 분류하시겠습니까?\n시간이 다소 걸릴 수 있습니다.'))) return
    setClassifyingAll(true)
    try {
      const res = await fetch('/api/telegram/board-posts/classify-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      })
      const result = await res.json()
      if (result.error) {
        await appAlert(result.error)
      } else {
        await appAlert(`${result.data.classified}/${result.data.total}개 게시글이 분류되었습니다.`)
        fetchCategories()
        fetchPosts()
      }
    } catch {
      await appAlert('일괄 분류에 실패했습니다.')
    } finally {
      setClassifyingAll(false)
    }
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
    if (!(await appConfirm('게시글을 삭제하시겠습니까?'))) return
    const { error } = await telegramBoardPostService.deletePost(post.id)
    if (!error) {
      setSelectedPost(null)
      fetchPosts()
    } else {
      await appAlert(error)
    }
  }

  // 선택 모드 토글
  const handleToggleSelectMode = () => {
    if (selectMode) {
      setSelectMode(false)
      setSelectedIds(new Set())
    } else {
      setSelectMode(true)
      setSelectedIds(new Set())
    }
  }

  // 개별 선택 토글
  const handleToggleSelect = (postId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(postId)) {
        next.delete(postId)
      } else {
        next.add(postId)
      }
      return next
    })
  }

  // 전체 선택 (삭제 가능한 것만)
  const selectablePosts = (isMasterAdmin || isGroupCreator) ? posts : posts.filter(p => p.post_type === 'general' || p.post_type === 'vote')
  const allSelected = selectablePosts.length > 0 && selectablePosts.every(p => selectedIds.has(p.id))

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectablePosts.map(p => p.id)))
    }
  }

  // 관리자 또는 게시판 생성자는 상시 체크박스 모드
  const canBulkManage = isMasterAdmin || isGroupCreator

  // 카테고리 일괄 이동
  const handleBulkMove = async (targetPostType: string) => {
    if (selectedIds.size === 0) return
    setMoveMenuOpen(false)

    const targetLabel = POST_TYPE_FILTERS.find(f => f.key === targetPostType)?.label || targetPostType
    if (!(await appConfirm(`선택한 ${selectedIds.size}개의 게시글을 "${targetLabel}"(으)로 이동하시겠습니까?`))) return

    setBulkMoving(true)
    const { data, error } = await telegramBoardPostService.bulkMovePosts(Array.from(selectedIds), targetPostType)
    setBulkMoving(false)

    if (error) {
      await appAlert(error)
    } else if (data) {
      if (data.failed > 0) {
        await appAlert(`${data.moved}개 이동 완료, ${data.failed}개는 권한이 없어 이동하지 못했습니다.`)
      }
      setSelectedIds(new Set())
      fetchPosts()
    }
  }

  // 일괄 삭제
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!(await appConfirm(`선택한 ${selectedIds.size}개의 게시글을 삭제하시겠습니까?`))) return

    setBulkDeleting(true)
    const { data, error } = await telegramBoardPostService.bulkDeletePosts(Array.from(selectedIds))
    setBulkDeleting(false)

    if (error) {
      await appAlert(error)
    } else if (data) {
      if (data.failed > 0) {
        await appAlert(`${data.deleted}개 삭제 완료, ${data.failed}개는 권한이 없어 삭제하지 못했습니다.`)
      }
      setSelectMode(false)
      setSelectedIds(new Set())
      fetchPosts()
    }
  }

  // 폼 제출 (생성/수정)
  const handleFormSubmit = async (data: { title: string; content: string; notifyTelegram: boolean; fileUrls: { url: string; name: string; type?: string; size?: number }[]; categoryId?: string | null }) => {
    if (formMode === 'create') {
      const { error } = await telegramBoardPostService.createPost(groupId, {
        title: data.title,
        content: data.content,
        notify_telegram: data.notifyTelegram,
        file_urls: data.fileUrls,
        category_id: data.categoryId,
      })
      if (error) {
        await appAlert(error)
        return
      }
    } else if (formMode === 'edit' && editingPost) {
      const { error } = await telegramBoardPostService.updatePost(editingPost.id, {
        title: data.title,
        content: data.content,
        file_urls: data.fileUrls,
        category_id: data.categoryId,
      })
      if (error) {
        await appAlert(error)
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
      await appAlert(error)
      return
    }
    setVoteFormMode(false)
    fetchPosts()
  }

  // 카테고리 관리 모드
  if (showCategoryManager) {
    return (
      <TelegramBoardCategoryManager
        groupId={groupId}
        onBack={() => { setShowCategoryManager(false); fetchCategories(); fetchPosts() }}
      />
    )
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
        categories={categories}
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
        isGroupCreator={isGroupCreator}
        onEdit={handleEdit}
        onDelete={handleDelete}
        isMember={isMember}
        groupVisibility={groupVisibility}
      />
    )
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const canBulkDelete = isMasterAdmin || isGroupCreator
  const showActionBar = canBulkManage ? selectedIds.size > 0 : selectMode

  const MOVE_TARGET_OPTIONS = POST_TYPE_FILTERS.filter(f => f.key !== 'all')

  return (
    <div>
      {/* 글쓰기 버튼 + 검색 + 필터 */}
      <div className="mb-4 space-y-3">
        {/* 카테고리 탭 (1차 필터) */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="flex gap-1 overflow-x-auto pb-1 flex-1">
              <button
                onClick={() => handleCategoryChange('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  activeCategory === 'all'
                    ? 'bg-at-text text-white'
                    : 'bg-at-surface-alt text-at-text-weak hover:bg-at-surface-hover'
                }`}
              >
                전체
              </button>
              {categories.map(cat => {
                const colorClasses = getCategoryColorClasses(cat.color)
                const isActive = activeCategory === cat.id
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryChange(cat.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      isActive
                        ? `${colorClasses.bg} ${colorClasses.text} ring-1 ring-current`
                        : 'bg-at-surface-alt text-at-text-weak hover:bg-at-surface-hover'
                    }`}
                  >
                    {cat.name}
                    {cat.post_count > 0 && (
                      <span className="ml-1 opacity-60">{cat.post_count}</span>
                    )}
                  </button>
                )
              })}
            </div>
            {(isMasterAdmin || isGroupCreator) && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={handleClassifyAll}
                  disabled={classifyingAll}
                  className="p-1.5 text-at-text-weak hover:text-purple-600 transition-colors"
                  title="미분류 글 AI 자동 분류"
                >
                  {classifyingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setShowCategoryManager(true)}
                  className="p-1.5 text-at-text-weak hover:text-at-text-secondary transition-colors"
                  title="카테고리 관리"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* 글쓰기 + 유형/개인 필터 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1 overflow-x-auto pb-1 flex-1">
            {/* 유형 필터 (2차, 작은 텍스트) */}
            {POST_TYPE_FILTERS.filter(f => f.key !== 'all').map(f => {
              const Icon = f.icon
              return (
                <button
                  key={f.key}
                  onClick={() => handleFilterChange(activeFilter === f.key ? 'all' : f.key)}
                  className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors inline-flex items-center gap-0.5 ${
                    activeFilter === f.key
                      ? 'bg-at-tag text-at-accent'
                      : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                  }`}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  {f.label}
                </button>
              )
            })}
            {currentUserId && (
              <>
                <span className="w-px h-4 bg-at-border mx-0.5" />
                <button
                  onClick={() => handleFilterChange(activeFilter === 'my_likes' ? 'all' : 'my_likes')}
                  className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors inline-flex items-center gap-0.5 ${
                    activeFilter === 'my_likes'
                      ? 'bg-at-error-bg text-at-error'
                      : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                  }`}
                >
                  <Heart className="w-3 h-3" />좋아요
                </button>
                <button
                  onClick={() => handleFilterChange(activeFilter === 'my_scraps' ? 'all' : 'my_scraps')}
                  className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors inline-flex items-center gap-0.5 ${
                    activeFilter === 'my_scraps'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                  }`}
                >
                  <Bookmark className="w-3 h-3" />스크랩
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {canBulkDelete && !canBulkManage && !selectMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleSelectMode}
                className="text-at-text-secondary"
              >
                <CheckSquare className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">선택 삭제</span>
              </Button>
            )}
            {canWrite && currentUserId && !selectMode && (
              <div className="relative">
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
                    <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-at-border rounded-xl shadow-at-card z-20 overflow-hidden">
                      <button
                        onClick={() => { handleOpenCreate(); setWriteMenuOpen(false) }}
                        className="w-full px-3 py-2.5 text-left text-sm hover:bg-at-surface-hover flex items-center gap-2"
                      >
                        <PenLine className="w-4 h-4 text-at-text-secondary" />일반 글쓰기
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
        </div>

        {/* 액션 바: canBulkManage는 선택 항목 있을 때, 일반 사용자는 selectMode일 때 */}
        {showActionBar && (
          <div className="flex items-center justify-between bg-at-tag border border-at-border rounded-xl px-4 py-2">
            <div className="flex items-center gap-3">
              <button
                onClick={handleSelectAll}
                className="text-xs font-medium text-at-accent hover:text-at-accent"
              >
                {allSelected ? '전체 해제' : '전체 선택'}
              </button>
              <span className="text-xs text-at-text-secondary">
                {selectedIds.size}개 선택됨
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* 카테고리 이동 (canBulkManage만) */}
              {canBulkManage && (
                <div className="relative" ref={moveMenuRef}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMoveMenuOpen(!moveMenuOpen)}
                    disabled={selectedIds.size === 0 || bulkMoving}
                    className="text-xs"
                  >
                    {bulkMoving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                    ) : (
                      <FolderInput className="w-3.5 h-3.5 mr-1" />
                    )}
                    카테고리 이동
                    <ChevronDown className="w-3 h-3 ml-0.5" />
                  </Button>
                  {moveMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMoveMenuOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-at-border rounded-xl shadow-at-card z-20 overflow-hidden">
                        {MOVE_TARGET_OPTIONS.map(opt => {
                          const Icon = opt.icon
                          return (
                            <button
                              key={opt.key}
                              onClick={() => handleBulkMove(opt.key)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-at-surface-hover flex items-center gap-2"
                            >
                              {Icon && <Icon className="w-3.5 h-3.5 text-at-text-secondary" />}
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={selectedIds.size === 0 || bulkDeleting}
                className="text-xs"
              >
                {bulkDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : null}
                {selectedIds.size}개 삭제
              </Button>
              {/* 취소 버튼은 일반 사용자 selectMode에서만 표시 */}
              {!canBulkManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleToggleSelectMode}
                  className="text-xs text-at-text-secondary"
                >
                  <X className="w-3.5 h-3.5 mr-0.5" />취소
                </Button>
              )}
              {/* canBulkManage는 선택 해제 버튼 */}
              {canBulkManage && selectedIds.size > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-at-text-secondary"
                >
                  <X className="w-3.5 h-3.5 mr-0.5" />선택 해제
                </Button>
              )}
            </div>
          </div>
        )}

        {/* 검색바 */}
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-at-text-weak" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="게시글 검색..."
            className="pl-9 h-9 text-sm"
          />
        </form>
      </div>

      {/* 게시글 목록 */}
      {!loading && (
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs text-at-text-weak">총 {total}건</span>
        </div>
      )}
      <div className="bg-white rounded-2xl border border-at-border overflow-hidden shadow-at-card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-at-accent" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-at-text-weak">
            <div className="w-16 h-16 bg-at-surface-alt rounded-full flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-at-text-weak" />
            </div>
            <p className="font-medium text-at-text-secondary mb-1">게시글이 없습니다</p>
            <p className="text-sm text-at-text-weak">새로운 글이 작성되면 여기에 표시됩니다.</p>
          </div>
        ) : (
          <>
            {/* 테이블 헤더 */}
            <div className="flex items-center px-4 py-2 border-b border-at-border bg-at-surface-alt text-xs font-medium text-at-text-weak">
              <div className="w-5 flex-shrink-0" />
              <div className="hidden sm:block w-20 flex-shrink-0 text-center">카테고리</div>
              <div className="flex-1 min-w-0 text-center">제목</div>
              <div className="hidden sm:block w-20 text-center flex-shrink-0">작성자</div>
              <div className="w-20 text-center flex-shrink-0">작성일</div>
              <div className="hidden sm:block w-12 text-center flex-shrink-0">조회</div>
            </div>
            {posts.map(post => (
              <TelegramBoardPostCard
                key={post.id}
                post={post}
                onClick={handlePostClick}
                selectMode={selectMode}
                selected={selectedIds.has(post.id)}
                onToggleSelect={handleToggleSelect}
                selectable={isMasterAdmin || isGroupCreator || post.post_type === 'general' || post.post_type === 'vote'}
                alwaysShowCheckbox={canBulkManage}
              />
            ))}
          </>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-1 text-xs rounded-xl border border-at-border disabled:opacity-40 hover:bg-at-surface-hover"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          {Array.from({ length: totalPages }, (_, i) => i)
            .filter(p => p === 0 || p === totalPages - 1 || Math.abs(p - page) <= 1)
            .reduce((acc: (number | string)[], p, i, arr) => {
              if (i > 0 && typeof arr[i - 1] === 'number' && (p as number) - (arr[i - 1] as number) > 1) {
                acc.push('...')
              }
              acc.push(p)
              return acc
            }, [])
            .map((p, i) =>
              typeof p === 'string' ? (
                <span key={`dots-${i}`} className="px-2 text-at-text-weak text-sm">...</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className={`min-w-[28px] px-2 py-1 text-xs rounded-xl border transition-colors ${
                    page === p
                      ? 'bg-at-accent text-white border-at-accent'
                      : 'border-at-border text-at-text-secondary hover:bg-at-surface-hover'
                  }`}
                >
                  {(p as number) + 1}
                </button>
              )
            )}
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 text-xs rounded-xl border border-at-border disabled:opacity-40 hover:bg-at-surface-hover"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}
