'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
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
import { createNewCategory } from '@/types/menuSettings'
import { MENU_CONFIG, MENU_ICON_MAP, MENU_PERMISSIONS_MAP, MENU_OWNER_ONLY_MAP, MENU_PREMIUM_MAP } from '@/config/menuConfig'
import { usePremiumFeatures } from '@/hooks/usePremiumFeatures'
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
  Check,
  Plus,
  Trash2,
  X,
  Lock,
  Download
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
  isPremiumLocked?: boolean
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

// 카테고리 아이콘 선택 목록
const CATEGORY_ICON_OPTIONS = [
  'Briefcase', 'MessageSquare', 'FolderOpen', 'Settings', 'Users',
  'Calendar', 'Heart', 'Star', 'Bell', 'Bookmark',
  'Box', 'Coffee', 'Flag', 'Gift', 'Globe',
  'Layers', 'Layout', 'List', 'Package', 'Shield',
  'Target', 'Zap', 'ClipboardList', 'FileText', 'Monitor'
]

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
    opacity: isDragging ? 0 : 1,
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
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children(listeners as Record<string, unknown>, isDragging)}
    </div>
  )
}

// 드롭 가능 영역 (카테고리 밖으로 이동할 때)
function DroppableZone({ id, children, isEditMode }: { id: string; children: React.ReactNode; isEditMode: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id })

  if (!isEditMode) return <>{children}</>

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg transition-all duration-200 ${isOver ? 'bg-blue-50/60 ring-1 ring-dashed ring-blue-300 py-1' : ''}`}
    >
      {children}
    </div>
  )
}

export default function TabNavigation({ activeTab, onTabChange, onItemClick, skipAutoRedirect = false }: TabNavigationProps) {
  const { hasPermission } = usePermissions()
  const { menuSettings, categorySettings, isLoading } = useMenuSettings()
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'
  const { hasPremiumFeature } = usePremiumFeatures()

  // 편집 모드 상태
  const [isEditMode, setIsEditMode] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  // 카테고리 추가/수정 상태
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingCategoryIcon, setEditingCategoryIcon] = useState('')
  const [showIconPicker, setShowIconPicker] = useState<string | null>(null)
  const newCategoryInputRef = useRef<HTMLInputElement>(null)
  const editCategoryInputRef = useRef<HTMLInputElement>(null)

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

  // 카테고리 추가 input에 포커스
  useEffect(() => {
    if (isAddingCategory && newCategoryInputRef.current) {
      newCategoryInputRef.current.focus()
    }
  }, [isAddingCategory])

  // 카테고리 수정 input에 포커스
  useEffect(() => {
    if (editingCategoryId && editCategoryInputRef.current) {
      editCategoryInputRef.current.focus()
    }
  }, [editingCategoryId])

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
        fixedPosition: menu.fixedPosition,
        isPremiumLocked: MENU_PREMIUM_MAP[menu.id] && !hasPremiumFeature(menu.id),
      }))
  }, [localMenuSettings, hasPremiumFeature])

  // 권한에 따른 보이는 탭 필터링
  // owner가 아닌 사용자: ownerOnly 메뉴 숨김
  // owner: 프리미엄 잠금 상태여도 보임 (회색 표시)
  const visibleTabs = useMemo(() =>
    tabs.filter(tab => {
      if (MENU_OWNER_ONLY_MAP[tab.id] && !isOwner) {
        return false
      }
      if (!tab.requiredPermissions || tab.requiredPermissions.length === 0) {
        return true
      }
      return tab.requiredPermissions.some(perm => hasPermission(perm))
    }), [tabs, hasPermission, isOwner])

  // 기본 상단 메뉴 ID 목록 (원래 설정에서 카테고리 없이 상단에 고정된 메뉴 - 정적)
  const defaultTopMenuIds = useMemo(() => {
    return new Set(
      MENU_CONFIG
        .filter(item => !item.categoryId && !item.fixedPosition && item.id !== 'guide')
        .map(item => item.id)
    )
  }, [])

  // 상단 고정 메뉴 (fixedPosition === 'top' 또는 원래 상단 메뉴)
  const topFixedMenus = useMemo(() => {
    return visibleTabs.filter(tab => {
      if (tab.fixedPosition === 'top') return true
      if (defaultTopMenuIds.has(tab.id) && !tab.categoryId) return true
      return false
    })
  }, [visibleTabs, defaultTopMenuIds])

  // 미분류 메뉴 (편집 모드에서 카테고리에서 빠진 아이템만 - 원래 상단 메뉴 제외)
  const uncategorizedMenus = useMemo(() => {
    return visibleTabs.filter(tab => {
      if (tab.fixedPosition) return false
      if (tab.categoryId) return false
      if (tab.id === 'guide') return false
      if (defaultTopMenuIds.has(tab.id)) return false
      return true
    })
  }, [visibleTabs, defaultTopMenuIds])

  // 하단 고정 메뉴 (fixedPosition === 'bottom')
  const bottomFixedMenus = useMemo(() => {
    return visibleTabs.filter(tab => {
      if (tab.fixedPosition === 'bottom') return true
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

  // 보이는 카테고리 필터링
  const visibleCategories = useMemo(() => {
    return localCategorySettings
      .filter(cat => cat.visible)
      .sort((a, b) => a.order - b.order)
  }, [localCategorySettings])

  useEffect(() => {
    if (skipAutoRedirect) return
    if (visibleTabs.length > 0 && !visibleTabs.find(tab => tab.id === activeTab)) {
      onTabChange(visibleTabs[0].id)
    }
  }, [activeTab, visibleTabs, onTabChange, skipAutoRedirect])

  const handleTabClick = (tabId: string, isPremiumLocked?: boolean) => {
    if (isEditMode) return
    if (isPremiumLocked) {
      alert('프리미엄 기능입니다. 이용을 원하시면 관리자에게 문의해주세요.')
      return
    }
    onTabChange(tabId)
    if (onItemClick) {
      onItemClick()
    }
  }

  const [isDownloadingWorker, setIsDownloadingWorker] = useState(false)

  const handleWorkerDownload = async () => {
    if (isDownloadingWorker) return
    setIsDownloadingWorker(true)
    try {
      const isMac = navigator.userAgent.toLowerCase().includes('mac')
      const os = isMac ? 'mac' : 'windows'
      const res = await fetch(`/api/marketing/worker-api/download?os=${os}`)
      if (!res.ok) throw new Error('다운로드 실패')
      const contentDisposition = res.headers.get('Content-Disposition')
      if (contentDisposition) {
        // shell script 직접 다운로드
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const filename = isMac ? 'marketing-worker-setup.command' : 'marketing-worker-setup.sh'
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      } else {
        // JSON 응답 (GitHub Release URL)
        const data = await res.json()
        if (data.downloadUrl) {
          window.open(data.downloadUrl, '_blank')
        }
      }
    } catch {
      alert('워커 다운로드에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setIsDownloadingWorker(false)
    }
  }

  const toggleCategory = (categoryId: string) => {
    if (isEditMode) return
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
      setLocalMenuSettings(menuSettings)
      setLocalCategorySettings(categorySettings)
      setIsAddingCategory(false)
      setEditingCategoryId(null)
      setShowIconPicker(null)
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

  // --- 카테고리 관리 ---

  // 카테고리 추가
  const handleAddCategory = () => {
    const name = newCategoryName.trim()
    if (!name) return

    const maxOrder = localCategorySettings.length > 0
      ? Math.max(...localCategorySettings.map(c => c.order)) + 1
      : 0
    const newCat = createNewCategory(name, maxOrder)

    const updatedCategories = [...localCategorySettings, newCat]
    setLocalCategorySettings(updatedCategories)
    setNewCategoryName('')
    setIsAddingCategory(false)
    setExpandedCategories(prev => new Set([...prev, newCat.id]))
    saveSettings(localMenuSettings, updatedCategories)
  }

  // 카테고리 수정 시작
  const startEditCategory = (cat: MenuCategorySetting) => {
    setEditingCategoryId(cat.id)
    setEditingCategoryName(cat.label)
    setEditingCategoryIcon(cat.icon)
    setShowIconPicker(null)
  }

  // 카테고리 수정 저장
  const handleSaveCategory = () => {
    if (!editingCategoryId) return
    const name = editingCategoryName.trim()
    if (!name) return

    const updatedCategories = localCategorySettings.map(cat =>
      cat.id === editingCategoryId
        ? { ...cat, label: name, icon: editingCategoryIcon }
        : cat
    )
    setLocalCategorySettings(updatedCategories)
    setEditingCategoryId(null)
    setShowIconPicker(null)
    saveSettings(localMenuSettings, updatedCategories)
  }

  // 카테고리 삭제
  const handleDeleteCategory = (categoryId: string) => {
    // 해당 카테고리의 메뉴들을 미분류로 이동
    const updatedMenus = localMenuSettings.map(m =>
      m.categoryId === categoryId ? { ...m, categoryId: undefined } : m
    )
    const updatedCategories = localCategorySettings.filter(c => c.id !== categoryId)

    setLocalMenuSettings(updatedMenus)
    setLocalCategorySettings(updatedCategories)
    saveSettings(updatedMenus, updatedCategories)
  }

  // 카테고리 아이콘 변경
  const handleChangeIcon = (categoryId: string, iconName: string) => {
    if (editingCategoryId === categoryId) {
      setEditingCategoryIcon(iconName)
    }
    setShowIconPicker(null)
  }

  // --- DnD 핸들러 ---

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  // 카테고리 간 이동 처리 (드래그 중 실시간)
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeIdStr = active.id as string
    const overIdStr = over.id as string

    // 아이템 이동만 처리 (카테고리 이동은 handleDragEnd에서)
    if (!activeIdStr.startsWith('item-')) return

    const activeMenuId = activeIdStr.replace('item-', '')
    const activeItem = localMenuSettings.find(m => m.id === activeMenuId)
    if (!activeItem) return

    let targetCategoryId: string | undefined

    if (overIdStr === 'drop-uncategorized') {
      targetCategoryId = undefined
    } else if (overIdStr.startsWith('item-')) {
      const overMenuId = overIdStr.replace('item-', '')
      const overItem = localMenuSettings.find(m => m.id === overMenuId)
      if (!overItem) return
      targetCategoryId = overItem.categoryId
    } else if (overIdStr.startsWith('cat-')) {
      targetCategoryId = overIdStr.replace('cat-', '')
    } else {
      return
    }

    // 카테고리가 변경되었을 때만 업데이트
    if (activeItem.categoryId !== targetCategoryId) {
      setLocalMenuSettings(prev => {
        const targetItems = prev.filter(m =>
          m.categoryId === targetCategoryId && m.visible && m.id !== activeMenuId
        )
        const maxOrder = targetItems.length > 0
          ? Math.max(...targetItems.map(m => m.order)) + 1
          : 0

        return prev.map(m => {
          if (m.id === activeMenuId) {
            return { ...m, categoryId: targetCategoryId, order: maxOrder }
          }
          return m
        })
      })
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeIdStr = active.id as string
    const overIdStr = over.id as string

    // 같은 위치 → onDragOver에서 카테고리 이동이 발생했을 수 있으므로 저장
    if (active.id === over.id) {
      saveSettings(localMenuSettings, localCategorySettings)
      return
    }

    // 카테고리 순서 변경
    if (activeIdStr.startsWith('cat-') && overIdStr.startsWith('cat-')) {
      const activeCatId = activeIdStr.replace('cat-', '')
      const overCatId = overIdStr.replace('cat-', '')

      const activeIdx = visibleCategories.findIndex(c => c.id === activeCatId)
      const overIdx = visibleCategories.findIndex(c => c.id === overCatId)

      if (activeIdx !== -1 && overIdx !== -1 && activeIdx !== overIdx) {
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
          saveSettings(localMenuSettings, sorted)
          return sorted
        })
      }
      return
    }

    // 아이템 순서 변경 (같은 카테고리 내 또는 크로스 카테고리 후 최종 위치)
    if (activeIdStr.startsWith('item-') && overIdStr.startsWith('item-')) {
      const activeMenuId = activeIdStr.replace('item-', '')
      const overMenuId = overIdStr.replace('item-', '')

      const activeItem = localMenuSettings.find(m => m.id === activeMenuId)
      const overItem = localMenuSettings.find(m => m.id === overMenuId)

      if (activeItem && overItem && activeItem.categoryId === overItem.categoryId) {
        const targetCategoryId = overItem.categoryId

        const categoryMenus = visibleTabs
          .filter(t => t.categoryId === targetCategoryId)
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
              const reorderIdx = reordered.findIndex(r => r.id === m.id)
              if (reorderIdx !== -1 && m.categoryId === targetCategoryId) {
                return { ...m, order: reorderIdx }
              }
              return m
            })
            saveSettings(updated, localCategorySettings)
            return updated
          })
          return
        }
      }

      // 크로스 카테고리 이동 후 같은 아이템 위에 드롭 → 저장만
      saveSettings(localMenuSettings, localCategorySettings)
      return
    }

    // 아이템이 카테고리 헤더나 미분류 영역에 드롭
    if (activeIdStr.startsWith('item-')) {
      saveSettings(localMenuSettings, localCategorySettings)
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
        <div className="flex items-center space-x-2.5 py-2.5 px-3 rounded-lg bg-white shadow-lg border border-blue-200 text-sm font-semibold text-slate-700 w-52">
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
        <div className="flex items-center space-x-2.5 py-1.5 px-3 rounded-lg bg-white shadow-lg border border-blue-200 text-[13px] font-medium text-slate-600 w-48">
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

  // 미분류 아이템 DnD IDs
  const uncategorizedDndIds = uncategorizedMenus.map(t => `item-${t.id}`)

  // 메뉴 아이템 렌더 (편집 모드)
  const renderEditMenuItem = (tab: Tab) => {
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
  }

  // 아이콘 선택기 렌더
  const renderIconPicker = (categoryId: string) => {
    if (showIconPicker !== categoryId) return null
    return (
      <div className="absolute top-full left-0 mt-1 p-2 bg-white rounded-lg shadow-lg border border-slate-200 z-50 grid grid-cols-5 gap-1 w-48">
        {CATEGORY_ICON_OPTIONS.map(iconName => {
          const IconComp = iconNameToComponent[iconName] || HelpCircle
          return (
            <button
              key={iconName}
              onClick={(e) => { e.stopPropagation(); handleChangeIcon(categoryId, iconName) }}
              className="p-1.5 rounded hover:bg-blue-50 transition-colors flex items-center justify-center"
              title={iconName}
            >
              <IconComp className="w-4 h-4 text-slate-600" />
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <nav className="flex flex-col h-full w-full">
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

      {/* 상단 영역 */}
      <div className="flex-1 space-y-1">
        {isEditMode ? (
          // === 편집 모드 ===
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {/* 상단 고정 메뉴 (드래그 불가) */}
            {topFixedMenus.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  className="group flex items-center space-x-3 py-2.5 px-3 rounded-xl text-sm font-medium w-full opacity-60 cursor-default text-slate-600"
                  disabled
                >
                  <Icon className="w-5 h-5 flex-shrink-0 text-slate-400" />
                  <span className="truncate">{tab.label}</span>
                </button>
              )
            })}

            {/* 구분선 */}
            {topFixedMenus.length > 0 && (
              <div className="pt-2 pb-1">
                <div className="h-px bg-slate-200" />
              </div>
            )}

            {/* 미분류 영역 (카테고리 밖 아이템 드롭 존) */}
            <DroppableZone id="drop-uncategorized" isEditMode={true}>
              {uncategorizedMenus.length > 0 && (
                <div className="space-y-0.5 pb-2">
                  <div className="text-[11px] text-slate-400 font-medium px-3 py-1">미분류</div>
                  <SortableContext items={uncategorizedDndIds} strategy={verticalListSortingStrategy}>
                    <div className="pl-3 space-y-0.5">
                      {uncategorizedMenus.map(tab => renderEditMenuItem(tab))}
                    </div>
                  </SortableContext>
                </div>
              )}
              {uncategorizedMenus.length === 0 && (
                <div className="text-[11px] text-slate-300 text-center py-2 border border-dashed border-slate-200 rounded-lg mb-2">
                  여기에 드롭하면 미분류로 이동
                </div>
              )}
            </DroppableZone>

            {/* 카테고리들 */}
            <SortableContext items={categoryDndIds} strategy={verticalListSortingStrategy}>
              {visibleCategories.map(category => {
                const categoryTabs = getVisibleTabsForCategory(category.id)
                const hasActive = categoryHasActiveTab(category.id)
                const CategoryIcon = categoryIconMap[category.icon] || Briefcase
                const itemDndIds = categoryTabs.map(t => `item-${t.id}`)
                const isEditing = editingCategoryId === category.id

                return (
                  <SortableCategory key={category.id} id={`cat-${category.id}`}>
                    {(listeners, isDragging) => (
                      <div className={`space-y-0.5 ${isDragging ? 'ring-2 ring-blue-300 rounded-lg' : ''}`}>
                        {/* 카테고리 헤더 */}
                        {isEditing ? (
                          // 수정 모드
                          <div className="flex items-center space-x-1.5 py-1.5 px-2 rounded-lg bg-blue-50 border border-blue-200">
                            <div className="relative">
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowIconPicker(showIconPicker === category.id ? null : category.id) }}
                                className="p-1 rounded hover:bg-blue-100 transition-colors"
                              >
                                {(() => { const IC = categoryIconMap[editingCategoryIcon] || Briefcase; return <IC className="w-4 h-4 text-blue-500" /> })()}
                              </button>
                              {renderIconPicker(category.id)}
                            </div>
                            <input
                              ref={editCategoryInputRef}
                              value={editingCategoryName}
                              onChange={e => setEditingCategoryName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveCategory(); if (e.key === 'Escape') { setEditingCategoryId(null); setShowIconPicker(null) } }}
                              className="flex-1 text-sm font-semibold bg-transparent border-none outline-none text-slate-700 min-w-0"
                            />
                            <button onClick={handleSaveCategory} className="p-1 rounded hover:bg-blue-100 transition-colors">
                              <Check className="w-3.5 h-3.5 text-blue-500" />
                            </button>
                            <button onClick={() => { setEditingCategoryId(null); setShowIconPicker(null) }} className="p-1 rounded hover:bg-slate-200 transition-colors">
                              <X className="w-3.5 h-3.5 text-slate-400" />
                            </button>
                          </div>
                        ) : (
                          // 일반 헤더
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
                            <div className="flex items-center space-x-0.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); startEditCategory(category) }}
                                className="p-1 rounded hover:bg-blue-100 opacity-0 group-hover:opacity-100 transition-all"
                                title="카테고리 수정"
                              >
                                <Pencil className="w-3 h-3 text-slate-400" />
                              </button>
                              {category.isCustom && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id) }}
                                  className="p-1 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-all"
                                  title="카테고리 삭제"
                                >
                                  <Trash2 className="w-3 h-3 text-red-400" />
                                </button>
                              )}
                              <ChevronDown className="w-4 h-4 rotate-180" />
                            </div>
                          </div>
                        )}

                        {/* 카테고리 아이템들 (편집 모드에서 항상 펼침) */}
                        <div className="max-h-[500px] opacity-100">
                          <div className="pl-3 space-y-0.5 pt-0.5">
                            <SortableContext items={itemDndIds} strategy={verticalListSortingStrategy}>
                              {categoryTabs.map(tab => renderEditMenuItem(tab))}
                            </SortableContext>
                            {categoryTabs.length === 0 && (
                              <div className="text-[11px] text-slate-300 text-center py-2 border border-dashed border-slate-200 rounded-lg">
                                메뉴를 여기에 드롭
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </SortableCategory>
                )
              })}
            </SortableContext>

            {/* 카테고리 추가 */}
            {isAddingCategory ? (
              <div className="flex items-center space-x-1.5 py-1.5 px-3 mt-1 rounded-lg bg-slate-50 border border-dashed border-slate-300">
                <Plus className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <input
                  ref={newCategoryInputRef}
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setIsAddingCategory(false); setNewCategoryName('') } }}
                  placeholder="카테고리 이름"
                  className="flex-1 text-sm bg-transparent border-none outline-none text-slate-700 placeholder-slate-300 min-w-0"
                />
                <button onClick={handleAddCategory} className="p-1 rounded hover:bg-slate-200 transition-colors">
                  <Check className="w-3.5 h-3.5 text-blue-500" />
                </button>
                <button onClick={() => { setIsAddingCategory(false); setNewCategoryName('') }} className="p-1 rounded hover:bg-slate-200 transition-colors">
                  <X className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingCategory(true)}
                className="flex items-center space-x-2 py-2 px-3 mt-1 rounded-lg text-xs font-medium text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-all w-full"
              >
                <Plus className="w-4 h-4" />
                <span>카테고리 추가</span>
              </button>
            )}

            {/* 드래그 오버레이 */}
            <DragOverlay>
              {getActiveOverlayContent()}
            </DragOverlay>
          </DndContext>
        ) : (
          // === 일반 모드 ===
          <>
            {/* 상단 고정 메뉴들 */}
            {topFixedMenus.map(tab => {
              const isActive = activeTab === tab.id
              const Icon = tab.icon

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id, tab.isPremiumLocked)}
                  className={`
                    group flex items-center space-x-3 py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 w-full
                    ${tab.isPremiumLocked
                      ? 'text-slate-300 cursor-not-allowed opacity-50'
                      : isActive
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${tab.isPremiumLocked ? 'text-slate-300' : isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
                  <span className="truncate">{tab.label}</span>
                  {tab.isPremiumLocked && <Lock className="w-3.5 h-3.5 ml-auto text-slate-300 flex-shrink-0" />}
                </button>
              )
            })}

            {/* 미분류 메뉴 (있을 때만) */}
            {uncategorizedMenus.map(tab => {
              const isActive = activeTab === tab.id
              const Icon = tab.icon

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id, tab.isPremiumLocked)}
                  className={`
                    group flex items-center space-x-3 py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 w-full
                    ${tab.isPremiumLocked
                      ? 'text-slate-300 cursor-not-allowed opacity-50'
                      : isActive
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${tab.isPremiumLocked ? 'text-slate-300' : isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
                  <span className="truncate">{tab.label}</span>
                  {tab.isPremiumLocked && <Lock className="w-3.5 h-3.5 ml-auto text-slate-300 flex-shrink-0" />}
                </button>
              )
            })}

            {/* 구분선 */}
            {(topFixedMenus.length > 0 || uncategorizedMenus.length > 0) && visibleCategories.length > 0 && (
              <div className="pt-2 pb-1">
                <div className="h-px bg-slate-200" />
              </div>
            )}

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
                            onClick={() => handleTabClick(tab.id, tab.isPremiumLocked)}
                            className={`
                              group flex items-center space-x-2.5 py-1.5 px-3 rounded-lg text-[13px] font-medium transition-all duration-200 w-full
                              ${tab.isPremiumLocked
                                ? 'text-slate-300 cursor-not-allowed opacity-50'
                                : isActive
                                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/20'
                                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                              }
                            `}
                          >
                            <Icon className={`w-4 h-4 flex-shrink-0 ${tab.isPremiumLocked ? 'text-slate-300' : isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-500'}`} />
                            <span className="truncate">{tab.label}</span>
                            {tab.isPremiumLocked && <Lock className="w-3 h-3 ml-auto text-slate-300 flex-shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* 하단 영역: 워커 다운로드 + 하단 고정 메뉴들 */}
      <div className="pt-2 border-t border-slate-200 mt-2 space-y-1">
        {/* 워커 다운로드 버튼 */}
        <button
          onClick={handleWorkerDownload}
          disabled={isDownloadingWorker}
          className="group flex items-center space-x-3 py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 w-full text-slate-500 hover:bg-green-50 hover:text-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className={`w-5 h-5 flex-shrink-0 text-slate-400 group-hover:text-green-600 ${isDownloadingWorker ? 'animate-bounce' : ''}`} />
          <span className="truncate">{isDownloadingWorker ? '다운로드 중...' : '워커 다운로드'}</span>
        </button>
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
    </nav>
  )
}
