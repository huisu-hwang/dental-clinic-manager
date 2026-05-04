/**
 * Quote API — 종목 현재가 조회
 *
 * GET /api/investment/quote?ticker=AAPL&market=US
 * Response: { data: { price: number, name?: string } }
 *
 * - KR: KIS API getKRRealtimeQuote (credential 필요)
 * - US: yahoo-finance2 fetchCurrentQuote
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { investmentDecrypt } from '@/lib/investmentCrypto'
import { getKRRealtimeQuote } from '@/lib/kisApiService'
import { fetchCurrentQuote } from '@/lib/stockDataService'
import type { Market } from '@/types/investment'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  const url = new URL(request.url)
  const ticker = url.searchParams.get('ticker')?.trim().toUpperCase()
  const marketParam = url.searchParams.get('market')
  const market: Market | null = marketParam === 'KR' || marketParam === 'US' ? marketParam : null

  if (!ticker) return NextResponse.json({ error: 'ticker는 필수입니다.' }, { status: 400 })
  if (!market) return NextResponse.json({ error: 'market은 KR 또는 US여야 합니다.' }, { status: 400 })

  try {
    if (market === 'US') {
      const quote = await fetchCurrentQuote(ticker, 'US')
      return NextResponse.json({ data: { price: quote.price ?? 0 } })
    }

    // KR — KIS credential 필요
    const supabase = getSupabaseAdmin()
    if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

    const { data: cred } = await supabase
      .from('user_broker_credentials')
      .select('id, app_key_encrypted, app_secret_encrypted, is_paper_trading')
      .eq('user_id', auth.user.id)
      .eq('is_active', true)
      .in('broker', ['kis', 'kis_kr', 'KIS', 'KIS_KR'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!cred) {
      return NextResponse.json(
        { error: 'KIS 계좌 연결이 필요합니다', code: 'KIS_REQUIRED' },
        { status: 401 }
      )
    }

    const credentialId = (cred as { id: string }).id
    const credential = {
      appKey: investmentDecrypt((cred as { app_key_encrypted: string }).app_key_encrypted),
      appSecret: investmentDecrypt((cred as { app_secret_encrypted: string }).app_secret_encrypted),
      isPaperTrading: Boolean((cred as { is_paper_trading: boolean }).is_paper_trading),
    }

    const quote = await getKRRealtimeQuote({ credentialId, credential, ticker })
    return NextResponse.json({ data: { price: quote.price } })
  } catch (err) {
    const message = err instanceof Error ? err.message : '현재가 조회 실패'
    console.error('[quote] 실패:', err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
