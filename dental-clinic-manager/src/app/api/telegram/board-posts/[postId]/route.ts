/**
 * Telegram Board Post API (단일 게시글)
 * PATCH /api/telegram/board-posts/[postId] - 글 수정
 * DELETE /api/telegram/board-posts/[postId] - 글 삭제
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const body = await request.json()
    const { userId, title, content, fileUrls } = body

    if (!userId) {
      return NextResponse.json({ data: null, error: '인증이 필요합니다.' }, { status: 401 })
    }

    // 게시글 조회
    const { data: post, error: postError } = await supabase
      .from('telegram_board_posts')
      .select('*')
      .eq('id', postId)
      .maybeSingle()

    if (postError || !post) {
      return NextResponse.json({ data: null, error: '게시글을 찾을 수 없습니다.' }, { status: 404 })
    }

    // general 타입만 수정 가능
    if (post.post_type !== 'general') {
      return NextResponse.json({ data: null, error: '자동 생성된 게시글은 수정할 수 없습니다.' }, { status: 403 })
    }

    // 권한 확인: 작성자 본인 또는 master_admin
    const role = await getUserRole(supabase, userId)
    if (post.created_by !== userId && role !== 'master_admin') {
      return NextResponse.json({ data: null, error: '수정 권한이 없습니다.' }, { status: 403 })
    }

    // 업데이트
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    if (title !== undefined) updateData.title = title
    if (content !== undefined) updateData.content = content
    if (fileUrls !== undefined) updateData.file_urls = fileUrls

    const { data: updated, error: updateError } = await supabase
      .from('telegram_board_posts')
      .update(updateData)
      .eq('id', postId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ data: null, error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ data: updated, error: null })
  } catch (error) {
    console.error('[PATCH /api/telegram/board-posts/[postId]] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ data: null, error: '인증이 필요합니다.' }, { status: 401 })
    }

    // 게시글 조회
    const { data: post, error: postError } = await supabase
      .from('telegram_board_posts')
      .select('*')
      .eq('id', postId)
      .maybeSingle()

    if (postError || !post) {
      return NextResponse.json({ data: null, error: '게시글을 찾을 수 없습니다.' }, { status: 404 })
    }

    // general, vote 타입만 삭제 가능 (summary, file, link 등 자동 생성 글은 삭제 불가)
    if (post.post_type !== 'general' && post.post_type !== 'vote') {
      return NextResponse.json({ data: null, error: '자동 생성된 게시글은 삭제할 수 없습니다.' }, { status: 403 })
    }

    // 권한 확인: 작성자 본인, master_admin, 또는 게시판 생성자
    const role = await getUserRole(supabase, userId)
    let isGroupCreator = false
    if (post.telegram_group_id) {
      const { data: group } = await supabase
        .from('telegram_groups')
        .select('created_by')
        .eq('id', post.telegram_group_id)
        .maybeSingle()
      isGroupCreator = group?.created_by === userId
    }

    if (post.created_by !== userId && role !== 'master_admin' && !isGroupCreator) {
      return NextResponse.json({ data: null, error: '삭제 권한이 없습니다.' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('telegram_board_posts')
      .delete()
      .eq('id', postId)

    if (deleteError) {
      return NextResponse.json({ data: null, error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ data: null, error: null })
  } catch (error) {
    console.error('[DELETE /api/telegram/board-posts/[postId]] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
