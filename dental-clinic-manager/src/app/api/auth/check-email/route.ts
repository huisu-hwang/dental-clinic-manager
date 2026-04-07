import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
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
