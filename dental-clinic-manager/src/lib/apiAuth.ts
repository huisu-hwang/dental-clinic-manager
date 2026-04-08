/**
 * API Route 서버측 인증 헬퍼
 * Supabase Auth 세션에서 인증된 사용자를 추출
 */

import { createClient } from '@/lib/supabase/server'

/**
 * 현재 요청의 인증된 사용자를 반환
 * 인증되지 않은 경우 null 반환
 */
export async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}
