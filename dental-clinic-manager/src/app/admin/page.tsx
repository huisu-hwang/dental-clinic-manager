'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import {
  BuildingOfficeIcon,
  UserGroupIcon,
  ChartBarIcon,
  CpuChipIcon,
  CreditCardIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline'
import ClinicsManagement from '@/components/Admin/ClinicsManagement'
import SystemMonitoring from '@/components/Admin/SystemMonitoring'
import AccountProfile from '@/components/Management/AccountProfile'
import Toast from '@/components/ui/Toast'

export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'overview' | 'clinics' | 'users' | 'billing' | 'monitoring' | 'settings'>('overview')
  const [showProfile, setShowProfile] = useState(false)
  const [toast, setToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'warning' | 'info'
  }>({ show: false, message: '', type: 'info' })

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ show: true, message, type })
  }

  // Redirect if user is not master admin
  useEffect(() => {
    if (!user || user.role !== 'master_admin') {
      router.push('/dashboard')
    }
  }, [user, router])

  if (!user || user.role !== 'master_admin') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <ShieldCheckIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-800 mb-2">접근 제한</h1>
          <p className="text-slate-600">마스터 관리자만 접근할 수 있습니다.</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: '대시보드', icon: ChartBarIcon },
    { id: 'clinics', label: '병원 관리', icon: BuildingOfficeIcon },
    { id: 'users', label: '사용자 관리', icon: UserGroupIcon },
    { id: 'billing', label: '빌링 & 구독', icon: CreditCardIcon },
    { id: 'monitoring', label: '시스템 모니터링', icon: CpuChipIcon },
    { id: 'settings', label: '시스템 설정', icon: ShieldCheckIcon }
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Profile Modal */}
      {showProfile && user && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <AccountProfile
              currentUser={user}
              onClose={() => setShowProfile(false)}
              onUpdate={(updatedUser) => {
                console.log('User updated:', updatedUser)
              }}
            />
          </div>
        </div>
      )}

      {/* Admin Header */}
      <header className="bg-slate-900 text-white">
        <div className="container mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <ShieldCheckIcon className="h-8 w-8 text-yellow-400" />
              <div>
                <h1 className="text-xl font-bold">마스터 관리자</h1>
                <p className="text-sm text-slate-400">클리닉 매니저 시스템 관리</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowProfile(true)}
                className="text-sm text-slate-400 hover:text-slate-200 hover:underline cursor-pointer transition-colors"
                title="계정 정보"
              >
                {user.email}
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md text-sm font-medium transition-colors"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 md:px-8 py-8">
        {/* Tab Navigation */}
        <nav className="mb-8">
          <div className="border-b border-slate-200">
            <div className="-mb-px flex space-x-8 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <tab.icon className="h-5 w-5 mr-2" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Tab Content */}
        <main>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">전체 병원</p>
                      <p className="text-3xl font-bold text-slate-900 mt-1">-</p>
                    </div>
                    <BuildingOfficeIcon className="h-8 w-8 text-blue-500" />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">전체 사용자</p>
                      <p className="text-3xl font-bold text-slate-900 mt-1">-</p>
                    </div>
                    <UserGroupIcon className="h-8 w-8 text-green-500" />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">월 매출</p>
                      <p className="text-3xl font-bold text-slate-900 mt-1">₩0</p>
                    </div>
                    <CreditCardIcon className="h-8 w-8 text-purple-500" />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">시스템 상태</p>
                      <p className="text-sm font-bold text-green-600 mt-1">정상</p>
                    </div>
                    <div className="h-8 w-8 bg-green-500 rounded-full"></div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <h2 className="text-lg font-bold text-slate-800 mb-4">최근 활동</h2>
                <div className="space-y-3">
                  <p className="text-sm text-slate-600 text-center py-8">
                    최근 활동 내역이 없습니다.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Clinics Management Tab */}
          {activeTab === 'clinics' && <ClinicsManagement />}

          {/* Users Management Tab */}
          {activeTab === 'users' && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-4">사용자 관리</h2>
              <div className="text-center py-12">
                <UserGroupIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600">사용자 관리 기능은 곧 제공될 예정입니다.</p>
              </div>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === 'billing' && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-4">빌링 & 구독 관리</h2>
              <div className="text-center py-12">
                <CreditCardIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600">빌링 관리 기능은 곧 제공될 예정입니다.</p>
              </div>
            </div>
          )}

          {/* System Monitoring Tab */}
          {activeTab === 'monitoring' && <SystemMonitoring />}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-4">시스템 설정</h2>
              <div className="text-center py-12">
                <ShieldCheckIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
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