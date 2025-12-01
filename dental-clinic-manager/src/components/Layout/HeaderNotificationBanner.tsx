'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  MegaphoneIcon,
  DocumentTextIcon,
  CalendarIcon,
  CakeIcon,
  BellIcon,
  ExclamationTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline'
import type { TodayNotification, NotificationCategory } from '@/types/notification'

interface HeaderNotificationBannerProps {
  notifications: TodayNotification[]
  autoRotateInterval?: number  // 자동 순환 간격 (ms), 기본 5초
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
const CategoryColors: Record<NotificationCategory, { icon: string; bg: string; text: string }> = {
  general: { icon: 'text-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
  insurance: { icon: 'text-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  event: { icon: 'text-purple-500', bg: 'bg-purple-50', text: 'text-purple-700' },
  birthday: { icon: 'text-pink-500', bg: 'bg-pink-50', text: 'text-pink-700' },
  reminder: { icon: 'text-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
  important: { icon: 'text-red-500', bg: 'bg-red-50', text: 'text-red-700' }
}

export default function HeaderNotificationBanner({
  notifications,
  autoRotateInterval = 5000
}: HeaderNotificationBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  // 알림 개수 (hooks에서 안전하게 사용하기 위해)
  const notificationCount = notifications?.length || 0

  // 다음 알림으로 이동
  const goToNext = useCallback(() => {
    if (notificationCount <= 1) return
    setIsAnimating(true)
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % notificationCount)
      setIsAnimating(false)
    }, 150)
  }, [notificationCount])

  // 이전 알림으로 이동
  const goToPrev = useCallback(() => {
    if (notificationCount <= 1) return
    setIsAnimating(true)
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + notificationCount) % notificationCount)
      setIsAnimating(false)
    }, 150)
  }, [notificationCount])

  // 자동 순환
  useEffect(() => {
    if (notificationCount <= 1 || isPaused) return

    const interval = setInterval(goToNext, autoRotateInterval)
    return () => clearInterval(interval)
  }, [notificationCount, isPaused, autoRotateInterval, goToNext])

  // currentIndex가 범위를 벗어나지 않도록 보정
  useEffect(() => {
    if (notificationCount > 0 && currentIndex >= notificationCount) {
      setCurrentIndex(0)
    }
  }, [notificationCount, currentIndex])

  // 알림이 없으면 렌더링하지 않음 (hooks 호출 후에 체크)
  if (!notifications || notificationCount === 0) {
    return null
  }

  const currentNotification = notifications[currentIndex]
  const IconComponent = CategoryIcons[currentNotification.category]
  const colors = CategoryColors[currentNotification.category]

  return (
    <div
      className="flex-1 mx-2 sm:mx-4 min-w-0 max-w-md lg:max-w-lg xl:max-w-xl"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-full
          ${colors.bg} border border-slate-200/50
          transition-all duration-200
          hover:shadow-sm
        `}
      >
        {/* 이전 버튼 (알림이 2개 이상일 때만) */}
        {notifications.length > 1 && (
          <button
            onClick={goToPrev}
            className="flex-shrink-0 p-0.5 rounded-full hover:bg-white/50 transition-colors"
            aria-label="이전 알림"
          >
            <ChevronLeftIcon className="w-3.5 h-3.5 text-slate-400" />
          </button>
        )}

        {/* 알림 아이콘 */}
        <div className="flex-shrink-0">
          <IconComponent className={`w-4 h-4 ${colors.icon}`} />
        </div>

        {/* 알림 내용 */}
        <div
          className={`
            flex-1 min-w-0 overflow-hidden
            transition-opacity duration-150
            ${isAnimating ? 'opacity-0' : 'opacity-100'}
          `}
        >
          <p className={`text-xs sm:text-sm font-medium ${colors.text} truncate`}>
            {currentNotification.title}
          </p>
        </div>

        {/* 페이지 인디케이터 */}
        {notifications.length > 1 && (
          <div className="flex-shrink-0 flex items-center gap-1">
            <span className="text-[10px] text-slate-400 hidden sm:inline">
              {currentIndex + 1}/{notifications.length}
            </span>
            {/* 모바일용 도트 인디케이터 */}
            <div className="flex gap-0.5 sm:hidden">
              {notifications.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-1 h-1 rounded-full transition-colors ${
                    idx === currentIndex ? 'bg-slate-500' : 'bg-slate-300'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* 다음 버튼 (알림이 2개 이상일 때만) */}
        {notifications.length > 1 && (
          <button
            onClick={goToNext}
            className="flex-shrink-0 p-0.5 rounded-full hover:bg-white/50 transition-colors"
            aria-label="다음 알림"
          >
            <ChevronRightIcon className="w-3.5 h-3.5 text-slate-400" />
          </button>
        )}
      </div>
    </div>
  )
}
