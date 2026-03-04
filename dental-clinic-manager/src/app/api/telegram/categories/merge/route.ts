/**
 * 카테고리 병합 API
 * POST /api/telegram/categories/merge
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 })
    }

    const { sourceCategoryId, targetCategoryId } = await request.json()

    if (!sourceCategoryId || !targetCategoryId) {
      return NextResponse.json({ error: 'sourceCategoryId와 targetCategoryId는 필수입니다.' }, { status: 400 })
    }

    if (sourceCategoryId === targetCategoryId) {
      return NextResponse.json({ error: '같은 카테고리끼리 병합할 수 없습니다.' }, { status: 400 })
    }

    // source 카테고리 확인
    const { data: source } = await supabase
      .from('telegram_board_categories')
      .select('id, is_default')
      .eq('id', sourceCategoryId)
      .maybeSingle()

    if (!source) {
      return NextResponse.json({ error: '원본 카테고리를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (source.is_default) {
      return NextResponse.json({ error: '기본 카테고리는 병합 원본이 될 수 없습니다.' }, { status: 400 })
    }

    // target 카테고리 확인
    const { data: target } = await supabase
      .from('telegram_board_categories')
      .select('id')
      .eq('id', targetCategoryId)
      .maybeSingle()

    if (!target) {
      return NextResponse.json({ error: '대상 카테고리를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 글 이동
    await supabase
      .from('telegram_board_posts')
      .update({ category_id: targetCategoryId })
      .eq('category_id', sourceCategoryId)

    // source 삭제
    await supabase
      .from('telegram_board_categories')
      .delete()
      .eq('id', sourceCategoryId)

    return NextResponse.json({ error: null })
  } catch (error) {
    console.error('[POST /api/telegram/categories/merge] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
