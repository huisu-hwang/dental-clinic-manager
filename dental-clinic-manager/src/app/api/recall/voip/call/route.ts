import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// VoIP 제공업체별 API 엔드포인트 (예시)
const VOIP_ENDPOINTS: Record<string, string> = {
  kt_bizmeka: 'https://api.bizmeka.com/v1/call',
  lg_uplus: 'https://api.uplus.co.kr/voip/call',
  sk_bizring: 'https://api.skbizring.com/call',
  samsung_voip: 'https://api.samsung.com/voip/dial'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinic_id, phone_number, provider } = body

    if (!clinic_id || !phone_number || !provider) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      )
    }

    // Supabase 클라이언트 생성
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // VoIP 설정 조회
    const { data: voipSettings, error: settingsError } = await supabase
      .from('voip_settings')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('provider', provider)
      .single()

    // VoIP 설정이 없는 경우 - 설정 안내 메시지 반환
    if (settingsError || !voipSettings) {
      return NextResponse.json({
        success: false,
        error: 'VoIP 설정을 찾을 수 없습니다. 설정 > 인터넷 전화 설정에서 설정해주세요.',
        code: 'VOIP_NOT_CONFIGURED'
      })
    }

    // 제공업체별 API 호출
    const endpoint = VOIP_ENDPOINTS[provider]

    if (!endpoint) {
      // 사용자 정의 제공업체인 경우
      if (provider === 'custom' && voipSettings.extra_settings?.endpoint) {
        // 사용자 정의 엔드포인트 사용
        const customEndpoint = voipSettings.extra_settings.endpoint
        const customMethod = voipSettings.extra_settings.method || 'POST'

        try {
          const response = await fetch(customEndpoint, {
            method: customMethod,
            headers: {
              'Content-Type': 'application/json',
              ...(voipSettings.api_key && { 'Authorization': `Bearer ${voipSettings.api_key}` })
            },
            body: JSON.stringify({
              phone_number,
              caller_number: voipSettings.caller_number,
              ...voipSettings.extra_settings.body_params
            })
          })

          if (response.ok) {
            return NextResponse.json({
              success: true,
              message: '전화 연결 요청이 전송되었습니다.'
            })
          } else {
            const errorData = await response.text()
            return NextResponse.json({
              success: false,
              error: `전화 연결 실패: ${errorData}`
            })
          }
        } catch (error) {
          console.error('[VoIP Custom Call] Error:', error)
          return NextResponse.json({
            success: false,
            error: '전화 연결 중 오류가 발생했습니다.'
          })
        }
      }

      return NextResponse.json({
        success: false,
        error: '지원하지 않는 VoIP 제공업체입니다.'
      })
    }

    // 표준 제공업체 API 호출 (실제 구현 시 각 제공업체 문서 참고)
    // 여기서는 예시로 공통 형식 사용
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${voipSettings.api_key}`,
          ...(voipSettings.api_secret && { 'X-API-Secret': voipSettings.api_secret })
        },
        body: JSON.stringify({
          to: phone_number,
          from: voipSettings.caller_number,
          ...voipSettings.extra_settings
        })
      })

      if (response.ok) {
        const result = await response.json()
        return NextResponse.json({
          success: true,
          message: '전화 연결 요청이 전송되었습니다.',
          data: result
        })
      } else {
        const errorData = await response.text()
        console.error('[VoIP Call] API Error:', errorData)
        return NextResponse.json({
          success: false,
          error: '전화 연결에 실패했습니다.'
        })
      }
    } catch (error) {
      console.error('[VoIP Call] Error:', error)
      // API 호출 실패 시에도 tel: 링크로 대체 가능하도록 안내
      return NextResponse.json({
        success: false,
        error: 'VoIP 서비스 연결에 실패했습니다. 직접 전화를 시도해주세요.',
        fallback: `tel:${phone_number}`
      })
    }

  } catch (error) {
    console.error('[VoIP Call API] Error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
