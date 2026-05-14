import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthedUserWithPermission } from '@/lib/bulkSmsAuth'

export async function GET() {
  const ctx = await getAuthedUserWithPermission('bulk_sms_view')
  if (!ctx) return NextResponse.json({ success: false, error: '권한이 없습니다' }, { status: 403 })

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data, error } = await service
    .from('bulk_sms_templates')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, templates: data ?? [] })
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthedUserWithPermission('bulk_sms_manage')
  if (!ctx) return NextResponse.json({ success: false, error: '권한이 없습니다' }, { status: 403 })

  const body = await request.json() as { name: string; content: string; is_default?: boolean }
  if (!body.name?.trim() || !body.content?.trim()) {
    return NextResponse.json({ success: false, error: '이름과 내용이 필요합니다' }, { status: 400 })
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (body.is_default) {
    await service.from('bulk_sms_templates')
      .update({ is_default: false })
      .eq('clinic_id', ctx.clinicId)
      .eq('is_default', true)
  }

  const { data, error } = await service
    .from('bulk_sms_templates')
    .insert({
      clinic_id: ctx.clinicId,
      name: body.name.trim(),
      content: body.content,
      is_default: !!body.is_default,
      created_by: ctx.userId,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, template: data })
}
