'use client'

import {
  UsersIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  CogIcon
} from '@heroicons/react/24/outline'

interface ManagementTabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  userRole: string
}

export default function ManagementTabNavigation({
  activeTab,
  onTabChange,
  userRole
}: ManagementTabNavigationProps) {
  const tabs = [
    {
      id: 'staff',
      label: '직원 관리',
      icon: UsersIcon,
      allowedRoles: ['owner', 'vice_director']
    },
    {
      id: 'clinic',
      label: '병원 설정',
      icon: BuildingOfficeIcon,
      allowedRoles: ['owner', 'vice_director']
    },
    {
      id: 'analytics',
      label: '통계 분석',
      icon: ChartBarIcon,
      allowedRoles: ['owner', 'vice_director', 'manager']
    },
    {
      id: 'system',
      label: '시스템 설정',
      icon: CogIcon,
      allowedRoles: ['owner']
    }
  ]

  const visibleTabs = tabs.filter(tab =>
    tab.allowedRoles.includes(userRole)
  )

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