'use client'

import { useState, useEffect } from 'react'
import {
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  ClockIcon,
  TagIcon,
  FolderIcon,
  ArrowUturnLeftIcon
} from '@heroicons/react/24/outline'
import TiptapEditor from './TiptapEditor'
import ProtocolVersionHistory from './ProtocolVersionHistory'
import { dataService } from '@/lib/dataService'
import { usePermissions } from '@/hooks/usePermissions'
import type { Protocol, ProtocolVersion } from '@/types'

interface ProtocolDetailProps {
  protocolId: string
  onClose: () => void
  onEdit: (protocol: Protocol) => void
  onDelete: (protocolId: string) => void
}

export default function ProtocolDetail({
  protocolId,
  onClose,
  onEdit,
  onDelete
}: ProtocolDetailProps) {
  const { hasPermission } = usePermissions()
  const [protocol, setProtocol] = useState<Protocol | null>(null)
  const [versions, setVersions] = useState<ProtocolVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [activeTab, setActiveTab] = useState<'content' | 'history'>('content')

  const canEdit = hasPermission('protocol_edit') || hasPermission('protocol_create')
  const canDelete = hasPermission('protocol_delete')
  const canViewHistory = hasPermission('protocol_history_view')

  useEffect(() => {
    fetchProtocol()
    if (canViewHistory) {
      fetchVersions()
    }
  }, [protocolId])

  const fetchProtocol = async () => {
    setLoading(true)
    const result = await dataService.getProtocolById(protocolId)
    if (result.error) {
      setError(result.error)
    } else {
      setProtocol(result.data || null)
    }
    setLoading(false)
  }

  const fetchVersions = async () => {
    const result = await dataService.getProtocolVersions(protocolId)
    if (result.error) {
      console.error('Failed to fetch versions:', result.error)
    } else {
      setVersions(result.data || [])
    }
  }

  const handleDelete = async () => {
    if (!confirm('이 프로토콜을 삭제하시겠습니까?')) {
      return
    }

    const result = await dataService.deleteProtocol(protocolId)
    if (result.error) {
      setError(result.error)
    } else {
      onDelete(protocolId)
    }
  }

  const handleRestoreVersion = async (versionId: string) => {
    if (!confirm('이 버전으로 복원하시겠습니까?')) {
      return
    }

    const result = await dataService.restoreProtocolVersion(protocolId, versionId)
    if (result.error) {
      setError(result.error)
    } else {
      await fetchProtocol()
      await fetchVersions()
      setActiveTab('content')
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
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-8 rounded-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">프로토콜을 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error || !protocol) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white p-8 rounded-lg max-w-md w-full">
          <h3 className="text-xl font-bold text-red-600 mb-4">오류 발생</h3>
          <p className="text-slate-600 mb-6">{error || '프로토콜을 불러올 수 없습니다.'}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            닫기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-8">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-200">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold text-slate-800">{protocol.title}</h2>
              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(protocol.status)}`}>
                {getStatusLabel(protocol.status)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              {protocol.category && (
                <span className="flex items-center">
                  <FolderIcon className="h-4 w-4 mr-1" />
                  <span
                    className="px-2 py-0.5 rounded text-xs font-semibold"
                    style={{
                      backgroundColor: `${protocol.category.color}20`,
                      color: protocol.category.color
                    }}
                  >
                    {protocol.category.name}
                  </span>
                </span>
              )}
              {protocol.currentVersion && (
                <>
                  <span>버전 {protocol.currentVersion.version_number}</span>
                  <span className="flex items-center">
                    <ClockIcon className="h-4 w-4 mr-1" />
                    {formatDate(protocol.currentVersion.created_at)}
                  </span>
                </>
              )}
              {protocol.created_by_user && (
                <span>작성자: {protocol.created_by_user.name}</span>
              )}
            </div>

            {protocol.tags && protocol.tags.length > 0 && (
              <div className="flex items-center flex-wrap gap-2 mt-3">
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

          <div className="flex items-center gap-2 ml-4">
            {canEdit && (
              <button
                onClick={() => onEdit(protocol)}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-md"
                title="수정"
              >
                <PencilIcon className="h-5 w-5" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                title="삭제"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        {canViewHistory && (
          <div className="border-b border-slate-200 px-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('content')}
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'content'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                내용
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center ${
                  activeTab === 'history'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <ClockIcon className="h-4 w-4 mr-2" />
                버전 히스토리 ({versions.length})
              </button>
            </nav>
          </div>
        )}

        {/* Body */}
        <div className="p-6 max-h-[calc(100vh-300px)] overflow-y-auto">
          {activeTab === 'content' ? (
            <div>
              {protocol.currentVersion?.change_summary && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-800">
                    <strong>최근 변경사항:</strong> {protocol.currentVersion.change_summary}
                  </p>
                </div>
              )}
              <TiptapEditor
                content={protocol.currentVersion?.content || ''}
                onChange={() => {}}
                editable={false}
              />
            </div>
          ) : (
            <ProtocolVersionHistory
              versions={versions}
              currentVersionId={protocol.current_version_id}
              onRestore={handleRestoreVersion}
              canRestore={hasPermission('protocol_version_restore')}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
