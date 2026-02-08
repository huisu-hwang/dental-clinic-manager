'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import { communityProfileService } from '@/lib/communityService'
import type { CommunityProfile, CommunityPost } from '@/types/community'
import { useCommunityCategories } from '@/hooks/useCommunityCategories'
import NicknameSetupModal from '@/components/Community/NicknameSetupModal'
import CommunityPostList from '@/components/Community/CommunityPostList'
import CommunityPostDetail from '@/components/Community/CommunityPostDetail'
import CommunityPostForm from '@/components/Community/CommunityPostForm'
import PopularPostsSidebar from '@/components/Community/PopularPostsSidebar'
import ProfileCard from '@/components/Community/ProfileCard'
import BanNotice from '@/components/Community/BanNotice'
import { getTabRoute } from '@/utils/tabRouting'

type ViewMode = 'list' | 'detail' | 'form'

export default function CommunityPage() {
  const router = useRouter()
  const { user, logout, loading: authLoading } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // 동적 카테고리
  const { categories, labelMap, colorMap } = useCommunityCategories()

  // 커뮤니티 상태
  const [profile, setProfile] = useState<CommunityProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [showNicknameSetup, setShowNicknameSetup] = useState(false)

  // 뷰 상태
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null)

  // 프로필 로드
  useEffect(() => {
    if (!authLoading && user) {
      loadProfile()
    }
  }, [authLoading, user])

  const loadProfile = async () => {
    setProfileLoading(true)
    const { data } = await communityProfileService.getMyProfile()
    if (data) {
      setProfile(data)
    } else {
      setShowNicknameSetup(true)
    }
    setProfileLoading(false)
  }

  const handleNicknameComplete = () => {
    setShowNicknameSetup(false)
    loadProfile()
  }

  // 게시글 클릭
  const handlePostClick = (post: CommunityPost) => {
    setSelectedPostId(post.id)
    setViewMode('detail')
  }

  // 새 글 작성
  const handleNewPost = () => {
    setEditingPost(null)
    setViewMode('form')
  }

  // 글 수정
  const handleEditPost = (post: CommunityPost) => {
    setEditingPost(post)
    setViewMode('form')
  }

  // 작성/수정 완료
  const handleFormSubmit = () => {
    setViewMode('list')
    setEditingPost(null)
  }

  // 삭제 후
  const handlePostDeleted = () => {
    setViewMode('list')
    setSelectedPostId(null)
  }

  // 모바일 메뉴
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isMobileMenuOpen])

  // 메인 탭 네비게이션
  const handleMainTabChange = (tab: string) => {
    if (tab === 'community') return
    router.push(getTabRoute(tab))
  }

  // 인증 확인
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
    if (!authLoading && user) {
      if (user.status === 'resigned') {
        router.replace('/resigned')
        return
      }
      if (user.status === 'pending' || user.status === 'rejected') {
        router.replace('/pending-approval')
        return
      }
    }
  }, [authLoading, user, router])

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    )
  }

  if (!user || user.status === 'resigned' || user.status === 'pending' || user.status === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    )
  }

  const isBanned = profile?.is_banned === true && (!profile.ban_until || new Date(profile.ban_until) > new Date())

  return (
    <div className="min-h-screen bg-slate-100">
      {/* 닉네임 설정 모달 */}
      {showNicknameSetup && <NicknameSetupModal onComplete={handleNicknameComplete} />}

      {/* Header */}
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

      {/* 모바일 오버레이 */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />
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
          activeTab="community"
          onTabChange={handleMainTabChange}
          onItemClick={() => setIsMobileMenuOpen(false)}
          skipAutoRedirect={true}
        />
      </aside>

      {/* 메인 콘텐츠 */}
      <div className="pt-14">
        <main className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:pl-60 lg:pr-6 pt-4 pb-6">
          <div className="flex gap-6">
            {/* 메인 영역 */}
            <div className="flex-1 max-w-4xl">
              {/* 헤더 */}
              <div className="sticky top-14 z-10 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-white">커뮤니티</h2>
                      <p className="text-emerald-100 text-xs sm:text-sm hidden sm:block">Community Board</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 콘텐츠 영역 */}
              <div className="bg-white border-x border-b border-slate-200 rounded-b-xl p-3 sm:p-6">
                {/* 차단 알림 */}
                {isBanned && profile && <BanNotice profile={profile} />}

                {/* 뷰 전환 */}
                <div className="tab-content">
                  {viewMode === 'list' && (
                    <CommunityPostList
                      profileId={profile?.id || null}
                      isBanned={!!isBanned}
                      categories={categories}
                      labelMap={labelMap}
                      colorMap={colorMap}
                      onPostClick={handlePostClick}
                      onNewPost={handleNewPost}
                    />
                  )}
                  {viewMode === 'detail' && selectedPostId && (
                    <CommunityPostDetail
                      postId={selectedPostId}
                      myProfileId={profile?.id || null}
                      nickname={profile?.nickname || ''}
                      labelMap={labelMap}
                      colorMap={colorMap}
                      onBack={() => setViewMode('list')}
                      onEdit={handleEditPost}
                      onDeleted={handlePostDeleted}
                    />
                  )}
                  {viewMode === 'form' && profile && (
                    <CommunityPostForm
                      profileId={profile.id}
                      editingPost={editingPost}
                      categories={categories}
                      labelMap={labelMap}
                      onSubmit={handleFormSubmit}
                      onCancel={() => setViewMode('list')}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* 우측 사이드바 (데스크톱) */}
            <div className="hidden xl:block w-72 space-y-4">
              {profile && <ProfileCard profile={profile} />}
              <PopularPostsSidebar onPostClick={handlePostClick} labelMap={labelMap} />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
