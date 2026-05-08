import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registerUserSubscription } from '@/lib/userBillingService'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { authKey, customerKey, planId, amount, planName } = body
  if (!authKey || !customerKey || !planId || !amount || !planName) {
    return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })
  }

  const { data: u } = await supabase
    .from('users')
    .select('name, email')
    .eq('id', user.id)
    .single()

  const result = await registerUserSubscription({
    userId: user.id,
    planId,
    authKey,
    customerKey,
    customerName: u?.name ?? '',
    customerEmail: u?.email ?? user.email ?? '',
    amount,
    planName,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error, code: result.errorCode }, { status: 400 })
  }
  return NextResponse.json({ success: true, paymentKey: result.paymentKey })
}
