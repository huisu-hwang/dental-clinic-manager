'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { Permission } from '@/types/permissions'
import { DEFAULT_PERMISSIONS } from '@/types/permissions'

export function usePermissions() {
  const { user } = useAuth()
  const [permissions, setPermissions] = useState<Permission[]>([])

  useEffect(() => {
    if (!user) {
      setPermissions([])
      return
    }

    // 사용자의 권한 가져오기
    // 1. 사용자에게 직접 할당된 권한이 있으면 사용
    if (user.permissions && Array.isArray(user.permissions)) {
      setPermissions(user.permissions)
    }
    // 2. 없으면 역할 기반 기본 권한 사용
    else if (user.role) {
      const rolePermissions = DEFAULT_PERMISSIONS[user.role] || []
      setPermissions(rolePermissions)
    }
    // 3. 대표원장은 항상 모든 권한
    if (user.role === 'owner') {
      setPermissions(DEFAULT_PERMISSIONS.owner)
    }
  }, [user])

  const hasPermission = (permission: Permission | Permission[]): boolean => {
    if (!user) return false

    // 대표원장은 모든 권한
    if (user.role === 'owner') return true

    // 배열로 전달된 경우 하나라도 있으면 true
    if (Array.isArray(permission)) {
      return permission.some(p => permissions.includes(p))
    }

    return permissions.includes(permission)
  }

  const hasAllPermissions = (requiredPermissions: Permission[]): boolean => {
    if (!user) return false
    if (user.role === 'owner') return true

    return requiredPermissions.every(p => permissions.includes(p))
  }

  const canAccessTab = (tabName: string): boolean => {
    const tabPermissions: Record<string, Permission[]> = {
      'daily-input': ['daily_report_view', 'daily_report_create'],
      'weekly-stats': ['stats_weekly_view'],
      'monthly-stats': ['stats_monthly_view'],
      'annual-stats': ['stats_annual_view'],
      'logs': ['logs_view'],
      'settings': ['inventory_view', 'inventory_manage'],
      'guide': ['guide_view']
    }

    const required = tabPermissions[tabName]
    if (!required) return true

    return hasPermission(required)
  }

  return {
    permissions,
    hasPermission,
    hasAllPermissions,
    canAccessTab
  }
}