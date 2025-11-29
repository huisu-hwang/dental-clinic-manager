'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Settings, Users, Building2, Building, FileText, BarChart3, Cog } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import StaffManagement from '@/components/Management/StaffManagement'
import BranchManagement from '@/components/Management/BranchManagement'
import ClinicSettings from '@/components/Management/ClinicSettings'
import ProtocolManagement from '@/components/Management/ProtocolManagement'
import AccountProfile from '@/components/Management/AccountProfile'
import Toast from '@/components/ui/Toast'

// 서브 탭 설정
const subTabs = [
  { id: 'staff', label: '직원 관리', icon: Users, permissions: ['staff_view', 'staff_manage'] },
  { id: 'branches', label: '지점 관리', icon: Building2, permissions: ['clinic_settings'] },
  { id: 'clinic', label: '병원 설정', icon: Building, permissions: ['clinic_settings'] },
  { id: 'protocols', label: '프로토콜 관리', icon: FileText, permissions: ['protocol_view', 'protocol_create', 'protocol_edit'] },
  { id: 'analytics', label: '통계 분석', icon: BarChart3, permissions: ['stats_monthly_view', 'stats_annual_view'] },
  { id: 'system', label: '시스템 설정', icon: Cog, permissions: ['clinic_settings'] },
] as const

export default function ManagementPage() {
  const router = useRouter()
  const { user, logout, updateUser, loading: authLoading } = useAuth()
  const { hasPermission, permissions } = usePermissions()
  const [activeTab, setActiveTab] = useState('staff')
  const [showProfile, setShowProfile] = useState(false)
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)
  const [toast, setToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'warning' | 'info'
  }>({ show: false, message: '', type: 'info' })

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ show: true, message, type })
  }

  // 메인 탭 네비게이션 핸들러
  const handleMainTabChange = (tab: string) => {
    if (tab === 'settings') return // Already on settings/management page
    if (tab === 'daily-input') router.push('/dashboard')
    else if (tab === 'attendance') router.push('/attendance')
    else if (tab === 'contracts') router.push('/dashboard/contracts')
    else if (tab === 'stats') router.push('/dashboard?tab=stats')
    else if (tab === 'logs') router.push('/dashboard?tab=logs')
    else if (tab === 'protocols') router.push('/dashboard?tab=protocols')
    else if (tab === 'guide') router.push('/dashboard?tab=guide')
    else router.push('/dashboard')
  }

  // 권한 체크
  const canAccessStaffManagement = ['staff_manage', 'staff_view'].some(p => hasPermission(p as any))
  const canAccessClinicSettings = hasPermission('clinic_settings')
  const canAccessProtocols = ['protocol_view', 'protocol_create', 'protocol_edit'].some(p => hasPermission(p as any))

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

    // 권한이 전혀 없으면 리디렉션
    if (!canAccessStaffManagement && !canAccessClinicSettings && !canAccessProtocols) {
      router.push('/dashboard')
      return
    }

    // 현재 탭에 권한이 없으면 권한이 있는 탭으로 변경
    if (activeTab === 'staff' && !canAccessStaffManagement) {
      if (canAccessClinicSettings) setActiveTab('clinic')
      else if (canAccessProtocols) setActiveTab('protocols')
    } else if (activeTab === 'clinic' && !canAccessClinicSettings) {
      if (canAccessStaffManagement) setActiveTab('staff')
      else if (canAccessProtocols) setActiveTab('protocols')
    } else if (activeTab === 'protocols' && !canAccessProtocols) {
      if (canAccessStaffManagement) setActiveTab('staff')
      else if (canAccessClinicSettings) setActiveTab('clinic')
    }
  }, [authLoading, permissionsLoaded, user, canAccessStaffManagement, canAccessClinicSettings, canAccessProtocols, activeTab, router])

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

  if (!user || (!canAccessStaffManagement && !canAccessClinicSettings && !canAccessProtocols)) {
    return (
      <div className="bg-slate-50 text-slate-800 font-sans min-h-screen flex justify-center items-center">
        <div className="text-center">
          <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200">
            <h1 className="text-2xl font-bold text-slate-800 mb-4">접근 권한이 없습니다</h1>
            <p className="text-slate-600 mb-6">
              관리 페이지에 접근할 권한이 없습니다.
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
        <div className="max-w-[1400px] mx-auto h-full px-6 flex items-center">
          <Header
            dbStatus="connected"
            user={user}
            onLogout={logout}
            onProfileClick={() => setShowProfile(true)}
          />
        </div>
      </div>

      {/* 좌측 사이드바 - 콘텐츠와 함께 중앙 정렬 */}
      <aside className="fixed top-14 w-56 h-[calc(100vh-3.5rem)] bg-white border-r border-slate-200 z-20 overflow-y-auto py-3 px-3 left-[calc(50%-700px)]">
        <TabNavigation activeTab="settings" onTabChange={handleMainTabChange} />
      </aside>

      {/* 메인 콘텐츠 */}
      <div className="pt-14">
        <main className="max-w-[1400px] mx-auto pl-60 pr-6 pt-4 pb-6">
          <div className="max-w-6xl">
            {/* 통일된 카드 레이아웃 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* 블루 그라데이션 헤더 */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <Settings className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">병원 관리</h2>
                    <p className="text-blue-100 text-sm">Hospital Management</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 서브 탭 네비게이션 */}
            <div className="border-b border-slate-200 bg-slate-50">
              <nav className="flex space-x-1 p-2 overflow-x-auto" aria-label="Tabs">
                {subTabs.map((tab) => {
                  const hasTabPermission = tab.permissions.some(p => hasPermission(p as any))
                  if (!hasTabPermission) return null
                  if (tab.id === 'system' && user.role !== 'owner') return null

                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                        activeTab === tab.id
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {tab.label}
                    </button>
                  )
                })}
              </nav>
            </div>

            <div className="p-6">
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
                <ProtocolManagement currentUser={user} />
              )}

              {/* Analytics Tab */}
              {activeTab === 'analytics' && (
                <div className="text-center py-12">
                  <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600">통계 분석 기능은 곧 제공될 예정입니다.</p>
                </div>
              )}

              {/* System Settings Tab */}
              {activeTab === 'system' && user.role === 'owner' && (
                <div className="text-center py-12">
                  <Cog className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600">시스템 설정 기능은 곧 제공될 예정입니다.</p>
                </div>
              )}
            </div>
          </div>
          </div>
        </main>
      </div>

      {/* Profile Modal */}
      {showProfile && user && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
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