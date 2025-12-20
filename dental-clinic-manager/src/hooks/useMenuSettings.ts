'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { MenuItemSetting, MenuCategorySetting } from '@/types/menuSettings'
import { DEFAULT_MENU_ITEMS, DEFAULT_CATEGORIES } from '@/types/menuSettings'
import { getMenuSettings, clearMenuSettingsCache, MENU_SETTINGS_CHANGED_EVENT } from '@/lib/menuSettingsService'

interface UseMenuSettingsReturn {
  menuSettings: MenuItemSetting[]
  categorySettings: MenuCategorySetting[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * 병원의 메뉴 설정을 가져오는 훅
 * 로그인한 사용자의 병원에 맞는 메뉴 설정을 반환
 * 메뉴 설정이 변경되면 자동으로 업데이트됨
 */
export function useMenuSettings(): UseMenuSettingsReturn {
  const { user } = useAuth()
  const [menuSettings, setMenuSettings] = useState<MenuItemSetting[]>(DEFAULT_MENU_ITEMS)
  const [categorySettings, setCategorySettings] = useState<MenuCategorySetting[]>(DEFAULT_CATEGORIES)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = useCallback(async (useCache: boolean = true) => {
    if (!user?.clinic_id) {
      setMenuSettings(DEFAULT_MENU_ITEMS)
      setCategorySettings(DEFAULT_CATEGORIES)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await getMenuSettings(user.clinic_id, useCache)

      if (result.success && result.data) {
        // 순서대로 정렬
        const sortedSettings = [...result.data].sort((a, b) => a.order - b.order)
        setMenuSettings(sortedSettings)

        if (result.categories) {
          const sortedCategories = [...result.categories].sort((a, b) => a.order - b.order)
          setCategorySettings(sortedCategories)
        }
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
  }, [user?.clinic_id])

  // 초기 로드
  useEffect(() => {
    loadSettings(true)
  }, [loadSettings])

  // 메뉴 설정 변경 이벤트 리스너
  useEffect(() => {
    if (typeof window === 'undefined' || !user?.clinic_id) return

    const handleMenuSettingsChanged = (event: CustomEvent<{
      clinicId: string
      settings: MenuItemSetting[]
      categories?: MenuCategorySetting[]
    }>) => {
      const { clinicId, settings, categories } = event.detail

      // 현재 사용자의 병원 설정만 업데이트
      if (clinicId === user.clinic_id) {
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
  }, [user?.clinic_id])

  // 새로고침 함수 (캐시 무시)
  const refresh = useCallback(async () => {
    if (user?.clinic_id) {
      clearMenuSettingsCache(user.clinic_id)
    }
    await loadSettings(false)
  }, [loadSettings, user?.clinic_id])

  return {
    menuSettings,
    categorySettings,
    isLoading,
    error,
    refresh
  }
}
