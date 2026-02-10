import { NextRequest, NextResponse } from 'next/server'

// 서버사이드 전화기 연결 테스트 API
// 브라우저 CORS/Mixed Content 제한을 우회하여 IP 전화기 연결을 확인합니다.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { host, port, auth, pathTemplate } = body

    if (!host) {
      return NextResponse.json(
        { success: false, error: 'IP 주소가 누락되었습니다.' },
        { status: 400 }
      )
    }

    const phonePort = port || 80
    // pathTemplate이 있으면 해당 경로로, 없으면 루트(/)로 테스트
    const testPath = pathTemplate
      ? pathTemplate.replace(/\{number\}/g, '0')
      : '/'
    const url = `http://${host}:${phonePort}${testPath}`

    const headers: HeadersInit = {}

    if (auth?.username) {
      const credentials = Buffer.from(`${auth.username}:${auth.password || ''}`).toString('base64')
      headers['Authorization'] = `Basic ${credentials}`
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000) // 5초 타임아웃

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeout)

      return NextResponse.json({
        success: true,
        message: `전화기에 연결되었습니다. (HTTP ${response.status})`,
        status: response.status,
      })
    } catch (fetchError: unknown) {
      clearTimeout(timeout)

      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError)

      if (errorMessage.includes('abort')) {
        return NextResponse.json({
          success: false,
          error: '전화기 연결 시간이 초과되었습니다. IP 주소와 포트를 확인하세요.',
        })
      }

      // ECONNREFUSED - 포트가 열려있지 않음
      if (errorMessage.includes('ECONNREFUSED')) {
        return NextResponse.json({
          success: false,
          error: `전화기(${host}:${phonePort})에서 연결을 거부했습니다. 포트 번호를 확인하세요.`,
        })
      }

      // EHOSTUNREACH / ENETUNREACH - 호스트에 도달 불가
      if (errorMessage.includes('EHOSTUNREACH') || errorMessage.includes('ENETUNREACH')) {
        return NextResponse.json({
          success: false,
          error: `전화기(${host})에 도달할 수 없습니다. IP 주소와 네트워크 연결을 확인하세요.`,
        })
      }

      // ENOTFOUND - DNS 확인 실패
      if (errorMessage.includes('ENOTFOUND')) {
        return NextResponse.json({
          success: false,
          error: `호스트(${host})를 찾을 수 없습니다. IP 주소를 확인하세요.`,
        })
      }

      return NextResponse.json({
        success: false,
        error: `전화기 연결 실패: ${errorMessage}`,
      })
    }
  } catch (error) {
    console.error('[Phone Test] Error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
