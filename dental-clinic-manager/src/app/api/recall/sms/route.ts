import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { aligoFetch } from '@/lib/aligoFetch'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// 알리고 API URL
const ALIGO_API_URL = 'https://apis.aligo.in'

interface AligoSendRequest {
  key: string
  user_id: string
  sender: string
  receiver: string
  msg: string
  msg_type?: 'SMS' | 'LMS' | 'MMS'
  title?: string
  testmode_yn?: 'Y' | 'N'
}

interface AligoResponse {
  result_code: string
  message: string
  msg_id?: string
  success_cnt?: number
  error_cnt?: number
}

// 문자 발송 API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinic_id, receivers, message, msg_type = 'SMS', title } = body

    if (!clinic_id || !receivers || !message) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      )
    }

    // Supabase 클라이언트 생성 (Service Role 사용)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 알리고 설정 조회
    const { data: aligoSettings, error: settingsError } = await supabase
      .from('aligo_settings')
      .select('*')
      .eq('clinic_id', clinic_id)
      .single()

    if (settingsError || !aligoSettings) {
      return NextResponse.json(
        { success: false, error: '알리고 API 설정을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (!aligoSettings.api_key || !aligoSettings.user_id || !aligoSettings.sender_number) {
      return NextResponse.json(
        { success: false, error: '알리고 API 설정이 완료되지 않았습니다.' },
        { status: 400 }
      )
    }

    // 수신자 배열 처리 (최대 1000명까지)
    const receiverList = Array.isArray(receivers) ? receivers : [receivers]

    if (receiverList.length > 1000) {
      return NextResponse.json(
        { success: false, error: '한 번에 최대 1000명까지 발송 가능합니다.' },
        { status: 400 }
      )
    }

    // 메시지 길이에 따른 타입 자동 결정
    let actualMsgType = msg_type
    const msgLength = new Blob([message]).size  // 바이트 길이
    if (msgLength > 2000) {
      return NextResponse.json(
        { success: false, error: '메시지 길이가 2000바이트를 초과합니다.' },
        { status: 400 }
      )
    }
    if (msgLength > 90 && msg_type === 'SMS') {
      actualMsgType = 'LMS'
    }

    // 알리고 API 요청 데이터 준비
    // multipart/form-data 대신 application/x-www-form-urlencoded 사용 — undici ProxyAgent + Fixie
    // 터널링 환경에서 multipart boundary 가 깨져 알리고가 파라미터를 못 읽는 문제 회피.
    const params = new URLSearchParams()
    params.append('key', aligoSettings.api_key)
    params.append('user_id', aligoSettings.user_id)
    params.append('sender', aligoSettings.sender_number)
    params.append('receiver', receiverList.join(','))
    params.append('msg', message)
    params.append('msg_type', actualMsgType)
    if (title && actualMsgType !== 'SMS') {
      const titleBytes = new Blob([title]).size
      if (titleBytes > 44) {
        return NextResponse.json(
          { success: false, error: '문자 제목은 44바이트 이하여야 합니다.' },
          { status: 400 }
        )
      }
      params.append('title', title)
    }
    // 테스트 모드 (개발 환경에서만)
    if (process.env.NODE_ENV === 'development') {
      params.append('testmode_yn', 'Y')
    }

    // 알리고 API 호출
    const aligoResponse = await aligoFetch(`${ALIGO_API_URL}/send/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    })

    const aligoResult: AligoResponse = await aligoResponse.json()

    // Aligo 스펙: result_code 는 Integer, >= 1 이면 성공, < 0 이면 실패. 문자열 응답에도 안전하도록 Number 변환.
    const resultCodeNum = Number(aligoResult.result_code)
    const isSuccess = Number.isFinite(resultCodeNum) && resultCodeNum >= 1

    // 결과 반환
    if (isSuccess) {
      return NextResponse.json({
        success: true,
        message: '문자 발송이 완료되었습니다.',
        data: {
          msg_id: aligoResult.msg_id,
          success_cnt: aligoResult.success_cnt,
          error_cnt: aligoResult.error_cnt
        }
      })
    } else {
      // 알리고가 반환한 원본 메시지를 그대로 보여줌. IP 인증 오류처럼 보여도 실제로는 다른 원인(파라미터 누락 등)일 수 있어 휴리스틱 변환은 위험.
      // 알리고 원본 message 가 "-IP" 등 IP 관련 단서를 포함할 때만 부가 안내 덧붙임.
      const aligoMessage = aligoResult.message || '문자 발송에 실패했습니다.'
      const isIpAuthError = /-IP\b/i.test(aligoMessage) || aligoMessage.includes('등록되지 않은 IP') || aligoMessage.includes('등록되지 않은 ip')
      const errorMessage = isIpAuthError
        ? `${aligoMessage}\n\n발신 IP 가 알리고에 등록되지 않은 것 같습니다. Fixie 고정 IP(52.5.155.132, 52.87.82.133) 가 알리고 IP 인증 화이트리스트에 모두 등록되어 있는지 확인해주세요.`
        : aligoMessage

      return NextResponse.json({
        success: false,
        error: errorMessage,
        data: aligoResult
      })
    }

  } catch (error) {
    console.error('[Aligo SMS API] Error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// 잔여 문자 조회 API
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clinicId = searchParams.get('clinic_id')
    const checkIp = searchParams.get('check_ip')

    // IP 확인 요청인 경우
    if (checkIp === 'true') {
      try {
        // 알리고가 보는 실제 발신 IP 를 알기 위해 알리고 호출과 동일한 프록시 경로로 조회
        const ipResponse = await aligoFetch('https://api.ipify.org?format=json')
        const ipData = await ipResponse.json()
        return NextResponse.json({
          success: true,
          server_ip: ipData.ip,
          message: '이 IP를 알리고 관리자 페이지에 등록하세요.'
        })
      } catch {
        return NextResponse.json({
          success: false,
          error: '서버 IP를 확인할 수 없습니다.'
        })
      }
    }

    if (!clinicId) {
      return NextResponse.json(
        { success: false, error: 'clinic_id가 필요합니다.' },
        { status: 400 }
      )
    }

    // Supabase 클라이언트 생성
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 알리고 설정 조회
    const { data: aligoSettings, error: settingsError } = await supabase
      .from('aligo_settings')
      .select('*')
      .eq('clinic_id', clinicId)
      .single()

    if (settingsError || !aligoSettings) {
      return NextResponse.json(
        { success: false, error: '알리고 API 설정을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 알리고 잔여 문자 조회 API 호출 (urlencoded — multipart/프록시 호환성 이슈 회피)
    const params = new URLSearchParams()
    params.append('key', aligoSettings.api_key)
    params.append('user_id', aligoSettings.user_id)

    const aligoResponse = await aligoFetch(`${ALIGO_API_URL}/remain/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    })

    const aligoResult = await aligoResponse.json()
    const remainCodeNum = Number(aligoResult.result_code)
    const isRemainSuccess = Number.isFinite(remainCodeNum) && remainCodeNum >= 1

    if (isRemainSuccess) {
      return NextResponse.json({
        success: true,
        data: {
          sms_count: aligoResult.SMS_CNT,
          lms_count: aligoResult.LMS_CNT,
          mms_count: aligoResult.MMS_CNT
        }
      })
    } else {
      return NextResponse.json({
        success: false,
        error: aligoResult.message || '잔여 문자 조회에 실패했습니다.'
      })
    }

  } catch (error) {
    console.error('[Aligo SMS API] Error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
