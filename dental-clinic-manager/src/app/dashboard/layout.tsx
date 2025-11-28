'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import AccountProfile from '@/components/Management/AccountProfile'
import Toast from '@/components/ui/Toast'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, updateUser } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [showProfile, setShowProfile] = useState(false)
  const [toast, setToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'warning' | 'info'
  }>({ show: false, message: '', type: 'info' })

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
    } else if (tab === 'guide') {
      router.push('/dashboard?tab=guide')
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header - 상단 고정 */}
      <div className="fixed top-0 left-0 right-0 z-30 h-14 bg-white border-b border-slate-200">
        <div className="h-full px-4 flex items-center">
          <Header
            user={user}
            onLogout={logout}
            onProfileClick={() => setShowProfile(true)}
          />
        </div>
      </div>

      {/* 좌측 사이드바 - 고정 */}
      <aside className="fixed left-0 top-14 w-56 h-[calc(100vh-3.5rem)] bg-white border-r border-slate-200 z-20 overflow-y-auto py-2 px-2">
        <TabNavigation activeTab={getActiveTab()} onTabChange={handleTabChange} />
      </aside>

      {/* 메인 콘텐츠 - 헤더와 사이드바 공간 확보 */}
      <div className="ml-56 pt-14">
        <main className="p-4">{children}</main>
      </div>

      {/* Profile Modal */}
      {showProfile && user && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowProfile(false)}
        >
          <div
            className="max-w-4xl w-full max-h-[90vh] overflow-y-auto"
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
