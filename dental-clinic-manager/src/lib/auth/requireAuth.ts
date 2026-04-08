import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

type UserRole = 'master_admin' | 'owner' | 'vice_director' | 'manager' | 'team_leader' | 'staff'

interface AuthResult {
  user: { id: string; role: UserRole; clinic_id: string | null } | null
  error: string | null
  status: number
}

/**
 * 인증된 사용자 검증 헬퍼
 * 서버 세션에서 사용자를 확인하고 역할 정보를 반환합니다.
 *
 * @param allowedRoles - 허용되는 역할 배열 (미지정 시 모든 인증된 사용자 허용)
 */
export async function requireAuth(allowedRoles?: UserRole[]): Promise<AuthResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { user: null, error: '인증이 필요합니다.', status: 401 }
    }

    const adminClient = getSupabaseAdmin()
    if (!adminClient) {
      return { user: null, error: 'Server configuration error', status: 500 }
    }

    const { data } = await adminClient
      .from('users')
      .select('role, clinic_id')
      .eq('id', user.id)
      .single()

    if (!data) {
      return { user: null, error: '사용자 정보를 찾을 수 없습니다.', status: 404 }
    }

    if (allowedRoles && !allowedRoles.includes(data.role as UserRole)) {
      return { user: null, error: '권한이 부족합니다.', status: 403 }
    }

    return {
      user: { id: user.id, role: data.role as UserRole, clinic_id: data.clinic_id },
      error: null,
      status: 200,
    }
  } catch {
    return { user: null, error: 'Authentication failed', status: 401 }
  }
}
