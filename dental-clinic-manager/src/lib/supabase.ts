import { createClient } from '@supabase/supabase-js'

let supabase: ReturnType<typeof createClient> | null = null

export const getSupabase = () => {
  if (typeof window === 'undefined') {
    // Server-side에서는 null 반환
    return null
  }

  if (!supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // 기본값이나 빈 값 체크를 더 정확하게
    if (!supabaseUrl || !supabaseAnonKey || 
        supabaseUrl.trim() === '' || supabaseAnonKey.trim() === '' ||
        supabaseUrl === 'https://your-project-id.supabase.co' || 
        supabaseAnonKey === 'your-anon-public-key' ||
        supabaseUrl.includes('your-project-id') ||
        supabaseAnonKey.includes('your-anon-public-key')) {
      console.warn('Supabase credentials not configured properly:', { supabaseUrl, supabaseAnonKey })
      return null
    }

    try {
      supabase = createClient(supabaseUrl, supabaseAnonKey)
    } catch (error) {
      console.error('Failed to create Supabase client:', error)
      return null
    }
  }

  return supabase
}

// Legacy export for backward compatibility
export { getSupabase as supabase }