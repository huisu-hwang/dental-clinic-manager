'use client'

import { useState, useEffect, useCallback } from 'react'
import type { UserNotification, UserNotificationListResponse } from '@/types/notification'

interface UseUserNotificationsOptions {
  limit?: number
  autoRefresh?: boolean
  refreshInterval?: number
}

interface UseUserNotificationsReturn {
  notifications: UserNotification[]
  unreadCount: number
  total: number
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  markAsRead: (notificationId: string) => Promise<boolean>
  markAllAsRead: () => Promise<boolean>
  deleteNotification: (notificationId: string) => Promise<boolean>
}

export function useUserNotifications(options: UseUserNotificationsOptions = {}): UseUserNotificationsReturn {
  const { limit = 20, autoRefresh = true, refreshInterval = 60000 } = options // 기본 1분마다 새로고침

  const [notifications, setNotifications] = useState<UserNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 현재 사용자 및 병원 정보 가져오기
  const getUserInfo = useCallback(() => {
    if (typeof window === 'undefined') return null
    const userStr = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
    const clinicId = sessionStorage.getItem('dental_clinic_id') || localStorage.getItem('dental_clinic_id')
    if (!userStr || !clinicId) return null
    try {
      const user = JSON.parse(userStr)
      return { userId: user.id, clinicId }
    } catch {
      return null
    }
  }, [])

  // 알림 목록 조회
  const fetchNotifications = useCallback(async () => {
    const userInfo = getUserInfo()
    if (!userInfo) {
      setLoading(false)
      return
    }

    try {
      const params = new URLSearchParams({
        userId: userInfo.userId,
        clinicId: userInfo.clinicId,
        limit: limit.toString(),
      })

      const response = await fetch(`/api/user-notifications?${params}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch notifications')
      }

      const data = result.data as UserNotificationListResponse
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
      setTotal(data.total || 0)
      setError(null)
    } catch (err) {
      console.error('[useUserNotifications] Fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch notifications')
    } finally {
      setLoading(false)
    }
  }, [getUserInfo, limit])

  // 알림 읽음 처리
  const markAsRead = useCallback(async (notificationId: string): Promise<boolean> => {
    const userInfo = getUserInfo()
    if (!userInfo) return false

    try {
      const response = await fetch('/api/user-notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userInfo.userId,
          clinicId: userInfo.clinicId,
          notificationId,
        }),
      })

      if (response.ok) {
        // 로컬 상태 업데이트
        setNotifications(prev =>
          prev.map(n =>
            n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
          )
        )
        setUnreadCount(prev => Math.max(0, prev - 1))
        return true
      }
      return false
    } catch (err) {
      console.error('[useUserNotifications] Mark as read error:', err)
      return false
    }
  }, [getUserInfo])

  // 모든 알림 읽음 처리
  const markAllAsRead = useCallback(async (): Promise<boolean> => {
    const userInfo = getUserInfo()
    if (!userInfo) return false

    try {
      const response = await fetch('/api/user-notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userInfo.userId,
          clinicId: userInfo.clinicId,
          markAll: true,
        }),
      })

      if (response.ok) {
        // 로컬 상태 업데이트
        setNotifications(prev =>
          prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
        )
        setUnreadCount(0)
        return true
      }
      return false
    } catch (err) {
      console.error('[useUserNotifications] Mark all as read error:', err)
      return false
    }
  }, [getUserInfo])

  // 알림 삭제
  const deleteNotification = useCallback(async (notificationId: string): Promise<boolean> => {
    const userInfo = getUserInfo()
    if (!userInfo) return false

    try {
      const params = new URLSearchParams({
        userId: userInfo.userId,
        clinicId: userInfo.clinicId,
        notificationId,
      })

      const response = await fetch(`/api/user-notifications?${params}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        const deletedNotification = notifications.find(n => n.id === notificationId)
        setNotifications(prev => prev.filter(n => n.id !== notificationId))
        setTotal(prev => Math.max(0, prev - 1))
        if (deletedNotification && !deletedNotification.is_read) {
          setUnreadCount(prev => Math.max(0, prev - 1))
        }
        return true
      }
      return false
    } catch (err) {
      console.error('[useUserNotifications] Delete error:', err)
      return false
    }
  }, [getUserInfo, notifications])

  // 초기 로드 및 자동 새로고침
  useEffect(() => {
    fetchNotifications()

    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchNotifications, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchNotifications, autoRefresh, refreshInterval])

  return {
    notifications,
    unreadCount,
    total,
    loading,
    error,
    refresh: fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  }
}

export default useUserNotifications
