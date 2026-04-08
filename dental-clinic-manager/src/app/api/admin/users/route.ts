/**
 * Admin API Route: 사용자 목록 조회 (이메일 인증 상태 포함)
 *
 * @description
 * Supabase Admin API를 사용하여 모든 사용자 목록을 조회합니다.
 * SERVICE_ROLE_KEY를 사용하므로 서버에서만 실행됩니다.
 *
 * @returns {Object} 사용자 목록 및 이메일 인증 상태
 *
 * @example
 * const response = await fetch('/api/admin/users')
 * const { data, error } = await response.json()
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireMasterAdmin } from '@/lib/auth/requireMasterAdmin'

export async function GET(request: Request) {
  try {
    // 마스터 관리자 권한 검증
    const auth = await requireMasterAdmin()
    if (auth.error) {
      return NextResponse.json({ data: null, error: auth.error }, { status: auth.status })
    }

    // 환경 변수 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    console.log('[Admin API] Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
      supabaseUrlLength: supabaseUrl?.length || 0,
      serviceRoleKeyLength: serviceRoleKey?.length || 0
    })

    if (!supabaseUrl || !serviceRoleKey) {
      const missingVars = []
      if (!supabaseUrl) missingVars.push('NEXT_PUBLIC_SUPABASE_URL')
      if (!serviceRoleKey) missingVars.push('SUPABASE_SERVICE_ROLE_KEY')

      console.error('[Admin API] ⚠️ CRITICAL: Missing environment variables:', missingVars.join(', '))
      console.error('[Admin API] This will cause pending users to be invisible in the master dashboard.')
      console.error('[Admin API] Please set the following in Vercel Environment Variables:')
      missingVars.forEach(v => console.error(`  - ${v}`))

      return NextResponse.json(
        {
          data: null,
          error: 'Server configuration error: Missing Supabase credentials'
        },
        { status: 500 }
      )
    }

    // Admin 클라이언트 생성 (SERVICE_ROLE_KEY 사용)
    // Context7 공식 문서 권장 패턴
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,  // 서버 환경에서는 false
        persistSession: false     // 서버 환경에서는 false
      }
    })

    console.log('[Admin API] Fetching users from public.users table...')

    // 1. public.users 테이블에서 사용자 목록 조회
    // !left를 사용하여 LEFT JOIN 명시 (clinic_id가 null이어도 포함)
    const { data: publicUsers, error: publicError } = await supabase
      .from('users')
      .select(`
        *,
        clinic:clinics!left(name)
      `)
      .order('created_at', { ascending: false })

    if (publicError) {
      console.error('[Admin API] Error fetching public users:', publicError)
      return NextResponse.json(
        { data: null, error: publicError.message },
        { status: 500 }
      )
    }

    console.log(`[Admin API] Found ${publicUsers?.length || 0} users in public.users`)
    console.log('[Admin API] Fetching auth users from auth.users table...')

    // 2. auth.users 테이블에서 인증 정보 조회 (Admin API)
    const { data: { users: authUsers }, error: authError } =
      await supabase.auth.admin.listUsers()

    if (authError) {
      console.error('[Admin API] Error fetching auth users:', authError)
      return NextResponse.json(
        { data: null, error: authError.message },
        { status: 500 }
      )
    }

    console.log(`[Admin API] Found ${authUsers?.length || 0} users in auth.users`)
    console.log('[Admin API] Merging data...')

    // 3. 최근 로그인 기록 조회 (각 사용자별 최근 5건)
    console.log('[Admin API] Fetching recent login activities...')
    const { data: recentLogins, error: loginsError } = await supabase
      .from('user_activity_logs')
      .select('id, user_id, activity_type, activity_description, ip_address, created_at, metadata')
      .eq('activity_type', 'login')
      .order('created_at', { ascending: false })
      .limit(500)

    if (loginsError) {
      console.error('[Admin API] Error fetching login activities:', loginsError)
    }

    // 사용자별 최근 로그인 기록 그룹핑 (최근 5건)
    const loginsByUser: Record<string, any[]> = {}
    if (recentLogins) {
      for (const log of recentLogins) {
        if (!loginsByUser[log.user_id]) {
          loginsByUser[log.user_id] = []
        }
        if (loginsByUser[log.user_id].length < 5) {
          loginsByUser[log.user_id].push(log)
        }
      }
    }

    // 4. 데이터 병합 (email_verified + recent_logins 추가)
    const mergedData = publicUsers.map((user: any) => {
      const authUser = authUsers.find((au: any) => au.id === user.id)
      return {
        ...user,
        email_confirmed_at: authUser?.email_confirmed_at,
        email_verified: !!authUser?.email_confirmed_at,
        recent_logins: loginsByUser[user.id] || []
      }
    })

    console.log('[Admin API] Data merged successfully')
    console.log(`[Admin API] Returning ${mergedData.length} users with email verification status and login history`)

    return NextResponse.json({ data: mergedData, error: null })

  } catch (error: unknown) {
    console.error('[Admin API] Unexpected error:', error)
    return NextResponse.json(
      {
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
