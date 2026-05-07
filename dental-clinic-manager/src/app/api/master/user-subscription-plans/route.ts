import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  const auth = await requireAuth(['master_admin'])
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data } = await admin
    .from('user_subscription_plans')
    .select('*')
    .order('feature_id')
  return NextResponse.json(data ?? [])
}
