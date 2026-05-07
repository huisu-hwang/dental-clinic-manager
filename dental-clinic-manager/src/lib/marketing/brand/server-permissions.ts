import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  DEFAULT_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  NEW_FEATURE_PREFIXES,
  NEW_INDIVIDUAL_PERMISSIONS,
  type Permission,
} from '@/types/permissions';

interface UserContext {
  userId: string;
  clinicId: string | null;
  role: string | null;
  permissions: Set<Permission>;
}

/**
 * 서버 컴포넌트/API 라우트에서 사용자의 effective 권한을 계산.
 * usePermissions 훅과 동일한 로직: owner는 전체, 그 외는 saved + NEW_FEATURE_PREFIXES 보충.
 */
export async function loadUserContext(userId: string): Promise<UserContext | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from('users')
    .select('clinic_id, role, permissions')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return null;

  const role = (data.role ?? null) as string | null;
  const savedPerms = (data.permissions ?? null) as Permission[] | null;

  let effective: Permission[];
  if (role === 'owner') {
    effective = Object.keys(PERMISSION_DESCRIPTIONS) as Permission[];
  } else if (savedPerms && savedPerms.length > 0) {
    effective = [...savedPerms];
    const roleDefaults = DEFAULT_PERMISSIONS[role || ''] || [];
    for (const prefix of NEW_FEATURE_PREFIXES) {
      if (!effective.some(p => p.startsWith(prefix))) {
        effective.push(...roleDefaults.filter(p => p.startsWith(prefix)));
      }
    }
    for (const perm of NEW_INDIVIDUAL_PERMISSIONS) {
      if (!effective.includes(perm) && roleDefaults.includes(perm)) {
        effective.push(perm);
      }
    }
  } else {
    effective = DEFAULT_PERMISSIONS[role || ''] || [];
  }

  return {
    userId,
    clinicId: (data.clinic_id ?? null) as string | null,
    role,
    permissions: new Set(effective),
  };
}

export function hasPermission(ctx: UserContext | null, permission: Permission): boolean {
  return !!ctx && ctx.permissions.has(permission);
}
