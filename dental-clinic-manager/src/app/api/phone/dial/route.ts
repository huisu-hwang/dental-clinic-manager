import { NextRequest, NextResponse } from 'next/server'

// 서버사이드 전화 프록시 API
// 브라우저 CORS 제한을 우회하여 IP 전화기로 HTTP 요청을 전달합니다.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { host, port, pathTemplate, method, phoneNumber, auth } = body

    if (!host || !pathTemplate || !phoneNumber) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다. (host, pathTemplate, phoneNumber)' },
        { status: 400 }
      )
    }

    // IP 전화기 URL 구성
    const phonePort = port || 80
    const path = pathTemplate.replace('{number}', encodeURIComponent(phoneNumber))
    const url = `http://${host}:${phonePort}${path}`
    const httpMethod = method || 'GET'

    // 요청 헤더 구성
    const headers: HeadersInit = {}

    // Basic Auth 지원
    if (auth?.username) {
      const credentials = Buffer.from(`${auth.username}:${auth.password || ''}`).toString('base64')
      headers['Authorization'] = `Basic ${credentials}`
    }

    // IP 전화기로 요청 전송
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000) // 10초 타임아웃

    try {
      const response = await fetch(url, {
        method: httpMethod,
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeout)

      return NextResponse.json({
        success: true,
        message: `전화기로 다이얼 요청을 보냈습니다.`,
        status: response.status,
      })
    } catch (fetchError: unknown) {
      clearTimeout(timeout)

      // 타임아웃 또는 네트워크 에러
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError)

      if (errorMessage.includes('abort')) {
        return NextResponse.json({
          success: false,
          error: '전화기 연결 시간이 초과되었습니다. IP 주소와 포트를 확인하세요.',
        })
      }

      return NextResponse.json({
        success: false,
        error: `전화기 연결 실패: ${errorMessage}`,
      })
    }
  } catch (error) {
    console.error('[Phone Dial Proxy] Error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
