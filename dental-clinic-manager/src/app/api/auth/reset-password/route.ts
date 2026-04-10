import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/utils/rateLimit'

/**
 * 비밀번호 재설정 이메일 발송 API (서버사이드)
 *
 * 서버사이드에서 VERCEL_URL을 사용하여 redirectTo를 설정.
 * VERCEL_URL은 *.vercel.app 도메인이므로 PWA scope(hi-clinic.co.kr) 밖이라
 * 이메일 링크 클릭 시 PWA가 가로채지 않고 브라우저에서 열림.
 */
export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request)
    const rateLimitResult = rateLimit(`reset-password:${clientIp}`, { windowMs: 15 * 60 * 1000, max: 5 })
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      )
    }

    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: '이메일을 입력해주세요.' }, { status: 400 })
    }

    const supabase = await createClient()

    // 이메일 존재 여부 확인
    const { data: userExists } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle()

    if (!userExists) {
      return NextResponse.json(
        { error: '입력하신 이메일 주소로 가입된 계정이 없습니다. 이메일 주소를 다시 확인해주세요.' },
        { status: 404 }
      )
    }

    // redirectTo를 VERCEL_URL (*.vercel.app)로 설정하여 PWA scope 밖으로
    // PWA는 hi-clinic.co.kr에 설치되므로 *.vercel.app 링크는 브라우저에서 열림
    const getRedirectUrl = () => {
      // VERCEL_URL: Vercel이 서버사이드에서 자동 주입 (*.vercel.app)
      if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}/api/auth/reset-callback?intent=recovery`
      }
      // NEXT_PUBLIC_VERCEL_URL 도 확인 (빌드 시 주입)
      if (process.env.NEXT_PUBLIC_VERCEL_URL) {
        return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}/api/auth/reset-callback?intent=recovery`
      }
      // fallback: SITE_URL 사용
      if (process.env.NEXT_PUBLIC_SITE_URL) {
        return `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/reset-callback?intent=recovery`
      }
      // 개발 환경
      const host = request.headers.get('host') || 'localhost:3000'
      const protocol = host.includes('localhost') ? 'http' : 'https'
      return `${protocol}://${host}/api/auth/reset-callback?intent=recovery`
    }

    const redirectUrl = getRedirectUrl()
    console.log('[ResetPassword] Redirect URL:', redirectUrl)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.toLowerCase().trim(),
      { redirectTo: redirectUrl }
    )

    if (resetError) {
      console.error('[ResetPassword] 재설정 오류:', resetError)
      return NextResponse.json({ error: '이메일 전송에 실패했습니다.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[ResetPassword] 처리 오류:', err)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
