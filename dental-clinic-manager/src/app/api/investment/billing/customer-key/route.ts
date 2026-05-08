import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateUserCustomerKey } from '@/lib/userBillingService'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { planId } = body
  if (!planId) return NextResponse.json({ error: 'planId 필수' }, { status: 400 })

  const customerKey = await getOrCreateUserCustomerKey(user.id, planId)
  return NextResponse.json({ customerKey })
}
