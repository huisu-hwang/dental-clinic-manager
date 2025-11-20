import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

/**
 * 브라우저 환경 전용 Supabase 클라이언트
 *
 * @supabase/ssr 사용:
 * - createBrowserClient의 내장 싱글톤 활용
 * - 자동 토큰 갱신 (middleware.ts가 처리)
 * - Cookie 기반 세션 관리
 *
 * 주의:
 * - 브라우저 환경에서만 사용
 * - Server Component에서는 createServerClient 사용
 * - onAuthStateChange 리스너는 AuthContext에서 관리
 */
export function createClient() {
  if (typeof window === 'undefined') {
    throw new Error('createClient must be called from browser environment')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }

  // createBrowserClient의 내장 싱글톤 활용
  // 외부 싱글톤 변수 불필요
  return createBrowserClient<Database>(url, key)
}
