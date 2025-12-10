'use client'

import { useEffect, useMemo } from 'react'
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
  HelpCircle,
  CalendarDays,
  Building2,
  Wallet
} from 'lucide-react'

interface TabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  onItemClick?: () => void  // 모바일에서 메뉴 닫기용
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
  { id: 'leave', label: '연차 관리', icon: CalendarDays, requiredPermissions: ['leave_request_view_own', 'leave_balance_view_own'] },
  { id: 'payroll', label: '급여 관리', icon: Wallet, requiredPermissions: ['payroll_view_own', 'payroll_manage'] },
  { id: 'stats', label: '통계', icon: BarChart3, requiredPermissions: ['stats_weekly_view', 'stats_monthly_view', 'stats_annual_view'] },
  { id: 'logs', label: '상세 기록', icon: History, requiredPermissions: ['logs_view'] },
  { id: 'protocols', label: '진료 프로토콜', icon: BookOpen, requiredPermissions: ['protocol_view'] },
  { id: 'vendors', label: '업체 연락처', icon: Building2, requiredPermissions: ['vendor_contacts_view'] },
  { id: 'contracts', label: '근로계약서', icon: FileSignature, requiredPermissions: ['contract_view'] },
  { id: 'settings', label: '재고 관리', icon: Package, requiredPermissions: ['inventory_view'] },
  { id: 'guide', label: '사용 안내', icon: HelpCircle, requiredPermissions: ['guide_view'] }
]

export default function TabNavigation({ activeTab, onTabChange, onItemClick }: TabNavigationProps) {
  const { hasPermission } = usePermissions()

  // 권한이 있는 탭만 필터링 (useMemo로 캐싱하여 불필요한 재계산 방지)
  const visibleTabs = useMemo(() =>
    tabs.filter(tab => {
      if (!tab.requiredPermissions || tab.requiredPermissions.length === 0) {
        return true
      }
      return tab.requiredPermissions.some(perm => hasPermission(perm))
    }), [hasPermission])

  // 현재 선택된 탭이 권한이 없는 탭이면 첫 번째 탭으로 변경
  // useEffect를 사용하여 렌더링 이후에 비동기적으로 처리 (렌더링 중 상태 변경 방지)
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.find(tab => tab.id === activeTab)) {
      onTabChange(visibleTabs[0].id)
    }
  }, [activeTab, visibleTabs, onTabChange])

  const handleTabClick = (tabId: string) => {
    onTabChange(tabId)
    // 모바일에서 메뉴 아이템 클릭 시 메뉴 닫기
    if (onItemClick) {
      onItemClick()
    }
  }

  return (
    <nav className="flex flex-col space-y-1 w-full">
      {visibleTabs.map(tab => {
        const isActive = activeTab === tab.id
        const Icon = tab.icon

        return (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`
              group flex items-center space-x-3 py-3 lg:py-2.5 px-4 lg:px-3 rounded-xl text-sm font-medium transition-all duration-200 ease-in-out whitespace-nowrap relative
              ${isActive
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }
            `}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
            <span className="truncate">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}