'use client'

/**
 * Contract Detail Page - View and Sign Contract
 * Note: Header and TabNavigation are already provided by /dashboard/layout.tsx
 */

import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { useParams, useRouter } from 'next/navigation'
import ContractDetail from '@/components/Contract/ContractDetail'

export default function ContractDetailPage() {
  const { user } = useAuth()
  const { hasPermission } = usePermissions()
  const params = useParams()
  const router = useRouter()
  const contractId = params.id as string

  // Redirect if "new" is accessed via dynamic route
  if (contractId === 'new') {
    router.replace('/dashboard/contracts/new')
    return null
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (contractId && !uuidRegex.test(contractId)) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <h2 className="text-xl font-bold text-red-800 mb-2">유효하지 않은 계약서 ID</h2>
        <p className="text-red-600 mb-4">올바른 계약서 ID가 아닙니다.</p>
        <button
          onClick={() => router.push('/dashboard/contracts')}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          목록으로 돌아가기
        </button>
      </div>
    )
  }

  // Check permission
  if (!hasPermission('contract_view')) {
    return (
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
    )
  }

  if (!user || !contractId) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-800">데이터를 불러오는 중...</p>
      </div>
    )
  }

  return <ContractDetail contractId={contractId} currentUser={user} />
}
