'use client'

import { useEffect, useRef } from 'react'

/**
 * 폼 입력값을 sessionStorage에 자동 저장/복원하는 hook
 * - 세션 종료(브라우저 닫음) 시 사라짐
 * - 같은 세션 내 다른 페이지 갔다 와도 유지
 * - load(restore) 콜백으로 복원된 값을 폼 setter에 전달
 *
 * @param key sessionStorage 키 (예: "marketing-new-post-draft")
 * @param values 현재 폼 값들 (직렬화 가능한 객체)
 * @param onRestore 마운트 시 1회 호출되는 복원 콜백
 */
export function useFormDraft<T extends Record<string, unknown>>(
  key: string,
  values: T,
  onRestore: (restored: Partial<T>) => void
) {
  const restoredRef = useRef(false)

  // 마운트 시 1회 복원
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (typeof window === 'undefined') return
    try {
      const raw = sessionStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<T>
        onRestore(parsed)
      }
    } catch { /* corrupted */ }
    // 의도적으로 mount 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 값 변경 시마다 저장 (debounce 없이 단순화 — 입력 빈도가 높지 않음)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      sessionStorage.setItem(key, JSON.stringify(values))
    } catch { /* quota exceeded 등 무시 */ }
  }, [key, values])
}

/** 폼 드래프트 명시적 삭제 (예: 글 생성 완료 후 호출) */
export function clearFormDraft(key: string): void {
  if (typeof window === 'undefined') return
  try { sessionStorage.removeItem(key) } catch { /* noop */ }
}
