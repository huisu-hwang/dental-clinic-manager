/**
 * 투자 전략 CRUD API
 *
 * POST   /api/investment/strategies - 전략 생성
 * GET    /api/investment/strategies - 내 전략 목록
 * PATCH  /api/investment/strategies - 전략 수정
 * DELETE /api/investment/strategies - 전략 삭제
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { validateConditionTree, validateIndicators } from '@/lib/conditionTreeValidator'
import type { Market, Timeframe, AutomationLevel } from '@/types/investment'

const VALID_MARKETS: Market[] = ['KR', 'US']
const VALID_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '1d', '1w']

// ============================================
// POST - 전략 생성
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

  // 필수 필드 검증
  const { name, targetMarket, timeframe, indicators, buyConditions, sellConditions, riskSettings, automationLevel } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
    return NextResponse.json({ error: '전략 이름을 입력해주세요 (최대 100자)' }, { status: 400 })
  }

  if (!VALID_MARKETS.includes(targetMarket as Market)) {
    return NextResponse.json({ error: '올바른 시장을 선택해주세요' }, { status: 400 })
  }

  if (!VALID_TIMEFRAMES.includes(timeframe as Timeframe)) {
    return NextResponse.json({ error: '올바른 시간 프레임을 선택해주세요' }, { status: 400 })
  }

  if (automationLevel !== 1 && automationLevel !== 2) {
    return NextResponse.json({ error: '자동화 수준은 1 또는 2여야 합니다' }, { status: 400 })
  }

  // 지표 검증
  const indicatorsResult = validateIndicators(indicators)
  if (!indicatorsResult.valid) {
    return NextResponse.json({ error: indicatorsResult.error }, { status: 400 })
  }

  // 조건 트리 검증
  const buyResult = validateConditionTree(buyConditions)
  if (!buyResult.valid) {
    return NextResponse.json({ error: `매수 조건: ${buyResult.error}` }, { status: 400 })
  }

  const sellResult = validateConditionTree(sellConditions)
  if (!sellResult.valid) {
    return NextResponse.json({ error: `매도 조건: ${sellResult.error}` }, { status: 400 })
  }

  // 리스크 설정 검증
  const risk = riskSettings as Record<string, number> | undefined
  if (!risk || typeof risk !== 'object') {
    return NextResponse.json({ error: '리스크 설정이 필요합니다' }, { status: 400 })
  }

  // 전략 개수 제한 (사용자당 최대 10개)
  const { count } = await supabase
    .from('investment_strategies')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: '전략은 최대 10개까지 생성 가능합니다' }, { status: 400 })
  }

  // DB 저장
  const { data, error } = await supabase
    .from('investment_strategies')
    .insert({
      user_id: userId,
      name: (name as string).trim(),
      description: typeof body.description === 'string' ? body.description.trim() : null,
      target_market: targetMarket as string,
      timeframe: timeframe as string,
      indicators: indicators as object,
      buy_conditions: buyConditions as object,
      sell_conditions: sellConditions as object,
      risk_settings: riskSettings as object,
      automation_level: automationLevel as number,
      is_active: false, // 신규 전략은 비활성
    })
    .select()
    .single()

  if (error) {
    console.error('전략 생성 실패:', error)
    return NextResponse.json({ error: '전략 생성에 실패했습니다' }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}

// ============================================
// GET - 내 전략 목록
// ============================================

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const userId = auth.user!.id

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('investment_strategies')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('전략 조회 실패:', error)
    return NextResponse.json({ error: '전략 조회에 실패했습니다' }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// ============================================
// PATCH - 전략 수정
// ============================================

export async function PATCH(request: NextRequest) {
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

  const { id, ...updates } = body
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: '전략 ID가 필요합니다' }, { status: 400 })
  }

  // 소유권 확인
  const { data: existing } = await supabase
    .from('investment_strategies')
    .select('id, user_id, is_active, automation_level')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: '전략을 찾을 수 없습니다' }, { status: 404 })
  }

  // 활성 전략은 일부 필드만 수정 가능
  if (existing.is_active) {
    const allowedActiveFields = ['name', 'description', 'riskSettings', 'automationLevel', 'isActive']
    const requestedFields = Object.keys(updates)
    const disallowed = requestedFields.filter(f => !allowedActiveFields.includes(f))
    if (disallowed.length > 0) {
      return NextResponse.json(
        { error: `활성 전략의 ${disallowed.join(', ')} 필드는 수정할 수 없습니다. 먼저 비활성화해주세요.` },
        { status: 400 }
      )
    }
  }

  // 업데이트 객체 구성
  const updateData: Record<string, unknown> = {}

  if (updates.name !== undefined) {
    if (typeof updates.name !== 'string' || updates.name.trim().length === 0) {
      return NextResponse.json({ error: '전략 이름이 올바르지 않습니다' }, { status: 400 })
    }
    updateData.name = (updates.name as string).trim()
  }
  if (updates.description !== undefined) {
    updateData.description = typeof updates.description === 'string' ? updates.description.trim() : null
  }
  if (updates.targetMarket !== undefined) {
    if (!VALID_MARKETS.includes(updates.targetMarket as Market)) {
      return NextResponse.json({ error: '올바른 시장을 선택해주세요' }, { status: 400 })
    }
    updateData.target_market = updates.targetMarket
  }
  if (updates.timeframe !== undefined) {
    if (!VALID_TIMEFRAMES.includes(updates.timeframe as Timeframe)) {
      return NextResponse.json({ error: '올바른 시간 프레임을 선택해주세요' }, { status: 400 })
    }
    updateData.timeframe = updates.timeframe
  }
  if (updates.indicators !== undefined) {
    const r = validateIndicators(updates.indicators)
    if (!r.valid) return NextResponse.json({ error: r.error }, { status: 400 })
    updateData.indicators = updates.indicators
  }
  if (updates.buyConditions !== undefined) {
    const r = validateConditionTree(updates.buyConditions)
    if (!r.valid) return NextResponse.json({ error: `매수 조건: ${r.error}` }, { status: 400 })
    updateData.buy_conditions = updates.buyConditions
  }
  if (updates.sellConditions !== undefined) {
    const r = validateConditionTree(updates.sellConditions)
    if (!r.valid) return NextResponse.json({ error: `매도 조건: ${r.error}` }, { status: 400 })
    updateData.sell_conditions = updates.sellConditions
  }
  if (updates.riskSettings !== undefined) {
    updateData.risk_settings = updates.riskSettings
  }
  if (updates.automationLevel !== undefined) {
    if (updates.automationLevel !== 1 && updates.automationLevel !== 2) {
      return NextResponse.json({ error: '자동화 수준은 1 또는 2여야 합니다' }, { status: 400 })
    }
    updateData.automation_level = updates.automationLevel
  }
  if (updates.isActive !== undefined) {
    const activating = Boolean(updates.isActive)

    // 활성화 시 사전 조건 체크
    if (activating && !existing.is_active) {
      // 1. 감시 종목 존재 여부
      const { count: watchCount } = await supabase
        .from('strategy_watchlist')
        .select('id', { count: 'exact', head: true })
        .eq('strategy_id', id)
        .eq('is_active', true)
      if ((watchCount ?? 0) === 0) {
        return NextResponse.json({
          error: '감시 종목이 없습니다. 자동매매할 종목을 먼저 추가해주세요.',
          code: 'NO_WATCHLIST',
        }, { status: 400 })
      }

      // 2. 활성 계좌 존재 여부 (Level 2 자동매매만)
      if (existing.automation_level === 2) {
        const { count: credCount } = await supabase
          .from('user_broker_credentials')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_active', true)
        if ((credCount ?? 0) === 0) {
          return NextResponse.json({
            error: 'Level 2 자동매매는 증권 계좌 연결이 필요합니다.',
            code: 'NO_CREDENTIAL',
          }, { status: 400 })
        }
      }
    }

    updateData.is_active = activating
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: '수정할 내용이 없습니다' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('investment_strategies')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('전략 수정 실패:', error)
    return NextResponse.json({ error: '전략 수정에 실패했습니다' }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// ============================================
// DELETE - 전략 삭제
// ============================================

export async function DELETE(request: NextRequest) {
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
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: '전략 ID가 필요합니다' }, { status: 400 })
  }

  // 소유권 + 상태 확인
  const { data: existing } = await supabase
    .from('investment_strategies')
    .select('id, is_active')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: '전략을 찾을 수 없습니다' }, { status: 404 })
  }

  if (existing.is_active) {
    return NextResponse.json({ error: '활성 전략은 삭제할 수 없습니다. 먼저 비활성화해주세요.' }, { status: 400 })
  }

  // 삭제 (CASCADE로 watchlist, backtest_runs도 함께 삭제)
  const { error } = await supabase
    .from('investment_strategies')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    console.error('전략 삭제 실패:', error)
    return NextResponse.json({ error: '전략 삭제에 실패했습니다' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
