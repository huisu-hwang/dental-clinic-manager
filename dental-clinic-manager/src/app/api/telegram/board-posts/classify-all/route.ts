/**
 * 일괄 AI 카테고리 분류 API
 * POST /api/telegram/board-posts/classify-all
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { classifyAndAssignCategory } from '@/lib/telegramCategoryService'

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

    // 기본 "미분류" 카테고리 ID 조회
    const { data: defaultCat } = await supabase
      .from('telegram_board_categories')
      .select('id')
      .eq('telegram_group_id', groupId)
      .eq('is_default', true)
      .maybeSingle()

    const defaultCategoryId = defaultCat?.id || null

    // 미분류(category_id IS NULL 또는 기본 "미분류" 카테고리) 게시글 조회
    let query = supabase
      .from('telegram_board_posts')
      .select('id, title, content')
      .eq('telegram_group_id', groupId)
      .order('created_at', { ascending: true })

    if (defaultCategoryId) {
      query = query.or(`category_id.is.null,category_id.eq.${defaultCategoryId}`)
    } else {
      query = query.is('category_id', null)
    }

    const { data: posts, error: postsError } = await query

    if (postsError) {
      return NextResponse.json({ error: postsError.message }, { status: 500 })
    }

    if (!posts || posts.length === 0) {
      return NextResponse.json({ data: { classified: 0, total: 0 }, error: null })
    }

    // 분류 전 category_id를 NULL로 리셋 (재분류를 위해)
    const postIds = posts.map(p => p.id)
    await supabase
      .from('telegram_board_posts')
      .update({ category_id: null })
      .in('id', postIds)

    let classified = 0

    // 배치 처리
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      const batch = posts.slice(i, i + BATCH_SIZE)

      for (const post of batch) {
        try {
          const result = await classifyAndAssignCategory(
            supabase,
            post.id,
            post.title,
            post.content,
            groupId
          )
          if (result.categoryName !== '미분류') {
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
