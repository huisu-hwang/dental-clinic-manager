'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { Permission } from '@/types/permissions'
import { DEFAULT_PERMISSIONS, PERMISSION_DESCRIPTIONS } from '@/types/permissions'

export function usePermissions() {
  const { user } = useAuth()
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)

    if (!user) {
      setPermissions(new Set())
      setIsLoading(false)
      return
    }

    let userPermissions: Permission[] = []

    // 'owner'는 모든 권한을 가짐
    if (user.role === 'owner') {
      userPermissions = Object.keys(PERMISSION_DESCRIPTIONS) as Permission[]
    } else if (user.permissions && user.permissions.length > 0) {
      // 사용자에게 직접 할당된 권한이 있으면 사용
      userPermissions = user.permissions
    } else {
      // 없으면 역할 기반 기본 권한 사용
      userPermissions = DEFAULT_PERMISSIONS[user.role || ''] || []
    }

    setPermissions(new Set(userPermissions))
    setIsLoading(false)
  }, [user])

  const hasPermission = (permission: Permission): boolean => {
    return permissions.has(permission)
  }

  const canAccessTab = (tabName: string): boolean => {
    const tabPermissions: Record<string, Permission[]> = {
      'daily-input': ['daily_report_view', 'daily_report_create'],
      'weekly-stats': ['stats_weekly_view'],
      'monthly-stats': ['stats_monthly_view'],
      'annual-stats': ['stats_annual_view'],
      'logs': ['logs_view'],
      'settings': ['inventory_view', 'inventory_manage'],
      'guide': ['guide_view'],
    }

    const required = tabPermissions[tabName]
    if (!required || required.length === 0) return true

    // 'owner'는 모든 탭 접근 가능
    if (user?.role === 'owner') return true

    // 필요한 권한 중 하나라도 있으면 접근 가능
    return required.some(p => permissions.has(p))
  }

  return {
    permissions,
    hasPermission,
    canAccessTab,
    isLoading,
  }
}