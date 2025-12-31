'use client'

import { useState, useEffect } from 'react'
import {
  XMarkIcon,
  UserGroupIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  EyeIcon,
  PencilSquareIcon
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

const ROLE_LABELS: Record<string, string> = {
  vice_director: '부원장',
  manager: '실장',
  team_leader: '팀장',
  staff: '직원'
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
  const [permissions, setPermissions] = useState<Map<string, { can_view: boolean; can_edit: boolean }>>(new Map())

  // 기존 권한 (비교용)
  const [originalPermissions, setOriginalPermissions] = useState<Map<string, { can_view: boolean; can_edit: boolean }>>(new Map())

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

      if (staffResult.error) {
        setError(staffResult.error)
        return
      }

      if (permissionsResult.error) {
        setError(permissionsResult.error)
        return
      }

      setStaffList(staffResult.data || [])

      // 기존 권한을 Map으로 변환
      const permMap = new Map<string, { can_view: boolean; can_edit: boolean }>()
      const originalMap = new Map<string, { can_view: boolean; can_edit: boolean }>()

      for (const perm of (permissionsResult.data || [])) {
        const permData = { can_view: perm.can_view, can_edit: perm.can_edit }
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

  const handleViewToggle = (userId: string) => {
    setPermissions(prev => {
      const newMap = new Map(prev)
      const current = newMap.get(userId) || { can_view: false, can_edit: false }

      if (current.can_view) {
        // 조회 권한 해제 시 수정 권한도 해제
        newMap.set(userId, { can_view: false, can_edit: false })
      } else {
        newMap.set(userId, { ...current, can_view: true })
      }

      return newMap
    })
  }

  const handleEditToggle = (userId: string) => {
    setPermissions(prev => {
      const newMap = new Map(prev)
      const current = newMap.get(userId) || { can_view: false, can_edit: false }

      if (current.can_edit) {
        newMap.set(userId, { ...current, can_edit: false })
      } else {
        // 수정 권한 부여 시 조회 권한도 자동 부여
        newMap.set(userId, { can_view: true, can_edit: true })
      }

      return newMap
    })
  }

  const handleSelectAll = (type: 'view' | 'edit') => {
    setPermissions(prev => {
      const newMap = new Map(prev)

      for (const staff of staffList) {
        const current = newMap.get(staff.id) || { can_view: false, can_edit: false }

        if (type === 'view') {
          newMap.set(staff.id, { ...current, can_view: true })
        } else {
          newMap.set(staff.id, { can_view: true, can_edit: true })
        }
      }

      return newMap
    })
  }

  const handleDeselectAll = () => {
    setPermissions(new Map())
  }

  const hasChanges = () => {
    // 변경 사항 확인
    const allUserIds = new Set([
      ...Array.from(permissions.keys()),
      ...Array.from(originalPermissions.keys())
    ])

    for (const userId of allUserIds) {
      const current = permissions.get(userId) || { can_view: false, can_edit: false }
      const original = originalPermissions.get(userId) || { can_view: false, can_edit: false }

      if (current.can_view !== original.can_view || current.can_edit !== original.can_edit) {
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
      // 변경된 권한만 추출
      const permissionsToUpdate: ProtocolPermissionFormData[] = []
      const permissionsToDelete: string[] = []

      for (const staff of staffList) {
        const current = permissions.get(staff.id)
        const original = originalPermissions.get(staff.id)

        if (!current || (!current.can_view && !current.can_edit)) {
          // 권한이 없거나 모두 해제된 경우
          if (original && (original.can_view || original.can_edit)) {
            // 기존에 권한이 있었다면 삭제
            permissionsToDelete.push(staff.id)
          }
        } else {
          // 권한이 있는 경우
          if (!original || current.can_view !== original.can_view || current.can_edit !== original.can_edit) {
            // 새로 추가되거나 변경된 경우
            permissionsToUpdate.push({
              user_id: staff.id,
              can_view: current.can_view,
              can_edit: current.can_edit
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

      // 원본 권한 업데이트
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

  const getPermissionStatus = (userId: string) => {
    const perm = permissions.get(userId)
    if (!perm || (!perm.can_view && !perm.can_edit)) {
      return 'none'
    }
    if (perm.can_edit) {
      return 'edit'
    }
    return 'view'
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-8 rounded-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">권한 정보를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8">
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
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <XMarkIcon className="h-5 w-5" />
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
                  <li><strong>조회 권한:</strong> 해당 프로토콜을 볼 수 있습니다.</li>
                  <li><strong>수정 권한:</strong> 프로토콜을 수정할 수 있습니다. (조회 권한 자동 포함)</li>
                  <li>대표원장은 모든 프로토콜에 자동으로 접근할 수 있습니다.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 일괄 선택 버튼 */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-slate-700">직원 목록</span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleSelectAll('view')}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
              >
                전체 조회 권한
              </button>
              <button
                onClick={() => handleSelectAll('edit')}
                className="px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100"
              >
                전체 수정 권한
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
                    <th className="text-center px-4 py-3 text-sm font-medium text-slate-600 w-24">
                      <span className="flex items-center justify-center">
                        <EyeIcon className="h-4 w-4 mr-1" />
                        조회
                      </span>
                    </th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-slate-600 w-24">
                      <span className="flex items-center justify-center">
                        <PencilSquareIcon className="h-4 w-4 mr-1" />
                        수정
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffList.map(staff => {
                    const perm = permissions.get(staff.id) || { can_view: false, can_edit: false }
                    const status = getPermissionStatus(staff.id)

                    return (
                      <tr
                        key={staff.id}
                        className={`hover:bg-slate-50 ${
                          status === 'edit'
                            ? 'bg-green-50/50'
                            : status === 'view'
                            ? 'bg-blue-50/50'
                            : ''
                        }`}
                      >
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
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleViewToggle(staff.id)}
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
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleEditToggle(staff.id)}
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
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 권한 요약 */}
          <div className="mt-4 flex items-center justify-between text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-3">
            <span>
              총 {staffList.length}명 중{' '}
              <span className="font-medium text-blue-600">
                {Array.from(permissions.values()).filter(p => p.can_view).length}명
              </span>{' '}
              조회 가능,{' '}
              <span className="font-medium text-green-600">
                {Array.from(permissions.values()).filter(p => p.can_edit).length}명
              </span>{' '}
              수정 가능
            </span>
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
