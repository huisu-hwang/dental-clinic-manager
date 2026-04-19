import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { executeDowngrade, planForClinic } from '@/lib/subscriptionReconciler'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const reason: string = typeof body.reason === 'string' ? body.reason : '플랜 다운그레이드'
  const forceName: string | undefined = typeof body.newPlanName === 'string' ? body.newPlanName : undefined

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('id, clinic_id, role').eq('id', user.id).single()
  if (!me?.clinic_id || !['owner', 'master_admin'].includes(me.role)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const snapshot = await planForClinic(me.clinic_id)
  const target = forceName ?? snapshot.targetName
  const result = await executeDowngrade({
    clinicId: me.clinic_id,
    newPlanName: target,
    reason,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result)
}
