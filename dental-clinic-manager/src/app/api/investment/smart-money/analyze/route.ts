/**
 * Smart Money Analysis API
 *
 * POST /api/investment/smart-money/analyze
 * Request:  { ticker: string; market: 'KR' | 'US'; includeLLM?: boolean }
 * Response: { data: SmartMoneyAnalysis & { triggeredAlerts?: ... } }
 *
 * 처리 흐름:
 * 1. requireAuth → userId
 * 2. 활성 KIS credential 조회 (없으면 KR은 401 KIS_REQUIRED)
 * 3. 시장별 데이터 수집:
 *    - KR: getKRRealtimeQuote / getKRMinutePrices(5m, 78bars) / getKRInvestorTrend(20d)
 *          + getKRDailyPrices(45일분) → 20일 고저
 *    - US: yahoo-finance2 (fetchCurrentQuote, fetchIntradayPrices)
 * 4. 엔진 호출: VWAP, Wyckoff, AlgoFootprint, InvestorFlow → Score
 * 5. includeLLM=true면 generateLLMComment 호출
 * 6. 매칭 알림 트리거 → smart_money_signal_log 기록 + last_triggered_at 갱신
 * 7. 응답 조립
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { investmentDecrypt } from '@/lib/investmentCrypto'
import {
  getKRRealtimeQuote,
  getKRMinutePrices,
  getKRInvestorTrend,
  getKRDailyPrices,
  type KRMinuteBar,
  type KRInvestorDay,
} from '@/lib/kisApiService'
import { fetchIntradayPrices } from '@/lib/intradayDataService'
import { fetchCurrentQuote } from '@/lib/stockDataService'
import { calculateVWAP, type VWAPInputBar } from '@/lib/smartMoney/vwapEngine'
import { detectWyckoff, type WyckoffBar } from '@/lib/smartMoney/wyckoffEngine'
import { analyzeAlgoFootprint, type AlgoBar } from '@/lib/smartMoney/algoFootprintEngine'
import { analyzeInvestorFlow } from '@/lib/smartMoney/investorFlowAnalyzer'
import { computeSmartMoneyScore } from '@/lib/smartMoney/smartMoneyScorer'
import { generateLLMComment } from '@/lib/smartMoney/llmAnalyzer'
// ===== 정교화 엔진 =====
import { detectWyckoffPhase, type PhaseBar } from '@/lib/smartMoney/wyckoffPhaseEngine'
import { analyzeLiquidity, type LiquidityBar } from '@/lib/smartMoney/liquidityEngine'
import { analyzeMarketStructure, type Bar as StructureBar } from '@/lib/smartMoney/marketStructureEngine'
import { detectOrderBlocksAndFvg, type Bar as OBBar } from '@/lib/smartMoney/orderBlockFvgEngine'
import { detectTraps, type Bar as TrapBar } from '@/lib/smartMoney/trapEngine'
import { analyzeVSA, type Bar as VSABar } from '@/lib/smartMoney/vsaEngine'
import { analyzeSession, type SessionBar } from '@/lib/smartMoney/sessionAnalyzer'
import { analyzeNewsContext, type NewsBar } from '@/lib/smartMoney/newsContextEngine'
import type { Market, OHLCV } from '@/types/investment'
import type {
  SmartMoneyAnalysis,
  SmartMoneyAlert,
  InvestorTrendRow,
  InvestorFlowResult,
} from '@/types/smartMoney'

export const dynamic = 'force-dynamic'

// ============================================
// 내부 타입
// ============================================

interface DecryptedKisCredential {
  credentialId: string
  appKey: string
  appSecret: string
  accountNumber: string
  isPaperTrading: boolean
}

/** 분석에 사용하는 정규화된 분봉 (엔진 입력 공통 형태) */
interface NormalizedBar {
  datetime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface AnalysisResponse extends SmartMoneyAnalysis {
  triggeredAlerts?: Pick<SmartMoneyAlert, 'id' | 'ticker' | 'market' | 'signal_types'>[]
}

// ============================================
// 메인 핸들러
// ============================================

export async function POST(request: NextRequest) {
  // 1. 인증
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }
  const userId = auth.user.id

  // 2. 입력 파싱
  let body: { ticker?: unknown; market?: unknown; includeLLM?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 })
  }

  const ticker = typeof body.ticker === 'string' ? body.ticker.trim().toUpperCase() : ''
  const market = body.market === 'KR' || body.market === 'US' ? (body.market as Market) : null
  const includeLLM = Boolean(body.includeLLM)

  if (!ticker) {
    return NextResponse.json({ error: 'ticker는 필수입니다.' }, { status: 400 })
  }
  if (!market) {
    return NextResponse.json({ error: 'market은 KR 또는 US여야 합니다.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  // 3. KIS credential (KR엔 필수, US엔 옵션)
  let kisCredential: DecryptedKisCredential | null = null
  try {
    kisCredential = await loadActiveKisCredential(userId)
  } catch (err) {
    console.error('[smart-money/analyze] credential 조회 실패:', err)
  }

  if (market === 'KR' && !kisCredential) {
    return NextResponse.json(
      { error: 'KIS 계좌 연결이 필요합니다', code: 'KIS_REQUIRED' },
      { status: 401 }
    )
  }

  // 4. 시장별 데이터 수집
  let bars: NormalizedBar[] = []
  let dailyBars: NormalizedBar[] = []
  let currentPrice = 0
  const name = ticker
  let recent20DayHigh = 0
  let recent20DayLow = 0
  let investorHistory: KRInvestorDay[] = []
  const asOfDate = toDateString(new Date())

  try {
    if (market === 'KR' && kisCredential) {
      const krCredential = {
        appKey: kisCredential.appKey,
        appSecret: kisCredential.appSecret,
        isPaperTrading: kisCredential.isPaperTrading,
      }

      // 실시간 시세
      const quote = await getKRRealtimeQuote({
        credentialId: kisCredential.credentialId,
        credential: krCredential,
        ticker,
      })
      currentPrice = quote.price
      // KRRealtimeQuote에는 name이 없으므로 ticker 그대로 사용

      // 분봉 (5분봉 390개 ≈ 5거래일치 — 와이코프 페이즈 탐지용)
      const krBars: KRMinuteBar[] = await getKRMinutePrices({
        credentialId: kisCredential.credentialId,
        credential: krCredential,
        ticker,
        intervalMinutes: 5,
        count: 390,
      })
      bars = krBars.map((b) => ({
        datetime: b.datetime,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }))

      // 일봉 (60일치 — 와이코프 페이즈/유동성 풀 컨텍스트)
      const today = new Date()
      const past = new Date()
      past.setDate(past.getDate() - 90)
      try {
        const krDailyBars = await getKRDailyPrices({
          credentialId: kisCredential.credentialId,
          credential: krCredential,
          ticker,
          startDate: toKisDateString(past),
          endDate: toKisDateString(today),
        })
        dailyBars = krDailyBars.map((b) => ({
          datetime: b.date,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume,
        }))
        const ctx = computeRecentHighLow(krDailyBars, 20)
        recent20DayHigh = ctx.high
        recent20DayLow = ctx.low
      } catch (err) {
        console.warn('[smart-money/analyze] 일봉 조회 실패 (분봉 기반 fallback):', err)
        const ctx = inferHighLowFromBars(bars)
        recent20DayHigh = ctx.high
        recent20DayLow = ctx.low
      }

      // 외국인/기관 매매 + investor_trend 캐시 upsert
      try {
        investorHistory = await getKRInvestorTrend({
          credentialId: kisCredential.credentialId,
          credential: krCredential,
          ticker,
          days: 20,
        })
        await upsertInvestorTrend(investorHistory, ticker, market)
      } catch (err) {
        console.warn('[smart-money/analyze] 외인기관 조회 실패:', err)
        investorHistory = []
      }
    } else {
      // US: yahoo-finance2 사용
      const quote = await fetchCurrentQuote(ticker, 'US')
      currentPrice = quote.price ?? 0

      // fetchIntradayPrices는 default로 30일치(≈2340봉)를 반환.
      // 정교화 엔진(와이코프 페이즈/유동성)을 위해 5거래일치(≈390봉)로 확장.
      const usBars: OHLCV[] = await fetchIntradayPrices({
        ticker,
        market: 'US',
        timeframe: '5m',
      })
      const recent = usBars.slice(-390)
      bars = recent.map((b) => ({
        datetime: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }))
      // US daily bars (60일치) — fetchIntradayPrices의 1d 호출은 별도 서비스가 없으므로
      // 분봉을 일봉으로 압축하여 활용
      dailyBars = aggregateBarsToDaily(bars)

      // 분봉으로 고저 추정 (US는 일봉 별도 호출 안함)
      const ctx = inferHighLowFromBars(bars)
      recent20DayHigh = ctx.high
      recent20DayLow = ctx.low
      investorHistory = []
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '시장 데이터 조회 실패'
    console.error('[smart-money/analyze] 데이터 수집 실패:', err)
    return NextResponse.json(
      { error: `시장 데이터 조회 실패: ${message}`, reason: message },
      { status: 502 }
    )
  }

  if (bars.length === 0) {
    return NextResponse.json(
      { error: '분봉 데이터가 없습니다. 시장이 열려있지 않거나 종목이 유효하지 않을 수 있습니다.' },
      { status: 422 }
    )
  }

  // 5. 엔진 호출
  let vwap, wyckoff, algoFootprint, investorFlow: InvestorFlowResult | null, scoreResult
  let wyckoffPhase, liquidity, marketStructure, orderBlocksFvg, traps, vsa, session, newsContext
  try {
    // ===== Intraday window 추출 =====
    // algoFootprint(TWAP/Iceberg/Sniper/MOO/MOC), VWAP, 단일봉 Wyckoff, VSA는
    // 본질적으로 단일 거래일(intraday) 기반 패턴이다. 5일치(390봉)를 그대로 입력하면
    // 일별 거래량 차이가 누적돼 CV 폭증 → 점수=0 등 오작동.
    // 따라서 가장 최근 거래일(YYYY-MM-DD)의 봉만 추출해 intraday 엔진에 사용.
    const lastDate = bars[bars.length - 1]?.datetime?.slice(0, 10) ?? ''
    let intradayBars: NormalizedBar[] = lastDate
      ? bars.filter((b) => b.datetime.slice(0, 10) === lastDate)
      : []
    // edge case: 새 날짜의 첫 봉이 아직 적으면 fallback 마지막 78봉
    if (intradayBars.length < 20) {
      intradayBars = bars.slice(-78)
    }

    const vwapBars: VWAPInputBar[] = intradayBars.map((b) => ({
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }))
    vwap = calculateVWAP(vwapBars, currentPrice)

    const wyckoffBars: WyckoffBar[] = intradayBars.map((b) => ({
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }))
    wyckoff = detectWyckoff(wyckoffBars)

    const algoBars: AlgoBar[] = intradayBars.map((b) => ({
      datetime: b.datetime,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }))
    algoFootprint = analyzeAlgoFootprint(algoBars)

    investorFlow =
      market === 'KR' && investorHistory.length > 0
        ? analyzeInvestorFlow(investorHistory)
        : null

    // ===== 정교화 엔진들 (다일 패턴이라 390봉 전체 사용) =====
    const phaseBars: PhaseBar[] = bars.map((b) => ({ ...b }))
    const phaseDailyBars: PhaseBar[] = dailyBars.map((b) => ({ ...b }))
    wyckoffPhase = detectWyckoffPhase(phaseBars, phaseDailyBars.length > 0 ? phaseDailyBars : undefined)

    const liqBars: LiquidityBar[] = bars.map((b) => ({ ...b }))
    const liqDailyBars: LiquidityBar[] = dailyBars.map((b) => ({ ...b }))
    liquidity = analyzeLiquidity(liqBars, liqDailyBars.length > 0 ? liqDailyBars : undefined)

    const structureBars: StructureBar[] = bars.map((b) => ({ ...b }))
    marketStructure = analyzeMarketStructure(structureBars)

    const obBars: OBBar[] = bars.map((b) => ({ ...b }))
    orderBlocksFvg = detectOrderBlocksAndFvg(obBars)

    const trapBars: TrapBar[] = bars.map((b) => ({
      open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
    }))
    traps = detectTraps(trapBars)

    // VSA는 effort vs result로 단일 거래일 + 직전 1-2일 정도가 합리적이지만
    // 엔진 자체가 최근 5봉만 actionable signal로 사용하므로 5일치도 안전
    const vsaBars: VSABar[] = bars.map((b) => ({
      open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
    }))
    vsa = analyzeVSA(vsaBars)

    const sessionBars: SessionBar[] = bars.map((b) => ({ ...b }))
    session = analyzeSession(sessionBars, market)

    const newsBars: NewsBar[] = bars.map((b) => ({ ...b }))
    newsContext = analyzeNewsContext({
      bars: newsBars,
      signalDetails: [],
      newsEvents: [],
    })

    scoreResult = computeSmartMoneyScore({
      vwap,
      investorFlow,
      wyckoff,
      algoFootprint,
      wyckoffPhase,
      liquidity,
      marketStructure,
      orderBlocksFvg,
      traps,
      vsa,
      session,
      newsContext,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '분석 엔진 실패'
    console.error('[smart-money/analyze] 엔진 실행 실패:', err)
    return NextResponse.json({ error: `분석 실패: ${message}` }, { status: 500 })
  }

  // recent20DayHigh/Low — UI display용 (현재는 noop, 향후 사용 가능)
  void recent20DayHigh
  void recent20DayLow

  const analysis: SmartMoneyAnalysis = {
    ticker,
    market,
    name,
    asOfDate,
    currentPrice,
    vwap,
    investorFlow,
    wyckoff,
    algoFootprint,
    wyckoffPhase,
    liquidity,
    marketStructure,
    orderBlocksFvg,
    traps,
    vsa,
    session,
    newsContext,
    manipulationRiskScore: scoreResult.manipulationRiskScore,
    overallScore: scoreResult.overallScore,
    interpretation: scoreResult.interpretation,
    signalDetails: scoreResult.signalDetails,
    generatedAt: new Date().toISOString(),
  }

  // 6. LLM 코멘트 (옵션)
  if (includeLLM) {
    try {
      analysis.naturalLanguageComment = await generateLLMComment(analysis)
    } catch (err) {
      console.warn('[smart-money/analyze] LLM 코멘트 생성 스킵:', err)
    }
  }

  // 7. 알림 트리거
  let triggeredAlerts: AnalysisResponse['triggeredAlerts'] = []
  try {
    triggeredAlerts = await processAlerts(userId, analysis)
  } catch (err) {
    console.warn('[smart-money/analyze] 알림 처리 실패:', err)
  }

  const response: AnalysisResponse = {
    ...analysis,
    triggeredAlerts: triggeredAlerts && triggeredAlerts.length > 0 ? triggeredAlerts : undefined,
  }

  return NextResponse.json({ data: response })
}

// ============================================
// 헬퍼: KIS credential 로드
// ============================================

async function loadActiveKisCredential(userId: string): Promise<DecryptedKisCredential | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('user_broker_credentials')
    .select('id, broker, app_key_encrypted, app_secret_encrypted, account_number_encrypted, is_paper_trading, created_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('broker', ['kis', 'kis_kr', 'KIS', 'KIS_KR'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  try {
    return {
      credentialId: data.id,
      appKey: investmentDecrypt(data.app_key_encrypted),
      appSecret: investmentDecrypt(data.app_secret_encrypted),
      accountNumber: investmentDecrypt(data.account_number_encrypted),
      isPaperTrading: Boolean(data.is_paper_trading),
    }
  } catch (err) {
    console.error('[smart-money/analyze] credential 복호화 실패:', err)
    return null
  }
}

// ============================================
// 헬퍼: 고저 계산
// ============================================

function computeRecentHighLow(bars: OHLCV[], lookback: number): { high: number; low: number } {
  if (!bars || bars.length === 0) return { high: 0, low: 0 }
  const recent = bars.slice(-lookback)
  let high = -Infinity
  let low = Infinity
  for (const bar of recent) {
    if (bar.high > high) high = bar.high
    if (bar.low < low) low = bar.low
  }
  return {
    high: Number.isFinite(high) ? high : 0,
    low: Number.isFinite(low) ? low : 0,
  }
}

/** 분봉을 일봉으로 압축 (US용 — 일봉 별도 API가 없을 때 fallback) */
function aggregateBarsToDaily(bars: NormalizedBar[]): NormalizedBar[] {
  if (bars.length === 0) return []
  const byDay = new Map<string, NormalizedBar[]>()
  for (const b of bars) {
    const key = b.datetime.slice(0, 10) // YYYY-MM-DD
    if (!key) continue
    const arr = byDay.get(key) ?? []
    arr.push(b)
    byDay.set(key, arr)
  }
  const days: NormalizedBar[] = []
  for (const [day, dayBars] of byDay.entries()) {
    if (dayBars.length === 0) continue
    let high = -Infinity, low = Infinity, vol = 0
    for (const b of dayBars) {
      if (b.high > high) high = b.high
      if (b.low < low) low = b.low
      vol += b.volume
    }
    days.push({
      datetime: day,
      open: dayBars[0].open,
      high: Number.isFinite(high) ? high : 0,
      low: Number.isFinite(low) ? low : 0,
      close: dayBars[dayBars.length - 1].close,
      volume: vol,
    })
  }
  days.sort((a, b) => a.datetime.localeCompare(b.datetime))
  return days
}

function inferHighLowFromBars(bars: NormalizedBar[]): { high: number; low: number } {
  if (bars.length === 0) return { high: 0, low: 0 }
  let high = -Infinity
  let low = Infinity
  for (const bar of bars) {
    if (bar.high > high) high = bar.high
    if (bar.low < low) low = bar.low
  }
  return {
    high: Number.isFinite(high) ? high : 0,
    low: Number.isFinite(low) ? low : 0,
  }
}

// ============================================
// 헬퍼: investor_trend 캐시 업서트
// ============================================

async function upsertInvestorTrend(
  data: KRInvestorDay[],
  ticker: string,
  market: Market
): Promise<void> {
  if (!data || data.length === 0) return
  const supabase = getSupabaseAdmin()
  if (!supabase) return

  const now = new Date().toISOString()
  const rows: InvestorTrendRow[] = data.map((d) => ({
    ticker,
    market,
    date: d.date,
    foreigner_net: typeof d.foreigner_net === 'number' ? d.foreigner_net : null,
    institution_net: typeof d.institution_net === 'number' ? d.institution_net : null,
    retail_net: typeof d.retail_net === 'number' ? d.retail_net : null,
    total_value: typeof d.total_value === 'number' ? d.total_value : null,
    fetched_at: now,
  }))

  const { error } = await supabase
    .from('investor_trend')
    .upsert(rows, { onConflict: 'ticker,market,date' })

  if (error) {
    console.warn('[smart-money/analyze] investor_trend upsert 실패:', error.message)
  }
}

// ============================================
// 헬퍼: 알림 트리거 처리
// ============================================

async function processAlerts(
  userId: string,
  analysis: SmartMoneyAnalysis
): Promise<AnalysisResponse['triggeredAlerts']> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []

  const { data: alerts, error } = await supabase
    .from('smart_money_alerts')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true)
    .eq('ticker', analysis.ticker)
    .eq('market', analysis.market)

  if (error || !alerts || alerts.length === 0) return []

  const triggered: NonNullable<AnalysisResponse['triggeredAlerts']> = []
  const now = new Date().toISOString()

  for (const alertRaw of alerts as unknown as SmartMoneyAlert[]) {
    const matchedSignals = analysis.signalDetails.filter(
      (sig) =>
        alertRaw.signal_types.includes(sig.type) &&
        sig.confidence >= alertRaw.min_confidence
    )
    if (matchedSignals.length === 0) continue

    triggered.push({
      id: alertRaw.id,
      ticker: alertRaw.ticker,
      market: alertRaw.market,
      signal_types: matchedSignals.map((s) => s.type),
    })

    // 시그널 로그 기록
    const logRows = matchedSignals.map((sig) => ({
      user_id: userId,
      alert_id: alertRaw.id,
      ticker: analysis.ticker,
      market: analysis.market,
      signal_type: sig.type,
      confidence: sig.confidence,
      payload: {
        description: sig.description,
        triggeredAt: sig.triggeredAt ?? now,
        overallScore: analysis.overallScore,
        interpretation: analysis.interpretation,
      },
      detected_at: now,
    }))
    try {
      await supabase
        .from('smart_money_signal_log')
        .insert(logRows)
    } catch (err) {
      console.warn('[smart-money/analyze] signal_log insert 실패:', err)
    }

    // last_triggered_at 갱신
    try {
      await supabase
        .from('smart_money_alerts')
        .update({ last_triggered_at: now })
        .eq('id', alertRaw.id)
        .eq('user_id', userId)
    } catch (err) {
      console.warn('[smart-money/analyze] last_triggered_at 갱신 실패:', err)
    }

    // TODO: telegram/push 알림 채널 통합 (현재는 인앱 응답으로만 반환)
  }

  return triggered
}

// ============================================
// 헬퍼: 날짜 포맷
// ============================================

function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toKisDateString(d: Date): string {
  // KIS는 YYYYMMDD 포맷
  return toDateString(d).replace(/-/g, '')
}
