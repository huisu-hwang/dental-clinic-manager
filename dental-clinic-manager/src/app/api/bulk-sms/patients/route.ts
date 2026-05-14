import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthedUserWithPermission } from '@/lib/bulkSmsAuth'
import { getEligiblePatients } from '@/lib/bulkSmsService'
import type { BulkSmsFilter } from '@/types/bulkSms'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const ctx = await getAuthedUserWithPermission('bulk_sms_view')
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: '권한이 없습니다' },
      { status: 403 }
    )
  }

  const body = (await request.json()) as {
    filter: BulkSmsFilter
    excludeRecallExcluded?: boolean
  }
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const result = await getEligiblePatients(
      service,
      ctx.clinicId,
      body.filter ?? {},
      body.excludeRecallExcluded !== false
    )
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 }
    )
  }
}
