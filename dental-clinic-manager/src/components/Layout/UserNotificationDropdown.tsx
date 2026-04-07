'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  BellIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowRightIcon,
  PencilIcon,
  DocumentCheckIcon,
  DocumentTextIcon,
  DocumentMinusIcon,
  CheckIcon,
  TrashIcon,
  ExclamationCircleIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  ClipboardDocumentCheckIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { BellIcon as BellSolidIcon } from '@heroicons/react/24/solid'
import type { UserNotification, UserNotificationType } from '@/types/notification'
import { USER_NOTIFICATION_TYPE_COLORS } from '@/types/notification'
import { useUserNotifications } from '@/hooks/useUserNotifications'

// 알림 타입별 아이콘 컴포넌트
const NotificationTypeIcons: Record<UserNotificationType, React.ComponentType<{ className?: string }>> = {
  leave_approval_pending: ClockIcon,
  leave_approved: CheckCircleIcon,
  leave_rejected: XCircleIcon,
  leave_forwarded: ArrowRightIcon,
  contract_signature_required: PencilIcon,
  contract_signed: DocumentCheckIcon,
  contract_completed: DocumentTextIcon,
  contract_cancelled: DocumentMinusIcon,
  document_resignation: DocumentTextIcon,
  document_approved: CheckCircleIcon,
  document_rejected: XCircleIcon,
  document: DocumentTextIcon,
  important: ExclamationCircleIcon,
  system: BellIcon,
  telegram_board_approved: CheckCircleIcon,
  telegram_board_rejected: XCircleIcon,
  telegram_board_pending: ClockIcon,
  task_assigned: ClipboardDocumentListIcon,
  task_completed: CheckCircleIcon,
  protocol_review_requested: ClipboardDocumentCheckIcon,
  protocol_review_approved: CheckCircleIcon,
  protocol_review_rejected: XCircleIcon,
}

// 알림 타입별 기본 링크 매핑 (link가 없는 경우 fallback)
const DEFAULT_NOTIFICATION_LINKS: Partial<Record<UserNotificationType, string>> = {
  leave_approval_pending: '/management?tab=leave&subtab=approval',
  leave_approved: '/management?tab=leave',
  leave_rejected: '/management?tab=leave',
  leave_forwarded: '/management?tab=leave',
  contract_signature_required: '/dashboard?tab=documents',
  contract_signed: '/dashboard?tab=documents',
  contract_completed: '/dashboard?tab=documents',
  contract_cancelled: '/dashboard?tab=documents',
  document_resignation: '/dashboard?tab=documents',
  document_approved: '/dashboard?tab=documents',
  document_rejected: '/dashboard?tab=documents',
  document: '/dashboard?tab=documents',
  telegram_board_approved: '/community/telegram',
  telegram_board_rejected: '/community/telegram',
  telegram_board_pending: '/community/admin?tab=telegram',
  task_assigned: '/bulletin?tab=tasks',
  task_completed: '/bulletin?tab=tasks',
  protocol_review_requested: '/management?tab=protocol',
  protocol_review_approved: '/management?tab=protocol',
  protocol_review_rejected: '/management?tab=protocol',
}

// 알림의 이동 링크 결정 (명시적 link > 타입별 기본 link)
function getNotificationLink(notification: UserNotification): string | null {
  return notification.link || DEFAULT_NOTIFICATION_LINKS[notification.type] || null
}

// 상대 시간 계산
function getRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return '방금 전'
  if (diffMins < 60) return `${diffMins}분 전`
  if (diffHours < 24) return `${diffHours}시간 전`
  if (diffDays < 7) return `${diffDays}일 전`

  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

export default function UserNotificationDropdown() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refresh,
  } = useUserNotifications({ limit: 10, autoRefresh: true, refreshInterval: 30000 })

  // 외부 클릭 감지
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 알림 클릭 핸들러
  const handleNotificationClick = async (notification: UserNotification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id)
    }

    const link = getNotificationLink(notification)
    if (link) {
      setIsOpen(false)
      router.push(link)
    }
  }

  // 알림 삭제 핸들러
  const handleDelete = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation()
    await deleteNotification(notificationId)
  }

  // 모두 읽음 핸들러
  const handleMarkAllAsRead = async () => {
    await markAllAsRead()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 알림 버튼 */}
      <button
        onClick={() => {
          setIsOpen(!isOpen)
          if (!isOpen) refresh()
        }}
        className="relative flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-100 transition-colors"
        aria-label="알림"
      >
        {unreadCount > 0 ? (
          <BellSolidIcon className="w-5 h-5 text-blue-600" />
        ) : (
          <BellIcon className="w-5 h-5 text-slate-500" />
        )}

        {/* 배지 */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 드롭다운 */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="font-semibold text-slate-800">알림</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                모두 읽음
              </button>
            )}
          </div>

          {/* 알림 목록 */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <BellIcon className="w-10 h-10 mb-2" />
                <p className="text-sm">알림이 없습니다</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map((notification) => {
                  const IconComponent = NotificationTypeIcons[notification.type] || BellIcon
                  const colors = USER_NOTIFICATION_TYPE_COLORS[notification.type] || USER_NOTIFICATION_TYPE_COLORS.system
                  const hasLink = !!getNotificationLink(notification)

                  return (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`
                        flex items-start gap-3 px-4 py-3 cursor-pointer
                        hover:bg-slate-50 transition-colors group
                        ${!notification.is_read ? 'bg-blue-50/50' : ''}
                      `}
                    >
                      {/* 아이콘 */}
                      <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${colors.bg}`}>
                        <IconComponent className={`w-5 h-5 ${colors.icon}`} />
                      </div>

                      {/* 내용 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-medium truncate ${!notification.is_read ? 'text-slate-900' : 'text-slate-700'}`}>
                            {notification.title}
                          </p>
                          {/* 읽지 않음 표시 */}
                          {!notification.is_read && (
                            <span className="flex-shrink-0 w-2 h-2 mt-1.5 bg-blue-500 rounded-full" />
                          )}
                        </div>
                        {notification.content && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                            {notification.content}
                          </p>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                          <p className="text-xs text-slate-400">
                            {getRelativeTime(notification.created_at)}
                          </p>
                          {hasLink && (
                            <span className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                              · 바로가기 <ChevronRightIcon className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 삭제 버튼 */}
                      <button
                        onClick={(e) => handleDelete(e, notification.id)}
                        className="flex-shrink-0 p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-red-500 transition-colors"
                        aria-label="삭제"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 더보기 - 향후 전체 알림 페이지 구현 시 활성화 */}
          {/* {notifications.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => {
                  setIsOpen(false)
                  router.push('/notifications')
                }}
                className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                모든 알림 보기
              </button>
            </div>
          )} */}
        </div>
      )}
    </div>
  )
}
