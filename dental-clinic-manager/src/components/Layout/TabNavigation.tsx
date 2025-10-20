'use client'

import { usePermissions } from '@/hooks/usePermissions'
import type { Permission } from '@/types/permissions'

interface TabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

interface Tab {
  id: string
  label: string
  requiredPermissions?: Permission[]
}

const tabs: Tab[] = [
  { id: 'daily-input', label: '일일 보고서 입력', requiredPermissions: ['daily_report_view'] },
  { id: 'stats', label: '통계', requiredPermissions: ['stats_weekly_view', 'stats_monthly_view', 'stats_annual_view'] },
  { id: 'logs', label: '상세 기록', requiredPermissions: ['logs_view'] },
  { id: 'settings', label: '설정', requiredPermissions: ['inventory_view'] },
  { id: 'guide', label: '사용 안내', requiredPermissions: ['guide_view'] }
]

export default function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const { hasPermission } = usePermissions()

  // 권한이 있는 탭만 필터링
  const visibleTabs = tabs.filter(tab => {
    if (!tab.requiredPermissions || tab.requiredPermissions.length === 0) {
      return true
    }
    return tab.requiredPermissions.some(perm => hasPermission(perm))
  })

  // 현재 선택된 탭이 권한이 없는 탭이면 첫 번째 탭으로 변경
  if (visibleTabs.length > 0 && !visibleTabs.find(tab => tab.id === activeTab)) {
    onTabChange(visibleTabs[0].id)
  }

  return (
    <nav className="flex border-b border-slate-200 mb-6 overflow-x-auto">
      {visibleTabs.map(tab => (
        <button
          key={tab.id}
          className={`py-3 px-6 border-b-2 border-transparent text-slate-600 flex-shrink-0 transition-colors ${
            activeTab === tab.id
              ? 'border-blue-500 text-blue-500 font-bold'
              : 'hover:text-slate-800'
          }`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}