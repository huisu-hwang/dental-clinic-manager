'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Save,
  X,
  Check,
  AlertCircle,
  Smartphone,
  Monitor,
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
} from 'lucide-react'
import type { MenuItemSetting, MenuCategorySetting } from '@/types/menuSettings'
import { DEFAULT_MENU_ITEMS, DEFAULT_CATEGORIES, AVAILABLE_CATEGORY_ICONS } from '@/types/menuSettings'
import { getMenuSettings, saveMenuSettings, resetMenuSettings, clearMenuSettingsCache } from '@/lib/menuSettingsService'

interface MenuSettingsProps {
  clinicId: string
}

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
  'Star': Star
}

// 드래그 가능한 메뉴 아이템 컴포넌트
interface SortableMenuItemProps {
  item: MenuItemSetting
  onToggleVisibility: (id: string) => void
  isDragging?: boolean
}

function SortableMenuItem({ item, onToggleVisibility, isDragging }: SortableMenuItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.5 : 1,
  }

  const Icon = menuIcons[item.id] || HelpCircle

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-3 px-3 py-2.5 bg-white rounded-lg border
        ${item.visible ? 'border-slate-200' : 'border-slate-100 bg-slate-50'}
        ${isSortableDragging ? 'shadow-lg ring-2 ring-blue-400' : 'shadow-sm'}
        ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}
        hover:shadow-md transition-shadow
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

      {/* 라벨 */}
      <span className={`flex-1 text-sm font-medium ${item.visible ? 'text-slate-700' : 'text-slate-400'}`}>
        {item.label}
      </span>

      {/* 표시/숨김 토글 */}
      <button
        onClick={() => onToggleVisibility(item.id)}
        className={`
          relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
          transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          ${item.visible ? 'bg-blue-600' : 'bg-slate-200'}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
            transition duration-200 ease-in-out
            ${item.visible ? 'translate-x-5' : 'translate-x-0'}
          `}
        >
          {item.visible ? (
            <Eye className="w-3 h-3 text-blue-600 absolute top-1 left-1" />
          ) : (
            <EyeOff className="w-3 h-3 text-slate-400 absolute top-1 left-1" />
          )}
        </span>
      </button>
    </div>
  )
}

// 드래그 오버레이용 메뉴 아이템
function DragOverlayMenuItem({ item }: { item: MenuItemSetting }) {
  const Icon = menuIcons[item.id] || HelpCircle

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-lg border border-blue-400 shadow-xl ring-2 ring-blue-400 cursor-grabbing">
      <div className="flex-shrink-0 p-1 text-slate-400">
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600">
        <Icon className="w-4 h-4" />
      </div>
      <span className="flex-1 text-sm font-medium text-slate-700">{item.label}</span>
    </div>
  )
}

// 카테고리 드롭존 컴포넌트
interface CategoryDropzoneProps {
  category: MenuCategorySetting
  menuItems: MenuItemSetting[]
  isExpanded: boolean
  onToggleExpand: () => void
  onToggleVisibility: (id: string) => void
  onToggleCategoryVisibility: () => void
  onEditCategory: (category: MenuCategorySetting) => void
  isOver?: boolean
}

function CategoryDropzone({
  category,
  menuItems,
  isExpanded,
  onToggleExpand,
  onToggleVisibility,
  onToggleCategoryVisibility,
  onEditCategory,
  isOver,
}: CategoryDropzoneProps) {
  const { setNodeRef, isOver: dropIsOver } = useDroppable({
    id: `category-${category.id}`,
    data: { type: 'category', categoryId: category.id }
  })

  const CategoryIcon = categoryIcons[category.icon] || Briefcase
  const visibleCount = menuItems.filter(m => m.visible).length

  return (
    <div
      ref={setNodeRef}
      className={`
        rounded-xl border-2 overflow-hidden transition-all duration-200
        ${category.visible ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'}
        ${dropIsOver || isOver ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200' : ''}
      `}
    >
      {/* 카테고리 헤더 */}
      <div className={`flex items-center gap-3 px-4 py-3 ${category.visible ? 'bg-slate-50' : 'bg-slate-100'}`}>
        {/* 확장/축소 버튼 */}
        <button
          onClick={onToggleExpand}
          className="flex-shrink-0 p-1 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {/* 카테고리 아이콘 */}
        <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${category.visible ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-400'}`}>
          <CategoryIcon className="w-5 h-5" />
        </div>

        {/* 카테고리 이름 */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold ${category.visible ? 'text-slate-800' : 'text-slate-500'}`}>
              {category.label}
            </h3>
            <button
              onClick={() => onEditCategory(category)}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-slate-500">
            {visibleCount} / {menuItems.length} 메뉴 표시
          </p>
        </div>

        {/* 카테고리 표시/숨김 토글 */}
        <button
          onClick={onToggleCategoryVisibility}
          className={`
            relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
            transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            ${category.visible ? 'bg-blue-600' : 'bg-slate-300'}
          `}
        >
          <span
            className={`
              pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
              transition duration-200 ease-in-out
              ${category.visible ? 'translate-x-5' : 'translate-x-0'}
            `}
          />
        </button>
      </div>

      {/* 메뉴 아이템 목록 */}
      {isExpanded && (
        <div className="p-3 space-y-2">
          {menuItems.length === 0 ? (
            <div className={`text-center py-6 text-sm border-2 border-dashed rounded-lg ${dropIsOver ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400'}`}>
              {dropIsOver ? '여기에 놓으세요' : '메뉴를 드래그해서 추가하세요'}
            </div>
          ) : (
            <SortableContext items={menuItems.map(m => m.id)} strategy={verticalListSortingStrategy}>
              {menuItems.map((item) => (
                <SortableMenuItem
                  key={item.id}
                  item={item}
                  onToggleVisibility={onToggleVisibility}
                />
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  )
}

// 고정 메뉴 섹션
interface FixedMenuSectionProps {
  menuItems: MenuItemSetting[]
  onToggleVisibility: (id: string) => void
}

function FixedMenuSection({ menuItems, onToggleVisibility }: FixedMenuSectionProps) {
  return (
    <div className="rounded-xl border-2 border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-slate-100 to-slate-50">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-slate-200 text-slate-600">
          <Home className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-800">고정 메뉴</h3>
          <p className="text-xs text-slate-500">항상 표시되는 메뉴입니다</p>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {menuItems.map((item) => {
          const Icon = menuIcons[item.id] || HelpCircle
          return (
            <div
              key={item.id}
              className={`
                flex items-center gap-3 px-3 py-2.5 bg-white rounded-lg border
                ${item.visible ? 'border-slate-200' : 'border-slate-100 bg-slate-50'}
                shadow-sm
              `}
            >
              {/* 고정 아이콘 (드래그 불가) */}
              <div className="flex-shrink-0 p-1 text-slate-300">
                <div className="w-4 h-4" />
              </div>

              {/* 아이콘 */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${item.visible ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                <Icon className="w-4 h-4" />
              </div>

              {/* 라벨 */}
              <span className={`flex-1 text-sm font-medium ${item.visible ? 'text-slate-700' : 'text-slate-400'}`}>
                {item.label}
              </span>

              {/* 표시/숨김 토글 */}
              <button
                onClick={() => onToggleVisibility(item.id)}
                className={`
                  relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                  transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                  ${item.visible ? 'bg-blue-600' : 'bg-slate-200'}
                `}
              >
                <span
                  className={`
                    pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                    transition duration-200 ease-in-out
                    ${item.visible ? 'translate-x-5' : 'translate-x-0'}
                  `}
                >
                  {item.visible ? (
                    <Eye className="w-3 h-3 text-blue-600 absolute top-1 left-1" />
                  ) : (
                    <EyeOff className="w-3 h-3 text-slate-400 absolute top-1 left-1" />
                  )}
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// 미리보기 사이드바 컴포넌트
interface PreviewSidebarProps {
  menuItems: MenuItemSetting[]
  categories: MenuCategorySetting[]
  previewMode: 'desktop' | 'mobile'
}

function PreviewSidebar({ menuItems, categories, previewMode }: PreviewSidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(categories.filter(c => c.visible).map(c => c.id))
  )

  useEffect(() => {
    setExpandedCategories(new Set(categories.filter(c => c.visible).map(c => c.id)))
  }, [categories])

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

  const visibleCategories = categories.filter(c => c.visible).sort((a, b) => a.order - b.order)
  const fixedMenus = menuItems.filter(m => !m.categoryId && m.visible).sort((a, b) => a.order - b.order)
  const homeMenu = fixedMenus.find(m => m.id === 'home')
  const bulletinMenu = fixedMenus.find(m => m.id === 'bulletin')
  const guideMenu = fixedMenus.find(m => m.id === 'guide')

  const getMenusForCategory = (categoryId: string) => {
    return menuItems
      .filter(m => m.categoryId === categoryId && m.visible)
      .sort((a, b) => a.order - b.order)
  }

  return (
    <div className={`bg-white rounded-xl shadow-inner border border-slate-200 overflow-hidden ${previewMode === 'mobile' ? 'w-56' : 'w-full'}`}>
      {/* 미리보기 헤더 */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-white/20 rounded flex items-center justify-center">
            <Building2 className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-medium text-white">미리보기</span>
        </div>
      </div>

      {/* 메뉴 목록 */}
      <div className="p-2 space-y-1 max-h-[400px] overflow-y-auto">
        {/* 홈 */}
        {homeMenu && (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium">
            <Home className="w-4 h-4" />
            <span>{homeMenu.label}</span>
          </div>
        )}

        {/* 게시판 */}
        {bulletinMenu && (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-slate-600 hover:bg-slate-50 text-sm">
            <Megaphone className="w-4 h-4 text-slate-400" />
            <span>{bulletinMenu.label}</span>
          </div>
        )}

        {/* 구분선 */}
        {(homeMenu || bulletinMenu) && visibleCategories.length > 0 && (
          <div className="py-1">
            <div className="h-px bg-slate-200" />
          </div>
        )}

        {/* 카테고리들 */}
        {visibleCategories.map(category => {
          const categoryMenus = getMenusForCategory(category.id)
          if (categoryMenus.length === 0) return null

          const isExpanded = expandedCategories.has(category.id)
          const CategoryIcon = categoryIcons[category.icon] || Briefcase

          return (
            <div key={category.id} className="space-y-0.5">
              <button
                onClick={() => toggleCategory(category.id)}
                className="flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <CategoryIcon className="w-4 h-4" />
                  <span>{category.label}</span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {isExpanded && (
                <div className="pl-3 space-y-0.5">
                  {categoryMenus.map(menu => {
                    const MenuIcon = menuIcons[menu.id] || HelpCircle
                    return (
                      <div
                        key={menu.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-500 hover:bg-slate-50 text-[13px]"
                      >
                        <MenuIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span>{menu.label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* 사용 안내 */}
        {guideMenu && (
          <>
            <div className="py-1">
              <div className="h-px bg-slate-200" />
            </div>
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-slate-500 hover:bg-slate-50 text-sm">
              <HelpCircle className="w-4 h-4 text-slate-400" />
              <span>{guideMenu.label}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// 카테고리 편집 모달
interface EditCategoryModalProps {
  category: MenuCategorySetting
  onSave: (updated: MenuCategorySetting) => void
  onClose: () => void
}

function EditCategoryModal({ category, onSave, onClose }: EditCategoryModalProps) {
  const [label, setLabel] = useState(category.label)
  const [icon, setIcon] = useState(category.icon)

  const handleSave = () => {
    onSave({ ...category, label: label.trim(), icon })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
        <h3 className="text-lg font-bold text-slate-800 mb-4">카테고리 편집</h3>

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
            placeholder="카테고리 이름"
          />
        </div>

        {/* 아이콘 선택 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            아이콘 선택
          </label>
          <div className="grid grid-cols-6 gap-2">
            {AVAILABLE_CATEGORY_ICONS.map((iconName) => {
              const IconComponent = categoryIcons[iconName]
              if (!IconComponent) return null
              return (
                <button
                  key={iconName}
                  onClick={() => setIcon(iconName)}
                  className={`p-2.5 rounded-lg border-2 transition-all ${
                    icon === iconName
                      ? 'border-blue-500 bg-blue-50 text-blue-600'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <IconComponent className="w-5 h-5" />
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
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

// 드래그 가능한 카테고리 컴포넌트
interface SortableCategoryProps {
  category: MenuCategorySetting
  menuItems: MenuItemSetting[]
  isExpanded: boolean
  onToggleExpand: () => void
  onToggleVisibility: (id: string) => void
  onToggleCategoryVisibility: () => void
  onEditCategory: (category: MenuCategorySetting) => void
}

function SortableCategory({
  category,
  menuItems,
  isExpanded,
  onToggleExpand,
  onToggleVisibility,
  onToggleCategoryVisibility,
  onEditCategory,
}: SortableCategoryProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `cat-${category.id}` })

  const { isOver } = useDroppable({
    id: `category-${category.id}`,
    data: { type: 'category', categoryId: category.id }
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const CategoryIcon = categoryIcons[category.icon] || Briefcase
  const visibleCount = menuItems.filter(m => m.visible).length

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        rounded-xl border-2 overflow-hidden transition-all duration-200
        ${category.visible ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'}
        ${isOver ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200' : ''}
        ${isDragging ? 'shadow-xl ring-2 ring-blue-400' : ''}
      `}
    >
      {/* 카테고리 헤더 */}
      <div className={`flex items-center gap-2 px-3 py-3 ${category.visible ? 'bg-slate-50' : 'bg-slate-100'}`}>
        {/* 드래그 핸들 */}
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {/* 확장/축소 버튼 */}
        <button
          onClick={onToggleExpand}
          className="flex-shrink-0 p-1 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {/* 카테고리 아이콘 */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${category.visible ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-400'}`}>
          <CategoryIcon className="w-4 h-4" />
        </div>

        {/* 카테고리 이름 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className={`font-semibold text-sm truncate ${category.visible ? 'text-slate-800' : 'text-slate-500'}`}>
              {category.label}
            </h3>
            <button
              onClick={() => onEditCategory(category)}
              className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs text-slate-500">
            {visibleCount} / {menuItems.length} 표시
          </p>
        </div>

        {/* 카테고리 표시/숨김 토글 */}
        <button
          onClick={onToggleCategoryVisibility}
          className={`
            relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
            transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
            ${category.visible ? 'bg-blue-600' : 'bg-slate-300'}
          `}
        >
          <span
            className={`
              pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0
              transition duration-200 ease-in-out
              ${category.visible ? 'translate-x-4' : 'translate-x-0'}
            `}
          />
        </button>
      </div>

      {/* 메뉴 아이템 목록 */}
      {isExpanded && (
        <div className="p-2 space-y-1.5">
          {menuItems.length === 0 ? (
            <div className={`text-center py-4 text-sm border-2 border-dashed rounded-lg ${isOver ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400'}`}>
              {isOver ? '여기에 놓으세요' : '메뉴를 드래그해서 추가하세요'}
            </div>
          ) : (
            <SortableContext items={menuItems.map(m => m.id)} strategy={verticalListSortingStrategy}>
              {menuItems.map((item) => (
                <SortableMenuItem
                  key={item.id}
                  item={item}
                  onToggleVisibility={onToggleVisibility}
                />
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  )
}

// 메인 컴포넌트
export default function MenuSettings({ clinicId }: MenuSettingsProps) {
  const [menuItems, setMenuItems] = useState<MenuItemSetting[]>([])
  const [categories, setCategories] = useState<MenuCategorySetting[]>([])
  const [originalMenuItems, setOriginalMenuItems] = useState<MenuItemSetting[]>([])
  const [originalCategories, setOriginalCategories] = useState<MenuCategorySetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<MenuCategorySetting | null>(null)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')

  // DnD 센서 설정
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // 메뉴 설정 로드
  const loadMenuSettings = useCallback(async () => {
    setLoading(true)
    setError('')

    const result = await getMenuSettings(clinicId, false)

    if (result.success && result.data) {
      const sortedMenuItems = [...result.data].sort((a, b) => a.order - b.order)
      setMenuItems(sortedMenuItems)
      setOriginalMenuItems(sortedMenuItems)

      if (result.categories) {
        const sortedCategories = [...result.categories].sort((a, b) => a.order - b.order)
        setCategories(sortedCategories)
        setOriginalCategories(sortedCategories)
        setExpandedCategories(new Set(sortedCategories.map(c => c.id)))
      }
    } else {
      setError(result.error || '메뉴 설정을 불러오는데 실패했습니다.')
    }

    setLoading(false)
  }, [clinicId])

  useEffect(() => {
    loadMenuSettings()
  }, [loadMenuSettings])

  // 변경 사항 체크
  useEffect(() => {
    const menuChanged = JSON.stringify(menuItems) !== JSON.stringify(originalMenuItems)
    const categoryChanged = JSON.stringify(categories) !== JSON.stringify(originalCategories)
    setHasChanges(menuChanged || categoryChanged)
  }, [menuItems, originalMenuItems, categories, originalCategories])

  // 메뉴 표시 여부 토글
  const toggleMenuVisibility = (menuId: string) => {
    setMenuItems(prev =>
      prev.map(item =>
        item.id === menuId ? { ...item, visible: !item.visible } : item
      )
    )
    setSuccess('')
  }

  // 카테고리 표시 여부 토글
  const toggleCategoryVisibility = (categoryId: string) => {
    setCategories(prev =>
      prev.map(cat =>
        cat.id === categoryId ? { ...cat, visible: !cat.visible } : cat
      )
    )
    setSuccess('')
  }

  // 카테고리 확장/축소 토글
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

  // 카테고리 저장
  const handleSaveCategory = (updated: MenuCategorySetting) => {
    setCategories(prev =>
      prev.map(cat => cat.id === updated.id ? updated : cat)
    )
    setSuccess('')
  }

  // 카테고리별 메뉴 가져오기
  const getMenusByCategory = (categoryId: string) => {
    return menuItems
      .filter(item => item.categoryId === categoryId)
      .sort((a, b) => a.order - b.order)
  }

  // 고정 메뉴 가져오기 (카테고리 없는 메뉴)
  const getFixedMenus = () => {
    return menuItems
      .filter(item => !item.categoryId)
      .sort((a, b) => a.order - b.order)
  }

  // 드래그 시작
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  // 드래그 종료
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // 카테고리 간 이동인지 확인
    if (overId.startsWith('category-')) {
      const targetCategoryId = overId.replace('category-', '')

      // 메뉴 아이템의 카테고리 변경
      setMenuItems(prev =>
        prev.map(item =>
          item.id === activeId
            ? { ...item, categoryId: targetCategoryId }
            : item
        )
      )
      setSuccess('')
      return
    }

    // 카테고리 정렬인지 확인
    if (activeId.startsWith('cat-') && overId.startsWith('cat-')) {
      const activeIdx = categories.findIndex(c => `cat-${c.id}` === activeId)
      const overIdx = categories.findIndex(c => `cat-${c.id}` === overId)

      if (activeIdx !== -1 && overIdx !== -1 && activeIdx !== overIdx) {
        setCategories(prev => {
          const newCategories = arrayMove(prev, activeIdx, overIdx)
          return newCategories.map((cat, idx) => ({ ...cat, order: idx }))
        })
        setSuccess('')
      }
      return
    }

    // 같은 카테고리 내 메뉴 정렬
    if (activeId !== overId) {
      setMenuItems(prev => {
        const activeItem = prev.find(item => item.id === activeId)
        const overItem = prev.find(item => item.id === overId)

        if (!activeItem || !overItem) return prev

        // 같은 카테고리 내에서만 정렬
        if (activeItem.categoryId === overItem.categoryId) {
          const categoryItems = prev.filter(item => item.categoryId === activeItem.categoryId)
          const otherItems = prev.filter(item => item.categoryId !== activeItem.categoryId)

          const activeIdx = categoryItems.findIndex(item => item.id === activeId)
          const overIdx = categoryItems.findIndex(item => item.id === overId)

          if (activeIdx !== -1 && overIdx !== -1) {
            const reorderedCategoryItems = arrayMove(categoryItems, activeIdx, overIdx)
              .map((item, idx) => ({ ...item, order: idx }))
            return [...otherItems, ...reorderedCategoryItems]
          }
        } else {
          // 다른 카테고리로 이동
          return prev.map(item =>
            item.id === activeId
              ? { ...item, categoryId: overItem.categoryId }
              : item
          )
        }

        return prev
      })
      setSuccess('')
    }
  }

  // 드래그 오버
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // 카테고리 위에 드래그 중인 경우
    if (overId.startsWith('category-') && !activeId.startsWith('cat-')) {
      const targetCategoryId = overId.replace('category-', '')
      const activeItem = menuItems.find(item => item.id === activeId)

      if (activeItem && activeItem.categoryId !== targetCategoryId) {
        setMenuItems(prev =>
          prev.map(item =>
            item.id === activeId
              ? { ...item, categoryId: targetCategoryId }
              : item
          )
        )
      }
    }
  }

  // 저장
  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    const result = await saveMenuSettings(clinicId, menuItems, categories)

    if (result.success) {
      setOriginalMenuItems([...menuItems])
      setOriginalCategories([...categories])
      setSuccess('메뉴 설정이 저장되었습니다.')
      clearMenuSettingsCache(clinicId)
    } else {
      setError(result.error || '메뉴 설정 저장에 실패했습니다.')
    }

    setSaving(false)
  }

  // 초기화
  const handleReset = async () => {
    if (!confirm('메뉴 설정을 기본값으로 초기화하시겠습니까?\n\n모든 커스텀 설정이 삭제됩니다.')) return

    setSaving(true)
    setError('')
    setSuccess('')

    const result = await resetMenuSettings(clinicId)

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

  // 변경 사항 취소
  const handleCancel = () => {
    setMenuItems([...originalMenuItems])
    setCategories([...originalCategories])
    setExpandedCategories(new Set(originalCategories.map(c => c.id)))
    setSuccess('')
    setError('')
  }

  // 드래그 중인 아이템 찾기
  const activeItem = activeId ? menuItems.find(item => item.id === activeId) : null

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

  return (
    <div className="space-y-6">
      {/* 상단 안내 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Settings className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h4 className="font-semibold text-blue-800 mb-1">메뉴 설정 안내</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• 드래그하여 메뉴와 카테고리의 순서를 변경할 수 있습니다</li>
              <li>• 토글 스위치로 메뉴 표시/숨김을 설정할 수 있습니다</li>
              <li>• 카테고리의 이름과 아이콘을 자유롭게 수정할 수 있습니다</li>
              <li>• 오른쪽 미리보기에서 실시간으로 변경사항을 확인하세요</li>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽: 설정 패널 */}
        <div className="lg:col-span-2 space-y-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
          >
            {/* 고정 메뉴 */}
            <FixedMenuSection
              menuItems={getFixedMenus()}
              onToggleVisibility={toggleMenuVisibility}
            />

            {/* 카테고리별 메뉴 */}
            <SortableContext
              items={categories.map(c => `cat-${c.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {categories.sort((a, b) => a.order - b.order).map((category) => (
                <SortableCategory
                  key={category.id}
                  category={category}
                  menuItems={getMenusByCategory(category.id)}
                  isExpanded={expandedCategories.has(category.id)}
                  onToggleExpand={() => toggleCategoryExpand(category.id)}
                  onToggleVisibility={toggleMenuVisibility}
                  onToggleCategoryVisibility={() => toggleCategoryVisibility(category.id)}
                  onEditCategory={setEditingCategory}
                />
              ))}
            </SortableContext>

            {/* 드래그 오버레이 */}
            <DragOverlay>
              {activeItem && <DragOverlayMenuItem item={activeItem} />}
            </DragOverlay>
          </DndContext>
        </div>

        {/* 오른쪽: 미리보기 */}
        <div className="lg:col-span-1">
          <div className="sticky top-36">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              {/* 미리보기 헤더 */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-700">실시간 미리보기</h3>
                <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-slate-200">
                  <button
                    onClick={() => setPreviewMode('desktop')}
                    className={`p-1.5 rounded ${previewMode === 'desktop' ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <Monitor className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPreviewMode('mobile')}
                    className={`p-1.5 rounded ${previewMode === 'mobile' ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <Smartphone className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 미리보기 사이드바 */}
              <div className={`flex ${previewMode === 'mobile' ? 'justify-center' : ''}`}>
                <PreviewSidebar
                  menuItems={menuItems}
                  categories={categories}
                  previewMode={previewMode}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

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

      {/* 카테고리 편집 모달 */}
      {editingCategory && (
        <EditCategoryModal
          category={editingCategory}
          onSave={handleSaveCategory}
          onClose={() => setEditingCategory(null)}
        />
      )}
    </div>
  )
}
