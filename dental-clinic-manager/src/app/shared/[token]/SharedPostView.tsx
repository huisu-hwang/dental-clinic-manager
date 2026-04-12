'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Lock, FileText, Download, Calendar, AlertCircle, Eye,
  Home, Clock, BarChart3, MessageCircle, Megaphone, BookOpen, HelpCircle,
  LogIn, Heart, Bookmark, Share2, Check, ChevronRight,
} from 'lucide-react'
import type { SharedPostData } from '@/types/sharedLink'
import { SOURCE_TYPE_LABELS } from '@/types/sharedLink'
import { sanitizeHtml } from '@/utils/sanitize'

interface SharedPostViewProps {
  loginRequired?: boolean
  postData?: SharedPostData
}

// 서비스 사이드바 메뉴 (공유 페이지 전용)
const SIDEBAR_MENUS = [
  { icon: Home, label: '대시보드', id: 'home' },
  { icon: Clock, label: '근태관리', id: 'attendance' },
  { icon: BarChart3, label: '통계', id: 'stats' },
  { icon: Megaphone, label: '병원 게시판', id: 'bulletin' },
  { icon: MessageCircle, label: '자유게시판', id: 'community' },
  { icon: BookOpen, label: '진료 프로토콜', id: 'protocols' },
  { icon: FileText, label: '문서 양식', id: 'documents' },
  { icon: HelpCircle, label: '사용 안내', id: 'guide' },
]

export default function SharedPostView({ loginRequired, postData }: SharedPostViewProps) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (navigator.share) {
      try {
        await navigator.share({ title: postData?.title || '공유 게시물', url })
        return
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = url
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleLoginRequired = () => setShowLoginModal(true)

  // 현재 게시물 타입에 맞는 사이드바 활성 메뉴
  const getActiveMenuId = () => {
    if (!postData) return ''
    switch (postData.source_type) {
      case 'announcement': return 'bulletin'
      case 'document': return 'bulletin'
      case 'community_post': return 'community'
      default: return ''
    }
  }

  // 게시물 타입별 헤더 정보
  const getHeaderInfo = () => {
    if (!postData) return { icon: Megaphone, title: '게시판', subtitle: 'Board', color: 'from-blue-600 to-blue-700' }
    switch (postData.source_type) {
      case 'announcement':
        return { icon: Megaphone, title: '병원 게시판', subtitle: 'Hospital Bulletin Board', color: 'from-blue-600 to-blue-700' }
      case 'document':
        return { icon: FileText, title: '병원 게시판', subtitle: 'Hospital Bulletin Board', color: 'from-blue-600 to-blue-700' }
      case 'community_post':
        return { icon: MessageCircle, title: '자유게시판', subtitle: 'Free Board', color: 'from-blue-600 to-blue-700' }
      default:
        return { icon: Megaphone, title: '게시판', subtitle: 'Board', color: 'from-blue-600 to-blue-700' }
    }
  }

  const activeMenuId = getActiveMenuId()
  const headerInfo = getHeaderInfo()
  const HeaderIcon = headerInfo.icon

  // 로그인 필요 화면 (authenticated 링크 + 비로그인)
  if (loginRequired) {
    return (
      <div className="min-h-screen bg-at-surface-alt">
        {/* Header */}
        <div className="fixed top-0 left-0 right-0 z-30 h-14 bg-white border-b border-at-border">
          <div className="max-w-[1400px] mx-auto h-full px-3 sm:px-6 flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/')}>
              <div className="w-8 h-8 bg-at-accent rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">H</span>
              </div>
              <span className="font-bold text-at-text hidden sm:inline">하얀치과 대시보드</span>
            </div>
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 px-4 py-2 bg-at-accent hover:bg-at-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
            >
              <LogIn className="w-4 h-4" />
              로그인
            </button>
          </div>
        </div>

        <div className="pt-14 flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-xl font-bold text-white">로그인이 필요합니다</h1>
              <p className="text-blue-100 mt-2 text-sm">
                이 게시물은 서비스 가입자만 볼 수 있습니다.
              </p>
            </div>
            <div className="px-8 py-6 space-y-3">
              <a
                href="/"
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-at-accent text-white font-medium rounded-lg hover:bg-at-accent-hover transition-colors text-sm"
              >
                <LogIn className="w-4 h-4" />
                로그인하기
              </a>
              <a
                href="/signup"
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-white text-at-text-secondary font-medium rounded-lg border border-at-border hover:bg-at-surface-alt transition-colors text-sm"
              >
                회원가입
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!postData) return null

  return (
    <div className="min-h-screen bg-at-surface-alt">
      {/* ===== Header (전체 서비스 화면) ===== */}
      <div className="fixed top-0 left-0 right-0 z-30 h-14 bg-white border-b border-at-border">
        <div className="max-w-[1400px] mx-auto h-full px-3 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/')}>
              <div className="w-8 h-8 bg-at-accent rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">H</span>
              </div>
              <span className="font-bold text-at-text hidden sm:inline">하얀치과 대시보드</span>
            </div>
            <span className="text-at-text-weak hidden sm:inline">|</span>
            <span className="text-xs text-at-text-weak hidden sm:inline">
              공유된 {SOURCE_TYPE_LABELS[postData.source_type]}
            </span>
          </div>
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 px-4 py-2 bg-at-accent hover:bg-at-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
          >
            <LogIn className="w-4 h-4" />
            <span className="hidden sm:inline">로그인</span>
          </button>
        </div>
      </div>

      {/* ===== Sidebar (데스크톱) ===== */}
      <aside className="fixed top-14 w-56 h-[calc(100vh-3.5rem)] bg-white border-r border-at-border z-20 overflow-y-auto py-3 px-3 hidden lg:block lg:left-[max(0px,calc(50%-700px))]">
        <nav className="space-y-0.5">
          {SIDEBAR_MENUS.map((menu) => {
            const Icon = menu.icon
            const isActive = menu.id === activeMenuId
            return (
              <button
                key={menu.id}
                onClick={handleLoginRequired}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-at-accent-light text-at-accent font-semibold'
                    : 'text-at-text-secondary hover:bg-at-surface-alt hover:text-at-text'
                }`}
              >
                <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-at-accent' : 'text-at-text-weak'}`} />
                <span className="truncate">{menu.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-at-accent" />}
              </button>
            )
          })}
        </nav>

        {/* 사이드바 하단 CTA */}
        <div className="mt-6 mx-1 p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-at-border">
          <p className="text-xs font-medium text-at-text-secondary mb-2">
            다양한 기능을 이용해보세요
          </p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-1.5 text-xs font-medium text-at-accent bg-white border border-at-border rounded-lg hover:bg-at-accent-light transition-colors"
          >
            로그인하기
          </button>
        </div>
      </aside>

      {/* ===== Main Content ===== */}
      <div className="pt-14">
        <main className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:pl-60 lg:pr-6 pt-4 pb-6">
          <div className="max-w-4xl">
            {/* 블루 그라데이션 헤더 (게시판 타입별) */}
            <div className={`sticky top-14 z-10 bg-gradient-to-r ${headerInfo.color} px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm`}>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <HeaderIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">{headerInfo.title}</h2>
                  <p className="text-blue-100 text-xs sm:text-sm hidden sm:block">{headerInfo.subtitle}</p>
                </div>
              </div>
            </div>

            {/* 서브 탭 (공지사항 타입일 때) */}
            {(postData.source_type === 'announcement' || postData.source_type === 'document') && (
              <div className="sticky top-[calc(3.5rem+52px)] sm:top-[calc(3.5rem+72px)] z-10 border-x border-b border-at-border bg-at-surface-alt">
                <nav className="flex space-x-1 p-1.5 sm:p-2">
                  <button className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm ${
                    postData.source_type === 'announcement' ? 'bg-white text-at-accent shadow-sm' : 'text-at-text-weak'
                  }`}>
                    <Megaphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                    공지사항
                  </button>
                  <button onClick={handleLoginRequired} className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm ${
                    postData.source_type === 'document' ? 'bg-white text-at-accent shadow-sm' : 'text-at-text-weak hover:text-at-text-secondary hover:bg-white/50'
                  }`}>
                    문서 모음
                  </button>
                  <button onClick={handleLoginRequired} className="py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm text-at-text-weak hover:text-at-text-secondary hover:bg-white/50">
                    업무 관리
                  </button>
                </nav>
              </div>
            )}

            {/* 게시글 콘텐츠 영역 */}
            <div className="bg-white border-x border-b border-at-border rounded-b-xl p-3 sm:p-6">
              <div className="space-y-4">
                {/* 게시글 카드 */}
                <div className="bg-white rounded-xl border border-at-border overflow-hidden">
                  <div className="p-4 sm:p-6 border-b border-at-border">
                    {/* 카테고리 뱃지 */}
                    {postData.source_type === 'announcement' && (
                      <div className="flex items-center gap-2 mb-3">
                        {postData.category && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            postData.category === 'schedule' ? 'bg-at-tag text-at-accent' :
                            postData.category === 'holiday' ? 'bg-at-error-bg text-at-error' :
                            'bg-at-surface-alt text-at-text-secondary'
                          }`}>
                            {postData.category === 'schedule' ? '일정' : postData.category === 'holiday' ? '휴진/연휴' : '일반 공지'}
                          </span>
                        )}
                        {postData.is_important && (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-at-error-bg text-at-error">
                            <AlertCircle className="w-3 h-3" />중요
                          </span>
                        )}
                      </div>
                    )}

                    {postData.source_type === 'community_post' && postData.category && (
                      <div className="mb-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-at-tag text-at-accent">
                          {postData.category}
                        </span>
                      </div>
                    )}

                    {/* 제목 */}
                    <h1 className="text-xl font-bold text-at-text mb-4">{postData.title}</h1>

                    {/* 메타 정보 + 공유 버튼 */}
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-at-border">
                      <div className="flex items-center gap-3 text-xs text-at-text-weak">
                        {postData.source_type === 'community_post' ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                              {postData.author_name.charAt(0)}
                            </div>
                            <span className="text-sm font-medium text-at-text-secondary">{postData.author_name}</span>
                          </div>
                        ) : (
                          <span className="text-at-text-secondary font-medium">{postData.author_name}</span>
                        )}
                        <span>{formatDate(postData.created_at)}</span>
                      </div>
                      <button
                        onClick={handleShare}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${
                          copied
                            ? 'text-at-success bg-at-success-bg border-green-200'
                            : 'text-at-text-weak bg-white border-at-border hover:text-at-accent hover:bg-at-accent-light hover:border-at-border'
                        }`}
                      >
                        {copied ? <><Check className="w-3.5 h-3.5" />링크 복사됨</> : <><Share2 className="w-3.5 h-3.5" />공유</>}
                      </button>
                    </div>

                    {/* 공지사항 일정 정보 */}
                    {postData.start_date && (
                      <div className="mt-4 p-3 bg-at-accent-light rounded-lg">
                        <div className="flex items-center gap-2 text-at-accent">
                          <Calendar className="w-4 h-4" />
                          <span className="font-medium">일정</span>
                        </div>
                        <p className="mt-1 text-at-accent">
                          {postData.start_date}
                          {postData.end_date && postData.end_date !== postData.start_date && <> ~ {postData.end_date}</>}
                        </p>
                      </div>
                    )}

                    {/* 문서 설명 */}
                    {postData.description && (
                      <p className="mt-3 text-at-text-secondary text-sm">{postData.description}</p>
                    )}

                    {/* 문서 첨부파일 */}
                    {postData.file_name && postData.file_url && (
                      <div className="mt-4 p-3 bg-at-surface-alt rounded-lg">
                        <div className="flex items-center gap-2 text-at-text-secondary mb-2">
                          <FileText className="w-4 h-4" />
                          <span className="font-medium text-sm">첨부파일</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-at-text-secondary">{postData.file_name}</span>
                          {postData.file_size && (
                            <span className="text-xs text-at-text-weak">({formatFileSize(postData.file_size)})</span>
                          )}
                          <a
                            href={postData.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-at-accent hover:text-at-accent"
                          >
                            <Download className="w-3.5 h-3.5" />
                            다운로드
                          </a>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 본문 */}
                  <div className="p-4 sm:p-6">
                    <div
                      className="prose prose-sm max-w-none text-at-text-secondary whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(postData.content) }}
                    />
                  </div>

                  {/* 커뮤니티 게시글: 액션 버튼 (비활성) */}
                  {postData.source_type === 'community_post' && (
                    <div className="px-4 sm:px-6 pb-4">
                      <div className="flex items-center gap-2 py-3 border-t border-b border-at-border">
                        <button
                          onClick={handleLoginRequired}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-at-border text-at-text-weak hover:bg-at-surface-alt transition-colors"
                        >
                          <Heart className="w-4 h-4" />
                          좋아요
                        </button>
                        <button
                          onClick={handleLoginRequired}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-at-border text-at-text-weak hover:bg-at-surface-alt transition-colors"
                        >
                          <Bookmark className="w-4 h-4" />
                          스크랩
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 커뮤니티 게시글: 댓글 영역 (로그인 유도) */}
                  {postData.source_type === 'community_post' && (
                    <div className="border-t border-at-border p-4 sm:p-6 bg-at-surface-alt">
                      <h3 className="text-sm font-semibold text-at-text-secondary mb-3">댓글</h3>
                      <button
                        onClick={handleLoginRequired}
                        className="w-full py-3 px-4 text-sm text-at-text-weak bg-white border border-at-border rounded-lg hover:bg-at-surface-alt transition-colors text-left"
                      >
                        로그인 후 댓글을 작성할 수 있습니다.
                      </button>
                    </div>
                  )}
                </div>

                {/* 하단 CTA 배너 */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-at-border rounded-xl p-4 sm:p-6 text-center">
                  <p className="text-at-text-secondary font-medium mb-2">
                    하얀치과 대시보드에서 더 많은 소식을 확인하세요
                  </p>
                  <p className="text-at-text-weak text-sm mb-4">
                    근태관리, 게시판, 업무 체크리스트 등 다양한 기능을 이용할 수 있습니다.
                  </p>
                  <button
                    onClick={() => router.push('/')}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-at-accent hover:bg-at-accent-hover text-white font-medium rounded-lg transition-colors text-sm"
                  >
                    <LogIn className="w-4 h-4" />
                    로그인하여 시작하기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ===== 로그인 유도 모달 ===== */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
            <div className="relative bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 text-center">
              <button
                onClick={() => setShowLoginModal(false)}
                className="absolute top-3 right-3 text-white/70 hover:text-white transition-colors text-lg"
              >
                ✕
              </button>
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <LogIn className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white">로그인이 필요합니다</h3>
              <p className="text-blue-100 text-sm mt-1">해당 기능은 로그인 후 이용할 수 있습니다.</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-at-text-weak text-center">
                하얀치과 대시보드에서 더 많은 기능을 이용하세요.
              </p>
              <a
                href={`/?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')}`}
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-at-accent hover:bg-at-accent-hover text-white font-medium rounded-lg transition-colors text-sm"
              >
                <LogIn className="w-4 h-4" />
                로그인
              </a>
              <a
                href="/signup"
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-white hover:bg-at-surface-alt text-at-text-secondary font-medium rounded-lg border border-at-border transition-colors text-sm"
              >
                회원가입
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
