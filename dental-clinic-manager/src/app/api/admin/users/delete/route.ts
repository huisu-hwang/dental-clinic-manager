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
import { safeErrorMessage } from '@/lib/utils/safeError'
import { requireMasterAdmin } from '@/lib/auth/requireMasterAdmin'

export async function DELETE(request: Request) {
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
      console.log('[Admin API - Delete User] User not found in public.users:', userFetchError.message)

      // public.users에 없더라도 auth.users에 남아있을 수 있으므로 삭제 시도
      // (병원 삭제 시 public.users는 삭제되었지만 auth.users가 남은 경우)
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId)
      if (authDeleteError) {
        console.log('[Admin API - Delete User] Auth user also not found or already deleted:', authDeleteError.message)
        // auth.users에도 없으면 이미 완전히 삭제된 상태 → 성공으로 처리
      } else {
        console.log('[Admin API - Delete User] Orphaned auth user deleted successfully')
      }

      return NextResponse.json({ success: true, alreadyDeleted: true })
    }

    console.log('[Admin API - Delete User] User info:', userToDelete)

    // 2. owner인 경우 clinic과 모든 소속 사용자 삭제
    if (userToDelete.role === 'owner' && userToDelete.clinic_id) {
      console.log('[Admin API - Delete User] User is owner, deleting clinic and all members')

      // 2-1. 해당 clinic 존재 여부 확인
      const { data: clinicExists } = await supabase
        .from('clinics')
        .select('id')
        .eq('id', userToDelete.clinic_id)
        .single()

      if (!clinicExists) {
        console.log('[Admin API - Delete User] Clinic already deleted, proceeding with user-only deletion')
        // 병원이 이미 삭제된 경우 → 사용자만 삭제하는 경로로 진행
      } else {
        // 2-2. 해당 clinic에 속한 모든 사용자 조회
        const { data: clinicUsers, error: clinicUsersError } = await supabase
          .from('users')
          .select('id')
          .eq('clinic_id', userToDelete.clinic_id)

        if (clinicUsersError) {
          console.error('[Admin API - Delete User] Error fetching clinic users:', clinicUsersError)
          return NextResponse.json(
            { success: false, error: safeErrorMessage(clinicUsersError, 'Admin API - fetch clinic users') },
            { status: 500 }
          )
        }

        console.log('[Admin API - Delete User] Found', clinicUsers?.length || 0, 'users in clinic')

        const userIds = clinicUsers?.map(u => u.id) || []

        // 2-3. FK 참조 테이블 레코드 삭제 (telegram_board_posts, community 관련)
        if (userIds.length > 0) {
          console.log('[Admin API - Delete User] Deleting FK-referencing records for clinic users')
          await supabase.from('telegram_board_posts').delete().in('created_by', userIds)
          await supabase.from('community_reports').update({ reviewed_by: null }).in('reviewed_by', userIds)
          await supabase.from('community_penalties').delete().in('issued_by', userIds)
        }

        // 2-4. 모든 clinic 사용자의 auth.users 삭제
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

        // 2-5. public.users 삭제 (clinic 삭제 전에 FK 해제)
        if (userIds.length > 0) {
          console.log('[Admin API - Delete User] Deleting public users')
          await supabase.from('users').delete().in('id', userIds)
        }

        // 2-6. clinic 삭제
        const { error: clinicDeleteError } = await supabase
          .from('clinics')
          .delete()
          .eq('id', userToDelete.clinic_id)

        if (clinicDeleteError) {
          console.error('[Admin API - Delete User] Error deleting clinic:', clinicDeleteError)
          return NextResponse.json(
            { success: false, error: safeErrorMessage(clinicDeleteError, 'Admin API - delete clinic') },
            { status: 500 }
          )
        }

        console.log('[Admin API - Delete User] Clinic and all members deleted successfully')
        return NextResponse.json({ success: true, deletedClinic: true })
      }
    }

    // 3. owner가 아닌 경우 또는 병원이 이미 삭제된 owner의 경우 사용자만 삭제
    console.log('[Admin API - Delete User] Deleting user only')

    // 3-1. FK 참조 테이블 레코드 삭제
    console.log('[Admin API - Delete User] Deleting FK-referencing records')
    await supabase.from('telegram_board_posts').delete().eq('created_by', userId)
    await supabase.from('community_reports').update({ reviewed_by: null }).eq('reviewed_by', userId)
    await supabase.from('community_penalties').delete().eq('issued_by', userId)

    // 3-2. auth.users 삭제 (이미 삭제된 경우에도 에러로 중단하지 않음)
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId)

    if (authDeleteError) {
      // auth.users가 이미 삭제된 경우 (병원 삭제 시 함께 삭제됨) → 경고만 남기고 계속 진행
      console.warn('[Admin API - Delete User] Auth user deletion failed (may already be deleted):', authDeleteError.message)
    } else {
      console.log('[Admin API - Delete User] Auth user deleted')
    }

    // 3-3. public.users 삭제
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId)

    if (error) {
      console.error('[Admin API - Delete User] Error deleting public user:', error)
      return NextResponse.json(
        { success: false, error: safeErrorMessage(error, 'Admin API - delete public user') },
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
        error: safeErrorMessage(error, 'Admin API - delete user')
      },
      { status: 500 }
    )
  }
}
