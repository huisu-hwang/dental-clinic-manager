import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const months = Math.max(1, Math.min(12, Number(url.searchParams.get('months') ?? 4)))
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([])
  const { data: me } = await supabase.from('users').select('clinic_id').eq('id', user.id).single()
  if (!me?.clinic_id) return NextResponse.json([])

  const { data } = await supabase
    .from('investment_profit_snapshots')
    .select('year, month, realized_profit, unrealized_profit, expected_fee')
    .eq('clinic_id', me.clinic_id)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(months)
  return NextResponse.json(data ?? [])
}
