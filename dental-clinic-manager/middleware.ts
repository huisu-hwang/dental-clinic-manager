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
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Middleware] Supabase 환경 변수가 설정되지 않았습니다.')
    return supabaseResponse
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        // Server Component에 갱신된 토큰 전달
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
        })

        // NextResponse 생성 (갱신된 쿠키 포함)
        supabaseResponse = NextResponse.next({
          request,
        })

        // 브라우저에 갱신된 토큰 전달
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options)
        })
      },
    },
  })

  // IMPORTANT: getUser() 호출로 토큰 재검증
  // 이 호출이 내부적으로 토큰 갱신을 트리거합니다
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // 로그인 페이지/회원가입 페이지는 인증 불필요
  const isPublicPath =
    request.nextUrl.pathname === '/' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/pending-approval' ||
    request.nextUrl.pathname === '/update-password' ||
    request.nextUrl.pathname.startsWith('/test')

  // 로그인 안 되어 있고, 보호된 페이지 접근 시 → 로그인 페이지로 리다이렉트
  if (!user && !isPublicPath) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    redirectUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
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
