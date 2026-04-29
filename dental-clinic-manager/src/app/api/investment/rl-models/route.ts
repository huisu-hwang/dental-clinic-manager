import { NextRequest, NextResponse } from 'next/server'
import { rlModelService } from '@/lib/rlModelService'
import { requireAuth } from '@/lib/auth/requireAuth'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? 'unauthorized' }, { status: auth.status })
  }
  if (!auth.user.clinic_id) {
    return NextResponse.json({ error: 'clinic_id not found' }, { status: 400 })
  }
  const r = await rlModelService.listForClinic(auth.user.clinic_id)
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ data: r.data })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? 'unauthorized' }, { status: auth.status })
  }
  if (!auth.user.clinic_id) {
    return NextResponse.json({ error: 'clinic_id not found' }, { status: 400 })
  }
  const body = await req.json()
  const created = await rlModelService.create(body, auth.user.id, auth.user.clinic_id)
  if (created.error || !created.data) {
    return NextResponse.json({ error: created.error ?? 'create failed' }, { status: 400 })
  }
  // Fire-and-forget download trigger; do not block response.
  rlModelService.triggerDownload(created.data.id).catch(() => {})
  return NextResponse.json({ data: created.data }, { status: 201 })
}
