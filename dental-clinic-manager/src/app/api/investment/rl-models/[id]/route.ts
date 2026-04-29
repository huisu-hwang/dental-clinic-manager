import { NextRequest, NextResponse } from 'next/server'
import { rlModelService } from '@/lib/rlModelService'
import { requireAuth } from '@/lib/auth/requireAuth'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? 'unauthorized' }, { status: auth.status })
  }
  const r = await rlModelService.archive(id, auth.user.id)
  if (!r.success) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
