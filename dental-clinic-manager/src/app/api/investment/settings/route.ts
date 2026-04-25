/**
 * 사용자별 자동매매 설정 API
 *
 * GET  /api/investment/settings - 내 설정 조회 (없으면 기본값 반환)
 * PUT  /api/investment/settings - 설정 저장/갱신 (UPSERT)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  DEFAULT_USER_INVESTMENT_SETTINGS,
  type UserInvestmentSettingsInput,
} from '@/types/investment'

interface SettingsRow {
  user_id: string
  daily_loss_limit_enabled: boolean
  daily_loss_limit_percent: number | string
  entry_stop_loss_enabled: boolean
  entry_stop_loss_percent: number | string
}

function rowToInput(row: SettingsRow | null): UserInvestmentSettingsInput {
  if (!row) return { ...DEFAULT_USER_INVESTMENT_SETTINGS }
  return {
    dailyLossLimitEnabled: !!row.daily_loss_limit_enabled,
    dailyLossLimitPercent: Number(row.daily_loss_limit_percent),
    entryStopLossEnabled: !!row.entry_stop_loss_enabled,
    entryStopLossPercent: Number(row.entry_stop_loss_percent),
  }
}

function clampPercent(v: unknown, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  if (n <= 0) return 0.1
  if (n > 100) return 100
  return Math.round(n * 100) / 100
}

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
    .from('user_investment_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('자동매매 설정 조회 실패:', error)
    return NextResponse.json({ error: '설정 조회에 실패했습니다' }, { status: 500 })
  }

  return NextResponse.json({ data: rowToInput(data as SettingsRow | null) })
}

export async function PUT(request: NextRequest) {
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

  const dailyLossLimitEnabled = Boolean(body.dailyLossLimitEnabled)
  const entryStopLossEnabled = Boolean(body.entryStopLossEnabled)
  const dailyLossLimitPercent = clampPercent(
    body.dailyLossLimitPercent,
    DEFAULT_USER_INVESTMENT_SETTINGS.dailyLossLimitPercent
  )
  const entryStopLossPercent = clampPercent(
    body.entryStopLossPercent,
    DEFAULT_USER_INVESTMENT_SETTINGS.entryStopLossPercent
  )

  const { data, error } = await supabase
    .from('user_investment_settings')
    .upsert(
      {
        user_id: userId,
        daily_loss_limit_enabled: dailyLossLimitEnabled,
        daily_loss_limit_percent: dailyLossLimitPercent,
        entry_stop_loss_enabled: entryStopLossEnabled,
        entry_stop_loss_percent: entryStopLossPercent,
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single()

  if (error) {
    console.error('자동매매 설정 저장 실패:', error)
    return NextResponse.json({ error: '설정 저장에 실패했습니다' }, { status: 500 })
  }

  return NextResponse.json({ data: rowToInput(data as SettingsRow) })
}
