'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Settings, Users, Building2, Building, FileText, BarChart3, Cog, Calendar } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import StaffManagement from '@/components/Management/StaffManagement'
import BranchManagement from '@/components/Management/BranchManagement'
import ClinicSettings from '@/components/Management/ClinicSettings'
import ProtocolManagement from '@/components/Management/ProtocolManagement'
import AccountProfile from '@/components/Management/AccountProfile'
import LeaveManagement from '@/components/Leave/LeaveManagement'
import MenuSettings from '@/components/Management/MenuSettings'
import Toast from '@/components/ui/Toast'

// 서브 탭 설정
const subTabs = [
  { id: 'menu', label: '메뉴 설정', icon: Cog, permissions: [] }, // 모든 사용자 접근 가능
  { id: 'staff', label: '직원 관리', icon: Users, permissions: ['staff_view', 'staff_manage'] },
  { id: 'leave', label: '연차 관리', icon: Calendar, permissions: ['leave_request_view_own', 'leave_request_view_all', 'leave_balance_view_own'] },
  { id: 'branches', label: '지점 관리', icon: Building2, permissions: ['clinic_settings'] },
  { id: 'clinic', label: '병원 설정', icon: Building, permissions: ['clinic_settings'] },
  { id: 'protocols', label: '프로토콜 관리', icon: FileText, permissions: ['protocol_view', 'protocol_create', 'protocol_edit'] },
  { id: 'analytics', label: '통계 분석', icon: BarChart3, permissions: ['stats_monthly_view', 'stats_annual_view'] },
] as const

export default function ManagementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, logout, updateUser, loading: authLoading } = useAuth()
  const { hasPermission, permissions } = usePermissions()

  // URL 파라미터에서 탭 정보 읽기 (연차 승인 알림 클릭 시 바로 이동을 위해)
  const tabFromUrl = searchParams.get('tab')
  const subtabFromUrl = searchParams.get('subtab')
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'menu')
  const [showProfile, setShowProfile] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)
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
    if (tab === 'settings') return // Already on settings/management page
    // 연차 관리는 관리 페이지 내에서 로컬로 처리
    if (tab === 'leave') {
      setActiveTab('leave')
      setIsMobileMenuOpen(false)
      return
    }
    if (tab === 'home') router.push('/dashboard')
    else if (tab === 'daily-input') router.push('/dashboard?tab=daily-input')
    else if (tab === 'attendance') router.push('/attendance')
    else if (tab === 'contracts') router.push('/dashboard/contracts')
    else if (tab === 'stats') router.push('/dashboard?tab=stats')
    else if (tab === 'logs') router.push('/dashboard?tab=logs')
    else if (tab === 'protocols') router.push('/dashboard?tab=protocols')
    else if (tab === 'vendors') router.push('/dashboard?tab=vendors')
    else if (tab === 'guide') router.push('/dashboard?tab=guide')
    else router.push('/dashboard')
  }

  // 권한 체크
  const canAccessStaffManagement = ['staff_manage', 'staff_view'].some(p => hasPermission(p as any))
  const canAccessClinicSettings = hasPermission('clinic_settings')
  const canAccessProtocols = ['protocol_view', 'protocol_create', 'protocol_edit'].some(p => hasPermission(p as any))
  const canAccessLeave = ['leave_request_view_own', 'leave_request_view_all', 'leave_balance_view_own'].some(p => hasPermission(p as any))

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

    // 메뉴 설정 탭은 모든 사용자 접근 가능하므로 리디렉션 하지 않음
    // 다른 탭에 권한이 없으면 메뉴 설정 탭으로 이동
    if (activeTab === 'staff' && !canAccessStaffManagement) {
      setActiveTab('menu')
    } else if (activeTab === 'clinic' && !canAccessClinicSettings) {
      setActiveTab('menu')
    } else if (activeTab === 'protocols' && !canAccessProtocols) {
      setActiveTab('menu')
    } else if (activeTab === 'leave' && !canAccessLeave) {
      setActiveTab('menu')
    }
  }, [authLoading, permissionsLoaded, user, canAccessStaffManagement, canAccessClinicSettings, canAccessProtocols, canAccessLeave, activeTab, router])

  // 로딩 중이거나 권한이 없는 경우
  if (authLoading || !permissionsLoaded) {
    return (
      <div className="bg-slate-50 text-slate-800 font-sans min-h-screen flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>사용자 정보 확인 중...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="bg-slate-50 text-slate-800 font-sans min-h-screen flex justify-center items-center px-4">
        <div className="text-center">
          <div className="bg-white p-6 sm:p-8 rounded-lg shadow-sm border border-slate-200">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 mb-4">로그인이 필요합니다</h1>
            <p className="text-slate-600 mb-6">
              이 페이지에 접근하려면 로그인이 필요합니다.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
            >
              대시보드로 이동
            </button>
          </div>
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
          activeTab={activeTab === 'leave' ? 'leave' : 'settings'}
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
                    <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-white">병원 관리</h2>
                    <p className="text-blue-100 text-xs sm:text-sm hidden sm:block">Hospital Management</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 서브 탭 네비게이션 - 스크롤 시 고정 */}
            <div className="sticky top-[calc(3.5rem+52px)] sm:top-[calc(3.5rem+72px)] z-10 border-x border-b border-slate-200 bg-slate-50">
              <nav className="flex space-x-1 p-1.5 sm:p-2 overflow-x-auto scrollbar-hide" aria-label="Tabs">
                {subTabs.map((tab) => {
                  // 메뉴 설정 탭은 모든 사용자 접근 가능 (permissions가 빈 배열)
                  const hasTabPermission = tab.permissions.length === 0 || tab.permissions.some(p => hasPermission(p as any))
                  if (!hasTabPermission) return null

                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
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
                {/* Staff Management Tab */}
                {activeTab === 'staff' && (
                  <StaffManagement currentUser={user} />
                )}

                {/* Branch Management Tab */}
                {activeTab === 'branches' && (
                  <BranchManagement currentUser={user} />
                )}

                {/* Clinic Settings Tab */}
                {activeTab === 'clinic' && (
                  <ClinicSettings currentUser={user} />
                )}

                {/* Protocol Management Tab */}
                {activeTab === 'protocols' && (
                  <ProtocolManagement currentUser={user} hideHeader />
                )}

                {/* Leave Management Tab */}
                {activeTab === 'leave' && (
                  <LeaveManagement currentUser={user} initialSubtab={subtabFromUrl} />
                )}

                {/* Analytics Tab */}
                {activeTab === 'analytics' && (
                  <div className="text-center py-12">
                    <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">통계 분석 기능은 곧 제공될 예정입니다.</p>
                  </div>
                )}

                {/* Menu Settings Tab - 모든 사용자 접근 가능 */}
                {activeTab === 'menu' && (
                  <MenuSettings />
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Profile Modal */}
      {showProfile && user && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto rounded-lg">
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