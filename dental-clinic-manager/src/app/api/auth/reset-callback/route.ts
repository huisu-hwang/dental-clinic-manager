import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/utils/rateLimit'

/**
 * 비밀번호 재설정 콜백 API
 *
 * Supabase 이메일 링크 → 이 API로 도착 → 세션 생성 → /update-password로 리다이렉트
 *
 * PKCE의 code_verifier 문제:
 * - PKCE code는 요청한 브라우저에 code_verifier가 저장되어 있어야 교환 가능
 * - 이메일 링크가 다른 브라우저/도메인/PWA에서 열리면 code_verifier가 없어 실패
 * - 따라서 token_hash + verifyOtp를 사용하여 PKCE 없이 세션 생성
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const code = searchParams.get('code')
  const type = searchParams.get('type')

  if (!token_hash && !code) {
    console.error('[ResetCallback] token_hash/code 파라미터 없음')
    return NextResponse.redirect(new URL('/?show=login', request.url))
  }

  try {
    const clientIp = getClientIp(request)
    const rateLimitResult = rateLimit(`reset-callback:${clientIp}`, { windowMs: 15 * 60 * 1000, max: 5 })
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      )
    }

    const supabase = await createClient()

    // 기존 세션 로그아웃
    await supabase.auth.signOut()

    let error = null

    if (token_hash) {
      // token_hash 방식: PKCE code_verifier 불필요 (크로스 브라우저/도메인에서도 작동)
      console.log('[ResetCallback] token_hash로 verifyOtp 시도')
      const result = await supabase.auth.verifyOtp({
        token_hash,
        type: (type as 'recovery') || 'recovery',
      })
      error = result.error
    } else if (code) {
      // code 방식: 같은 브라우저에서만 작동 (fallback)
      console.log('[ResetCallback] code로 exchangeCodeForSession 시도')
      const result = await supabase.auth.exchangeCodeForSession(code)
      error = result.error
    }

    if (error) {
      console.error('[ResetCallback] 세션 생성 실패:', error.message)
      const errorUrl = new URL('/update-password?mode=invalid', request.url)
      return NextResponse.redirect(errorUrl)
    }

    console.log('[ResetCallback] 세션 생성 성공 → /update-password?mode=recovery')
    return NextResponse.redirect(new URL('/update-password?mode=recovery', request.url))
  } catch (err) {
    console.error('[ResetCallback] 처리 오류:', err)
    return NextResponse.redirect(new URL('/update-password?mode=invalid', request.url))
  }
}
