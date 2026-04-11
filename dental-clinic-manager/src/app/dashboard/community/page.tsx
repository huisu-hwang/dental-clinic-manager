'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Shield } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
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

type ViewMode = 'list' | 'detail' | 'form'

export default function CommunityPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

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

  const loadProfile = async (retryCount = 0) => {
    setProfileLoading(true)
    const { data, error } = await communityProfileService.getMyProfile()
    if (data) {
      setProfile(data)
      setShowNicknameSetup(false)
    } else if (!error) {
      // 에러 없이 data가 null → 프로필이 실제로 없음 → 닉네임 설정
      setShowNicknameSetup(true)
    } else if (retryCount < 2) {
      // 에러 발생 (세션/네트워크 등) → 재시도 (닉네임 모달 표시하지 않음)
      console.warn('[CommunityPage] loadProfile error, retrying...', error)
      setTimeout(() => loadProfile(retryCount + 1), 1000)
      return
    }
    // 재시도 초과 시에도 닉네임 모달은 표시하지 않음 (에러 상태)
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

  if (authLoading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-at-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-at-text-secondary">로딩 중...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  const isBanned = profile?.is_banned === true && (!profile.ban_until || new Date(profile.ban_until) > new Date())

  return (
    <>
      {/* 닉네임 설정 모달 */}
      {showNicknameSetup && <NicknameSetupModal onComplete={handleNicknameComplete} />}

      <div className="flex gap-6">
        {/* 메인 영역 */}
        <div className="flex-1 max-w-4xl">
          {/* 헤더 */}
          <div className="sticky top-14 z-10 bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">자유게시판</h2>
                  <p className="text-blue-100 text-xs sm:text-sm hidden sm:block">Free Board</p>
                </div>
              </div>
              {user?.role === 'master_admin' && (
                <button
                  onClick={() => router.push('/dashboard/community/admin')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">관리</span>
                </button>
              )}
            </div>
          </div>

          {/* 콘텐츠 영역 */}
          <div className="bg-white border-x border-b border-at-border rounded-b-xl p-3 sm:p-6">
            {/* 차단 알림 */}
            {isBanned && profile && <BanNotice profile={profile} />}

            {/* 뷰 전환 */}
            <div className="tab-content">
              {viewMode === 'list' && (
                <CommunityPostList
                  profileId={profile?.id || null}
                  isBanned={!!isBanned}
                  isLoggedIn={!!user}
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
    </>
  )
}
