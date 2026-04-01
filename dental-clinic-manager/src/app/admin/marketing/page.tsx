'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import {
  PencilSquareIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  DocumentTextIcon,
  SparklesIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
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
            <div className="sticky top-14 z-10 bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <SparklesIcon className="h-5 w-5 text-white" />
                </div>
                <h1 className="text-lg sm:text-xl font-bold text-white">마케팅 자동화</h1>
              </div>
            </div>

            {/* 서브 탭 */}
            <div className="bg-white border-b border-slate-200 px-4 sm:px-6">
              <nav className="flex gap-1 -mb-px">
                <button
                  onClick={() => router.push('/admin/marketing/posts/new')}
                  className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 border-transparent text-blue-600 hover:text-blue-700 hover:border-blue-300 transition-colors"
                >
                  <PencilSquareIcon className="h-4 w-4" />
                  AI 글쓰기
                </button>
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-600 text-blue-600'
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

// ─── 플랫폼 설정 필드 정의 ───
type PlatformId = 'naverBlog' | 'instagram' | 'facebook' | 'threads'

interface PlatformDef {
  id: PlatformId
  name: string
  fields: { key: string; label: string; type: 'text' | 'password' | 'textarea'; placeholder: string }[]
}

const PLATFORM_DEFS: PlatformDef[] = [
  {
    id: 'naverBlog',
    name: '네이버 블로그',
    fields: [
      { key: 'naverId', label: '네이버 아이디', type: 'text', placeholder: '네이버 로그인 아이디' },
      { key: 'naverPassword', label: '네이버 비밀번호', type: 'password', placeholder: '네이버 로그인 비밀번호' },
      { key: 'blogId', label: '블로그 ID (선택)', type: 'text', placeholder: '미입력 시 아이디와 동일' },
    ],
  },
  {
    id: 'instagram',
    name: '인스타그램',
    fields: [
      { key: 'accountId', label: '계정 ID', type: 'text', placeholder: '@your_account' },
      { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'Meta Business Suite에서 발급' },
    ],
  },
  {
    id: 'facebook',
    name: '페이스북',
    fields: [
      { key: 'pageId', label: '페이지 ID', type: 'text', placeholder: '페이지 ID' },
      { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'Meta Business Suite에서 발급' },
    ],
  },
  {
    id: 'threads',
    name: '쓰레드',
    fields: [
      { key: 'accountId', label: '계정 ID', type: 'text', placeholder: '@your_account' },
      { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'Meta에서 발급' },
    ],
  },
]

interface PlatformSetting {
  platform: string
  enabled: boolean
  config: Record<string, string>
}

// ─── 설정 ───
function SettingsContent() {
  const [settings, setSettings] = useState<PlatformSetting[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingPlatform, setEditingPlatform] = useState<PlatformId | null>(null)
  const [editConfig, setEditConfig] = useState<Record<string, string>>({})
  const [editEnabled, setEditEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/settings')
      const json = await res.json()
      if (res.ok) {
        setSettings(json.data || [])
      }
    } catch {
      console.error('설정 로딩 실패')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const getSettingFor = (platformId: string): PlatformSetting | undefined => {
    return settings.find((s) => s.platform === platformId)
  }

  const handleOpenEdit = (platform: PlatformDef) => {
    const existing = getSettingFor(platform.id)
    setEditingPlatform(platform.id)
    setEditEnabled(existing?.enabled ?? false)
    setEditConfig(existing?.config ?? {})
    setMessage(null)
  }

  const handleSave = async () => {
    if (!editingPlatform) return
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/marketing/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: editingPlatform,
          enabled: editEnabled,
          config: editConfig,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setMessage({ type: 'success', text: '저장되었습니다.' })
      await loadSettings()
      setTimeout(() => setEditingPlatform(null), 800)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '저장 실패' })
    } finally {
      setSaving(false)
    }
  }

  const editingDef = PLATFORM_DEFS.find((p) => p.id === editingPlatform)

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">플랫폼 연동 설정</h2>

      {isLoading ? (
        <div className="text-center py-8 text-slate-400 text-sm">로딩 중...</div>
      ) : (
        PLATFORM_DEFS.map((platform) => {
          const setting = getSettingFor(platform.id)
          const isConnected = setting?.enabled
          const hasConfig = setting && Object.keys(setting.config || {}).length > 0

          return (
            <div key={platform.id} className="bg-slate-50 rounded-xl border border-slate-200 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-slate-300'}`} />
                <div>
                  <div className="font-medium text-slate-800">{platform.name}</div>
                  <div className={`text-sm ${isConnected ? 'text-green-600' : hasConfig ? 'text-amber-500' : 'text-slate-400'}`}>
                    {isConnected ? '연동됨' : hasConfig ? '비활성' : '미연동'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleOpenEdit(platform)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-white transition-colors"
              >
                설정
              </button>
            </div>
          )
        })
      )}

      {/* 설정 모달 */}
      {editingPlatform && editingDef && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingPlatform(null)}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">{editingDef.name} 설정</h3>
              <button onClick={() => setEditingPlatform(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="px-6 py-5 space-y-4">
              {/* 활성화 토글 */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">플랫폼 활성화</span>
                <button
                  onClick={() => setEditEnabled(!editEnabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${editEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${editEnabled ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              {/* 플랫폼별 설정 필드 */}
              {editingDef.fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={editConfig[field.key] || ''}
                      onChange={(e) => setEditConfig({ ...editConfig, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={editConfig[field.key] || ''}
                      onChange={(e) => setEditConfig({ ...editConfig, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  )}
                </div>
              ))}

              {/* 메시지 */}
              {message && (
                <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
                  message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {message.type === 'success' ? <CheckCircleIcon className="h-4 w-4" /> : <ExclamationTriangleIcon className="h-4 w-4" />}
                  {message.text}
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
              <button
                onClick={() => setEditingPlatform(null)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
