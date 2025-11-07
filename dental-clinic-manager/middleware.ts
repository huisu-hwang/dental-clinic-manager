import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Next.js Middleware for Supabase Auth
 *
 * 역할:
 * 1. 만료된 Auth 토큰을 자동으로 갱신
 * 2. 갱신된 토큰을 Server Component에 전달 (request.cookies)
 * 3. 갱신된 토큰을 브라우저에 전달 (response.cookies)
 *
 * 참고: https://supabase.com/docs/guides/auth/server-side/nextjs
 *
 * 중요: Supabase 공식 문서 패턴을 정확히 따름
 * - NextResponse는 middleware 함수 시작 시 한 번만 생성
 * - setAll에서는 response.cookies만 업데이트 (재생성 금지!)
 */
export async function middleware(request: NextRequest) {
  // 1. NextResponse를 한 번만 생성 (여기서만!)
  const response = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Middleware] Supabase 환경 변수가 설정되지 않았습니다.')
    return response
  }

  // 2. Supabase 클라이언트 생성
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        // 중요: response는 재생성하지 않고, 기존 response의 cookies만 업데이트
        cookiesToSet.forEach(({ name, value, options }) => {
          // Server Component가 사용할 수 있도록 request에도 설정
          request.cookies.set(name, value)
          // 브라우저로 전달할 response에 설정
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  // 3. getUser() 호출로 토큰 재검증 및 갱신 트리거
  // 만료된 토큰이 있으면 자동으로 refresh되고 setAll이 호출됨
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 4. Public 경로 정의
  const isPublicPath =
    request.nextUrl.pathname === '/' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/pending-approval' ||
    request.nextUrl.pathname === '/update-password' ||
    request.nextUrl.pathname.startsWith('/test')

  // 5. 인증 필요한 경로에 미인증 사용자 접근 시 리다이렉트
  if (!user && !isPublicPath) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    redirectUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // 6. 갱신된 쿠키가 포함된 response 반환
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
