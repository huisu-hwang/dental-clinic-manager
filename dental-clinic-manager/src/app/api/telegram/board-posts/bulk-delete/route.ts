/**
 * Telegram Board Post Bulk Delete API
 * POST /api/telegram/board-posts/bulk-delete - 일괄 삭제
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

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

    const body = await request.json()
    const { userId, postIds } = body

    if (!userId) {
      return NextResponse.json({ data: null, error: '인증이 필요합니다.' }, { status: 401 })
    }

    if (!Array.isArray(postIds) || postIds.length === 0) {
      return NextResponse.json({ data: null, error: '삭제할 게시글을 선택해주세요.' }, { status: 400 })
    }

    // 사용자 역할 조회
    const role = await getUserRole(supabase, userId)

    // 삭제할 게시글들 조회
    const { data: posts, error: postsError } = await supabase
      .from('telegram_board_posts')
      .select('id, post_type, created_by, telegram_group_id')
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

    // 삭제 가능한 게시글 필터링
    const deletableIds: string[] = []
    let failed = 0

    for (const post of posts) {
      const isAuthor = post.created_by === userId
      const isMasterAdmin = role === 'master_admin'
      const isGroupCreator = post.telegram_group_id && groupCreatorMap[post.telegram_group_id] === userId

      // master_admin은 모든 타입 삭제 가능, 그 외는 general/vote만 삭제 가능
      if (!isMasterAdmin && post.post_type !== 'general' && post.post_type !== 'vote') {
        failed++
        continue
      }

      // 권한 확인: 작성자 본인, master_admin, 또는 게시판 생성자
      if (isAuthor || isMasterAdmin || isGroupCreator) {
        deletableIds.push(post.id)
      } else {
        failed++
      }
    }

    // 삭제 실행
    let deleted = 0
    if (deletableIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('telegram_board_posts')
        .delete()
        .in('id', deletableIds)

      if (deleteError) {
        return NextResponse.json({ data: null, error: deleteError.message }, { status: 500 })
      }
      deleted = deletableIds.length
    }

    return NextResponse.json({ data: { deleted, failed }, error: null })
  } catch (error) {
    console.error('[POST /api/telegram/board-posts/bulk-delete] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
