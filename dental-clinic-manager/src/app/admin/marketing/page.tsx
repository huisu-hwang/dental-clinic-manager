'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import {
  PencilSquareIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  DocumentTextIcon,
  SparklesIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  TrashIcon,
  ArrowPathIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'
import type {
  ContentCalendarItem,
  CalendarItemStatus,
  PostType,
  GeneratedContent,
} from '@/types/marketing'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import { getTabRoute } from '@/utils/tabRouting'
import NewPostForm from '@/components/marketing/NewPostForm'
import ScheduleModal from '@/components/marketing/ScheduleModal'
import dynamic from 'next/dynamic'

const ContentEditor = dynamic(() => import('@/components/marketing/ContentEditor'), { ssr: false })

type MarketingTab = 'dashboard' | 'posts' | 'calendar' | 'settings'

export default function MarketingPage() {
  const { user, logout, loading } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<MarketingTab>('dashboard')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [showNewPost, setShowNewPost] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobileMenuOpen])

  const handleMainTabChange = (tab: string) => {
    if (tab === 'marketing') return
    router.push(getTabRoute(tab))
  }

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'dashboard' as const, label: '대시보드', icon: ChartBarIcon },
    { id: 'posts' as const, label: '글 관리', icon: DocumentTextIcon },
    { id: 'calendar' as const, label: '캘린더', icon: CalendarDaysIcon },
    { id: 'settings' as const, label: '설정', icon: Cog6ToothIcon },
  ]

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header - 상단 고정 */}
      <div className="fixed top-0 left-0 right-0 z-30 h-14 bg-white border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto h-full px-3 sm:px-6 flex items-center">
          <Header
            dbStatus="connected"
            user={user}
            onLogout={() => logout()}
            onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            isMenuOpen={isMobileMenuOpen}
          />
        </div>
      </div>

      {/* 모바일 메뉴 오버레이 */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 좌측 사이드바 */}
      <aside
        className={`
          fixed top-14 w-64 lg:w-56 h-[calc(100vh-3.5rem)] bg-white border-r border-slate-200 z-20 overflow-y-auto py-3 px-3
          transition-transform duration-300 ease-in-out
          lg:left-[max(0px,calc(50%-700px))]
          ${isMobileMenuOpen ? 'translate-x-0 left-0' : '-translate-x-full left-0 lg:translate-x-0'}
        `}
      >
        <TabNavigation
          activeTab="marketing"
          onTabChange={handleMainTabChange}
          onItemClick={() => setIsMobileMenuOpen(false)}
          skipAutoRedirect={true}
        />
      </aside>

      {/* 메인 콘텐츠 */}
      <div className="pt-14">
        <main className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:pl-60 lg:pr-6 pt-4 pb-6">
          <div className="max-w-6xl">
            {/* 페이지 헤더 */}
            <div className="sticky top-14 z-10 bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <SparklesIcon className="h-5 w-5 text-white" />
                  </div>
                  <h1 className="text-lg sm:text-xl font-bold text-white">마케팅 자동화</h1>
                </div>
              </div>
            </div>

            {/* 서브 탭 + 새 글 작성 버튼 */}
            <div className="bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between">
              <nav className="flex gap-1 -mb-px">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); setShowNewPost(false) }}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      !showNewPost && activeTab === tab.id
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}
              </nav>
              <button
                onClick={() => setShowNewPost(true)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-colors text-sm font-medium ${
                  showNewPost
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                }`}
              >
                <PencilSquareIcon className="h-4 w-4" />
                <span className="hidden sm:inline">새 글 작성</span>
              </button>
            </div>

            {showNewPost ? (
              /* 새 글 작성 폼 (인라인) */
              <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-4 sm:p-6">
                <NewPostForm
                  onClose={() => setShowNewPost(false)}
                  onComplete={() => {
                    setShowNewPost(false)
                    setActiveTab('posts')
                  }}
                />
              </div>
            ) : (
              <>

                {/* 콘텐츠 */}
                <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-4 sm:p-6">
                  {activeTab === 'dashboard' && <DashboardContent />}
                  {activeTab === 'posts' && <PostsContent />}
                  {activeTab === 'calendar' && <CalendarContent />}
                  {activeTab === 'settings' && <SettingsContent />}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// ─── 대시보드 ───
function DashboardContent() {
  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
          <div className="text-sm text-slate-500 mb-1">이번 주 발행</div>
          <div className="text-2xl font-bold text-slate-800">0 / 5건</div>
        </div>
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
          <div className="text-sm text-slate-500 mb-1">승인 대기</div>
          <div className="text-2xl font-bold text-amber-600">0건</div>
        </div>
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
          <div className="text-sm text-slate-500 mb-1">발행 실패</div>
          <div className="text-2xl font-bold text-red-600">0건</div>
        </div>
      </div>

      {/* 안내 */}
      <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-6">
        <h3 className="text-lg font-semibold text-indigo-800 mb-2">마케팅 자동화 시스템</h3>
        <p className="text-sm text-indigo-600">
          AI가 네이버 블로그, 인스타그램, 페이스북, 쓰레드에 자동으로 콘텐츠를 생성하고 발행합니다.
          &apos;설정&apos; 탭에서 플랫폼을 연동하고, &apos;새 글 작성&apos;으로 시작하세요.
        </p>
      </div>
    </div>
  )
}

// ─── 글 관리 ───

const STATUS_LABELS: Record<CalendarItemStatus, { label: string; color: string }> = {
  proposed: { label: '제안됨', color: 'bg-slate-100 text-slate-600' },
  approved: { label: '승인됨', color: 'bg-blue-50 text-blue-600' },
  rejected: { label: '반려', color: 'bg-red-50 text-red-600' },
  modified: { label: '수정됨', color: 'bg-amber-50 text-amber-600' },
  generating: { label: '생성 중', color: 'bg-purple-50 text-purple-600' },
  review: { label: '검토 대기', color: 'bg-indigo-50 text-indigo-600' },
  scheduled: { label: '예약됨', color: 'bg-cyan-50 text-cyan-600' },
  publishing: { label: '발행 중', color: 'bg-yellow-50 text-yellow-700' },
  published: { label: '발행 완료', color: 'bg-green-50 text-green-600' },
  failed: { label: '실패', color: 'bg-red-50 text-red-600' },
}

const POST_TYPE_BADGE: Record<PostType, { label: string; color: string }> = {
  informational: { label: '정보', color: 'bg-blue-50 text-blue-600' },
  promotional: { label: '홍보', color: 'bg-orange-50 text-orange-600' },
  notice: { label: '공지', color: 'bg-slate-100 text-slate-600' },
  clinical: { label: '임상', color: 'bg-emerald-50 text-emerald-600' },
}

function PostsContent() {
  const [posts, setPosts] = useState<ContentCalendarItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<ContentCalendarItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  const loadPosts = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/posts?limit=50')
      const json = await res.json()
      if (res.ok) {
        setPosts(json.data || [])
      }
    } catch {
      console.error('글 목록 로딩 실패')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPosts()
  }, [loadPosts])

  const handleDelete = async (id: string) => {
    if (!confirm('이 글을 삭제하시겠습니까?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/marketing/posts/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== id))
        if (selectedPost?.id === id) setSelectedPost(null)
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next })
      }
    } catch {
      console.error('삭제 실패')
    } finally {
      setDeletingId(null)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`선택한 ${selectedIds.size}개의 글을 삭제하시겠습니까?`)) return
    setIsBulkDeleting(true)
    const idsToDelete = Array.from(selectedIds)
    const failed: string[] = []
    for (const id of idsToDelete) {
      try {
        const res = await fetch(`/api/marketing/posts/${id}`, { method: 'DELETE' })
        if (!res.ok) failed.push(id)
      } catch {
        failed.push(id)
      }
    }
    setPosts((prev) => prev.filter((p) => failed.includes(p.id) || !selectedIds.has(p.id)))
    if (selectedPost && selectedIds.has(selectedPost.id) && !failed.includes(selectedPost.id)) {
      setSelectedPost(null)
    }
    setSelectedIds(new Set(failed))
    setIsBulkDeleting(false)
    if (failed.length > 0) {
      alert(`${failed.length}개의 글 삭제에 실패했습니다.`)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === posts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(posts.map((p) => p.id)))
    }
  }

  const parseContent = (item: ContentCalendarItem): (GeneratedContent & { generatedImages?: { fileName: string; prompt: string; path?: string }[] }) | null => {
    if (!item.generated_content) return null
    try {
      return typeof item.generated_content === 'string'
        ? JSON.parse(item.generated_content)
        : item.generated_content as unknown as GeneratedContent
    } catch {
      return null
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="h-6 w-6 text-slate-400 animate-spin" />
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <DocumentTextIcon className="h-12 w-12 mx-auto mb-3" />
        <p className="text-lg font-medium">아직 작성된 글이 없습니다</p>
        <p className="text-sm mt-1">&apos;새 글 작성&apos; 버튼을 눌러 첫 글을 만들어보세요</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={posts.length > 0 && selectedIds.size === posts.length}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-500">전체 선택</span>
          </label>
          <h2 className="text-lg font-semibold text-slate-800">생성된 글 ({posts.length})</h2>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <TrashIcon className="h-4 w-4" />
              {isBulkDeleting ? '삭제 중...' : `선택 삭제 (${selectedIds.size})`}
            </button>
          )}
          <button
            onClick={() => { setIsLoading(true); loadPosts() }}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowPathIcon className="h-4 w-4" />
            새로고침
          </button>
        </div>
      </div>

      {/* 글 목록 */}
      <div className="space-y-3">
        {posts.map((post) => {
          const content = parseContent(post)
          const statusInfo = STATUS_LABELS[post.status] || STATUS_LABELS.review
          const typeInfo = POST_TYPE_BADGE[post.post_type] || POST_TYPE_BADGE.informational

          return (
            <div
              key={post.id}
              className={`bg-slate-50 rounded-xl border p-4 transition-colors ${
                selectedIds.has(post.id) ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* 체크박스 */}
                  <input
                    type="checkbox"
                    checked={selectedIds.has(post.id)}
                    onChange={() => toggleSelect(post.id)}
                    className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 flex-shrink-0 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                  {/* 제목 - 클릭하면 편집 모달 열기 */}
                  <h3
                    className="font-medium text-slate-800 truncate cursor-pointer hover:text-blue-600 transition-colors"
                    onClick={() => setSelectedPost(post)}
                    title="클릭하여 보기/수정"
                  >{post.title || '(제목 없음)'}</h3>

                  {/* 메타 정보 */}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                    <span className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                    {post.keyword && (
                      <span className="text-xs text-slate-400">#{post.keyword}</span>
                    )}
                    <span className="text-xs text-slate-400">
                      {new Date(post.created_at).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    {content && (
                      <span className="text-xs text-slate-400">{content.wordCount}자</span>
                    )}
                  </div>

                  {/* 본문 미리보기 */}
                  {content?.body && (
                    <p className="text-sm text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                      {content.body.replace(/\[IMAGE:[^\]]*\]/g, '').replace(/#{1,3}\s/g, '').replace(/\*\*/g, '').slice(0, 150)}
                    </p>
                  )}
                  </div>
                </div>

                {/* 액션 버튼 */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setSelectedPost(post)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="상세보기"
                  >
                    <EyeIcon className="h-4.5 w-4.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(post.id)}
                    disabled={deletingId === post.id}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="삭제"
                  >
                    <TrashIcon className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 상세보기/편집 모달 */}
      {selectedPost && (
        <PostEditModal
          post={selectedPost}
          content={parseContent(selectedPost)}
          onClose={() => setSelectedPost(null)}
          onSaved={(updatedPost) => {
            setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p))
            setSelectedPost(null)
          }}
        />
      )}
    </div>
  )
}

// ─── 글 편집 모달 ───
function PostEditModal({
  post,
  content,
  onClose,
  onSaved,
}: {
  post: ContentCalendarItem
  content: (GeneratedContent & { generatedImages?: { fileName: string; prompt: string; path?: string }[] }) | null
  onClose: () => void
  onSaved: (updatedPost: ContentCalendarItem) => void
}) {
  const [editedTitle, setEditedTitle] = useState(post.title || content?.title || '')
  const [editedBody, setEditedBody] = useState(content?.body || '')
  const [editedHashtags, setEditedHashtags] = useState<string[]>(content?.hashtags || [])
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const statusInfo = STATUS_LABELS[post.status] || STATUS_LABELS.review
  const canPublish = content?.body && !['published', 'publishing'].includes(post.status)

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg(null)
    try {
      const updatedContent = {
        ...content,
        title: editedTitle,
        body: editedBody,
        hashtags: editedHashtags,
        wordCount: editedBody.length,
      }
      const res = await fetch(`/api/marketing/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editedTitle, generatedContent: updatedContent }),
      })
      if (!res.ok) throw new Error('저장 실패')
      const { data } = await res.json()
      setSaveMsg({ type: 'success', text: '저장되었습니다.' })
      setHasChanges(false)
      setTimeout(() => onSaved(data), 500)
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : '저장 실패' })
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async (targetDate: string, targetTime: string, isImmediate: boolean) => {
    setIsPublishing(true)
    setSaveMsg(null)
    try {
      const updatedContent = {
        ...content,
        title: editedTitle,
        body: editedBody,
        hashtags: editedHashtags,
        wordCount: editedBody.length,
      }
      const res = await fetch(`/api/marketing/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editedTitle,
          generatedContent: updatedContent,
          status: 'scheduled',
          publishDate: targetDate,
          publishTime: targetTime,
        }),
      })
      if (!res.ok) throw new Error('저장 실패')
      const { data } = await res.json()

      try {
        await fetch('/api/marketing/publish/trigger', { method: 'POST' })
      } catch { /* 워커 미실행 시 5분 내 자동 처리 */ }

      const msg = isImmediate
        ? '바로 발행이 시작됩니다!'
        : `${targetDate} ${targetTime}에 발행이 예약되었습니다.`
      setSaveMsg({ type: 'success', text: msg })
      setHasChanges(false)
      setTimeout(() => onSaved(data), 1000)
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : '발행 실패' })
    } finally {
      setIsPublishing(false)
    }
  }

  const handlePublishNow = () => {
    const today = new Date().toISOString().split('T')[0]
    const now = new Date().toTimeString().slice(0, 5)
    handlePublish(today, now, true)
  }

  const handleScheduleConfirm = (date: string, time: string) => {
    setShowScheduleModal(false)
    handlePublish(date, time, false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-lg font-semibold text-slate-800">글 편집</h3>
            <span className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full flex-shrink-0 ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            {hasChanges && (
              <span className="inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full bg-amber-50 text-amber-600">
                미저장
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 저장 메시지 */}
        {saveMsg && (
          <div className={`mx-6 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
            saveMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {saveMsg.type === 'success' ? <CheckCircleIcon className="h-4 w-4" /> : <ExclamationTriangleIcon className="h-4 w-4" />}
            {saveMsg.text}
          </div>
        )}

        {/* 모달 본문 */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* 메타 정보 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: '키워드', value: post.keyword || '-' },
              { label: '유형', value: POST_TYPE_BADGE[post.post_type]?.label || post.post_type },
              { label: '생성일', value: new Date(post.created_at).toLocaleDateString('ko-KR') },
              { label: '글자수', value: `${editedBody.length}자` },
            ].map((item) => (
              <div key={item.label} className="bg-slate-50 rounded-lg px-3 py-2">
                <div className="text-[11px] text-slate-400 mb-0.5">{item.label}</div>
                <div className="text-sm font-medium text-slate-700">{item.value}</div>
              </div>
            ))}
          </div>

          {/* 제목 */}
          <div>
            <label className="block text-sm font-medium text-slate-500 mb-1.5">제목</label>
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => { setEditedTitle(e.target.value); setHasChanges(true) }}
              className="w-full text-lg font-bold text-slate-800 border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50/50"
            />
          </div>

          {/* 본문 - WYSIWYG 에디터 */}
          {content?.body ? (
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">본문</label>
              <ContentEditor
                body={editedBody}
                images={content.generatedImages}
                onChange={(newBody) => { setEditedBody(newBody); setHasChanges(true) }}
              />
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <DocumentTextIcon className="h-10 w-10 mx-auto mb-2" />
              <p className="text-sm">생성된 콘텐츠가 없습니다</p>
            </div>
          )}

          {/* 해시태그 */}
          {editedHashtags.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">해시태그</label>
              <div className="flex flex-wrap gap-2 items-center">
                {editedHashtags.map((tag, i) => (
                  <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs rounded-full font-medium">
                    #{tag}
                    <button
                      onClick={() => {
                        setEditedHashtags(prev => prev.filter((_, idx) => idx !== i))
                        setHasChanges(true)
                      }}
                      className="text-indigo-400 hover:text-indigo-600"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 발행 액션 */}
          {canPublish && (
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex gap-3">
                <button
                  onClick={handlePublishNow}
                  disabled={isPublishing || saving}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
                >
                  {isPublishing ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <CheckCircleIcon className="h-4 w-4" />
                  )}
                  바로 발행
                </button>
                <button
                  onClick={() => setShowScheduleModal(true)}
                  disabled={isPublishing || saving}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
                >
                  <CalendarDaysIcon className="h-4 w-4" />
                  예약 발행
                </button>
              </div>

              <ScheduleModal
                isOpen={showScheduleModal}
                onClose={() => setShowScheduleModal(false)}
                onConfirm={handleScheduleConfirm}
                isLoading={isPublishing}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 본문 렌더러 (간소화) ───
function PostBodyRenderer({
  body,
  images,
}: {
  body: string
  images?: { fileName: string; prompt: string; path?: string }[]
}) {
  const lines = body.split('\n')
  const elements: React.ReactNode[] = []
  let paragraphBuffer: string[] = []
  let key = 0
  let fallbackIndex = 0
  const usedImageIndices = new Set<number>()

  const findImage = (prompt: string) => {
    if (!images || images.length === 0) return undefined
    const exactIdx = images.findIndex((img, i) => !usedImageIndices.has(i) && img.prompt === prompt)
    if (exactIdx >= 0) { usedImageIndices.add(exactIdx); return images[exactIdx] }
    while (fallbackIndex < images.length && usedImageIndices.has(fallbackIndex)) fallbackIndex++
    if (fallbackIndex < images.length) { usedImageIndices.add(fallbackIndex); return images[fallbackIndex++] }
    return undefined
  }

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      const text = paragraphBuffer.join('\n').trim()
      if (text) {
        elements.push(
          <p key={key++} className="text-sm leading-7 text-slate-700 mb-3">
            {renderBold(text)}
          </p>
        )
      }
      paragraphBuffer = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (/\[IMAGE:\s*.+?\]/.test(trimmed)) {
      flushParagraph()
      const match = trimmed.match(/\[IMAGE:\s*(.+?)\]/)
      const prompt = match ? match[1] : ''
      const img = findImage(prompt)
      if (img?.path) {
        elements.push(
          <div key={key++} className="my-3">
            <img src={img.path} alt={img.prompt || prompt} className="w-full rounded-lg border border-slate-200" />
          </div>
        )
      }
      continue
    }
    if (trimmed.startsWith('## ')) {
      flushParagraph()
      elements.push(<h3 key={key++} className="text-base font-bold text-slate-800 mt-5 mb-2">{trimmed.replace(/^##\s+/, '')}</h3>)
      continue
    }
    if (trimmed.startsWith('### ')) {
      flushParagraph()
      elements.push(<h4 key={key++} className="text-sm font-semibold text-slate-800 mt-4 mb-1.5">{trimmed.replace(/^###\s+/, '')}</h4>)
      continue
    }
    if (!trimmed) { flushParagraph(); continue }
    paragraphBuffer.push(line)
  }
  flushParagraph()

  return <div>{elements}</div>
}

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>
    }
    return part
  })
}

// ─── 캘린더 ───
function CalendarContent() {
  return (
    <div className="text-center py-12 text-slate-400">
      <CalendarDaysIcon className="h-12 w-12 mx-auto mb-3" />
      <p className="text-lg font-medium">콘텐츠 캘린더</p>
      <p className="text-sm mt-1">Phase 3에서 구현 예정</p>
    </div>
  )
}

// ─── 플랫폼 설정 필드 정의 ───
type PlatformId = 'naverBlog' | 'instagram' | 'facebook' | 'threads'

interface PlatformDef {
  id: PlatformId
  name: string
  fields: { key: string; label: string; type: 'text' | 'password' | 'textarea'; placeholder: string }[]
}

const PLATFORM_DEFS: PlatformDef[] = [
  {
    id: 'naverBlog',
    name: '네이버 블로그',
    fields: [
      { key: 'naverId', label: '네이버 아이디', type: 'text', placeholder: '네이버 로그인 아이디' },
      { key: 'naverPassword', label: '네이버 비밀번호', type: 'password', placeholder: '네이버 로그인 비밀번호' },
      { key: 'blogId', label: '블로그 ID (선택)', type: 'text', placeholder: '미입력 시 아이디와 동일' },
    ],
  },
  {
    id: 'instagram',
    name: '인스타그램',
    fields: [
      { key: 'accountId', label: '계정 ID', type: 'text', placeholder: '@your_account' },
      { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'Meta Business Suite에서 발급' },
    ],
  },
  {
    id: 'facebook',
    name: '페이스북',
    fields: [
      { key: 'pageId', label: '페이지 ID', type: 'text', placeholder: '페이지 ID' },
      { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'Meta Business Suite에서 발급' },
    ],
  },
  {
    id: 'threads',
    name: '쓰레드',
    fields: [
      { key: 'accountId', label: '계정 ID', type: 'text', placeholder: '@your_account' },
      { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'Meta에서 발급' },
    ],
  },
]

interface PlatformSetting {
  platform: string
  enabled: boolean
  config: Record<string, string>
}

// ─── 설정 ───
function SettingsContent() {
  const [settings, setSettings] = useState<PlatformSetting[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingPlatform, setEditingPlatform] = useState<PlatformId | null>(null)
  const [editConfig, setEditConfig] = useState<Record<string, string>>({})
  const [editEnabled, setEditEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/settings')
      const json = await res.json()
      if (res.ok) {
        setSettings(json.data || [])
      }
    } catch {
      console.error('설정 로딩 실패')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const getSettingFor = (platformId: string): PlatformSetting | undefined => {
    return settings.find((s) => s.platform === platformId)
  }

  const handleOpenEdit = (platform: PlatformDef) => {
    const existing = getSettingFor(platform.id)
    setEditingPlatform(platform.id)
    setEditEnabled(existing?.enabled ?? false)
    setEditConfig(existing?.config ?? {})
    setMessage(null)
  }

  const handleSave = async () => {
    if (!editingPlatform) return
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/marketing/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: editingPlatform,
          enabled: editEnabled,
          config: editConfig,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setMessage({ type: 'success', text: '저장되었습니다.' })
      await loadSettings()
      setTimeout(() => setEditingPlatform(null), 800)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '저장 실패' })
    } finally {
      setSaving(false)
    }
  }

  const editingDef = PLATFORM_DEFS.find((p) => p.id === editingPlatform)

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">플랫폼 연동 설정</h2>

      {isLoading ? (
        <div className="text-center py-8 text-slate-400 text-sm">로딩 중...</div>
      ) : (
        PLATFORM_DEFS.map((platform) => {
          const setting = getSettingFor(platform.id)
          const isConnected = setting?.enabled
          const hasConfig = setting && Object.keys(setting.config || {}).length > 0

          return (
            <div key={platform.id} className="bg-slate-50 rounded-xl border border-slate-200 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-slate-300'}`} />
                <div>
                  <div className="font-medium text-slate-800">{platform.name}</div>
                  <div className={`text-sm ${isConnected ? 'text-green-600' : hasConfig ? 'text-amber-500' : 'text-slate-400'}`}>
                    {isConnected ? '연동됨' : hasConfig ? '비활성' : '미연동'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleOpenEdit(platform)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-white transition-colors"
              >
                설정
              </button>
            </div>
          )
        })
      )}

      {/* 설정 모달 */}
      {editingPlatform && editingDef && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingPlatform(null)}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">{editingDef.name} 설정</h3>
              <button onClick={() => setEditingPlatform(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="px-6 py-5 space-y-4">
              {/* 활성화 토글 */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">플랫폼 활성화</span>
                <button
                  onClick={() => setEditEnabled(!editEnabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${editEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${editEnabled ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              {/* 플랫폼별 설정 필드 */}
              {editingDef.fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={editConfig[field.key] || ''}
                      onChange={(e) => setEditConfig({ ...editConfig, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={editConfig[field.key] || ''}
                      onChange={(e) => setEditConfig({ ...editConfig, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  )}
                </div>
              ))}

              {/* 메시지 */}
              {message && (
                <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
                  message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {message.type === 'success' ? <CheckCircleIcon className="h-4 w-4" /> : <ExclamationTriangleIcon className="h-4 w-4" />}
                  {message.text}
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
              <button
                onClick={() => setEditingPlatform(null)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
