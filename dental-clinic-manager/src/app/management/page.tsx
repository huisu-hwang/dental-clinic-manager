'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import Header from '@/components/Layout/Header'
import ManagementTabNavigation from '@/components/Layout/ManagementTabNavigation'
import StaffManagement from '@/components/Management/StaffManagement'
import ClinicSettings from '@/components/Management/ClinicSettings'
import AccountProfile from '@/components/Management/AccountProfile'
import Toast from '@/components/UI/Toast'

export default function ManagementPage() {
  const router = useRouter()
  const { user, logout, updateUser } = useAuth()
  const { hasPermission } = usePermissions()
  const [activeTab, setActiveTab] = useState('staff')
  const [showProfile, setShowProfile] = useState(false)
  const [toast, setToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'warning' | 'info'
  }>({ show: false, message: '', type: 'info' })

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ show: true, message, type })
  }

  // 권한 체크
  const canAccessStaffManagement = hasPermission(['staff_manage', 'staff_view'])
  const canAccessClinicSettings = hasPermission('clinic_settings')

  useEffect(() => {
    // 둘 다 접근 불가능한 경우 대시보드로 리다이렉트
    if (!canAccessStaffManagement && !canAccessClinicSettings) {
      router.push('/dashboard')
      return
    }

    // 현재 탭에 권한이 없으면 권한이 있는 탭으로 변경
    if (activeTab === 'staff' && !canAccessStaffManagement && canAccessClinicSettings) {
      setActiveTab('clinic')
    } else if (activeTab === 'clinic' && !canAccessClinicSettings && canAccessStaffManagement) {
      setActiveTab('staff')
    }
  }, [canAccessStaffManagement, canAccessClinicSettings, activeTab, router])

  // 권한이 전혀 없는 경우
  if (!user || (!canAccessStaffManagement && !canAccessClinicSettings)) {
    return (
      <div className="bg-slate-50 text-slate-800 font-sans min-h-screen">
        <div className="container mx-auto p-4 md:p-8">
          <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200 text-center">
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

  if (!user) {
    return (
      <div className="bg-slate-50 text-slate-800 font-sans min-h-screen">
        <div className="container mx-auto p-4 md:p-8">
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p>로딩 중...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 text-slate-800 font-sans min-h-screen">
      <div className="container mx-auto p-4 md:p-8">
        <Header
          dbStatus="connected"
          user={user}
          onLogout={logout}
          showManagementLink={false}
          onProfileClick={() => setShowProfile(true)}
        />

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">병원 관리</h1>
          <p className="text-slate-600">
            직원, 설정, 통계를 관리하고 병원 운영을 최적화하세요.
          </p>
        </div>

        {/* Profile Modal */}
        {showProfile && user && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <AccountProfile
                currentUser={user}
                onClose={() => setShowProfile(false)}
                onUpdate={(updatedUserData) => {
                  updateUser(updatedUserData) // AuthContext와 localStorage 업데이트
                  setShowProfile(false) // 모달 닫기
                  showToast('프로필이 성공적으로 업데이트되었습니다.', 'success')
                }}
              />
            </div>
          </div>
        )}

        <main>
          <ManagementTabNavigation
            activeTab={activeTab}
            onTabChange={setActiveTab}
            userRole={user.role}
          />

          {/* Staff Management Tab */}
          {activeTab === 'staff' && (
            <StaffManagement currentUser={user} />
          )}

          {/* Clinic Settings Tab */}
          {activeTab === 'clinic' && (
            <ClinicSettings currentUser={user} />
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-4">통계 분석</h2>
              <div className="text-center py-12">
                <p className="text-slate-600">통계 분석 기능은 곧 제공될 예정입니다.</p>
              </div>
            </div>
          )}

          {/* System Settings Tab */}
          {activeTab === 'system' && user.role === 'owner' && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-4">시스템 설정</h2>
              <div className="text-center py-12">
                <p className="text-slate-600">시스템 설정 기능은 곧 제공될 예정입니다.</p>
              </div>
            </div>
          )}
        </main>
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />
    </div>
  )
}