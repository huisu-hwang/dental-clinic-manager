'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { PhoneDialSettings } from '@/types/phone'
import { DEFAULT_PHONE_DIAL_SETTINGS } from '@/types/phone'
import { savePhoneDialSettings as saveToLocalStorage, loadPhoneDialSettings as loadFromLocalStorage } from '@/utils/phoneDialer'

/**
 * 전화 다이얼 설정 자동 로딩 훅
 *
 * - 병원(clinic) 단위로 Supabase에서 설정을 자동 로드
 * - localStorage를 캐시로 사용 (오프라인/비로그인 대응)
 * - DB 설정이 있으면 localStorage에 동기화
 * - DB 설정이 없으면 localStorage 설정을 사용
 */
export function usePhoneDialSettings() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<PhoneDialSettings>(DEFAULT_PHONE_DIAL_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const [isFromDb, setIsFromDb] = useState(false)

  // DB에서 설정 로드
  const loadFromDb = useCallback(async () => {
    if (!user?.clinic_id) return null

    try {
      const response = await fetch('/api/clinic/phone-settings')
      const result = await response.json()

      if (result.success && result.data) {
        return result.data as PhoneDialSettings
      }
    } catch (error) {
      console.warn('[usePhoneDialSettings] DB 로드 실패, localStorage 사용:', error)
    }
    return null
  }, [user?.clinic_id])

  // 설정 로드 (DB 우선 → localStorage 폴백)
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setIsLoading(true)

      // 1. localStorage에서 즉시 로드 (빠른 초기화)
      const localSettings = loadFromLocalStorage()
      if (!cancelled) {
        setSettings(localSettings)
      }

      // 2. DB에서 로드 시도 (로그인 상태일 때)
      if (user?.clinic_id) {
        const dbSettings = await loadFromDb()
        if (!cancelled && dbSettings) {
          setSettings(dbSettings)
          setIsFromDb(true)
          // DB 설정을 localStorage에 동기화
          saveToLocalStorage(dbSettings)
        }
      }

      if (!cancelled) {
        setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [user?.clinic_id, loadFromDb])

  // 설정 저장 (DB + localStorage 동시)
  const saveSettings = useCallback(async (newSettings: PhoneDialSettings) => {
    // localStorage에 즉시 저장
    saveToLocalStorage(newSettings)
    setSettings(newSettings)

    // DB에도 저장 (로그인 상태일 때)
    if (user?.clinic_id) {
      try {
        const response = await fetch('/api/clinic/phone-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: newSettings })
        })
        const result = await response.json()

        if (result.success) {
          setIsFromDb(true)
          return { success: true, message: '설정이 저장되었습니다.' }
        } else {
          console.warn('[usePhoneDialSettings] DB 저장 실패:', result.error)
          return { success: true, message: '설정이 이 브라우저에 저장되었습니다. (서버 저장 실패)' }
        }
      } catch (error) {
        console.warn('[usePhoneDialSettings] DB 저장 오류:', error)
        return { success: true, message: '설정이 이 브라우저에 저장되었습니다. (네트워크 오류)' }
      }
    }

    return { success: true, message: '설정이 저장되었습니다.' }
  }, [user?.clinic_id])

  return {
    settings,
    setSettings,
    saveSettings,
    isLoading,
    isFromDb,
  }
}
