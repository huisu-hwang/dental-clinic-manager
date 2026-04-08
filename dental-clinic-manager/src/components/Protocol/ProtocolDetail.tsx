'use client'

import { useState, useEffect, useCallback } from 'react'
import { XMarkIcon, PencilIcon, TrashIcon, ClockIcon, TagIcon, FolderIcon, ShieldCheckIcon, ScissorsIcon, PaperAirplaneIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import EnhancedTiptapEditor from './EnhancedTiptapEditor'
import ProtocolVersionHistory from './ProtocolVersionHistory'
import ProtocolStepViewer from './ProtocolStepViewer'
import ProtocolPermissionManager from './ProtocolPermissionManager'
import { dataService } from '@/lib/dataService'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuth } from '@/contexts/AuthContext'
import type { Protocol, ProtocolVersion, ProtocolReview } from '@/types'
import { appConfirm, appAlert } from '@/components/ui/AppDialog'
import { sanitizeHtml } from '@/utils/sanitize'

// API를 통해 알림 생성 (service_role로 RLS 우회)
async function sendNotificationViaApi(
  clinicId: string,
  createdBy: string,
  notifications: Array<{
    user_id: string
    type: string
    title: string
    content?: string
    link?: string
    reference_type?: string
    reference_id?: string
  }>
) {
  try {
    const response = await fetch('/api/user-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicId, createdBy, notifications }),
    })
    const result = await response.json()
    if (!response.ok) {
      console.error('[sendNotificationViaApi] Error:', result.error)
    }
    return result
  } catch (err) {
    console.error('[sendNotificationViaApi] Error:', err)
  }
}

interface ProtocolDetailProps {
  protocolId: string
  onClose: () => void
  onEdit: (protocol: Protocol) => void
  onDelete: (protocolId: string) => void
  onSplit?: (protocol: Protocol) => void
}

export default function ProtocolDetail({
  protocolId,
  onClose,
  onEdit,
  onDelete,
  onSplit
}: ProtocolDetailProps) {
  const { hasPermission } = usePermissions()
  const { user } = useAuth()
  const [protocol, setProtocol] = useState<Protocol | null>(null)
  const [versions, setVersions] = useState<ProtocolVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'content' | 'history'>('content')
  const [showPermissionManager, setShowPermissionManager] = useState(false)
  const [hasEditPermission, setHasEditPermission] = useState(false)
  const [hasDeletePermission, setHasDeletePermission] = useState(false)
  const [pendingReview, setPendingReview] = useState<ProtocolReview | null>(null)
  const [showReviewRequestModal, setShowReviewRequestModal] = useState(false)
  const [reviewRequestMessage, setReviewRequestMessage] = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectMessage, setRejectMessage] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)

  const canViewHistory = hasPermission('protocol_history_view')
  const isOwner = user?.role === 'owner'
  // 대표원장이거나, 전역 수정 권한이 있거나, 개별 프로토콜 수정 권한이 있거나, 본인이 생성한 프로토콜인 경우 수정 가능
  const canEdit = isOwner ||
    hasPermission('protocol_edit') ||
    hasPermission('protocol_create') ||
    hasEditPermission ||
    (protocol && protocol.created_by === user?.id)
  // 대표원장이거나, 전역 삭제 권한이 있거나, 개별 프로토콜 삭제 권한이 있거나, 본인이 생성한 프로토콜인 경우 삭제 가능
  const canDelete = isOwner ||
    hasPermission('protocol_delete') ||
    hasDeletePermission ||
    (protocol && protocol.created_by === user?.id)

  const fetchProtocol = useCallback(async () => {
    try {
      setError('')
      const result = await dataService.getProtocolById(protocolId)
      if (result.error) {
        setError(result.error)
        setProtocol(null)
      } else {
        setProtocol((result.data as Protocol | null) ?? null)

        // 개별 권한 확인 (대표원장이 아닌 경우에만)
        if (user && user.role !== 'owner') {
          const permResult = await dataService.getUserProtocolPermission(protocolId, user.id)
          if (!permResult.error && permResult.data) {
            setHasEditPermission(permResult.data.can_edit)
            setHasDeletePermission(permResult.data.can_delete)
          }
        }
      }
    } catch (err) {
      console.error('프로토콜 조회 오류:', err)
      setError(err instanceof Error ? err.message : '프로토콜을 불러오는 중 오류가 발생했습니다.')
      setProtocol(null)
    } finally {
      setLoading(false)
    }
  }, [protocolId, user])

  const fetchVersions = useCallback(async () => {
    const result = await dataService.getProtocolVersions(protocolId)
    if (result.error) {
      console.error('Failed to fetch versions:', result.error)
    } else {
      setVersions((result.data as ProtocolVersion[] | undefined) ?? [])
    }
  }, [protocolId])

  const fetchPendingReview = useCallback(async () => {
    const result = await dataService.getProtocolReviews(protocolId)
    if (!result.error && result.data) {
      const pending = result.data.find((r: ProtocolReview) => r.status === 'pending')
      setPendingReview(pending || null)
    }
  }, [protocolId])

  const handleRequestReview = async () => {
    if (!protocol?.current_version_id) return
    setReviewLoading(true)
    try {
      const result = await dataService.createProtocolReview(
        protocolId,
        protocol.current_version_id,
        reviewRequestMessage || undefined
      )
      if (result.error) {
        setError(result.error)
        return
      }
      // 대표원장에게 알림 전송 (API를 통해 service_role로 RLS 우회)
      const ownerResult = await dataService.getClinicOwnerIds()
      if (!ownerResult.error && ownerResult.data.length > 0) {
        const userName = user?.name || '사용자'
        await sendNotificationViaApi(
          protocol.clinic_id,
          user?.id || '',
          ownerResult.data.map((ownerId: string) => ({
            user_id: ownerId,
            type: 'protocol_review_requested',
            title: '프로토콜 검토 요청',
            content: `${userName}님이 "${protocol.title}" 프로토콜의 검토를 요청했습니다`,
            link: `/management?tab=protocols&review=${protocolId}`,
            reference_type: 'protocol_review',
            reference_id: result.data.id,
          }))
        )
      }
      setShowReviewRequestModal(false)
      setReviewRequestMessage('')
      await fetchProtocol()
      await fetchPendingReview()
      await appAlert('검토 요청이 전송되었습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '검토 요청 중 오류가 발생했습니다.')
    } finally {
      setReviewLoading(false)
    }
  }

  const handleApproveReview = async () => {
    if (!pendingReview) return
    if (!await appConfirm('이 프로토콜을 승인하시겠습니까?\n승인 시 프로토콜이 활성화됩니다.')) return
    setReviewLoading(true)
    try {
      const result = await dataService.approveProtocolReview(pendingReview.id)
      if (result.error) {
        setError(result.error)
        return
      }
      // 요청자에게 승인 알림
      if (protocol) {
        await sendNotificationViaApi(
          protocol.clinic_id,
          user?.id || '',
          [{
            user_id: pendingReview.requested_by,
            type: 'protocol_review_approved',
            title: '프로토콜 검토 승인',
            content: `"${protocol.title}" 프로토콜이 승인되어 활성화되었습니다`,
            link: `/management?tab=protocols&view=${protocolId}`,
            reference_type: 'protocol_review',
            reference_id: pendingReview.id,
          }]
        )
      }
      await fetchProtocol()
      await fetchPendingReview()
      await appAlert('프로토콜이 승인되어 활성화되었습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '승인 처리 중 오류가 발생했습니다.')
    } finally {
      setReviewLoading(false)
    }
  }

  const handleRejectReview = async () => {
    if (!pendingReview) return
    setReviewLoading(true)
    try {
      const result = await dataService.rejectProtocolReview(pendingReview.id, rejectMessage || undefined)
      if (result.error) {
        setError(result.error)
        return
      }
      // 요청자에게 반려 알림
      if (protocol) {
        const rejectContent = rejectMessage
          ? `"${protocol.title}" 프로토콜이 반려되었습니다. 사유: ${rejectMessage}`
          : `"${protocol.title}" 프로토콜이 반려되었습니다`
        await sendNotificationViaApi(
          protocol.clinic_id,
          user?.id || '',
          [{
            user_id: pendingReview.requested_by,
            type: 'protocol_review_rejected',
            title: '프로토콜 검토 반려',
            content: rejectContent,
            link: `/management?tab=protocols&view=${protocolId}`,
            reference_type: 'protocol_review',
            reference_id: pendingReview.id,
          }]
        )
      }
      setShowRejectModal(false)
      setRejectMessage('')
      await fetchProtocol()
      await fetchPendingReview()
      await appAlert('프로토콜이 반려되었습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '반려 처리 중 오류가 발생했습니다.')
    } finally {
      setReviewLoading(false)
    }
  }

  useEffect(() => {
    fetchProtocol()
    fetchPendingReview()
    if (canViewHistory) {
      fetchVersions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocolId, canViewHistory])

  const handleDelete = async () => {
    if (!await appConfirm('이 프로토콜을 삭제하시겠습니까?')) {
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
    if (!await appConfirm('이 버전으로 복원하시겠습니까?')) {
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-auto">
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
            {/* 검토 요청 버튼 (수정 권한이 있고, pending_review가 아닌 경우) */}
            {canEdit && protocol.status !== 'pending_review' && !isOwner && (
              <button
                onClick={() => setShowReviewRequestModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md border border-indigo-200 transition-colors"
                title="검토 요청"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
                검토 요청
              </button>
            )}
            {/* 대표원장: 승인/반려 버튼 (pending_review 상태일 때) */}
            {isOwner && protocol.status === 'pending_review' && pendingReview && (
              <>
                <button
                  onClick={handleApproveReview}
                  disabled={reviewLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md border border-green-200 transition-colors disabled:opacity-50"
                  title="승인"
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  승인
                </button>
                <button
                  onClick={() => setShowRejectModal(true)}
                  disabled={reviewLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md border border-red-200 transition-colors disabled:opacity-50"
                  title="반려"
                >
                  <XCircleIcon className="h-4 w-4" />
                  반려
                </button>
              </>
            )}
            {isOwner && (
              <button
                onClick={() => setShowPermissionManager(true)}
                className="p-2 text-purple-600 hover:bg-purple-50 rounded-md"
                title="접근 권한 관리"
              >
                <ShieldCheckIcon className="h-5 w-5" />
              </button>
            )}
            {canEdit && onSplit && protocol.currentVersion?.steps && protocol.currentVersion.steps.length >= 2 && (
              <button
                onClick={() => onSplit(protocol)}
                className="p-2 text-orange-600 hover:bg-orange-50 rounded-md"
                title="분할"
              >
                <ScissorsIcon className="h-5 w-5" />
              </button>
            )}
            {canEdit && protocol.status !== 'pending_review' && (
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

        {/* 검토 대기 안내 배너 */}
        {protocol.status === 'pending_review' && pendingReview && (
          <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <ClockIcon className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">검토 대기 중</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  {pendingReview.requested_by_user?.name || '사용자'}님이 검토를 요청했습니다.
                  {pendingReview.request_message && (
                    <span className="block mt-1 text-amber-600">요청 메시지: {pendingReview.request_message}</span>
                  )}
                </p>
                <p className="text-xs text-amber-500 mt-1">
                  {new Date(pendingReview.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="p-6 max-h-[calc(100vh-300px)] overflow-y-auto">
          {activeTab === 'content' ? (
            <div className="space-y-6">
              {protocol.currentVersion?.change_summary && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-800">
                    <strong>최근 변경사항:</strong> {protocol.currentVersion.change_summary}
                  </p>
                </div>
              )}
              {protocol.currentVersion?.steps && protocol.currentVersion.steps.length > 0 ? (
                <div className="space-y-4">
                  <ProtocolStepViewer steps={protocol.currentVersion.steps} />
                  {protocol.currentVersion.content && (
                    <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                        통합 본문 보기
                      </summary>
                      <div className="prose prose-sm max-w-none pt-3" dangerouslySetInnerHTML={{ __html: sanitizeHtml(protocol.currentVersion.content) }} />
                    </details>
                  )}
                </div>
              ) : (
                <EnhancedTiptapEditor
                  content={protocol.currentVersion?.content || ''}
                  onChange={() => {}}
                  editable={false}
                />
              )}
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

      {/* Permission Manager Modal */}
      {showPermissionManager && protocol && user && (
        <ProtocolPermissionManager
          protocolId={protocol.id}
          protocolTitle={protocol.title}
          clinicId={protocol.clinic_id}
          currentUserId={user.id}
          onClose={() => setShowPermissionManager(false)}
          onSave={() => {
            // 권한 저장 후 프로토콜 재조회 (필요시)
          }}
        />
      )}

      {/* 검토 요청 모달 */}
      {showReviewRequestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">프로토콜 검토 요청</h3>
            <p className="text-sm text-slate-600 mb-4">
              대표원장에게 &quot;{protocol.title}&quot; 프로토콜의 검토를 요청합니다.
              승인되면 프로토콜이 활성화됩니다.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                요청 메시지 (선택)
              </label>
              <textarea
                value={reviewRequestMessage}
                onChange={(e) => setReviewRequestMessage(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                rows={3}
                placeholder="검토 시 참고할 내용을 작성해주세요..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowReviewRequestModal(false); setReviewRequestMessage('') }}
                className="px-4 py-2 text-sm text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                취소
              </button>
              <button
                onClick={handleRequestReview}
                disabled={reviewLoading}
                className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {reviewLoading ? (
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  <PaperAirplaneIcon className="h-4 w-4" />
                )}
                검토 요청
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 반려 사유 모달 */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">프로토콜 검토 반려</h3>
            <p className="text-sm text-slate-600 mb-4">
              &quot;{protocol.title}&quot; 프로토콜을 반려합니다.
              프로토콜은 이전 상태로 되돌아갑니다.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                반려 사유 (선택)
              </label>
              <textarea
                value={rejectMessage}
                onChange={(e) => setRejectMessage(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                rows={3}
                placeholder="반려 사유를 입력해주세요..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowRejectModal(false); setRejectMessage('') }}
                className="px-4 py-2 text-sm text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                취소
              </button>
              <button
                onClick={handleRejectReview}
                disabled={reviewLoading}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {reviewLoading ? (
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  <XCircleIcon className="h-4 w-4" />
                )}
                반려
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
