/**
 * Telegram Board Comment API (단일 댓글)
 * PATCH  /api/telegram/board-posts/[postId]/comments/[commentId] - 댓글 수정
 * DELETE /api/telegram/board-posts/[postId]/comments/[commentId] - 댓글 삭제
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
  context: { params: Promise<{ postId: string; commentId: string }> }
) {
  try {
    const { commentId } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const body = await request.json()
    const { userId, content } = body

    if (!userId || !content) {
      return NextResponse.json({ data: null, error: '필수 항목이 누락되었습니다.' }, { status: 400 })
    }

    // 댓글 조회
    const { data: comment, error: commentError } = await supabase
      .from('telegram_board_comments')
      .select('*')
      .eq('id', commentId)
      .maybeSingle()

    if (commentError || !comment) {
      return NextResponse.json({ data: null, error: '댓글을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 권한 확인: 작성자 본인 또는 master_admin
    const role = await getUserRole(supabase, userId)
    if (comment.user_id !== userId && role !== 'master_admin') {
      return NextResponse.json({ data: null, error: '수정 권한이 없습니다.' }, { status: 403 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('telegram_board_comments')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', commentId)
      .select('*, user:users(name, email)')
      .single()

    if (updateError) {
      return NextResponse.json({ data: null, error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ data: updated, error: null })
  } catch (error) {
    console.error('[PATCH /api/telegram/board-posts/[postId]/comments/[commentId]] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ postId: string; commentId: string }> }
) {
  try {
    const { commentId } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ data: null, error: '인증이 필요합니다.' }, { status: 401 })
    }

    // 댓글 조회
    const { data: comment, error: commentError } = await supabase
      .from('telegram_board_comments')
      .select('*')
      .eq('id', commentId)
      .maybeSingle()

    if (commentError || !comment) {
      return NextResponse.json({ data: null, error: '댓글을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 권한 확인: 작성자 본인 또는 master_admin
    const role = await getUserRole(supabase, userId)
    if (comment.user_id !== userId && role !== 'master_admin') {
      return NextResponse.json({ data: null, error: '삭제 권한이 없습니다.' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('telegram_board_comments')
      .delete()
      .eq('id', commentId)

    if (deleteError) {
      return NextResponse.json({ data: null, error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ data: null, error: null })
  } catch (error) {
    console.error('[DELETE /api/telegram/board-posts/[postId]/comments/[commentId]] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
