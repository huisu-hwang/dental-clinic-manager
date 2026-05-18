import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { searchKRTicker } from '@/lib/krTickerDict'
import { searchUSTicker } from '@/lib/usTickerDict'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireAuth(['owner', 'vice_director', 'manager'])
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < 1) {
    return NextResponse.json({ data: [] })
  }

  const krResults = searchKRTicker(q, 5).map(e => ({
    ticker: e.ticker, name: e.name, market: 'KR' as const,
  }))
  const usResults = searchUSTicker(q, 5).map(e => ({
    ticker: e.ticker, name: e.name, market: 'US' as const,
  }))

  // KR 우선 (한글 검색 시 더 의미 있는 매칭)
  return NextResponse.json({ data: [...krResults, ...usResults].slice(0, 10) })
}
