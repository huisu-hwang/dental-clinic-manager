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
  const next = searchParams.get('next') ?? '/'

  console.log('[Auth Callback] Processing email verification', { token_hash, type })

  if (token_hash && type) {
    const supabase = await createClient()

    const { error } = await supabase.auth.verifyOtp({
      type: type as any,
      token_hash,
    })

    if (!error) {
      console.log('[Auth Callback] Email verification successful')
      // 인증 성공 시 지정된 페이지로 리다이렉트
      return NextResponse.redirect(new URL(next, request.url))
    }

    console.error('[Auth Callback] Email verification failed:', error)
  }

  // token_hash가 없거나 인증 실패 시 에러 페이지로
  console.error('[Auth Callback] Missing token_hash or verification failed')
  return NextResponse.redirect(new URL('/auth/auth-code-error', request.url))
}
