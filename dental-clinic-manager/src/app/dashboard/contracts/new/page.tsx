'use client'

/**
 * New Contract Page - Create New Employment Contract
 */

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { useRouter } from 'next/navigation'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import ContractForm from '@/components/Contract/ContractForm'
import { getSupabase } from '@/lib/supabase'
import type { User } from '@/types/auth'

export default function NewContractPage() {
  const { user, logout } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()
  const [employees, setEmployees] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  const handleTabChange = (tab: string) => {
    if (tab === 'contracts') router.push('/dashboard/contracts')
    else if (tab === 'daily-input') router.push('/dashboard')
    else router.push('/dashboard')
  }

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
        .select('id, name, email, phone, role, status')
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

  // Check permission
  if (!hasPermission('contract_create')) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto p-4 md:p-8">
          <Header user={user} onLogout={logout} />
          <TabNavigation activeTab="contracts" onTabChange={handleTabChange} />
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
              <h2 className="text-xl font-bold text-red-800 mb-2">접근 권한이 없습니다</h2>
              <p className="text-red-600 mb-4">근로계약서를 작성할 권한이 없습니다.</p>
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

  const handleSuccess = (contractId: string) => {
    router.push(`/dashboard/contracts/${contractId}`)
  }

  const handleCancel = () => {
    router.push('/dashboard/contracts')
  }

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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto p-4 md:p-8">
          <Header user={user} onLogout={logout} />
          <TabNavigation activeTab="contracts" onTabChange={handleTabChange} />
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
          <ContractForm
            currentUser={user}
            employees={employees}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        </main>
      </div>
    </div>
  )
}
