'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { FileText, ShieldCheck, Users, Key, Search, RefreshCw } from 'lucide-react'
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

interface StaffMember { id: string; name: string; email: string; role: string }
interface ProtocolItem { id: string; title: string; status: string }

const ROLE_LABELS: Record<string, string> = {
  owner: '대표원장', vice_director: '부원장', doctor: '원장', manager: '실장',
  team_leader: '팀장', dental_hygienist: '치과위생사', dental_assistant: '치과조무사',
  coordinator: '코디네이터', staff: '직원', intern: '인턴'
}

const ROLE_ORDER: Record<string, number> = {
  vice_director: 1, doctor: 2, manager: 3, team_leader: 4,
  dental_hygienist: 5, dental_assistant: 6, coordinator: 7, staff: 8, intern: 9
}

const STATUS_LABELS: Record<string, string> = { draft: '작성중', active: '활성', archived: '보관됨' }
const STATUS_ORDER: Record<string, number> = { active: 1, draft: 2, archived: 3 }

type ViewMode = 'staff' | 'protocol'

export default function ProtocolPermissionOverview({ clinicId, currentUserId }: ProtocolPermissionOverviewProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [permissions, setPermissions] = useState<PermissionRecord[]>([])
  const [allStaff, setAllStaff] = useState<StaffMember[]>([])
  const [allProtocols, setAllProtocols] = useState<ProtocolItem[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('staff')
  const [searchTerm, setSearchTerm] = useState('')
  const [editorState, setEditorState] = useState<{
    staffId: string; staffName: string; protocolId: string; protocolTitle: string
    currentPermissions: PermissionData; position: { x: number; y: number }
  } | null>(null)

  const fetchAllData = useCallback(async () => {
    setError('')
    try {
      const [permResult, staffResult, protocolResult] = await Promise.all([
        dataService.getAllProtocolPermissions(clinicId),
        dataService.getClinicStaffForPermission(clinicId),
        dataService.getProtocols(clinicId)
      ])
      if (permResult.error) { setError(permResult.error) } else { setPermissions(permResult.data || []) }
      if (!staffResult.error) setAllStaff(staffResult.data || [])
      if (!protocolResult.error) {
        const protocols = (protocolResult.data || []) as Array<{ id: string; title: string; status: string }>
        setAllProtocols(protocols.map(p => ({ id: p.id, title: p.title, status: p.status })))
      }
    } catch {
      setError('데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [clinicId])

  useEffect(() => { fetchAllData() }, [fetchAllData])

  const sortedStaff = useMemo(() => [...allStaff].sort((a, b) => {
    const diff = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)
    return diff !== 0 ? diff : a.name.localeCompare(b.name, 'ko')
  }), [allStaff])

  const sortedProtocols = useMemo(() => [...allProtocols].sort((a, b) => {
    const diff = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
    return diff !== 0 ? diff : a.title.localeCompare(b.title, 'ko')
  }), [allProtocols])

  const permLookup = useMemo(() => {
    const map = new Map<string, PermissionData>()
    for (const p of permissions) {
      map.set(`${p.user_id}:${p.protocol_id}`, { can_view: p.can_view, can_edit: p.can_edit, can_create: p.can_create, can_delete: p.can_delete })
    }
    return map
  }, [permissions])

  const filteredStaff = useMemo(() => {
    if (!searchTerm) return sortedStaff
    const term = searchTerm.toLowerCase()
    return sortedStaff.filter(s => s.name.toLowerCase().includes(term) || (ROLE_LABELS[s.role] || '').toLowerCase().includes(term))
  }, [sortedStaff, searchTerm])

  const filteredProtocols = useMemo(() => {
    if (!searchTerm) return sortedProtocols
    const term = searchTerm.toLowerCase()
    return sortedProtocols.filter(p => p.title.toLowerCase().includes(term))
  }, [sortedProtocols, searchTerm])

  const stats = useMemo(() => {
    const active = permissions.filter(p => p.can_view || p.can_edit || p.can_create || p.can_delete)
    return {
      totalProtocols: allProtocols.length,
      protocolsWithPerms: new Set(active.map(p => p.protocol_id)).size,
      totalStaff: new Set(active.map(p => p.user_id)).size,
      totalPermissions: active.length
    }
  }, [permissions, allProtocols])

  const handleCellClick = (staffId: string, staffName: string, protocolId: string, protocolTitle: string, e: React.MouseEvent) => {
    const perm = permLookup.get(`${staffId}:${protocolId}`) || { can_view: false, can_edit: false, can_create: false, can_delete: false }
    setEditorState({ staffId, staffName, protocolId, protocolTitle, currentPermissions: perm, position: { x: e.clientX, y: e.clientY } })
  }

  const handleSavePermission = async (staffId: string, protocolId: string, newPerms: PermissionData) => {
    const hasAnyPerm = newPerms.can_view || newPerms.can_edit || newPerms.can_create || newPerms.can_delete
    if (!hasAnyPerm) {
      const result = await dataService.deleteProtocolPermission(protocolId, staffId)
      if (result.error) { setError(result.error); return }
    } else {
      const permData: ProtocolPermissionFormData = { user_id: staffId, ...newPerms }
      const result = await dataService.setProtocolPermissionsBatch(protocolId, [permData], currentUserId)
      if (result.error) { setError(result.error); return }
    }
    setPermissions(prev => {
      if (!hasAnyPerm) return prev.filter(p => !(p.user_id === staffId && p.protocol_id === protocolId))
      const existing = prev.find(p => p.user_id === staffId && p.protocol_id === protocolId)
      if (existing) return prev.map(p => p.user_id === staffId && p.protocol_id === protocolId ? { ...p, ...newPerms } : p)
      const staff = allStaff.find(s => s.id === staffId)
      const protocol = allProtocols.find(p => p.id === protocolId)
      return [...prev, {
        id: `temp-${Date.now()}`, protocol_id: protocolId, user_id: staffId, ...newPerms,
        granted_by: currentUserId, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        user_name: staff?.name || '알 수 없음', user_email: staff?.email || '', user_role: staff?.role || '',
        protocol_title: protocol?.title || '알 수 없음', protocol_status: protocol?.status || ''
      }]
    })
    setEditorState(null)
  }

  const renderDots = (perm: PermissionData | undefined) => {
    const p = perm || { can_view: false, can_edit: false, can_create: false, can_delete: false }
    const dots = [
      { active: p.can_view, color: 'bg-at-accent', title: '조회' },
      { active: p.can_edit, color: 'bg-at-success', title: '수정' },
      { active: p.can_create, color: 'bg-purple-500', title: '생성' },
      { active: p.can_delete, color: 'bg-at-error', title: '삭제' }
    ]
    return (
      <div className="flex items-center justify-center gap-1" title={dots.map(d => `${d.title}: ${d.active ? 'O' : 'X'}`).join(', ')}>
        {dots.map((d, i) => <span key={i} className={`w-2.5 h-2.5 rounded-full ${d.active ? d.color : 'bg-at-border'}`} />)}
      </div>
    )
  }

  const getStatusBadgeClass = (status: string) => ({
    draft: 'bg-at-surface-alt text-at-text-secondary',
    active: 'bg-at-success-bg text-at-success',
    archived: 'bg-at-surface-alt text-at-text-weak'
  }[status] || 'bg-at-surface-alt text-at-text-secondary')

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent mx-auto mb-4" />
        <p className="text-at-text-secondary">권한 현황을 불러오는 중...</p>
      </div>
    )
  }

  const displayStaff = searchTerm ? filteredStaff : sortedStaff
  const displayProtocols = searchTerm ? filteredProtocols : sortedProtocols

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-at-accent-light text-at-accent">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h3 className="text-base font-semibold text-at-text">권한 현황 대시보드</h3>
        </div>
        <button onClick={fetchAllData} className="flex items-center px-3 py-1.5 text-sm text-at-text-secondary hover:bg-at-surface-hover rounded-xl transition-colors">
          <RefreshCw className="w-4 h-4 mr-1.5" />새로고침
        </button>
      </div>

      {error && <div className="bg-at-error-bg border border-red-200 text-at-error px-4 py-3 rounded-xl text-sm">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <FileText className="w-4 h-4 text-at-accent" />, label: '총 프로토콜', value: stats.totalProtocols },
          { icon: <ShieldCheck className="w-4 h-4 text-at-success" />, label: '권한 설정됨', value: stats.protocolsWithPerms },
          { icon: <Users className="w-4 h-4 text-purple-500" />, label: '권한 부여 직원', value: stats.totalStaff },
          { icon: <Key className="w-4 h-4 text-at-warning" />, label: '총 권한 수', value: stats.totalPermissions },
        ].map(({ icon, label, value }) => (
          <div key={label} className="bg-white rounded-2xl p-4 shadow-at-card border border-at-border">
            <div className="flex items-center space-x-2 mb-1">{icon}<span className="text-xs text-at-text-weak">{label}</span></div>
            <p className="text-2xl font-bold text-at-text">{value}<span className="text-sm font-normal text-at-text-weak ml-1">개</span></p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex bg-at-surface-alt rounded-xl p-1">
          {(['staff', 'protocol'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                viewMode === mode ? 'bg-white text-at-accent shadow-sm' : 'text-at-text-weak hover:text-at-text'
              }`}
            >
              {mode === 'staff' ? '직원별 보기' : '프로토콜별 보기'}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-at-text-weak" />
          <input
            type="text"
            placeholder="직원명 또는 프로토콜명 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-at-text-weak">
        <span className="font-medium text-at-text-secondary">범례:</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-at-accent" />조회</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-at-success" />수정</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" />생성</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-at-error" />삭제</span>
        <span className="text-at-text-weak ml-2">셀 클릭으로 빠른 편집</span>
      </div>

      {displayStaff.length === 0 || displayProtocols.length === 0 ? (
        <div className="text-center py-12 bg-at-surface-alt rounded-2xl">
          <ShieldCheck className="w-12 h-12 text-at-text-weak mx-auto mb-4" />
          <p className="text-at-text-secondary mb-1">
            {allStaff.length === 0 && allProtocols.length === 0 ? '직원과 프로토콜이 없습니다.'
              : allStaff.length === 0 ? '권한을 부여할 직원이 없습니다.'
              : allProtocols.length === 0 ? '등록된 프로토콜이 없습니다.'
              : '검색 결과가 없습니다.'}
          </p>
          <p className="text-sm text-at-text-weak">
            {allStaff.length === 0 ? '승인된 직원이 등록되면 여기에 표시됩니다.'
              : allProtocols.length === 0 ? '프로토콜을 먼저 작성해 주세요.'
              : '다른 검색어를 시도해 보세요.'}
          </p>
        </div>
      ) : viewMode === 'staff' ? (
        <div className="border border-at-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="bg-at-surface-alt">
                  <th className="sticky left-0 z-10 bg-at-surface-alt text-left px-4 py-3 text-sm font-medium text-at-text-secondary border-b border-r border-at-border min-w-[180px]">직원 (직급)</th>
                  {displayProtocols.map(protocol => (
                    <th key={protocol.id} className="text-center px-3 py-3 text-xs font-medium text-at-text-secondary border-b border-at-border min-w-[100px]">
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
              <tbody className="divide-y divide-at-border">
                {displayStaff.map(staff => (
                  <tr key={staff.id} className="hover:bg-at-surface-hover">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 border-r border-at-border">
                      <p className="text-sm font-medium text-at-text">{staff.name}</p>
                      <span className="text-xs text-at-text-weak">{ROLE_LABELS[staff.role] || staff.role}</span>
                    </td>
                    {displayProtocols.map(protocol => (
                      <td key={protocol.id} className="text-center px-3 py-3 cursor-pointer hover:bg-at-accent-light transition-colors"
                        onClick={(e) => handleCellClick(staff.id, staff.name, protocol.id, protocol.title, e)}>
                        {renderDots(permLookup.get(`${staff.id}:${protocol.id}`))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="border border-at-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="bg-at-surface-alt">
                  <th className="sticky left-0 z-10 bg-at-surface-alt text-left px-4 py-3 text-sm font-medium text-at-text-secondary border-b border-r border-at-border min-w-[200px]">프로토콜 (상태)</th>
                  {displayStaff.map(staff => (
                    <th key={staff.id} className="text-center px-3 py-3 text-xs font-medium text-at-text-secondary border-b border-at-border min-w-[100px]">
                      <div className="flex flex-col items-center gap-1">
                        <span className="truncate max-w-[90px]" title={staff.name}>{staff.name}</span>
                        <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-at-surface-alt text-at-text-secondary">
                          {ROLE_LABELS[staff.role] || staff.role}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-at-border">
                {displayProtocols.map(protocol => (
                  <tr key={protocol.id} className="hover:bg-at-surface-hover">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 border-r border-at-border">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-at-text truncate max-w-[140px]" title={protocol.title}>{protocol.title}</span>
                        <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full whitespace-nowrap ${getStatusBadgeClass(protocol.status)}`}>
                          {STATUS_LABELS[protocol.status] || protocol.status}
                        </span>
                      </div>
                    </td>
                    {displayStaff.map(staff => (
                      <td key={staff.id} className="text-center px-3 py-3 cursor-pointer hover:bg-at-accent-light transition-colors"
                        onClick={(e) => handleCellClick(staff.id, staff.name, protocol.id, protocol.title, e)}>
                        {renderDots(permLookup.get(`${staff.id}:${protocol.id}`))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
