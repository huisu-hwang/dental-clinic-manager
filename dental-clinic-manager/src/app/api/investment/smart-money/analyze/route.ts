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
  KISMinuteDataError,
  type KRMinuteBar,
  type KRInvestorDay,
} from '@/lib/kisApiService'
import { fetchIntradayPrices } from '@/lib/intradayDataService'
import { fetchCurrentQuote, fetchPrices } from '@/lib/stockDataService'
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
  DailyAnalysis,
} from '@/types/smartMoney'

export const dynamic = 'force-dynamic'
// KIS 분봉 페이지네이션 + 멀티 엔진 + LLM 병렬 호출 시간 확보
// 기본 10초로는 KR 종목 분석 시 KIS 60 req 페이지네이션이 timeout
export const maxDuration = 60

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
  /**
   * KR 종목인데 KIS 계좌 미연결이라 yahoo-finance2 폴백으로 동작한 경우 true.
   * - 시세 15분 지연
   * - 호가 분석 미제공
   * - 외인기관 매매 동향 제외
   * UI 가 이 플래그를 보고 안내 배너를 노출한다.
   */
  limitedDataMode?: boolean
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
  let body: { ticker?: unknown; market?: unknown; includeLLM?: unknown; includePreMarket?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 })
  }

  const ticker = typeof body.ticker === 'string' ? body.ticker.trim().toUpperCase() : ''
  const market = body.market === 'KR' || body.market === 'US' ? (body.market as Market) : null
  const includeLLM = Boolean(body.includeLLM)
  // US 종목에서 pre-market(ET 04:00~09:30) 봉도 분석에 포함 + 별도 byDay entry 추가
  const includePreMarket = Boolean(body.includePreMarket) && market === 'US'

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

  // KR + KIS 미연결: yahoo-finance2 폴백으로 동작 — 15분 지연 분봉 + 호가/외인기관 미제공.
  // 분석 결과에 limitedDataMode=true 를 표기하여 UI 가 안내할 수 있도록 한다.
  const isKRLimitedMode = market === 'KR' && !kisCredential

  // 4. 시장별 데이터 수집
  let bars: NormalizedBar[] = []
  let dailyBars: NormalizedBar[] = []
  let currentPrice = 0
  const name = ticker
  let recent20DayHigh = 0
  let recent20DayLow = 0
  let investorHistory: KRInvestorDay[] = []
  let intradayUnavailableReason: string | null = null
  const asOfDate = marketDateString(new Date(), market)

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

      // 분봉 (1분봉 1200개 ≈ 정규장 3거래일치 — KIS 페이지네이션 40 req로 ~3초 소요)
      // KIS rate limit + Vercel function timeout(60s) 안에서 안정적으로 받을 수 있는 양
      try {
        const krBars: KRMinuteBar[] = await getKRMinutePrices({
          credentialId: kisCredential.credentialId,
          credential: krCredential,
          ticker,
          intervalMinutes: 1,
          count: 1200,
        })
        bars = krBars.map((b) => ({
          datetime: b.datetime,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume,
        }))
      } catch (err) {
        if (err instanceof KISMinuteDataError) {
          intradayUnavailableReason = err.message
          bars = []
          console.warn('[smart-money/analyze] KR 분봉 비즈니스 오류로 intraday 분석 비활성화:', {
            ticker,
            code: err.code,
            date: err.date,
            hour: err.hour,
          })
        } else {
          throw err
        }
      }

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
      // US 또는 KR(KIS 미연결): yahoo-finance2 사용
      const yMarket: 'KR' | 'US' = market === 'KR' ? 'KR' : 'US'
      const quote = await fetchCurrentQuote(ticker, yMarket)
      currentPrice = quote.price ?? 0

      // 1분봉 — yahoo가 주는 6일치 데이터를 모두 사용 (캐시 우회로 fresh 데이터 보장)
      // KR 은 yahoo 분봉이 비어있는 종목이 있어 빈 배열일 수 있음 → intraday 분석 비활성으로 처리됨.
      const intradayBars: OHLCV[] = await fetchIntradayPrices({
        ticker,
        market: yMarket,
        timeframe: '1m',
        forceRefresh: true,
      })
      bars = intradayBars.map((b) => ({
        datetime: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }))
      if (bars.length === 0 && isKRLimitedMode) {
        intradayUnavailableReason = 'yahoo-finance2 에서 한국 종목 1분봉 데이터를 받지 못했습니다 (지연 또는 미지원).'
      }

      // 일봉 (90일치) — fetchPrices(yahoo-finance2) 로 실제 일봉 페치
      try {
        const todayD = new Date()
        const pastD = new Date()
        pastD.setDate(pastD.getDate() - 90)
        const daily = await fetchPrices(ticker, yMarket, toDateString(pastD), toDateString(todayD))
        if (daily && daily.length > 0) {
          dailyBars = daily.map((b) => ({
            datetime: b.date,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: b.volume,
          }))
          const ctx = computeRecentHighLow(daily, 20)
          recent20DayHigh = ctx.high
          recent20DayLow = ctx.low
        } else {
          // fallback: 분봉 압축
          dailyBars = aggregateBarsToDaily(bars)
          const ctx = inferHighLowFromBars(bars)
          recent20DayHigh = ctx.high
          recent20DayLow = ctx.low
        }
      } catch (err) {
        console.warn('[smart-money/analyze] 일봉 페치 실패, 분봉 압축으로 fallback:', err)
        dailyBars = aggregateBarsToDaily(bars)
        const ctx = inferHighLowFromBars(bars)
        recent20DayHigh = ctx.high
        recent20DayLow = ctx.low
      }

      // KR limited mode: 외인기관 매매 동향은 KIS only 라 빈 배열 (분석 흐름은 진행)
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

  if (bars.length === 0 && dailyBars.length === 0) {
    return NextResponse.json(
      { error: '분봉/일봉 데이터를 모두 받지 못했습니다. 종목 코드를 확인해주세요.' },
      { status: 422 }
    )
  }
  const regularBars = bars.filter((b) => isRegularTradingHours(b.datetime, market))
  const preMarketBars =
    includePreMarket && market === 'US'
      ? bars.filter((b) => isPreMarketUS(b.datetime))
      : []

  // 5. 엔진 호출
  let vwap, wyckoff, wyckoffIntraday, algoFootprint, investorFlow: InvestorFlowResult | null, scoreResult
  let wyckoffPhase, liquidity, marketStructure, orderBlocksFvg, traps, vsa, session, newsContext
  let byDay: DailyAnalysis[] = []
  try {
    // ================================================================
    // 데이터 윈도우 라우팅 — 각 엔진의 자연스러운 데이터 타입에 맞춤
    // ----------------------------------------------------------------
    // [1일치 분봉] VWAP / algoFootprint / session
    //   - 단일 거래일 기반 패턴. VWAP은 매일 리셋, MOO/MOC는 시·종가 동시호가,
    //     session은 현재 시간대 분류. 5일치 섞으면 의미 흐려짐.
    //
    // [2일치 분봉] 단일봉 Wyckoff / VSA / news
    //   - 단일봉 Wyckoff는 직전 20봉 lookback (≈1.5일), VSA는 22봉 최소,
    //     news는 분봉 timestamp 매칭. 어제+오늘이면 임계치 충족.
    //   - 장 마감 / 주말이면 가장 최근 2 거래일.
    //
    // [60일 일봉] wyckoffPhase / marketStructure / liquidity / OB-FVG / traps
    //   - 다일 구조 패턴. 일봉이 본질적으로 옳고 안정적.
    // ================================================================
    const intradayLast1Day = extractLastNTradingDays(regularBars, 1)
    const intradayLast2Days = extractLastNTradingDays(regularBars, 2)
    const multiDayBars: NormalizedBar[] = dailyBars.length >= 30 ? dailyBars : regularBars

    // 진행 중인 거래일이 짧으면(장 시작 직후) 알고리즘/VWAP 패턴 인식이 부족함
    // → 300봉(1분봉 ≈ 5시간) 미만이면 2거래일치로 fallback (어제 풀 거래일 + 오늘 진행분)
    const MIN_INTRADAY_BARS = 300
    const intradayForAlgo =
      intradayLast1Day.length >= MIN_INTRADAY_BARS ? intradayLast1Day : intradayLast2Days

    // 디버그 로그 — 각 윈도우별 봉 수
    console.log('[smart-money/analyze] 데이터 윈도우:', {
      ticker,
      market,
      total_intraday: regularBars.length,
      total_pre_market: preMarketBars.length,
      intraday_1day: intradayLast1Day.length,
      intraday_2days: intradayLast2Days.length,
      intraday_for_algo: intradayForAlgo.length,
      daily: dailyBars.length,
      multiDay: multiDayBars.length,
      intraday_unavailable_reason: intradayUnavailableReason,
    })

    // ===== Intraday 엔진 (1~2일치 적응) =====
    const vwapBars: VWAPInputBar[] = intradayForAlgo.map((b) => ({
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }))
    vwap = calculateVWAP(vwapBars, currentPrice)

    const algoBars: AlgoBar[] = intradayForAlgo.map((b) => ({
      datetime: b.datetime,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }))
    // MOO/MOC는 반드시 단일 거래일 기준 — 시·종가 봉이 양 끝에 정확히 있어야 함
    const auctionBars: AlgoBar[] = intradayLast1Day.map((b) => ({
      datetime: b.datetime,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }))
    algoFootprint = analyzeAlgoFootprint(algoBars, auctionBars)

    // session은 항상 "현재" 시간대 분류이므로 1일치 유지
    const sessionBars: SessionBar[] = intradayLast1Day.map((b) => ({ ...b }))
    session = analyzeSession(sessionBars, market)

    // ===== Intraday 2-days 엔진 (Wyckoff 분봉 — 보조) =====
    const wyckoffBars: WyckoffBar[] = intradayLast2Days.map((b) => ({
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }))
    wyckoffIntraday = detectWyckoff(wyckoffBars, { timeframe: 'minute' })

    const newsBars: NewsBar[] = intradayLast2Days.map((b) => ({ ...b }))
    newsContext = analyzeNewsContext({
      bars: newsBars,
      signalDetails: [],
      newsEvents: [],
    })

    // ===== 외인/기관 (KR 일별 매매 동향) =====
    investorFlow =
      market === 'KR' && investorHistory.length > 0
        ? analyzeInvestorFlow(investorHistory)
        : null

    // ===== 다일 일봉 기반 엔진 =====
    // Wyckoff 메인 — 일봉 기반 (Wyckoff 원전 표준). dailyBars 없으면 빈 결과.
    const wyckoffDailyBars: WyckoffBar[] = dailyBars.map((b) => ({
      open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
    }))
    wyckoff = detectWyckoff(wyckoffDailyBars, { timeframe: 'day' })

    const phaseBars: PhaseBar[] = multiDayBars.map((b) => ({ ...b }))
    const phaseDailyBars: PhaseBar[] = dailyBars.map((b) => ({ ...b }))
    wyckoffPhase = detectWyckoffPhase(phaseBars, phaseDailyBars.length > 0 ? phaseDailyBars : undefined)

    const liqBars: LiquidityBar[] = multiDayBars.map((b) => ({ ...b }))
    const liqDailyBars: LiquidityBar[] = dailyBars.map((b) => ({ ...b }))
    liquidity = analyzeLiquidity(liqBars, liqDailyBars.length > 0 ? liqDailyBars : undefined)

    const structureBars: StructureBar[] = multiDayBars.map((b) => ({ ...b }))
    marketStructure = analyzeMarketStructure(structureBars)

    const obBars: OBBar[] = multiDayBars.map((b) => ({ ...b }))
    orderBlocksFvg = detectOrderBlocksAndFvg(obBars)

    const trapBars: TrapBar[] = multiDayBars.map((b) => ({
      open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
    }))
    traps = detectTraps(trapBars)

    const vsaBars: VSABar[] = multiDayBars.map((b) => ({
      open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
    }))
    vsa = analyzeVSA(vsaBars)

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

    // ===== byDay: 최근 3 거래일치 일자별 분석 =====
    // 다일 기반 엔진(wyckoffPhase, liquidity, marketStructure, orderBlocksFvg, traps, vsa)은
    // 본질적으로 N일 컨텍스트가 필요하므로 모든 일자에 동일하게 표시.
    // intraday 엔진(vwap, wyckoff(단일봉), algoFootprint, session, newsContext)은 일자별로 다르게 계산.
    // datetime → 시장의 거래일 기준 YYYY-MM-DD 키
    // yahoo/KIS 분봉이 UTC ISO이면 한 거래일이 UTC 2일에 걸쳐 분리되어 잘못 묶임
    // → 미국=America/New_York, 한국=Asia/Seoul timezone으로 normalize
    const tz = market === 'US' ? 'America/New_York' : 'Asia/Seoul'
    const dayKeyOf = (dt: string): string => {
      if (!dt) return ''
      // ISO에 timezone offset(Z 또는 ±HH:MM)이 없으면 UTC로 가정
      const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(dt)
      const d = new Date(hasTz ? dt : dt + 'Z')
      if (isNaN(d.getTime())) return dt.slice(0, 10)
      try {
        const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
        return fmt.format(d) // YYYY-MM-DD
      } catch {
        return dt.slice(0, 10)
      }
    }
    const dayKeys = Array.from(new Set(regularBars.map((b) => dayKeyOf(b.datetime)).filter(Boolean))).sort()
    // 일자별 봉 수 (timezone normalized)
    const dayBarCounts = new Map<string, number>()
    for (const b of regularBars) {
      const k = dayKeyOf(b.datetime)
      if (!k) continue
      dayBarCounts.set(k, (dayBarCounts.get(k) ?? 0) + 1)
    }
    console.log('[smart-money/analyze] 일자별 봉 수:', Array.from(dayBarCounts.entries()))
    // 가장 최근 3 거래일을 보장하도록 — 임계값(>=100)을 완화하여 부분 일자도 가능하면 포함
    const MIN_BARS_PER_DAY = 100
    const fullDays = dayKeys.filter(
      (k) => (dayBarCounts.get(k) ?? 0) >= MIN_BARS_PER_DAY
        || k === dayKeys[dayKeys.length - 1],
    )
    const recentDayKeys = fullDays.slice(-3)
    for (const dayKey of recentDayKeys) {
      const dayBars = regularBars.filter((b) => dayKeyOf(b.datetime) === dayKey)
      if (dayBars.length < 5) continue
      const closePrice = dayBars[dayBars.length - 1].close

      const dVwapBars: VWAPInputBar[] = dayBars.map((b) => ({
        high: b.high, low: b.low, close: b.close, volume: b.volume,
      }))
      const dVwap = calculateVWAP(dVwapBars, closePrice)

      const dAlgoBars: AlgoBar[] = dayBars.map((b) => ({
        datetime: b.datetime, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
      }))
      const dAlgoFootprint = analyzeAlgoFootprint(dAlgoBars, dAlgoBars)

      // 일자별 분봉 Wyckoff (보조). 메인 wyckoff(일봉)는 모든 일자에 동일.
      const dWyckoffBars: WyckoffBar[] = dayBars.map((b) => ({
        open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
      }))
      const dWyckoffIntraday = detectWyckoff(dWyckoffBars, { timeframe: 'minute' })

      const dSessionBars: SessionBar[] = dayBars.map((b) => ({ ...b }))
      const dSession = analyzeSession(dSessionBars, market)

      const dNewsBars: NewsBar[] = dayBars.map((b) => ({ ...b }))
      const dNewsContext = analyzeNewsContext({
        bars: dNewsBars,
        signalDetails: [],
        newsEvents: [],
      })

      const dScore = computeSmartMoneyScore({
        vwap: dVwap,
        investorFlow,
        wyckoff,                    // 메인은 일봉 — 모든 일자에 동일
        algoFootprint: dAlgoFootprint,
        wyckoffPhase,
        liquidity,
        marketStructure,
        orderBlocksFvg,
        traps,
        vsa,
        session: dSession,
        newsContext: dNewsContext,
      })

      byDay.push({
        ticker,
        market,
        asOfDate: dayKey,
        closePrice,
        vwap: dVwap,
        wyckoff,                    // 메인 일봉 — 모든 일자에 동일
        wyckoffIntraday: dWyckoffIntraday,
        algoFootprint: dAlgoFootprint,
        wyckoffPhase,
        liquidity,
        marketStructure,
        orderBlocksFvg,
        traps,
        vsa,
        session: dSession,
        newsContext: dNewsContext,
        manipulationRiskScore: dScore.manipulationRiskScore,
        overallScore: dScore.overallScore,
        interpretation: dScore.interpretation,
        signalDetails: dScore.signalDetails,
      })
    }
    // 가장 최근 일자(byDay 마지막)는 메인 분석과 정렬되도록 메인 결과를 덮어씌움
    if (byDay.length > 0) {
      const lastDay = byDay[byDay.length - 1]
      lastDay.vwap = vwap
      lastDay.wyckoff = wyckoff
      lastDay.wyckoffIntraday = wyckoffIntraday
      lastDay.algoFootprint = algoFootprint
      lastDay.session = session
      lastDay.newsContext = newsContext
      lastDay.manipulationRiskScore = scoreResult.manipulationRiskScore
      lastDay.overallScore = scoreResult.overallScore
      lastDay.interpretation = scoreResult.interpretation
      lastDay.signalDetails = scoreResult.signalDetails
    }

    // ===== Pre-Market 별도 entry (US 옵션) =====
    // 가장 최근 일자의 pre-market 봉만 분리해 분석 → byDay에 추가
    if (includePreMarket && market === 'US') {
      const preDayKeys = Array.from(new Set(preMarketBars.map((b) => dayKeyOf(b.datetime)).filter(Boolean))).sort()
      const latestDayKey = preDayKeys[preDayKeys.length - 1]
      if (latestDayKey) {
        const preBars = preMarketBars.filter(
          (b) => dayKeyOf(b.datetime) === latestDayKey && isPreMarketUS(b.datetime),
        )
        if (preBars.length >= 10) {
          const closePrice = preBars[preBars.length - 1].close
          const dVwapBars: VWAPInputBar[] = preBars.map((b) => ({
            high: b.high, low: b.low, close: b.close, volume: b.volume,
          }))
          const dVwap = calculateVWAP(dVwapBars, closePrice)

          const dAlgoBars: AlgoBar[] = preBars.map((b) => ({
            datetime: b.datetime, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
          }))
          const dAlgoFootprint = analyzeAlgoFootprint(dAlgoBars, dAlgoBars)

          const dWyckoffBars: WyckoffBar[] = preBars.map((b) => ({
            open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
          }))
          const dWyckoffIntraday = detectWyckoff(dWyckoffBars, { timeframe: 'minute' })

          const dSessionBars: SessionBar[] = preBars.map((b) => ({ ...b }))
          const dSession = analyzeSession(dSessionBars, market)

          const dNewsBars: NewsBar[] = preBars.map((b) => ({ ...b }))
          const dNewsContext = analyzeNewsContext({ bars: dNewsBars, signalDetails: [], newsEvents: [] })

          const dScore = computeSmartMoneyScore({
            vwap: dVwap,
            investorFlow,
            wyckoff,
            algoFootprint: dAlgoFootprint,
            wyckoffPhase,
            liquidity,
            marketStructure,
            orderBlocksFvg,
            traps,
            vsa,
            session: dSession,
            newsContext: dNewsContext,
          })

          byDay.push({
            ticker,
            market,
            asOfDate: `${latestDayKey} (Pre)`,
            closePrice,
            vwap: dVwap,
            wyckoff,
            wyckoffIntraday: dWyckoffIntraday,
            algoFootprint: dAlgoFootprint,
            wyckoffPhase,
            liquidity,
            marketStructure,
            orderBlocksFvg,
            traps,
            vsa,
            session: dSession,
            newsContext: dNewsContext,
            manipulationRiskScore: dScore.manipulationRiskScore,
            overallScore: dScore.overallScore,
            interpretation: dScore.interpretation,
            signalDetails: dScore.signalDetails,
          })
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '분석 엔진 실패'
    console.error('[smart-money/analyze] 엔진 실행 실패:', err)
    return NextResponse.json({ error: `분석 실패: ${message}` }, { status: 500 })
  }

  // recent20DayHigh/Low — UI display용 (현재는 noop, 향후 사용 가능)
  void recent20DayHigh
  void recent20DayLow

  // 메인 asOfDate를 byDay 마지막(가장 최근 거래일) dayKey와 일관 정렬:
  // - 한국 종목 + KST 오늘 장 시작 전이면 분봉 자체가 어제까지만 → 분석은 어제(전 거래일) 데이터 기준
  // - 그렇게 일치시켜야 사용자가 "메인 기준일"과 "가장 최근 byDay 탭"이 같은 날짜로 보임
  const lastByDay = byDay.length > 0
    ? byDay.filter((d) => !/ \(Pre\)$/.test(d.asOfDate)).slice(-1)[0]
    : null
  const preferredByDay = findPreferredAnalysisDay(byDay, market, includePreMarket)

  if (preferredByDay) {
    currentPrice = preferredByDay.closePrice
    vwap = preferredByDay.vwap
    wyckoff = preferredByDay.wyckoff
    wyckoffIntraday = preferredByDay.wyckoffIntraday
    algoFootprint = preferredByDay.algoFootprint
    wyckoffPhase = preferredByDay.wyckoffPhase
    liquidity = preferredByDay.liquidity
    marketStructure = preferredByDay.marketStructure
    orderBlocksFvg = preferredByDay.orderBlocksFvg
    traps = preferredByDay.traps
    vsa = preferredByDay.vsa
    session = preferredByDay.session
    newsContext = preferredByDay.newsContext
    scoreResult = {
      ...scoreResult,
      manipulationRiskScore: preferredByDay.manipulationRiskScore,
      overallScore: preferredByDay.overallScore,
      interpretation: preferredByDay.interpretation,
      signalDetails: preferredByDay.signalDetails,
    }
  }

  const alignedAsOfDate = preferredByDay?.asOfDate ?? lastByDay?.asOfDate ?? asOfDate

  const analysis: SmartMoneyAnalysis = {
    ticker,
    market,
    name,
    asOfDate: alignedAsOfDate,
    currentPrice,
    vwap,
    investorFlow,
    wyckoff,
    wyckoffIntraday,
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
    byDay,
  }

  // 6. LLM 코멘트 (옵션) — byDay 모든 일자별로 그날 데이터 기준 코멘트 병렬 생성
  if (includeLLM) {
    if (byDay.length > 0) {
      const tasks = byDay.map(async (day) => {
        const isMainDay = day.asOfDate === analysis.asOfDate
        // 메인 분석과 같은 일자는 analysis 그대로 사용
        // 그 외 일자는 DailyAnalysis → SmartMoneyAnalysis 호환 객체로 변환
        const target: SmartMoneyAnalysis = isMainDay
          ? analysis
          : {
              ticker: day.ticker,
              market: day.market,
              name,
              asOfDate: day.asOfDate,
              currentPrice: day.closePrice,
              vwap: day.vwap,
              investorFlow,
              wyckoff: day.wyckoff,
              wyckoffIntraday: day.wyckoffIntraday,
              algoFootprint: day.algoFootprint,
              wyckoffPhase: day.wyckoffPhase,
              liquidity: day.liquidity,
              marketStructure: day.marketStructure,
              orderBlocksFvg: day.orderBlocksFvg,
              traps: day.traps,
              vsa: day.vsa,
              session: day.session,
              newsContext: day.newsContext,
              manipulationRiskScore: day.manipulationRiskScore,
              overallScore: day.overallScore,
              interpretation: day.interpretation,
              signalDetails: day.signalDetails,
              generatedAt: analysis.generatedAt,
            }
        try {
          const result = await generateLLMComment(target)
          day.naturalLanguageComment = result.comment
          if (isMainDay) {
            analysis.naturalLanguageComment = result.comment
            analysis.perCardComments = result.perCard
          }
        } catch (err) {
          console.warn(`[smart-money/analyze] LLM 코멘트 생성 스킵 (${day.asOfDate}):`, err)
        }
      })
      await Promise.all(tasks)
    } else {
      try {
        const result = await generateLLMComment(analysis)
        analysis.naturalLanguageComment = result.comment
        analysis.perCardComments = result.perCard
      } catch (err) {
        console.warn('[smart-money/analyze] LLM 코멘트 생성 스킵:', err)
      }
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
    limitedDataMode: isKRLimitedMode ? true : undefined,
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

/**
 * 가장 최근 N개 거래일에 해당하는 봉을 추출
 *
 * 동작:
 *   - bars의 datetime을 'YYYY-MM-DD'로 슬라이스해 고유 거래일 추출
 *   - 가장 최근 N개 거래일에 매칭되는 봉만 필터링하여 반환
 *   - 장 마감 / 주말 / 휴일에도 자연스럽게 직전 N 거래일 분봉을 사용
 *   - bars가 비어있거나 datetime이 비어있으면 빈 배열 반환
 *
 * 예) 오늘 휴장이고 bars 마지막 날짜가 어제면:
 *   N=1 → 어제 분봉만
 *   N=2 → 어제+그저께 분봉
 */
function extractLastNTradingDays(bars: NormalizedBar[], n: number): NormalizedBar[] {
  if (!bars || bars.length === 0 || n <= 0) return []
  // 고유 거래일 (오래된 → 최신 순)
  const dates = new Set<string>()
  for (const b of bars) {
    const d = (b.datetime ?? '').slice(0, 10)
    if (d) dates.add(d)
  }
  if (dates.size === 0) return []
  const sortedDates = [...dates].sort()
  const lastN = new Set(sortedDates.slice(-n))
  return bars.filter((b) => lastN.has((b.datetime ?? '').slice(0, 10)))
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

function marketDateString(d: Date, market: Market): string {
  const tz = market === 'US' ? 'America/New_York' : 'Asia/Seoul'
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return fmt.format(d)
  } catch {
    return market === 'KR' ? toKstDateString(d) : toDateString(d)
  }
}

/** Asia/Seoul timezone 기준 YYYY-MM-DD — Vercel(UTC)에서도 한국 사용자 "오늘"을 정확히 반영 */
function toKstDateString(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600_000)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(kst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toKisDateString(d: Date): string {
  // KIS는 YYYYMMDD 포맷
  return toDateString(d).replace(/-/g, '')
}

/**
 * 시장의 정규장 시간(Regular Trading Hours) 내인지 판단.
 * - US: ET 09:30~16:00 (16:00 미포함)
 * - KR: KST 09:00~15:30 (15:30 미포함)
 * 프리/포스트마켓 봉은 거래량 분포 분석에 노이즈가 되므로 분석 입력에서 제외용.
 */
function isRegularTradingHours(dt: string, market: Market): boolean {
  const m = tzMinutesOf(dt, market)
  if (m === null) return true
  if (market === 'US') return m >= 9 * 60 + 30 && m < 16 * 60
  return m >= 9 * 60 && m < 15 * 60 + 30
}

/** US pre-market: ET 04:00 ~ 09:30 (09:30 미포함) */
function isPreMarketUS(dt: string): boolean {
  const m = tzMinutesOf(dt, 'US')
  if (m === null) return false
  return m >= 4 * 60 && m < 9 * 60 + 30
}

function tzMinutesOf(dt: string, market: Market): number | null {
  if (!dt) return null
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(dt)
  const d = new Date(hasTz ? dt : dt + 'Z')
  if (isNaN(d.getTime())) return null
  const tz = market === 'US' ? 'America/New_York' : 'Asia/Seoul'
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    })
    const parts = fmt.formatToParts(d)
    const hh = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '00', 10)
    const mm = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '00', 10)
    return hh * 60 + mm
  } catch {
    return null
  }
}

function findPreferredAnalysisDay(
  byDay: DailyAnalysis[],
  market: Market,
  includePreMarket: boolean,
  now: Date = new Date(),
): DailyAnalysis | null {
  if (!byDay || byDay.length === 0) return null

  const regularDays = byDay.filter((day) => !/ \(Pre\)$/.test(day.asOfDate))
  const latestRegular = regularDays.length > 0 ? regularDays[regularDays.length - 1] : null
  if (!latestRegular) return null

  const today = marketDateString(now, market)
  const currentMinutes = tzMinutesOf(now.toISOString(), market)
  const todayRegular = [...regularDays].reverse().find((day) => day.asOfDate === today) ?? null

  if (market === 'KR') {
    if (currentMinutes !== null && currentMinutes >= 9 * 60 && todayRegular) return todayRegular
    return latestRegular
  }

  const todayPre = includePreMarket
    ? [...byDay].reverse().find((day) => day.asOfDate === `${today} (Pre)`) ?? null
    : null

  if (currentMinutes !== null && currentMinutes >= 4 * 60 && currentMinutes < 9 * 60 + 30 && todayPre) {
    return todayPre
  }
  if (currentMinutes !== null && currentMinutes >= 4 * 60 && todayRegular) {
    return todayRegular
  }
  return latestRegular
}
