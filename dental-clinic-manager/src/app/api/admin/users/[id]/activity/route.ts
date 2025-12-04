/**
 * Admin API Route: 특정 사용자의 활동 기록 조회
 *
 * @description
 * 마스터 관리자가 특정 사용자의 활동 기록을 조회합니다.
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[Activity API] Missing Supabase credentials')
      return NextResponse.json(
        { data: null, error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // URL 파라미터에서 limit과 offset 추출
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // 사용자 활동 기록 조회
    const { data: activities, error, count } = await supabase
      .from('user_activity_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('[Activity API] Error fetching activities:', error)
      return NextResponse.json(
        { data: null, error: error.message },
        { status: 500 }
      )
    }

    // 사용자 정보도 함께 조회
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name, email, role, last_login_at, clinic:clinics!left(name)')
      .eq('id', userId)
      .single()

    if (userError) {
      console.error('[Activity API] Error fetching user:', userError)
    }

    return NextResponse.json({
      data: {
        user: user || null,
        activities: activities || [],
        total: count || 0,
        limit,
        offset
      },
      error: null
    })

  } catch (error: unknown) {
    console.error('[Activity API] Unexpected error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
