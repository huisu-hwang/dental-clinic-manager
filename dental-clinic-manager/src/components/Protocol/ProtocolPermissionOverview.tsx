'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  FileText,
  ShieldCheck,
  Users,
  Key,
  Search,
  RefreshCw
} from 'lucide-react'
import { dataService } from '@/lib/dataService'
import PermissionQuickEditor from './PermissionQuickEditor'
import type { ProtocolPermissionFormData } from '@/types'

interface ProtocolPermissionOverviewProps {
  clinicId: string
  currentUserId: string
}

interface PermissionRecord {
  id: string
  protocol_id: string
  user_id: string
  can_view: boolean
  can_edit: boolean
  can_create: boolean
  can_delete: boolean
  granted_by: string
  created_at: string
  updated_at: string
  user_name: string
  user_email: string
  user_role: string
  protocol_title: string
  protocol_status: string
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

const ROLE_ORDER: Record<string, number> = {
  vice_director: 1,
  doctor: 2,
  manager: 3,
  team_leader: 4,
  dental_hygienist: 5,
  dental_assistant: 6,
  coordinator: 7,
  staff: 8,
  intern: 9
}

const STATUS_LABELS: Record<string, string> = {
  draft: '작성중',
  active: '활성',
  archived: '보관됨'
}

const STATUS_ORDER: Record<string, number> = {
  active: 1,
  draft: 2,
  archived: 3
}

type ViewMode = 'staff' | 'protocol'

export default function ProtocolPermissionOverview({
  clinicId,
  currentUserId
}: ProtocolPermissionOverviewProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [permissions, setPermissions] = useState<PermissionRecord[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('staff')
  const [searchTerm, setSearchTerm] = useState('')

  // Quick editor state
  const [editorState, setEditorState] = useState<{
    staffId: string
    staffName: string
    protocolId: string
    protocolTitle: string
    currentPermissions: PermissionData
    position: { x: number; y: number }
  } | null>(null)

  const fetchPermissions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await dataService.getAllProtocolPermissions(clinicId)
      if (result.error) {
        setError(result.error)
      } else {
        setPermissions(result.data || [])
      }
    } catch (err) {
      setError('권한 데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [clinicId])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  // Derive unique staff and protocols
  const { staffList, protocolList } = useMemo(() => {
    const staffMap = new Map<string, { id: string; name: string; email: string; role: string }>()
    const protocolMap = new Map<string, { id: string; title: string; status: string }>()

    for (const p of permissions) {
      if (!staffMap.has(p.user_id)) {
        staffMap.set(p.user_id, { id: p.user_id, name: p.user_name, email: p.user_email, role: p.user_role })
      }
      if (!protocolMap.has(p.protocol_id)) {
        protocolMap.set(p.protocol_id, { id: p.protocol_id, title: p.protocol_title, status: p.protocol_status })
      }
    }

    const staffList = Array.from(staffMap.values()).sort((a, b) => {
      const roleA = ROLE_ORDER[a.role] ?? 99
      const roleB = ROLE_ORDER[b.role] ?? 99
      if (roleA !== roleB) return roleA - roleB
      return a.name.localeCompare(b.name, 'ko')
    })

    const protocolList = Array.from(protocolMap.values()).sort((a, b) => {
      const statusA = STATUS_ORDER[a.status] ?? 99
      const statusB = STATUS_ORDER[b.status] ?? 99
      if (statusA !== statusB) return statusA - statusB
      return a.title.localeCompare(b.title, 'ko')
    })

    return { staffList, protocolList }
  }, [permissions])

  // Build permission lookup map: `${userId}:${protocolId}` -> PermissionData
  const permLookup = useMemo(() => {
    const map = new Map<string, PermissionData>()
    for (const p of permissions) {
      map.set(`${p.user_id}:${p.protocol_id}`, {
        can_view: p.can_view,
        can_edit: p.can_edit,
        can_create: p.can_create,
        can_delete: p.can_delete
      })
    }
    return map
  }, [permissions])

  // Filter by search term
  const filteredStaff = useMemo(() => {
    if (!searchTerm) return staffList
    const term = searchTerm.toLowerCase()
    return staffList.filter(s =>
      s.name.toLowerCase().includes(term) ||
      (ROLE_LABELS[s.role] || '').toLowerCase().includes(term)
    )
  }, [staffList, searchTerm])

  const filteredProtocols = useMemo(() => {
    if (!searchTerm) return protocolList
    const term = searchTerm.toLowerCase()
    return protocolList.filter(p =>
      p.title.toLowerCase().includes(term)
    )
  }, [protocolList, searchTerm])

  // Summary stats
  const stats = useMemo(() => {
    const uniqueProtocols = new Set(permissions.map(p => p.protocol_id))
    const uniqueStaff = new Set(permissions.map(p => p.user_id))
    // Count protocols that have at least one permission set
    const protocolsWithPerms = new Set(
      permissions.filter(p => p.can_view || p.can_edit || p.can_create || p.can_delete)
        .map(p => p.protocol_id)
    )
    return {
      totalProtocols: uniqueProtocols.size,
      protocolsWithPerms: protocolsWithPerms.size,
      totalStaff: uniqueStaff.size,
      totalPermissions: permissions.length
    }
  }, [permissions])

  const handleCellClick = (
    staffId: string,
    staffName: string,
    protocolId: string,
    protocolTitle: string,
    e: React.MouseEvent
  ) => {
    const perm = permLookup.get(`${staffId}:${protocolId}`) || {
      can_view: false, can_edit: false, can_create: false, can_delete: false
    }
    setEditorState({
      staffId,
      staffName,
      protocolId,
      protocolTitle,
      currentPermissions: perm,
      position: { x: e.clientX, y: e.clientY }
    })
  }

  const handleSavePermission = async (staffId: string, protocolId: string, newPerms: PermissionData) => {
    const hasAnyPerm = newPerms.can_view || newPerms.can_edit || newPerms.can_create || newPerms.can_delete

    if (!hasAnyPerm) {
      // Delete permission
      const result = await dataService.deleteProtocolPermission(protocolId, staffId)
      if (result.error) {
        setError(result.error)
        return
      }
    } else {
      // Upsert permission
      const permData: ProtocolPermissionFormData = {
        user_id: staffId,
        can_view: newPerms.can_view,
        can_edit: newPerms.can_edit,
        can_create: newPerms.can_create,
        can_delete: newPerms.can_delete
      }
      const result = await dataService.setProtocolPermissionsBatch(protocolId, [permData], currentUserId)
      if (result.error) {
        setError(result.error)
        return
      }
    }

    // Update local state without re-fetching
    setPermissions(prev => {
      const key = `${staffId}:${protocolId}`
      const existing = prev.find(p => p.user_id === staffId && p.protocol_id === protocolId)

      if (!hasAnyPerm) {
        // Remove record
        return prev.filter(p => !(p.user_id === staffId && p.protocol_id === protocolId))
      }

      if (existing) {
        // Update existing record
        return prev.map(p =>
          p.user_id === staffId && p.protocol_id === protocolId
            ? { ...p, ...newPerms }
            : p
        )
      }

      // This is a new permission that wasn't in the list before.
      // We need to refetch to get the proper record with all fields.
      fetchPermissions()
      return prev
    })

    setEditorState(null)
  }

  // Render permission dots for a cell
  const renderDots = (perm: PermissionData | undefined) => {
    const p = perm || { can_view: false, can_edit: false, can_create: false, can_delete: false }
    const dots: Array<{ active: boolean; color: string; title: string }> = [
      { active: p.can_view, color: 'bg-blue-500', title: '조회' },
      { active: p.can_edit, color: 'bg-green-500', title: '수정' },
      { active: p.can_create, color: 'bg-purple-500', title: '생성' },
      { active: p.can_delete, color: 'bg-red-500', title: '삭제' }
    ]

    const hasAny = dots.some(d => d.active)

    return (
      <div className="flex items-center justify-center gap-1" title={
        dots.map(d => `${d.title}: ${d.active ? 'O' : 'X'}`).join(', ')
      }>
        {dots.map((d, i) => (
          <span
            key={i}
            className={`w-2.5 h-2.5 rounded-full ${d.active ? d.color : 'bg-slate-200'}`}
          />
        ))}
      </div>
    )
  }

  const getStatusBadgeClass = (status: string) => {
    const classes: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-600',
      active: 'bg-green-100 text-green-700',
      archived: 'bg-slate-100 text-slate-500'
    }
    return classes[status] || 'bg-gray-100 text-gray-600'
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4" />
        <p className="text-slate-600">권한 현황을 불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-50 text-purple-600">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">권한 현황 대시보드</h3>
        </div>
        <button
          onClick={fetchPermissions}
          className="flex items-center px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4 mr-1.5" />
          새로고침
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-200">
          <div className="flex items-center space-x-2 mb-1">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-slate-500">총 프로토콜</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.totalProtocols}<span className="text-sm font-normal text-slate-500 ml-1">개</span></p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-200">
          <div className="flex items-center space-x-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-green-500" />
            <span className="text-xs text-slate-500">권한 설정됨</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.protocolsWithPerms}<span className="text-sm font-normal text-slate-500 ml-1">개</span></p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-200">
          <div className="flex items-center space-x-2 mb-1">
            <Users className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-slate-500">권한 부여 직원</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.totalStaff}<span className="text-sm font-normal text-slate-500 ml-1">명</span></p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-200">
          <div className="flex items-center space-x-2 mb-1">
            <Key className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-slate-500">총 권한 수</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.totalPermissions}<span className="text-sm font-normal text-slate-500 ml-1">개</span></p>
        </div>
      </div>

      {/* View Toggle + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('staff')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'staff'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            직원별 보기
          </button>
          <button
            onClick={() => setViewMode('protocol')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'protocol'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            프로토콜별 보기
          </button>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="직원명 또는 프로토콜명 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="font-medium text-slate-600">범례:</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />조회</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />수정</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" />생성</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />삭제</span>
        <span className="text-slate-400 ml-2">셀 클릭으로 빠른 편집</span>
      </div>

      {/* Matrix */}
      {permissions.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-1">아직 설정된 권한이 없습니다.</p>
          <p className="text-sm text-slate-400">프로토콜 목록에서 개별 프로토콜의 권한을 설정해 주세요.</p>
        </div>
      ) : viewMode === 'staff' ? (
        /* Staff-Centric Matrix */
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 z-10 bg-slate-50 text-left px-4 py-3 text-sm font-medium text-slate-600 border-b border-r border-slate-200 min-w-[180px]">
                    직원 (직급)
                  </th>
                  {(searchTerm ? filteredProtocols : protocolList).map(protocol => (
                    <th
                      key={protocol.id}
                      className="text-center px-3 py-3 text-xs font-medium text-slate-600 border-b border-slate-200 min-w-[100px]"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="truncate max-w-[90px]" title={protocol.title}>{protocol.title}</span>
                        <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full ${getStatusBadgeClass(protocol.status)}`}>
                          {STATUS_LABELS[protocol.status] || protocol.status}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map(staff => (
                  <tr key={staff.id} className="hover:bg-slate-50/50">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 border-r border-slate-200">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{staff.name}</p>
                        <span className="text-xs text-slate-500">{ROLE_LABELS[staff.role] || staff.role}</span>
                      </div>
                    </td>
                    {(searchTerm ? filteredProtocols : protocolList).map(protocol => {
                      const perm = permLookup.get(`${staff.id}:${protocol.id}`)
                      return (
                        <td
                          key={protocol.id}
                          className="text-center px-3 py-3 cursor-pointer hover:bg-blue-50/50 transition-colors"
                          onClick={(e) => handleCellClick(staff.id, staff.name, protocol.id, protocol.title, e)}
                        >
                          {renderDots(perm)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Protocol-Centric Matrix */
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 z-10 bg-slate-50 text-left px-4 py-3 text-sm font-medium text-slate-600 border-b border-r border-slate-200 min-w-[200px]">
                    프로토콜 (상태)
                  </th>
                  {(searchTerm ? filteredStaff : staffList).map(staff => (
                    <th
                      key={staff.id}
                      className="text-center px-3 py-3 text-xs font-medium text-slate-600 border-b border-slate-200 min-w-[100px]"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="truncate max-w-[90px]" title={staff.name}>{staff.name}</span>
                        <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 text-slate-600">
                          {ROLE_LABELS[staff.role] || staff.role}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProtocols.map(protocol => (
                  <tr key={protocol.id} className="hover:bg-slate-50/50">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 border-r border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800 truncate max-w-[140px]" title={protocol.title}>
                          {protocol.title}
                        </span>
                        <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full whitespace-nowrap ${getStatusBadgeClass(protocol.status)}`}>
                          {STATUS_LABELS[protocol.status] || protocol.status}
                        </span>
                      </div>
                    </td>
                    {(searchTerm ? filteredStaff : staffList).map(staff => {
                      const perm = permLookup.get(`${staff.id}:${protocol.id}`)
                      return (
                        <td
                          key={staff.id}
                          className="text-center px-3 py-3 cursor-pointer hover:bg-blue-50/50 transition-colors"
                          onClick={(e) => handleCellClick(staff.id, staff.name, protocol.id, protocol.title, e)}
                        >
                          {renderDots(perm)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Editor Popover */}
      {editorState && (
        <PermissionQuickEditor
          staffId={editorState.staffId}
          staffName={editorState.staffName}
          protocolId={editorState.protocolId}
          protocolTitle={editorState.protocolTitle}
          currentPermissions={editorState.currentPermissions}
          position={editorState.position}
          onSave={handleSavePermission}
          onClose={() => setEditorState(null)}
        />
      )}
    </div>
  )
}
