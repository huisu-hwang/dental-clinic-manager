import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const clinicId = url.searchParams.get('clinicId')
  if (!clinicId) return NextResponse.json({ count: 0 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ count: 0 })

  const { data: me } = await supabase
    .from('users').select('clinic_id').eq('id', user.id).single()
  if (!me?.clinic_id || me.clinic_id !== clinicId) {
    return NextResponse.json({ count: 0 })
  }

  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('status', 'pending')

  return NextResponse.json({ count: count ?? 0 })
}
