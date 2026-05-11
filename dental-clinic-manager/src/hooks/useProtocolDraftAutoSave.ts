'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProtocolFormData } from '@/types'

const DRAFT_KEY_PREFIX = 'protocol-draft:'
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7일
const SAVE_DEBOUNCE_MS = 800

interface DraftPayload {
  version: 1
  data: ProtocolFormData
  savedAt: string
}

/** HTML 문자열에서 텍스트만 추출하여 비어있는지 확인 (빈 단락, NBSP, 공백 무시) */
function hasNonEmptyHtmlContent(html?: string): boolean {
  if (!html) return false
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;| /g, '')
    .trim()
  return text.length > 0
}

interface UseProtocolDraftAutoSaveArgs {
  /** 폼 인스턴스별 고유 키 (예: 'new' 또는 `edit-${id}`) */
  draftKey: string
  formData: ProtocolFormData
  setFormData: (data: ProtocolFormData) => void
  /** false면 복원/저장 모두 비활성 (저장 중·로딩 중일 때 등) */
  enabled: boolean
  /** 사용자가 복원을 명시적으로 거부했을 때 호출되는 콜백 */
  onDiscard?: () => void
}

interface UseProtocolDraftAutoSaveResult {
  /** 마지막 저장 시각 (없으면 null) */
  lastSaved: Date | null
  /** 마운트 시 draft가 복원되었는지 여부 — UI 알림에 활용 */
  restored: boolean
  /** 저장된 draft를 명시적으로 삭제 (제출 성공·사용자 폐기 등) */
  clearDraft: () => void
  /** 복원 알림 닫기 (사용자가 X 클릭) */
  dismissRestoredNotice: () => void
}

export function useProtocolDraftAutoSave({
  draftKey,
  formData,
  setFormData,
  enabled,
  onDiscard,
}: UseProtocolDraftAutoSaveArgs): UseProtocolDraftAutoSaveResult {
  const fullKey = DRAFT_KEY_PREFIX + draftKey
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [restored, setRestored] = useState(false)
  const restoreAttemptedRef = useRef(false)

  // 초기 복원: 마운트 시 1회만 시도
  useEffect(() => {
    if (restoreAttemptedRef.current) return
    restoreAttemptedRef.current = true
    if (!enabled) return
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(fullKey)
      if (!raw) return
      const payload = JSON.parse(raw) as DraftPayload
      if (!payload || payload.version !== 1 || !payload.data) {
        window.localStorage.removeItem(fullKey)
        return
      }
      const savedAt = new Date(payload.savedAt)
      const age = Date.now() - savedAt.getTime()
      if (age > DRAFT_TTL_MS) {
        window.localStorage.removeItem(fullKey)
        return
      }
      setFormData(payload.data)
      setLastSaved(savedAt)
      setRestored(true)
    } catch (e) {
      // 파싱 실패 등은 조용히 무시하고 키 정리
      try {
        window.localStorage.removeItem(fullKey)
      } catch {
        /* ignore */
      }
      console.warn('[useProtocolDraftAutoSave] restore failed:', e)
    }
  }, [enabled, fullKey, setFormData])

  // 자동 저장: formData 변경 디바운스
  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return
    // 빈 폼은 저장하지 않음 (제목·내용·태그 모두 비어있으면 의미 없음)
    // buildDefaultStep은 content를 '<p></p>'로 시작하므로 HTML 내부 텍스트로 판정
    const isEmpty =
      !formData.title?.trim() &&
      !formData.change_summary?.trim() &&
      (!formData.tags || formData.tags.length === 0) &&
      (!formData.steps ||
        formData.steps.every((s) => !s.title?.trim() && !hasNonEmptyHtmlContent(s.content)))
    if (isEmpty) return

    const timer = setTimeout(() => {
      try {
        const payload: DraftPayload = {
          version: 1,
          data: formData,
          savedAt: new Date().toISOString(),
        }
        window.localStorage.setItem(fullKey, JSON.stringify(payload))
        setLastSaved(new Date(payload.savedAt))
      } catch (e) {
        // QuotaExceededError 등은 조용히 무시 (사용자 흐름 차단 금지)
        console.warn('[useProtocolDraftAutoSave] save failed:', e)
      }
    }, SAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [enabled, fullKey, formData])

  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(fullKey)
      setLastSaved(null)
      setRestored(false)
    } catch {
      /* ignore */
    }
  }, [fullKey])

  const dismissRestoredNotice = useCallback(() => {
    setRestored(false)
    onDiscard?.()
  }, [onDiscard])

  return { lastSaved, restored, clearDraft, dismissRestoredNotice }
}
