'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { usePermissions } from '@/hooks/usePermissions'
import { useMenuSettings } from '@/hooks/useMenuSettings'
import { useAuth } from '@/contexts/AuthContext'
import { saveUserMenuSettings } from '@/lib/menuSettingsService'
import type { Permission } from '@/types/permissions'
import type { MenuItemSetting, MenuCategorySetting } from '@/types/menuSettings'
import { MENU_ICON_MAP, MENU_PERMISSIONS_MAP, MENU_OWNER_ONLY_MAP } from '@/config/menuConfig'
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
  Star,
  Bell,
  Bookmark,
  Box,
  Coffee,
  Flag,
  Gift,
  Globe,
  Layers,
  Layout,
  List,
  Mail,
  Map,
  Monitor,
  Palette,
  Phone,
  Scissors,
  Shield,
  Target,
  Truck,
  Zap,
  SlidersHorizontal,
  Banknote,
  PhoneCall,
  Sparkles,
  ClipboardCheck,
  GripVertical,
  Pencil,
  Check
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
  fixedPosition?: 'top' | 'bottom'
}

// 아이콘 이름 -> 컴포넌트 매핑 (중앙 설정에서 사용)
const iconNameToComponent: Record<string, React.ElementType> = {
  'Home': Home,
  'ClipboardList': ClipboardList,
  'Clock': Clock,
  'CalendarDays': CalendarDays,
  'Megaphone': Megaphone,
  'BarChart3': BarChart3,
  'History': History,
  'BookOpen': BookOpen,
  'Building2': Building2,
  'FileSignature': FileSignature,
  'FileText': FileText,
  'Banknote': Banknote,
  'Package': Package,
  'HelpCircle': HelpCircle,
  'SlidersHorizontal': SlidersHorizontal,
  'PhoneCall': PhoneCall,
  'Sparkles': Sparkles,
  'ClipboardCheck': ClipboardCheck,
  'Briefcase': Briefcase,
  'MessageSquare': MessageSquare,
  'FolderOpen': FolderOpen,
  'Settings': Settings,
  'Users': Users,
  'Calendar': Calendar,
  'Heart': Heart,
  'Clipboard': Clipboard,
  'Star': Star,
  'Bell': Bell,
  'Bookmark': Bookmark,
  'Box': Box,
  'Coffee': Coffee,
  'Flag': Flag,
  'Gift': Gift,
  'Globe': Globe,
  'Layers': Layers,
  'Layout': Layout,
  'List': List,
  'Mail': Mail,
  'Map': Map,
  'Monitor': Monitor,
  'Palette': Palette,
  'Phone': Phone,
  'Scissors': Scissors,
  'Shield': Shield,
  'Target': Target,
  'Truck': Truck,
  'Zap': Zap
}

// 메뉴 ID로 아이콘 컴포넌트 가져오기 (중앙 설정 MENU_ICON_MAP 사용)
const getIconForMenu = (menuId: string): React.ElementType => {
  const iconName = MENU_ICON_MAP[menuId]
  return iconNameToComponent[iconName] || HelpCircle
}

// 카테고리 아이콘 매핑 (iconNameToComponent 재사용 + BarChart 추가)
const categoryIconMap: Record<string, React.ElementType> = {
  ...iconNameToComponent,
  'BarChart': BarChart3  // 레거시 호환성
}

// 권한 매핑은 중앙 설정(MENU_PERMISSIONS_MAP)에서 가져옴

// --- Sortable 컴포넌트들 ---

// 드래그 가능한 카테고리 래퍼
function SortableCategory({ id, children }: { id: string; children: (listeners: Record<string, unknown>, isDragging: boolean) => React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { type: 'category' } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children(listeners as Record<string, unknown>, isDragging)}
    </div>
  )
}

// 드래그 가능한 메뉴 아이템 래퍼
function SortableMenuItem({ id, children }: { id: string; children: (listeners: Record<string, unknown>, isDragging: boolean) => React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { type: 'menu-item' } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children(listeners as Record<string, unknown>, isDragging)}
    </div>
  )
}

export default function TabNavigation({ activeTab, onTabChange, onItemClick, skipAutoRedirect = false }: TabNavigationProps) {
  const { hasPermission } = usePermissions()
  const { menuSettings, categorySettings, isLoading } = useMenuSettings()
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'

  // 편집 모드 상태
  const [isEditMode, setIsEditMode] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  // 편집 모드용 로컬 상태 (드래그 중 순서 변경 반영)
  const [localMenuSettings, setLocalMenuSettings] = useState<MenuItemSetting[]>(menuSettings)
  const [localCategorySettings, setLocalCategorySettings] = useState<MenuCategorySetting[]>(categorySettings)

  // 메뉴 설정이 변경되면 로컬 상태 동기화
  useEffect(() => {
    if (!isEditMode) {
      setLocalMenuSettings(menuSettings)
      setLocalCategorySettings(categorySettings)
    }
  }, [menuSettings, categorySettings, isEditMode])

  // DnD 센서 설정 (8px 활성화 거리로 클릭과 드래그 구분)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  // 활성 탭이 속한 카테고리 찾기
  const getActiveCategoryId = (tabId: string): string | null => {
    const menuItem = localMenuSettings.find(m => m.id === tabId)
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
  }, [activeTab, localMenuSettings])

  // 편집 모드 진입 시 모든 카테고리 펼치기
  useEffect(() => {
    if (isEditMode) {
      const allCategoryIds = localCategorySettings.map(c => c.id)
      setExpandedCategories(new Set(allCategoryIds))
    }
  }, [isEditMode, localCategorySettings])

  // 탭 데이터 생성 (메뉴 설정 기반, 중앙 설정에서 아이콘/권한 가져옴)
  const tabs = useMemo(() => {
    return localMenuSettings
      .filter(menu => menu.visible)
      .sort((a, b) => a.order - b.order)
      .map(menu => ({
        id: menu.id,
        label: menu.label,
        icon: getIconForMenu(menu.id),
        requiredPermissions: MENU_PERMISSIONS_MAP[menu.id] || [],
        categoryId: menu.categoryId,
        fixedPosition: menu.fixedPosition
      }))
  }, [localMenuSettings])

  // 권한에 따른 보이는 탭 필터링
  const visibleTabs = useMemo(() =>
    tabs.filter(tab => {
      // 대표 원장 전용 메뉴 체크
      if (MENU_OWNER_ONLY_MAP[tab.id] && !isOwner) {
        return false
      }
      if (!tab.requiredPermissions || tab.requiredPermissions.length === 0) {
        return true
      }
      return tab.requiredPermissions.some(perm => hasPermission(perm))
    }), [tabs, hasPermission, isOwner])

  // 상단 고정 메뉴 (fixedPosition === 'top' 또는 categoryId가 없고 fixedPosition이 없는 기존 메뉴)
  const topFixedMenus = useMemo(() => {
    return visibleTabs.filter(tab => {
      // 명시적으로 top으로 설정된 메뉴
      if (tab.fixedPosition === 'top') return true
      // categoryId가 없고 fixedPosition이 없으면 기본적으로 상단에 표시 (기존 호환성)
      // 단, guide는 하단에 표시하기 위해 제외
      if (!tab.categoryId && !tab.fixedPosition && tab.id !== 'guide') return true
      return false
    })
  }, [visibleTabs])

  // 하단 고정 메뉴 (fixedPosition === 'bottom')
  const bottomFixedMenus = useMemo(() => {
    return visibleTabs.filter(tab => {
      // 명시적으로 bottom으로 설정된 메뉴
      if (tab.fixedPosition === 'bottom') return true
      // guide는 기본적으로 하단에 표시 (기존 호환성)
      if (!tab.categoryId && !tab.fixedPosition && tab.id === 'guide') return true
      return false
    })
  }, [visibleTabs])

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
    return localCategorySettings
      .filter(cat => cat.visible)
      .filter(cat => getVisibleTabsForCategory(cat.id).length > 0)
      .sort((a, b) => a.order - b.order)
  }, [localCategorySettings, visibleTabs])

  useEffect(() => {
    if (skipAutoRedirect) return
    if (visibleTabs.length > 0 && !visibleTabs.find(tab => tab.id === activeTab)) {
      onTabChange(visibleTabs[0].id)
    }
  }, [activeTab, visibleTabs, onTabChange, skipAutoRedirect])

  const handleTabClick = (tabId: string) => {
    if (isEditMode) return // 편집 모드에서는 탭 이동 방지
    onTabChange(tabId)
    if (onItemClick) {
      onItemClick()
    }
  }

  const toggleCategory = (categoryId: string) => {
    if (isEditMode) return // 편집 모드에서는 카테고리 접기/펼치기 비활성화
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

  // 편집 모드 토글
  const toggleEditMode = () => {
    if (isEditMode) {
      // 편집 모드 종료 - 로컬 상태를 현재 menuSettings로 리셋
      setLocalMenuSettings(menuSettings)
      setLocalCategorySettings(categorySettings)
    }
    setIsEditMode(prev => !prev)
  }

  // 저장 함수
  const saveSettings = useCallback(async (
    updatedMenuSettings: MenuItemSetting[],
    updatedCategorySettings: MenuCategorySetting[]
  ) => {
    if (!user?.id) return
    await saveUserMenuSettings(user.id, updatedMenuSettings, updatedCategorySettings)
  }, [user?.id])

  // DnD 핸들러
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) return

    const activeIdStr = active.id as string
    const overIdStr = over.id as string

    // 카테고리 순서 변경
    if (activeIdStr.startsWith('cat-') && overIdStr.startsWith('cat-')) {
      const activeCatId = activeIdStr.replace('cat-', '')
      const overCatId = overIdStr.replace('cat-', '')

      const activeIdx = visibleCategories.findIndex(c => c.id === activeCatId)
      const overIdx = visibleCategories.findIndex(c => c.id === overCatId)

      if (activeIdx !== -1 && overIdx !== -1 && activeIdx !== overIdx) {
        // visibleCategories 기준으로 순서 변경 후 전체 카테고리 설정에 반영
        const reorderedVisible = arrayMove(visibleCategories, activeIdx, overIdx)

        setLocalCategorySettings(prev => {
          const updated = prev.map(cat => {
            const visibleIdx = reorderedVisible.findIndex(vc => vc.id === cat.id)
            if (visibleIdx !== -1) {
              return { ...cat, order: visibleIdx }
            }
            return cat
          })
          const sorted = [...updated].sort((a, b) => a.order - b.order)

          // 저장
          saveSettings(localMenuSettings, sorted)

          return sorted
        })
      }
      return
    }

    // 같은 카테고리 내 메뉴 아이템 순서 변경
    if (activeIdStr.startsWith('item-') && overIdStr.startsWith('item-')) {
      const activeMenuId = activeIdStr.replace('item-', '')
      const overMenuId = overIdStr.replace('item-', '')

      const activeItem = localMenuSettings.find(m => m.id === activeMenuId)
      const overItem = localMenuSettings.find(m => m.id === overMenuId)

      // 같은 카테고리 내에서만 이동 허용
      if (activeItem && overItem && activeItem.categoryId && activeItem.categoryId === overItem.categoryId) {
        const categoryMenus = visibleTabs
          .filter(t => t.categoryId === activeItem.categoryId)
          .sort((a, b) => {
            const aMenu = localMenuSettings.find(m => m.id === a.id)
            const bMenu = localMenuSettings.find(m => m.id === b.id)
            return (aMenu?.order ?? 0) - (bMenu?.order ?? 0)
          })

        const activeIdx = categoryMenus.findIndex(m => m.id === activeMenuId)
        const overIdx = categoryMenus.findIndex(m => m.id === overMenuId)

        if (activeIdx !== -1 && overIdx !== -1 && activeIdx !== overIdx) {
          const reordered = arrayMove(categoryMenus, activeIdx, overIdx)

          setLocalMenuSettings(prev => {
            const updated = prev.map(m => {
              if (m.categoryId === activeItem.categoryId) {
                const newIdx = reordered.findIndex(r => r.id === m.id)
                if (newIdx !== -1) {
                  return { ...m, order: newIdx }
                }
              }
              return m
            })

            // 저장
            saveSettings(updated, localCategorySettings)

            return updated
          })
        }
      }
      return
    }
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

  // 드래그 오버레이용 아이템 찾기
  const getActiveOverlayContent = () => {
    if (!activeId) return null

    if (activeId.startsWith('cat-')) {
      const catId = activeId.replace('cat-', '')
      const category = visibleCategories.find(c => c.id === catId)
      if (!category) return null
      const CategoryIcon = categoryIconMap[category.icon] || Briefcase
      return (
        <div className="flex items-center space-x-2.5 py-2.5 px-3 rounded-lg bg-white shadow-lg border border-blue-200 text-sm font-semibold text-slate-700">
          <GripVertical className="w-4 h-4 text-blue-400" />
          <CategoryIcon className="w-5 h-5" />
          <span>{category.label}</span>
        </div>
      )
    }

    if (activeId.startsWith('item-')) {
      const menuId = activeId.replace('item-', '')
      const tab = visibleTabs.find(t => t.id === menuId)
      if (!tab) return null
      const Icon = tab.icon
      return (
        <div className="flex items-center space-x-2.5 py-1.5 px-3 rounded-lg bg-white shadow-lg border border-blue-200 text-[13px] font-medium text-slate-600 ml-3">
          <GripVertical className="w-3.5 h-3.5 text-blue-400" />
          <Icon className="w-4 h-4 text-slate-400" />
          <span>{tab.label}</span>
        </div>
      )
    }

    return null
  }

  // 카테고리 DnD IDs
  const categoryDndIds = visibleCategories.map(c => `cat-${c.id}`)

  // nav 내용 렌더링
  const renderContent = () => (
    <>
      {/* 편집 모드 토글 버튼 */}
      <div className="flex items-center justify-end px-1 pb-2">
        <button
          onClick={toggleEditMode}
          className={`
            flex items-center space-x-1.5 py-1 px-2.5 rounded-lg text-xs font-medium transition-all duration-200
            ${isEditMode
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
            }
          `}
        >
          {isEditMode ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>완료</span>
            </>
          ) : (
            <>
              <Pencil className="w-3.5 h-3.5" />
              <span>메뉴 편집</span>
            </>
          )}
        </button>
      </div>

      {/* 상단 영역: 상단 고정 메뉴들 */}
      <div className="flex-1 space-y-1">
        {/* 상단 고정 메뉴들 (드래그 불가) */}
        {topFixedMenus.map(tab => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`
                group flex items-center space-x-3 py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 w-full
                ${isActive
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                }
                ${isEditMode ? 'opacity-60 cursor-default' : ''}
              `}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
              <span className="truncate">{tab.label}</span>
            </button>
          )
        })}

        {/* 구분선 (상단 고정 메뉴가 있고 카테고리가 있을 때만) */}
        {topFixedMenus.length > 0 && visibleCategories.length > 0 && (
          <div className="pt-2 pb-1">
            <div className="h-px bg-slate-200" />
          </div>
        )}

        {/* 카테고리들 */}
        {isEditMode ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={categoryDndIds} strategy={verticalListSortingStrategy}>
              {visibleCategories.map(category => {
                const categoryTabs = getVisibleTabsForCategory(category.id)
                if (categoryTabs.length === 0) return null

                const hasActive = categoryHasActiveTab(category.id)
                const CategoryIcon = categoryIconMap[category.icon] || Briefcase
                const itemDndIds = categoryTabs.map(t => `item-${t.id}`)

                return (
                  <SortableCategory key={category.id} id={`cat-${category.id}`}>
                    {(listeners, isDragging) => (
                      <div className={`space-y-0.5 ${isDragging ? 'ring-2 ring-blue-300 rounded-lg' : ''}`}>
                        {/* 카테고리 헤더 (편집 모드) */}
                        <div
                          className={`
                            group flex items-center justify-between w-full py-2.5 px-3 rounded-lg text-sm font-semibold transition-all duration-200
                            ${hasActive
                              ? 'text-blue-600 bg-blue-50'
                              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'
                            }
                            border border-dashed border-blue-200
                          `}
                        >
                          <div className="flex items-center space-x-2.5">
                            <span
                              {...listeners}
                              className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded hover:bg-blue-100 transition-colors"
                            >
                              <GripVertical className="w-4 h-4 text-blue-400" />
                            </span>
                            <CategoryIcon className="w-5 h-5" />
                            <span>{category.label}</span>
                          </div>
                          <ChevronDown className="w-4 h-4 rotate-180" />
                        </div>

                        {/* 카테고리 아이템들 (편집 모드에서 항상 펼침) */}
                        <div className="max-h-96 opacity-100">
                          <div className="pl-3 space-y-0.5 pt-0.5">
                            <SortableContext items={itemDndIds} strategy={verticalListSortingStrategy}>
                              {categoryTabs.map(tab => {
                                const isActive = activeTab === tab.id
                                const Icon = tab.icon

                                return (
                                  <SortableMenuItem key={tab.id} id={`item-${tab.id}`}>
                                    {(itemListeners, itemIsDragging) => (
                                      <div
                                        className={`
                                          group flex items-center space-x-2.5 py-1.5 px-3 rounded-lg text-[13px] font-medium transition-all duration-200 w-full
                                          ${isActive
                                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/20'
                                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                          }
                                          ${itemIsDragging ? 'ring-2 ring-blue-300' : ''}
                                          border border-dashed border-transparent hover:border-blue-200 cursor-default
                                        `}
                                      >
                                        <span
                                          {...itemListeners}
                                          className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded hover:bg-blue-100/50 transition-colors"
                                        >
                                          <GripVertical className={`w-3.5 h-3.5 ${isActive ? 'text-white/70' : 'text-blue-400'}`} />
                                        </span>
                                        <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-500'}`} />
                                        <span className="truncate">{tab.label}</span>
                                      </div>
                                    )}
                                  </SortableMenuItem>
                                )
                              })}
                            </SortableContext>
                          </div>
                        </div>
                      </div>
                    )}
                  </SortableCategory>
                )
              })}
            </SortableContext>

            {/* 드래그 오버레이 */}
            <DragOverlay dropAnimation={null}>
              {getActiveOverlayContent()}
            </DragOverlay>
          </DndContext>
        ) : (
          /* 일반 모드: 기존 렌더링 유지 */
          visibleCategories.map(category => {
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
                    group flex items-center justify-between w-full py-2.5 px-3 rounded-lg text-sm font-semibold transition-all duration-200
                    ${hasActive && !isExpanded
                      ? 'text-blue-600 bg-blue-50'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'
                    }
                  `}
                >
                  <div className="flex items-center space-x-2.5">
                    <CategoryIcon className="w-5 h-5" />
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
                  <div className="pl-3 space-y-0.5 pt-0.5">
                    {categoryTabs.map(tab => {
                      const isActive = activeTab === tab.id
                      const Icon = tab.icon

                      return (
                        <button
                          key={tab.id}
                          onClick={() => handleTabClick(tab.id)}
                          className={`
                            group flex items-center space-x-2.5 py-1.5 px-3 rounded-lg text-[13px] font-medium transition-all duration-200 w-full
                            ${isActive
                              ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/20'
                              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                            }
                          `}
                        >
                          <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-500'}`} />
                          <span className="truncate">{tab.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 하단 영역: 하단 고정 메뉴들 (드래그 불가) */}
      {bottomFixedMenus.length > 0 && (
        <div className="pt-2 border-t border-slate-200 mt-2 space-y-1">
          {bottomFixedMenus.map(tab => {
            const isActive = activeTab === tab.id
            const Icon = tab.icon

            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`
                  group flex items-center space-x-3 py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 w-full
                  ${isActive
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }
                  ${isEditMode ? 'opacity-60 cursor-default' : ''}
                `}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
                <span className="truncate">{tab.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )

  return (
    <nav className="flex flex-col h-full w-full">
      {renderContent()}
    </nav>
  )
}
