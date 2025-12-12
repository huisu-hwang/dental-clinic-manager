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
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
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
  Building2
} from 'lucide-react'
import type { MenuItemSetting } from '@/types/menuSettings'
import { DEFAULT_MENU_ITEMS } from '@/types/menuSettings'
import { getMenuSettings, saveMenuSettings, resetMenuSettings, clearMenuSettingsCache } from '@/lib/menuSettingsService'

interface MenuSettingsProps {
  clinicId: string
}

// 메뉴 아이콘 매핑
const menuIcons: Record<string, React.ElementType> = {
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

export default function MenuSettings({ clinicId }: MenuSettingsProps) {
  const [menuItems, setMenuItems] = useState<MenuItemSetting[]>([])
  const [originalItems, setOriginalItems] = useState<MenuItemSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  // 메뉴 설정 로드
  const loadMenuSettings = useCallback(async () => {
    setLoading(true)
    setError('')

    const result = await getMenuSettings(clinicId, false) // 캐시 무시하고 새로 로드

    if (result.success && result.data) {
      const sortedItems = [...result.data].sort((a, b) => a.order - b.order)
      setMenuItems(sortedItems)
      setOriginalItems(sortedItems)
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
    const changed = JSON.stringify(menuItems) !== JSON.stringify(originalItems)
    setHasChanges(changed)
  }, [menuItems, originalItems])

  // 표시 여부 토글
  const toggleVisibility = (index: number) => {
    setMenuItems(prev => {
      const newItems = [...prev]
      newItems[index] = {
        ...newItems[index],
        visible: !newItems[index].visible
      }
      return newItems
    })
    setSuccess('')
  }

  // 순서 위로 이동
  const moveUp = (index: number) => {
    if (index === 0) return

    setMenuItems(prev => {
      const newItems = [...prev]
      const temp = newItems[index - 1]
      newItems[index - 1] = { ...newItems[index], order: index - 1 }
      newItems[index] = { ...temp, order: index }
      return newItems
    })
    setSuccess('')
  }

  // 순서 아래로 이동
  const moveDown = (index: number) => {
    if (index === menuItems.length - 1) return

    setMenuItems(prev => {
      const newItems = [...prev]
      const temp = newItems[index + 1]
      newItems[index + 1] = { ...newItems[index], order: index + 1 }
      newItems[index] = { ...temp, order: index }
      return newItems
    })
    setSuccess('')
  }

  // 드래그 시작
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', '')
  }

  // 드래그 오버
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    setMenuItems(prev => {
      const newItems = [...prev]
      const draggedItem = newItems[draggedIndex]
      newItems.splice(draggedIndex, 1)
      newItems.splice(index, 0, draggedItem)

      // order 값 재정렬
      return newItems.map((item, i) => ({ ...item, order: i }))
    })
    setDraggedIndex(index)
    setSuccess('')
  }

  // 드래그 종료
  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  // 저장
  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    const result = await saveMenuSettings(clinicId, menuItems)

    if (result.success) {
      setOriginalItems([...menuItems])
      setSuccess('메뉴 설정이 저장되었습니다.')
      // 저장 후 캐시 갱신을 위해 다시 로드
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
      const sortedDefaults = [...DEFAULT_MENU_ITEMS].sort((a, b) => a.order - b.order)
      setMenuItems(sortedDefaults)
      setOriginalItems(sortedDefaults)
      setSuccess('메뉴 설정이 초기화되었습니다.')
    } else {
      setError(result.error || '메뉴 설정 초기화에 실패했습니다.')
    }

    setSaving(false)
  }

  // 변경 사항 취소
  const handleCancel = () => {
    setMenuItems([...originalItems])
    setSuccess('')
    setError('')
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
          <li>- 표시/숨김 버튼을 클릭하여 메뉴의 표시 여부를 설정합니다.</li>
          <li>- 드래그 앤 드롭 또는 화살표 버튼으로 메뉴 순서를 변경합니다.</li>
          <li>- 변경 사항은 저장 버튼을 클릭해야 적용됩니다.</li>
          <li>- 이 설정은 병원의 모든 직원에게 적용됩니다.</li>
          <li>- 각 직원의 권한에 따라 실제로 볼 수 있는 메뉴는 다를 수 있습니다.</li>
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

      {/* 메뉴 목록 */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">좌측 메뉴 목록</h3>
            <span className="text-sm text-slate-500">
              표시: {menuItems.filter(m => m.visible).length} / {menuItems.length}
            </span>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {menuItems.map((item, index) => {
            const Icon = menuIcons[item.id] || Bars3Icon

            return (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`
                  flex items-center gap-4 px-4 py-3 transition-all
                  ${draggedIndex === index ? 'bg-blue-50 opacity-50' : 'hover:bg-slate-50'}
                  ${!item.visible ? 'opacity-60' : ''}
                  cursor-grab active:cursor-grabbing
                `}
              >
                {/* 드래그 핸들 */}
                <div className="flex-shrink-0 text-slate-400 hover:text-slate-600">
                  <Bars3Icon className="h-5 w-5" />
                </div>

                {/* 순서 번호 */}
                <div className="flex-shrink-0 w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center">
                  <span className="text-xs font-medium text-slate-600">{index + 1}</span>
                </div>

                {/* 아이콘 */}
                <div className={`flex-shrink-0 ${item.visible ? 'text-blue-500' : 'text-slate-400'}`}>
                  <Icon className="h-5 w-5" />
                </div>

                {/* 메뉴 이름 */}
                <div className="flex-1">
                  <span className={`font-medium ${item.visible ? 'text-slate-800' : 'text-slate-500'}`}>
                    {item.label}
                  </span>
                </div>

                {/* 순서 변경 버튼 */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="위로 이동"
                  >
                    <ArrowUpIcon className="h-4 w-4 text-slate-600" />
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === menuItems.length - 1}
                    className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="아래로 이동"
                  >
                    <ArrowDownIcon className="h-4 w-4 text-slate-600" />
                  </button>
                </div>

                {/* 표시/숨김 토글 */}
                <button
                  onClick={() => toggleVisibility(index)}
                  className={`
                    flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                    ${item.visible
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }
                  `}
                >
                  {item.visible ? (
                    <>
                      <EyeIcon className="h-4 w-4" />
                      <span>표시</span>
                    </>
                  ) : (
                    <>
                      <EyeSlashIcon className="h-4 w-4" />
                      <span>숨김</span>
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

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
            className={`
              flex items-center gap-2 px-6 py-2 rounded-md font-medium transition-colors
              ${hasChanges
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }
              disabled:opacity-50
            `}
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
