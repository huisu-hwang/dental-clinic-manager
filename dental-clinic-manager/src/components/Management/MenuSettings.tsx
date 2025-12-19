'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bars3Icon,
  EyeIcon,
  EyeSlashIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline'
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
import type { MenuItemSetting, MenuCategorySetting } from '@/types/menuSettings'
import { DEFAULT_MENU_ITEMS, DEFAULT_CATEGORIES, AVAILABLE_CATEGORY_ICONS } from '@/types/menuSettings'
import { getMenuSettings, saveMenuSettings, resetMenuSettings, clearMenuSettingsCache } from '@/lib/menuSettingsService'

interface MenuSettingsProps {
  clinicId: string
}

type SettingsTab = 'menus' | 'categories'

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

export default function MenuSettings({ clinicId }: MenuSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('menus')
  const [menuItems, setMenuItems] = useState<MenuItemSetting[]>([])
  const [categories, setCategories] = useState<MenuCategorySetting[]>([])
  const [originalMenuItems, setOriginalMenuItems] = useState<MenuItemSetting[]>([])
  const [originalCategories, setOriginalCategories] = useState<MenuCategorySetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

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
  const toggleMenuVisibility = (index: number) => {
    setMenuItems(prev => {
      const newItems = [...prev]
      newItems[index] = { ...newItems[index], visible: !newItems[index].visible }
      return newItems
    })
    setSuccess('')
  }

  // 카테고리 표시 여부 토글
  const toggleCategoryVisibility = (index: number) => {
    setCategories(prev => {
      const newItems = [...prev]
      newItems[index] = { ...newItems[index], visible: !newItems[index].visible }
      return newItems
    })
    setSuccess('')
  }

  // 카테고리 순서 위로 이동
  const moveCategoryUp = (index: number) => {
    if (index === 0) return
    setCategories(prev => {
      const newItems = [...prev]
      const temp = newItems[index - 1]
      newItems[index - 1] = { ...newItems[index], order: index - 1 }
      newItems[index] = { ...temp, order: index }
      return newItems
    })
    setSuccess('')
  }

  // 카테고리 순서 아래로 이동
  const moveCategoryDown = (index: number) => {
    if (index === categories.length - 1) return
    setCategories(prev => {
      const newItems = [...prev]
      const temp = newItems[index + 1]
      newItems[index + 1] = { ...newItems[index], order: index + 1 }
      newItems[index] = { ...temp, order: index }
      return newItems
    })
    setSuccess('')
  }

  // 카테고리 이름 편집 시작
  const startEditingCategory = (categoryId: string, currentLabel: string) => {
    setEditingCategoryId(categoryId)
    setEditingLabel(currentLabel)
  }

  // 카테고리 이름 저장
  const saveEditingCategory = () => {
    if (!editingCategoryId || !editingLabel.trim()) return

    setCategories(prev => prev.map(cat =>
      cat.id === editingCategoryId
        ? { ...cat, label: editingLabel.trim() }
        : cat
    ))
    setEditingCategoryId(null)
    setEditingLabel('')
    setSuccess('')
  }

  // 카테고리 아이콘 변경
  const changeCategoryIcon = (categoryId: string, iconName: string) => {
    setCategories(prev => prev.map(cat =>
      cat.id === categoryId
        ? { ...cat, icon: iconName }
        : cat
    ))
    setSuccess('')
  }

  // 메뉴 카테고리 변경
  const changeMenuCategory = (menuId: string, categoryId: string | undefined) => {
    setMenuItems(prev => prev.map(item =>
      item.id === menuId
        ? { ...item, categoryId }
        : item
    ))
    setSuccess('')
  }

  // 카테고리 확장/접기 토글
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

  // 드래그 핸들러 (카테고리용)
  const handleCategoryDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleCategoryDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    setCategories(prev => {
      const newItems = [...prev]
      const draggedItem = newItems[draggedIndex]
      newItems.splice(draggedIndex, 1)
      newItems.splice(index, 0, draggedItem)
      return newItems.map((item, i) => ({ ...item, order: i }))
    })
    setDraggedIndex(index)
    setSuccess('')
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
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
    if (!confirm('메뉴 설정을 기본값으로 초기화하시겠습니까?')) return

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
    setSuccess('')
    setError('')
  }

  // 카테고리별 메뉴 그룹화
  const getMenusByCategory = (categoryId: string) => {
    return menuItems.filter(item => item.categoryId === categoryId)
  }

  // 카테고리 없는 메뉴 (home, guide)
  const getUncategorizedMenus = () => {
    return menuItems.filter(item => !item.categoryId)
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-slate-600">메뉴 설정을 불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 안내 메시지 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-800 mb-2">메뉴 설정 안내</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>- 카테고리별로 메뉴를 그룹화하여 사이드바를 구성할 수 있습니다.</li>
          <li>- 카테고리의 이름, 아이콘, 순서를 자유롭게 변경할 수 있습니다.</li>
          <li>- 메뉴를 다른 카테고리로 이동하거나 표시/숨김 설정이 가능합니다.</li>
          <li>- 변경 사항은 저장 버튼을 클릭해야 적용됩니다.</li>
        </ul>
      </div>

      {/* 에러/성공 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm flex items-center gap-2">
          <ExclamationTriangleIcon className="h-5 w-5" />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5" />
          {success}
        </div>
      )}

      {/* 탭 네비게이션 */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('menus')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'menus'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            메뉴 구성
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'categories'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            카테고리 설정
          </button>
        </nav>
      </div>

      {/* 메뉴 구성 탭 */}
      {activeTab === 'menus' && (
        <div className="space-y-4">
          {/* 독립 메뉴 (홈, 가이드) */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">고정 메뉴</h3>
              <p className="text-xs text-slate-500 mt-1">카테고리에 속하지 않는 독립 메뉴입니다.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {getUncategorizedMenus().map((item) => {
                const Icon = menuIcons[item.id] || Bars3Icon
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-4 px-4 py-3 ${!item.visible ? 'opacity-60' : ''}`}
                  >
                    <div className={`flex-shrink-0 ${item.visible ? 'text-blue-500' : 'text-slate-400'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <span className={`font-medium ${item.visible ? 'text-slate-800' : 'text-slate-500'}`}>
                        {item.label}
                      </span>
                    </div>
                    <button
                      onClick={() => toggleMenuVisibility(menuItems.findIndex(m => m.id === item.id))}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        item.visible
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {item.visible ? (
                        <><EyeIcon className="h-4 w-4" /><span>표시</span></>
                      ) : (
                        <><EyeSlashIcon className="h-4 w-4" /><span>숨김</span></>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 카테고리별 메뉴 */}
          {categories.filter(cat => cat.visible).map((category) => {
            const CategoryIcon = categoryIcons[category.icon] || Briefcase
            const categoryMenus = getMenusByCategory(category.id)
            const isExpanded = expandedCategories.has(category.id)

            return (
              <div key={category.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleCategoryExpand(category.id)}
                  className="w-full bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CategoryIcon className="h-5 w-5 text-slate-600" />
                    <div className="text-left">
                      <h3 className="font-semibold text-slate-800">{category.label}</h3>
                      <p className="text-xs text-slate-500">
                        {categoryMenus.filter(m => m.visible).length} / {categoryMenus.length} 메뉴 표시
                      </p>
                    </div>
                  </div>
                  <ChevronDownIcon className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {isExpanded && (
                  <div className="divide-y divide-slate-100">
                    {categoryMenus.map((item) => {
                      const Icon = menuIcons[item.id] || Bars3Icon
                      const itemIndex = menuItems.findIndex(m => m.id === item.id)

                      return (
                        <div
                          key={item.id}
                          className={`flex items-center gap-4 px-4 py-3 ${!item.visible ? 'opacity-60' : ''}`}
                        >
                          <div className={`flex-shrink-0 ${item.visible ? 'text-blue-500' : 'text-slate-400'}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1">
                            <span className={`font-medium ${item.visible ? 'text-slate-800' : 'text-slate-500'}`}>
                              {item.label}
                            </span>
                          </div>

                          {/* 카테고리 변경 */}
                          <select
                            value={item.categoryId || ''}
                            onChange={(e) => changeMenuCategory(item.id, e.target.value || undefined)}
                            className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">카테고리 없음</option>
                            {categories.map(cat => (
                              <option key={cat.id} value={cat.id}>{cat.label}</option>
                            ))}
                          </select>

                          <button
                            onClick={() => toggleMenuVisibility(itemIndex)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                              item.visible
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {item.visible ? (
                              <><EyeIcon className="h-4 w-4" /><span>표시</span></>
                            ) : (
                              <><EyeSlashIcon className="h-4 w-4" /><span>숨김</span></>
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 카테고리 설정 탭 */}
      {activeTab === 'categories' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">카테고리 목록</h3>
              <span className="text-sm text-slate-500">
                표시: {categories.filter(c => c.visible).length} / {categories.length}
              </span>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {categories.map((category, index) => {
              const CategoryIcon = categoryIcons[category.icon] || Briefcase
              const isEditing = editingCategoryId === category.id

              return (
                <div
                  key={category.id}
                  draggable
                  onDragStart={(e) => handleCategoryDragStart(e, index)}
                  onDragOver={(e) => handleCategoryDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-4 px-4 py-3 transition-all ${
                    draggedIndex === index ? 'bg-blue-50 opacity-50' : 'hover:bg-slate-50'
                  } ${!category.visible ? 'opacity-60' : ''} cursor-grab active:cursor-grabbing`}
                >
                  {/* 드래그 핸들 */}
                  <div className="flex-shrink-0 text-slate-400 hover:text-slate-600">
                    <Bars3Icon className="h-5 w-5" />
                  </div>

                  {/* 순서 번호 */}
                  <div className="flex-shrink-0 w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center">
                    <span className="text-xs font-medium text-slate-600">{index + 1}</span>
                  </div>

                  {/* 아이콘 선택 */}
                  <div className="relative group">
                    <div className={`flex-shrink-0 p-2 rounded-lg cursor-pointer ${category.visible ? 'text-blue-500 bg-blue-50' : 'text-slate-400 bg-slate-100'}`}>
                      <CategoryIcon className="h-5 w-5" />
                    </div>
                    <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-2 hidden group-hover:grid grid-cols-4 gap-1 z-10 min-w-[160px]">
                      {AVAILABLE_CATEGORY_ICONS.map((iconName) => {
                        const IconComponent = categoryIcons[iconName]
                        if (!IconComponent) return null
                        return (
                          <button
                            key={iconName}
                            onClick={() => changeCategoryIcon(category.id, iconName)}
                            className={`p-2 rounded hover:bg-blue-50 ${category.icon === iconName ? 'bg-blue-100 text-blue-600' : 'text-slate-600'}`}
                          >
                            <IconComponent className="h-4 w-4" />
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* 카테고리 이름 */}
                  <div className="flex-1">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        onBlur={saveEditingCategory}
                        onKeyDown={(e) => e.key === 'Enter' && saveEditingCategory()}
                        className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${category.visible ? 'text-slate-800' : 'text-slate-500'}`}>
                          {category.label}
                        </span>
                        <button
                          onClick={() => startEditingCategory(category.id, category.label)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded"
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-slate-500 mt-0.5">
                      {getMenusByCategory(category.id).length}개 메뉴
                    </p>
                  </div>

                  {/* 순서 변경 버튼 */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveCategoryUp(index)}
                      disabled={index === 0}
                      className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="위로 이동"
                    >
                      <ArrowUpIcon className="h-4 w-4 text-slate-600" />
                    </button>
                    <button
                      onClick={() => moveCategoryDown(index)}
                      disabled={index === categories.length - 1}
                      className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="아래로 이동"
                    >
                      <ArrowDownIcon className="h-4 w-4 text-slate-600" />
                    </button>
                  </div>

                  {/* 표시/숨김 토글 */}
                  <button
                    onClick={() => toggleCategoryVisibility(index)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      category.visible
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {category.visible ? (
                      <><EyeIcon className="h-4 w-4" /><span>표시</span></>
                    ) : (
                      <><EyeSlashIcon className="h-4 w-4" /><span>숨김</span></>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button
          onClick={handleReset}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50"
        >
          <ArrowPathIcon className="h-4 w-4" />
          기본값으로 초기화
        </button>

        <div className="flex items-center gap-3">
          {hasChanges && (
            <button
              onClick={handleCancel}
              disabled={saving}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50"
            >
              취소
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`flex items-center gap-2 px-6 py-2 rounded-md font-medium transition-colors ${
              hasChanges
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            } disabled:opacity-50`}
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                저장 중...
              </>
            ) : (
              '설정 저장'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
