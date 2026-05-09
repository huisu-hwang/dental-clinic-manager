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
  const item = await sb.from('auction_items').select('sido, sigungu, eupmyeondong, property_type').eq('id', itemId).single()
  if (!item.data) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data, error } = await sb
    .from('auction_history')
    .select('sold_price, bid_count, recorded_at, items:auction_items!inner(sido, sigungu, eupmyeondong, property_type, appraisal_price)')
    .eq('result', 'sold')
    .gte('recorded_at', sixMonthsAgo.toISOString())
    .filter('items.sido', 'eq', item.data.sido)
    .filter('items.sigungu', 'eq', item.data.sigungu)
    .filter('items.eupmyeondong', 'eq', item.data.eupmyeondong)
    .filter('items.property_type', 'eq', item.data.property_type)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ratios = (data ?? [])
    .map((r: any) => {
      const it = Array.isArray(r.items) ? r.items[0] : r.items
      if (!r.sold_price || !it?.appraisal_price) return null
      return r.sold_price / it.appraisal_price * 100
    })
    .filter((v): v is number => v !== null)

  const avg = ratios.length > 0 ? ratios.reduce((s, v) => s + v, 0) / ratios.length : null
  const bidCounts = (data ?? [])
    .map((r: any) => r.bid_count)
    .filter((v: any): v is number => typeof v === 'number')
  const avgBidCount = bidCounts.length > 0
    ? bidCounts.reduce((s: number, v: number) => s + v, 0) / bidCounts.length
    : null

  return NextResponse.json({
    sample_count: ratios.length,
    avg_sold_to_appraisal_pct: avg !== null ? Math.round(avg * 10) / 10 : null,
    avg_bid_count: avgBidCount !== null ? Math.round(avgBidCount * 10) / 10 : null,
  })
}
