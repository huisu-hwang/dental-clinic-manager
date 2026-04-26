/**
 * 시장 단계(MarketRegime) 분류 + 전략 매칭 점수 계산
 *
 * 종목의 최근 가격 흐름에서 추세/변동성/모멘텀 3축을 분석하여
 * 7개 시장 단계 중 하나로 분류한다. 각 프리셋의 적합 시장 상황과 매칭하여
 * 0~100 점의 룰 기반 적합도 점수를 산출한다.
 */

import { SMA, RSI, ADX, ATR, BollingerBands } from 'technicalindicators'
import type { OHLCV, MarketAnalysis, MarketRegime } from '@/types/investment'

/**
 * 가격 데이터에서 시장 분석 수행
 *
 * @param prices 일봉 OHLCV (최소 252봉 권장)
 * @param ticker 분석 대상 종목
 * @param market 시장 코드
 */
export function analyzeMarket(
  prices: OHLCV[],
  ticker: string,
  market: 'KR' | 'US'
): MarketAnalysis {
  if (prices.length < 30) {
    throw new Error(`분석에 최소 30거래일 데이터 필요 (현재 ${prices.length})`)
  }

  const closes = prices.map(p => p.close)
  const highs = prices.map(p => p.high)
  const lows = prices.map(p => p.low)

  const lastClose = closes[closes.length - 1]
  const lastDate = prices[prices.length - 1].date

  // === SMA 200 (추세 기준) ===
  const sma200Result = SMA.calculate({ values: closes, period: Math.min(200, prices.length - 1) })
  const sma200 = sma200Result[sma200Result.length - 1] ?? lastClose
  const priceVsSMA200 = ((lastClose - sma200) / sma200) * 100

  // === ADX (추세 강도) ===
  const adxResult = ADX.calculate({ close: closes, high: highs, low: lows, period: 14 })
  const adx = adxResult[adxResult.length - 1]?.adx ?? 0

  // === RSI ===
  const rsiResult = RSI.calculate({ values: closes, period: 14 })
  const rsi = rsiResult[rsiResult.length - 1] ?? 50

  // === Bollinger 폭 (변동성) ===
  const bbResult = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 })
  const bbLast = bbResult[bbResult.length - 1]
  const bbWidth = bbLast ? ((bbLast.upper - bbLast.lower) / bbLast.middle) * 100 : 0

  // === ATR / 종가 (변동성) ===
  const atrResult = ATR.calculate({ close: closes, high: highs, low: lows, period: 14 })
  const atr = atrResult[atrResult.length - 1] ?? 0
  const atrPercent = (atr / lastClose) * 100

  // === 모멘텀 (1개월 ≈ 21봉, 6개월 ≈ 126봉) ===
  const momentum1M = lookbackReturn(closes, 21)
  const momentum6M = lookbackReturn(closes, 126)

  // === 시장 단계 분류 ===
  const { regime, reasoning } = classifyRegime({
    priceVsSMA200, adx, rsi, bbWidth, atrPercent, momentum1M, momentum6M,
  })

  return {
    ticker,
    market,
    asOf: lastDate,
    regime,
    metrics: {
      priceVsSMA200: round2(priceVsSMA200),
      adx: round2(adx),
      rsi: round2(rsi),
      bbWidth: round2(bbWidth),
      atrPercent: round2(atrPercent),
      momentum6M: round2(momentum6M),
      momentum1M: round2(momentum1M),
    },
    reasoning,
  }
}

interface RegimeInputs {
  priceVsSMA200: number
  adx: number
  rsi: number
  bbWidth: number
  atrPercent: number
  momentum1M: number
  momentum6M: number
}

/**
 * 7가지 시장 단계 분류 룰
 *
 * 우선순위로 평가:
 * 1. overbought (RSI >= 75)
 * 2. oversold-bounce (RSI <= 25)
 * 3. high-volatility (BB width > 8% OR ATR% > 4%)
 * 4. strong-uptrend (가격 > SMA200 + ADX 강 + 6개월 모멘텀 양)
 * 5. weak-uptrend (가격 > SMA200, 추세 약)
 * 6. downtrend (가격 < SMA200 + 6개월 모멘텀 음)
 * 7. sideways (그 외)
 */
function classifyRegime(x: RegimeInputs): { regime: MarketRegime; reasoning: string[] } {
  const reasoning: string[] = []

  if (x.rsi >= 75) {
    reasoning.push(`RSI ${x.rsi.toFixed(1)} ≥ 75 → 단기 과매수`)
    if (x.momentum1M > 10) reasoning.push(`최근 1개월 +${x.momentum1M.toFixed(1)}% 급등`)
    return { regime: 'overbought', reasoning }
  }

  if (x.rsi <= 25) {
    reasoning.push(`RSI ${x.rsi.toFixed(1)} ≤ 25 → 단기 과매도`)
    if (x.momentum1M < -10) reasoning.push(`최근 1개월 ${x.momentum1M.toFixed(1)}% 급락`)
    return { regime: 'oversold-bounce', reasoning }
  }

  // 변동성 우선 분기 (추세보다 변동성 신호가 강할 때)
  if (x.bbWidth > 12 || x.atrPercent > 4.5) {
    reasoning.push(`BB 폭 ${x.bbWidth.toFixed(1)}%, ATR ${x.atrPercent.toFixed(2)}% → 변동성 확대`)
    return { regime: 'high-volatility', reasoning }
  }

  if (x.priceVsSMA200 > 0) {
    if (x.adx > 25 && x.momentum6M > 5) {
      reasoning.push(`SMA200 위 (+${x.priceVsSMA200.toFixed(1)}%), ADX ${x.adx.toFixed(0)} 강한 추세, 6M +${x.momentum6M.toFixed(1)}%`)
      return { regime: 'strong-uptrend', reasoning }
    }
    reasoning.push(`SMA200 위 (+${x.priceVsSMA200.toFixed(1)}%), ADX ${x.adx.toFixed(0)} 약한 추세`)
    return { regime: 'weak-uptrend', reasoning }
  }

  if (x.priceVsSMA200 < -3 && x.momentum6M < 0) {
    reasoning.push(`SMA200 아래 (${x.priceVsSMA200.toFixed(1)}%), 6M ${x.momentum6M.toFixed(1)}% → 하락 추세`)
    return { regime: 'downtrend', reasoning }
  }

  reasoning.push(`SMA200 부근 (${x.priceVsSMA200.toFixed(1)}%), ADX ${x.adx.toFixed(0)} → 횡보`)
  return { regime: 'sideways', reasoning }
}

/**
 * 시장 단계와 프리셋의 marketConditions 매칭 점수 (0~100)
 *
 * - 정확히 매칭: +60
 * - 인접 단계 매칭(예: weak/strong-uptrend): +30
 * - 매칭 안 되지만 호환(uptrend류): +10
 * - 그 외: 0
 *
 * 추가로 RSI/ADX 같은 정량 지표로 보너스/페널티
 */
export function scoreStrategyForRegime(
  presetMarketConditions: MarketRegime[] | undefined,
  analysis: MarketAnalysis
): { score: number; reasons: string[] } {
  const reasons: string[] = []

  if (!presetMarketConditions || presetMarketConditions.length === 0) {
    return { score: 50, reasons: ['전략에 적합 시장 정보 없음 (중립 점수)'] }
  }

  const regime = analysis.regime
  let score = 0

  // 1. 직접 매칭
  if (presetMarketConditions.includes(regime)) {
    score += 60
    reasons.push(`현재 시장 단계(${regimeLabel(regime)})에 직접 적합`)
  } else {
    // 2. 인접 단계 (uptrend류 끼리, oversold/sideways 끼리 등)
    const adjacent = adjacentRegimes(regime)
    const adjMatch = presetMarketConditions.find(c => adjacent.includes(c))
    if (adjMatch) {
      score += 30
      reasons.push(`인접 시장 단계(${regimeLabel(adjMatch)})에 적합`)
    } else {
      score += 5
      reasons.push(`현재 시장 단계와 직접 매칭 안 됨`)
    }
  }

  // 3. RSI 기반 보너스
  // 과매수 전략(marketConditions에 overbought)에 RSI 높음 → 그 기회 활용 가능
  // 과매도 전략(oversold-bounce)에 RSI 낮음 → 매수 기회 충족
  if (presetMarketConditions.includes('oversold-bounce') && analysis.metrics.rsi < 35) {
    score += 15
    reasons.push(`RSI ${analysis.metrics.rsi.toFixed(0)} 낮아 과매도 진입 기회`)
  }
  if (presetMarketConditions.includes('strong-uptrend') && analysis.metrics.adx > 25) {
    score += 10
    reasons.push(`ADX ${analysis.metrics.adx.toFixed(0)} 강한 추세`)
  }
  if (presetMarketConditions.includes('high-volatility') && analysis.metrics.atrPercent > 3) {
    score += 10
    reasons.push(`ATR ${analysis.metrics.atrPercent.toFixed(1)}% 변동성 확대`)
  }

  // 4. 페널티: 하락 추세에서 매수 전략은 위험
  if (regime === 'downtrend' && !presetMarketConditions.includes('downtrend')) {
    score -= 15
    reasons.push(`현재 하락 추세 — 매수 전략 위험`)
  }

  return { score: Math.max(0, Math.min(100, score)), reasons }
}

function adjacentRegimes(regime: MarketRegime): MarketRegime[] {
  switch (regime) {
    case 'strong-uptrend': return ['weak-uptrend', 'high-volatility']
    case 'weak-uptrend': return ['strong-uptrend', 'sideways']
    case 'sideways': return ['weak-uptrend', 'oversold-bounce']
    case 'high-volatility': return ['strong-uptrend', 'oversold-bounce']
    case 'oversold-bounce': return ['sideways', 'high-volatility', 'downtrend']
    case 'overbought': return ['strong-uptrend']
    case 'downtrend': return ['oversold-bounce', 'sideways']
    default: return []
  }
}

function regimeLabel(r: MarketRegime): string {
  return ({
    'strong-uptrend': '강한 상승 추세',
    'weak-uptrend': '약한 상승 추세',
    'sideways': '횡보',
    'high-volatility': '변동성 확대',
    'downtrend': '하락 추세',
    'oversold-bounce': '과매도 반등',
    'overbought': '과매수',
  } as Record<MarketRegime, string>)[r]
}

function lookbackReturn(closes: number[], lookback: number): number {
  if (closes.length <= lookback) return 0
  const past = closes[closes.length - 1 - lookback]
  const now = closes[closes.length - 1]
  return ((now - past) / past) * 100
}

function round2(n: number): number {
  if (!isFinite(n)) return 0
  return Math.round(n * 100) / 100
}
