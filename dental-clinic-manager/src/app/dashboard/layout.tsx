'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import AccountProfile from '@/components/Management/AccountProfile'
import Toast from '@/components/ui/Toast'
import { useClinicNotifications } from '@/hooks/useClinicNotifications'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, updateUser } = useAuth()
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

  // 헤더 알림 가져오기
  const { notifications, dismissNotification } = useClinicNotifications({
    clinicId: user?.clinic_id,
    userId: user?.id,
    userRole: user?.role,
    enabled: !!user?.clinic_id
  })

  // 페이지 변경 시 모바일 메뉴 닫기
  useEffect(() => {
    setIsMobileMenuOpen(false)
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

  // URL 기반 활성 탭 결정
  const getActiveTab = (): string => {
    // Contracts 페이지
    if (pathname.startsWith('/dashboard/contracts')) {
      return 'contracts'
    }

    // Attendance 페이지 (현재 /attendance)
    if (pathname.startsWith('/attendance')) {
      return 'attendance'
    }


    // Dashboard 페이지 내 쿼리 파라미터 기반 탭
    const tab = searchParams.get('tab')
    if (tab) {
      return tab
    }

    // 기본값: daily-input
    return 'daily-input'
  }

  // 탭 변경 핸들러
  const handleTabChange = (tab: string) => {
    if (tab === 'contracts') {
      router.push('/dashboard/contracts')
    } else if (tab === 'attendance') {
      router.push('/attendance')
    } else if (tab === 'leave') {
      router.push('/dashboard?tab=leave')
    } else if (tab === 'payroll') {
      router.push('/dashboard?tab=payroll')
    } else if (tab === 'settings') {
      router.push('/dashboard?tab=settings')
    } else if (tab === 'daily-input') {
      router.push('/dashboard')
    } else if (tab === 'stats') {
      router.push('/dashboard?tab=stats')
    } else if (tab === 'logs') {
      router.push('/dashboard?tab=logs')
    } else if (tab === 'protocols') {
      router.push('/dashboard?tab=protocols')
    } else if (tab === 'vendors') {
      router.push('/dashboard?tab=vendors')
    } else if (tab === 'guide') {
      router.push('/dashboard?tab=guide')
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header - 상단 고정, 중앙 정렬 */}
      <div className="fixed top-0 left-0 right-0 z-30 h-14 bg-white border-b border-slate-200">
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
          fixed top-14 w-64 lg:w-56 h-[calc(100vh-3.5rem)] bg-white border-r border-slate-200 z-20 overflow-y-auto py-3 px-3
          transition-transform duration-300 ease-in-out
          lg:left-[max(0px,calc(50%-700px))]
          ${isMobileMenuOpen ? 'translate-x-0 left-0' : '-translate-x-full left-0 lg:translate-x-0'}
        `}
      >
        <TabNavigation
          activeTab={getActiveTab()}
          onTabChange={handleTabChange}
          onItemClick={() => setIsMobileMenuOpen(false)}
        />
      </aside>

      {/* 메인 콘텐츠 */}
      <div className="pt-14">
        <main className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:pl-60 lg:pr-6 pt-4 pb-6">
          <div className="max-w-6xl">
            {children}
          </div>
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
    </div>
  )
}
