'use client'

/**
 * Template Management Page - Manage Contract Templates
 */

import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { useRouter } from 'next/navigation'
import Header from '@/components/Layout/Header'
import TemplateManagement from '@/components/Contract/TemplateManagement'

export default function TemplatesPage() {
  const { user, logout } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()

  // Check permission - only owners can manage templates
  if (!hasPermission('contract_template_manage')) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header user={user} onLogout={logout} />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <h2 className="text-xl font-bold text-red-800 mb-2">접근 권한이 없습니다</h2>
            <p className="text-red-600 mb-4">계약서 템플릿을 관리할 권한이 없습니다.</p>
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

  return (
    <div className="min-h-screen bg-slate-50">
      <Header user={user} onLogout={logout} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <TemplateManagement currentUser={user} clinicId={user.clinic_id} />
      </div>
    </div>
  )
}
