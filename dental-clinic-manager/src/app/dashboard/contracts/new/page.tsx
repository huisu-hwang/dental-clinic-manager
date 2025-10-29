'use client'

/**
 * New Contract Page - Create New Employment Contract
 */

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { useRouter } from 'next/navigation'
import Header from '@/components/Layout/Header'
import ContractForm from '@/components/Contract/ContractForm'
import { getSupabase } from '@/lib/supabase'
import type { User } from '@/types/auth'

export default function NewContractPage() {
  const { user, logout } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()
  const [employees, setEmployees] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  // Check permission
  if (!hasPermission('contract_create')) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header user={user} onLogout={logout} />
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
    )
  }

  // Load employees
  useEffect(() => {
    loadEmployees()
  }, [user?.clinic_id])

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
        .eq('status', 'approved')
        .order('name')

      if (error) {
        console.error('Failed to load employees:', error)
      } else {
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
        <Header user={user} onLogout={logout} />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <p className="text-yellow-800">사용자 정보를 불러오는 중...</p>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header user={user} onLogout={logout} />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header user={user} onLogout={logout} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <ContractForm
          currentUser={user}
          employees={employees}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    </div>
  )
}
