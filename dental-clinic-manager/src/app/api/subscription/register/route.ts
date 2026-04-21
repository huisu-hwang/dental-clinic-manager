// POST /api/subscription/register
// 빌링키 등록 + 첫 결제 + 다음달 예약

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registerSubscription } from '@/lib/subscriptionService'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  // 사용자의 클리닉 정보 조회
  const { data: userData } = await supabase
    .from('users')
    .select('clinic_id, name, email')
    .eq('id', user.id)
    .single()

  if (!userData?.clinic_id) {
    return NextResponse.json({ error: '클리닉 정보를 찾을 수 없습니다' }, { status: 400 })
  }

  const body = await request.json()
  const { billingKey, planId, cardName, cardNumberLast4 } = body

  if (!billingKey || !planId) {
    return NextResponse.json({ error: '필수 정보가 누락되었습니다' }, { status: 400 })
  }

  const result = await registerSubscription({
    clinicId: userData.clinic_id,
    planId,
    billingKey,
    cardName: cardName ?? '',
    cardNumberLast4: cardNumberLast4 ?? '',
    customerName: userData.name ?? '',
    customerEmail: userData.email ?? user.email ?? '',
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
