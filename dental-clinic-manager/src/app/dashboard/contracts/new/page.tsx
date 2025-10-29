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

  // Load employees
  useEffect(() => {
    if (hasPermission('contract_create') && user?.clinic_id) {
      loadEmployees()
    }
  }, [user?.clinic_id, hasPermission])

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

  const loadEmployees = async () => {
    if (!user?.clinic_id) return

    try {
      const supabase = getSupabase()
      if (!supabase) {
        console.error('Supabase client not available')
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, phone, address, resident_registration_number, role, status')
        .eq('clinic_id', user.clinic_id)
        .neq('id', user.id) // Exclude current user (owner/manager creating the contract)
        .order('name')

      if (error) {
        console.error('Failed to load employees:', error)
      } else {
        console.log('Loaded employees:', data?.length || 0, 'employees found')
        setEmployees(data as User[])
      }
    } catch (err) {
      console.error('Failed to load employees:', err)
    } finally {
      setLoading(false)
    }
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
