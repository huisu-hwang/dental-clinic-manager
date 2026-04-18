// GET /api/subscription/plans
// 구독 플랜 목록 조회

import { NextResponse } from 'next/server'
import { getPlans } from '@/lib/subscriptionService'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') as 'headcount' | 'feature' | null

  const plans = await getPlans(type ?? undefined)
  return NextResponse.json(plans)
}
