import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

let supabaseAdmin: SupabaseClient<Database> | null = null

/**
 * Supabase Admin 클라이언트 (service_role 사용)
 *
 * 주의: 서버 측에서만 사용해야 합니다!
 * - RLS 정책을 우회합니다
 * - 절대 클라이언트 측에 노출하면 안 됩니다
 * - API 라우트, Server Actions에서만 사용하세요
 */
export function getSupabaseAdmin(): SupabaseClient<Database> | null {
  // 클라이언트 측에서 호출 방지
  if (typeof window !== 'undefined') {
    console.error('[Supabase Admin] 클라이언트 측에서 Admin 클라이언트를 사용할 수 없습니다!')
    return null
  }

  if (supabaseAdmin) {
    return supabaseAdmin
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    console.error('[Supabase Admin] NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.')
    return null
  }

  if (!supabaseServiceRoleKey) {
    console.error('[Supabase Admin] SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.')
    console.error('[Supabase Admin] Supabase Dashboard > Settings > API > service_role key를 .env.local에 추가하세요.')
    return null
  }

  try {
    supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
    console.log('[Supabase Admin] Admin 클라이언트 생성 완료')
    return supabaseAdmin
  } catch (error) {
    console.error('[Supabase Admin] 클라이언트 생성 실패:', error)
    return null
  }
}
