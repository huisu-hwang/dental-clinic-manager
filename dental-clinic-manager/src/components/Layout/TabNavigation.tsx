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
import WorkerStatusMenuItem from '@/components/Layout/WorkerStatusMenuItem'
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
  Download,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react'

interface TabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  onItemClick?: () => void
  skipAutoRedirect?: boolean
  isCollapsed?: boolean
  onToggleCollapse?: () => void
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

// 즉시 표시 fixed 툴팁 (overflow clip 우회, 딜레이 없음)
// direction: 'right' = 우측 표시 (collapsed 메뉴), 'bottom' = 하방 표시 (상단 버튼)
function Tooltip({ label, children, direction = 'right', wrapperClassName = "relative w-full" }: { label: string; children: React.ReactNode; direction?: 'right' | 'bottom'; wrapperClassName?: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      className={wrapperClassName}
      onMouseEnter={() => {
        // 첫 번째 자식 요소(실제 버튼/아이콘) 기준으로 위치 계산
        const el = ref.current?.firstElementChild as HTMLElement | null
        const rect = el ? el.getBoundingClientRect() : ref.current?.getBoundingClientRect()
        if (!rect) return
        if (direction === 'bottom') {
          setPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 }) // 여백 증가
        } else {
          setPos({ x: rect.right + 12, y: rect.top + rect.height / 2 }) // 여백 증가
        }
      }}
      onMouseLeave={() => setPos(null)}
    >
      <style>{`
        @keyframes tooltip-slide-down {
          from { opacity: 0; transform: translate(-50%, -6px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes tooltip-slide-right {
          from { opacity: 0; transform: translate(-6px, -50%); }
          to { opacity: 1; transform: translate(0, -50%); }
        }
        .animate-tooltip-slide-down { animation: tooltip-slide-down 0.2s ease-out forwards; }
        .animate-tooltip-slide-right { animation: tooltip-slide-right 0.2s ease-out forwards; }
      `}</style>
      {children}
      {pos && direction === 'bottom' && (
        <div
          className="fixed z-[9999] bg-slate-800 text-white text-xs font-medium rounded-md px-2 py-1.5 whitespace-nowrap shadow-xl pointer-events-none animate-tooltip-slide-down"
          style={{ left: pos.x, top: pos.y }}
        >
          {label}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-[4px] border-transparent border-b-slate-800" />
        </div>
      )}
      {pos && direction === 'right' && (
        <div
          className="fixed z-[9999] bg-slate-800 text-white text-xs font-medium rounded-md px-2 py-1.5 whitespace-nowrap shadow-xl pointer-events-none animate-tooltip-slide-right"
          style={{ left: pos.x, top: pos.y }}
        >
          {label}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-[4px] border-transparent border-r-slate-800" />
        </div>
      )}
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
      className={`rounded-lg transition-all duration-200 ${isOver ? 'bg-at-accent-light/60 ring-1 ring-dashed ring-at-accent py-1' : ''}`}
    >
      {children}
    </div>
  )
}

export default function TabNavigation({ activeTab, onTabChange, onItemClick, skipAutoRedirect = false, isCollapsed = false, onToggleCollapse }: TabNavigationProps) {
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

  // 축소 시 편집 모드 자동 해제
  useEffect(() => {
    if (isCollapsed && isEditMode) {
      setIsEditMode(false)
    }
  }, [isCollapsed])

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
  const [showWorkerModal, setShowWorkerModal] = useState(false)
  const [workerInstallCommand, setWorkerInstallCommand] = useState('')
  const [copiedWorkerCmd, setCopiedWorkerCmd] = useState(false)

  const [workerVersionInfo, setWorkerVersionInfo] = useState<{
    currentVersion: string | null
    latestVersion: string | null
    latestReleaseDate: string | null
    online: boolean
  } | null>(null)

  useEffect(() => {
    const fetchWorkerVersion = async () => {
      try {
        const res = await fetch('/api/workers/status?type=marketing', {
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.marketing) {
            setWorkerVersionInfo({
              currentVersion: data.marketing.currentVersion,
              latestVersion: data.marketing.latestVersion,
              latestReleaseDate: data.marketing.latestReleaseDate,
              online: data.marketing.online,
            })
          }
        }
      } catch {
        // ignore
      }
    }
    fetchWorkerVersion()
    const interval = setInterval(fetchWorkerVersion, 60_000) // 1분마다 갱신
    return () => clearInterval(interval)
  }, [])

  const handleWorkerDownload = async () => {
    if (isDownloadingWorker) return
    setIsDownloadingWorker(true)
    try {
      const isMac = navigator.userAgent.toLowerCase().includes('mac')

      if (isMac) {
        // Mac: 스크립트 내용을 fetch 후 Terminal heredoc 명령어로 모달에 표시
        const res = await fetch('/api/marketing/worker-api/download?os=mac')
        if (!res.ok) throw new Error('다운로드 실패')
        const contentDisposition = res.headers.get('Content-Disposition')
        if (contentDisposition) {
          // shell script → heredoc 명령어 생성
          const scriptText = await res.text()
          const command = `bash << 'WORKER_INSTALL_EOF'\n${scriptText}\nWORKER_INSTALL_EOF`
          setWorkerInstallCommand(command)
          setShowWorkerModal(true)
        } else {
          // dmg URL
          const data = await res.json()
          if (data.downloadUrl) window.open(data.downloadUrl, '_blank')
        }
      } else {
        // Windows: 기존 .exe 다운로드
        const res = await fetch('/api/marketing/worker-api/download?os=windows')
        if (!res.ok) throw new Error('다운로드 실패')
        const data = await res.json()
        if (data.downloadUrl) window.open(data.downloadUrl, '_blank')
      }
    } catch {
      alert('워커 다운로드에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setIsDownloadingWorker(false)
    }
  }

  const handleCopyWorkerCmd = async () => {
    try {
      await navigator.clipboard.writeText(workerInstallCommand)
      setCopiedWorkerCmd(true)
      setTimeout(() => setCopiedWorkerCmd(false), 2000)
    } catch {
      // clipboard API 실패 시 fallback
      const el = document.createElement('textarea')
      el.value = workerInstallCommand
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopiedWorkerCmd(true)
      setTimeout(() => setCopiedWorkerCmd(false), 2000)
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
            className="flex items-center space-x-3 py-2.5 px-3 rounded-xl animate-pulse"
          >
            <div className="w-5 h-5 bg-at-surface-hover rounded" />
            <div className="h-4 bg-at-surface-hover rounded w-20" />
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
        <div className="flex items-center space-x-2.5 py-2.5 px-3 rounded-xl bg-at-surface shadow-at-card border border-at-border text-sm font-semibold text-at-text w-52">
          <GripVertical className="w-4 h-4 text-at-text-weak" />
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
        <div className="flex items-center space-x-2.5 py-1.5 px-3 rounded-xl bg-at-surface shadow-at-card border border-at-border text-[13px] font-medium text-at-text-secondary w-48">
          <GripVertical className="w-3.5 h-3.5 text-at-text-weak" />
          <Icon className="w-4 h-4 text-at-text-weak" />
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
                ? 'bg-at-accent-light text-at-accent'
                : 'text-at-text-secondary hover:bg-at-surface-hover hover:text-at-text'
              }
              ${itemIsDragging ? 'ring-2 ring-at-accent' : ''}
              border border-dashed border-transparent hover:border-at-border cursor-default
            `}
          >
            <span
              {...itemListeners}
              className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded hover:bg-at-accent-light transition-colors"
            >
              <GripVertical className={`w-3.5 h-3.5 ${isActive ? 'text-at-accent' : 'text-at-text-weak'}`} />
            </span>
            <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-at-accent' : 'text-at-text-weak group-hover:text-at-text-secondary'}`} />
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
      <div className="absolute top-full left-0 mt-1 p-2 bg-at-surface rounded-lg shadow-at-card border border-at-border z-50 grid grid-cols-5 gap-1 w-48">
        {CATEGORY_ICON_OPTIONS.map(iconName => {
          const IconComp = iconNameToComponent[iconName] || HelpCircle
          return (
            <button
              key={iconName}
              onClick={(e) => { e.stopPropagation(); handleChangeIcon(categoryId, iconName) }}
              className="p-1.5 rounded hover:bg-at-accent-light transition-colors flex items-center justify-center"
              title={iconName}
            >
              <IconComp className="w-4 h-4 text-at-text-secondary" />
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <nav className="flex flex-col h-full w-full">
      {/* 사이드바 최상단 헤더: 우측에 아이콘 버튼 배치 */}
      <div className="flex items-center justify-end px-2 pt-1 pb-2 border-b border-at-border mb-1 gap-0.5">
        {!isCollapsed && (
          <button
            onClick={toggleEditMode}
            className={`
              p-1 rounded-md transition-all duration-200 flex items-center justify-center
              ${isEditMode
                ? 'bg-at-accent text-white hover:bg-at-accent-hover'
                : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-hover'
              }
            `}
          >
            {isEditMode ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          </button>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-md text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-hover transition-all duration-200 flex items-center justify-center"
          >
            {isCollapsed ? <ChevronsRight className="w-3.5 h-3.5" /> : <ChevronsLeft className="w-3.5 h-3.5" />}
          </button>
        )}
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
                  className="group flex items-center space-x-3 py-2.5 px-3 rounded-xl text-sm font-medium w-full opacity-60 cursor-default text-at-text-secondary"
                  disabled
                >
                  <Icon className="w-5 h-5 flex-shrink-0 text-at-text-weak" />
                  <span className="truncate">{tab.label}</span>
                </button>
              )
            })}

            {/* 구분선 */}
            {topFixedMenus.length > 0 && (
              <div className="pt-2 pb-1">
                <div className="h-px bg-at-border" />
              </div>
            )}

            {/* 미분류 영역 (카테고리 밖 아이템 드롭 존) */}
            <DroppableZone id="drop-uncategorized" isEditMode={true}>
              {uncategorizedMenus.length > 0 && (
                <div className="space-y-0.5 pb-2">
                  <div className="text-[11px] text-at-text-weak font-medium px-3 py-1">미분류</div>
                  <SortableContext items={uncategorizedDndIds} strategy={verticalListSortingStrategy}>
                    <div className="pl-3 space-y-0.5">
                      {uncategorizedMenus.map(tab => renderEditMenuItem(tab))}
                    </div>
                  </SortableContext>
                </div>
              )}
              {uncategorizedMenus.length === 0 && (
                <div className="text-[11px] text-at-text-weak text-center py-2 border border-dashed border-at-border rounded-lg mb-2">
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
                          <div className="flex items-center space-x-1.5 py-1.5 px-2 rounded-lg bg-at-accent-light border border-at-border">
                            <div className="relative">
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowIconPicker(showIconPicker === category.id ? null : category.id) }}
                                className="p-1 rounded hover:bg-at-surface-hover transition-colors"
                              >
                                {(() => { const IC = categoryIconMap[editingCategoryIcon] || Briefcase; return <IC className="w-4 h-4 text-at-accent" /> })()}
                              </button>
                              {renderIconPicker(category.id)}
                            </div>
                            <input
                              ref={editCategoryInputRef}
                              value={editingCategoryName}
                              onChange={e => setEditingCategoryName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveCategory(); if (e.key === 'Escape') { setEditingCategoryId(null); setShowIconPicker(null) } }}
                              className="flex-1 text-sm font-semibold bg-transparent border-none outline-none text-at-text min-w-0"
                            />
                            <button onClick={handleSaveCategory} className="p-1 rounded hover:bg-at-surface-hover transition-colors">
                              <Check className="w-3.5 h-3.5 text-at-accent" />
                            </button>
                            <button onClick={() => { setEditingCategoryId(null); setShowIconPicker(null) }} className="p-1 rounded hover:bg-at-surface-hover transition-colors">
                              <X className="w-3.5 h-3.5 text-at-text-weak" />
                            </button>
                          </div>
                        ) : (
                          // 일반 헤더
                          <div
                            className={`
                              group flex items-center justify-between w-full py-2.5 px-3 rounded-lg text-sm font-semibold transition-all duration-200
                              ${hasActive
                                ? 'text-at-accent bg-at-accent-light'
                                : 'text-at-text hover:text-at-text hover:bg-at-surface-alt'
                              }
                              border border-dashed border-at-border
                            `}
                          >
                            <div className="flex items-center space-x-2.5">
                              <span
                                {...listeners}
                                className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded hover:bg-at-accent-light transition-colors"
                              >
                                <GripVertical className="w-4 h-4 text-at-text-weak" />
                              </span>
                              <CategoryIcon className="w-5 h-5" />
                              <span>{category.label}</span>
                            </div>
                            <div className="flex items-center space-x-0.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); startEditCategory(category) }}
                                className="p-1 rounded hover:bg-at-accent-light opacity-0 group-hover:opacity-100 transition-all"
                                title="카테고리 수정"
                              >
                                <Pencil className="w-3 h-3 text-at-text-weak" />
                              </button>
                              {category.isCustom && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id) }}
                                  className="p-1 rounded hover:bg-at-error-bg opacity-0 group-hover:opacity-100 transition-all"
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
                              <div className="text-[11px] text-at-text-weak text-center py-2 border border-dashed border-at-border rounded-lg">
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
              <div className="flex items-center space-x-1.5 py-1.5 px-3 mt-1 rounded-lg bg-at-surface-alt border border-dashed border-at-border">
                <Plus className="w-4 h-4 text-at-text-weak flex-shrink-0" />
                <input
                  ref={newCategoryInputRef}
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setIsAddingCategory(false); setNewCategoryName('') } }}
                  placeholder="카테고리 이름"
                  className="flex-1 text-sm bg-transparent border-none outline-none text-at-text placeholder-at-text-weak min-w-0"
                />
                <button onClick={handleAddCategory} className="p-1 rounded hover:bg-at-surface-hover transition-colors">
                  <Check className="w-3.5 h-3.5 text-at-accent" />
                </button>
                <button onClick={() => { setIsAddingCategory(false); setNewCategoryName('') }} className="p-1 rounded hover:bg-at-surface-hover transition-colors">
                  <X className="w-3.5 h-3.5 text-at-text-weak" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingCategory(true)}
                className="flex items-center space-x-2 py-2 px-3 mt-1 rounded-lg text-xs font-medium text-at-text-weak hover:text-at-accent hover:bg-at-accent-light transition-all w-full"
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
        ) : isCollapsed ? (
          // === 축소 모드 ===
          <>
            {/* 상단 고정 메뉴들 */}
            {topFixedMenus.map(tab => {
              const isActive = activeTab === tab.id
              const Icon = tab.icon
              return (
                <Tooltip key={tab.id} label={tab.label}>
                  <button
                    onClick={() => handleTabClick(tab.id, tab.isPremiumLocked)}
                    className={`
                      group flex items-center justify-center py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full
                      ${tab.isPremiumLocked
                        ? 'text-slate-300 cursor-not-allowed opacity-50'
                        : isActive
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                      }
                    `}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${tab.isPremiumLocked ? 'text-slate-300' : isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
                  </button>
                </Tooltip>
              )
            })}

            {/* 미분류 메뉴 */}
            {uncategorizedMenus.map(tab => {
              const isActive = activeTab === tab.id
              const Icon = tab.icon
              return (
                <Tooltip key={tab.id} label={tab.label}>
                  <button
                    onClick={() => handleTabClick(tab.id, tab.isPremiumLocked)}
                    className={`
                      group flex items-center justify-center py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full
                      ${tab.isPremiumLocked
                        ? 'text-slate-300 cursor-not-allowed opacity-50'
                        : isActive
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                      }
                    `}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${tab.isPremiumLocked ? 'text-slate-300' : isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
                  </button>
                </Tooltip>
              )
            })}

            {/* 구분선 */}
            {(topFixedMenus.length > 0 || uncategorizedMenus.length > 0) && visibleCategories.length > 0 && (
              <div className="py-1"><div className="h-px bg-slate-200" /></div>
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
                  <Tooltip label={category.label}>
                    <button
                      onClick={() => toggleCategory(category.id)}
                      className={`
                        group flex items-center justify-center w-full py-1.5 rounded-lg transition-all duration-200
                        ${hasActive && !isExpanded
                          ? 'text-at-accent bg-at-accent-light'
                          : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                        }
                      `}
                    >
                      <div className="relative">
                        <CategoryIcon className="w-4 h-4" />
                        {hasActive && !isExpanded && (
                          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
                        )}
                      </div>
                    </button>
                  </Tooltip>
                  <div className={`overflow-hidden transition-all duration-200 ease-in-out ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="space-y-0.5">
                      {categoryTabs.map(tab => {
                        const isActive = activeTab === tab.id
                        const Icon = tab.icon
                        return (
                          <Tooltip key={tab.id} label={tab.label}>
                            <button
                              onClick={() => handleTabClick(tab.id, tab.isPremiumLocked)}
                              className={`
                                group flex items-center justify-center py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 w-full
                                ${tab.isPremiumLocked
                                  ? 'text-slate-300 cursor-not-allowed opacity-50'
                                  : isActive
                                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/20'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                }
                              `}
                            >
                              <Icon className={`w-4 h-4 flex-shrink-0 ${tab.isPremiumLocked ? 'text-slate-300' : isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-500'}`} />
                            </button>
                          </Tooltip>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </>
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
                      ? 'text-at-text-weak cursor-not-allowed opacity-50'
                      : isActive
                        ? 'bg-at-accent-light text-at-accent'
                        : 'text-at-text-secondary hover:bg-at-surface-hover hover:text-at-text'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${tab.isPremiumLocked ? 'text-at-text-weak' : isActive ? 'text-at-accent' : 'text-at-text-weak group-hover:text-at-text-secondary'}`} />
                  <span className="truncate">{tab.label}</span>
                  {tab.isPremiumLocked && <Lock className="w-3.5 h-3.5 ml-auto text-at-text-weak flex-shrink-0" />}
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
                      ? 'text-at-text-weak cursor-not-allowed opacity-50'
                      : isActive
                        ? 'bg-at-accent-light text-at-accent'
                        : 'text-at-text-secondary hover:bg-at-surface-hover hover:text-at-text'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${tab.isPremiumLocked ? 'text-at-text-weak' : isActive ? 'text-at-accent' : 'text-at-text-weak group-hover:text-at-text-secondary'}`} />
                  <span className="truncate">{tab.label}</span>
                  {tab.isPremiumLocked && <Lock className="w-3.5 h-3.5 ml-auto text-at-text-weak flex-shrink-0" />}
                </button>
              )
            })}

            {/* 구분선 */}
            {(topFixedMenus.length > 0 || uncategorizedMenus.length > 0) && visibleCategories.length > 0 && (
              <div className="pt-2 pb-1">
                <div className="h-px bg-at-border" />
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
                        ? 'text-at-accent bg-at-accent-light'
                        : 'text-at-text hover:text-at-text hover:bg-at-surface-alt'
                      }
                    `}
                  >
                    <div className="flex items-center space-x-2.5">
                      <CategoryIcon className="w-5 h-5" />
                      <span>{category.label}</span>
                      {hasActive && !isExpanded && (
                        <span className="w-1.5 h-1.5 rounded-full bg-at-accent animate-pulse" />
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
                                ? 'text-at-text-weak cursor-not-allowed opacity-50'
                                : isActive
                                  ? 'bg-at-accent-light text-at-accent'
                                  : 'text-at-text-secondary hover:bg-at-surface-hover hover:text-at-text'
                              }
                            `}
                          >
                            <Icon className={`w-4 h-4 flex-shrink-0 ${tab.isPremiumLocked ? 'text-at-text-weak' : isActive ? 'text-at-accent' : 'text-at-text-weak group-hover:text-at-text-secondary'}`} />
                            <span className="truncate">{tab.label}</span>
                            {tab.isPremiumLocked && <Lock className="w-3 h-3 ml-auto text-at-text-weak flex-shrink-0" />}
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

      {/* 하단 영역: 워커 상태 + 워커 다운로드 + 하단 고정 메뉴들 */}
      <div className="pt-2 border-t border-at-border mt-2 space-y-1">
        {/* 워커 상태 (프리미엄 기능 활성화된 사용자만 표시, 축소 시 숨김) */}
        {!isCollapsed && <WorkerStatusMenuItem />}
        {/* 워커 다운로드 버튼 */}
        {isCollapsed ? (
          <Tooltip label={isDownloadingWorker ? '다운로드 중...' : '통합 워커 다운로드'}>
            <button
              onClick={handleWorkerDownload}
              disabled={isDownloadingWorker}
              className="group flex items-center justify-center py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full text-at-text-weak hover:bg-at-success-bg hover:text-at-success disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className={`w-5 h-5 flex-shrink-0 text-at-text-weak group-hover:text-at-success ${isDownloadingWorker ? 'animate-bounce' : ''}`} />
            </button>
          </Tooltip>
        ) : (
          <div>
            <button
              onClick={handleWorkerDownload}
              disabled={isDownloadingWorker}
              className="group flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full text-at-text-weak hover:bg-at-success-bg hover:text-at-success disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className={`w-5 h-5 flex-shrink-0 text-at-text-weak group-hover:text-at-success ${isDownloadingWorker ? 'animate-bounce' : ''}`} />
              <span className="truncate">{isDownloadingWorker ? '다운로드 중...' : '통합 워커 다운로드'}</span>
            </button>
            {workerVersionInfo?.latestVersion && (
              <div className="px-3 pb-1 flex items-center justify-between text-[11px] text-at-text-weak">
                <span>v{workerVersionInfo.latestVersion}</span>
                {workerVersionInfo.latestReleaseDate && (
                  <span>{new Date(workerVersionInfo.latestReleaseDate).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 업데이트</span>
                )}
              </div>
            )}
          </div>
        )}
        {bottomFixedMenus.map(tab => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon

          return isCollapsed ? (
            <Tooltip key={tab.id} label={tab.label}>
              <button
                onClick={() => handleTabClick(tab.id)}
                className={`
                  group flex items-center justify-center py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full
                  ${isActive
                    ? 'bg-at-accent-light text-at-accent'
                    : 'text-at-text-secondary hover:bg-at-surface-hover hover:text-at-text'
                  }
                  ${isEditMode ? 'opacity-60 cursor-default' : ''}
                `}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-at-accent' : 'text-at-text-weak group-hover:text-at-text-secondary'}`} />
              </button>
            </Tooltip>
          ) : (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`
                group flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full
                ${isActive
                  ? 'bg-at-accent-light text-at-accent'
                  : 'text-at-text-secondary hover:bg-at-surface-hover hover:text-at-text'
                }
                ${isEditMode ? 'opacity-60 cursor-default' : ''}
              `}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-at-accent' : 'text-at-text-weak group-hover:text-at-text-secondary'}`} />
              <span className="truncate">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Mac 워커 설치 모달 */}
      {showWorkerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowWorkerModal(false)}>
          <div className="bg-at-surface rounded-2xl shadow-at-card w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Monitor className="w-5 h-5 text-at-text-secondary" />
                <h2 className="text-base font-semibold text-at-text">통합 워커 설치 (Mac)</h2>
              </div>
              <button onClick={() => setShowWorkerModal(false)} className="p-1 rounded-lg hover:bg-at-surface-hover">
                <X className="w-4 h-4 text-at-text-weak" />
              </button>
            </div>

            <ol className="text-sm text-at-text-secondary space-y-1.5 mb-4">
              <li><span className="font-medium text-at-text">1.</span> <kbd className="px-1.5 py-0.5 rounded bg-at-surface-alt text-xs font-mono">Cmd + Space</kbd> → <span className="font-medium">Terminal</span> 검색 후 실행</li>
              <li><span className="font-medium text-at-text">2.</span> 아래 명령어를 복사하여 Terminal에 붙여넣고 <kbd className="px-1.5 py-0.5 rounded bg-at-surface-alt text-xs font-mono">Enter</kbd></li>
            </ol>

            <div className="relative">
              <pre className="bg-slate-900 text-green-400 text-xs rounded-xl p-4 overflow-x-auto max-h-32 font-mono leading-relaxed select-all whitespace-pre-wrap break-all">
                {workerInstallCommand}
              </pre>
              <button
                onClick={handleCopyWorkerCmd}
                className={`absolute top-2 right-2 flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  copiedWorkerCmd
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                }`}
              >
                {copiedWorkerCmd ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                <span>{copiedWorkerCmd ? '복사됨!' : '복사'}</span>
              </button>
            </div>
            <button
              onClick={handleCopyWorkerCmd}
              className={`mt-3 w-full py-2.5 rounded-xl text-sm font-medium transition-all ${
                copiedWorkerCmd
                  ? 'bg-green-500 text-white'
                  : 'bg-at-accent hover:bg-at-accent-hover text-white'
              }`}
            >
              {copiedWorkerCmd ? '✓ 명령어 복사 완료' : '명령어 복사하기'}
            </button>
            <p className="mt-2 text-xs text-at-text-weak text-center">Terminal에 붙여넣기하면 Gatekeeper 경고 없이 설치됩니다</p>
          </div>
        </div>
      )}
    </nav>
  )
}
