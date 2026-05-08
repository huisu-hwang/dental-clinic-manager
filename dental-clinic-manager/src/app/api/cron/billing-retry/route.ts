import { NextResponse } from 'next/server'
import { runRetries } from '@/lib/billingService'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const result = await runRetries()
  console.log('[cron/billing-retry]', result)
  return NextResponse.json(result)
}
