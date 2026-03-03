/**
 * Telegram Group [id] API
 * PATCH  /api/telegram/groups/[id] - 그룹 수정 (master_admin 전용)
 * DELETE /api/telegram/groups/[id] - 그룹 비활성화 (master_admin 전용)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

async function checkMasterAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false
  const supabase = getSupabaseAdmin()
  if (!supabase) return false

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return false
  return data.role === 'master_admin'
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const body = await request.json()
    const { userId, ...dto } = body

    const isAdmin = await checkMasterAdmin(userId)
    if (!isAdmin) {
      return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('telegram_groups')
      .update(dto)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[PATCH /api/telegram/groups/[id]] DB error:', error)
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, error: null })
  } catch (error) {
    console.error('[PATCH /api/telegram/groups/[id]] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const body = await request.json()
    const { userId } = body

    const isAdmin = await checkMasterAdmin(userId)
    if (!isAdmin) {
      return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 })
    }

    const { error } = await supabase
      .from('telegram_groups')
      .update({ is_active: false })
      .eq('id', id)

    if (error) {
      console.error('[DELETE /api/telegram/groups/[id]] DB error:', error)
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: null, error: null })
  } catch (error) {
    console.error('[DELETE /api/telegram/groups/[id]] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
