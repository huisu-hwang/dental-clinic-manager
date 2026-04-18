/**
 * Admin API Route: 사용자 승인 거절 (마스터 전용)
 *
 * @description
 * 대기 중인 사용자의 승인을 거절하고 상태를 'rejected'로 변경합니다.
 * 마스터 계정에서만 사용됩니다.
 *
 * @returns {Object} 거절 처리 결과
 *
 * @example
 * const response = await fetch('/api/admin/users/reject', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ userId: 'uuid', clinicId: 'uuid', reason: '거절 사유' })
 * })
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { safeErrorMessage } from '@/lib/utils/safeError'
import { requireMasterAdmin } from '@/lib/auth/requireMasterAdmin'

export async function POST(request: Request) {
  try {
    // 마스터 관리자 권한 검증
    const auth = await requireMasterAdmin()
    if (auth.error) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    // 환경 변수 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[Admin API - Reject User] Missing environment variables')
      return NextResponse.json(
        {
          success: false,
          error: 'Server configuration error: Missing Supabase credentials'
        },
        { status: 500 }
      )
    }

    // 요청 바디에서 데이터 추출
    const { userId, clinicId, reason } = await request.json()

    if (!userId || !clinicId || !reason) {
      return NextResponse.json(
        { success: false, error: 'userId, clinicId, and reason are required' },
        { status: 400 }
      )
    }

    // Admin 클라이언트 생성 (SERVICE_ROLE_KEY 사용)
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('[Admin API - Reject User] Rejecting user:', userId)
    console.log('[Admin API - Reject User] Reason:', reason)

    // 사용자 상태 업데이트 (users 테이블에는 review_note 컬럼이 없음)
    const { error } = await supabase
      .from('users')
      .update({
        status: 'rejected',
        approved_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .eq('clinic_id', clinicId)

    if (error) {
      console.error('[Admin API - Reject User] Database error:', error)
      return NextResponse.json(
        { success: false, error: safeErrorMessage(error, 'Admin API - reject user') },
        { status: 500 }
      )
    }

    // auth.users 삭제 - 거절된 사용자가 동일 이메일로 재가입할 수 있도록
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId)
    if (authDeleteError) {
      console.warn('[Admin API - Reject User] Could not delete auth user (non-fatal):', authDeleteError.message)
    } else {
      console.log('[Admin API - Reject User] Auth user deleted successfully')
    }

    console.log('[Admin API - Reject User] User rejected successfully')
    return NextResponse.json({ success: true })

  } catch (error: unknown) {
    console.error('[Admin API - Reject User] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, 'Admin API - reject user')
      },
      { status: 500 }
    )
  }
}
