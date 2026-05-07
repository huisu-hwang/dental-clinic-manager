// src/app/api/investment/subscription/cancel/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { cancelUserSubscription } from '@/lib/userSubscriptionService'

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = await request.json().catch(() => ({}))
  const immediate = body.immediate === true

  const result = await cancelUserSubscription({ userId: auth.user.id, immediate })
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
