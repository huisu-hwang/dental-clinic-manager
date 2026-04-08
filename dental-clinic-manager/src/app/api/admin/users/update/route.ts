/**
 * Admin API Route: 사용자 정보 수정 (마스터 전용)
 *
 * @description
 * 마스터 관리자가 사용자의 역할, 상태, 소속 병원을 변경합니다.
 * SERVICE_ROLE_KEY를 사용하므로 서버에서만 실행됩니다.
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { safeErrorMessage } from '@/lib/utils/safeError'
import { requireMasterAdmin } from '@/lib/auth/requireMasterAdmin'

export async function PUT(request: Request) {
  try {
    // 마스터 관리자 권한 검증
    const auth = await requireMasterAdmin()
    if (auth.error) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const { userId, role, status, clinicId } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      )
    }

    // 유효한 역할 목록
    const validRoles = ['master_admin', 'owner', 'vice_director', 'manager', 'team_leader', 'staff']
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid role' },
        { status: 400 }
      )
    }

    // 유효한 상태 목록
    const validStatuses = ['pending', 'active', 'suspended', 'rejected']
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // 업데이트할 데이터 구성
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }

    if (role) updateData.role = role
    if (status) updateData.status = status
    if (clinicId !== undefined) updateData.clinic_id = clinicId || null

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select('*, clinic:clinics!left(name)')
      .single()

    if (error) {
      console.error('[Admin API - Update User] Database error:', error)
      return NextResponse.json(
        { success: false, error: safeErrorMessage(error, 'Admin API - update user') },
        { status: 500 }
      )
    }

    console.log('[Admin API - Update User] User updated:', userId, updateData)

    return NextResponse.json({ success: true, data })

  } catch (error: unknown) {
    console.error('[Admin API - Update User] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, 'Admin API - update user')
      },
      { status: 500 }
    )
  }
}
