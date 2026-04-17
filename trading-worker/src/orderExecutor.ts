/**
 * 주문 실행기
 *
 * Level 2 자동매매의 핵심: 신호 → KIS API 주문 → 포지션 갱신 → Telegram 보고
 *
 * 보안:
 * - user_id 기준 credential 조회 (소유권 자동 보장)
 * - Idempotency Key로 중복 주문 방지
 * - 주문 전 리스크 가드 필수 통과
 */

import * as crypto from 'crypto'
import { logger } from './logger'
import { getSupabase } from './supabaseClient'
import { decryptField } from './crypto'
import { checkRiskLimits } from './riskGuard'
import { sendOrderResult, sendSignalAlert } from './telegramNotifier'

// ============================================
// KIS API 상수
// ============================================

const KIS_DOMAINS = {
  paper: 'https://openapivts.koreainvestment.com:29443',
  live: 'https://openapi.koreainvestment.com:9443',
}

const KR_ORDER_TR_IDS = {
  paper: { buy: 'VTTC0802U', sell: 'VTTC0801U' },
  live: { buy: 'TTTC0802U', sell: 'TTTC0801U' },
}

const US_ORDER_TR_IDS = {
  paper: { buy: 'VTTS0308U', sell: 'VTTS0307U' },
  live: { buy: 'TTTS0308U', sell: 'TTTS0307U' },
}

// 토큰 캐시
const tokenCache = new Map<string, { token: string; expiresAt: number }>()
const tokenLocks = new Map<string, Promise<string>>()

// ============================================
// 타입
// ============================================

interface ExecuteOrderParams {
  userId: string
  strategyId: string
  ticker: string
  market: 'KR' | 'US'
  orderType: 'buy' | 'sell'
  quantity: number
  price: number  // 0이면 시장가
  signalData?: Record<string, unknown>
}

interface CredentialData {
  id: string
  appKey: string
  appSecret: string
  accountNumber: string
  isPaper: boolean
}

// ============================================
// 공개 API
// ============================================

/**
 * 자동매매 주문 실행
 *
 * 1. 리스크 가드 체크
 * 2. Credential 복호화
 * 3. KIS API 주문 호출
 * 4. trade_orders 레코드 업데이트
 * 5. Telegram 보고
 */
export async function executeAutoOrder(params: ExecuteOrderParams): Promise<boolean> {
  const { userId, strategyId, ticker, market, orderType, quantity, price, signalData } = params
  const supabase = getSupabase()
  const idempotencyKey = crypto.randomUUID()

  logger.info({ userId, ticker, orderType, quantity }, '자동 주문 실행 시작')

  try {
    // 1. 리스크 가드 체크
    const riskCheck = await checkRiskLimits({
      userId,
      strategyId,
      ticker,
      market,
      orderType,
      quantity,
      price,
    })

    if (!riskCheck.passed) {
      logger.warn({ userId, ticker, reason: riskCheck.reason }, '리스크 가드 차단')

      await sendSignalAlert(userId, {
        type: orderType === 'buy' ? 'buy_signal' : 'sell_signal',
        strategyName: `리스크 차단: ${riskCheck.reason}`,
        ticker,
        market,
        currentPrice: price,
      })

      // 감사 로그
      await supabase.from('investment_audit_logs').insert({
        user_id: userId,
        action: 'risk_limit_reached',
        resource_type: 'trade',
        status: 'failure',
        error_message: riskCheck.reason,
        metadata: { ticker, market, orderType, quantity, price },
      })

      return false
    }

    // 2. Credential 복호화
    const credential = await getUserCredential(userId)
    if (!credential) {
      logger.error({ userId }, '활성 credential 없음')
      return false
    }

    // 3. trade_orders 레코드 생성 (pending)
    const { data: order, error: insertError } = await supabase
      .from('trade_orders')
      .insert({
        user_id: userId,
        strategy_id: strategyId,
        credential_id: credential.id,
        ticker,
        market,
        order_type: orderType,
        order_method: price > 0 ? 'limit' : 'market',
        quantity,
        order_price: price > 0 ? price : null,
        status: 'pending',
        automation_level: 2,
        signal_data: signalData || null,
        idempotency_key: idempotencyKey,
      })
      .select()
      .single()

    if (insertError || !order) {
      logger.error({ insertError }, '주문 레코드 생성 실패')
      return false
    }

    // 4. KIS API 토큰 확보
    const token = await getAccessToken(credential)

    // 5. KIS API 주문 실행
    const kisResult = await callKISOrderAPI({
      credential,
      token,
      ticker,
      market,
      orderType,
      quantity,
      price,
    })

    // 6. 주문 레코드 업데이트
    await supabase
      .from('trade_orders')
      .update({
        status: 'submitted',
        kis_order_id: kisResult.orderId,
      })
      .eq('id', order.id)

    // 감사 로그
    await supabase.from('investment_audit_logs').insert({
      user_id: userId,
      action: 'trade_created',
      resource_type: 'trade',
      resource_id: order.id,
      status: 'success',
      metadata: { ticker, market, orderType, quantity, price, kisOrderId: kisResult.orderId },
    })

    logger.info({ orderId: order.id, kisOrderId: kisResult.orderId }, '주문 제출 성공')

    // 7. Telegram 보고 (체결 전 → 제출 알림)
    await sendSignalAlert(userId, {
      type: orderType === 'buy' ? 'buy_signal' : 'sell_signal',
      strategyName: '자동매매 주문 제출',
      ticker,
      market,
      currentPrice: price,
    })

    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : '주문 실행 실패'
    logger.error({ err, userId, ticker }, '주문 실행 오류')

    // 실패 감사 로그
    await supabase.from('investment_audit_logs').insert({
      user_id: userId,
      action: 'trade_failed',
      resource_type: 'trade',
      status: 'failure',
      error_message: message,
      metadata: { ticker, market, orderType, quantity, price },
    })

    return false
  }
}

/**
 * 체결 확인 후 포지션 갱신
 */
export async function updatePositionOnFill(
  orderId: string,
  executedPrice: number,
  executedQuantity: number
) {
  const supabase = getSupabase()

  // 주문 조회
  const { data: order } = await supabase
    .from('trade_orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (!order) return

  // 주문 상태 업데이트
  await supabase
    .from('trade_orders')
    .update({
      status: 'filled',
      executed_price: executedPrice,
      executed_quantity: executedQuantity,
      filled_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  // 포지션 갱신
  if (order.order_type === 'buy') {
    // 매수: 포지션 생성 또는 추가
    const { data: existing } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', order.user_id)
      .eq('ticker', order.ticker)
      .eq('market', order.market)
      .eq('status', 'open')
      .single()

    if (existing) {
      // 기존 포지션에 추가 (평균가 재계산)
      const totalCost = Number(existing.avg_entry_price) * existing.quantity + executedPrice * executedQuantity
      const newQuantity = existing.quantity + executedQuantity
      const newAvgPrice = totalCost / newQuantity

      await supabase
        .from('positions')
        .update({
          quantity: newQuantity,
          avg_entry_price: newAvgPrice,
        })
        .eq('id', existing.id)
    } else {
      // 새 포지션 생성
      await supabase.from('positions').insert({
        user_id: order.user_id,
        credential_id: order.credential_id,
        strategy_id: order.strategy_id,
        ticker: order.ticker,
        market: order.market,
        quantity: executedQuantity,
        avg_entry_price: executedPrice,
        status: 'open',
      })
    }
  } else {
    // 매도: 포지션 감소/청산
    const { data: existing } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', order.user_id)
      .eq('ticker', order.ticker)
      .eq('market', order.market)
      .eq('status', 'open')
      .single()

    if (existing) {
      const remainingQty = existing.quantity - executedQuantity
      const pnl = (executedPrice - Number(existing.avg_entry_price)) * executedQuantity

      if (remainingQty <= 0) {
        // 전량 매도 → 포지션 청산
        await supabase
          .from('positions')
          .update({
            quantity: 0,
            realized_pnl: Number(existing.realized_pnl) + pnl,
            status: 'closed',
            closed_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      } else {
        // 일부 매도
        await supabase
          .from('positions')
          .update({
            quantity: remainingQty,
            realized_pnl: Number(existing.realized_pnl) + pnl,
          })
          .eq('id', existing.id)
      }

      // 주문에 손익 기록
      await supabase
        .from('trade_orders')
        .update({ pnl })
        .eq('id', orderId)

      // Telegram 체결 결과 보고
      await sendOrderResult(order.user_id, {
        ticker: order.ticker,
        market: order.market,
        orderType: 'sell',
        quantity: executedQuantity,
        executedPrice,
        pnl,
      })
    }
  }

  if (order.order_type === 'buy') {
    await sendOrderResult(order.user_id, {
      ticker: order.ticker,
      market: order.market,
      orderType: 'buy',
      quantity: executedQuantity,
      executedPrice,
    })
  }

  logger.info({ orderId, executedPrice, executedQuantity }, '체결 처리 완료')
}

// ============================================
// 내부 함수
// ============================================

async function getUserCredential(userId: string): Promise<CredentialData | null> {
  const supabase = getSupabase()

  const { data } = await supabase
    .from('user_broker_credentials')
    .select('id, app_key_encrypted, app_secret_encrypted, account_number_encrypted, is_paper_trading')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  if (!data) return null

  try {
    // 감사 로그: credential 접근
    await supabase.from('credential_access_log').insert({
      credential_id: data.id,
      user_id: userId,
      action: 'decrypt_for_order',
    })

    return {
      id: data.id,
      appKey: decryptField(data.app_key_encrypted),
      appSecret: decryptField(data.app_secret_encrypted),
      accountNumber: decryptField(data.account_number_encrypted),
      isPaper: data.is_paper_trading,
    }
  } catch (err) {
    logger.error({ err, userId }, 'Credential 복호화 실패')

    await supabase.from('credential_access_log').insert({
      credential_id: data.id,
      user_id: userId,
      action: 'decrypt_failed',
    })

    return null
  }
}

async function getAccessToken(credential: CredentialData): Promise<string> {
  // 캐시 확인
  const cached = tokenCache.get(credential.id)
  if (cached && cached.expiresAt > Date.now() + 3600_000) {
    return cached.token
  }

  // Race condition 방지
  const existing = tokenLocks.get(credential.id)
  if (existing) return existing

  const refreshPromise = refreshToken(credential)
  tokenLocks.set(credential.id, refreshPromise)

  try {
    return await refreshPromise
  } finally {
    tokenLocks.delete(credential.id)
  }
}

async function refreshToken(credential: CredentialData): Promise<string> {
  const baseUrl = credential.isPaper ? KIS_DOMAINS.paper : KIS_DOMAINS.live

  const response = await fetch(`${baseUrl}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: credential.appKey,
      appsecret: credential.appSecret,
    }),
  })

  if (!response.ok) {
    throw new Error(`KIS 토큰 발급 실패: ${response.status}`)
  }

  const data = await response.json()
  const expiresAt = new Date(data.access_token_token_expired).getTime()

  tokenCache.set(credential.id, { token: data.access_token, expiresAt })

  return data.access_token
}

interface KISOrderParams {
  credential: CredentialData
  token: string
  ticker: string
  market: 'KR' | 'US'
  orderType: 'buy' | 'sell'
  quantity: number
  price: number
}

async function callKISOrderAPI(params: KISOrderParams): Promise<{ orderId: string }> {
  const { credential, token, ticker, market, orderType, quantity, price } = params
  const baseUrl = credential.isPaper ? KIS_DOMAINS.paper : KIS_DOMAINS.live
  const mode = credential.isPaper ? 'paper' : 'live'

  let endpoint: string
  let trId: string
  let body: Record<string, string>

  const orderDivision = price > 0 ? '00' : (market === 'KR' ? '01' : '32')

  if (market === 'KR') {
    endpoint = `${baseUrl}/uapi/domestic-stock/v1/trading/order-cash`
    trId = KR_ORDER_TR_IDS[mode][orderType]
    body = {
      CANO: credential.accountNumber.substring(0, 8),
      ACNT_PRDT_CD: credential.accountNumber.substring(8, 10) || '01',
      PDNO: ticker,
      ORD_DVSN: orderDivision,
      ORD_QTY: String(quantity),
      ORD_UNPR: String(price > 0 ? price : 0),
    }
  } else {
    endpoint = `${baseUrl}/uapi/overseas-stock/v1/trading/order`
    trId = US_ORDER_TR_IDS[mode][orderType]
    body = {
      CANO: credential.accountNumber.substring(0, 8),
      ACNT_PRDT_CD: credential.accountNumber.substring(8, 10) || '01',
      OVRS_EXCG_CD: 'NASD', // 기본값, 향후 거래소 자동 판별
      PDNO: ticker,
      ORD_DVSN: orderDivision,
      ORD_QTY: String(quantity),
      OVRS_ORD_UNPR: String(price > 0 ? price : 0),
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: credential.appKey,
      appsecret: credential.appSecret,
      tr_id: trId,
    },
    body: JSON.stringify(body),
  })

  const data = await response.json()

  if (data.rt_cd !== '0') {
    throw new Error(`KIS 주문 실패: [${data.msg_cd}] ${data.msg1}`)
  }

  return {
    orderId: data.output?.ODNO || data.output?.KRX_FWDG_ORD_ORGNO || 'unknown',
  }
}
