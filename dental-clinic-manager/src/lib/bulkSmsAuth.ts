// 단체 문자 API 공용 권한 체크 헬퍼
// 클라이언트 cookie 세션으로 사용자 식별 + service role로 권한·클리닉 정보 로드
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Permission } from '@/types/permissions'
import {
  DEFAULT_PERMISSIONS,
  NEW_FEATURE_PREFIXES,
  NEW_INDIVIDUAL_PERMISSIONS,
} from '@/types/permissions'

export interface AuthedContext {
  userId: string
  clinicId: string
  clinicName: string
  clinicPhone: string
}

// 현재 로그인 사용자의 권한이 `required`를 포함하는지 검사.
// 권한 부족이면 null 반환.
export async function getAuthedUserWithPermission(
  required: Permission
): Promise<AuthedContext | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          /* readonly in route handlers; middleware refreshes */
        },
      },
    }
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Service Role로 사용자 + 클리닉 조회 (RLS 우회)
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: u } = await service
    .from('users')
    .select('id, clinic_id, role, permissions')
    .eq('id', user.id)
    .single()
  if (!u || !u.clinic_id) return null

  // owner는 모든 권한
  let hasPermission = u.role === 'owner'

  if (!hasPermission) {
    // 사용자에게 직접 할당된 권한이 있으면 그것 사용 (usePermissions hook 패턴과 동일)
    let userPermissions: Permission[] = []
    if (Array.isArray(u.permissions) && u.permissions.length > 0) {
      userPermissions = [...(u.permissions as Permission[])]
      const roleDefaults = DEFAULT_PERMISSIONS[u.role as string] ?? []
      for (const prefix of NEW_FEATURE_PREFIXES) {
        const hasFeaturePerms = userPermissions.some((p) => p.startsWith(prefix))
        if (!hasFeaturePerms) {
          userPermissions.push(...roleDefaults.filter((p) => p.startsWith(prefix)))
        }
      }
      for (const perm of NEW_INDIVIDUAL_PERMISSIONS) {
        if (!userPermissions.includes(perm) && roleDefaults.includes(perm)) {
          userPermissions.push(perm)
        }
      }
    } else {
      userPermissions = DEFAULT_PERMISSIONS[u.role as string] ?? []
    }
    hasPermission = userPermissions.includes(required)
  }

  if (!hasPermission) return null

  // 클리닉 정보 별도 조회 (관계 join 회피)
  const { data: clinic } = await service
    .from('clinics')
    .select('name, phone')
    .eq('id', u.clinic_id)
    .single()

  return {
    userId: u.id,
    clinicId: u.clinic_id,
    clinicName: clinic?.name ?? '',
    clinicPhone: clinic?.phone ?? '',
  }
}
