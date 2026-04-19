import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { countActiveEmployees } from '@/lib/subscriptionService'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ count: 0 })
  const { data: me } = await supabase.from('users').select('clinic_id').eq('id', user.id).single()
  if (!me?.clinic_id) return NextResponse.json({ count: 0 })
  return NextResponse.json({ count: await countActiveEmployees(me.clinic_id) })
}
