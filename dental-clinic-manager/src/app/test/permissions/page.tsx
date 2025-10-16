'use client'

import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { DEFAULT_PERMISSIONS, PERMISSION_GROUPS } from '@/types/permissions'
import type { Permission } from '@/types/permissions'

export default function PermissionsTestPage() {
  const { user } = useAuth()
  const { permissions, hasPermission, canAccessTab } = usePermissions()

  if (!user) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">권한 시스템 테스트</h1>
        <p className="text-red-500">로그인이 필요합니다.</p>
      </div>
    )
  }

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      'master': '마스터 관리자',
      'owner': '대표원장',
      'vice_director': '부원장',
      'manager': '실장',
      'team_leader': '진료팀장',
      'staff': '진료팀원'
    }
    return labels[role] || role
  }

  const testSinglePermission = (permission: Permission) => {
    return hasPermission(permission)
  }

  const allPermissions = Object.values(PERMISSION_GROUPS).flat().map(p => p.key as Permission)

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">🔐 권한 시스템 테스트</h1>

      {/* 현재 사용자 정보 */}
      <div className="bg-blue-50 p-4 rounded-lg mb-6">
        <h2 className="text-xl font-bold mb-2">현재 사용자 정보</h2>
        <div className="grid grid-cols-2 gap-2">
          <p><strong>이름:</strong> {user.name}</p>
          <p><strong>이메일:</strong> {user.email}</p>
          <p><strong>역할:</strong> {getRoleLabel(user.role || '')}</p>
          <p><strong>병원 ID:</strong> {user.clinic_id || '없음'}</p>
        </div>
      </div>

      {/* 현재 권한 목록 */}
      <div className="bg-green-50 p-4 rounded-lg mb-6">
        <h2 className="text-xl font-bold mb-2">현재 보유 권한 ({permissions.size}개)</h2>
        <div className="flex flex-wrap gap-2 mt-2">
          {permissions.size > 0 ? (
            Array.from(permissions).map(perm => (
              <span key={perm} className="px-3 py-1 bg-green-200 text-green-800 rounded-full text-sm">
                {perm}
              </span>
            ))
          ) : (
            <p className="text-gray-500">권한이 없습니다.</p>
          )}
        </div>
      </div>

      {/* 기본 권한 비교 */}
      <div className="bg-yellow-50 p-4 rounded-lg mb-6">
        <h2 className="text-xl font-bold mb-2">역할별 기본 권한과 비교</h2>
        <div className="mt-2">
          <p className="mb-2"><strong>{getRoleLabel(user.role || '')} 기본 권한:</strong></p>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_PERMISSIONS[user.role || 'staff']?.map(perm => (
              <span
                key={perm}
                className={`px-3 py-1 rounded-full text-sm ${
                  permissions.has(perm)
                    ? 'bg-green-200 text-green-800'
                    : 'bg-red-200 text-red-800'
                }`}
              >
                {perm} {permissions.has(perm) ? '✓' : '✗'}
              </span>
            )) || <p className="text-gray-500">기본 권한이 정의되지 않았습니다.</p>}
          </div>
        </div>
      </div>

      {/* 권한 테스트 */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
        <h2 className="text-xl font-bold mb-4">권한 테스트</h2>

        {/* 단일 권한 테스트 */}
        <div className="mb-4">
          <h3 className="font-bold mb-2">권한 테스트</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {allPermissions.map(perm => (
              <div key={perm} className="flex items-center space-x-2">
                <span className={`w-4 h-4 rounded-full ${
                  testSinglePermission(perm) ? 'bg-green-500' : 'bg-red-500'
                }`} />
                <span className="text-sm">{perm}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 탭 접근 권한 테스트 */}
        <div>
          <h3 className="font-bold mb-2">탭 접근 권한 테스트</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              'daily-input',
              'weekly-stats',
              'monthly-stats',
              'annual-stats',
              'logs',
              'settings',
              'guide'
            ].map(tab => (
              <div key={tab} className="flex items-center space-x-2">
                <span className={`w-4 h-4 rounded-full ${
                  canAccessTab(tab) ? 'bg-green-500' : 'bg-red-500'
                }`} />
                <span className="text-sm">{tab}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 권한 그룹별 표시 */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h2 className="text-xl font-bold mb-4">권한 그룹별 상태</h2>
        {Object.entries(PERMISSION_GROUPS).map(([groupName, perms]) => (
          <div key={groupName} className="mb-4">
            <h3 className="font-bold mb-2">{groupName}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {perms.map(perm => {
                const hasPerm = hasPermission(perm.key as Permission)
                return (
                  <div key={perm.key} className="flex items-center space-x-2">
                    <span className={`w-4 h-4 rounded-full ${
                      hasPerm ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                    <span className={`text-sm ${hasPerm ? 'text-green-700' : 'text-gray-500'}`}>
                      {perm.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}