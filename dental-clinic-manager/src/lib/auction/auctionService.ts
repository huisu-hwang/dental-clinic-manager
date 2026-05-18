import { createClient } from '@supabase/supabase-js'
import type { AuctionItem, MarketPrice, PropertyType } from '@/types/auction'

export interface ListFilter {
  sido?: string
  sigungu?: string
  propertyType?: PropertyType
  minDiscountPct?: number
  minFailureCount?: number
  maxDDay?: number
  minArea?: number
  maxArea?: number
  minPrice?: number
  maxPrice?: number
  minAppraisalPrice?: number
  maxAppraisalPrice?: number
  sort?: 'discount_desc' | 'd_day_asc' | 'price_asc' | 'failure_desc'
  cursor?: number
  limit?: number
}

export interface ListResult {
  items: Array<AuctionItem & { market: MarketPrice | null }>
  nextCursor: number | null
  total: number
}

export function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

export async function listAuctionItems(f: ListFilter): Promise<ListResult> {
  const supabase = getServerSupabase()
  const limit = Math.min(f.limit ?? 30, 100)
  const offset = f.cursor ?? 0

  // status='active' 부분 인덱스(20260516_auction_items_perf_indexes) 덕분에
  // 30,000+ 행에서도 정렬·필터·exact count 가 1초 이내에 끝난다.
  //
  // 매각기일이 이미 지났지만 결과(낙찰/유찰)가 갱신되지 않아 status='active' 로 남은 매물은
  // 사용자에게 노이즈만 만든다. next_auction_date >= 오늘 또는 null 인 매물만 노출한다.
  const todayIso = new Date().toISOString().slice(0, 10)
  let q = supabase
    .from('auction_items')
    .select('*, market:auction_market_prices(source, matched_complex, median_price_3m, trade_count_3m, median_price_12m, last_trade_date, match_confidence)', { count: 'exact' })
    .eq('status', 'active')
    .or(`next_auction_date.gte.${todayIso},next_auction_date.is.null`)
    .range(offset, offset + limit - 1)

  if (f.sido) q = q.eq('sido', f.sido)
  if (f.sigungu) q = q.eq('sigungu', f.sigungu)
  if (f.propertyType) q = q.eq('property_type', f.propertyType)
  if (f.minDiscountPct !== undefined) q = q.gte('discount_rate', f.minDiscountPct)
  if (f.minFailureCount !== undefined) q = q.gte('failure_count', f.minFailureCount)
  if (f.minArea !== undefined) q = q.gte('building_area_m2', f.minArea)
  if (f.maxArea !== undefined) q = q.lte('building_area_m2', f.maxArea)
  if (f.minPrice !== undefined) q = q.gte('min_bid_price', f.minPrice)
  if (f.maxPrice !== undefined) q = q.lte('min_bid_price', f.maxPrice)
  if (f.minAppraisalPrice !== undefined) q = q.gte('appraisal_price', f.minAppraisalPrice)
  if (f.maxAppraisalPrice !== undefined) q = q.lte('appraisal_price', f.maxAppraisalPrice)
  if (f.maxDDay !== undefined) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + f.maxDDay)
    q = q.lte('next_auction_date', cutoff.toISOString().slice(0, 10))
  }

  switch (f.sort ?? 'discount_desc') {
    case 'discount_desc': q = q.order('discount_rate', { ascending: false, nullsFirst: false }); break
    case 'd_day_asc':     q = q.order('next_auction_date', { ascending: true, nullsFirst: false }); break
    case 'price_asc':     q = q.order('min_bid_price', { ascending: true }); break
    case 'failure_desc':  q = q.order('failure_count', { ascending: false }); break
  }

  const { data, error, count } = await q
  if (error) throw new Error(error.message)

  const rows = (data ?? []).map(r => {
    const m = Array.isArray(r.market) ? r.market[0] : r.market
    return { ...r, market: m ?? null } as AuctionItem & { market: MarketPrice | null }
  })

  const nextCursor = rows.length === limit ? offset + limit : null
  return { items: rows, nextCursor, total: count ?? 0 }
}
