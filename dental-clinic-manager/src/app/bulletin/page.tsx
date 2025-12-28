'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Megaphone,
  FolderOpen,
  ListTodo,
  Newspaper
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import AnnouncementList from '@/components/Bulletin/AnnouncementList'
import DocumentList from '@/components/Bulletin/DocumentList'
import TaskList from '@/components/Bulletin/TaskList'
import type { BulletinTab } from '@/types/bulletin'
import { getTabRoute } from '@/utils/tabRouting'

// 서브 탭 설정
const subTabs = [
  { id: 'announcements', label: '공지사항', icon: Megaphone },
  { id: 'documents', label: '문서 모음', icon: FolderOpen },
  { id: 'tasks', label: '업무 관리', icon: ListTodo },
] as const

export default function BulletinPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, logout, loading: authLoading } = useAuth()
  const [activeTab, setActiveTab] = useState<BulletinTab>('announcements')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // URL에서 탭 파라미터 읽기
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && ['announcements', 'documents', 'tasks'].includes(tab)) {
      setActiveTab(tab as BulletinTab)
    }
  }, [searchParams])

  // 탭 변경 시 URL 업데이트
  const handleTabChange = (tab: BulletinTab) => {
    setActiveTab(tab)
    router.push(`/bulletin?tab=${tab}`, { scroll: false })
  }

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

  // 메인 탭 네비게이션 핸들러
  const handleMainTabChange = (tab: string) => {
    if (tab === 'bulletin') return // Already on bulletin page
    router.push(getTabRoute(tab))
  }

  // 인증 확인 및 사용자 상태 체크
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
    // 퇴사자, 승인대기, 거절된 사용자 리다이렉트
    if (!authLoading && user) {
      if (user.status === 'resigned') {
        console.log('[BulletinPage] User is resigned, redirecting to /resigned')
        router.replace('/resigned')
        return
      }
      if (user.status === 'pending' || user.status === 'rejected') {
        console.log('[BulletinPage] User is pending/rejected, redirecting to /pending-approval')
        router.replace('/pending-approval')
        return
      }
    }
  }, [authLoading, user, router])

  // 관리자 권한 확인
  const isAdmin = !!(user?.role && ['master_admin', 'owner', 'vice_director', 'manager', 'team_leader'].includes(user.role))

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    )
  }

  // 권한 없는 사용자는 로딩 표시 (리다이렉트 대기)
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

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header - 상단 고정, 중앙 정렬 */}
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
          activeTab="bulletin"
          onTabChange={handleMainTabChange}
          onItemClick={() => setIsMobileMenuOpen(false)}
          skipAutoRedirect={true}
        />
      </aside>

      {/* 메인 콘텐츠 */}
      <div className="pt-14">
        <main className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:pl-60 lg:pr-6 pt-4 pb-6">
          <div className="max-w-6xl">
            {/* 블루 그라데이션 헤더 - 스크롤 시 고정 */}
            <div className="sticky top-14 z-10 bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <Newspaper className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-white">병원 게시판</h2>
                    <p className="text-blue-100 text-xs sm:text-sm hidden sm:block">Hospital Bulletin Board</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 서브 탭 네비게이션 - 스크롤 시 고정 */}
            <div className="sticky top-[calc(3.5rem+52px)] sm:top-[calc(3.5rem+72px)] z-10 border-x border-b border-slate-200 bg-slate-50">
              <nav className="flex space-x-1 p-1.5 sm:p-2 overflow-x-auto scrollbar-hide" aria-label="Tabs">
                {subTabs.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabChange(tab.id)}
                      className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
                        activeTab === tab.id
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                      {tab.label}
                    </button>
                  )
                })}
              </nav>
            </div>

            {/* 탭 콘텐츠 */}
            <div className="bg-white border-x border-b border-slate-200 rounded-b-xl p-3 sm:p-6">
              <div key={activeTab} className="tab-content">
                {activeTab === 'announcements' && (
                  <AnnouncementList canCreate={isAdmin} />
                )}
                {activeTab === 'documents' && (
                  <DocumentList canCreate={isAdmin} />
                )}
                {activeTab === 'tasks' && (
                  <TaskList canCreate={isAdmin} />
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
