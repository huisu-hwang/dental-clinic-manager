'use client'

/**
 * Contracts Page - Employment Contract List
 */

import { useAuth } from '@/contexts/AuthContext'
import ContractList from '@/components/Contract/ContractList'

export default function ContractsPage() {
  const { user } = useAuth()

  if (!user || !user.clinic_id) {
    return (
      <div className="p-4 sm:p-6 bg-white min-h-screen">
        <div className="bg-at-accent-light border border-at-border rounded-lg p-6 text-center">
          <div className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-at-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-at-accent">로딩 중...</p>
          </div>
        </div>
      </div>
    )
  }

  // 본인 근로계약서는 모든 직원이 조회 가능 (전체 조회는 대표원장만)
  return <ContractList currentUser={user} clinicId={user.clinic_id} />
}
