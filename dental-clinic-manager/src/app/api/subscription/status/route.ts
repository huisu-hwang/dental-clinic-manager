// GET /api/subscription/status
// 현재 구독 상태 조회

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionStatus } from '@/lib/subscriptionService'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { data: userData } = await supabase
    .from('users')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!userData?.clinic_id) {
    return NextResponse.json({ error: '클리닉 정보를 찾을 수 없습니다' }, { status: 400 })
  }

  const status = await getSubscriptionStatus(userData.clinic_id)
  return NextResponse.json(status)
}
