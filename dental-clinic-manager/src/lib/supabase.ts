import { createClient } from '@supabase/supabase-js'

let supabase: ReturnType<typeof createClient> | null = null

export const getSupabase = () => {
  if (typeof window === 'undefined') {
    // Server-side에서는 null 반환
    console.log('[Supabase] Running on server-side, returning null')
    return null
  }

  if (!supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    console.log('[Supabase] Initializing client with URL:', supabaseUrl?.substring(0, 30) + '...')

    // 기본값이나 빈 값 체크를 더 정확하게
    if (!supabaseUrl || !supabaseAnonKey ||
        supabaseUrl.trim() === '' || supabaseAnonKey.trim() === '' ||
        supabaseUrl === 'https://your-project-id.supabase.co' ||
        supabaseAnonKey === 'your-anon-public-key' ||
        supabaseUrl.includes('your-project-id') ||
        supabaseAnonKey.includes('your-anon-public-key')) {
      console.error('[Supabase] Credentials not configured properly!', {
        url: supabaseUrl,
        keyLength: supabaseAnonKey?.length || 0
      })
      return null
    }

    try {
      console.log('[Supabase] Creating client...')
      supabase = createClient(supabaseUrl, supabaseAnonKey)
      console.log('[Supabase] Client created successfully')
    } catch (error) {
      console.error('[Supabase] Failed to create client:', error)
      return null
    }
  } else {
    console.log('[Supabase] Using existing client')
  }

  return supabase
}

// Legacy export for backward compatibility
export { getSupabase as supabase }