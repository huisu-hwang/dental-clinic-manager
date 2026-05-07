import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import {
  getUserSubscription,
  getUserPayments,
  getInvestmentPlan,
} from '@/lib/userSubscriptionService'
import { calculateMonthlyProfitForUser } from '@/lib/investmentProfit'
import type { UserSubscriptionStatusResponse } from '@/types/userSubscription'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const [sub, plan, payments] = await Promise.all([
    getUserSubscription(auth.user.id),
    getInvestmentPlan(),
    getUserPayments(auth.user.id, 12),
  ])

  let nextChargeEstimate: UserSubscriptionStatusResponse['nextChargeEstimate'] = null
  if (sub && plan && sub.status === 'active') {
    const now = new Date()
    const kst = new Date(now.getTime() + 9 * 3600_000)
    const { realized } = await calculateMonthlyProfitForUser(
      auth.user.id, kst.getUTCFullYear(), kst.getUTCMonth() + 1
    )
    const revenueShare = Math.max(0, Math.floor(realized * (plan.revenue_share_pct / 100)))
    nextChargeEstimate = {
      base: plan.monthly_base_price,
      revenueShareEstimate: revenueShare,
      total: plan.monthly_base_price + revenueShare,
      realizedProfitMonthToDate: realized,
    }
  }

  let daysUntilExpiry: number | null = null
  if (sub?.current_period_end) {
    const end = new Date(sub.current_period_end)
    daysUntilExpiry = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  }

  const response: UserSubscriptionStatusResponse = {
    subscription: sub,
    plan,
    payments,
    daysUntilExpiry,
    nextChargeEstimate,
  }
  return NextResponse.json(response)
}
