'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { Permission } from '@/types/permissions'
import { DEFAULT_PERMISSIONS, PERMISSION_DESCRIPTIONS } from '@/types/permissions'

// 신규 추가된 기능의 권한 prefix 목록
// 커스텀 권한에 해당 prefix 권한이 하나도 없으면 역할 기본값에서 자동 보충
const NEW_FEATURE_PREFIXES = [
  'payroll_',
  'task_checklist_',
  'task_directive_',
  'bulletin_',
  'community_',
  'recall_',
  'ai_analysis_',
  'financial_',
  'marketing_',
  'investment_',
] as const

// 신규로 추가된 개별 권한(prefix 보충 대상이 아닌 단독 권한)
// 기존 그룹에 추가된 권한이라 prefix 보충에서 누락되므로, 직급 기본값에서 직접 보충
const NEW_INDIVIDUAL_PERMISSIONS: Permission[] = ['contract_view_all']

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
      userPermissions = [...user.permissions]

      // 커스텀 권한에 새로운 기능 권한이 누락된 경우 역할 기본값에서 보충
      const roleDefaults = DEFAULT_PERMISSIONS[user.role || ''] || []
      for (const prefix of NEW_FEATURE_PREFIXES) {
        const hasFeaturePerms = userPermissions.some(p => p.startsWith(prefix))
        if (!hasFeaturePerms) {
          const featureDefaults = roleDefaults.filter(p => p.startsWith(prefix))
          userPermissions.push(...featureDefaults)
        }
      }

      // 단독 신규 권한 보충 (기존 그룹에 추가된 권한)
      for (const perm of NEW_INDIVIDUAL_PERMISSIONS) {
        if (!userPermissions.includes(perm) && roleDefaults.includes(perm)) {
          userPermissions.push(perm)
        }
      }
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