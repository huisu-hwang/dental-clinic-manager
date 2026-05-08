// src/lib/psychology/marketDataFetcher.ts
//
// 군중심리 분석용 통합 마켓 데이터 수집 헬퍼
//   - KR: KIS API (분봉 + 호가 10단계)
//   - US: yahoo-finance2 (분봉만, 호가 미지원)

import YahooFinance from 'yahoo-finance2'
import { getKRMinutePrices, getKRAskingPrice } from '@/lib/kisApiService'

// yahoo-finance2 v3: default export가 클래스 — 모듈 레벨에서 1회 인스턴스화
const yahooFinance = new YahooFinance()
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { investmentDecrypt } from '@/lib/investmentCrypto'
import type { Market } from '@/types/investment'
import type {
  MinuteCandle,
  OrderbookSnapshot,
  PsychologyInputSnapshot,
} from '@/types/psychology'

interface KisCredentialResolved {
  credentialId: string
  appKey: string
  appSecret: string
  isPaperTrading: boolean
}

async function getUserKisCredential(userId: string): Promise<KisCredentialResolved | null> {
  const admin = getSupabaseAdmin()
  if (!admin) return null
  const { data } = await admin
    .from('user_broker_credentials')
    .select('id, app_key_encrypted, app_secret_encrypted, is_paper_trading')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('broker', ['kis', 'kis_kr', 'KIS', 'KIS_KR'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const row = data as {
    id: string
    app_key_encrypted: string
    app_secret_encrypted: string
    is_paper_trading: boolean
  }
  return {
    credentialId: row.id,
    appKey: investmentDecrypt(row.app_key_encrypted),
    appSecret: investmentDecrypt(row.app_secret_encrypted),
    isPaperTrading: !!row.is_paper_trading,
  }
}

async function fetchKRSnapshot(
  userId: string,
  ticker: string,
  count = 60,
  asOf?: Date
): Promise<PsychologyInputSnapshot> {
  const cred = await getUserKisCredential(userId)
  if (!cred) throw new Error('KIS 계좌 연결이 필요합니다')

  // 모의계좌는 당일 데이터만 조회 가능 — 과거 일자 분석 차단
  if (asOf && cred.isPaperTrading) {
    const today = new Date()
    const sameKstDay =
      asOf.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) ===
      today.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
    if (!sameKstDay) {
      throw new Error('모의 계좌는 당일 데이터만 조회 가능합니다. 과거 일자 분석은 실전 계좌가 필요합니다.')
    }
  }

  const krCredential = {
    appKey: cred.appKey,
    appSecret: cred.appSecret,
    isPaperTrading: cred.isPaperTrading,
  }

  const bars = await getKRMinutePrices({
    credentialId: cred.credentialId,
    credential: krCredential,
    ticker,
    intervalMinutes: 1,
    count,
    endTime: asOf,
  })

  const candles: MinuteCandle[] = bars.map((b) => ({
    ts: b.datetime,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }))

  // 호가는 실시간 정보라 과거 시점은 의미 없음 → asOf 지정 시 호가 생략
  let orderbook: OrderbookSnapshot | null = null
  if (!asOf) {
    try {
      const ob = await getKRAskingPrice({
        credentialId: cred.credentialId,
        credential: krCredential,
        ticker,
      })
      orderbook = {
        bids: ob.bids,
        asks: ob.asks,
        totalBidQty: ob.totalBidQty,
        totalAskQty: ob.totalAskQty,
      }
    } catch {
      orderbook = null
    }
  }

  return { candles, orderbook }
}

async function fetchUSSnapshot(
  ticker: string,
  count = 60,
  asOf?: Date
): Promise<PsychologyInputSnapshot> {
  const period2 = asOf ?? new Date()
  // yahoo-finance2 1m 차트는 보통 거래일 7일 이내만 허용 — 안전하게 충분히 받음
  const period1 = new Date(period2.getTime() - Math.max(count, 60) * 60 * 1000)

  const result = (await yahooFinance.chart(ticker, {
    period1,
    period2,
    interval: '1m',
  })) as { quotes?: Array<{
    date?: Date | string
    open?: number | null
    high?: number | null
    low?: number | null
    close?: number | null
    volume?: number | null
  }> }

  const quotes = result?.quotes ?? []

  const candles: MinuteCandle[] = quotes
    .filter((q) => q.open != null && q.close != null && q.high != null && q.low != null)
    .slice(-count)
    .map((q) => ({
      ts: new Date(q.date as Date | string).toISOString(),
      open: Number(q.open),
      high: Number(q.high),
      low: Number(q.low),
      close: Number(q.close),
      volume: Number(q.volume ?? 0),
    }))

  return { candles, orderbook: null }
}

/**
 * 군중심리 분석용 마켓 스냅샷 (분봉 + 호가)
 *
 * @param userId 사용자 ID (KR은 KIS 계좌 조회용, US는 무관)
 * @param ticker 종목 코드 (KR: 6자리, US: 심볼)
 * @param market 'KR' | 'US'
 * @param count 분봉 개수 (기본 60)
 * @param asOf  과거 시점 분석용 — 이 시각까지의 분봉을 받아옴. 미지정 시 현재 시각.
 *              KR 모의계좌는 당일만 / yahoo는 거래일 7일 이내만 지원.
 */
export async function fetchPsychologySnapshot(
  userId: string,
  ticker: string,
  market: Market,
  count = 60,
  asOf?: Date
): Promise<PsychologyInputSnapshot> {
  if (market === 'KR') return fetchKRSnapshot(userId, ticker, count, asOf)
  return fetchUSSnapshot(ticker, count, asOf)
}
