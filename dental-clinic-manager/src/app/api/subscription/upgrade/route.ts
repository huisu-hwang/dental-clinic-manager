// POST /api/subscription/upgrade
// 플랜 변경 (업그레이드/다운그레이드)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { changePlan } from '@/lib/subscriptionService'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { data: userData } = await supabase
    .from('users')
    .select('clinic_id, name, email')
    .eq('id', user.id)
    .single()

  if (!userData?.clinic_id) {
    return NextResponse.json({ error: '클리닉 정보를 찾을 수 없습니다' }, { status: 400 })
  }

  const body = await request.json()
  const { newPlanId } = body

  if (!newPlanId) {
    return NextResponse.json({ error: '플랜 ID가 필요합니다' }, { status: 400 })
  }

  const result = await changePlan({
    clinicId: userData.clinic_id,
    newPlanId,
    customerName: userData.name ?? '',
    customerEmail: userData.email ?? user.email ?? '',
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true, chargedAmount: result.chargedAmount })
}
