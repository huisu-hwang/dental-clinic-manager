/**
 * 메뉴 설정 서비스
 * 병원별 메뉴 설정을 저장하고 조회하는 기능 제공
 */

import { createClient } from './supabase/client'
import type { MenuItemSetting, ClinicMenuSettings } from '@/types/menuSettings'
import { DEFAULT_MENU_ITEMS, normalizeMenuSettings } from '@/types/menuSettings'

// 메뉴 설정을 localStorage에 캐시하는 키
const MENU_SETTINGS_CACHE_KEY = 'dental_menu_settings'

// 캐시된 메뉴 설정 가져오기
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

// 메뉴 설정 캐시 저장
function setCachedMenuSettings(clinicId: string, settings: MenuItemSetting[]): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(`${MENU_SETTINGS_CACHE_KEY}_${clinicId}`, JSON.stringify(settings))
  } catch (e) {
    console.warn('[menuSettingsService] Failed to cache menu settings:', e)
  }
}

// 메뉴 설정 캐시 삭제
export function clearMenuSettingsCache(clinicId?: string): void {
  if (typeof window === 'undefined') return

  try {
    if (clinicId) {
      localStorage.removeItem(`${MENU_SETTINGS_CACHE_KEY}_${clinicId}`)
    } else {
      // 모든 메뉴 설정 캐시 삭제
      Object.keys(localStorage)
        .filter(key => key.startsWith(MENU_SETTINGS_CACHE_KEY))
        .forEach(key => localStorage.removeItem(key))
    }
  } catch (e) {
    console.warn('[menuSettingsService] Failed to clear menu settings cache:', e)
  }
}

/**
 * 병원의 메뉴 설정 조회
 * @param clinicId 병원 ID
 * @param useCache 캐시 사용 여부 (기본값: true)
 * @returns 메뉴 설정 배열
 */
export async function getMenuSettings(
  clinicId: string,
  useCache: boolean = true
): Promise<{ success: boolean; data: MenuItemSetting[] | null; error?: string }> {
  try {
    // 캐시 확인
    if (useCache) {
      const cached = getCachedMenuSettings(clinicId)
      if (cached) {
        console.log('[menuSettingsService] Using cached menu settings')
        return { success: true, data: normalizeMenuSettings(cached) }
      }
    }

    const supabase = createClient()
    if (!supabase) {
      console.error('[menuSettingsService] Supabase client not available')
      return { success: true, data: DEFAULT_MENU_ITEMS }
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
        return { success: true, data: DEFAULT_MENU_ITEMS }
      }
      console.error('[menuSettingsService] Error fetching menu settings:', error)
      return { success: true, data: DEFAULT_MENU_ITEMS }
    }

    if (data && data.settings) {
      const settings = normalizeMenuSettings(data.settings as MenuItemSetting[])
      setCachedMenuSettings(clinicId, settings)
      return { success: true, data: settings }
    }

    return { success: true, data: DEFAULT_MENU_ITEMS }
  } catch (error) {
    console.error('[menuSettingsService] Unexpected error:', error)
    return { success: true, data: DEFAULT_MENU_ITEMS }
  }
}

/**
 * 병원의 메뉴 설정 저장/업데이트
 * @param clinicId 병원 ID
 * @param settings 메뉴 설정 배열
 * @returns 성공 여부
 */
export async function saveMenuSettings(
  clinicId: string,
  settings: MenuItemSetting[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()
    if (!supabase) {
      return { success: false, error: '데이터베이스 연결에 실패했습니다.' }
    }

    // 정규화된 설정 저장
    const normalizedSettings = normalizeMenuSettings(settings)

    // upsert를 사용하여 있으면 업데이트, 없으면 생성
    const { error } = await supabase
      .from('clinic_menu_settings')
      .upsert(
        {
          clinic_id: clinicId,
          settings: normalizedSettings,
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
    setCachedMenuSettings(clinicId, normalizedSettings)
    console.log('[menuSettingsService] Menu settings saved successfully')

    return { success: true }
  } catch (error) {
    console.error('[menuSettingsService] Unexpected error:', error)
    return { success: false, error: '메뉴 설정 저장 중 오류가 발생했습니다.' }
  }
}

/**
 * 메뉴 설정 초기화 (기본값으로 되돌리기)
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

    return { success: true }
  } catch (error) {
    console.error('[menuSettingsService] Unexpected error:', error)
    return { success: false, error: '메뉴 설정 초기화 중 오류가 발생했습니다.' }
  }
}
