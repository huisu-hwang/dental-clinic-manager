'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  DragOverEvent,
  useDroppable,
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
  Eye,
  EyeOff,
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
  ArrowRightLeft,
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

// 카테고리 아이콘 매핑 (확장)
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

// 드래그 가능한 카테고리 아이템
interface SortableCategoryItemProps {
  category: MenuCategorySetting
  index: number
  totalCount: number
  onMoveUp: () => void
  onMoveDown: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleVisibility: () => void
  isSelected: boolean
  onSelect: () => void
}

function SortableCategoryItem({
  category,
  index,
  totalCount,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  onToggleVisibility,
  isSelected,
  onSelect,
}: SortableCategoryItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `cat-${category.id}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const CategoryIcon = categoryIcons[category.icon] || FolderOpen

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`
        flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer transition-all
        ${isSelected
          ? 'border-blue-500 bg-blue-50'
          : category.visible
            ? 'border-slate-200 bg-white hover:border-slate-300'
            : 'border-slate-100 bg-slate-50 opacity-60'}
        ${isDragging ? 'shadow-lg ring-2 ring-blue-400' : ''}
      `}
    >
      {/* 드래그 핸들 */}
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* 아이콘 */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${category.visible ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-400'}`}>
        <CategoryIcon className="w-4 h-4" />
      </div>

      {/* 이름 */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${category.visible ? 'text-slate-800' : 'text-slate-500'}`}>
          {category.label}
        </p>
        {category.isCustom && (
          <span className="text-xs text-blue-500">커스텀</span>
        )}
      </div>

      {/* 버튼들 */}
      <div className="flex items-center gap-0.5">
        {/* 위로 */}
        <button
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
          disabled={index === 0}
          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
          title="위로 이동"
        >
          <ChevronUp className="w-4 h-4" />
        </button>

        {/* 아래로 */}
        <button
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
          disabled={index === totalCount - 1}
          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
          title="아래로 이동"
        >
          <ChevronDown className="w-4 h-4" />
        </button>

        {/* 편집 */}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
          title="편집"
        >
          <Pencil className="w-4 h-4" />
        </button>

        {/* 표시/숨김 */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
          className={`p-1 rounded ${category.visible ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-100'}`}
          title={category.visible ? '숨기기' : '표시하기'}
        >
          {category.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>

        {/* 삭제 (커스텀만) */}
        {category.isCustom && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="삭제"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}

// 드래그 가능한 메뉴 아이템
interface SortableMenuItemProps {
  item: MenuItemSetting
  index: number
  totalCount: number
  categories: MenuCategorySetting[]
  onMoveUp: () => void
  onMoveDown: () => void
  onToggleVisibility: () => void
  onChangeCategory: (categoryId: string | undefined) => void
}

function SortableMenuItem({
  item,
  index,
  totalCount,
  categories,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
  onChangeCategory,
}: SortableMenuItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const Icon = menuIcons[item.id] || HelpCircle
  const currentCategory = categories.find(c => c.id === item.categoryId)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-2 p-2.5 rounded-lg border-2 transition-all
        ${item.visible ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}
        ${isDragging ? 'shadow-lg ring-2 ring-blue-400' : ''}
      `}
    >
      {/* 드래그 핸들 */}
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* 아이콘 */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${item.visible ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
        <Icon className="w-4 h-4" />
      </div>

      {/* 이름 */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${item.visible ? 'text-slate-800' : 'text-slate-500'}`}>
          {item.label}
        </p>
        {currentCategory && (
          <span className="text-xs text-slate-400">{currentCategory.label}</span>
        )}
      </div>

      {/* 카테고리 변경 */}
      <select
        value={item.categoryId || ''}
        onChange={(e) => onChangeCategory(e.target.value || undefined)}
        className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[80px]"
        onClick={(e) => e.stopPropagation()}
      >
        <option value="">없음</option>
        {categories.filter(c => c.visible).map(cat => (
          <option key={cat.id} value={cat.id}>{cat.label}</option>
        ))}
      </select>

      {/* 버튼들 */}
      <div className="flex items-center gap-0.5">
        {/* 위로 */}
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
          title="위로 이동"
        >
          <ChevronUp className="w-4 h-4" />
        </button>

        {/* 아래로 */}
        <button
          onClick={onMoveDown}
          disabled={index === totalCount - 1}
          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
          title="아래로 이동"
        >
          <ChevronDown className="w-4 h-4" />
        </button>

        {/* 표시/숨김 토글 */}
        <button
          onClick={onToggleVisibility}
          className={`
            relative inline-flex h-6 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
            transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
            ${item.visible ? 'bg-blue-600' : 'bg-slate-300'}
          `}
        >
          <span
            className={`
              pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
              transition duration-200 ease-in-out flex items-center justify-center
              ${item.visible ? 'translate-x-4' : 'translate-x-0'}
            `}
          >
            {item.visible ? (
              <Eye className="w-3 h-3 text-blue-600" />
            ) : (
              <EyeOff className="w-3 h-3 text-slate-400" />
            )}
          </span>
        </button>
      </div>
    </div>
  )
}

// 드롭 영역 (카테고리 내)
interface CategoryDropZoneProps {
  categoryId: string
  categoryLabel: string
  menuItems: MenuItemSetting[]
  categories: MenuCategorySetting[]
  onMoveUp: (menuId: string) => void
  onMoveDown: (menuId: string) => void
  onToggleVisibility: (menuId: string) => void
  onChangeCategory: (menuId: string, categoryId: string | undefined) => void
}

function CategoryDropZone({
  categoryId,
  categoryLabel,
  menuItems,
  categories,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
  onChangeCategory,
}: CategoryDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${categoryId}`,
    data: { type: 'category', categoryId }
  })

  const CategoryIcon = categoryIcons[categories.find(c => c.id === categoryId)?.icon || 'FolderOpen'] || FolderOpen

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-2 border-dashed p-3 transition-all ${
        isOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50/50'
      }`}
    >
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-200">
        <CategoryIcon className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-600">{categoryLabel}</span>
        <span className="text-xs text-slate-400">({menuItems.length})</span>
      </div>

      {menuItems.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-4">
          {isOver ? '여기에 놓으세요' : '메뉴를 드래그해서 추가하세요'}
        </p>
      ) : (
        <div className="space-y-2">
          <SortableContext items={menuItems.map(m => m.id)} strategy={verticalListSortingStrategy}>
            {menuItems.map((item, idx) => (
              <SortableMenuItem
                key={item.id}
                item={item}
                index={idx}
                totalCount={menuItems.length}
                categories={categories}
                onMoveUp={() => onMoveUp(item.id)}
                onMoveDown={() => onMoveDown(item.id)}
                onToggleVisibility={() => onToggleVisibility(item.id)}
                onChangeCategory={(catId) => onChangeCategory(item.id, catId)}
              />
            ))}
          </SortableContext>
        </div>
      )}
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

        {/* 이름 입력 */}
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

        {/* 아이콘 선택 */}
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

        {/* 버튼 */}
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
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  // DnD 센서 설정
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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

  // === 카테고리 관련 핸들러 ===

  // 카테고리 순서 위로 이동
  const moveCategoryUp = (index: number) => {
    if (index === 0) return
    setCategories(prev => {
      const newCats = [...prev]
      ;[newCats[index - 1], newCats[index]] = [newCats[index], newCats[index - 1]]
      return newCats.map((c, i) => ({ ...c, order: i }))
    })
    setSuccess('')
  }

  // 카테고리 순서 아래로 이동
  const moveCategoryDown = (index: number) => {
    if (index === categories.length - 1) return
    setCategories(prev => {
      const newCats = [...prev]
      ;[newCats[index], newCats[index + 1]] = [newCats[index + 1], newCats[index]]
      return newCats.map((c, i) => ({ ...c, order: i }))
    })
    setSuccess('')
  }

  // 카테고리 표시/숨김 토글
  const toggleCategoryVisibility = (categoryId: string) => {
    setCategories(prev => prev.map(c =>
      c.id === categoryId ? { ...c, visible: !c.visible } : c
    ))
    setSuccess('')
  }

  // 카테고리 삭제
  const deleteCategory = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId)
    if (!category?.isCustom) return

    if (!confirm(`"${category.label}" 카테고리를 삭제하시겠습니까?\n\n해당 카테고리에 속한 메뉴는 '없음' 상태가 됩니다.`)) return

    // 해당 카테고리의 메뉴들 카테고리 해제
    setMenuItems(prev => prev.map(m =>
      m.categoryId === categoryId ? { ...m, categoryId: undefined } : m
    ))

    // 카테고리 삭제
    setCategories(prev => prev.filter(c => c.id !== categoryId).map((c, i) => ({ ...c, order: i })))

    if (selectedCategoryId === categoryId) {
      setSelectedCategoryId(null)
    }
    setSuccess('')
  }

  // 카테고리 저장 (편집/추가)
  const handleSaveCategory = (updated: MenuCategorySetting) => {
    if (isNewCategory) {
      // 새 카테고리 추가
      setCategories(prev => {
        const maxOrder = Math.max(...prev.map(c => c.order), -1)
        return [...prev, { ...updated, order: maxOrder + 1 }]
      })
    } else {
      // 기존 카테고리 업데이트
      setCategories(prev => prev.map(c => c.id === updated.id ? updated : c))
    }
    setSuccess('')
  }

  // 새 카테고리 추가 모달 열기
  const openNewCategoryModal = () => {
    setEditingCategory(null)
    setIsNewCategory(true)
  }

  // === 메뉴 관련 핸들러 ===

  // 메뉴 표시/숨김 토글
  const toggleMenuVisibility = (menuId: string) => {
    setMenuItems(prev => prev.map(m =>
      m.id === menuId ? { ...m, visible: !m.visible } : m
    ))
    setSuccess('')
  }

  // 메뉴 카테고리 변경
  const changeMenuCategory = (menuId: string, categoryId: string | undefined) => {
    setMenuItems(prev => prev.map(m =>
      m.id === menuId ? { ...m, categoryId } : m
    ))
    setSuccess('')
  }

  // 메뉴 순서 위로 이동
  const moveMenuUp = (menuId: string) => {
    setMenuItems(prev => {
      const idx = prev.findIndex(m => m.id === menuId)
      if (idx <= 0) return prev
      const newItems = [...prev]
      ;[newItems[idx - 1], newItems[idx]] = [newItems[idx], newItems[idx - 1]]
      return newItems.map((m, i) => ({ ...m, order: i }))
    })
    setSuccess('')
  }

  // 메뉴 순서 아래로 이동
  const moveMenuDown = (menuId: string) => {
    setMenuItems(prev => {
      const idx = prev.findIndex(m => m.id === menuId)
      if (idx === -1 || idx === prev.length - 1) return prev
      const newItems = [...prev]
      ;[newItems[idx], newItems[idx + 1]] = [newItems[idx + 1], newItems[idx]]
      return newItems.map((m, i) => ({ ...m, order: i }))
    })
    setSuccess('')
  }

  // === DnD 핸들러 ===

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // 카테고리 드래그
    if (activeId.startsWith('cat-') && overId.startsWith('cat-')) {
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

    // 메뉴 드래그 (드롭 영역으로)
    if (overId.startsWith('drop-')) {
      const targetCategoryId = overId.replace('drop-', '')
      const catId = targetCategoryId === 'none' ? undefined : targetCategoryId

      setMenuItems(prev => prev.map(m =>
        m.id === activeId ? { ...m, categoryId: catId } : m
      ))
      setSuccess('')
      return
    }

    // 메뉴 간 순서 변경
    if (!activeId.startsWith('cat-') && !overId.startsWith('cat-')) {
      const activeIdx = menuItems.findIndex(m => m.id === activeId)
      const overIdx = menuItems.findIndex(m => m.id === overId)

      if (activeIdx !== -1 && overIdx !== -1 && activeIdx !== overIdx) {
        setMenuItems(prev => {
          const newItems = arrayMove(prev, activeIdx, overIdx)
          return newItems.map((m, i) => ({ ...m, order: i }))
        })
        setSuccess('')
      }
    }
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // 메뉴를 드롭 영역으로 이동
    if (!activeId.startsWith('cat-') && overId.startsWith('drop-')) {
      const targetCategoryId = overId.replace('drop-', '')
      const catId = targetCategoryId === 'none' ? undefined : targetCategoryId
      const currentItem = menuItems.find(m => m.id === activeId)

      if (currentItem && currentItem.categoryId !== catId) {
        setMenuItems(prev => prev.map(m =>
          m.id === activeId ? { ...m, categoryId: catId } : m
        ))
      }
    }
  }

  // === 저장/초기화 ===

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
      setSelectedCategoryId(null)
      setSuccess('메뉴 설정이 초기화되었습니다.')
    } else {
      setError(result.error || '메뉴 설정 초기화에 실패했습니다.')
    }

    setSaving(false)
  }

  const handleCancel = () => {
    setMenuItems([...originalMenuItems])
    setCategories([...originalCategories])
    setSelectedCategoryId(null)
    setSuccess('')
    setError('')
  }

  // 카테고리별 메뉴 필터링
  const getMenusByCategory = (categoryId: string | undefined) => {
    return menuItems
      .filter(m => m.categoryId === categoryId)
      .sort((a, b) => a.order - b.order)
  }

  // 드래그 중인 아이템 찾기
  const activeItem = activeId && !activeId.startsWith('cat-')
    ? menuItems.find(m => m.id === activeId)
    : null
  const activeCategory = activeId?.startsWith('cat-')
    ? categories.find(c => `cat-${c.id}` === activeId)
    : null

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

  return (
    <div className="space-y-6">
      {/* 상단 안내 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Settings className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h4 className="font-semibold text-blue-800 mb-1">나만의 메뉴 설정</h4>
            <ul className="text-sm text-blue-700 space-y-0.5">
              <li>• 좌측에서 카테고리를 추가/편집/삭제하고 순서를 변경하세요</li>
              <li>• 우측에서 메뉴의 표시 여부와 순서, 카테고리를 설정하세요</li>
              <li>• 드래그 또는 화살표 버튼으로 순서를 변경할 수 있습니다</li>
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

      {/* 메인 콘텐츠 - 좌우 분할 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 좌측: 카테고리 편집 */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderPlus className="w-5 h-5 text-slate-600" />
                  <h3 className="font-semibold text-slate-800">카테고리 관리</h3>
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

            <div className="p-4 space-y-2 max-h-[500px] overflow-y-auto">
              <SortableContext
                items={categories.map(c => `cat-${c.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {categories.map((category, index) => (
                  <SortableCategoryItem
                    key={category.id}
                    category={category}
                    index={index}
                    totalCount={categories.length}
                    onMoveUp={() => moveCategoryUp(index)}
                    onMoveDown={() => moveCategoryDown(index)}
                    onEdit={() => { setEditingCategory(category); setIsNewCategory(false); }}
                    onDelete={() => deleteCategory(category.id)}
                    onToggleVisibility={() => toggleCategoryVisibility(category.id)}
                    isSelected={selectedCategoryId === category.id}
                    onSelect={() => setSelectedCategoryId(
                      selectedCategoryId === category.id ? null : category.id
                    )}
                  />
                ))}
              </SortableContext>
            </div>
          </div>

          {/* 우측: 메뉴 편집 */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-slate-600" />
                <h3 className="font-semibold text-slate-800">메뉴 설정</h3>
              </div>
            </div>

            <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
              {/* 카테고리 없는 메뉴 (고정 메뉴) */}
              <CategoryDropZone
                categoryId="none"
                categoryLabel="고정 메뉴 (카테고리 없음)"
                menuItems={getMenusByCategory(undefined)}
                categories={categories}
                onMoveUp={moveMenuUp}
                onMoveDown={moveMenuDown}
                onToggleVisibility={toggleMenuVisibility}
                onChangeCategory={changeMenuCategory}
              />

              {/* 각 카테고리별 메뉴 */}
              {categories.filter(c => c.visible).map(category => (
                <CategoryDropZone
                  key={category.id}
                  categoryId={category.id}
                  categoryLabel={category.label}
                  menuItems={getMenusByCategory(category.id)}
                  categories={categories}
                  onMoveUp={moveMenuUp}
                  onMoveDown={moveMenuDown}
                  onToggleVisibility={toggleMenuVisibility}
                  onChangeCategory={changeMenuCategory}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 드래그 오버레이 */}
        <DragOverlay>
          {activeItem && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg border-2 border-blue-400 bg-white shadow-xl">
              <GripVertical className="w-4 h-4 text-slate-400" />
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600">
                {(() => {
                  const Icon = menuIcons[activeItem.id] || HelpCircle
                  return <Icon className="w-4 h-4" />
                })()}
              </div>
              <span className="text-sm font-medium text-slate-800">{activeItem.label}</span>
            </div>
          )}
          {activeCategory && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg border-2 border-blue-400 bg-white shadow-xl">
              <GripVertical className="w-4 h-4 text-slate-400" />
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-100 text-blue-600">
                {(() => {
                  const Icon = categoryIcons[activeCategory.icon] || FolderOpen
                  return <Icon className="w-4 h-4" />
                })()}
              </div>
              <span className="text-sm font-medium text-slate-800">{activeCategory.label}</span>
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
