'use client'

/**
 * Contracts Page - Employment Contract List
 */

import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { useRouter } from 'next/navigation'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import ContractList from '@/components/Contract/ContractList'

export default function ContractsPage() {
  const { user, logout } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()

  const handleTabChange = (tab: string) => {
    if (tab === 'contracts') return // Already on contracts page
    if (tab === 'daily-input') router.push('/dashboard')
    else router.push('/dashboard') // For now, all other tabs go to dashboard
  }

  // Check user first before checking permissions
  if (!user || !user.clinic_id) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto p-4 md:p-8">
          <Header user={user} onLogout={logout} />
          <TabNavigation activeTab="contracts" onTabChange={handleTabChange} />
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
              <p className="text-yellow-800">사용자 정보를 불러오는 중...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Check permission after user is loaded
  if (!hasPermission('contract_view')) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto p-4 md:p-8">
          <Header user={user} onLogout={logout} />
          <TabNavigation activeTab="contracts" onTabChange={handleTabChange} />
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
              <h2 className="text-xl font-bold text-red-800 mb-2">접근 권한이 없습니다</h2>
              <p className="text-red-600 mb-4">근로계약서를 조회할 권한이 없습니다.</p>
              <button
                onClick={() => router.back()}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                돌아가기
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto p-4 md:p-8">
        <Header user={user} onLogout={logout} />
        <TabNavigation activeTab="contracts" onTabChange={handleTabChange} />
        <main>
          <ContractList currentUser={user} clinicId={user.clinic_id} />
        </main>
      </div>
    </div>
  )
}
