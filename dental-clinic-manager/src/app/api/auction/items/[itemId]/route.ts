import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerSupabase } from '@/lib/auction/auctionService'

export const runtime = 'nodejs'

interface Ctx { params: Promise<{ itemId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { itemId } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sb = getServerSupabase()
  const [item, market, rights, history, ai] = await Promise.all([
    sb.from('auction_items').select('*').eq('id', itemId).single(),
    sb.from('auction_market_prices').select('*').eq('item_id', itemId),
    sb.from('auction_rights_analysis').select('*').eq('item_id', itemId).maybeSingle(),
    sb.from('auction_history').select('*').eq('item_id', itemId).order('round_no', { ascending: true }),
    sb.from('auction_ai_comments').select('*').eq('item_id', itemId).order('generated_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (item.error || !item.data) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({
    item: item.data,
    market: market.data?.[0] ?? null,
    rights: rights.data ?? null,
    history: history.data ?? [],
    ai: ai.data ?? null,
  })
}
