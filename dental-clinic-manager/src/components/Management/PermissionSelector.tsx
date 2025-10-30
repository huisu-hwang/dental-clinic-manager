'use client'

import { useState, useEffect } from 'react'
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline'
import { DEFAULT_PERMISSIONS, PERMISSION_GROUPS, PERMISSION_DESCRIPTIONS } from '@/types/permissions'
import type { Permission } from '@/types/permissions'

interface PermissionSelectorProps {
  role: string
  initialPermissions?: Permission[]
  onSave: (permissions: Permission[]) => void
  onCancel: () => void
}

export default function PermissionSelector({
  role,
  initialPermissions,
  onSave,
  onCancel
}: PermissionSelectorProps) {
  const [selectedPermissions, setSelectedPermissions] = useState<Set<Permission>>(new Set())
  const [useDefaultPermissions, setUseDefaultPermissions] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialPermissions) {
      setSelectedPermissions(new Set(initialPermissions))
      setUseDefaultPermissions(false)
    } else {
      // 역할 기반 기본 권한 설정
      const defaultPerms = DEFAULT_PERMISSIONS[role] || []
      setSelectedPermissions(new Set(defaultPerms))
      setUseDefaultPermissions(true)
    }
  }, [role, initialPermissions])

  const handleTogglePermission = (permission: Permission) => {
    const newPermissions = new Set(selectedPermissions)
    if (newPermissions.has(permission)) {
      newPermissions.delete(permission)
    } else {
      newPermissions.add(permission)
    }
    setSelectedPermissions(newPermissions)
    setUseDefaultPermissions(false)
  }

  const handleToggleAll = (permissions: { key: string }[], checked: boolean) => {
    const newPermissions = new Set(selectedPermissions)
    permissions.forEach(p => {
      if (checked) {
        newPermissions.add(p.key as Permission)
      } else {
        newPermissions.delete(p.key as Permission)
      }
    })
    setSelectedPermissions(newPermissions)
    setUseDefaultPermissions(false)
  }

  const handleResetToDefault = () => {
    const defaultPerms = DEFAULT_PERMISSIONS[role] || []
    setSelectedPermissions(new Set(defaultPerms))
    setUseDefaultPermissions(true)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError('')

      if (useDefaultPermissions) {
        // 기본 권한 사용 시 빈 배열 전달 (서버에서 역할 기반으로 처리)
        await onSave([])
      } else {
        await onSave(Array.from(selectedPermissions))
      }
    } catch (err) {
      console.error('권한 저장 중 오류:', err)
      setError(err instanceof Error ? err.message : '권한 저장 중 오류가 발생했습니다.')
      setSaving(false)
    }
  }

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      'owner': '대표원장',
      'vice_director': '부원장',
      'manager': '실장',
      'team_leader': '진료팀장',
      'staff': '진료팀원'
    }
    return labels[role] || role
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800">권한 설정</h2>
              <p className="text-sm text-slate-600 mt-1">
                {getRoleLabel(role)} 직급의 접근 권한을 설정합니다.
              </p>
            </div>
            <button
              onClick={onCancel}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <XMarkIcon className="h-5 w-5 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 200px)' }}>
          {/* 에러 메시지 */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* 기본 권한 사용 옵션 */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={useDefaultPermissions}
                onChange={(e) => {
                  if (e.target.checked) {
                    handleResetToDefault()
                  } else {
                    setUseDefaultPermissions(false)
                  }
                }}
                className="mr-3 h-4 w-4 text-blue-600 rounded"
              />
              <div>
                <span className="font-medium text-slate-800">
                  {getRoleLabel(role)} 기본 권한 사용
                </span>
                <p className="text-sm text-slate-600 mt-1">
                  직급에 맞는 표준 권한을 자동으로 적용합니다.
                </p>
              </div>
            </label>
          </div>

          {/* 권한 그룹별 선택 */}
          <div className="space-y-6">
            {Object.entries(PERMISSION_GROUPS).map(([groupName, permissions]) => {
              const allChecked = permissions.every(p =>
                selectedPermissions.has(p.key as Permission)
              )
              const someChecked = permissions.some(p =>
                selectedPermissions.has(p.key as Permission)
              )

              return (
                <div key={groupName} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-800">{groupName}</h3>
                    <button
                      onClick={() => handleToggleAll(permissions, !allChecked)}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      {allChecked ? '모두 해제' : '모두 선택'}
                    </button>
                  </div>

                  <div className="space-y-2">
                    {permissions.map(permission => {
                      const isChecked = selectedPermissions.has(permission.key as Permission)
                      const description = PERMISSION_DESCRIPTIONS[permission.key as Permission]

                      return (
                        <label
                          key={permission.key}
                          className="flex items-start p-2 hover:bg-slate-50 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleTogglePermission(permission.key as Permission)}
                            className="mt-1 mr-3 h-4 w-4 text-blue-600 rounded"
                            disabled={useDefaultPermissions}
                          />
                          <div className="flex-1">
                            <div className="font-medium text-slate-800">
                              {permission.label}
                            </div>
                            {description && (
                              <p className="text-sm text-slate-600 mt-1">
                                {description}
                              </p>
                            )}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">
              {selectedPermissions.size}개 권한 선택됨
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onCancel}
                disabled={saving}
                className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    저장 중...
                  </>
                ) : (
                  <>
                    <CheckIcon className="h-4 w-4 mr-2" />
                    권한 저장
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}