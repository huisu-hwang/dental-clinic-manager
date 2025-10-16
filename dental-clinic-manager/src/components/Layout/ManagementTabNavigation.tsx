'use client'

import {
  UsersIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  CogIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'
import { usePermissions } from '@/hooks/usePermissions'
import type { Permission } from '@/types/permissions'

interface ManagementTabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  userRole: string
}

interface Tab {
  id: string
  label: string
  icon: any
  requiredPermissions?: Permission[]
}

export default function ManagementTabNavigation({
  activeTab,
  onTabChange,
  userRole
}: ManagementTabNavigationProps) {
  const { hasPermission } = usePermissions()

  const tabs: Tab[] = [
    {
      id: 'staff',
      label: '직원 관리',
      icon: UsersIcon,
      requiredPermissions: ['staff_view', 'staff_manage']
    },
    {
      id: 'clinic',
      label: '병원 설정',
      icon: BuildingOfficeIcon,
      requiredPermissions: ['clinic_settings']
    },
    {
      id: 'protocols',
      label: '진료 프로토콜',
      icon: DocumentTextIcon,
      requiredPermissions: ['protocol_view']
    },
    {
      id: 'analytics',
      label: '통계 분석',
      icon: ChartBarIcon,
      requiredPermissions: ['stats_monthly_view', 'stats_annual_view']
    },
    {
      id: 'system',
      label: '시스템 설정',
      icon: CogIcon,
      requiredPermissions: ['clinic_settings']  // 대표원장만 가지는 권한
    }
  ]

  // 권한 체크
  const visibleTabs = tabs.filter(tab => {
    if (!tab.requiredPermissions || tab.requiredPermissions.length === 0) {
      return true
    }
    // 하나라도 권한이 있으면 표시
    return tab.requiredPermissions.some(perm => hasPermission(perm))
  })

  return (
    <div className="border-b border-slate-200 mb-6">
      <nav className="-mb-px flex space-x-8">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <tab.icon className="h-5 w-5 mr-2" />
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}