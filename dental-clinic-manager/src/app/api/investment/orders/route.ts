/**
 * 주문 API
 *
 * POST /api/investment/orders - 수동 주문 생성
 * GET  /api/investment/orders - 주문 내역 조회
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { investmentDecrypt } from '@/lib/investmentCrypto'
import { placeKROrder, placeUSOrder } from '@/lib/kisApiService'

const KR_TICKER_REGEX = /^\d{6}$/
const US_TICKER_REGEX = /^[A-Z]{1,5}[.]?[A-Z]?$/

// ============================================
// POST - 수동 주문 생성
// ============================================

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const userId = auth.user!.id

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다' }, { status: 400 })
  }

  const { ticker, market, orderType, orderMethod, quantity, price, idempotencyKey } = body

  // 입력 검증
  if (market !== 'KR' && market !== 'US') {
    return NextResponse.json({ error: '올바른 시장을 선택해주세요' }, { status: 400 })
  }
  if (orderType !== 'buy' && orderType !== 'sell') {
    return NextResponse.json({ error: '올바른 주문 유형을 선택해주세요' }, { status: 400 })
  }
  if (orderMethod !== 'limit' && orderMethod !== 'market') {
    return NextResponse.json({ error: '올바른 주문 방식을 선택해주세요' }, { status: 400 })
  }

  // 종목 코드 검증
  const tickerStr = String(ticker).trim().toUpperCase()
  if (market === 'KR' && !KR_TICKER_REGEX.test(tickerStr)) {
    return NextResponse.json({ error: '국내 종목 코드는 6자리 숫자여야 합니다 (예: 005930)' }, { status: 400 })
  }
  if (market === 'US' && !US_TICKER_REGEX.test(tickerStr)) {
    return NextResponse.json({ error: '미국 종목 코드가 올바르지 않습니다 (예: AAPL)' }, { status: 400 })
  }

  // 수량 검증
  const qty = Number(quantity)
  if (!Number.isInteger(qty) || qty <= 0 || qty > 10000) {
    return NextResponse.json({ error: '수량은 1~10,000 사이의 정수여야 합니다' }, { status: 400 })
  }

  // 가격 검증 (지정가 주문 시)
  let orderPrice = null
  if (orderMethod === 'limit') {
    const p = Number(price)
    if (!p || p <= 0 || p > 10_000_000) {
      return NextResponse.json({ error: '올바른 주문 가격을 입력해주세요' }, { status: 400 })
    }
    orderPrice = p
  }

  // Idempotency Key 확인 (중복 주문 방지)
  if (idempotencyKey && typeof idempotencyKey === 'string') {
    const { data: existing } = await supabase
      .from('idempotency_keys')
      .select('response')
      .eq('key', idempotencyKey)
      .eq('user_id', userId)
      .single()

    if (existing?.response) {
      return NextResponse.json(existing.response as object)
    }
  }

  // 활성 credential 확인 (시장에 맞는 KIS credential 선택)
  const krBrokers = ['kis', 'kis_kr', 'KIS', 'KIS_KR']
  const usBrokers = ['kis_us', 'KIS_US']
  const brokerFilter = market === 'KR' ? krBrokers : [...krBrokers, ...usBrokers]
  const { data: credential } = await supabase
    .from('user_broker_credentials')
    .select('id, app_key_encrypted, app_secret_encrypted, account_number_encrypted, is_paper_trading')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('broker', brokerFilter)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 1) 주문 레코드 생성 — credential 없으면 즉시 failed로 종료
  const { data: order, error } = await supabase
    .from('trade_orders')
    .insert({
      user_id: userId,
      credential_id: credential?.id || null,
      ticker: tickerStr,
      market: market as string,
      order_type: orderType as string,
      order_method: orderMethod as string,
      quantity: qty,
      order_price: orderPrice,
      status: credential ? 'pending' : 'failed',
      automation_level: null, // 수동 주문
      idempotency_key: typeof idempotencyKey === 'string' ? idempotencyKey : null,
      error_message: credential ? null : '연결된 계좌가 없습니다',
    })
    .select()
    .single()

  if (error) {
    console.error('주문 생성 실패:', error)
    return NextResponse.json({ error: '주문 생성에 실패했습니다' }, { status: 500 })
  }

  // 2) credential이 있으면 즉시 KIS API로 주문 전송
  let finalOrder = order
  if (credential) {
    try {
      const cred = credential as {
        id: string
        app_key_encrypted: string
        app_secret_encrypted: string
        account_number_encrypted: string
        is_paper_trading: boolean
      }
      const kisCredential = {
        appKey: investmentDecrypt(cred.app_key_encrypted),
        appSecret: investmentDecrypt(cred.app_secret_encrypted),
        isPaperTrading: Boolean(cred.is_paper_trading),
      }
      const accountNumber = investmentDecrypt(cred.account_number_encrypted)
      const kisPrice = orderMethod === 'limit' ? Number(orderPrice) : 0

      const kisResult = market === 'KR'
        ? await placeKROrder({
            credentialId: cred.id,
            credential: kisCredential,
            accountNumber,
            ticker: tickerStr,
            orderType: orderType as 'buy' | 'sell',
            quantity: qty,
            price: kisPrice,
          })
        : await placeUSOrder({
            credentialId: cred.id,
            credential: kisCredential,
            accountNumber,
            ticker: tickerStr,
            exchange: 'NASD',
            orderType: orderType as 'buy' | 'sell',
            quantity: qty,
            price: kisPrice,
          })

      const kisOrderId = kisResult.output?.ODNO || kisResult.output?.KRX_FWDG_ORD_ORGNO || null
      const { data: updated } = await supabase
        .from('trade_orders')
        .update({ status: 'submitted', kis_order_id: kisOrderId, error_message: null })
        .eq('id', order.id)
        .select()
        .single()
      if (updated) finalOrder = updated

      await supabase.from('investment_audit_logs').insert({
        user_id: userId,
        action: 'trade_created',
        resource_type: 'trade',
        resource_id: order.id,
        status: 'success',
        metadata: {
          ticker: tickerStr, market, orderType, orderMethod, quantity: qty,
          price: kisPrice, kisOrderId, manual: true,
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'KIS 주문 호출 실패'
      console.error('수동 주문 KIS 호출 실패:', err)

      const { data: updated } = await supabase
        .from('trade_orders')
        .update({ status: 'failed', error_message: message })
        .eq('id', order.id)
        .select()
        .single()
      if (updated) finalOrder = updated

      await supabase.from('investment_audit_logs').insert({
        user_id: userId,
        action: 'trade_failed',
        resource_type: 'trade',
        resource_id: order.id,
        status: 'failure',
        error_message: message,
        metadata: { ticker: tickerStr, market, orderType, orderMethod, quantity: qty, manual: true },
      })

      const response = { data: finalOrder, error: message }
      if (idempotencyKey && typeof idempotencyKey === 'string') {
        await supabase.from('idempotency_keys').insert({
          key: idempotencyKey,
          user_id: userId,
          response: response as unknown as object,
        })
      }
      return NextResponse.json(response, { status: 502 })
    }
  }

  const response = { data: finalOrder }

  // Idempotency Key 저장
  if (idempotencyKey && typeof idempotencyKey === 'string') {
    await supabase.from('idempotency_keys').insert({
      key: idempotencyKey,
      user_id: userId,
      response: response as unknown as object,
    })
  }

  return NextResponse.json(response, { status: 201 })
}

// ============================================
// GET - 주문 내역 조회
// ============================================

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const userId = auth.user!.id

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 100)

  const { data, error } = await supabase
    .from('trade_orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }

  return NextResponse.json({ data })
}
