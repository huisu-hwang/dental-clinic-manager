'use client'

import { useEffect, useMemo } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import { useMenuSettings } from '@/hooks/useMenuSettings'
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
  FileText
} from 'lucide-react'

interface TabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  onItemClick?: () => void  // 모바일에서 메뉴 닫기용
  disableAutoSwitch?: boolean  // 자동 탭 전환 비활성화 (관리 페이지 등에서 사용)
}

interface Tab {
  id: string
  label: string
  icon: React.ElementType
  requiredPermissions?: Permission[]
}

// 기본 탭 정의 (메뉴 설정에서 순서와 표시 여부를 오버라이드)
const defaultTabs: Tab[] = [
  { id: 'daily-input', label: '일일보고서', icon: ClipboardList, requiredPermissions: ['daily_report_view'] },
  { id: 'attendance', label: '출근 관리', icon: Clock, requiredPermissions: ['attendance_check_in', 'attendance_view_own'] },
  { id: 'leave', label: '연차 관리', icon: CalendarDays, requiredPermissions: ['leave_request_view_own', 'leave_balance_view_own'] },
  { id: 'stats', label: '통계', icon: BarChart3, requiredPermissions: ['stats_weekly_view', 'stats_monthly_view', 'stats_annual_view'] },
  { id: 'logs', label: '상세 기록', icon: History, requiredPermissions: ['logs_view'] },
  { id: 'protocols', label: '진료 프로토콜', icon: BookOpen, requiredPermissions: ['protocol_view'] },
  { id: 'vendors', label: '업체 연락처', icon: Building2, requiredPermissions: ['vendor_contacts_view'] },
  { id: 'contracts', label: '근로계약서', icon: FileSignature, requiredPermissions: ['contract_view'] },
  { id: 'documents', label: '문서 양식', icon: FileText, requiredPermissions: ['contract_view'] },
  { id: 'settings', label: '재고 관리', icon: Package, requiredPermissions: ['inventory_view'] },
  { id: 'guide', label: '사용 안내', icon: HelpCircle, requiredPermissions: ['guide_view'] }
]

// 아이콘 매핑
const iconMap: Record<string, React.ElementType> = {
  'daily-input': ClipboardList,
  'attendance': Clock,
  'leave': CalendarDays,
  'stats': BarChart3,
  'logs': History,
  'protocols': BookOpen,
  'vendors': Building2,
  'contracts': FileSignature,
  'settings': Package,
  'guide': HelpCircle
}

// 권한 매핑
const permissionsMap: Record<string, Permission[]> = {
  'daily-input': ['daily_report_view'],
  'attendance': ['attendance_check_in', 'attendance_view_own'],
  'leave': ['leave_request_view_own', 'leave_balance_view_own'],
  'stats': ['stats_weekly_view', 'stats_monthly_view', 'stats_annual_view'],
  'logs': ['logs_view'],
  'protocols': ['protocol_view'],
  'vendors': ['vendor_contacts_view'],
  'contracts': ['contract_view'],
  'settings': ['inventory_view'],
  'guide': ['guide_view']
}

export default function TabNavigation({ activeTab, onTabChange, onItemClick, disableAutoSwitch = false }: TabNavigationProps) {
  const { hasPermission } = usePermissions()
  const { menuSettings, isLoading } = useMenuSettings()

  // 메뉴 설정을 적용한 탭 목록 생성
  const tabs = useMemo(() => {
    // 메뉴 설정에서 보이는 메뉴만 순서대로 정렬
    const visibleMenuIds = menuSettings
      .filter(menu => menu.visible)
      .sort((a, b) => a.order - b.order)
      .map(menu => menu.id)

    // 탭 정보 생성
    return visibleMenuIds.map(id => {
      const defaultTab = defaultTabs.find(t => t.id === id)
      const menuSetting = menuSettings.find(m => m.id === id)

      return {
        id,
        label: menuSetting?.label || defaultTab?.label || id,
        icon: iconMap[id] || HelpCircle,
        requiredPermissions: permissionsMap[id] || []
      }
    })
  }, [menuSettings])

  // 권한이 있는 탭만 필터링 (useMemo로 캐싱하여 불필요한 재계산 방지)
  const visibleTabs = useMemo(() =>
    tabs.filter(tab => {
      if (!tab.requiredPermissions || tab.requiredPermissions.length === 0) {
        return true
      }
      return tab.requiredPermissions.some(perm => hasPermission(perm))
    }), [tabs, hasPermission])

  // 현재 선택된 탭이 권한이 없는 탭이면 첫 번째 탭으로 변경
  // useEffect를 사용하여 렌더링 이후에 비동기적으로 처리 (렌더링 중 상태 변경 방지)
  // isLoading 중에는 탭 자동 변경을 하지 않음 (메뉴 설정 로드 완료 후 처리)
  // disableAutoSwitch가 true면 자동 탭 전환을 하지 않음 (관리 페이지 등에서 사용)
  useEffect(() => {
    if (isLoading || disableAutoSwitch) return // 로딩 중이거나 자동 전환 비활성화 시 탭 변경하지 않음
    if (visibleTabs.length > 0 && !visibleTabs.find(tab => tab.id === activeTab)) {
      onTabChange(visibleTabs[0].id)
    }
  }, [activeTab, visibleTabs, onTabChange, isLoading, disableAutoSwitch])

  const handleTabClick = (tabId: string) => {
    onTabChange(tabId)
    // 모바일에서 메뉴 아이템 클릭 시 메뉴 닫기
    if (onItemClick) {
      onItemClick()
    }
  }

  // 로딩 중일 때 스켈레톤 표시
  if (isLoading) {
    return (
      <nav className="flex flex-col space-y-1 w-full">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="flex items-center space-x-3 py-3 lg:py-2.5 px-4 lg:px-3 rounded-xl animate-pulse"
          >
            <div className="w-5 h-5 bg-slate-200 rounded" />
            <div className="h-4 bg-slate-200 rounded w-20" />
          </div>
        ))}
      </nav>
    )
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
