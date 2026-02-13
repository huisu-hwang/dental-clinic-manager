import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 병원 전화 다이얼 설정 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      )
    }

    // 사용자의 clinic_id 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (userError || !userData?.clinic_id) {
      return NextResponse.json(
        { success: false, error: '병원 정보를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 전화 설정 조회
    const { data: phoneSettings, error: settingsError } = await supabase
      .from('clinic_phone_settings')
      .select('settings, updated_at')
      .eq('clinic_id', userData.clinic_id)
      .single()

    if (settingsError || !phoneSettings) {
      // 설정이 없으면 null 반환 (기본값 사용)
      return NextResponse.json({
        success: true,
        data: null
      })
    }

    return NextResponse.json({
      success: true,
      data: phoneSettings.settings,
      updated_at: phoneSettings.updated_at
    })

  } catch (error) {
    console.error('[Phone Settings API] GET Error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// 병원 전화 다이얼 설정 저장/업데이트
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      )
    }

    // 사용자의 clinic_id와 role 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('clinic_id, role')
      .eq('id', user.id)
      .single()

    if (userError || !userData?.clinic_id) {
      return NextResponse.json(
        { success: false, error: '병원 정보를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { settings } = body

    if (!settings) {
      return NextResponse.json(
        { success: false, error: '설정 데이터가 필요합니다.' },
        { status: 400 }
      )
    }

    // UPSERT: 있으면 업데이트, 없으면 생성
    const { error: upsertError } = await supabase
      .from('clinic_phone_settings')
      .upsert(
        {
          clinic_id: userData.clinic_id,
          settings,
          updated_by: user.id,
        },
        { onConflict: 'clinic_id' }
      )

    if (upsertError) {
      console.error('[Phone Settings API] Upsert Error:', upsertError)
      return NextResponse.json(
        { success: false, error: '설정 저장에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '설정이 저장되었습니다.'
    })

  } catch (error) {
    console.error('[Phone Settings API] PUT Error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
