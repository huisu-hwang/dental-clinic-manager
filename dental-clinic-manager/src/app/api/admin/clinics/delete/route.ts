/**
 * Admin API Route: 병원 삭제 (마스터 전용)
 *
 * @description
 * 병원과 관련된 모든 데이터를 삭제합니다:
 * 1. 해당 병원의 모든 사용자 auth.users 삭제 (고아 계정 방지)
 * 2. 관련 데이터 삭제 (appointments, inventory, patients 등)
 * 3. public.users 삭제
 * 4. 병원 삭제
 *
 * SERVICE_ROLE_KEY를 사용하므로 서버에서만 실행됩니다.
 *
 * @returns {Object} 삭제 결과
 *
 * @example
 * const response = await fetch('/api/admin/clinics/delete', {
 *   method: 'DELETE',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ clinicId: 'uuid' })
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
      console.error('[Admin API - Delete Clinic] Missing environment variables')
      return NextResponse.json(
        {
          success: false,
          error: 'Server configuration error: Missing Supabase credentials'
        },
        { status: 500 }
      )
    }

    // 요청 바디에서 clinicId 추출
    const { clinicId } = await request.json()

    if (!clinicId) {
      return NextResponse.json(
        { success: false, error: 'clinicId is required' },
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

    console.log('[Admin API - Delete Clinic] Starting deletion for clinic:', clinicId)

    // 1. 해당 병원의 모든 사용자 ID 조회
    console.log('[Admin API - Delete Clinic] Fetching users for clinic')
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id')
      .eq('clinic_id', clinicId)

    if (usersError) {
      console.error('[Admin API - Delete Clinic] Error fetching users:', usersError)
      return NextResponse.json(
        { success: false, error: usersError.message },
        { status: 500 }
      )
    }

    // 2. 각 사용자의 auth.users 삭제 (고아 계정 방지)
    if (users && users.length > 0) {
      console.log(`[Admin API - Delete Clinic] Deleting ${users.length} auth users`)
      for (const user of users) {
        try {
          const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id)
          if (authDeleteError) {
            console.error(`[Admin API - Delete Clinic] Error deleting auth user ${user.id}:`, authDeleteError)
            // 계속 진행 (일부 실패해도 나머지는 삭제)
          } else {
            console.log(`[Admin API - Delete Clinic] Deleted auth user ${user.id}`)
          }
        } catch (err) {
          console.error(`[Admin API - Delete Clinic] Exception deleting auth user ${user.id}:`, err)
        }
      }
    }

    // 3. FK 참조 테이블 레코드 삭제 (telegram_board_posts, community 관련)
    const userIds = users?.map(u => u.id) || []
    if (userIds.length > 0) {
      console.log('[Admin API - Delete Clinic] Deleting FK-referencing records for users')
      await supabase.from('telegram_board_posts').delete().in('created_by', userIds)
      await supabase.from('community_reports').update({ reviewed_by: null }).in('reviewed_by', userIds)
      await supabase.from('community_penalties').delete().in('issued_by', userIds)
    }

    // 4. 관련 데이터 삭제 (CASCADE로 처리되지 않는 것들)
    console.log('[Admin API - Delete Clinic] Deleting related data')
    const relatedTables = ['appointments', 'inventory', 'inventory_categories', 'patients']
    for (const table of relatedTables) {
      const { error: relatedError } = await supabase.from(table).delete().eq('clinic_id', clinicId)
      if (relatedError) {
        console.warn(`[Admin API - Delete Clinic] Error deleting ${table}:`, relatedError.message)
        // 관련 데이터 삭제 실패는 경고만 (테이블이 없거나 이미 삭제된 경우)
      }
    }

    // 5. users 삭제 (auth.users는 이미 삭제했으므로 public.users만 삭제)
    console.log('[Admin API - Delete Clinic] Deleting public users')
    const { error: usersDeleteError } = await supabase.from('users').delete().eq('clinic_id', clinicId)
    if (usersDeleteError) {
      console.error('[Admin API - Delete Clinic] Error deleting public users:', usersDeleteError.message)
      return NextResponse.json(
        { success: false, error: 'Failed to delete clinic users: ' + usersDeleteError.message },
        { status: 500 }
      )
    }

    // 6. 병원 삭제
    console.log('[Admin API - Delete Clinic] Deleting clinic')
    const { error } = await supabase
      .from('clinics')
      .delete()
      .eq('id', clinicId)

    if (error) {
      console.error('[Admin API - Delete Clinic] Error deleting clinic:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    console.log('[Admin API - Delete Clinic] Clinic and all related data deleted successfully')
    return NextResponse.json({ success: true })

  } catch (error: unknown) {
    console.error('[Admin API - Delete Clinic] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
