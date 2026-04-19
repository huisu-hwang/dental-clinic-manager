// src/app/api/staff/approve-bulk-auto/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { countActiveEmployees, getSubscription, getPlanById } from '@/lib/subscriptionService'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('id, clinic_id, role').eq('id', user.id).single()
  if (!me?.clinic_id || !['owner', 'master_admin'].includes(me.role)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const sub = await getSubscription(me.clinic_id)
  const plan = sub?.plan_id ? await getPlanById(sub.plan_id) : null
  const limit = plan?.max_users ?? 4

  const active = await countActiveEmployees(me.clinic_id)
  const available = Math.max(0, limit - active)
  if (available === 0) {
    return NextResponse.json({ approvedCount: 0, remainingPending: 0 })
  }

  const { data: pending } = await supabase
    .from('users')
    .select('id')
    .eq('clinic_id', me.clinic_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(available)

  const ids = (pending ?? []).map((p) => p.id)
  if (ids.length === 0) return NextResponse.json({ approvedCount: 0, remainingPending: 0 })

  const { error } = await supabase
    .from('users')
    .update({ status: 'active', approved_at: new Date().toISOString() })
    .in('id', ids)
    .eq('clinic_id', me.clinic_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 전체 대기자 재집계
  const { count: remaining } = await supabase
    .from('users').select('id', { count: 'exact', head: true })
    .eq('clinic_id', me.clinic_id).eq('status', 'pending')

  return NextResponse.json({ approvedCount: ids.length, remainingPending: remaining ?? 0 })
}
