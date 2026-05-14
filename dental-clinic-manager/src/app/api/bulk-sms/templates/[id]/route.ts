import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthedUserWithPermission } from '@/lib/bulkSmsAuth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthedUserWithPermission('bulk_sms_manage')
  if (!ctx) return NextResponse.json({ success: false, error: '권한이 없습니다' }, { status: 403 })

  const { id } = await params
  const body = await request.json() as { name?: string; content?: string; is_default?: boolean }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (body.is_default === true) {
    await service.from('bulk_sms_templates')
      .update({ is_default: false })
      .eq('clinic_id', ctx.clinicId)
      .eq('is_default', true)
  }

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name.trim()
  if (body.content !== undefined) patch.content = body.content
  if (body.is_default !== undefined) patch.is_default = body.is_default

  const { data, error } = await service
    .from('bulk_sms_templates')
    .update(patch)
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, template: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthedUserWithPermission('bulk_sms_manage')
  if (!ctx) return NextResponse.json({ success: false, error: '권한이 없습니다' }, { status: 403 })

  const { id } = await params
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await service
    .from('bulk_sms_templates')
    .delete()
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
