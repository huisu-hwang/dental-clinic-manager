'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import {
  PencilSquareIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  DocumentTextIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import { getTabRoute } from '@/utils/tabRouting'

type MarketingTab = 'dashboard' | 'posts' | 'calendar' | 'settings'

export default function MarketingPage() {
  const { user, logout, loading } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<MarketingTab>('dashboard')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

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
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <SparklesIcon className="h-5 w-5 text-white" />
                  </div>
                  <h1 className="text-lg sm:text-xl font-bold text-white">마케팅 자동화</h1>
                </div>
                <button
                  onClick={() => router.push('/admin/marketing/posts/new')}
                  className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  <PencilSquareIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">새 글 작성</span>
                </button>
              </div>
            </div>

            {/* 서브 탭 */}
            <div className="bg-white border-b border-slate-200 px-4 sm:px-6">
              <nav className="flex gap-1 -mb-px">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* 콘텐츠 */}
            <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-4 sm:p-6">
              {activeTab === 'dashboard' && <DashboardContent />}
              {activeTab === 'posts' && <PostsContent />}
              {activeTab === 'calendar' && <CalendarContent />}
              {activeTab === 'settings' && <SettingsContent />}
            </div>
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
function PostsContent() {
  return (
    <div className="text-center py-12 text-slate-400">
      <DocumentTextIcon className="h-12 w-12 mx-auto mb-3" />
      <p className="text-lg font-medium">아직 작성된 글이 없습니다</p>
      <p className="text-sm mt-1">&apos;새 글 작성&apos; 버튼을 눌러 첫 글을 만들어보세요</p>
    </div>
  )
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

// ─── 설정 ───
function SettingsContent() {
  const platforms = [
    { id: 'naverBlog', name: '네이버 블로그', status: '미연동', color: 'text-slate-400' },
    { id: 'instagram', name: '인스타그램', status: '미연동', color: 'text-slate-400' },
    { id: 'facebook', name: '페이스북', status: '미연동', color: 'text-slate-400' },
    { id: 'threads', name: '쓰레드', status: '미연동', color: 'text-slate-400' },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">플랫폼 연동 설정</h2>
      {platforms.map((p) => (
        <div key={p.id} className="bg-slate-50 rounded-xl border border-slate-200 p-5 flex items-center justify-between">
          <div>
            <div className="font-medium text-slate-800">{p.name}</div>
            <div className={`text-sm ${p.color}`}>{p.status}</div>
          </div>
          <button className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
            설정
          </button>
        </div>
      ))}
    </div>
  )
}
