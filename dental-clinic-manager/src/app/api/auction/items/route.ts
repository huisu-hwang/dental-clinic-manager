import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listAuctionItems } from '@/lib/auction/auctionService'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const result = await listAuctionItems({
    sido: sp.get('sido') ?? undefined,
    sigungu: sp.get('sigungu') ?? undefined,
    propertyType: (sp.get('propertyType') ?? undefined) as any,
    minDiscountPct: numOrUndef(sp.get('minDiscountPct')),
    minFailureCount: numOrUndef(sp.get('minFailureCount')),
    maxDDay: numOrUndef(sp.get('maxDDay')),
    minArea: numOrUndef(sp.get('minArea')),
    maxArea: numOrUndef(sp.get('maxArea')),
    minPrice: numOrUndef(sp.get('minPrice')),
    maxPrice: numOrUndef(sp.get('maxPrice')),
    minAppraisalPrice: numOrUndef(sp.get('minAppraisalPrice')),
    maxAppraisalPrice: numOrUndef(sp.get('maxAppraisalPrice')),
    sort: (sp.get('sort') ?? undefined) as any,
    cursor: numOrUndef(sp.get('cursor')),
    limit: numOrUndef(sp.get('limit')),
  })

  return NextResponse.json(result)
}

function numOrUndef(v: string | null): number | undefined {
  if (v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
