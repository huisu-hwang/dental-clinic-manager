import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { createClient as createBrowserClient, resetClient as resetBrowserClient } from '@/lib/supabase/client'

let initializationError: string | null = null

/**
 * Legacy browser Supabase accessor.
 *
 * This app historically had two different browser auth clients:
 * - `src/lib/supabase/client.ts` using `@supabase/ssr` with cookie storage
 * - `src/lib/supabase.ts` using `@supabase/supabase-js` with custom storage
 *
 * Mixing both caused session state to diverge across different storage backends
 * and storage keys, which led to intermittent missing sessions and unexpected
 * sign-outs. Keep this module as a thin compatibility layer over the single
 * cookie-backed client so all browser auth flows share one source of truth.
 */
export const reinitializeSupabase = (): SupabaseClient<Database> | null => {
  initializationError = null
  resetBrowserClient()
  return getSupabase()
}

export const getSupabase = (): SupabaseClient<Database> | null => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return createBrowserClient()
  } catch (error) {
    initializationError = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Supabase] Failed to create browser client:', error)
    return null
  }
}

export const getSupabaseInitError = () => initializationError

// Legacy export for backward compatibility
export { getSupabase as supabase }
