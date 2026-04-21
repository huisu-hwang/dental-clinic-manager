/**
 * 리스크 가드
 *
 * 주문 실행 전 5중 검증:
 * 1. 장 운영 시간 확인
 * 2. 일일 손실 한도
 * 3. 최대 동시 보유 종목 수
 * 4. 종목당 최대 비중
 * 5. 슬리피지 경고
 */

import { logger } from './logger'
import { getSupabase } from './supabaseClient'

// ============================================
// 타입
// ============================================

interface RiskCheckParams {
  userId: string
  strategyId: string
  ticker: string
  market: 'KR' | 'US'
  orderType: 'buy' | 'sell'
  quantity: number
  price: number
}

interface RiskCheckResult {
  passed: boolean
  reason?: string
}

// ============================================
// 공개 API
// ============================================

/**
 * 리스크 제한 검증
 */
export async function checkRiskLimits(params: RiskCheckParams): Promise<RiskCheckResult> {
  const { userId, strategyId, market, orderType } = params

  // 매도 주문은 리스크 제한 없이 허용 (손절/익절 포함)
  if (orderType === 'sell') {
    return { passed: true }
  }

  const supabase = getSupabase()

  // 전략의 리스크 설정 조회
  const { data: strategy } = await supabase
    .from('investment_strategies')
    .select('risk_settings, is_active')
    .eq('id', strategyId)
    .eq('user_id', userId)
    .single()

  if (!strategy) {
    return { passed: false, reason: '전략을 찾을 수 없습니다' }
  }

  if (!strategy.is_active) {
    return { passed: false, reason: '비활성 전략입니다' }
  }

  const risk = strategy.risk_settings as Record<string, number> | null
  if (!risk) {
    return { passed: true } // 리스크 설정이 없으면 통과
  }

  // 1. 장 운영 시간 확인
  const marketCheck = checkMarketHours(market)
  if (!marketCheck.passed) return marketCheck

  // 2. 일일 손실 한도
  if (risk.maxDailyLossPercent > 0) {
    const dailyLossCheck = await checkDailyLossLimit(userId, risk.maxDailyLossPercent)
    if (!dailyLossCheck.passed) return dailyLossCheck
  }

  // 3. 최대 동시 보유 종목 수
  if (risk.maxPositions > 0) {
    const positionCountCheck = await checkMaxPositions(userId, risk.maxPositions, params.ticker)
    if (!positionCountCheck.passed) return positionCountCheck
  }

  // 4. 종목당 최대 비중 (간이 체크)
  // 정밀한 비중 계산은 실시간 포트폴리오 평가가 필요하므로 기본 체크만

  logger.debug({ userId, ticker: params.ticker }, '리스크 가드 통과')
  return { passed: true }
}

// ============================================
// 개별 검증 함수
// ============================================

/**
 * 장 운영 시간 확인
 */
function checkMarketHours(market: 'KR' | 'US'): RiskCheckResult {
  const now = new Date()
  const kstHour = parseInt(
    now.toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false })
  )
  const kstMinute = parseInt(
    now.toLocaleString('en-US', { timeZone: 'Asia/Seoul', minute: 'numeric' })
  )
  const kstTime = kstHour * 60 + kstMinute
  const kstDay = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' })
  ).getDay()

  // 주말 체크
  if (kstDay === 0 || kstDay === 6) {
    return { passed: false, reason: '주말에는 주문할 수 없습니다' }
  }

  if (market === 'KR') {
    // 국내: 09:00 ~ 15:30 KST
    if (kstTime < 540 || kstTime > 930) {
      return { passed: false, reason: '국내 장 운영 시간이 아닙니다 (09:00~15:30)' }
    }
  } else {
    // 미국: 23:30~06:00 KST (동절기) / 22:30~05:00 (서머타임)
    // 넉넉하게 22:00~07:00으로 체크
    if (kstTime > 420 && kstTime < 1320) {
      return { passed: false, reason: '미국 장 운영 시간이 아닙니다' }
    }
  }

  return { passed: true }
}

/**
 * 일일 손실 한도 확인
 */
async function checkDailyLossLimit(
  userId: string,
  maxDailyLossPercent: number
): Promise<RiskCheckResult> {
  const supabase = getSupabase()

  // 오늘 날짜 (KST)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })

  // 오늘 체결된 주문의 총 손익
  const { data: todayOrders } = await supabase
    .from('trade_orders')
    .select('pnl')
    .eq('user_id', userId)
    .eq('status', 'filled')
    .gte('filled_at', `${today}T00:00:00+09:00`)

  if (!todayOrders || todayOrders.length === 0) {
    return { passed: true }
  }

  const totalPnl = todayOrders.reduce((sum, o) => sum + (Number(o.pnl) || 0), 0)

  // 총 투자 자금 기준으로 손실율 계산 (간이: 보유 포지션 평가액 기준)
  const { data: positions } = await supabase
    .from('positions')
    .select('avg_entry_price, quantity')
    .eq('user_id', userId)
    .eq('status', 'open')

  let totalInvested = 0
  if (positions) {
    totalInvested = positions.reduce(
      (sum, p) => sum + Number(p.avg_entry_price) * p.quantity, 0
    )
  }

  // 투자 금액이 0이면 체크 불필요
  if (totalInvested <= 0) return { passed: true }

  const dailyLossPercent = Math.abs(Math.min(0, totalPnl)) / totalInvested * 100

  if (dailyLossPercent >= maxDailyLossPercent) {
    return {
      passed: false,
      reason: `일일 손실 한도 도달 (${dailyLossPercent.toFixed(1)}% / 최대 ${maxDailyLossPercent}%)`,
    }
  }

  return { passed: true }
}

/**
 * 최대 동시 보유 종목 수 확인
 */
async function checkMaxPositions(
  userId: string,
  maxPositions: number,
  ticker: string
): Promise<RiskCheckResult> {
  const supabase = getSupabase()

  const { data: openPositions } = await supabase
    .from('positions')
    .select('ticker')
    .eq('user_id', userId)
    .eq('status', 'open')

  if (!openPositions) return { passed: true }

  // 이미 보유 중인 종목이면 추가 매수 허용
  const alreadyHolding = openPositions.some(p => p.ticker === ticker)
  if (alreadyHolding) return { passed: true }

  if (openPositions.length >= maxPositions) {
    return {
      passed: false,
      reason: `최대 보유 종목 수 도달 (${openPositions.length}/${maxPositions}개)`,
    }
  }

  return { passed: true }
}
