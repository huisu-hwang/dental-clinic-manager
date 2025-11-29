/**
 * Admin API Route: 사용자 삭제 (마스터 전용)
 *
 * @description
 * Supabase Admin API를 사용하여 auth.users와 public.users를 삭제합니다.
 * owner인 경우 해당 clinic과 소속 사용자들도 함께 삭제합니다.
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

    console.log('[Admin API - Delete User] Starting deletion for user:', userId)

    // 1. 삭제할 사용자 정보 조회 (clinic_id, role 확인)
    const { data: userToDelete, error: userFetchError } = await supabase
      .from('users')
      .select('id, clinic_id, role, name, email')
      .eq('id', userId)
      .single()

    if (userFetchError) {
      console.error('[Admin API - Delete User] Error fetching user:', userFetchError)
      return NextResponse.json(
        { success: false, error: 'User not found: ' + userFetchError.message },
        { status: 404 }
      )
    }

    console.log('[Admin API - Delete User] User info:', userToDelete)

    // 2. owner인 경우 clinic과 모든 소속 사용자 삭제
    if (userToDelete.role === 'owner' && userToDelete.clinic_id) {
      console.log('[Admin API - Delete User] User is owner, deleting clinic and all members')

      // 2-1. 해당 clinic에 속한 모든 사용자 조회
      const { data: clinicUsers, error: clinicUsersError } = await supabase
        .from('users')
        .select('id')
        .eq('clinic_id', userToDelete.clinic_id)

      if (clinicUsersError) {
        console.error('[Admin API - Delete User] Error fetching clinic users:', clinicUsersError)
        return NextResponse.json(
          { success: false, error: 'Failed to fetch clinic users: ' + clinicUsersError.message },
          { status: 500 }
        )
      }

      console.log('[Admin API - Delete User] Found', clinicUsers?.length || 0, 'users in clinic')

      // 2-2. 모든 clinic 사용자의 auth.users 삭제
      if (clinicUsers && clinicUsers.length > 0) {
        for (const clinicUser of clinicUsers) {
          console.log('[Admin API - Delete User] Deleting auth user:', clinicUser.id)
          const { error: authDeleteError } = await supabase.auth.admin.deleteUser(clinicUser.id)
          if (authDeleteError) {
            console.error('[Admin API - Delete User] Error deleting auth user:', clinicUser.id, authDeleteError)
            // 에러가 발생해도 계속 진행 (일부 auth user가 이미 삭제되었을 수 있음)
          }
        }
      }

      // 2-3. clinic 삭제 (CASCADE로 public.users도 자동 삭제됨)
      const { error: clinicDeleteError } = await supabase
        .from('clinics')
        .delete()
        .eq('id', userToDelete.clinic_id)

      if (clinicDeleteError) {
        console.error('[Admin API - Delete User] Error deleting clinic:', clinicDeleteError)
        return NextResponse.json(
          { success: false, error: 'Failed to delete clinic: ' + clinicDeleteError.message },
          { status: 500 }
        )
      }

      console.log('[Admin API - Delete User] Clinic and all members deleted successfully')
      return NextResponse.json({ success: true, deletedClinic: true })
    }

    // 3. owner가 아닌 경우 사용자만 삭제
    console.log('[Admin API - Delete User] User is not owner, deleting user only')

    // 3-1. auth.users 삭제
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId)

    if (authDeleteError) {
      console.error('[Admin API - Delete User] Error deleting auth user:', authDeleteError)
      return NextResponse.json(
        { success: false, error: authDeleteError.message },
        { status: 500 }
      )
    }

    console.log('[Admin API - Delete User] Auth user deleted, deleting public user')

    // 3-2. public.users 삭제
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
