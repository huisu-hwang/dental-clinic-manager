/**
 * Admin API Route: 사용자 삭제 (마스터 전용)
 *
 * @description
 * Supabase Admin API를 사용하여 auth.users와 public.users를 삭제합니다.
 * SERVICE_ROLE_KEY를 사용하므로 서버에서만 실행됩니다.
 *
 * @returns {Object} 삭제 결과
 *
 * @example
 * const response = await fetch('/api/admin/users/delete', {
 *   method: 'DELETE',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ userId: 'uuid' })
 * })
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function DELETE(request: Request) {
  try {
    // 환경 변수 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[Admin API - Delete User] Missing environment variables')
      return NextResponse.json(
        {
          success: false,
          error: 'Server configuration error: Missing Supabase credentials'
        },
        { status: 500 }
      )
    }

    // 요청 바디에서 userId 추출
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      )
    }

    // Admin 클라이언트 생성 (SERVICE_ROLE_KEY 사용)
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,  // 서버 환경에서는 false
        persistSession: false     // 서버 환경에서는 false
      }
    })

    console.log('[Admin API - Delete User] Deleting auth user:', userId)

    // 1. auth.users 삭제 (고아 계정 방지)
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId)

    if (authDeleteError) {
      console.error('[Admin API - Delete User] Error deleting auth user:', authDeleteError)
      return NextResponse.json(
        { success: false, error: authDeleteError.message },
        { status: 500 }
      )
    }

    console.log('[Admin API - Delete User] Auth user deleted, deleting public user')

    // 2. public.users 삭제 (CASCADE로 관련 데이터 자동 삭제)
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId)

    if (error) {
      console.error('[Admin API - Delete User] Error deleting public user:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    console.log('[Admin API - Delete User] User deleted successfully')
    return NextResponse.json({ success: true })

  } catch (error: unknown) {
    console.error('[Admin API - Delete User] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
