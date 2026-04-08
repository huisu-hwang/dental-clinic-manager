/**
 * Telegram Board Post Bulk Move API
 * POST /api/telegram/board-posts/bulk-move - 카테고리 일괄 이동
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/apiAuth'

const VALID_POST_TYPES = ['summary', 'file', 'link', 'general', 'vote']

async function getUserRole(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return null
  return data.role
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const authUser = await getAuthenticatedUser()
    if (!authUser) {
      return NextResponse.json({ data: null, error: '인증이 필요합니다.' }, { status: 401 })
    }
    const userId = authUser.id

    const body = await request.json()
    const { postIds, targetPostType } = body

    if (!Array.isArray(postIds) || postIds.length === 0) {
      return NextResponse.json({ data: null, error: '이동할 게시글을 선택해주세요.' }, { status: 400 })
    }

    if (!targetPostType || !VALID_POST_TYPES.includes(targetPostType)) {
      return NextResponse.json({ data: null, error: '유효하지 않은 카테고리입니다.' }, { status: 400 })
    }

    // 사용자 역할 조회
    const role = await getUserRole(supabase, userId)

    // 이동할 게시글들 조회
    const { data: posts, error: postsError } = await supabase
      .from('telegram_board_posts')
      .select('id, post_type, telegram_group_id')
      .in('id', postIds)

    if (postsError || !posts) {
      return NextResponse.json({ data: null, error: '게시글 조회에 실패했습니다.' }, { status: 500 })
    }

    // 게시판 생성자 확인을 위해 관련 그룹 조회
    const groupIds = [...new Set(posts.map(p => p.telegram_group_id).filter(Boolean))]
    const groupCreatorMap: Record<string, string> = {}

    if (groupIds.length > 0) {
      const { data: groups } = await supabase
        .from('telegram_groups')
        .select('id, created_by')
        .in('id', groupIds)

      if (groups) {
        for (const g of groups) {
          groupCreatorMap[g.id] = g.created_by
        }
      }
    }

    // 이동 가능한 게시글 필터링 (master_admin 또는 게시판 생성자만)
    const movableIds: string[] = []
    let failed = 0

    for (const post of posts) {
      const isMasterAdmin = role === 'master_admin'
      const isGroupCreator = post.telegram_group_id && groupCreatorMap[post.telegram_group_id] === userId

      if (isMasterAdmin || isGroupCreator) {
        movableIds.push(post.id)
      } else {
        failed++
      }
    }

    // 이동 실행
    let moved = 0
    if (movableIds.length > 0) {
      const { error: updateError } = await supabase
        .from('telegram_board_posts')
        .update({ post_type: targetPostType })
        .in('id', movableIds)

      if (updateError) {
        return NextResponse.json({ data: null, error: updateError.message }, { status: 500 })
      }
      moved = movableIds.length
    }

    return NextResponse.json({ data: { moved, failed }, error: null })
  } catch (error) {
    console.error('[POST /api/telegram/board-posts/bulk-move] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
