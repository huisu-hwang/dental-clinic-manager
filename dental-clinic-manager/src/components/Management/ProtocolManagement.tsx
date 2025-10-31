'use client'

import { useState, useEffect } from 'react'
import {
  DocumentTextIcon,
  PlusIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  TagIcon,
  FolderIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import { dataService } from '@/lib/dataService'
import { usePermissions } from '@/hooks/usePermissions'
import ProtocolForm from '../Protocol/ProtocolForm'
import ProtocolDetail from '../Protocol/ProtocolDetail'
import ProtocolCategoryManager from '../Protocol/ProtocolCategoryManager'
import type { UserProfile } from '@/contexts/AuthContext'
import type { Protocol, ProtocolCategory, ProtocolFormData } from '@/types'

interface ProtocolManagementProps {
  currentUser: UserProfile
}

export default function ProtocolManagement({ currentUser }: ProtocolManagementProps) {
  const { hasPermission } = usePermissions()
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'categories'>('list')
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
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null)
  const [editingProtocol, setEditingProtocol] = useState<Protocol | null>(null)

  const canEdit = hasPermission('protocol_create') || hasPermission('protocol_edit')

  useEffect(() => {
    let isMounted = true

    const fetchInitialData = async () => {
      if (!isMounted) return

      try {
        await Promise.all([
          fetchProtocols(),
          fetchCategories()
        ])
      } catch (err) {
        console.error('[ProtocolManagement] Failed to fetch initial data:', err)
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
      // currentUser.clinic_id를 전달
      const result = await dataService.getProtocols(currentUser.clinic_id, filters)
      if (result.error) {
        console.error('[ProtocolManagement] Error:', result.error)
        setError(result.error)
      } else {
        setProtocols((result.data as Protocol[] | undefined) ?? [])
        console.log('[ProtocolManagement] Protocols loaded:', (result.data as Protocol[] | undefined)?.length || 0)
      }
    } catch (err) {
      console.error('[ProtocolManagement] Exception:', err)
      setError('프로토콜을 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      console.log('[ProtocolManagement] Fetching categories...')
      // currentUser.clinic_id를 전달
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
  }, [searchTerm, selectedStatus, selectedCategory])

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
    e.stopPropagation() // 카드 클릭 이벤트 전파 방지

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
    <div className="space-y-4">
      {/* Sub-tab Navigation */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
        <nav className="flex space-x-4">
          <button
            onClick={() => setActiveSubTab('list')}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              activeSubTab === 'list'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <DocumentTextIcon className="h-4 w-4 inline mr-2" />
            프로토콜 목록
          </button>
          <button
            onClick={() => setActiveSubTab('categories')}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              activeSubTab === 'categories'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FolderIcon className="h-4 w-4 inline mr-2" />
            카테고리 관리
          </button>
        </nav>
      </div>

      {/* Protocol List Tab */}
      {activeSubTab === 'list' && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <DocumentTextIcon className="h-6 w-6 text-blue-600 mr-2" />
              <h2 className="text-xl font-bold text-slate-800">진료 프로토콜</h2>
            </div>
            {canEdit && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                새 프로토콜 작성
              </button>
            )}
          </div>

      {/* Filters */}
      <div className="mb-6 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            placeholder="프로토콜 제목 또는 태그로 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-3">
          {/* Status Filter */}
          <div className="flex items-center space-x-2">
            <FunnelIcon className="h-4 w-4 text-slate-500" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">모든 상태</option>
              <option value="active">활성</option>
              <option value="draft">작성중</option>
              <option value="archived">보관됨</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center space-x-2">
            <FolderIcon className="h-4 w-4 text-slate-500" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
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
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm">
          {success}
        </div>
      )}

      {/* Protocols List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">프로토콜을 불러오는 중...</p>
        </div>
      ) : protocols.length === 0 ? (
        <div className="text-center py-12">
          <DocumentTextIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600 mb-2">
            {searchTerm || selectedStatus !== 'all' || selectedCategory !== 'all'
              ? '검색 조건에 맞는 프로토콜이 없습니다.'
              : '아직 작성된 프로토콜이 없습니다.'}
          </p>
          {canEdit && !searchTerm && selectedStatus === 'all' && selectedCategory === 'all' && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
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
                {/* 왼쪽: 프로토콜 정보 (클릭 가능) */}
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
                      <ClockIcon className="h-4 w-4 mr-1" />
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
                      <TagIcon className="h-4 w-4 text-slate-400" />
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

                {/* 오른쪽: 액션 버튼들 */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleViewProtocol(protocol)
                    }}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    title="보기"
                  >
                    <EyeIcon className="h-5 w-5" />
                  </button>
                  {canEdit && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditProtocol(protocol)
                        }}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                        title="수정"
                      >
                        <PencilIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteProtocolDirect(protocol, e)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="삭제"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </>
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
    </div>
  )
}
