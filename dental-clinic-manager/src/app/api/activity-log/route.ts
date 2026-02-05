/**
 * Activity Log API: 사용자 활동 기록 저장
 *
 * @description
 * 사용자 활동(로그인, 로그아웃, 페이지 조회 등)을 기록합니다.
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[Activity Log API] Missing Supabase credentials')
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const body = await request.json()
    const { user_id, clinic_id, activity_type, activity_description, metadata } = body

    if (!user_id || !activity_type || !activity_description) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // IP 주소 및 User Agent 추출
    const forwarded = request.headers.get('x-forwarded-for')
    const ip_address = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown'
    const user_agent = request.headers.get('user-agent') || 'unknown'

    // 활동 기록 저장
    const { error } = await supabase
      .from('user_activity_logs')
      .insert({
        id: uuidv4(),
        user_id,
        clinic_id: clinic_id || null,
        activity_type,
        activity_description,
        ip_address,
        user_agent,
        metadata: metadata || {},
        created_at: new Date().toISOString()
      })

    if (error) {
      console.error('[Activity Log API] Error inserting activity log:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error: unknown) {
    console.error('[Activity Log API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
