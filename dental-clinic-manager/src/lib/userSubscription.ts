// src/lib/userSubscription.ts
// 자동매매(및 그 서브 기능) 진입 게이팅 단일 헬퍼.
// 모든 자동매매 페이지/API는 이 헬퍼 한 줄로 게이팅한다.

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { UserSubscription, UserSubscriptionPlan } from '@/types/userSubscription'

export type GateResult =
  | { ok: true; subscription: UserSubscription & { plan: UserSubscriptionPlan } }
  | { ok: false; reason: 'NO_SUBSCRIPTION' | 'PAST_DUE' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED' }

const FEATURE_INVESTMENT = 'investment'

/**
 * 개인 자동매매 구독 상태 조회. 분기는 호출 측이 처리.
 * 사용자는 한 feature에 대해 1개 활성 구독만 가질 수 있다 (UNIQUE(user_id, plan_id)).
 */
export async function checkInvestmentSubscription(userId: string): Promise<GateResult> {
  const admin = getSupabaseAdmin()
  if (!admin) return { ok: false, reason: 'NO_SUBSCRIPTION' }

  const { data } = await admin
    .from('user_subscriptions')
    .select(`*, plan:user_subscription_plans!inner(*)`)
    .eq('user_id', userId)
    .eq('plan.feature_id', FEATURE_INVESTMENT)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return { ok: false, reason: 'NO_SUBSCRIPTION' }

  const sub = data as unknown as UserSubscription & { plan: UserSubscriptionPlan }
  const status = sub.status

  if (status === 'active') return { ok: true, subscription: sub }
  if (status === 'past_due') return { ok: false, reason: 'PAST_DUE' }
  if (status === 'expired') return { ok: false, reason: 'EXPIRED' }
  if (status === 'cancelled') return { ok: false, reason: 'CANCELLED' }
  if (status === 'suspended') return { ok: false, reason: 'SUSPENDED' }
  return { ok: false, reason: 'NO_SUBSCRIPTION' }
}

/**
 * API 라우트 전용. 통과 시 구독 객체 반환, 실패 시 NextResponse를 throw.
 * 사용 예:
 *   const sub = await requireInvestmentSubscription(userId)
 */
export async function requireInvestmentSubscription(
  userId: string
): Promise<UserSubscription & { plan: UserSubscriptionPlan }> {
  const result = await checkInvestmentSubscription(userId)
  if (result.ok) return result.subscription

  const status =
    result.reason === 'PAST_DUE' || result.reason === 'SUSPENDED' ? 402 : 401
  const message = {
    NO_SUBSCRIPTION: '주식 자동매매 구독이 필요합니다.',
    PAST_DUE: '결제 연체 상태입니다. 결제 수단을 확인해주세요.',
    EXPIRED: '구독이 만료되었습니다.',
    CANCELLED: '구독이 취소되었습니다.',
    SUSPENDED: '결제 실패로 구독이 일시 정지되었습니다.',
  }[result.reason]

  throw NextResponse.json(
    { error: message, code: result.reason },
    { status }
  )
}
