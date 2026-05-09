import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerSupabase } from '@/lib/auction/auctionService'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sb = getServerSupabase()
  const { data, error } = await sb
    .from('auction_user_favorites')
    .select('*, item:auction_items(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const { itemId, target_bid_price, expected_extra_cost, expected_monthly_rent, memo } = body
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })

  const sb = getServerSupabase()
  const { error } = await sb
    .from('auction_user_favorites')
    .upsert({
      user_id: user.id,
      item_id: itemId,
      target_bid_price: target_bid_price ?? null,
      expected_extra_cost: expected_extra_cost ?? null,
      expected_monthly_rent: expected_monthly_rent ?? null,
      memo: memo ?? null,
    }, { onConflict: 'user_id,item_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const { itemId } = body
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })

  const sb = getServerSupabase()
  const { error } = await sb
    .from('auction_user_favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('item_id', itemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
