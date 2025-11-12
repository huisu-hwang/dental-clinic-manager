import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

/**
 * 브라우저 환경 전용 Supabase 클라이언트
 *
 * @supabase/ssr 사용:
 * - Cookie 기반 세션 관리
 * - 자동 토큰 갱신 (middleware와 함께 사용)
 * - Client Component, useEffect, 이벤트 핸들러에서 사용
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // 환경 변수 검증
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Supabase Browser Client] 환경 변수가 설정되지 않았습니다.')
    throw new Error('Supabase 환경 변수가 설정되지 않았습니다.')
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
}
