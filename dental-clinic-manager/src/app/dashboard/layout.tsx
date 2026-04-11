'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import AccountProfile from '@/components/Management/AccountProfile'
import Toast from '@/components/ui/Toast'
import InstallBanner from '@/components/PWA/InstallBanner'
import FloatingSyncProgress from '@/components/Financial/FloatingSyncProgress'
import { HometaxSyncProvider } from '@/contexts/HometaxSyncContext'
import { useClinicNotifications } from '@/hooks/useClinicNotifications'
import { getTabRoute } from '@/utils/tabRouting'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, updateUser, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [showProfile, setShowProfile] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [toast, setToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'warning' | 'info'
  }>({ show: false, message: '', type: 'info' })

  // 활성 탭 상태 관리 (클릭 즉시 UI 반영을 위해 로컬 상태 사용)
  const getInitialTab = (): string => {
    if (pathname.startsWith('/dashboard/marketing')) return 'marketing'
    if (pathname.startsWith('/dashboard/contracts')) return 'contracts'
    if (pathname.startsWith('/dashboard/attendance')) return 'attendance'
    if (pathname.startsWith('/dashboard/bulletin')) return 'bulletin'
    if (pathname.startsWith('/dashboard/community/telegram')) return 'community-groups'
    if (pathname.startsWith('/dashboard/community')) return 'community-board'
    if (pathname.startsWith('/dashboard/financial')) return 'financial'
    return searchParams.get('tab') || 'home'
  }
  const [activeTab, setActiveTab] = useState<string>(getInitialTab)

  // 헤더 알림 가져오기
  const { notifications, dismissNotification } = useClinicNotifications({
    clinicId: user?.clinic_id,
    userId: user?.id,
    userRole: user?.role,
    enabled: !!user?.clinic_id
  })

  // 사용자 상태 체크 - 퇴사자, 승인대기, 거절된 사용자 리다이렉트
  useEffect(() => {
    if (!loading && user) {
      if (user.status === 'resigned') {
        console.log('[DashboardLayout] User is resigned, redirecting to /resigned')
        router.replace('/resigned')
        return
      }
      if (user.status === 'pending' || user.status === 'rejected') {
        console.log('[DashboardLayout] User is pending/rejected, redirecting to /pending-approval')
        router.replace('/pending-approval')
        return
      }
    }
  }, [user, loading, router])

  // 페이지 변경 시 모바일 메뉴 닫기 및 activeTab 동기화
  useEffect(() => {
    setIsMobileMenuOpen(false)
    setActiveTab(getInitialTab())
  }, [pathname, searchParams])

  // 모바일 메뉴가 열려 있을 때 스크롤 방지
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

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ show: true, message, type })
  }

  // 탭 변경 핸들러
  const handleTabChange = (tab: string) => {
    // 먼저 로컬 상태 업데이트 (즉시 UI 반영)
    setActiveTab(tab)

    // 중앙 집중식 라우팅 유틸리티 사용
    router.push(getTabRoute(tab))
  }

  // 퇴사자/승인대기/거절된 사용자는 대시보드를 렌더링하지 않음
  if (loading) {
    return (
      <div className="min-h-screen bg-at-surface-alt flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-at-accent"></div>
      </div>
    )
  }

  if (!user || user.status === 'resigned' || user.status === 'pending' || user.status === 'rejected') {
    return (
      <div className="min-h-screen bg-at-surface-alt flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-at-accent"></div>
      </div>
    )
  }

  return (
    <HometaxSyncProvider>
    <div className="min-h-screen bg-at-surface-alt">
      {/* Header - 상단 고정, 중앙 정렬 */}
      <div className="fixed top-0 left-0 right-0 z-30 h-14 bg-at-surface border-b border-at-border fixed-header-safe">
        <div className="max-w-[1400px] mx-auto h-full px-3 sm:px-6 flex items-center">
          <Header
            user={user}
            onLogout={logout}
            onProfileClick={() => setShowProfile(true)}
            onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            isMenuOpen={isMobileMenuOpen}
            notifications={notifications}
            onDismissNotification={dismissNotification}
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

      {/* 좌측 사이드바 - 모바일에서는 슬라이드 메뉴 */}
      <aside
        className={`
          fixed top-14 w-64 lg:w-52 h-[calc(100vh-3.5rem)] bg-at-surface border-r border-at-border z-20 overflow-y-auto py-3 px-2 fixed-sidebar-safe
          transition-transform duration-300 ease-in-out
          lg:left-[max(0px,calc(50%-700px))]
          ${isMobileMenuOpen ? 'translate-x-0 left-0' : '-translate-x-full left-0 lg:translate-x-0'}
        `}
      >
        <TabNavigation
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onItemClick={() => setIsMobileMenuOpen(false)}
          skipAutoRedirect={true}
        />
      </aside>

      {/* 메인 콘텐츠 */}
      <div className="pt-14 pt-header-safe">
        <main className="max-w-[1400px] mx-auto lg:pl-56 px-0">
          {children}
        </main>
      </div>

      {/* Profile Modal */}
      {showProfile && user && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4"
          onClick={() => setShowProfile(false)}
        >
          <div
            className="max-w-4xl w-full max-h-[90vh] overflow-y-auto rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <AccountProfile
              currentUser={user}
              onClose={() => setShowProfile(false)}
              onUpdate={(updatedUserData) => {
                updateUser(updatedUserData)
                setShowProfile(false)
                showToast('프로필이 성공적으로 업데이트되었습니다.', 'success')
              }}
            />
          </div>
        </div>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />

      <InstallBanner />
      <FloatingSyncProgress />
    </div>
    </HometaxSyncProvider>
  )
}
