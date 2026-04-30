// src/lib/subscriptionPlans.ts
import type { SubscriptionPlan } from '@/types/subscription'

export type HeadcountPlanName = 'free' | 'starter' | 'growth' | 'pro'

/**
 * 총 재직자 수에 맞는 헤드카운트 플랜 이름을 반환한다.
 * 경계: Free 1~4, Starter 5~10, Growth 11~20, Pro 21+
 */
export function findPlanByHeadcount(total: number): HeadcountPlanName {
  if (total <= 4) return 'free'
  if (total <= 10) return 'starter'
  if (total <= 20) return 'growth'
  return 'pro'
}

/**
 * 플랜 가격을 일관된 문구로 포맷한다.
 * - 주식 자동매매(feature_id='investment'): "수익의 5%"
 * - price=0: "무료"
 * - 그 외: "월 N,NNN원"
 */
export function formatPlanPrice(plan: Pick<SubscriptionPlan, 'name' | 'price' | 'feature_id'>): string {
  if (plan.feature_id === 'investment') return '수익의 5%'
  if (plan.price === 0) return '무료'
  return `월 ${plan.price.toLocaleString()}원`
}

/**
 * 현재 재직자 수와 승인 대기 중인 인원을 합산해 신규 플랜이 필요한지 판정한다.
 */
export function requiresUpgrade(params: {
  currentActive: number
  pendingToApprove: number
  currentLimit: number
}): boolean {
  return params.currentActive + params.pendingToApprove > params.currentLimit
}
