import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * 비밀번호 재설정 콜백 API
 *
 * Supabase 이메일 링크 → 이 API로 도착 → code 교환 → 대시보드로 리다이렉트
 * PWA가 가로채더라도 서버사이드 API이므로 정상 실행됩니다.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    console.error('[ResetCallback] code 파라미터 없음')
    return NextResponse.redirect(new URL('/?show=login', request.url))
  }

  try {
    const supabase = await createClient()

    // 기존 세션 로그아웃 후 recovery code 교환
    await supabase.auth.signOut()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[ResetCallback] Code 교환 실패:', error.message)
      return NextResponse.redirect(new URL('/update-password', request.url))
    }

    console.log('[ResetCallback] Code 교환 성공 → /update-password?mode=recovery')
    return NextResponse.redirect(new URL('/update-password?mode=recovery', request.url))
  } catch (err) {
    console.error('[ResetCallback] 처리 오류:', err)
    return NextResponse.redirect(new URL('/update-password', request.url))
  }
}
