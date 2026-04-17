'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Settings, Users, Building2, Building, BarChart3, Cog } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import StaffManagement from '@/components/Management/StaffManagement'
import BranchManagement from '@/components/Management/BranchManagement'
import ClinicSettings from '@/components/Management/ClinicSettings'
import AccountProfile from '@/components/Management/AccountProfile'
import MenuSettings from '@/components/Management/MenuSettings'
import Toast from '@/components/ui/Toast'
import { getTabRoute } from '@/utils/tabRouting'

// 서브 탭 설정 (연차 관리, 프로토콜 관리 제외)
const subTabs = [
  { id: 'menu',      label: '메뉴 설정',  icon: Cog,      permissions: [] },
  { id: 'staff',     label: '직원 관리',  icon: Users,     permissions: ['staff_view', 'staff_manage'] },
  { id: 'branches',  label: '지점 관리',  icon: Building2, permissions: ['clinic_settings'] },
  { id: 'clinic',    label: '병원 설정',  icon: Building,  permissions: ['clinic_settings'] },
  { id: 'analytics', label: '통계 분석',  icon: BarChart3, permissions: ['stats_monthly_view', 'stats_annual_view'] },
] as const

export default function ManagementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, logout, updateUser, loading: authLoading } = useAuth()
  const { hasPermission, permissions } = usePermissions()

  // URL 파라미터에서 탭 정보 읽기 (연차 승인 알림 클릭 시 바로 이동을 위해)
  const tabFromUrl = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'menu')
  const [showProfile, setShowProfile] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set([tabFromUrl || 'menu']))
  const [toast, setToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'warning' | 'info'
  }>({ show: false, message: '', type: 'info' })

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ show: true, message, type })
  }

  // URL 파라미터 변경 시 activeTab 동기화
  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl)
    }
  }, [tabFromUrl])

  // 방문한 탭 추적 (한 번 마운트된 탭은 유지하여 편집 상태 보존)
  useEffect(() => {
    setVisitedTabs(prev => {
      if (prev.has(activeTab)) return prev
      return new Set(prev).add(activeTab)
    })
  }, [activeTab])

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
    if (tab === 'settings') return
    router.push(getTabRoute(tab))
  }

  // 권한 체크
  const canAccessStaffManagement = ['staff_manage', 'staff_view'].some(p => hasPermission(p as any))
  const canAccessClinicSettings = hasPermission('clinic_settings')

  // 권한 로딩 상태 추적
  useEffect(() => {
    if (!authLoading && user && permissions.size > 0) {
      setPermissionsLoaded(true)
    }
  }, [authLoading, user, permissions])

  useEffect(() => {
    // 인증 정보 로딩 중이거나 권한이 로딩 중이면 아무것도 하지 않음
    if (authLoading || !permissionsLoaded) {
      return
    }

    // 사용자가 없으면 리디렉션
    if (!user) {
      router.push('/dashboard')
      return
    }

    // 권한 없는 탭 접근 시 메뉴 설정 탭으로 이동
    if (activeTab === 'staff' && !canAccessStaffManagement) {
      setActiveTab('menu')
    } else if ((activeTab === 'clinic' || activeTab === 'branches') && !canAccessClinicSettings) {
      setActiveTab('menu')
    }
  }, [authLoading, permissionsLoaded, user, canAccessStaffManagement, canAccessClinicSettings, activeTab, router])

  // 로딩 중이거나 권한이 없는 경우
  if (authLoading || !permissionsLoaded) {
    return (
      <div className="bg-at-surface-alt text-at-text font-sans min-h-screen flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-at-accent mx-auto mb-4"></div>
          <p>사용자 정보 확인 중...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="bg-at-surface-alt text-at-text font-sans min-h-screen flex justify-center items-center px-4">
        <div className="text-center">
          <div className="bg-white p-6 sm:p-8 rounded-xl shadow-at-card border border-at-border">
            <h1 className="text-xl sm:text-2xl font-bold text-at-text mb-4">로그인이 필요합니다</h1>
            <p className="text-at-text-secondary mb-6">
              이 페이지에 접근하려면 로그인이 필요합니다.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-at-accent hover:bg-at-accent-hover text-white font-bold py-2 px-4 rounded-md transition-colors"
            >
              대시보드로 이동
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-at-surface-alt">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-30 h-14 bg-white border-b border-at-border">
        <div className="max-w-[1400px] mx-auto h-full px-3 sm:px-6 flex items-center">
          <Header
            dbStatus="connected"
            user={user}
            onLogout={logout}
            onProfileClick={() => setShowProfile(true)}
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
          fixed top-14 w-64 lg:w-56 h-[calc(100vh-3.5rem)] bg-white border-r border-at-border z-20 overflow-y-auto py-3 px-3
          transition-transform duration-300 ease-in-out
          lg:left-[max(0px,calc(50%-700px))]
          ${isMobileMenuOpen ? 'translate-x-0 left-0' : '-translate-x-full left-0 lg:translate-x-0'}
        `}
      >
        <TabNavigation
          activeTab="settings"
          onTabChange={handleMainTabChange}
          onItemClick={() => setIsMobileMenuOpen(false)}
          skipAutoRedirect={true}
        />
      </aside>

      {/* 메인 콘텐츠 */}
      <div className="pt-14">
        <main className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:pl-60 lg:pr-6 pt-4 pb-6">
          <div className="max-w-6xl bg-white min-h-screen rounded-xl border border-at-border">

            {/* 서브 탭 네비게이션 - 스크롤 시 고정 */}
            <div className="sticky top-14 z-10 bg-white border-b border-at-border px-4 sm:px-6 pt-4 pb-3 rounded-t-xl flex flex-wrap gap-2">
              {subTabs.map((tab) => {
                const hasTabPermission = tab.permissions.length === 0 || tab.permissions.some(p => hasPermission(p as any))
                if (!hasTabPermission) return null
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'bg-at-accent-light text-at-accent'
                        : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* 탭 콘텐츠 */}
            <div className="p-4 sm:p-6">
              {visitedTabs.has('staff') && canAccessStaffManagement && (
                <div style={{ display: activeTab === 'staff' ? 'block' : 'none' }}>
                  <StaffManagement currentUser={user} />
                </div>
              )}

              {visitedTabs.has('branches') && canAccessClinicSettings && (
                <div style={{ display: activeTab === 'branches' ? 'block' : 'none' }}>
                  <BranchManagement currentUser={user} />
                </div>
              )}

              {visitedTabs.has('clinic') && canAccessClinicSettings && (
                <div style={{ display: activeTab === 'clinic' ? 'block' : 'none' }}>
                  <ClinicSettings currentUser={user} />
                </div>
              )}

              {visitedTabs.has('analytics') && (
                <div style={{ display: activeTab === 'analytics' ? 'block' : 'none' }}>
                  <div className="text-center py-12">
                    <BarChart3 className="w-12 h-12 text-at-text-weak mx-auto mb-4" />
                    <p className="text-at-text-secondary">통계 분석 기능은 곧 제공될 예정입니다.</p>
                  </div>
                </div>
              )}

              {visitedTabs.has('menu') && (
                <div style={{ display: activeTab === 'menu' ? 'block' : 'none' }}>
                  <MenuSettings />
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Profile Modal */}
      {showProfile && user && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto rounded-xl">
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