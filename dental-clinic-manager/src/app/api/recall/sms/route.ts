import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    if (msgLength > 90 && msg_type === 'SMS') {
      actualMsgType = 'LMS'
    }

    // 알리고 API 요청 데이터 준비
    const formData = new FormData()
    formData.append('key', aligoSettings.api_key)
    formData.append('user_id', aligoSettings.user_id)
    formData.append('sender', aligoSettings.sender_number)
    formData.append('receiver', receiverList.join(','))
    formData.append('msg', message)
    formData.append('msg_type', actualMsgType)
    if (title && actualMsgType !== 'SMS') {
      formData.append('title', title)
    }
    // 테스트 모드 (개발 환경에서만)
    if (process.env.NODE_ENV === 'development') {
      formData.append('testmode_yn', 'Y')
    }

    // 알리고 API 호출
    const aligoResponse = await fetch(`${ALIGO_API_URL}/send/`, {
      method: 'POST',
      body: formData
    })

    const aligoResult: AligoResponse = await aligoResponse.json()

    // 결과 반환
    if (aligoResult.result_code === '1') {
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
      // IP 인증 오류 체크 - 알리고 관리자 페이지에서 IP 등록 필요
      let errorMessage = aligoResult.message || '문자 발송에 실패했습니다.'
      if (errorMessage.includes('ip') || errorMessage.includes('IP') || errorMessage.includes('인증오류')) {
        errorMessage = 'IP 인증 오류: 알리고 관리자 페이지(smartsms.aligo.in)에서 서버 IP를 등록해주세요.'
      }

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

    // 알리고 잔여 문자 조회 API 호출
    const formData = new FormData()
    formData.append('key', aligoSettings.api_key)
    formData.append('user_id', aligoSettings.user_id)

    const aligoResponse = await fetch(`${ALIGO_API_URL}/remain/`, {
      method: 'POST',
      body: formData
    })

    const aligoResult = await aligoResponse.json()

    if (aligoResult.result_code === '1') {
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
