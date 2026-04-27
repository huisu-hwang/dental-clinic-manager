'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Pencil } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { communityProfileService } from '@/lib/communityService'
import type { CommunityProfile, CommunityPost } from '@/types/community'
import { useCommunityCategories } from '@/hooks/useCommunityCategories'
import NicknameSetupModal from '@/components/Community/NicknameSetupModal'
import NicknameChangeModal from '@/components/Community/NicknameChangeModal'
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
  const [showNicknameChange, setShowNicknameChange] = useState(false)

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

  // 최초 진입 시(profile 미존재)에만 전체화면 스피너 노출.
  // 탭 복귀로 인한 Supabase TOKEN_REFRESHED → user 갱신 → loadProfile 재실행 시
  // 이미 profile이 있으면 화면을 유지하여 글쓰기 폼 등 입력 컴포넌트가 언마운트되지 않도록 함.
  if (authLoading || (profileLoading && !profile)) {
    return (
      <div className="p-4 sm:p-6 bg-white min-h-screen flex items-center justify-center">
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
    <div className="p-4 sm:p-6 bg-white min-h-screen">
      {/* 닉네임 설정 모달 */}
      {showNicknameSetup && <NicknameSetupModal onComplete={handleNicknameComplete} />}

      {/* 닉네임 변경 모달 */}
      {showNicknameChange && profile && (
        <NicknameChangeModal
          currentNickname={profile.nickname}
          onClose={() => setShowNicknameChange(false)}
          onComplete={(updated) => {
            setProfile(updated)
            setShowNicknameChange(false)
          }}
        />
      )}

      <div className="flex gap-6">
        {/* 메인 영역 */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-end gap-2 mb-4 xl:hidden">
            {profile && (
              <button
                onClick={() => setShowNicknameChange(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-at-surface-alt hover:bg-at-border text-at-text-secondary text-xs font-medium transition-colors"
                title="닉네임 변경"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span className="truncate max-w-[120px]">{profile.nickname}</span>
              </button>
            )}
            {user?.role === 'master_admin' && (
              <button
                onClick={() => router.push('/dashboard/community/admin')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-at-surface-alt hover:bg-at-border text-at-text-secondary text-xs font-medium transition-colors"
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">관리</span>
              </button>
            )}
          </div>

          {user?.role === 'master_admin' && (
            <div className="hidden xl:flex justify-end mb-4">
              <button
                onClick={() => router.push('/dashboard/community/admin')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-at-surface-alt hover:bg-at-border text-at-text-secondary text-xs font-medium transition-colors"
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">관리</span>
              </button>
            </div>
          )}

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

        {/* 우측 사이드바 (데스크톱) */}
        <div className="hidden xl:block w-72 space-y-4">
          {profile && (
            <ProfileCard
              profile={profile}
              onEditNickname={() => setShowNicknameChange(true)}
            />
          )}
          <PopularPostsSidebar onPostClick={handlePostClick} labelMap={labelMap} />
        </div>
      </div>
    </div>
  )
}
