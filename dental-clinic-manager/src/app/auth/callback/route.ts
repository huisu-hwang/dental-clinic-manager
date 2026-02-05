import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * 이메일 인증 콜백 라우트
 *
 * Supabase에서 이메일 인증 링크를 클릭하면 이 라우트로 리다이렉트됩니다.
 * token_hash를 사용하여 이메일 인증을 완료하고 사용자를 홈페이지로 안내합니다.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const code = searchParams.get('code')
  let next = searchParams.get('next') ?? '/'

  // 비밀번호 재설정(recovery) 타입인 경우 강제로 비밀번호 변경 페이지로 이동
  if (type === 'recovery') {
    console.log('[Auth Callback] Recovery type detected, forcing next to /update-password')
    next = '/update-password'
  }

  console.log('[Auth Callback] Processing auth callback', { hasTokenHash: !!token_hash, hasCode: !!code, type, next })

  // 1. PKCE Code Flow 처리
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      console.log('[Auth Callback] Code exchange successful, redirecting to:', next)
      return NextResponse.redirect(new URL(next, request.url))
    }
    
    console.error('[Auth Callback] Code exchange failed:', error)
    return NextResponse.redirect(new URL('/auth/auth-code-error', request.url))
  }

  // 2. Implicit/MagicLink Flow 처리 (token_hash)
  if (token_hash && type) {
    const supabase = await createClient()

    const { error } = await supabase.auth.verifyOtp({
      type: type as any,
      token_hash,
    })

    if (!error) {
      console.log('[Auth Callback] Email verification successful')

      // 사용자 프로필 조회하여 status 확인
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        console.log('[Auth Callback] Checking user status for:', user.id)
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('status, email')
          .eq('id', user.id)
          .single()

        if (profileError) {
          console.error('[Auth Callback] Error fetching user profile:', profileError)
        } else if (profile) {
          console.log('[Auth Callback] User profile:', { status: profile.status, email: profile.email })

          // status에 따라 적절한 페이지로 리다이렉트
          if (profile.status === 'pending') {
            console.log('[Auth Callback] User is pending approval, redirecting to /pending-approval')
            return NextResponse.redirect(new URL('/pending-approval', request.url))
          } else if (profile.status === 'rejected') {
            console.log('[Auth Callback] User was rejected, redirecting to /pending-approval')
            return NextResponse.redirect(new URL('/pending-approval', request.url))
          } else if (profile.status === 'suspended') {
            console.log('[Auth Callback] User is suspended, redirecting to /pending-approval')
            return NextResponse.redirect(new URL('/pending-approval', request.url))
          }
          // status='active'만 메인 페이지로
          console.log('[Auth Callback] User is active, redirecting to:', next)
        }
      }

      // status='active' 또는 프로필 조회 실패 시 지정된 페이지로 리다이렉트
      return NextResponse.redirect(new URL(next, request.url))
    }

    console.error('[Auth Callback] Email verification failed:', error)
  }

  // token_hash가 없거나 인증 실패 시 에러 페이지로
  console.error('[Auth Callback] Missing token_hash or verification failed')
  return NextResponse.redirect(new URL('/auth/auth-code-error', request.url))
}
