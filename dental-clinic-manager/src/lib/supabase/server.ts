import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

/**
 * 서버 환경 전용 Supabase 클라이언트
 *
 * @supabase/ssr 사용:
 * - Cookie 기반 세션 관리
 * - Server Component, Server Action, Route Handler에서 사용
 * - Next.js 15: cookies() await 필수
 *
 * 중요: 서버에서는 절대 getSession() 사용하지 말 것!
 * 항상 getUser()를 사용하여 토큰 재검증 필요
 */
export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // 환경 변수 검증
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Supabase Server Client] 환경 변수가 설정되지 않았습니다.')
    throw new Error('Supabase 환경 변수가 설정되지 않았습니다.')
  }

  // Next.js 15: cookies() await 필수
  const cookieStore = await cookies()

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      // Next.js 15에서는 getAll()과 setAll()만 사용
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch (error) {
          // Server Component에서는 쿠키 설정 불가 (Read-only)
          // 이는 정상 동작이며, Middleware가 쿠키를 설정함
          // 다만 디버깅을 위해 에러를 로깅
          if (process.env.NODE_ENV === 'development') {
            console.warn('[Server Client] setAll 호출 실패 (정상 - Middleware가 처리):', error)
          }
        }
      },
    },
  })
}
