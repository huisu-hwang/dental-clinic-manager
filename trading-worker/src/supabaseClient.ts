/**
 * Supabase 클라이언트 (service_role)
 *
 * 워커에서 사용하는 Supabase 연결.
 * service_role 키를 사용하므로 RLS를 우회합니다.
 * → 코드에서 반드시 user_id 필터를 명시적으로 적용해야 합니다.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다')
  }

  client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return client
}
