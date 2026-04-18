// POST /api/subscription/cancel
// 구독 취소 (즉시 or 기간 만료 후)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cancelSubscription } from '@/lib/subscriptionService'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { data: userData } = await supabase
    .from('users')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!userData?.clinic_id) {
    return NextResponse.json({ error: '클리닉 정보를 찾을 수 없습니다' }, { status: 400 })
  }

  // 오너 또는 마스터 관리자만 구독 취소 가능
  if (!['owner', 'master_admin'].includes(userData.role)) {
    return NextResponse.json({ error: '구독 취소 권한이 없습니다' }, { status: 403 })
  }

  const body = await request.json()
  const immediate = body.immediate === true

  const result = await cancelSubscription({
    clinicId: userData.clinic_id,
    immediate,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    message: immediate
      ? '구독이 즉시 취소되었습니다.'
      : '현재 결제 기간이 끝나면 구독이 종료됩니다.',
  })
}
