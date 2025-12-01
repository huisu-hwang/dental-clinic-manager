'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import type {
  ClinicNotification,
  TodayNotification
} from '@/types/notification'
import {
  shouldShowNotificationToday,
  canUserSeeNotification
} from '@/types/notification'

interface UseClinicNotificationsOptions {
  clinicId?: string
  userRole?: string
  enabled?: boolean
}

interface UseClinicNotificationsResult {
  notifications: TodayNotification[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useClinicNotifications({
  clinicId,
  userRole,
  enabled = true
}: UseClinicNotificationsOptions): UseClinicNotificationsResult {
  const [notifications, setNotifications] = useState<TodayNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!clinicId || !enabled) {
      setNotifications([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // API 라우트를 통해 알림 조회 (activeOnly=true로 활성화된 알림만)
      const response = await fetch(
        `/api/notifications?clinicId=${encodeURIComponent(clinicId)}&activeOnly=true`
      )
      const result = await response.json()

      if (!response.ok) {
        console.log('Notifications fetch info:', result.error)
        setNotifications([])
        setLoading(false)
        return
      }

      if (!result.data || result.data.length === 0) {
        setNotifications([])
        setLoading(false)
        return
      }

      // 오늘 표시할 알림 필터링
      const todayNotifications = (result.data as ClinicNotification[])
        .filter(notification => {
          // 오늘 표시할 알림인지 확인
          if (!shouldShowNotificationToday(notification)) return false

          // 사용자가 볼 수 있는 알림인지 확인
          if (userRole && !canUserSeeNotification(notification, userRole)) return false

          return true
        })
        .map(notification => ({
          id: notification.id,
          title: notification.title,
          content: notification.content,
          category: notification.category,
          priority: notification.priority
        }))

      setNotifications(todayNotifications)
    } catch (err) {
      console.error('Error fetching notifications:', err)
      setError('알림을 불러오는데 실패했습니다.')
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }, [clinicId, userRole, enabled])

  // 초기 로드
  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // 실시간 구독 (선택적) - Supabase Realtime 사용
  useEffect(() => {
    if (!clinicId || !enabled) return

    const supabase = getSupabase()
    if (!supabase) return

    const channel = supabase
      .channel(`clinic_notifications_${clinicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clinic_notifications',
          filter: `clinic_id=eq.${clinicId}`
        },
        () => {
          // 변경 사항이 있으면 다시 가져오기
          fetchNotifications()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clinicId, enabled, fetchNotifications])

  return {
    notifications,
    loading,
    error,
    refetch: fetchNotifications
  }
}
