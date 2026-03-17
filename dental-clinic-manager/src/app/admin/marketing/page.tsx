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

type MarketingTab = 'dashboard' | 'posts' | 'calendar' | 'settings'

export default function MarketingPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<MarketingTab>('dashboard')

  useEffect(() => {
    if (!user) {
      router.push('/auth')
    }
  }, [user, router])

  if (!user) return null

  const tabs = [
    { id: 'dashboard' as const, label: '대시보드', icon: ChartBarIcon },
    { id: 'posts' as const, label: '글 관리', icon: DocumentTextIcon },
    { id: 'calendar' as const, label: '캘린더', icon: CalendarDaysIcon },
    { id: 'settings' as const, label: '설정', icon: Cog6ToothIcon },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <SparklesIcon className="h-6 w-6 text-indigo-600" />
              <h1 className="text-xl font-bold text-slate-800">마케팅 자동화</h1>
            </div>
            <button
              onClick={() => router.push('/admin/marketing/posts/new')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
            >
              <PencilSquareIcon className="h-4 w-4" />
              새 글 작성
            </button>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1">
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
      </div>

      {/* 콘텐츠 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && <DashboardContent />}
        {activeTab === 'posts' && <PostsContent />}
        {activeTab === 'calendar' && <CalendarContent />}
        {activeTab === 'settings' && <SettingsContent />}
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
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-sm text-slate-500 mb-1">이번 주 발행</div>
          <div className="text-2xl font-bold text-slate-800">0 / 5건</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-sm text-slate-500 mb-1">승인 대기</div>
          <div className="text-2xl font-bold text-amber-600">0건</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
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

// ─── 글 관리 (Phase 1 기본) ───
function PostsContent() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="text-center py-12 text-slate-400">
        <DocumentTextIcon className="h-12 w-12 mx-auto mb-3" />
        <p className="text-lg font-medium">아직 작성된 글이 없습니다</p>
        <p className="text-sm mt-1">&apos;새 글 작성&apos; 버튼을 눌러 첫 글을 만들어보세요</p>
      </div>
    </div>
  )
}

// ─── 캘린더 (Phase 3에서 구현) ───
function CalendarContent() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="text-center py-12 text-slate-400">
        <CalendarDaysIcon className="h-12 w-12 mx-auto mb-3" />
        <p className="text-lg font-medium">콘텐츠 캘린더</p>
        <p className="text-sm mt-1">Phase 3에서 구현 예정</p>
      </div>
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
        <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between">
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
