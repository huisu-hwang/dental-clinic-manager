import { createClient } from '@supabase/supabase-js'

let supabase: ReturnType<typeof createClient> | null = null
let initializationError: string | null = null

export const getSupabase = () => {
  if (typeof window === 'undefined') {
    // Server-side에서는 null 반환
    console.log('[Supabase] Running on server-side, returning null')
    return null
  }

  // 이미 초기화 실패한 경우 재시도하지 않음
  if (initializationError) {
    console.error('[Supabase] Previous initialization failed:', initializationError)
    return null
  }

  if (!supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    console.log('[Supabase] Environment check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey,
      urlPrefix: supabaseUrl?.substring(0, 30)
    })

    // 환경 변수 검증
    if (!supabaseUrl || !supabaseAnonKey) {
      initializationError = 'Supabase 환경 변수가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL 및 NEXT_PUBLIC_SUPABASE_ANON_KEY를 확인하세요.'
      console.error('[Supabase]', initializationError)

      // 개발 환경에서만 경고 표시
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Supabase] 환경 변수를 .env.local 파일에 추가하고 서버를 재시작하세요.')
      }
      return null
    }

    // 빈 값 또는 placeholder 값 체크
    if (supabaseUrl.trim() === '' || supabaseAnonKey.trim() === '' ||
        supabaseUrl === 'https://your-project-id.supabase.co' ||
        supabaseAnonKey === 'your-anon-public-key' ||
        supabaseUrl.includes('your-project-id') ||
        supabaseAnonKey.includes('your-anon-public-key')) {
      initializationError = 'Supabase 환경 변수가 placeholder 값으로 설정되어 있습니다. 실제 값으로 변경하세요.'
      console.error('[Supabase]', initializationError, {
        url: supabaseUrl,
        keyLength: supabaseAnonKey?.length || 0
      })
      return null
    }

    try {
      console.log('[Supabase] Creating client...')
      supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        }
      })
      console.log('[Supabase] Client created successfully')
    } catch (error) {
      initializationError = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Supabase] Failed to create client:', error)
      return null
    }
  } else {
    console.log('[Supabase] Using existing client')
  }

  return supabase
}

// 초기화 에러 확인 함수 (디버깅용)
export const getSupabaseInitError = () => initializationError

// Legacy export for backward compatibility
export { getSupabase as supabase }