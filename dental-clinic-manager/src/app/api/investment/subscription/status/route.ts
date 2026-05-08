import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const FEATURE_INVESTMENT = 'investment'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const [{ data: sub }, { data: plan }] = await Promise.all([
    supabase
      .from('user_subscriptions')
      .select('*, plan:user_subscription_plans(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('user_subscription_plans')
      .select('*')
      .eq('feature_id', FEATURE_INVESTMENT)
      .maybeSingle(),
  ])

  return NextResponse.json({ subscription: sub, plan })
}
