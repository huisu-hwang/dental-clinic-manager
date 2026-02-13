import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

const CENTREX_API_BASE = 'https://centrex.uplus.co.kr/RestApi'

const ERROR_MESSAGES: Record<string, string> = {
  '0000': '통화가 종료되었습니다.',
  '1001': '필수 파라미터가 누락되었습니다.',
  '1002': '파라미터 값이 올바르지 않습니다.',
  '1003': '인증에 실패했습니다.',
  '1004': '인증 토큰이 만료되었습니다.',
  '4004': '현재 통화 중이 아닙니다.',
  '9999': '서버 내부 오류가 발생했습니다.',
}

function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] || `알 수 없는 오류입니다. (코드: ${code})`
}

function hashPassword(password: string): string {
  return createHash('sha512').update(password).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phoneNumber070, password } = body

    if (!phoneNumber070 || !password) {
      return NextResponse.json(
        { success: false, error: '필수 항목이 누락되었습니다. (070번호, 비밀번호)' },
        { status: 400 }
      )
    }

    const cleanId = phoneNumber070.replace(/[^0-9]/g, '')
    const hashedPassword = hashPassword(password)

    const params = new URLSearchParams({
      id: cleanId,
      pass: hashedPassword,
    })

    const response = await fetch(`${CENTREX_API_BASE}/hangup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `센트릭스 서버 응답 오류 (HTTP ${response.status})` },
        { status: 502 }
      )
    }

    const result = await response.json()

    if (result.SVC_RT === '0000') {
      return NextResponse.json({
        success: true,
        message: '통화가 종료되었습니다.',
      })
    }

    return NextResponse.json(
      { success: false, error: getErrorMessage(result.SVC_RT), code: result.SVC_RT },
      { status: 400 }
    )
  } catch (error) {
    console.error('[Centrex Hangup API] Error:', error)
    return NextResponse.json(
      { success: false, error: '센트릭스 서버에 연결할 수 없습니다.' },
      { status: 500 }
    )
  }
}
