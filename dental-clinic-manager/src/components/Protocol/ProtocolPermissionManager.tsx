'use client'

import { useState, useEffect } from 'react'
import {
  XMarkIcon,
  UserGroupIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  EyeIcon,
  PencilSquareIcon,
  PlusCircleIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import { dataService } from '@/lib/dataService'
import type { ProtocolPermission, ProtocolPermissionFormData } from '@/types'

interface StaffMember {
  id: string
  name: string
  email: string
  role: string
}

interface ProtocolPermissionManagerProps {
  protocolId: string
  protocolTitle: string
  clinicId: string
  currentUserId: string
  onClose: () => void
  onSave?: () => void
}

interface PermissionData {
  can_view: boolean
  can_edit: boolean
  can_create: boolean
  can_delete: boolean
}

const ROLE_LABELS: Record<string, string> = {
  owner: '대표원장',
  vice_director: '부원장',
  doctor: '원장',
  manager: '실장',
  team_leader: '팀장',
  dental_hygienist: '치과위생사',
  dental_assistant: '치과조무사',
  coordinator: '코디네이터',
  staff: '직원',
  intern: '인턴'
}

const DEFAULT_PERMISSION: PermissionData = {
  can_view: false,
  can_edit: false,
  can_create: false,
  can_delete: false
}

export default function ProtocolPermissionManager({
  protocolId,
  protocolTitle,
  clinicId,
  currentUserId,
  onClose,
  onSave
}: ProtocolPermissionManagerProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // 직원 목록
  const [staffList, setStaffList] = useState<StaffMember[]>([])

  // 현재 권한 설정
  const [permissions, setPermissions] = useState<Map<string, PermissionData>>(new Map())

  // 기존 권한 (비교용)
  const [originalPermissions, setOriginalPermissions] = useState<Map<string, PermissionData>>(new Map())

  useEffect(() => {
    fetchData()
  }, [protocolId, clinicId])

  const fetchData = async () => {
    setLoading(true)
    setError('')

    try {
      // 직원 목록과 현재 권한 동시 조회
      const [staffResult, permissionsResult] = await Promise.all([
        dataService.getClinicStaffForPermission(clinicId),
        dataService.getProtocolPermissions(protocolId)
      ])

      console.log('[ProtocolPermissionManager] clinicId:', clinicId)
      console.log('[ProtocolPermissionManager] staffResult:', staffResult)
      console.log('[ProtocolPermissionManager] permissionsResult:', permissionsResult)

      if (staffResult.error) {
        setError(staffResult.error)
        return
      }

      if (permissionsResult.error) {
        setError(permissionsResult.error)
        return
      }

      console.log('[ProtocolPermissionManager] Staff count:', staffResult.data?.length || 0)
      setStaffList(staffResult.data || [])

      // 기존 권한을 Map으로 변환
      const permMap = new Map<string, PermissionData>()
      const originalMap = new Map<string, PermissionData>()

      for (const perm of (permissionsResult.data || [])) {
        const permData: PermissionData = {
          can_view: perm.can_view,
          can_edit: perm.can_edit,
          can_create: perm.can_create ?? false,
          can_delete: perm.can_delete ?? false
        }
        permMap.set(perm.user_id, permData)
        originalMap.set(perm.user_id, { ...permData })
      }

      setPermissions(permMap)
      setOriginalPermissions(originalMap)
    } catch (err) {
      console.error('Failed to fetch data:', err)
      setError('데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handlePermissionToggle = (userId: string, permType: keyof PermissionData) => {
    setPermissions(prev => {
      const newMap = new Map(prev)
      const current = newMap.get(userId) || { ...DEFAULT_PERMISSION }

      if (permType === 'can_view') {
        if (current.can_view) {
          // 조회 권한 해제 시 모든 권한 해제
          newMap.set(userId, { ...DEFAULT_PERMISSION })
        } else {
          newMap.set(userId, { ...current, can_view: true })
        }
      } else if (permType === 'can_edit') {
        if (current.can_edit) {
          newMap.set(userId, { ...current, can_edit: false })
        } else {
          // 수정 권한 부여 시 조회 권한도 자동 부여
          newMap.set(userId, { ...current, can_view: true, can_edit: true })
        }
      } else if (permType === 'can_create') {
        if (current.can_create) {
          newMap.set(userId, { ...current, can_create: false })
        } else {
          // 생성 권한 부여 시 조회 권한도 자동 부여
          newMap.set(userId, { ...current, can_view: true, can_create: true })
        }
      } else if (permType === 'can_delete') {
        if (current.can_delete) {
          newMap.set(userId, { ...current, can_delete: false })
        } else {
          // 삭제 권한 부여 시 조회 권한도 자동 부여
          newMap.set(userId, { ...current, can_view: true, can_delete: true })
        }
      }

      return newMap
    })
  }

  const handleSelectAll = (type: keyof PermissionData) => {
    setPermissions(prev => {
      const newMap = new Map(prev)

      for (const staff of staffList) {
        const current = newMap.get(staff.id) || { ...DEFAULT_PERMISSION }

        if (type === 'can_view') {
          newMap.set(staff.id, { ...current, can_view: true })
        } else if (type === 'can_edit') {
          newMap.set(staff.id, { ...current, can_view: true, can_edit: true })
        } else if (type === 'can_create') {
          newMap.set(staff.id, { ...current, can_view: true, can_create: true })
        } else if (type === 'can_delete') {
          newMap.set(staff.id, { ...current, can_view: true, can_delete: true })
        }
      }

      return newMap
    })
  }

  const handleSelectAllPermissions = () => {
    setPermissions(prev => {
      const newMap = new Map(prev)

      for (const staff of staffList) {
        newMap.set(staff.id, {
          can_view: true,
          can_edit: true,
          can_create: true,
          can_delete: true
        })
      }

      return newMap
    })
  }

  const handleDeselectAll = () => {
    setPermissions(new Map())
  }

  const hasChanges = () => {
    const allUserIds = new Set([
      ...Array.from(permissions.keys()),
      ...Array.from(originalPermissions.keys())
    ])

    for (const userId of allUserIds) {
      const current = permissions.get(userId) || { ...DEFAULT_PERMISSION }
      const original = originalPermissions.get(userId) || { ...DEFAULT_PERMISSION }

      if (
        current.can_view !== original.can_view ||
        current.can_edit !== original.can_edit ||
        current.can_create !== original.can_create ||
        current.can_delete !== original.can_delete
      ) {
        return true
      }
    }

    return false
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const permissionsToUpdate: ProtocolPermissionFormData[] = []
      const permissionsToDelete: string[] = []

      for (const staff of staffList) {
        const current = permissions.get(staff.id)
        const original = originalPermissions.get(staff.id)

        const hasNoPermission = !current || (!current.can_view && !current.can_edit && !current.can_create && !current.can_delete)
        const hadPermission = original && (original.can_view || original.can_edit || original.can_create || original.can_delete)

        if (hasNoPermission) {
          if (hadPermission) {
            permissionsToDelete.push(staff.id)
          }
        } else if (current) {
          const isChanged = !original ||
            current.can_view !== original.can_view ||
            current.can_edit !== original.can_edit ||
            current.can_create !== original.can_create ||
            current.can_delete !== original.can_delete

          if (isChanged) {
            permissionsToUpdate.push({
              user_id: staff.id,
              can_view: current.can_view,
              can_edit: current.can_edit,
              can_create: current.can_create,
              can_delete: current.can_delete
            })
          }
        }
      }

      // 삭제할 권한 처리
      for (const userId of permissionsToDelete) {
        const result = await dataService.deleteProtocolPermission(protocolId, userId)
        if (result.error) {
          throw new Error(result.error)
        }
      }

      // 추가/수정할 권한 처리
      if (permissionsToUpdate.length > 0) {
        const result = await dataService.setProtocolPermissionsBatch(
          protocolId,
          permissionsToUpdate,
          currentUserId
        )
        if (result.error) {
          throw new Error(result.error)
        }
      }

      setSuccess('권한이 저장되었습니다.')
      setOriginalPermissions(new Map(permissions))

      if (onSave) {
        onSave()
      }

      setTimeout(() => {
        setSuccess('')
      }, 3000)
    } catch (err) {
      console.error('Failed to save permissions:', err)
      setError(err instanceof Error ? err.message : '권한 저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const countPermissions = (type: keyof PermissionData) => {
    return Array.from(permissions.values()).filter(p => p[type]).length
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
        <div className="bg-white p-8 rounded-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">권한 정보를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-8">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <ShieldCheckIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">프로토콜 접근 권한 관리</h2>
              <p className="text-sm text-slate-500">{protocolTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 border border-slate-300"
            title="닫기"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-600 rounded-lg text-sm flex items-center">
              <CheckCircleIcon className="h-5 w-5 mr-2" />
              {success}
            </div>
          )}

          {/* 설명 */}
          <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-lg">
            <div className="flex items-start space-x-2">
              <UserGroupIcon className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">접근 권한 안내</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700">
                  <li><strong>조회:</strong> 해당 프로토콜을 볼 수 있습니다.</li>
                  <li><strong>수정:</strong> 프로토콜 내용을 수정할 수 있습니다.</li>
                  <li><strong>생성:</strong> 새로운 프로토콜을 생성할 수 있습니다.</li>
                  <li><strong>삭제:</strong> 프로토콜을 삭제할 수 있습니다.</li>
                  <li>대표원장은 모든 권한을 자동으로 보유합니다.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 일괄 선택 버튼 */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <span className="text-sm font-medium text-slate-700">직원 목록 ({staffList.length}명)</span>
            <div className="flex items-center flex-wrap gap-2">
              <button
                onClick={() => handleSelectAll('can_view')}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
              >
                전체 조회
              </button>
              <button
                onClick={() => handleSelectAll('can_edit')}
                className="px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100"
              >
                전체 수정
              </button>
              <button
                onClick={() => handleSelectAll('can_create')}
                className="px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100"
              >
                전체 생성
              </button>
              <button
                onClick={() => handleSelectAll('can_delete')}
                className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
              >
                전체 삭제
              </button>
              <button
                onClick={handleSelectAllPermissions}
                className="px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100"
              >
                모든 권한
              </button>
              <button
                onClick={handleDeselectAll}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                전체 해제
              </button>
            </div>
          </div>

          {/* 직원 목록 */}
          {staffList.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-lg">
              <UserGroupIcon className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">권한을 부여할 직원이 없습니다.</p>
              <p className="text-sm text-slate-400 mt-1">승인된 직원만 목록에 표시됩니다.</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">직원</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">직급</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-slate-600 w-16">
                      <span className="flex items-center justify-center" title="조회 권한">
                        <EyeIcon className="h-4 w-4" />
                      </span>
                    </th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-slate-600 w-16">
                      <span className="flex items-center justify-center" title="수정 권한">
                        <PencilSquareIcon className="h-4 w-4" />
                      </span>
                    </th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-slate-600 w-16">
                      <span className="flex items-center justify-center" title="생성 권한">
                        <PlusCircleIcon className="h-4 w-4" />
                      </span>
                    </th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-slate-600 w-16">
                      <span className="flex items-center justify-center" title="삭제 권한">
                        <TrashIcon className="h-4 w-4" />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffList.map(staff => {
                    const perm = permissions.get(staff.id) || { ...DEFAULT_PERMISSION }

                    return (
                      <tr key={staff.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-slate-800">{staff.name}</p>
                            <p className="text-xs text-slate-500">{staff.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-700">
                            {ROLE_LABELS[staff.role] || staff.role}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <button
                            onClick={() => handlePermissionToggle(staff.id, 'can_view')}
                            className={`p-2 rounded-lg transition-colors ${
                              perm.can_view
                                ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                            title={perm.can_view ? '조회 권한 해제' : '조회 권한 부여'}
                          >
                            <EyeIcon className="h-5 w-5" />
                          </button>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <button
                            onClick={() => handlePermissionToggle(staff.id, 'can_edit')}
                            className={`p-2 rounded-lg transition-colors ${
                              perm.can_edit
                                ? 'bg-green-100 text-green-600 hover:bg-green-200'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                            title={perm.can_edit ? '수정 권한 해제' : '수정 권한 부여'}
                          >
                            <PencilSquareIcon className="h-5 w-5" />
                          </button>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <button
                            onClick={() => handlePermissionToggle(staff.id, 'can_create')}
                            className={`p-2 rounded-lg transition-colors ${
                              perm.can_create
                                ? 'bg-purple-100 text-purple-600 hover:bg-purple-200'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                            title={perm.can_create ? '생성 권한 해제' : '생성 권한 부여'}
                          >
                            <PlusCircleIcon className="h-5 w-5" />
                          </button>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <button
                            onClick={() => handlePermissionToggle(staff.id, 'can_delete')}
                            className={`p-2 rounded-lg transition-colors ${
                              perm.can_delete
                                ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                            title={perm.can_delete ? '삭제 권한 해제' : '삭제 권한 부여'}
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 권한 요약 */}
          <div className="mt-4 flex items-center justify-between text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-3 flex-wrap gap-2">
            <div className="flex flex-wrap gap-3">
              <span>
                <span className="font-medium text-blue-600">{countPermissions('can_view')}</span> 조회
              </span>
              <span>
                <span className="font-medium text-green-600">{countPermissions('can_edit')}</span> 수정
              </span>
              <span>
                <span className="font-medium text-purple-600">{countPermissions('can_create')}</span> 생성
              </span>
              <span>
                <span className="font-medium text-red-600">{countPermissions('can_delete')}</span> 삭제
              </span>
            </div>
            {hasChanges() && (
              <span className="text-amber-600 font-medium">변경 사항 있음</span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges()}
            className={`px-4 py-2 text-white rounded-lg flex items-center ${
              saving || !hasChanges()
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                저장 중...
              </>
            ) : (
              <>
                <CheckCircleIcon className="h-5 w-5 mr-2" />
                저장
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
