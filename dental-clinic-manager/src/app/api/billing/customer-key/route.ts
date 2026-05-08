import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateCustomerKey } from '@/lib/billingService'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: u } = await supabase
    .from('users').select('clinic_id, role')
    .eq('id', user.id).single()

  if (!u?.clinic_id) return NextResponse.json({ error: '클리닉 정보 없음' }, { status: 400 })
  if (!['owner', 'master_admin'].includes(u.role)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const customerKey = await getOrCreateCustomerKey(u.clinic_id)
  return NextResponse.json({ customerKey })
}
