import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/utils/rateLimit'

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request)
    const rateLimitResult = rateLimit(`check-email:${clientIp}`, { windowMs: 15 * 60 * 1000, max: 10 })
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      )
    }

    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ exists: false, error: '이메일을 입력해주세요.' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle()

    if (error) {
      console.error('[check-email] DB 조회 오류:', error)
      return NextResponse.json({ exists: false, error: '이메일 확인 중 오류가 발생했습니다.' }, { status: 500 })
    }

    return NextResponse.json({ exists: !!data })
  } catch (err) {
    console.error('[check-email] 처리 오류:', err)
    return NextResponse.json({ exists: false, error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
