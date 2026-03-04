/**
 * 일괄 AI 카테고리 분류 API
 * POST /api/telegram/board-posts/classify-all
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { classifyPostCategory } from '@/lib/telegramCategoryService'

const BATCH_SIZE = 10

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 })
    }

    const { groupId } = await request.json()
    if (!groupId) {
      return NextResponse.json({ error: 'groupId is required' }, { status: 400 })
    }

    // 그룹 정보
    const { data: group } = await supabase
      .from('telegram_groups')
      .select('id, chat_title, board_title')
      .eq('id', groupId)
      .maybeSingle()

    if (!group) {
      return NextResponse.json({ error: '그룹을 찾을 수 없습니다.' }, { status: 404 })
    }

    const groupTitle = group.board_title || group.chat_title || ''

    // 미분류(category_id IS NULL) 게시글 조회
    const { data: posts, error: postsError } = await supabase
      .from('telegram_board_posts')
      .select('id, title, content')
      .eq('telegram_group_id', groupId)
      .is('category_id', null)
      .order('created_at', { ascending: true })

    if (postsError) {
      return NextResponse.json({ error: postsError.message }, { status: 500 })
    }

    if (!posts || posts.length === 0) {
      return NextResponse.json({ data: { classified: 0, total: 0 }, error: null })
    }

    let classified = 0
    const colorPresets = ['blue', 'green', 'purple', 'orange', 'teal', 'red', 'pink', 'indigo', 'amber']

    // 배치 처리
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      const batch = posts.slice(i, i + BATCH_SIZE)

      for (const post of batch) {
        try {
          // 매번 최신 카테고리 목록 조회 (새 카테고리가 생길 수 있으므로)
          const { data: categories } = await supabase
            .from('telegram_board_categories')
            .select('id, name')
            .eq('telegram_group_id', groupId)
            .order('sort_order', { ascending: true })

          const existingCategories = categories || []

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
              const slug = result.categoryName
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9가-힣-]/g, '')
                .slice(0, 50)

              const { data: existing } = await supabase
                .from('telegram_board_categories')
                .select('id')
                .eq('telegram_group_id', groupId)
                .eq('slug', slug)
                .maybeSingle()

              if (existing) {
                categoryId = existing.id
              } else {
                const { data: maxSort } = await supabase
                  .from('telegram_board_categories')
                  .select('sort_order')
                  .eq('telegram_group_id', groupId)
                  .eq('is_default', false)
                  .order('sort_order', { ascending: false })
                  .limit(1)
                  .maybeSingle()

                const nextOrder = (maxSort?.sort_order ?? -1) + 1
                const colorIndex = (existingCategories.filter(c => c.name !== '미분류').length) % colorPresets.length

                const { data: newCat } = await supabase
                  .from('telegram_board_categories')
                  .insert({
                    telegram_group_id: groupId,
                    name: result.categoryName,
                    slug,
                    color: colorPresets[colorIndex],
                    sort_order: nextOrder,
                  })
                  .select('id')
                  .single()

                if (newCat) {
                  categoryId = newCat.id
                }
              }
            }
          }

          // 폴백: 미분류
          if (!categoryId) {
            const { data: defaultCat } = await supabase
              .from('telegram_board_categories')
              .select('id')
              .eq('telegram_group_id', groupId)
              .eq('is_default', true)
              .maybeSingle()

            categoryId = defaultCat?.id || null
          }

          if (categoryId) {
            await supabase
              .from('telegram_board_posts')
              .update({ category_id: categoryId })
              .eq('id', post.id)

            classified++
          }
        } catch (err) {
          console.error(`[classify-all] Failed to classify post ${post.id}:`, err)
        }
      }
    }

    return NextResponse.json({
      data: { classified, total: posts.length },
      error: null,
    })
  } catch (error) {
    console.error('[POST /api/telegram/board-posts/classify-all] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk classification failed' },
      { status: 500 }
    )
  }
}
