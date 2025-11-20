/**
 * @deprecated 이 파일은 더 이상 사용되지 않습니다.
 * 대신 src/lib/supabase/client.ts의 createClient()를 사용하세요.
 *
 * 이 파일은 하위 호환성을 위해 유지되며, 추후 제거될 예정입니다.
 *
 * 마이그레이션 가이드:
 * ```typescript
 * // Before
 * import { getSupabase } from '@/lib/supabase'
 * const supabase = getSupabase()
 *
 * // After
 * import { createClient } from '@/lib/supabase/client'
 * const supabase = createClient()
 * ```
 */

import { createClient } from './supabase/client'

/**
 * @deprecated Use createClient() from './supabase/client' instead
 */
export const getSupabase = createClient

/**
 * @deprecated Use createClient() from './supabase/client' instead
 */
export const supabase = createClient

/**
 * @deprecated No longer needed with @supabase/ssr
 */
export const reinitializeSupabase = () => {
  console.warn('[Supabase] reinitializeSupabase is deprecated and no longer needed')
  return createClient()
}
