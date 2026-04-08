import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

/**
 * Master Admin 권한 검증 헬퍼
 * Admin API 라우트에서 요청자가 master_admin인지 확인합니다.
 */
export async function requireMasterAdmin(): Promise<{
  user: { id: string } | null
  error: string | null
  status: number
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { user: null, error: 'Unauthorized', status: 401 }
    }

    const adminClient = getSupabaseAdmin()
    if (!adminClient) {
      return { user: null, error: 'Server configuration error', status: 500 }
    }

    const { data } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (data?.role !== 'master_admin') {
      return { user: null, error: 'Forbidden: master_admin 권한이 필요합니다.', status: 403 }
    }

    return { user, error: null, status: 200 }
  } catch {
    return { user: null, error: 'Authentication failed', status: 401 }
  }
}
