'use client'

import {
  UsersIcon,
  BuildingOfficeIcon,
  BuildingStorefrontIcon,
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
      id: 'branches',
      label: '지점 관리',
      icon: BuildingStorefrontIcon,
      requiredPermissions: ['clinic_settings']  // owner와 manager만
    },
    {
      id: 'clinic',
      label: '병원 설정',
      icon: BuildingOfficeIcon,
      requiredPermissions: ['clinic_settings']
    },
    {
      id: 'protocols',
      label: '프로토콜 관리',
      icon: DocumentTextIcon,
      requiredPermissions: ['protocol_view', 'protocol_create', 'protocol_edit']
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
    <nav className="flex gap-1 mt-3 mb-4 ml-2 overflow-x-auto bg-slate-100/80 p-1 rounded-xl">
      {visibleTabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            group flex items-center space-x-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ease-in-out whitespace-nowrap
            ${activeTab === tab.id
              ? 'bg-white text-blue-600 shadow-sm border border-slate-200/60'
              : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'
            }
          `}
        >
          <tab.icon className={`h-4 w-4 ${activeTab === tab.id ? 'text-blue-500' : 'text-slate-400 group-hover:text-slate-600'}`} />
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}