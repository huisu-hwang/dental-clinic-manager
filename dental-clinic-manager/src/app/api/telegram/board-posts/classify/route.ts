/**
 * AI 카테고리 자동 분류 API
 * POST /api/telegram/board-posts/classify
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { classifyPostCategory } from '@/lib/telegramCategoryService'

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 })
    }

    const { postId } = await request.json()
    if (!postId) {
      return NextResponse.json({ error: 'postId is required' }, { status: 400 })
    }

    // 게시글 조회
    const { data: post, error: postError } = await supabase
      .from('telegram_board_posts')
      .select('id, title, content, telegram_group_id')
      .eq('id', postId)
      .maybeSingle()

    if (postError || !post) {
      return NextResponse.json({ error: '게시글을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 그룹 정보
    const { data: group } = await supabase
      .from('telegram_groups')
      .select('id, chat_title, board_title')
      .eq('id', post.telegram_group_id)
      .maybeSingle()

    const groupTitle = group?.board_title || group?.chat_title || ''

    // 기존 카테고리 목록
    const { data: categories } = await supabase
      .from('telegram_board_categories')
      .select('id, name')
      .eq('telegram_group_id', post.telegram_group_id)
      .order('sort_order', { ascending: true })

    const existingCategories = categories || []

    // AI 분류
    const result = await classifyPostCategory(
      post.title,
      post.content,
      existingCategories,
      groupTitle
    )

    let categoryId: string | null = null

    if (result) {
      if (result.action === 'existing' && result.categoryId) {
        categoryId = result.categoryId
      } else if (result.action === 'new') {
        // 새 카테고리 생성
        const slug = result.categoryName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9가-힣-]/g, '')
          .slice(0, 50)

        // slug 중복 체크
        const { data: existing } = await supabase
          .from('telegram_board_categories')
          .select('id')
          .eq('telegram_group_id', post.telegram_group_id)
          .eq('slug', slug)
          .maybeSingle()

        if (existing) {
          categoryId = existing.id
        } else {
          // 현재 최대 sort_order 조회
          const { data: maxSort } = await supabase
            .from('telegram_board_categories')
            .select('sort_order')
            .eq('telegram_group_id', post.telegram_group_id)
            .eq('is_default', false)
            .order('sort_order', { ascending: false })
            .limit(1)
            .maybeSingle()

          const nextOrder = (maxSort?.sort_order ?? -1) + 1

          // 색상 자동 배정 (순환)
          const colorPresets = ['blue', 'green', 'purple', 'orange', 'teal', 'red', 'pink', 'indigo', 'amber']
          const colorIndex = (existingCategories.filter(c => c.name !== '미분류').length) % colorPresets.length

          const { data: newCat, error: catError } = await supabase
            .from('telegram_board_categories')
            .insert({
              telegram_group_id: post.telegram_group_id,
              name: result.categoryName,
              slug,
              color: colorPresets[colorIndex],
              sort_order: nextOrder,
            })
            .select('id')
            .single()

          if (!catError && newCat) {
            categoryId = newCat.id
          }
        }
      }
    }

    // 폴백: 미분류 카테고리
    if (!categoryId) {
      const { data: defaultCat } = await supabase
        .from('telegram_board_categories')
        .select('id')
        .eq('telegram_group_id', post.telegram_group_id)
        .eq('is_default', true)
        .maybeSingle()

      categoryId = defaultCat?.id || null
    }

    // 게시글 업데이트
    if (categoryId) {
      await supabase
        .from('telegram_board_posts')
        .update({ category_id: categoryId })
        .eq('id', postId)
    }

    return NextResponse.json({
      data: { postId, categoryId, categoryName: result?.categoryName || '미분류' },
      error: null,
    })
  } catch (error) {
    console.error('[POST /api/telegram/board-posts/classify] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Classification failed' },
      { status: 500 }
    )
  }
}
