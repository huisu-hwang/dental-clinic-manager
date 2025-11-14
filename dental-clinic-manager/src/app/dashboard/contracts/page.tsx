'use client'

/**
 * Contracts Page - Employment Contract List
 */

import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { useRouter } from 'next/navigation'
import ContractList from '@/components/Contract/ContractList'

export default function ContractsPage() {
  const { user } = useAuth()
  const { hasPermission, isLoading } = usePermissions()
  const router = useRouter()

  // Check user and permissions loading state
  if (!user || !user.clinic_id || isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <div className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-blue-800">권한 정보를 불러오는 중...</p>
          </div>
        </div>
      </div>
    )
  }

  // Check permission after user and permissions are loaded
  if (!hasPermission('contract_view')) {
    return (
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
    )
  }

  return <ContractList currentUser={user} clinicId={user.clinic_id} />
}
