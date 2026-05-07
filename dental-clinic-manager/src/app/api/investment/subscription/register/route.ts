// src/app/api/investment/subscription/register/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { registerUserSubscription } from '@/lib/userSubscriptionService'

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data: userData } = await admin
    .from('users')
    .select('name, email')
    .eq('id', auth.user.id)
    .single()

  const body = await request.json()
  const { billingKey, planId, cardName, cardNumberLast4 } = body
  if (!billingKey || !planId) {
    return NextResponse.json({ error: '필수 정보가 누락되었습니다' }, { status: 400 })
  }

  const result = await registerUserSubscription({
    userId: auth.user.id,
    planId,
    billingKey,
    cardName: cardName ?? '',
    cardNumberLast4: cardNumberLast4 ?? '',
    customerName: (userData as { name?: string } | null)?.name ?? '',
    customerEmail: (userData as { email?: string } | null)?.email ?? '',
  })

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
