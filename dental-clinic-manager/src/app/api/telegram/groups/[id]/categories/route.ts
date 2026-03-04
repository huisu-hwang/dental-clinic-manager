/**
 * 카테고리 CRUD API (그룹 단위)
 * GET /api/telegram/groups/[id]/categories - 목록
 * POST /api/telegram/groups/[id]/categories - 생성
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const { data, error } = await supabase
      .from('telegram_board_categories')
      .select('*')
      .eq('telegram_group_id', groupId)
      .order('sort_order', { ascending: true })

    if (error) throw error

    return NextResponse.json({ data, error: null })
  } catch (error) {
    console.error('[GET /api/telegram/groups/[id]/categories] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const body = await request.json()
    const { name, color, sort_order } = body

    if (!name) {
      return NextResponse.json({ data: null, error: '카테고리 이름은 필수입니다.' }, { status: 400 })
    }

    const slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9가-힣-]/g, '')
      .slice(0, 50)

    // 중복 체크
    const { data: existing } = await supabase
      .from('telegram_board_categories')
      .select('id')
      .eq('telegram_group_id', groupId)
      .eq('slug', slug)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ data: null, error: '이미 같은 이름의 카테고리가 있습니다.' }, { status: 409 })
    }

    // 최대 sort_order 조회
    const { data: maxSort } = await supabase
      .from('telegram_board_categories')
      .select('sort_order')
      .eq('telegram_group_id', groupId)
      .eq('is_default', false)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextOrder = sort_order ?? ((maxSort?.sort_order ?? -1) + 1)

    const { data, error } = await supabase
      .from('telegram_board_categories')
      .insert({
        telegram_group_id: groupId,
        name,
        slug,
        color: color || 'gray',
        sort_order: nextOrder,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data, error: null })
  } catch (error) {
    console.error('[POST /api/telegram/groups/[id]/categories] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
