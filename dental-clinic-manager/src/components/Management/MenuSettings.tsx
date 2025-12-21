'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  DragOverEvent,
  useDroppable,
  pointerWithin,
  MeasuringStrategy,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Save,
  X,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  Pencil,
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
  FolderPlus,
  ChevronRight,
  Info,
  EyeOff,
  LayoutList,
} from 'lucide-react'
import type { MenuItemSetting, MenuCategorySetting } from '@/types/menuSettings'
import { DEFAULT_MENU_ITEMS, DEFAULT_CATEGORIES, AVAILABLE_CATEGORY_ICONS, createNewCategory } from '@/types/menuSettings'
import { getUserMenuSettings, saveUserMenuSettings, resetUserMenuSettings } from '@/lib/menuSettingsService'
import { useAuth } from '@/contexts/AuthContext'

// 메뉴 아이콘 매핑
const menuIcons: Record<string, React.ElementType> = {
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
const categoryIcons: Record<string, React.ElementType> = {
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
  'Star': Star,
  'Bell': Bell,
  'Bookmark': Bookmark,
  'Box': Box,
  'Coffee': Coffee,
  'Flag': Flag,
  'Gift': Gift,
  'Globe': Globe,
  'Home': Home,
  'Layers': Layers,
  'Layout': Layout,
  'List': List,
  'Mail': Mail,
  'Map': Map,
  'Monitor': Monitor,
  'Package': Package,
  'Palette': Palette,
  'Phone': Phone,
  'Scissors': Scissors,
  'Shield': Shield,
  'Target': Target,
  'Truck': Truck,
  'Zap': Zap,
}

// 카테고리 내 메뉴 아이템
interface SortableMenuInCategoryProps {
  item: MenuItemSetting
  index: number
  totalCount: number
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  isAnimating?: 'up' | 'down' | null
}

function SortableMenuInCategory({
  item,
  index,
  totalCount,
  onMoveUp,
  onMoveDown,
  onRemove,
  isAnimating,
}: SortableMenuInCategoryProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `cat-menu-${item.id}`, data: { type: 'category-menu', item, categoryId: item.categoryId } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || (isAnimating ? 'transform 0.2s ease-out' : undefined),
    opacity: isDragging ? 0.5 : 1,
  }

  const Icon = menuIcons[item.id] || HelpCircle

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-2 p-2 ml-6 rounded-lg border transition-all
        ${isDragging ? 'shadow-lg ring-2 ring-blue-400 border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}
        ${isAnimating === 'up' ? 'animate-bounce-up' : ''}
        ${isAnimating === 'down' ? 'animate-bounce-down' : ''}
      `}
    >
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center bg-slate-100 text-slate-600">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <span className="flex-1 text-sm text-slate-700 truncate">{item.label}</span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="위로 이동"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={index === totalCount - 1}
          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="아래로 이동"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <button
          onClick={onRemove}
          className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          title="미사용으로 이동"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// 독립 메뉴 아이템 (독립 메뉴 영역 내)
interface SortableStandaloneMenuProps {
  item: MenuItemSetting
  index: number
  totalCount: number
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  isAnimating?: 'up' | 'down' | null
}

function SortableStandaloneMenu({
  item,
  index,
  totalCount,
  onMoveUp,
  onMoveDown,
  onRemove,
  isAnimating,
}: SortableStandaloneMenuProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `standalone-${item.id}`, data: { type: 'standalone-menu', item } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || (isAnimating ? 'transform 0.2s ease-out' : undefined),
    opacity: isDragging ? 0.5 : 1,
  }

  const Icon = menuIcons[item.id] || HelpCircle

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-2 p-2.5 rounded-lg border-2 transition-all
        ${isDragging ? 'shadow-lg ring-2 ring-emerald-400 border-emerald-400 bg-emerald-50' : 'border-emerald-200 bg-white hover:border-emerald-300'}
        ${isAnimating === 'up' ? 'animate-bounce-up' : ''}
        ${isAnimating === 'down' ? 'animate-bounce-down' : ''}
      `}
    >
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-100 text-emerald-600">
        <Icon className="w-4 h-4" />
      </div>
      <span className="flex-1 text-sm font-medium text-slate-700 truncate">{item.label}</span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="위로 이동"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={index === totalCount - 1}
          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="아래로 이동"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <button
          onClick={onRemove}
          className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          title="미사용으로 이동"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// 드래그 가능한 카테고리 (메뉴 포함)
interface SortableCategoryWithMenusProps {
  category: MenuCategorySetting
  menuItems: MenuItemSetting[]
  index: number
  totalCount: number
  onMoveUp: () => void
  onMoveDown: () => void
  onEdit: () => void
  onDelete: () => void
  onMenuMoveUp: (menuId: string) => void
  onMenuMoveDown: (menuId: string) => void
  onMenuRemove: (menuId: string) => void
  isExpanded: boolean
  onToggleExpand: () => void
  animatingMenuId?: string | null
  animatingDirection?: 'up' | 'down' | null
  categoryAnimating?: 'up' | 'down' | null
}

function SortableCategoryWithMenus({
  category,
  menuItems,
  index,
  totalCount,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  onMenuMoveUp,
  onMenuMoveDown,
  onMenuRemove,
  isExpanded,
  onToggleExpand,
  animatingMenuId,
  animatingDirection,
  categoryAnimating,
}: SortableCategoryWithMenusProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `cat-${category.id}`,
    data: { type: 'category', category }
  })

  const { setNodeRef: setDropRef, isOver: isDropOver } = useDroppable({
    id: `drop-cat-${category.id}`,
    data: { type: 'category-drop', categoryId: category.id }
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || (categoryAnimating ? 'transform 0.2s ease-out' : undefined),
    opacity: isDragging ? 0.5 : 1,
  }

  const CategoryIcon = categoryIcons[category.icon] || FolderOpen

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        setDropRef(node)
      }}
      style={style}
      className={`
        rounded-xl border-2 overflow-hidden transition-all
        ${isDragging ? 'shadow-xl ring-2 ring-blue-400' : ''}
        ${isDropOver ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200'}
        ${categoryAnimating === 'up' ? 'animate-bounce-up' : ''}
        ${categoryAnimating === 'down' ? 'animate-bounce-down' : ''}
      `}
    >
      <div
        className={`
          flex items-center gap-2 p-3 cursor-pointer transition-colors
          ${isExpanded ? 'bg-slate-100' : 'bg-white hover:bg-slate-50'}
        `}
        onClick={onToggleExpand}
      >
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-blue-100 text-blue-600">
          <CategoryIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{category.label}</p>
          <p className="text-xs text-slate-500">{menuItems.length}개 메뉴</p>
        </div>
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="위로 이동"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === totalCount - 1}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="아래로 이동"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="편집"
          >
            <Pencil className="w-4 h-4" />
          </button>
          {category.isCustom && (
            <button
              onClick={onDelete}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="삭제"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-2 pt-0 space-y-1.5 bg-slate-50/50">
          {menuItems.length === 0 ? (
            <div className={`
              ml-6 p-4 rounded-lg border-2 border-dashed text-center transition-colors
              ${isDropOver ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400'}
            `}>
              <p className="text-sm">메뉴를 여기로 드래그하세요</p>
            </div>
          ) : (
            <SortableContext items={menuItems.map(m => `cat-menu-${m.id}`)} strategy={verticalListSortingStrategy}>
              {menuItems.map((item, idx) => (
                <SortableMenuInCategory
                  key={item.id}
                  item={item}
                  index={idx}
                  totalCount={menuItems.length}
                  onMoveUp={() => onMenuMoveUp(item.id)}
                  onMoveDown={() => onMenuMoveDown(item.id)}
                  onRemove={() => onMenuRemove(item.id)}
                  isAnimating={animatingMenuId === item.id ? animatingDirection : null}
                />
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  )
}

// 독립 메뉴 영역 (드롭 가능)
interface StandaloneMenuSectionProps {
  menuItems: MenuItemSetting[]
  onMenuMoveUp: (menuId: string) => void
  onMenuMoveDown: (menuId: string) => void
  onMenuRemove: (menuId: string) => void
  animatingMenuId?: string | null
  animatingDirection?: 'up' | 'down' | null
}

function StandaloneMenuSection({
  menuItems,
  onMenuMoveUp,
  onMenuMoveDown,
  onMenuRemove,
  animatingMenuId,
  animatingDirection,
}: StandaloneMenuSectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'drop-standalone',
    data: { type: 'standalone-drop' }
  })

  return (
    <div
      ref={setNodeRef}
      className={`
        rounded-xl border-2 overflow-hidden transition-all
        ${isOver ? 'border-emerald-400 bg-emerald-50/50' : 'border-emerald-200 bg-emerald-50/30'}
      `}
    >
      <div className="flex items-center gap-2 px-4 py-3 bg-emerald-100/50 border-b border-emerald-200">
        <LayoutList className="w-5 h-5 text-emerald-600" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-emerald-800">독립 메뉴</h4>
          <p className="text-xs text-emerald-600">카테고리 없이 단독으로 표시되는 메뉴</p>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {menuItems.length === 0 ? (
          <div className={`
            p-4 rounded-lg border-2 border-dashed text-center transition-colors
            ${isOver ? 'border-emerald-400 bg-emerald-50 text-emerald-600' : 'border-emerald-200 text-emerald-500'}
          `}>
            <p className="text-sm">미사용 메뉴를 여기로 드래그하면 독립 메뉴가 됩니다</p>
          </div>
        ) : (
          <SortableContext items={menuItems.map(m => `standalone-${m.id}`)} strategy={verticalListSortingStrategy}>
            {menuItems.map((item, idx) => (
              <SortableStandaloneMenu
                key={item.id}
                item={item}
                index={idx}
                totalCount={menuItems.length}
                onMoveUp={() => onMenuMoveUp(item.id)}
                onMoveDown={() => onMenuMoveDown(item.id)}
                onRemove={() => onMenuRemove(item.id)}
                isAnimating={animatingMenuId === item.id ? animatingDirection : null}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  )
}

// 미사용 메뉴 아이템 (우측 패널)
interface DraggableUnusedMenuProps {
  item: MenuItemSetting
}

function DraggableUnusedMenu({ item }: DraggableUnusedMenuProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `unused-${item.id}`, data: { type: 'unused-menu', item } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const Icon = menuIcons[item.id] || HelpCircle

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        flex items-center gap-3 p-3 rounded-lg border-2 cursor-grab active:cursor-grabbing transition-all
        ${isDragging ? 'shadow-lg ring-2 ring-blue-400 border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'}
      `}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 text-slate-500">
        <Icon className="w-4 h-4" />
      </div>
      <span className="flex-1 text-sm font-medium text-slate-700">{item.label}</span>
      <GripVertical className="w-4 h-4 text-slate-400" />
    </div>
  )
}

// 카테고리 편집 모달
interface EditCategoryModalProps {
  category: MenuCategorySetting | null
  isNew: boolean
  onSave: (category: MenuCategorySetting) => void
  onClose: () => void
}

function EditCategoryModal({ category, isNew, onSave, onClose }: EditCategoryModalProps) {
  const [label, setLabel] = useState(category?.label || '')
  const [icon, setIcon] = useState(category?.icon || 'FolderOpen')

  useEffect(() => {
    if (category) {
      setLabel(category.label)
      setIcon(category.icon)
    }
  }, [category])

  const handleSave = () => {
    if (!label.trim()) return

    if (isNew) {
      const newCat = createNewCategory(label.trim(), 999)
      newCat.icon = icon
      onSave(newCat)
    } else if (category) {
      onSave({ ...category, label: label.trim(), icon })
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
        <h3 className="text-lg font-bold text-slate-800 mb-4">
          {isNew ? '새 카테고리 추가' : '카테고리 편집'}
        </h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            카테고리 이름
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="예: 업무 관리"
            autoFocus
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            아이콘 선택
          </label>
          <div className="grid grid-cols-8 gap-1.5 max-h-40 overflow-y-auto p-2 bg-slate-50 rounded-lg">
            {AVAILABLE_CATEGORY_ICONS.map((iconName) => {
              const IconComponent = categoryIcons[iconName]
              if (!IconComponent) return null
              return (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setIcon(iconName)}
                  className={`p-2 rounded-lg border-2 transition-all ${
                    icon === iconName
                      ? 'border-blue-500 bg-blue-50 text-blue-600'
                      : 'border-transparent text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <IconComponent className="w-4 h-4" />
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!label.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isNew ? '추가' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 메인 컴포넌트
export default function MenuSettings() {
  const { user } = useAuth()
  const [menuItems, setMenuItems] = useState<MenuItemSetting[]>([])
  const [categories, setCategories] = useState<MenuCategorySetting[]>([])
  const [originalMenuItems, setOriginalMenuItems] = useState<MenuItemSetting[]>([])
  const [originalCategories, setOriginalCategories] = useState<MenuCategorySetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<MenuCategorySetting | null>(null)
  const [isNewCategory, setIsNewCategory] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  // 애니메이션 상태
  const [animatingMenuId, setAnimatingMenuId] = useState<string | null>(null)
  const [animatingDirection, setAnimatingDirection] = useState<'up' | 'down' | null>(null)
  const [animatingCategoryId, setAnimatingCategoryId] = useState<string | null>(null)
  const [animatingCategoryDirection, setAnimatingCategoryDirection] = useState<'up' | 'down' | null>(null)

  // DnD 센서 설정
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // 독립 메뉴 (visible=true, categoryId=undefined)
  const standaloneMenus = useMemo(() =>
    menuItems.filter(m => m.visible && !m.categoryId).sort((a, b) => a.order - b.order),
    [menuItems]
  )

  // 미사용 메뉴 (visible=false)
  const unusedMenus = useMemo(() =>
    menuItems.filter(m => !m.visible).sort((a, b) => a.order - b.order),
    [menuItems]
  )

  // 메뉴 설정 로드
  const loadMenuSettings = useCallback(async () => {
    if (!user?.id) return

    setLoading(true)
    setError('')

    const result = await getUserMenuSettings(user.id, true)

    if (result.success && result.data) {
      const sortedMenuItems = [...result.data.settings].sort((a, b) => a.order - b.order)
      const sortedCategories = [...result.data.categories].sort((a, b) => a.order - b.order)

      setMenuItems(sortedMenuItems)
      setOriginalMenuItems(sortedMenuItems)
      setCategories(sortedCategories)
      setOriginalCategories(sortedCategories)
      setExpandedCategories(new Set(sortedCategories.map(c => c.id)))
    } else {
      setError(result.error || '메뉴 설정을 불러오는데 실패했습니다.')
    }

    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    loadMenuSettings()
  }, [loadMenuSettings])

  // 변경 사항 체크
  useEffect(() => {
    const menuChanged = JSON.stringify(menuItems) !== JSON.stringify(originalMenuItems)
    const categoryChanged = JSON.stringify(categories) !== JSON.stringify(originalCategories)
    setHasChanges(menuChanged || categoryChanged)
  }, [menuItems, originalMenuItems, categories, originalCategories])

  // 카테고리별 메뉴 가져오기
  const getMenusByCategory = useCallback((categoryId: string) => {
    return menuItems
      .filter(m => m.categoryId === categoryId && m.visible)
      .sort((a, b) => a.order - b.order)
  }, [menuItems])

  // 애니메이션 헬퍼
  const triggerMenuAnimation = (menuId: string, direction: 'up' | 'down') => {
    setAnimatingMenuId(menuId)
    setAnimatingDirection(direction)
    setTimeout(() => {
      setAnimatingMenuId(null)
      setAnimatingDirection(null)
    }, 200)
  }

  const triggerCategoryAnimation = (categoryId: string, direction: 'up' | 'down') => {
    setAnimatingCategoryId(categoryId)
    setAnimatingCategoryDirection(direction)
    setTimeout(() => {
      setAnimatingCategoryId(null)
      setAnimatingCategoryDirection(null)
    }, 200)
  }

  // 카테고리 순서 이동
  const moveCategoryUp = (index: number) => {
    if (index === 0) return
    triggerCategoryAnimation(categories[index].id, 'up')
    setCategories(prev => {
      const newCats = [...prev]
      const temp = newCats[index].order
      newCats[index] = { ...newCats[index], order: newCats[index - 1].order }
      newCats[index - 1] = { ...newCats[index - 1], order: temp }
      return newCats.sort((a, b) => a.order - b.order)
    })
    setSuccess('')
  }

  const moveCategoryDown = (index: number) => {
    if (index === categories.length - 1) return
    triggerCategoryAnimation(categories[index].id, 'down')
    setCategories(prev => {
      const newCats = [...prev]
      const temp = newCats[index].order
      newCats[index] = { ...newCats[index], order: newCats[index + 1].order }
      newCats[index + 1] = { ...newCats[index + 1], order: temp }
      return newCats.sort((a, b) => a.order - b.order)
    })
    setSuccess('')
  }

  // 카테고리 삭제
  const deleteCategory = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId)
    if (!category?.isCustom) return

    if (!confirm(`"${category.label}" 카테고리를 삭제하시겠습니까?\n\n해당 카테고리에 속한 메뉴는 미사용 메뉴로 이동됩니다.`)) return

    setMenuItems(prev => prev.map(m =>
      m.categoryId === categoryId ? { ...m, categoryId: undefined, visible: false } : m
    ))
    setCategories(prev => prev.filter(c => c.id !== categoryId))
    setExpandedCategories(prev => {
      const newSet = new Set(prev)
      newSet.delete(categoryId)
      return newSet
    })
    setSuccess('')
  }

  const handleSaveCategory = (updated: MenuCategorySetting) => {
    if (isNewCategory) {
      const maxOrder = Math.max(...categories.map(c => c.order), -1)
      setCategories(prev => [...prev, { ...updated, order: maxOrder + 1 }])
      setExpandedCategories(prev => new Set([...prev, updated.id]))
    } else {
      setCategories(prev => prev.map(c => c.id === updated.id ? updated : c))
    }
    setSuccess('')
  }

  const openNewCategoryModal = () => {
    setEditingCategory(null)
    setIsNewCategory(true)
  }

  const toggleCategoryExpand = (categoryId: string) => {
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

  // 카테고리 내 메뉴 핸들러
  const moveMenuUpInCategory = (menuId: string) => {
    setMenuItems(prev => {
      const item = prev.find(m => m.id === menuId)
      if (!item?.categoryId) return prev

      const categoryMenus = prev
        .filter(m => m.categoryId === item.categoryId && m.visible)
        .sort((a, b) => a.order - b.order)

      const idx = categoryMenus.findIndex(m => m.id === menuId)
      if (idx <= 0) return prev

      triggerMenuAnimation(menuId, 'up')

      const prevItem = categoryMenus[idx - 1]
      const tempOrder = item.order
      return prev.map(m => {
        if (m.id === menuId) return { ...m, order: prevItem.order }
        if (m.id === prevItem.id) return { ...m, order: tempOrder }
        return m
      })
    })
    setSuccess('')
  }

  const moveMenuDownInCategory = (menuId: string) => {
    setMenuItems(prev => {
      const item = prev.find(m => m.id === menuId)
      if (!item?.categoryId) return prev

      const categoryMenus = prev
        .filter(m => m.categoryId === item.categoryId && m.visible)
        .sort((a, b) => a.order - b.order)

      const idx = categoryMenus.findIndex(m => m.id === menuId)
      if (idx === -1 || idx === categoryMenus.length - 1) return prev

      triggerMenuAnimation(menuId, 'down')

      const nextItem = categoryMenus[idx + 1]
      const tempOrder = item.order
      return prev.map(m => {
        if (m.id === menuId) return { ...m, order: nextItem.order }
        if (m.id === nextItem.id) return { ...m, order: tempOrder }
        return m
      })
    })
    setSuccess('')
  }

  const removeMenuFromCategory = (menuId: string) => {
    setMenuItems(prev => prev.map(m =>
      m.id === menuId ? { ...m, categoryId: undefined, visible: false } : m
    ))
    setSuccess('')
  }

  // 독립 메뉴 핸들러
  const moveStandaloneMenuUp = (menuId: string) => {
    setMenuItems(prev => {
      const standaloneList = prev
        .filter(m => m.visible && !m.categoryId)
        .sort((a, b) => a.order - b.order)

      const idx = standaloneList.findIndex(m => m.id === menuId)
      if (idx <= 0) return prev

      triggerMenuAnimation(menuId, 'up')

      const item = standaloneList[idx]
      const prevItem = standaloneList[idx - 1]
      const tempOrder = item.order
      return prev.map(m => {
        if (m.id === menuId) return { ...m, order: prevItem.order }
        if (m.id === prevItem.id) return { ...m, order: tempOrder }
        return m
      })
    })
    setSuccess('')
  }

  const moveStandaloneMenuDown = (menuId: string) => {
    setMenuItems(prev => {
      const standaloneList = prev
        .filter(m => m.visible && !m.categoryId)
        .sort((a, b) => a.order - b.order)

      const idx = standaloneList.findIndex(m => m.id === menuId)
      if (idx === -1 || idx === standaloneList.length - 1) return prev

      triggerMenuAnimation(menuId, 'down')

      const item = standaloneList[idx]
      const nextItem = standaloneList[idx + 1]
      const tempOrder = item.order
      return prev.map(m => {
        if (m.id === menuId) return { ...m, order: nextItem.order }
        if (m.id === nextItem.id) return { ...m, order: tempOrder }
        return m
      })
    })
    setSuccess('')
  }

  const removeStandaloneMenu = (menuId: string) => {
    setMenuItems(prev => prev.map(m =>
      m.id === menuId ? { ...m, visible: false } : m
    ))
    setSuccess('')
  }

  // DnD 핸들러
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string
    const activeData = active.data.current
    const overData = over.data.current

    // 독립 메뉴 영역으로 드롭
    if (overData?.type === 'standalone-drop') {
      if (activeData?.type === 'unused-menu') {
        const menuItem = activeData.item as MenuItemSetting
        const maxOrder = standaloneMenus.length > 0
          ? Math.max(...standaloneMenus.map(m => m.order)) + 1
          : 0
        setMenuItems(prev => prev.map(m =>
          m.id === menuItem.id ? { ...m, visible: true, categoryId: undefined, order: maxOrder } : m
        ))
      } else if (activeData?.type === 'category-menu') {
        const menuItem = activeData.item as MenuItemSetting
        const maxOrder = standaloneMenus.length > 0
          ? Math.max(...standaloneMenus.map(m => m.order)) + 1
          : 0
        setMenuItems(prev => prev.map(m =>
          m.id === menuItem.id ? { ...m, visible: true, categoryId: undefined, order: maxOrder } : m
        ))
      }
      setSuccess('')
      return
    }

    // 카테고리 드롭 영역으로 이동
    if (overData?.type === 'category-drop') {
      const targetCategoryId = overData.categoryId

      if (activeData?.type === 'unused-menu' || activeData?.type === 'standalone-menu' || activeData?.type === 'category-menu') {
        const menuItem = activeData.item as MenuItemSetting
        const categoryMenus = menuItems.filter(m => m.categoryId === targetCategoryId && m.visible)
        const maxOrder = categoryMenus.length > 0
          ? Math.max(...categoryMenus.map(m => m.order)) + 1
          : 0

        setMenuItems(prev => prev.map(m =>
          m.id === menuItem.id ? { ...m, categoryId: targetCategoryId, visible: true, order: maxOrder } : m
        ))
        setExpandedCategories(prev => new Set([...prev, targetCategoryId]))
      }
      setSuccess('')
      return
    }

    // 카테고리 간 순서 변경
    if (activeId.startsWith('cat-') && !activeId.startsWith('cat-menu-') &&
        overId.startsWith('cat-') && !overId.startsWith('cat-menu-')) {
      const activeIdx = categories.findIndex(c => `cat-${c.id}` === activeId)
      const overIdx = categories.findIndex(c => `cat-${c.id}` === overId)

      if (activeIdx !== -1 && overIdx !== -1 && activeIdx !== overIdx) {
        setCategories(prev => {
          const newCats = arrayMove(prev, activeIdx, overIdx)
          return newCats.map((c, i) => ({ ...c, order: i }))
        })
        setSuccess('')
      }
      return
    }

    // 같은 카테고리 내 메뉴 순서 변경
    if (activeId.startsWith('cat-menu-') && overId.startsWith('cat-menu-')) {
      const activeMenuId = activeId.replace('cat-menu-', '')
      const overMenuId = overId.replace('cat-menu-', '')
      const activeItem = menuItems.find(m => m.id === activeMenuId)
      const overItem = menuItems.find(m => m.id === overMenuId)

      if (activeItem && overItem && activeItem.categoryId === overItem.categoryId) {
        const categoryMenus = menuItems
          .filter(m => m.categoryId === activeItem.categoryId && m.visible)
          .sort((a, b) => a.order - b.order)

        const activeIdx = categoryMenus.findIndex(m => m.id === activeMenuId)
        const overIdx = categoryMenus.findIndex(m => m.id === overMenuId)

        if (activeIdx !== -1 && overIdx !== -1 && activeIdx !== overIdx) {
          const reordered = arrayMove(categoryMenus, activeIdx, overIdx)
          setMenuItems(prev => {
            const otherMenus = prev.filter(m => m.categoryId !== activeItem.categoryId || !m.visible)
            const updatedCategoryMenus = reordered.map((m, idx) => ({ ...m, order: idx }))
            return [...otherMenus, ...updatedCategoryMenus]
          })
          setSuccess('')
        }
      }
      return
    }

    // 독립 메뉴 간 순서 변경
    if (activeId.startsWith('standalone-') && overId.startsWith('standalone-')) {
      const activeMenuId = activeId.replace('standalone-', '')
      const overMenuId = overId.replace('standalone-', '')

      const activeIdx = standaloneMenus.findIndex(m => m.id === activeMenuId)
      const overIdx = standaloneMenus.findIndex(m => m.id === overMenuId)

      if (activeIdx !== -1 && overIdx !== -1 && activeIdx !== overIdx) {
        const reordered = arrayMove(standaloneMenus, activeIdx, overIdx)
        setMenuItems(prev => {
          const otherMenus = prev.filter(m => m.categoryId || !m.visible)
          const updatedStandaloneMenus = reordered.map((m, idx) => ({ ...m, order: idx }))
          return [...otherMenus, ...updatedStandaloneMenus]
        })
        setSuccess('')
      }
    }
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (!over) return

    const overData = over.data.current

    if (overData?.type === 'category-drop') {
      setExpandedCategories(prev => new Set([...prev, overData.categoryId]))
    }
  }

  // 저장/초기화
  const handleSave = async () => {
    if (!user?.id) return

    setSaving(true)
    setError('')
    setSuccess('')

    const result = await saveUserMenuSettings(user.id, menuItems, categories)

    if (result.success) {
      setOriginalMenuItems([...menuItems])
      setOriginalCategories([...categories])
      setSuccess('메뉴 설정이 저장되었습니다.')
    } else {
      setError(result.error || '메뉴 설정 저장에 실패했습니다.')
    }

    setSaving(false)
  }

  const handleReset = async () => {
    if (!user?.id) return

    if (!confirm('메뉴 설정을 기본값으로 초기화하시겠습니까?\n\n모든 커스텀 설정이 삭제됩니다.')) return

    setSaving(true)
    setError('')
    setSuccess('')

    const result = await resetUserMenuSettings(user.id)

    if (result.success) {
      const sortedMenuDefaults = [...DEFAULT_MENU_ITEMS].sort((a, b) => a.order - b.order)
      const sortedCategoryDefaults = [...DEFAULT_CATEGORIES].sort((a, b) => a.order - b.order)
      setMenuItems(sortedMenuDefaults)
      setOriginalMenuItems(sortedMenuDefaults)
      setCategories(sortedCategoryDefaults)
      setOriginalCategories(sortedCategoryDefaults)
      setExpandedCategories(new Set(sortedCategoryDefaults.map(c => c.id)))
      setSuccess('메뉴 설정이 초기화되었습니다.')
    } else {
      setError(result.error || '메뉴 설정 초기화에 실패했습니다.')
    }

    setSaving(false)
  }

  const handleCancel = () => {
    setMenuItems([...originalMenuItems])
    setCategories([...originalCategories])
    setSuccess('')
    setError('')
  }

  // 드래그 중인 아이템
  const activeItem = useMemo(() => {
    if (!activeId) return null

    if (activeId.startsWith('unused-')) {
      const menuId = activeId.replace('unused-', '')
      return { type: 'menu', data: menuItems.find(m => m.id === menuId) }
    }
    if (activeId.startsWith('standalone-')) {
      const menuId = activeId.replace('standalone-', '')
      return { type: 'menu', data: menuItems.find(m => m.id === menuId) }
    }
    if (activeId.startsWith('cat-menu-')) {
      const menuId = activeId.replace('cat-menu-', '')
      return { type: 'menu', data: menuItems.find(m => m.id === menuId) }
    }
    if (activeId.startsWith('cat-') && !activeId.startsWith('cat-menu-')) {
      const catId = activeId.replace('cat-', '')
      return { type: 'category', data: categories.find(c => c.id === catId) }
    }
    return null
  }, [activeId, menuItems, categories])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">메뉴 설정을 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (!user?.id) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">로그인이 필요합니다.</p>
      </div>
    )
  }

  const sortedCategories = [...categories].sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-6">
      <style jsx global>{`
        @keyframes bounce-up {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes bounce-down {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(4px); }
        }
        .animate-bounce-up {
          animation: bounce-up 0.2s ease-out;
        }
        .animate-bounce-down {
          animation: bounce-down 0.2s ease-out;
        }
      `}</style>

      {/* 상단 안내 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Settings className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h4 className="font-semibold text-blue-800 mb-1">나만의 메뉴 설정</h4>
            <ul className="text-sm text-blue-700 space-y-0.5">
              <li>• <strong>카테고리</strong>: 메뉴를 그룹으로 묶어서 표시합니다</li>
              <li>• <strong>독립 메뉴</strong>: 카테고리 없이 단독으로 표시됩니다</li>
              <li>• <strong>미사용 메뉴</strong>: 사이드바에 표시되지 않습니다</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 에러/성공 메시지 */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 text-green-600 rounded-lg text-sm">
          <Check className="w-5 h-5 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* 메인 콘텐츠 */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.Always
          }
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 좌측: 사이드바 구성 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 카테고리 영역 */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderPlus className="w-5 h-5 text-slate-600" />
                    <h3 className="font-semibold text-slate-800">카테고리</h3>
                  </div>
                  <button
                    onClick={openNewCategoryModal}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    추가
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                <SortableContext
                  items={sortedCategories.map(c => `cat-${c.id}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {sortedCategories.map((category, index) => (
                    <SortableCategoryWithMenus
                      key={category.id}
                      category={category}
                      menuItems={getMenusByCategory(category.id)}
                      index={index}
                      totalCount={sortedCategories.length}
                      onMoveUp={() => moveCategoryUp(index)}
                      onMoveDown={() => moveCategoryDown(index)}
                      onEdit={() => { setEditingCategory(category); setIsNewCategory(false); }}
                      onDelete={() => deleteCategory(category.id)}
                      onMenuMoveUp={moveMenuUpInCategory}
                      onMenuMoveDown={moveMenuDownInCategory}
                      onMenuRemove={removeMenuFromCategory}
                      isExpanded={expandedCategories.has(category.id)}
                      onToggleExpand={() => toggleCategoryExpand(category.id)}
                      animatingMenuId={animatingMenuId}
                      animatingDirection={animatingDirection}
                      categoryAnimating={animatingCategoryId === category.id ? animatingCategoryDirection : null}
                    />
                  ))}
                </SortableContext>

                {sortedCategories.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">카테고리가 없습니다</p>
                    <p className="text-xs mt-1">위의 &quot;추가&quot; 버튼을 클릭하세요</p>
                  </div>
                )}
              </div>
            </div>

            {/* 독립 메뉴 영역 */}
            <StandaloneMenuSection
              menuItems={standaloneMenus}
              onMenuMoveUp={moveStandaloneMenuUp}
              onMenuMoveDown={moveStandaloneMenuDown}
              onMenuRemove={removeStandaloneMenu}
              animatingMenuId={animatingMenuId}
              animatingDirection={animatingDirection}
            />
          </div>

          {/* 우측: 미사용 메뉴 (Sticky) */}
          <div className="lg:self-start lg:sticky lg:top-4">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-amber-50 px-4 py-3 border-b border-amber-200">
                <div className="flex items-center gap-2">
                  <EyeOff className="w-5 h-5 text-amber-600" />
                  <h3 className="font-semibold text-amber-800">미사용 메뉴</h3>
                </div>
              </div>

              <div className="px-4 py-3 bg-amber-50/50 border-b border-amber-100">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    좌측 카테고리 또는 독립 메뉴 영역으로 드래그하세요. 여기에 있는 메뉴는 사이드바에 표시되지 않습니다.
                  </p>
                </div>
              </div>

              <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
                <SortableContext items={unusedMenus.map(m => `unused-${m.id}`)} strategy={verticalListSortingStrategy}>
                  {unusedMenus.map((item) => (
                    <DraggableUnusedMenu key={item.id} item={item} />
                  ))}
                </SortableContext>

                {unusedMenus.length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <Check className="w-10 h-10 mx-auto mb-2 text-green-500" />
                    <p className="text-sm font-medium text-green-600">모든 메뉴가 사용 중입니다!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 드래그 오버레이 */}
        <DragOverlay>
          {activeItem?.type === 'menu' && activeItem.data && (
            <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-blue-400 bg-white shadow-xl">
              {(() => {
                const Icon = menuIcons[activeItem.data.id] || HelpCircle
                return (
                  <>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium text-slate-800">{activeItem.data.label}</span>
                  </>
                )
              })()}
            </div>
          )}
          {activeItem?.type === 'category' && activeItem.data && (
            <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-blue-400 bg-white shadow-xl">
              {(() => {
                const Icon = categoryIcons[(activeItem.data as MenuCategorySetting).icon] || FolderOpen
                return (
                  <>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-100 text-blue-600">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-semibold text-slate-800">{(activeItem.data as MenuCategorySetting).label}</span>
                  </>
                )
              })()}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* 액션 버튼 */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button
          onClick={handleReset}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
          기본값으로 초기화
        </button>

        <div className="flex items-center gap-3">
          {hasChanges && (
            <button
              onClick={handleCancel}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              취소
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all ${
              hasChanges
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            } disabled:opacity-50`}
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                저장 중...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                설정 저장
              </>
            )}
          </button>
        </div>
      </div>

      {/* 카테고리 편집/추가 모달 */}
      {(editingCategory || isNewCategory) && (
        <EditCategoryModal
          category={editingCategory}
          isNew={isNewCategory}
          onSave={handleSaveCategory}
          onClose={() => { setEditingCategory(null); setIsNewCategory(false); }}
        />
      )}
    </div>
  )
}
