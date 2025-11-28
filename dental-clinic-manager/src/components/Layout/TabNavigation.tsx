'use client'

import { usePermissions } from '@/hooks/usePermissions'
import type { Permission } from '@/types/permissions'
import { 
  ClipboardList, 
  Clock, 
  BarChart3, 
  History, 
  BookOpen, 
  FileSignature, 
  Package, 
  HelpCircle 
} from 'lucide-react'

interface TabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

interface Tab {
  id: string
  label: string
  icon: React.ElementType
  requiredPermissions?: Permission[]
}

const tabs: Tab[] = [
  { id: 'daily-input', label: '일일보고서', icon: ClipboardList, requiredPermissions: ['daily_report_view'] },
  { id: 'attendance', label: '출근 관리', icon: Clock, requiredPermissions: ['attendance_check_in', 'attendance_view_own'] },
  { id: 'stats', label: '통계', icon: BarChart3, requiredPermissions: ['stats_weekly_view', 'stats_monthly_view', 'stats_annual_view'] },
  { id: 'logs', label: '상세 기록', icon: History, requiredPermissions: ['logs_view'] },
  { id: 'protocols', label: '진료 프로토콜', icon: BookOpen, requiredPermissions: ['protocol_view'] },
  { id: 'contracts', label: '근로계약서', icon: FileSignature, requiredPermissions: ['contract_view'] },
  { id: 'settings', label: '재고 관리', icon: Package, requiredPermissions: ['inventory_view'] },
  { id: 'guide', label: '사용 안내', icon: HelpCircle, requiredPermissions: ['guide_view'] }
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
    <nav className="flex gap-1 mt-3 mb-4 ml-2 overflow-x-auto bg-slate-100/80 p-1 rounded-xl">
      {visibleTabs.map(tab => {
        const isActive = activeTab === tab.id
        const Icon = tab.icon

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              group flex items-center space-x-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ease-in-out whitespace-nowrap
              ${isActive
                ? 'bg-white text-blue-600 shadow-sm border border-slate-200/60'
                : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'
              }
            `}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-blue-500' : 'text-slate-400 group-hover:text-slate-600'}`} />
            <span>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}