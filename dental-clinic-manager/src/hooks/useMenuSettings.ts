'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { MenuItemSetting, MenuCategorySetting } from '@/types/menuSettings'
import { DEFAULT_MENU_ITEMS, DEFAULT_CATEGORIES } from '@/types/menuSettings'
import { getUserMenuSettings, clearMenuSettingsCache, MENU_SETTINGS_CHANGED_EVENT } from '@/lib/menuSettingsService'

interface UseMenuSettingsReturn {
  menuSettings: MenuItemSetting[]
  categorySettings: MenuCategorySetting[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * 사용자의 메뉴 설정을 가져오는 훅
 * 각 사용자별 개인 설정을 반환
 * 메뉴 설정이 변경되면 자동으로 업데이트됨
 */
export function useMenuSettings(): UseMenuSettingsReturn {
  const { user } = useAuth()
  const [menuSettings, setMenuSettings] = useState<MenuItemSetting[]>(DEFAULT_MENU_ITEMS)
  const [categorySettings, setCategorySettings] = useState<MenuCategorySetting[]>(DEFAULT_CATEGORIES)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = useCallback(async (useCache: boolean = true) => {
    if (!user?.id) {
      setMenuSettings(DEFAULT_MENU_ITEMS)
      setCategorySettings(DEFAULT_CATEGORIES)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // 사용자별 설정 조회
      const result = await getUserMenuSettings(user.id, useCache)

      if (result.success && result.data) {
        // 순서대로 정렬
        const sortedSettings = [...result.data.settings].sort((a, b) => a.order - b.order)
        setMenuSettings(sortedSettings)

        const sortedCategories = [...result.data.categories].sort((a, b) => a.order - b.order)
        setCategorySettings(sortedCategories)
      } else {
        setError(result.error || '메뉴 설정을 불러오는데 실패했습니다.')
        setMenuSettings(DEFAULT_MENU_ITEMS)
        setCategorySettings(DEFAULT_CATEGORIES)
      }
    } catch (err) {
      console.error('[useMenuSettings] Error loading settings:', err)
      setError('메뉴 설정을 불러오는데 실패했습니다.')
      setMenuSettings(DEFAULT_MENU_ITEMS)
      setCategorySettings(DEFAULT_CATEGORIES)
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  // 초기 로드
  useEffect(() => {
    loadSettings(true)
  }, [loadSettings])

  // 메뉴 설정 변경 이벤트 리스너
  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return

    const handleMenuSettingsChanged = (event: CustomEvent<{
      userId: string
      settings: MenuItemSetting[]
      categories?: MenuCategorySetting[]
    }>) => {
      const { userId, settings, categories } = event.detail

      // 현재 사용자의 설정만 업데이트
      if (userId === user.id) {
        console.log('[useMenuSettings] Menu settings changed, updating...')
        const sortedSettings = [...settings].sort((a, b) => a.order - b.order)
        setMenuSettings(sortedSettings)

        if (categories) {
          const sortedCategories = [...categories].sort((a, b) => a.order - b.order)
          setCategorySettings(sortedCategories)
        }
      }
    }

    window.addEventListener(MENU_SETTINGS_CHANGED_EVENT, handleMenuSettingsChanged as EventListener)

    return () => {
      window.removeEventListener(MENU_SETTINGS_CHANGED_EVENT, handleMenuSettingsChanged as EventListener)
    }
  }, [user?.id])

  // 새로고침 함수 (캐시 무시)
  const refresh = useCallback(async () => {
    if (user?.id) {
      clearMenuSettingsCache(user.id)
    }
    await loadSettings(false)
  }, [loadSettings, user?.id])

  return {
    menuSettings,
    categorySettings,
    isLoading,
    error,
    refresh
  }
}
