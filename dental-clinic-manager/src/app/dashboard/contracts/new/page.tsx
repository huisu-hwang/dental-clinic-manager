'use client'

/**
 * New Contract Page - Create New Employment Contract
 * Note: This page is rendered within DashboardLayout, so Header and TabNavigation are already provided.
 */

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { useRouter } from 'next/navigation'
import ContractForm from '@/components/Contract/ContractForm'
import { getSupabase } from '@/lib/supabase'
import type { User } from '@/types/auth'

export default function NewContractPage() {
  const { user } = useAuth()
  const { hasPermission, isLoading: permissionsLoading } = usePermissions()
  const router = useRouter()
  const [employees, setEmployees] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  const loadEmployees = async () => {
    console.log('[Contract New] Starting to load employees...')
    console.log('[Contract New] User clinic_id:', user?.clinic_id)
    console.log('[Contract New] User id:', user?.id)

    if (!user?.clinic_id) {
      console.warn('[Contract New] No clinic_id available')
      setLoading(false)
      return
    }

    try {
      const supabase = getSupabase()
      if (!supabase) {
        console.error('[Contract New] Supabase client not available')
        setLoading(false)
        return
      }

      console.log('[Contract New] Executing query for clinic_id:', user.clinic_id)

      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, phone, role, status, address, resident_registration_number')
        .eq('clinic_id', user.clinic_id)
        .neq('id', user.id)
        .order('name')

      console.log('[Contract New] Query completed')
      console.log('[Contract New] Error:', error)
      console.log('[Contract New] Data:', data)
      console.log('[Contract New] Employee count:', data?.length || 0)

      if (error) {
        console.error('[Contract New] Failed to load employees:', error)
        alert(`직원 목록을 불러오는데 실패했습니다: ${error.message}`)
      } else {
        console.log('[Contract New] Successfully loaded employees:', data)
        setEmployees(data as User[])
      }
    } catch (err) {
      console.error('[Contract New] Exception while loading employees:', err)
      alert(`직원 목록 로딩 중 오류 발생: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    } finally {
      setLoading(false)
    }
  }

  // Load employees
  // Note: Permission check is already done at page level, so we only check for clinic_id here
  useEffect(() => {
    console.log('[Contract New] useEffect triggered')
    console.log('[Contract New] User clinic_id:', user?.clinic_id)

    if (user?.clinic_id) {
      console.log('[Contract New] Loading employees for clinic:', user.clinic_id)
      loadEmployees()
    } else {
      console.log('[Contract New] Skipping employee load - no clinic_id')
      setLoading(false)
    }
  }, [user?.clinic_id])

  // Check user and permissions loading state
  if (!user || !user.clinic_id || permissionsLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <div className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-blue-800">사용자 정보를 불러오는 중...</p>
          </div>
        </div>
      </div>
    )
  }

  // Check permission after user and permissions are loaded
  if (!hasPermission('contract_create')) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-xl font-bold text-red-800 mb-2">접근 권한이 없습니다</h2>
          <p className="text-red-600 mb-4">근로계약서를 작성할 권한이 없습니다.</p>
          <button
            onClick={() => router.push('/dashboard/contracts')}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            돌아가기
          </button>
        </div>
      </div>
    )
  }

  const handleSuccess = (contractId: string) => {
    router.push(`/dashboard/contracts/${contractId}`)
  }

  const handleCancel = () => {
    router.push('/dashboard/contracts')
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <ContractForm
      currentUser={user}
      employees={employees}
      onSuccess={handleSuccess}
      onCancel={handleCancel}
    />
  )
}
