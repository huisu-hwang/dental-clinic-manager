'use client'

import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import {
  XMarkIcon,
  MegaphoneIcon,
  DocumentTextIcon,
  CalendarIcon,
  CakeIcon,
  BellIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'
import type { TodayNotification, NotificationCategory } from '@/types/notification'
import { NOTIFICATION_CATEGORY_LABELS } from '@/types/notification'

interface NotificationDetailModalProps {
  notification: TodayNotification | null
  isOpen: boolean
  onClose: () => void
  onDismiss: (notificationId: string) => void
}

// 카테고리별 아이콘 컴포넌트 매핑
const CategoryIcons: Record<NotificationCategory, React.ComponentType<{ className?: string }>> = {
  general: MegaphoneIcon,
  insurance: DocumentTextIcon,
  event: CalendarIcon,
  birthday: CakeIcon,
  reminder: BellIcon,
  important: ExclamationTriangleIcon
}

// 카테고리별 색상 클래스
const CategoryColors: Record<NotificationCategory, { icon: string; bg: string; text: string; border: string }> = {
  general: { icon: 'text-blue-500', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  insurance: { icon: 'text-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  event: { icon: 'text-purple-500', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  birthday: { icon: 'text-pink-500', bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  reminder: { icon: 'text-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  important: { icon: 'text-red-500', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' }
}

export default function NotificationDetailModal({
  notification,
  isOpen,
  onClose,
  onDismiss
}: NotificationDetailModalProps) {
  if (!notification) return null

  const IconComponent = CategoryIcons[notification.category]
  const colors = CategoryColors[notification.category]

  const handleDismiss = () => {
    onDismiss(notification.id)
    onClose()
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white text-left align-middle shadow-xl transition-all">
                {/* 헤더 */}
                <div className={`${colors.bg} ${colors.border} border-b px-6 py-4`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full bg-white/80 ${colors.icon}`}>
                        <IconComponent className="w-6 h-6" />
                      </div>
                      <div>
                        <span className={`text-xs font-medium ${colors.text} uppercase tracking-wide`}>
                          {NOTIFICATION_CATEGORY_LABELS[notification.category]}
                        </span>
                        <Dialog.Title
                          as="h3"
                          className="text-lg font-semibold leading-6 text-gray-900 mt-1"
                        >
                          {notification.title}
                        </Dialog.Title>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-full p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/50 transition-colors"
                      onClick={onClose}
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* 내용 */}
                <div className="px-6 py-5">
                  {notification.content ? (
                    <div className="text-gray-600 whitespace-pre-wrap leading-relaxed">
                      {notification.content}
                    </div>
                  ) : (
                    <p className="text-gray-400 italic">상세 내용이 없습니다.</p>
                  )}
                </div>

                {/* 액션 버튼 - 우측 하단 배치 */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                  <div className="flex gap-3 justify-end">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      onClick={onClose}
                    >
                      닫기
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                      onClick={handleDismiss}
                    >
                      <CheckCircleIcon className="w-4 h-4" />
                      해제
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
