import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 허용되는 프로토콜 목록
const VALID_PROTOCOLS = ['tel', 'callto', 'sip', 'http', 'centrex'] as const
const VALID_METHODS = ['GET', 'POST'] as const

// settings 객체 유효성 검증
function validateSettings(settings: unknown): { valid: boolean; error?: string } {
  if (!settings || typeof settings !== 'object') {
    return { valid: false, error: '설정 데이터가 올바르지 않습니다.' }
  }

  const s = settings as Record<string, unknown>

  // protocol 필수 검증
  if (!s.protocol || !VALID_PROTOCOLS.includes(s.protocol as typeof VALID_PROTOCOLS[number])) {
    return { valid: false, error: '유효하지 않은 프로토콜입니다.' }
  }

  // httpSettings 검증 (있는 경우)
  if (s.httpSettings && typeof s.httpSettings === 'object') {
    const http = s.httpSettings as Record<string, unknown>
    if (http.host && typeof http.host !== 'string') {
      return { valid: false, error: 'IP 주소는 문자열이어야 합니다.' }
    }
    if (http.port !== undefined && (typeof http.port !== 'number' || http.port < 1 || http.port > 65535)) {
      return { valid: false, error: '포트 번호가 유효하지 않습니다.' }
    }
    if (http.pathTemplate && typeof http.pathTemplate !== 'string') {
      return { valid: false, error: 'API 경로는 문자열이어야 합니다.' }
    }
    if (http.method && !VALID_METHODS.includes(http.method as typeof VALID_METHODS[number])) {
      return { valid: false, error: '유효하지 않은 HTTP 메서드입니다.' }
    }
  }

  // centrexSettings 검증 (있는 경우)
  if (s.centrexSettings && typeof s.centrexSettings === 'object') {
    const centrex = s.centrexSettings as Record<string, unknown>
    if (centrex.phoneNumber && typeof centrex.phoneNumber !== 'string') {
      return { valid: false, error: '070번호는 문자열이어야 합니다.' }
    }
    if (centrex.password && typeof centrex.password !== 'string') {
      return { valid: false, error: '비밀번호는 문자열이어야 합니다.' }
    }
  }

  return { valid: true }
}

// 병원 전화 다이얼 설정 조회
export async function GET(_request: NextRequest) {
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

    // 권한 체크: owner 또는 manager만 설정 변경 가능
    if (!userData.role || !['owner', 'manager'].includes(userData.role)) {
      return NextResponse.json(
        { success: false, error: '설정 변경 권한이 없습니다. (관리자만 가능)' },
        { status: 403 }
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

    // 설정 데이터 유효성 검증
    const validation = validateSettings(settings)
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
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
