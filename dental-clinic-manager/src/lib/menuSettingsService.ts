/**
 * 메뉴 설정 서비스
 * 사용자별/병원별 메뉴 설정을 저장하고 조회하는 기능 제공
 */

import { createClient } from './supabase/client'
import type { MenuItemSetting, MenuCategorySetting, UserMenuSettings } from '@/types/menuSettings'
import { DEFAULT_MENU_ITEMS, DEFAULT_CATEGORIES, normalizeCategorySettings, normalizeMenuSettings } from '@/types/menuSettings'

// 메뉴 설정을 localStorage에 캐시하는 키
const USER_MENU_SETTINGS_CACHE_KEY = 'dental_user_menu_settings'
const MENU_SETTINGS_CACHE_KEY = 'dental_menu_settings'
const CATEGORY_SETTINGS_CACHE_KEY = 'dental_category_settings'

// 메뉴 설정 변경 이벤트 이름
export const MENU_SETTINGS_CHANGED_EVENT = 'menuSettingsChanged'

// 메뉴 설정 변경 이벤트 발생
export function emitMenuSettingsChanged(
  userId: string,
  settings: MenuItemSetting[],
  categories?: MenuCategorySetting[]
): void {
  if (typeof window === 'undefined') return

  const event = new CustomEvent(MENU_SETTINGS_CHANGED_EVENT, {
    detail: { userId, settings, categories }
  })
  window.dispatchEvent(event)
  console.log('[menuSettingsService] Menu settings changed event emitted')
}

// 사용자별 메뉴 설정 캐시 가져오기
function getCachedUserMenuSettings(userId: string): UserMenuSettings | null {
  if (typeof window === 'undefined') return null

  try {
    const cached = localStorage.getItem(`${USER_MENU_SETTINGS_CACHE_KEY}_${userId}`)
    if (cached) {
      return JSON.parse(cached)
    }
  } catch (e) {
    console.warn('[menuSettingsService] Failed to parse cached user menu settings:', e)
  }
  return null
}

// 사용자별 메뉴 설정 캐시 저장
function setCachedUserMenuSettings(userId: string, settings: UserMenuSettings): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(`${USER_MENU_SETTINGS_CACHE_KEY}_${userId}`, JSON.stringify(settings))
  } catch (e) {
    console.warn('[menuSettingsService] Failed to cache user menu settings:', e)
  }
}

// 캐시된 메뉴 설정 가져오기 (병원용 - 레거시)
function getCachedMenuSettings(clinicId: string): MenuItemSetting[] | null {
  if (typeof window === 'undefined') return null

  try {
    const cached = localStorage.getItem(`${MENU_SETTINGS_CACHE_KEY}_${clinicId}`)
    if (cached) {
      return JSON.parse(cached)
    }
  } catch (e) {
    console.warn('[menuSettingsService] Failed to parse cached menu settings:', e)
  }
  return null
}

// 캐시된 카테고리 설정 가져오기 (병원용 - 레거시)
function getCachedCategorySettings(clinicId: string): MenuCategorySetting[] | null {
  if (typeof window === 'undefined') return null

  try {
    const cached = localStorage.getItem(`${CATEGORY_SETTINGS_CACHE_KEY}_${clinicId}`)
    if (cached) {
      return JSON.parse(cached)
    }
  } catch (e) {
    console.warn('[menuSettingsService] Failed to parse cached category settings:', e)
  }
  return null
}

// 메뉴 설정 캐시 저장 (병원용 - 레거시)
function setCachedMenuSettings(clinicId: string, settings: MenuItemSetting[]): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(`${MENU_SETTINGS_CACHE_KEY}_${clinicId}`, JSON.stringify(settings))
  } catch (e) {
    console.warn('[menuSettingsService] Failed to cache menu settings:', e)
  }
}

// 카테고리 설정 캐시 저장 (병원용 - 레거시)
function setCachedCategorySettings(clinicId: string, categories: MenuCategorySetting[]): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(`${CATEGORY_SETTINGS_CACHE_KEY}_${clinicId}`, JSON.stringify(categories))
  } catch (e) {
    console.warn('[menuSettingsService] Failed to cache category settings:', e)
  }
}

// 메뉴 설정 캐시 삭제
export function clearMenuSettingsCache(id?: string): void {
  if (typeof window === 'undefined') return

  try {
    if (id) {
      localStorage.removeItem(`${USER_MENU_SETTINGS_CACHE_KEY}_${id}`)
      localStorage.removeItem(`${MENU_SETTINGS_CACHE_KEY}_${id}`)
      localStorage.removeItem(`${CATEGORY_SETTINGS_CACHE_KEY}_${id}`)
    } else {
      // 모든 메뉴 설정 캐시 삭제
      Object.keys(localStorage)
        .filter(key =>
          key.startsWith(USER_MENU_SETTINGS_CACHE_KEY) ||
          key.startsWith(MENU_SETTINGS_CACHE_KEY) ||
          key.startsWith(CATEGORY_SETTINGS_CACHE_KEY)
        )
        .forEach(key => localStorage.removeItem(key))
    }
  } catch (e) {
    console.warn('[menuSettingsService] Failed to clear menu settings cache:', e)
  }
}

/**
 * 사용자의 메뉴 설정 조회 (사용자별 개인 설정)
 * @param userId 사용자 ID
 * @param useCache 캐시 사용 여부 (기본값: true)
 * @returns 메뉴 설정
 */
export async function getUserMenuSettings(
  userId: string,
  useCache: boolean = true
): Promise<{ success: boolean; data: UserMenuSettings | null; error?: string }> {
  try {
    // 캐시 확인
    if (useCache) {
      const cached = getCachedUserMenuSettings(userId)
      if (cached) {
        console.log('[menuSettingsService] Using cached user menu settings')

        // 새로운 메뉴가 추가되었을 수 있으므로 항상 정규화 수행
        const normalizedCategories = normalizeCategorySettings(cached.categories)
        const normalizedSettings = normalizeMenuSettings(cached.settings, normalizedCategories)

        // 정규화된 설정 생성 (항상 최신 메뉴 포함)
        const normalizedData: UserMenuSettings = {
          ...cached,
          settings: normalizedSettings,
          categories: normalizedCategories,
        }

        // 캐시와 정규화된 설정이 다르면 캐시 업데이트
        if (normalizedSettings.length !== cached.settings.length) {
          console.log('[menuSettingsService] New menu items detected, updating cache')
          normalizedData.updated_at = new Date().toISOString()
          setCachedUserMenuSettings(userId, normalizedData)
        }

        // 항상 정규화된 설정 반환 (새 메뉴가 포함됨)
        return { success: true, data: normalizedData }
      }
    }

    // 기본값 반환 (localStorage 기반이므로 캐시가 없으면 기본값)
    const defaultSettings: UserMenuSettings = {
      user_id: userId,
      settings: [...DEFAULT_MENU_ITEMS],
      categories: [...DEFAULT_CATEGORIES],
      updated_at: new Date().toISOString()
    }

    return { success: true, data: defaultSettings }
  } catch (error) {
    console.error('[menuSettingsService] Unexpected error:', error)
    return {
      success: true,
      data: {
        user_id: userId,
        settings: [...DEFAULT_MENU_ITEMS],
        categories: [...DEFAULT_CATEGORIES]
      }
    }
  }
}

/**
 * 사용자의 메뉴 설정 저장 (개인 설정)
 * @param userId 사용자 ID
 * @param settings 메뉴 설정 배열
 * @param categories 카테고리 설정 배열
 * @returns 성공 여부
 */
export async function saveUserMenuSettings(
  userId: string,
  settings: MenuItemSetting[],
  categories: MenuCategorySetting[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const userSettings: UserMenuSettings = {
      user_id: userId,
      settings,
      categories,
      updated_at: new Date().toISOString()
    }

    // 캐시에 저장
    setCachedUserMenuSettings(userId, userSettings)
    console.log('[menuSettingsService] User menu settings saved successfully')

    // 메뉴 설정 변경 이벤트 발생
    emitMenuSettingsChanged(userId, settings, categories)

    return { success: true }
  } catch (error) {
    console.error('[menuSettingsService] Unexpected error:', error)
    return { success: false, error: '메뉴 설정 저장 중 오류가 발생했습니다.' }
  }
}

/**
 * 사용자의 메뉴 설정 초기화 (기본값으로 되돌리기)
 * @param userId 사용자 ID
 * @returns 성공 여부
 */
export async function resetUserMenuSettings(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 캐시 삭제
    clearMenuSettingsCache(userId)
    console.log('[menuSettingsService] User menu settings reset successfully')

    // 메뉴 설정 변경 이벤트 발생 (기본값으로 초기화)
    emitMenuSettingsChanged(userId, DEFAULT_MENU_ITEMS, DEFAULT_CATEGORIES)

    return { success: true }
  } catch (error) {
    console.error('[menuSettingsService] Unexpected error:', error)
    return { success: false, error: '메뉴 설정 초기화 중 오류가 발생했습니다.' }
  }
}

/**
 * 병원의 메뉴 설정 조회 (레거시 - 하위 호환용)
 * @param clinicId 병원 ID
 * @param useCache 캐시 사용 여부 (기본값: true)
 * @returns 메뉴 설정 배열
 */
export async function getMenuSettings(
  clinicId: string,
  useCache: boolean = true
): Promise<{ success: boolean; data: MenuItemSetting[] | null; categories: MenuCategorySetting[] | null; error?: string }> {
  try {
    // 캐시 확인
    if (useCache) {
      const cachedMenu = getCachedMenuSettings(clinicId)
      const cachedCategories = getCachedCategorySettings(clinicId)
      if (cachedMenu) {
        console.log('[menuSettingsService] Using cached menu settings')
        return {
          success: true,
          data: cachedMenu,
          categories: normalizeCategorySettings(cachedCategories || undefined)
        }
      }
    }

    const supabase = createClient()
    if (!supabase) {
      console.error('[menuSettingsService] Supabase client not available')
      return { success: true, data: DEFAULT_MENU_ITEMS, categories: DEFAULT_CATEGORIES }
    }

    const { data, error } = await supabase
      .from('clinic_menu_settings')
      .select('*')
      .eq('clinic_id', clinicId)
      .single()

    if (error) {
      // 설정이 없는 경우 기본값 반환
      if (error.code === 'PGRST116') {
        console.log('[menuSettingsService] No menu settings found, using defaults')
        return { success: true, data: DEFAULT_MENU_ITEMS, categories: DEFAULT_CATEGORIES }
      }
      console.error('[menuSettingsService] Error fetching menu settings:', error)
      return { success: true, data: DEFAULT_MENU_ITEMS, categories: DEFAULT_CATEGORIES }
    }

    if (data) {
      const settings = data.settings as MenuItemSetting[] || []
      const categories = normalizeCategorySettings(data.categories as MenuCategorySetting[] | undefined)
      setCachedMenuSettings(clinicId, settings)
      setCachedCategorySettings(clinicId, categories)
      return { success: true, data: settings, categories }
    }

    return { success: true, data: DEFAULT_MENU_ITEMS, categories: DEFAULT_CATEGORIES }
  } catch (error) {
    console.error('[menuSettingsService] Unexpected error:', error)
    return { success: true, data: DEFAULT_MENU_ITEMS, categories: DEFAULT_CATEGORIES }
  }
}

/**
 * 병원의 메뉴 설정 저장/업데이트 (레거시)
 * @param clinicId 병원 ID
 * @param settings 메뉴 설정 배열
 * @param categories 카테고리 설정 배열 (선택)
 * @returns 성공 여부
 */
export async function saveMenuSettings(
  clinicId: string,
  settings: MenuItemSetting[],
  categories?: MenuCategorySetting[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()
    if (!supabase) {
      return { success: false, error: '데이터베이스 연결에 실패했습니다.' }
    }

    const normalizedCategories = normalizeCategorySettings(categories)

    // upsert를 사용하여 있으면 업데이트, 없으면 생성
    const { error } = await supabase
      .from('clinic_menu_settings')
      .upsert(
        {
          clinic_id: clinicId,
          settings: settings,
          categories: normalizedCategories,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'clinic_id'
        }
      )

    if (error) {
      console.error('[menuSettingsService] Error saving menu settings:', error)
      return { success: false, error: '메뉴 설정 저장에 실패했습니다.' }
    }

    // 캐시 업데이트
    setCachedMenuSettings(clinicId, settings)
    setCachedCategorySettings(clinicId, normalizedCategories)
    console.log('[menuSettingsService] Menu settings saved successfully')

    // 메뉴 설정 변경 이벤트 발생 (TabNavigation에서 즉시 반영)
    emitMenuSettingsChanged(clinicId, settings, normalizedCategories)

    return { success: true }
  } catch (error) {
    console.error('[menuSettingsService] Unexpected error:', error)
    return { success: false, error: '메뉴 설정 저장 중 오류가 발생했습니다.' }
  }
}

/**
 * 메뉴 설정 초기화 (기본값으로 되돌리기) - 레거시
 * @param clinicId 병원 ID
 * @returns 성공 여부
 */
export async function resetMenuSettings(
  clinicId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()
    if (!supabase) {
      return { success: false, error: '데이터베이스 연결에 실패했습니다.' }
    }

    const { error } = await supabase
      .from('clinic_menu_settings')
      .delete()
      .eq('clinic_id', clinicId)

    if (error) {
      console.error('[menuSettingsService] Error resetting menu settings:', error)
      return { success: false, error: '메뉴 설정 초기화에 실패했습니다.' }
    }

    // 캐시 삭제
    clearMenuSettingsCache(clinicId)
    console.log('[menuSettingsService] Menu settings reset successfully')

    // 메뉴 설정 변경 이벤트 발생 (기본값으로 초기화)
    emitMenuSettingsChanged(clinicId, DEFAULT_MENU_ITEMS, DEFAULT_CATEGORIES)

    return { success: true }
  } catch (error) {
    console.error('[menuSettingsService] Unexpected error:', error)
    return { success: false, error: '메뉴 설정 초기화 중 오류가 발생했습니다.' }
  }
}
