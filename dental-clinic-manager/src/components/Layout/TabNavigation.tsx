'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import { useMenuSettings } from '@/hooks/useMenuSettings'
import type { Permission } from '@/types/permissions'
import type { MenuCategorySetting } from '@/types/menuSettings'
import {
  Home,
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
  FileText,
  Megaphone,
  ChevronDown,
  Briefcase,
  MessageSquare,
  FolderOpen,
  Settings,
  Users,
  Calendar,
  Heart,
  Clipboard,
  Star
} from 'lucide-react'

interface TabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  onItemClick?: () => void
  skipAutoRedirect?: boolean
}

interface Tab {
  id: string
  label: string
  icon: React.ElementType
  requiredPermissions?: Permission[]
  categoryId?: string
}

const defaultTabs: Tab[] = [
  { id: 'home', label: '대시보드', icon: Home },
  { id: 'daily-input', label: '일일보고서', icon: ClipboardList, requiredPermissions: ['daily_report_view'], categoryId: 'work' },
  { id: 'attendance', label: '출근 관리', icon: Clock, requiredPermissions: ['attendance_check_in', 'attendance_view_own'], categoryId: 'work' },
  { id: 'leave', label: '연차 관리', icon: CalendarDays, requiredPermissions: ['leave_request_view_own', 'leave_balance_view_own'], categoryId: 'work' },
  { id: 'bulletin', label: '병원 게시판', icon: Megaphone, categoryId: 'communication' },
  { id: 'stats', label: '통계', icon: BarChart3, requiredPermissions: ['stats_weekly_view', 'stats_monthly_view', 'stats_annual_view'], categoryId: 'communication' },
  { id: 'logs', label: '상세 기록', icon: History, requiredPermissions: ['logs_view'], categoryId: 'communication' },
  { id: 'protocols', label: '진료 프로토콜', icon: BookOpen, requiredPermissions: ['protocol_view'], categoryId: 'documents' },
  { id: 'vendors', label: '업체 연락처', icon: Building2, requiredPermissions: ['vendor_contacts_view'], categoryId: 'operations' },
  { id: 'contracts', label: '근로계약서', icon: FileSignature, requiredPermissions: ['contract_view'], categoryId: 'documents' },
  { id: 'documents', label: '문서 양식', icon: FileText, requiredPermissions: ['contract_view'], categoryId: 'documents' },
  { id: 'settings', label: '재고 관리', icon: Package, requiredPermissions: ['inventory_view'], categoryId: 'operations' },
  { id: 'guide', label: '사용 안내', icon: HelpCircle, requiredPermissions: ['guide_view'] }
]

const iconMap: Record<string, React.ElementType> = {
  'home': Home,
  'daily-input': ClipboardList,
  'attendance': Clock,
  'leave': CalendarDays,
  'bulletin': Megaphone,
  'stats': BarChart3,
  'logs': History,
  'protocols': BookOpen,
  'vendors': Building2,
  'contracts': FileSignature,
  'documents': FileText,
  'settings': Package,
  'guide': HelpCircle
}

// 카테고리 아이콘 매핑
const categoryIconMap: Record<string, React.ElementType> = {
  'Briefcase': Briefcase,
  'MessageSquare': MessageSquare,
  'FolderOpen': FolderOpen,
  'Settings': Settings,
  'Users': Users,
  'Calendar': Calendar,
  'FileText': FileText,
  'BarChart': BarChart3,
  'Heart': Heart,
  'Building2': Building2,
  'Clipboard': Clipboard,
  'Star': Star
}

const permissionsMap: Record<string, Permission[]> = {
  'home': [],
  'daily-input': ['daily_report_view'],
  'attendance': ['attendance_check_in', 'attendance_view_own'],
  'leave': ['leave_request_view_own', 'leave_balance_view_own'],
  'bulletin': [],
  'stats': ['stats_weekly_view', 'stats_monthly_view', 'stats_annual_view'],
  'logs': ['logs_view'],
  'protocols': ['protocol_view'],
  'vendors': ['vendor_contacts_view'],
  'contracts': ['contract_view'],
  'documents': ['contract_view'],
  'settings': ['inventory_view'],
  'guide': ['guide_view']
}

export default function TabNavigation({ activeTab, onTabChange, onItemClick, skipAutoRedirect = false }: TabNavigationProps) {
  const { hasPermission } = usePermissions()
  const { menuSettings, categorySettings, isLoading } = useMenuSettings()

  // 활성 탭이 속한 카테고리 찾기
  const getActiveCategoryId = (tabId: string): string | null => {
    const menuItem = menuSettings.find(m => m.id === tabId)
    return menuItem?.categoryId || null
  }

  // 초기 열린 카테고리 설정 (활성 탭이 속한 카테고리)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => {
    const activeCategoryId = getActiveCategoryId(activeTab)
    return activeCategoryId ? new Set([activeCategoryId]) : new Set()
  })

  // 활성 탭이 변경되면 해당 카테고리 자동으로 열기
  useEffect(() => {
    const activeCategoryId = getActiveCategoryId(activeTab)
    if (activeCategoryId && !expandedCategories.has(activeCategoryId)) {
      setExpandedCategories(prev => new Set([...prev, activeCategoryId]))
    }
  }, [activeTab, menuSettings])

  const tabs = useMemo(() => {
    const visibleMenuIds = menuSettings
      .filter(menu => menu.visible)
      .sort((a, b) => a.order - b.order)
      .map(menu => menu.id)

    return visibleMenuIds.map(id => {
      const defaultTab = defaultTabs.find(t => t.id === id)
      const menuSetting = menuSettings.find(m => m.id === id)

      return {
        id,
        label: menuSetting?.label || defaultTab?.label || id,
        icon: iconMap[id] || HelpCircle,
        requiredPermissions: permissionsMap[id] || [],
        categoryId: menuSetting?.categoryId || defaultTab?.categoryId
      }
    })
  }, [menuSettings])

  const visibleTabs = useMemo(() =>
    tabs.filter(tab => {
      if (!tab.requiredPermissions || tab.requiredPermissions.length === 0) {
        return true
      }
      return tab.requiredPermissions.some(perm => hasPermission(perm))
    }), [tabs, hasPermission])

  // 카테고리별로 보이는 탭 필터링
  const getVisibleTabsForCategory = (categoryId: string) => {
    return visibleTabs.filter(tab => tab.categoryId === categoryId)
  }

  // 카테고리에 활성 탭이 있는지 확인
  const categoryHasActiveTab = (categoryId: string) => {
    return visibleTabs.some(tab => tab.categoryId === categoryId && tab.id === activeTab)
  }

  // 보이는 카테고리 필터링 (카테고리가 visible이고 해당 카테고리에 표시 가능한 탭이 있는 경우)
  const visibleCategories = useMemo(() => {
    return categorySettings
      .filter(cat => cat.visible)
      .filter(cat => getVisibleTabsForCategory(cat.id).length > 0)
      .sort((a, b) => a.order - b.order)
  }, [categorySettings, visibleTabs])

  useEffect(() => {
    if (skipAutoRedirect) return
    if (visibleTabs.length > 0 && !visibleTabs.find(tab => tab.id === activeTab)) {
      onTabChange(visibleTabs[0].id)
    }
  }, [activeTab, visibleTabs, onTabChange, skipAutoRedirect])

  const handleTabClick = (tabId: string) => {
    onTabChange(tabId)
    if (onItemClick) {
      onItemClick()
    }
  }

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId)
      } else {
        newSet.add(categoryId)
      }
      return newSet
    })
  }

  if (isLoading) {
    return (
      <nav className="flex flex-col space-y-1 w-full">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="flex items-center space-x-3 py-2.5 px-3 rounded-lg animate-pulse"
          >
            <div className="w-5 h-5 bg-slate-200 rounded" />
            <div className="h-4 bg-slate-200 rounded w-20" />
          </div>
        ))}
      </nav>
    )
  }

  // 홈과 가이드 탭 분리 (카테고리가 없는 메뉴)
  const homeTab = visibleTabs.find(tab => tab.id === 'home')
  const guideTab = visibleTabs.find(tab => tab.id === 'guide')

  return (
    <nav className="flex flex-col h-full w-full">
      {/* 상단 영역: 홈 + 카테고리들 */}
      <div className="flex-1 space-y-1">
        {/* 홈 버튼 */}
        {homeTab && (
          <button
            onClick={() => handleTabClick(homeTab.id)}
            className={`
              group flex items-center space-x-3 py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 w-full
              ${activeTab === homeTab.id
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }
            `}
          >
            <Home className={`w-5 h-5 flex-shrink-0 ${activeTab === homeTab.id ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
            <span className="truncate">{homeTab.label}</span>
          </button>
        )}

        {/* 구분선 */}
        <div className="pt-2 pb-1">
          <div className="h-px bg-slate-200" />
        </div>

        {/* 카테고리들 */}
        {visibleCategories.map(category => {
          const categoryTabs = getVisibleTabsForCategory(category.id)
          if (categoryTabs.length === 0) return null

          const isExpanded = expandedCategories.has(category.id)
          const hasActive = categoryHasActiveTab(category.id)
          const CategoryIcon = categoryIconMap[category.icon] || Briefcase

          return (
            <div key={category.id} className="space-y-0.5">
              {/* 카테고리 헤더 */}
              <button
                onClick={() => toggleCategory(category.id)}
                className={`
                  group flex items-center justify-between w-full py-2 px-3 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all duration-200
                  ${hasActive && !isExpanded
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }
                `}
              >
                <div className="flex items-center space-x-2">
                  <CategoryIcon className="w-4 h-4" />
                  <span>{category.label}</span>
                  {hasActive && !isExpanded && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  )}
                </div>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                />
              </button>

              {/* 카테고리 아이템들 */}
              <div
                className={`
                  overflow-hidden transition-all duration-200 ease-in-out
                  ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
                `}
              >
                <div className="pl-2 space-y-0.5 pt-0.5">
                  {categoryTabs.map(tab => {
                    const isActive = activeTab === tab.id
                    const Icon = tab.icon

                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleTabClick(tab.id)}
                        className={`
                          group flex items-center space-x-3 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 w-full
                          ${isActive
                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/20'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                          }
                        `}
                      >
                        <Icon className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
                        <span className="truncate">{tab.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 하단 영역: 사용 안내 */}
      {guideTab && (
        <div className="pt-2 border-t border-slate-200 mt-2">
          <button
            onClick={() => handleTabClick(guideTab.id)}
            className={`
              group flex items-center space-x-3 py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 w-full
              ${activeTab === guideTab.id
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }
            `}
          >
            <HelpCircle className={`w-5 h-5 flex-shrink-0 ${activeTab === guideTab.id ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
            <span className="truncate">{guideTab.label}</span>
          </button>
        </div>
      )}
    </nav>
  )
}
