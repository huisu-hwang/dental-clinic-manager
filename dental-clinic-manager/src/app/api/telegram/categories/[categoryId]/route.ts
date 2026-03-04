/**
 * 카테고리 단일 CRUD API
 * PATCH /api/telegram/categories/[categoryId] - 수정
 * DELETE /api/telegram/categories/[categoryId] - 삭제
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ categoryId: string }> }
) {
  try {
    const { categoryId } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const body = await request.json()
    const updates: Record<string, unknown> = {}

    if (body.name !== undefined) updates.name = body.name
    if (body.color !== undefined) updates.color = body.color
    if (body.sort_order !== undefined) updates.sort_order = body.sort_order

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ data: null, error: '수정할 항목이 없습니다.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('telegram_board_categories')
      .update(updates)
      .eq('id', categoryId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data, error: null })
  } catch (error) {
    console.error('[PATCH /api/telegram/categories/[categoryId]] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ categoryId: string }> }
) {
  try {
    const { categoryId } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 })
    }

    // 카테고리 조회
    const { data: category } = await supabase
      .from('telegram_board_categories')
      .select('id, telegram_group_id, is_default')
      .eq('id', categoryId)
      .maybeSingle()

    if (!category) {
      return NextResponse.json({ error: '카테고리를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (category.is_default) {
      return NextResponse.json({ error: '기본 카테고리는 삭제할 수 없습니다.' }, { status: 400 })
    }

    // 미분류 카테고리 찾기
    const { data: defaultCat } = await supabase
      .from('telegram_board_categories')
      .select('id')
      .eq('telegram_group_id', category.telegram_group_id)
      .eq('is_default', true)
      .maybeSingle()

    // 해당 카테고리 글을 미분류로 이동
    if (defaultCat) {
      await supabase
        .from('telegram_board_posts')
        .update({ category_id: defaultCat.id })
        .eq('category_id', categoryId)
    } else {
      await supabase
        .from('telegram_board_posts')
        .update({ category_id: null })
        .eq('category_id', categoryId)
    }

    // 삭제
    const { error } = await supabase
      .from('telegram_board_categories')
      .delete()
      .eq('id', categoryId)

    if (error) throw error

    return NextResponse.json({ error: null })
  } catch (error) {
    console.error('[DELETE /api/telegram/categories/[categoryId]] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
