'use client'

import { useState, useEffect } from 'react'
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
  ShieldCheck
} from 'lucide-react'
import { dataService } from '@/lib/dataService'
import { usePermissions } from '@/hooks/usePermissions'
import ProtocolForm from '../Protocol/ProtocolForm'
import ProtocolDetail from '../Protocol/ProtocolDetail'
import ProtocolCategoryManager from '../Protocol/ProtocolCategoryManager'
import ProtocolPermissionManager from '../Protocol/ProtocolPermissionManager'
import ProtocolPermissionOverview from '../Protocol/ProtocolPermissionOverview'
import type { UserProfile } from '@/contexts/AuthContext'
import type { Protocol, ProtocolCategory, ProtocolFormData } from '@/types'

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
  const [showEditForm, setShowEditForm] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [showPermissionManager, setShowPermissionManager] = useState(false)
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null)
  const [editingProtocol, setEditingProtocol] = useState<Protocol | null>(null)
  const [permissionProtocol, setPermissionProtocol] = useState<Protocol | null>(null)

  // 개별 권한 상태
  const [editableProtocolIds, setEditableProtocolIds] = useState<Set<string>>(new Set())
  const [deletableProtocolIds, setDeletableProtocolIds] = useState<Set<string>>(new Set())

  const canEdit = hasPermission('protocol_create') || hasPermission('protocol_edit')
  const isOwner = currentUser.role === 'owner'

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
    // 대표원장은 모든 프로토콜 수정 가능
    if (isOwner) return true
    // 전역 수정 권한이 있으면 수정 가능
    if (canEdit) return true
    // 본인이 작성한 프로토콜은 수정 가능
    if (protocol.created_by === currentUser.id) return true
    // 개별 수정 권한이 있으면 수정 가능
    return editableProtocolIds.has(protocol.id)
  }

  // 특정 프로토콜에 대한 삭제 권한 확인
  const canDeleteProtocol = (protocol: Protocol): boolean => {
    // 대표원장은 모든 프로토콜 삭제 가능
    if (isOwner) return true
    // 전역 수정 권한이 있으면 삭제 가능 (기존 동작 유지)
    if (canEdit) return true
    // 본인이 작성한 프로토콜은 삭제 가능
    if (protocol.created_by === currentUser.id) return true
    // 개별 삭제 권한이 있으면 삭제 가능
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
    setLoading(true)
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
          alert('세션이 만료되었습니다. 다시 로그인해주세요.')
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

        // 대표원장이 아닌 경우 개별 권한이 있는 프로토콜만 필터링
        if (!isOwner && currentUser.id) {
          const permResult = await dataService.getUserAccessibleProtocolIds(currentUser.id)
          if (!permResult.error && permResult.data) {
            const accessibleIds = new Set(permResult.data)
            // 프로토콜 생성자 본인의 프로토콜은 항상 접근 가능
            loadedProtocols = loadedProtocols.filter(
              p => p.created_by === currentUser.id || accessibleIds.has(p.id)
            )
          }
        }

        setProtocols(loadedProtocols)
        console.log('[ProtocolManagement] Protocols loaded:', loadedProtocols.length)
      }
    } catch (err) {
      console.error('[ProtocolManagement] Exception:', err)
      const errorMessage = err instanceof Error ? err.message : '프로토콜을 불러오는 중 오류가 발생했습니다.'

      if (errorMessage.includes('인증 세션이 만료')) {
        alert('세션이 만료되었습니다. 다시 로그인해주세요.')
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

  const handleCreateProtocol = async (formData: ProtocolFormData) => {
    const result = await dataService.createProtocol(formData)
    if (result.error) {
      throw new Error(result.error)
    }
    setSuccess('프로토콜이 생성되었습니다.')
    setShowCreateForm(false)
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

  const handleDeleteProtocolDirect = async (protocol: Protocol, e: React.MouseEvent) => {
    e.stopPropagation()

    if (!window.confirm(`"${protocol.title}" 프로토콜을 삭제하시겠습니까?`)) {
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
      archived: '보관됨'
    }
    return labels[status] || status
  }

  const getStatusBadgeClass = (status: string) => {
    const classes: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      active: 'bg-green-100 text-green-800',
      archived: 'bg-slate-100 text-slate-600'
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
                  onClick={() => setShowCreateForm(true)}
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

              <div className="flex flex-wrap gap-3">
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
                    <option value="archived">보관됨</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2">
                  <Folder className="w-4 h-4 text-slate-500" />
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">모든 카테고리</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
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
            ) : (
              <div className="space-y-3">
                {protocols.map((protocol) => (
                  <div
                    key={protocol.id}
                    className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => handleViewProtocol(protocol)}
                      >
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-semibold text-slate-800 hover:text-blue-600">
                            {protocol.title}
                          </h3>
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(protocol.status)}`}>
                            {getStatusLabel(protocol.status)}
                          </span>
                          {protocol.category && (
                            <span
                              className="inline-flex px-2 py-1 text-xs font-semibold rounded-full"
                              style={{
                                backgroundColor: `${protocol.category.color}20`,
                                color: protocol.category.color
                              }}
                            >
                              {protocol.category.name}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-4 text-sm text-slate-600 mb-2">
                          <span className="flex items-center">
                            <Clock className="w-4 h-4 mr-1" />
                            {protocol.currentVersion && formatDate(protocol.currentVersion.created_at)}
                          </span>
                          {protocol.currentVersion && (
                            <span>버전 {protocol.currentVersion.version_number}</span>
                          )}
                          {protocol.created_by_user && (
                            <span>작성자: {protocol.created_by_user.name}</span>
                          )}
                        </div>

                        {protocol.tags && protocol.tags.length > 0 && (
                          <div className="flex items-center flex-wrap gap-2">
                            <Tag className="w-4 h-4 text-slate-400" />
                            {protocol.tags.map((tag, index) => (
                              <span
                                key={index}
                                className="inline-flex px-2 py-0.5 text-xs rounded-md bg-slate-100 text-slate-600"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleViewProtocol(protocol)
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="보기"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        {isOwner && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setPermissionProtocol(protocol)
                              setShowPermissionManager(true)
                            }}
                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="접근 권한 관리"
                          >
                            <ShieldCheck className="w-5 h-5" />
                          </button>
                        )}
                        {/* 수정 권한이 있는 경우 수정 버튼 표시 */}
                        {canEditProtocol(protocol) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEditProtocol(protocol)
                            }}
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="수정"
                          >
                            <Pencil className="w-5 h-5" />
                          </button>
                        )}
                        {/* 삭제 권한이 있는 경우 삭제 버튼 표시 */}
                        {canDeleteProtocol(protocol) && (
                          <button
                            onClick={(e) => handleDeleteProtocolDirect(protocol, e)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Create Protocol Modal */}
            {showCreateForm && (
              <ProtocolForm
                mode="create"
                onSubmit={handleCreateProtocol}
                onCancel={() => setShowCreateForm(false)}
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
