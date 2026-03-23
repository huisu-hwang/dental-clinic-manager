'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  FileText,
  Plus,
  Search,
  Clock,
  Tag,
  Folder,
  Eye,
  Pencil,
  Trash2,
  Filter,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Lock,
  Scissors
} from 'lucide-react'
import {
  DndContext, DragOverlay, closestCenter,
  PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { dataService } from '@/lib/dataService'
import { usePermissions } from '@/hooks/usePermissions'
import ProtocolForm from '../Protocol/ProtocolForm'
import ProtocolDetail from '../Protocol/ProtocolDetail'
import ProtocolCategoryManager from '../Protocol/ProtocolCategoryManager'
import ProtocolPermissionManager from '../Protocol/ProtocolPermissionManager'
import ProtocolPermissionOverview from '../Protocol/ProtocolPermissionOverview'
import ProtocolSplitModal from '../Protocol/ProtocolSplitModal'
import type { UserProfile } from '@/contexts/AuthContext'
import type { Protocol, ProtocolCategory, ProtocolFormData } from '@/types'
import { appConfirm, appAlert } from '@/components/ui/AppDialog'

// 드래그 앤 드롭: 드롭 가능한 카테고리 컬럼
function DroppableColumn({ id, categoryId, children }: { id: string; categoryId: string | null; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { type: 'category-column', categoryId }
  })

  return (
    <div
      ref={setNodeRef}
      className={`w-[180px] flex-shrink-0 rounded-lg transition-all ${
        isOver ? 'ring-2 ring-blue-400 bg-blue-50/50' : ''
      }`}
    >
      {children}
    </div>
  )
}

// 드래그 앤 드롭: 드래그 가능한 프로토콜 카드
function DraggableProtocolCard({ id, protocolId, isDragActive, children }: { id: string; protocolId: string; isDragActive: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id,
    data: { type: 'protocol', protocolId }
  })

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragActive ? 0.3 : 1 }}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  )
}

interface ProtocolManagementProps {
  currentUser: UserProfile
  hideHeader?: boolean
}

export default function ProtocolManagement({ currentUser, hideHeader = false }: ProtocolManagementProps) {
  const { hasPermission } = usePermissions()
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'categories' | 'permissions'>('list')
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [protocols, setProtocols] = useState<Protocol[]>([])
  const [categories, setCategories] = useState<ProtocolCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Modal states
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createCategoryId, setCreateCategoryId] = useState<string | undefined>(undefined)
  const [showEditForm, setShowEditForm] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [showPermissionManager, setShowPermissionManager] = useState(false)
  const [showSplitModal, setShowSplitModal] = useState(false)
  const [splitProtocol, setSplitProtocol] = useState<Protocol | null>(null)
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null)
  const [editingProtocol, setEditingProtocol] = useState<Protocol | null>(null)
  const [permissionProtocol, setPermissionProtocol] = useState<Protocol | null>(null)

  // 개별 권한 상태
  const [editableProtocolIds, setEditableProtocolIds] = useState<Set<string>>(new Set())
  const [deletableProtocolIds, setDeletableProtocolIds] = useState<Set<string>>(new Set())
  const [accessibleProtocolIds, setAccessibleProtocolIds] = useState<Set<string>>(new Set())

  // 카드 확장 상태
  const [expandedProtocolId, setExpandedProtocolId] = useState<string | null>(null)

  // 칸반 DnD 상태
  const [activeDragProtocolId, setActiveDragProtocolId] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const canEdit = hasPermission('protocol_create') || hasPermission('protocol_edit')
  const isOwner = currentUser.role === 'owner'
  const isViceDirector = currentUser.role === 'vice_director'

  // 부원장: 특정 프로토콜에 대한 접근 권한 확인
  const isProtocolAccessible = (protocol: Protocol): boolean => {
    if (isOwner) return true
    if (protocol.created_by === currentUser.id) return true
    if (!isViceDirector) return true // 부원장 외 사용자는 이미 필터링됨
    return accessibleProtocolIds.has(protocol.id)
  }

  // 사용자의 개별 프로토콜 권한 로드
  const fetchUserPermissions = async () => {
    if (isOwner || !currentUser.id) return // 대표원장은 모든 권한 보유

    try {
      const [editResult, deleteResult] = await Promise.all([
        dataService.getUserEditableProtocolIds(currentUser.id),
        dataService.getUserDeletableProtocolIds(currentUser.id)
      ])

      if (!editResult.error && editResult.data) {
        setEditableProtocolIds(new Set(editResult.data))
      }
      if (!deleteResult.error && deleteResult.data) {
        setDeletableProtocolIds(new Set(deleteResult.data))
      }
    } catch (err) {
      console.error('[ProtocolManagement] Failed to fetch user permissions:', err)
    }
  }

  // 특정 프로토콜에 대한 수정 권한 확인
  const canEditProtocol = (protocol: Protocol): boolean => {
    if (isOwner) return true
    if (canEdit) return true
    if (protocol.created_by === currentUser.id) return true
    return editableProtocolIds.has(protocol.id)
  }

  // 특정 프로토콜에 대한 삭제 권한 확인
  const canDeleteProtocol = (protocol: Protocol): boolean => {
    if (isOwner) return true
    if (canEdit) return true
    if (protocol.created_by === currentUser.id) return true
    return deletableProtocolIds.has(protocol.id)
  }

  useEffect(() => {
    let isMounted = true

    const fetchInitialData = async () => {
      if (!isMounted) return

      try {
        await Promise.all([
          fetchProtocols(),
          fetchCategories(),
          fetchUserPermissions()
        ])
        if (isMounted) {
          setInitialLoadDone(true)
        }
      } catch (err) {
        console.error('[ProtocolManagement] Failed to fetch initial data:', err)
        if (isMounted) {
          setInitialLoadDone(true)
        }
      }
    }

    fetchInitialData()

    return () => {
      isMounted = false
      console.log('[ProtocolManagement] Cleanup: component unmounted')
    }
  }, [])

  const fetchProtocols = async () => {
    try {
      const filters: any = {}
      if (selectedStatus !== 'all') {
        filters.status = selectedStatus
      }
      if (selectedCategory !== 'all') {
        filters.category_id = selectedCategory
      }
      if (searchTerm) {
        filters.search = searchTerm
      }

      console.log('[ProtocolManagement] Fetching protocols with filters:', filters)
      const result = await dataService.getProtocols(currentUser.clinic_id, filters)
      if (result.error) {
        console.error('[ProtocolManagement] Error:', result.error)

        if (result.error.includes('인증 세션이 만료') || result.error.includes('SESSION_EXPIRED')) {
          await appAlert('세션이 만료되었습니다. 다시 로그인해주세요.')
          localStorage.removeItem('dental_auth')
          localStorage.removeItem('dental_user')
          sessionStorage.removeItem('dental_auth')
          sessionStorage.removeItem('dental_user')
          window.location.href = '/'
          return
        }

        setError(result.error)
      } else {
        let loadedProtocols = (result.data as Protocol[] | undefined) ?? []

        // 대표원장이 아닌 경우 권한 기반 처리
        if (!isOwner && currentUser.id) {
          const permResult = await dataService.getUserAccessibleProtocolIds(currentUser.id)
          if (!permResult.error && permResult.data) {
            const accessibleIds = new Set(permResult.data)
            // 자신이 만든 프로토콜도 접근 가능으로 추가
            loadedProtocols.forEach(p => {
              if (p.created_by === currentUser.id) accessibleIds.add(p.id)
            })

            if (isViceDirector) {
              // 부원장: 모든 프로토콜 표시, 접근 가능한 ID만 저장 (회색 표시용)
              setAccessibleProtocolIds(new Set(accessibleIds))
            } else {
              // 기타 역할: 접근 가능한 프로토콜만 필터링
              loadedProtocols = loadedProtocols.filter(
                p => accessibleIds.has(p.id)
              )
            }
          }
        }

        setProtocols(loadedProtocols)
        console.log('[ProtocolManagement] Protocols loaded:', loadedProtocols.length)
      }
    } catch (err) {
      console.error('[ProtocolManagement] Exception:', err)
      const errorMessage = err instanceof Error ? err.message : '프로토콜을 불러오는 중 오류가 발생했습니다.'

      if (errorMessage.includes('인증 세션이 만료')) {
        await appAlert('세션이 만료되었습니다. 다시 로그인해주세요.')
        localStorage.removeItem('dental_auth')
        localStorage.removeItem('dental_user')
        sessionStorage.removeItem('dental_auth')
        sessionStorage.removeItem('dental_user')
        window.location.href = '/'
        return
      }

      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      console.log('[ProtocolManagement] Fetching categories...')
      const result = await dataService.getProtocolCategories(currentUser.clinic_id)
      if (result.error) {
        console.error('[ProtocolManagement] Error fetching categories:', result.error)
      } else {
        setCategories((result.data as ProtocolCategory[] | undefined) ?? [])
        console.log('[ProtocolManagement] Categories loaded:', (result.data as ProtocolCategory[] | undefined)?.length || 0)
      }
    } catch (err) {
      console.error('[ProtocolManagement] Exception fetching categories:', err)
    }
  }

  useEffect(() => {
    // 초기 로딩이 완료되기 전에는 실행하지 않음 (중복 호출 방지)
    if (!initialLoadDone) return

    let isMounted = true

    const debounceTimer = setTimeout(() => {
      if (isMounted) {
        console.log('[ProtocolManagement] Debounced fetch triggered')
        fetchProtocols()
      }
    }, 300)

    return () => {
      isMounted = false
      clearTimeout(debounceTimer)
    }
  }, [searchTerm, selectedStatus, selectedCategory, initialLoadDone])

  // 칸반 그룹 데이터 (전체 카테고리 보기일 때만 사용)
  const groupedProtocols = useMemo(() => {
    if (selectedCategory !== 'all') return null

    const groups: { category: ProtocolCategory | null; protocols: Protocol[] }[] = []
    const categoryMap = new Map<string, Protocol[]>()
    const uncategorized: Protocol[] = []

    protocols.forEach(p => {
      if (p.category_id && p.category) {
        const list = categoryMap.get(p.category_id) || []
        list.push(p)
        categoryMap.set(p.category_id, list)
      } else {
        uncategorized.push(p)
      }
    })

    categories.forEach(cat => {
      const list = categoryMap.get(cat.id)
      if (list && list.length > 0) {
        groups.push({ category: cat, protocols: list })
      }
    })
    if (uncategorized.length > 0) {
      groups.push({ category: null, protocols: uncategorized })
    }
    return groups
  }, [protocols, categories, selectedCategory])

  // 그룹 접기/펼치기 토글
  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  // DnD 핸들러
  const handleDndDragStart = (event: DragStartEvent) => {
    const protocolId = event.active.data.current?.protocolId as string
    if (protocolId) {
      setActiveDragProtocolId(protocolId)
    }
  }

  const handleDndDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragProtocolId(null)

    if (!over) return

    const draggedProtocolId = active.data.current?.protocolId as string
    const targetCategoryId = over.data.current?.categoryId as (string | null)

    if (!draggedProtocolId || targetCategoryId === undefined) return

    const draggedProtocol = protocols.find(p => p.id === draggedProtocolId)
    if (!draggedProtocol) return

    // 같은 카테고리로 드롭 시 무시
    const currentCategoryId = draggedProtocol.category_id || null
    if (currentCategoryId === targetCategoryId) return

    // 옵티미스틱 업데이트 - 즉시 UI 반영 (깜빡임 방지)
    const targetCategory = targetCategoryId
      ? categories.find(c => c.id === targetCategoryId) || null
      : null
    setProtocols(prev => prev.map(p =>
      p.id === draggedProtocolId
        ? { ...p, category_id: targetCategoryId ?? undefined, category: targetCategory ?? undefined }
        : p
    ))

    try {
      const result = await dataService.updateProtocolCategoryId(draggedProtocolId, targetCategoryId)
      if (result.error) {
        // 실패 시 롤백
        setProtocols(prev => prev.map(p =>
          p.id === draggedProtocolId
            ? { ...p, category_id: draggedProtocol.category_id, category: draggedProtocol.category }
            : p
        ))
        setError(`카테고리 이동 실패: ${result.error}`)
        setTimeout(() => setError(''), 3000)
      } else {
        const targetName = targetCategoryId
          ? categories.find(c => c.id === targetCategoryId)?.name || '알 수 없음'
          : '미분류'
        setSuccess(`"${draggedProtocol.title}"이(가) "${targetName}"(으)로 이동되었습니다.`)
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch {
      // 실패 시 롤백
      setProtocols(prev => prev.map(p =>
        p.id === draggedProtocolId
          ? { ...p, category_id: draggedProtocol.category_id, category: draggedProtocol.category }
          : p
      ))
      setError('카테고리 이동에 실패했습니다.')
      setTimeout(() => setError(''), 3000)
    }
  }

  // 드래그 오버레이용 데이터
  const activeDragProtocol = activeDragProtocolId ? protocols.find(p => p.id === activeDragProtocolId) : null

  const handleCreateProtocol = async (formData: ProtocolFormData) => {
    const result = await dataService.createProtocol(formData)
    if (result.error) {
      throw new Error(result.error)
    }
    setSuccess('프로토콜이 생성되었습니다.')
    setShowCreateForm(false)
    setCreateCategoryId(undefined)
    fetchProtocols()
    setTimeout(() => setSuccess(''), 3000)
  }

  const handleUpdateProtocol = async (formData: ProtocolFormData) => {
    if (!editingProtocol) return

    const result = await dataService.updateProtocol(editingProtocol.id, formData)
    if (result.error) {
      throw new Error(result.error)
    }
    setSuccess('프로토콜이 수정되었습니다.')
    setShowEditForm(false)
    setSelectedProtocol(null)
    setEditingProtocol(null)
    fetchProtocols()
    setTimeout(() => setSuccess(''), 3000)
  }

  const handleDeleteProtocol = (protocolId: string) => {
    setShowDetail(false)
    setSelectedProtocol(null)
    setEditingProtocol(null)
    setSuccess('프로토콜이 삭제되었습니다.')
    fetchProtocols()
    setTimeout(() => setSuccess(''), 3000)
  }

  const handleSplitProtocol = async (protocol: Protocol) => {
    // 상세 정보 모달 닫기
    setShowDetail(false)
    setSelectedProtocol(null)

    // 스텝 정보가 없으면 로드
    if (!protocol.currentVersion?.steps || protocol.currentVersion.steps.length === 0) {
      try {
        const result = await dataService.getProtocolById(protocol.id)
        if (result.error) {
          setError(result.error)
          return
        }
        setSplitProtocol((result.data as Protocol | null) ?? null)
      } catch (err) {
        setError('프로토콜 정보를 불러오지 못했습니다.')
        return
      }
    } else {
      setSplitProtocol(protocol)
    }
    setShowSplitModal(true)
  }

  const handleSplitSubmit = async (splitItems: ProtocolFormData[], archiveOriginal: boolean) => {
    const result = await dataService.splitProtocol(
      splitItems,
      archiveOriginal && splitProtocol ? splitProtocol.id : undefined
    )
    if (result.error) {
      throw new Error(result.error)
    }
    setSuccess(`프로토콜이 ${splitItems.length}개로 분할되었습니다.`)
    setShowSplitModal(false)
    setSplitProtocol(null)
    fetchProtocols()
    setTimeout(() => setSuccess(''), 3000)
  }

  const handleDeleteProtocolDirect = async (protocol: Protocol, e: React.MouseEvent) => {
    e.stopPropagation()

    if (!await appConfirm(`"${protocol.title}" 프로토콜을 삭제하시겠습니까?`)) {
      return
    }

    try {
      const result = await dataService.deleteProtocol(protocol.id)
      if (result.error) {
        setError(result.error)
        setTimeout(() => setError(''), 3000)
      } else {
        setSuccess('프로토콜이 삭제되었습니다.')
        fetchProtocols()
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch (err) {
      setError('프로토콜 삭제 중 오류가 발생했습니다.')
      setTimeout(() => setError(''), 3000)
    }
  }

  const handleViewProtocol = (protocol: Protocol) => {
    setSelectedProtocol(protocol)
    setShowDetail(true)
  }

  const handleEditProtocol = async (protocol: Protocol) => {
    setShowDetail(false)

    if (protocol.currentVersion?.steps && protocol.currentVersion.steps.length > 0) {
      setEditingProtocol(protocol)
      setShowEditForm(true)
      return
    }

    setError('')
    try {
      const result = await dataService.getProtocolById(protocol.id)
      if (result.error) {
        setError(result.error)
        setEditingProtocol(null)
        setShowEditForm(false)
      } else {
        setEditingProtocol((result.data as Protocol | null) ?? null)
        setShowEditForm(true)
      }
    } catch (err) {
      console.error('Failed to load protocol for editing:', err)
      setError(err instanceof Error ? err.message : '프로토콜 정보를 불러오지 못했습니다.')
      setEditingProtocol(null)
      setShowEditForm(false)
    }
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: '작성중',
      active: '활성',
      archived: '보관됨',
      pending_review: '검토 대기'
    }
    return labels[status] || status
  }

  const getStatusBadgeClass = (status: string) => {
    const classes: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      active: 'bg-green-100 text-green-800',
      archived: 'bg-slate-100 text-slate-600',
      pending_review: 'bg-amber-100 text-amber-800'
    }
    return classes[status] || 'bg-gray-100 text-gray-800'
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // 프로토콜 카드 렌더링 (칸반/리스트 공용)
  const renderProtocolCard = (protocol: Protocol, showCategoryBadge: boolean) => {
    const isExpanded = expandedProtocolId === protocol.id
    const accessible = isProtocolAccessible(protocol)

    return (
      <div
        className={`border rounded-lg transition-all relative ${
          !accessible
            ? 'bg-gray-50/80 border-gray-200'
            : isExpanded ? 'bg-white border-slate-300 shadow-md' : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
        }`}
        style={
          !accessible
            ? { borderLeft: '3px solid #d1d5db' }
            : protocol.category ? { borderLeft: `3px solid ${protocol.category.color}` } : undefined
        }
      >
        {/* 접힌 상태: 1줄 요약 */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
          onClick={() => setExpandedProtocolId(isExpanded ? null : protocol.id)}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
            {!accessible && (
              <Lock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            )}
            <h4 className={`text-sm font-semibold leading-tight truncate ${
              !accessible ? 'text-gray-400' : 'text-slate-800'
            }`}>
              {protocol.title}
            </h4>
            <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-full flex-shrink-0 ${
              !accessible ? 'bg-gray-100 text-gray-400' : getStatusBadgeClass(protocol.status)
            }`}>
              {getStatusLabel(protocol.status)}
            </span>
            {showCategoryBadge && protocol.category && (
              <span
                className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-full flex-shrink-0 ${
                  !accessible ? 'bg-gray-100 text-gray-400' : ''
                }`}
                style={accessible ? {
                  backgroundColor: `${protocol.category.color}20`,
                  color: protocol.category.color
                } : undefined}
              >
                {protocol.category.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            {!isExpanded && protocol.currentVersion && (
              <span className={`text-xs hidden sm:inline ${!accessible ? 'text-gray-300' : 'text-slate-400'}`}>
                v{protocol.currentVersion.version_number}
              </span>
            )}
            {isExpanded ? (
              <ChevronUp className={`w-4 h-4 ${!accessible ? 'text-gray-300' : 'text-slate-400'}`} />
            ) : (
              <ChevronDown className={`w-4 h-4 ${!accessible ? 'text-gray-300' : 'text-slate-400'}`} />
            )}
          </div>
        </div>

        {/* 펼친 상태: 상세 정보 + 액션 버튼 */}
        {isExpanded && (
          <div className={`border-t ${!accessible ? 'border-gray-100' : 'border-slate-100'}`}>
            <div className="px-3 py-2.5 space-y-2">
              <div className={`flex items-center gap-3 text-xs ${!accessible ? 'text-gray-400' : 'text-slate-500'}`}>
                {protocol.currentVersion && (
                  <>
                    <span className="flex items-center">
                      <Clock className="w-3 h-3 mr-0.5" />
                      {formatDate(protocol.currentVersion.created_at)}
                    </span>
                    <span>버전 {protocol.currentVersion.version_number}</span>
                  </>
                )}
                {protocol.created_by_user && (
                  <span>작성자: {protocol.created_by_user.name}</span>
                )}
              </div>

              {protocol.tags && protocol.tags.length > 0 && (
                <div className="flex items-center flex-wrap gap-1">
                  <Tag className={`w-3 h-3 ${!accessible ? 'text-gray-300' : 'text-slate-400'}`} />
                  {protocol.tags.map((tag, index) => (
                    <span
                      key={index}
                      className={`inline-flex px-1.5 py-0.5 text-[10px] rounded ${
                        !accessible ? 'bg-gray-100 text-gray-400' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 권한 없음 안내 (부원장 전용) */}
            {!accessible && (
              <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 bg-gray-50 rounded-b-lg">
                <Lock className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-400">접근 권한이 없습니다. 대표원장에게 권한을 요청하세요.</span>
              </div>
            )}

            {/* 액션 버튼 (접근 가능한 경우만) */}
            {accessible && (
              <div className="flex items-center gap-1 px-3 py-2 border-t border-slate-100 bg-slate-50/50 rounded-b-lg">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleViewProtocol(protocol)
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="보기"
                >
                  <Eye className="w-3.5 h-3.5" />
                  보기
                </button>
                {isOwner && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setPermissionProtocol(protocol)
                      setShowPermissionManager(true)
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-50 rounded transition-colors"
                    title="접근 권한 관리"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    권한
                  </button>
                )}
                {canEditProtocol(protocol) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSplitProtocol(protocol)
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50 rounded transition-colors"
                    title="분할"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    분할
                  </button>
                )}
                {canEditProtocol(protocol) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEditProtocol(protocol)
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded transition-colors"
                    title="수정"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    수정
                  </button>
                )}
                {canDeleteProtocol(protocol) && (
                  <button
                    onClick={(e) => handleDeleteProtocolDirect(protocol, e)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors ml-auto"
                    title="삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    삭제
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* 블루 그라데이션 헤더 - hideHeader가 true면 숨김, 스크롤 시 고정 */}
      {!hideHeader && (
        <div className="sticky top-14 z-10 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-xl shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">진료 프로토콜</h2>
              <p className="text-blue-100 text-sm">Protocol Management</p>
            </div>
          </div>
        </div>
      )}

      <div className={hideHeader ? '' : 'bg-white border-x border-b border-slate-200 rounded-b-xl p-6'}>
        {/* 서브 탭 네비게이션 - 항상 콘텐츠 영역 내부에 표시 */}
        <div className={`border-b border-slate-200 bg-slate-50 rounded-t-lg mb-6 px-2 pt-2 ${hideHeader ? '' : '-mx-6 -mt-6'}`}>
          <nav className="flex space-x-1 p-2" aria-label="Tabs">
            <button
              onClick={() => setActiveSubTab('list')}
              className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeSubTab === 'list'
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <FileText className="w-4 h-4 mr-2" />
              프로토콜 목록
            </button>
            <button
              onClick={() => setActiveSubTab('categories')}
              className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeSubTab === 'categories'
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <Folder className="w-4 h-4 mr-2" />
              카테고리 관리
            </button>
            {isOwner && (
              <button
                onClick={() => setActiveSubTab('permissions')}
                className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeSubTab === 'permissions'
                    ? 'bg-white text-purple-700 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <ShieldCheck className="w-4 h-4 mr-2" />
                권한 현황
              </button>
            )}
          </nav>
        </div>
        {/* Protocol List Tab */}
        {activeSubTab === 'list' && (
          <div className="space-y-6">
            {/* 헤더와 추가 버튼 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="text-base font-semibold text-slate-800">
                  프로토콜 목록
                  {!loading && <span className="text-sm font-normal text-slate-500 ml-1">({protocols.length})</span>}
                </h3>
              </div>
              {canEdit && (
                <button
                  onClick={() => {
                    setCreateCategoryId(undefined)
                    setShowCreateForm(true)
                  }}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  새 프로토콜 작성
                </button>
              )}
            </div>

            {/* 검색 및 필터 */}
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="프로토콜 제목 또는 태그로 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-slate-500" />
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">모든 상태</option>
                  <option value="active">활성</option>
                  <option value="draft">작성중</option>
                  <option value="pending_review">검토 대기</option>
                  <option value="archived">보관됨</option>
                </select>
              </div>

              {/* 카테고리 버튼 필터 */}
              {categories.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${
                      selectedCategory === 'all'
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5 mr-1.5" />
                    전체
                  </button>
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(selectedCategory === category.id ? 'all' : category.id)}
                      className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${
                        selectedCategory === category.id
                          ? 'text-white border-transparent'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                      style={
                        selectedCategory === category.id
                          ? { backgroundColor: category.color, borderColor: category.color }
                          : { color: category.color }
                      }
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full mr-1.5 flex-shrink-0"
                        style={{ backgroundColor: selectedCategory === category.id ? 'rgba(255,255,255,0.7)' : category.color }}
                      />
                      {category.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            )}

            {/* 프로토콜 목록 */}
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-slate-600">프로토콜을 불러오는 중...</p>
              </div>
            ) : protocols.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-lg">
                <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 mb-1">
                  {searchTerm || selectedStatus !== 'all' || selectedCategory !== 'all'
                    ? '검색 조건에 맞는 프로토콜이 없습니다.'
                    : '아직 작성된 프로토콜이 없습니다.'}
                </p>
                <p className="text-sm text-slate-400">
                  {searchTerm || selectedStatus !== 'all' || selectedCategory !== 'all'
                    ? '다른 검색 조건을 시도하거나 필터를 초기화해 보세요.'
                    : '새 프로토콜을 작성하여 진료 절차를 체계적으로 관리하세요.'}
                </p>
                {canEdit && !searchTerm && selectedStatus === 'all' && selectedCategory === 'all' && (
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    첫 프로토콜 작성하기
                  </button>
                )}
              </div>
            ) : groupedProtocols ? (
              /* 칸반 뷰 (전체 카테고리 보기) */
              <DndContext
                sensors={dndSensors}
                collisionDetection={closestCenter}
                onDragStart={handleDndDragStart}
                onDragEnd={handleDndDragEnd}
              >
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {groupedProtocols.map(group => {
                    const groupId = group.category?.id || 'uncategorized'
                    const isCollapsed = collapsedGroups.has(groupId)
                    const categoryId = group.category?.id || null
                    return (
                      <DroppableColumn key={groupId} id={`drop-column-${groupId}`} categoryId={categoryId}>
                        <div
                          className="flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors mb-2"
                          style={{ backgroundColor: `${group.category?.color || '#94a3b8'}15`, borderLeft: `3px solid ${group.category?.color || '#94a3b8'}` }}
                        >
                          <button
                            onClick={() => toggleGroup(groupId)}
                            className="flex items-center gap-2 flex-1 min-w-0"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            )}
                            <span
                              className="font-semibold text-sm truncate"
                              style={{ color: group.category?.color || '#94a3b8' }}
                            >
                              {group.category?.name || '미분류'}
                            </span>
                            <span className="text-xs text-slate-400 flex-shrink-0">
                              ({group.protocols.length})
                            </span>
                          </button>
                          {canEdit && group.category && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setCreateCategoryId(group.category!.id)
                                setShowCreateForm(true)
                              }}
                              className="p-1 rounded hover:bg-white/60 transition-colors flex-shrink-0"
                              title={`"${group.category.name}" 카테고리에 새 프로토콜 작성`}
                            >
                              <Plus className="w-4 h-4" style={{ color: group.category.color }} />
                            </button>
                          )}
                        </div>
                        {!isCollapsed && (
                          <div className="flex flex-col gap-1.5 max-h-[calc(100vh-320px)] overflow-y-auto">
                            {group.protocols.map(protocol => (
                              <DraggableProtocolCard
                                key={protocol.id}
                                id={`protocol-${protocol.id}`}
                                protocolId={protocol.id}
                                isDragActive={activeDragProtocolId === protocol.id}
                              >
                                {renderProtocolCard(protocol, false)}
                              </DraggableProtocolCard>
                            ))}
                          </div>
                        )}
                      </DroppableColumn>
                    )
                  })}
                </div>
                <DragOverlay dropAnimation={null}>
                  {activeDragProtocol && (
                    <div className="bg-white border-2 border-blue-400 rounded-lg shadow-xl p-3 w-[300px]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-800 truncate">{activeDragProtocol.title}</span>
                        <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${getStatusBadgeClass(activeDragProtocol.status)}`}>
                          {getStatusLabel(activeDragProtocol.status)}
                        </span>
                      </div>
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            ) : (
              /* flat list 뷰 (특정 카테고리 선택 시) */
              <div className="space-y-3">
                {protocols.map((protocol) => renderProtocolCard(protocol, true))}
              </div>
            )}

            {/* Create Protocol Modal */}
            {showCreateForm && (
              <ProtocolForm
                mode="create"
                initialData={createCategoryId ? {
                  title: '',
                  category_id: createCategoryId,
                  content: '',
                  status: 'draft',
                  tags: [],
                } : undefined}
                onSubmit={handleCreateProtocol}
                onCancel={() => {
                  setShowCreateForm(false)
                  setCreateCategoryId(undefined)
                }}
              />
            )}

            {/* Edit Protocol Modal */}
            {showEditForm && editingProtocol && (
              <ProtocolForm
                mode="edit"
                initialData={{
                  id: editingProtocol.id,
                  title: editingProtocol.title,
                  category_id: editingProtocol.category_id,
                  content: editingProtocol.currentVersion?.content || '',
                  status: editingProtocol.status,
                  tags: editingProtocol.tags || [],
                  change_summary: '',
                  change_type: 'minor',
                  steps: editingProtocol.currentVersion?.steps || []
                }}
                onSubmit={handleUpdateProtocol}
                onCancel={() => {
                  setShowEditForm(false)
                  setSelectedProtocol(null)
                  setEditingProtocol(null)
                }}
              />
            )}

            {/* Protocol Detail Modal */}
            {showDetail && selectedProtocol && (
              <ProtocolDetail
                protocolId={selectedProtocol.id}
                onClose={() => {
                  setShowDetail(false)
                  setSelectedProtocol(null)
                }}
                onEdit={handleEditProtocol}
                onDelete={handleDeleteProtocol}
                onSplit={canEdit ? handleSplitProtocol : undefined}
              />
            )}

            {/* Split Protocol Modal */}
            {showSplitModal && splitProtocol && (
              <ProtocolSplitModal
                protocol={splitProtocol}
                onSplit={handleSplitSubmit}
                onClose={() => {
                  setShowSplitModal(false)
                  setSplitProtocol(null)
                }}
              />
            )}

            {/* Permission Manager Modal */}
            {showPermissionManager && permissionProtocol && (
              <ProtocolPermissionManager
                protocolId={permissionProtocol.id}
                protocolTitle={permissionProtocol.title}
                clinicId={currentUser.clinic_id || ''}
                currentUserId={currentUser.id}
                onClose={() => {
                  setShowPermissionManager(false)
                  setPermissionProtocol(null)
                }}
                onSave={() => {
                  // 권한 저장 후 필요시 목록 갱신
                }}
              />
            )}
          </div>
        )}

        {/* Category Management Tab */}
        {activeSubTab === 'categories' && (
          <ProtocolCategoryManager
            onCategoryChange={() => {
              fetchCategories()
              fetchProtocols()
            }}
          />
        )}

        {/* Permission Overview Tab (owner only) */}
        {activeSubTab === 'permissions' && isOwner && (
          <ProtocolPermissionOverview
            clinicId={currentUser.clinic_id || ''}
            currentUserId={currentUser.id}
          />
        )}
      </div>
    </div>
  )
}
