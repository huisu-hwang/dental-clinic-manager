import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registerSubscription } from '@/lib/billingService'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: u } = await supabase
    .from('users').select('clinic_id, role, name, email')
    .eq('id', user.id).single()

  if (!u?.clinic_id) return NextResponse.json({ error: '클리닉 정보 없음' }, { status: 400 })
  if (!['owner', 'master_admin'].includes(u.role)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const body = await request.json()
  const { authKey, customerKey, planId } = body
  if (!authKey || !customerKey || !planId) {
    return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })
  }

  const result = await registerSubscription({
    clinicId: u.clinic_id,
    planId,
    authKey,
    customerKey,
    customerName: u.name ?? '',
    customerEmail: u.email ?? user.email ?? '',
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error, code: result.errorCode }, { status: 400 })
  }
  return NextResponse.json({
    success: true,
    subscriptionId: result.subscriptionId,
    paymentKey: result.paymentKey,
  })
}
