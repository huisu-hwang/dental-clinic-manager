/**
 * Telegram Group Review API
 * POST /api/telegram/groups/[id]/review - 게시판 신청 승인/반려 (master_admin 전용)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

// master_admin 권한 확인 헬퍼
async function checkMasterAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false
  const supabase = getSupabaseAdmin()
  if (!supabase) return false

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return false
  return (data as any).role === 'master_admin'
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const { id: groupId } = await params
    const body = await request.json()
    const { userId, action, rejectionReason } = body

    // 권한 확인
    const isAdmin = await checkMasterAdmin(userId)
    if (!isAdmin) {
      return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 })
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { data: null, error: 'action은 approve 또는 reject이어야 합니다.' },
        { status: 400 }
      )
    }

    // 그룹 조회
    const { data: group, error: fetchError } = await supabase
      .from('telegram_groups')
      .select('*')
      .eq('id', groupId)
      .maybeSingle()

    if (fetchError || !group) {
      return NextResponse.json({ data: null, error: '그룹을 찾을 수 없습니다.' }, { status: 404 })
    }

    const typedGroup = group as any

    if (typedGroup.status !== 'pending') {
      return NextResponse.json(
        { data: null, error: '이미 처리된 신청입니다.' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()

    if (action === 'approve') {
      // 승인: status → approved, is_active → true
      const { data: updated, error: updateError } = await supabase
        .from('telegram_groups')
        .update({
          status: 'approved',
          is_active: true,
          reviewed_by: userId,
          reviewed_at: now,
        })
        .eq('id', groupId)
        .select()
        .single()

      if (updateError) {
        console.error('[POST /api/telegram/groups/review] Update error:', updateError)
        return NextResponse.json({ data: null, error: updateError.message }, { status: 500 })
      }

      // 신청자를 그룹 admin 멤버로 추가
      try {
        await supabase
          .from('telegram_group_members')
          .upsert({
            telegram_group_id: groupId,
            user_id: typedGroup.created_by,
            role: 'admin',
            joined_via: 'admin',
          }, {
            onConflict: 'telegram_group_id,user_id',
          })
      } catch (memberError) {
        console.error('[POST /api/telegram/groups/review] Member add error:', memberError)
      }

      // 신청자에게 승인 알림 발송
      try {
        // 신청자의 clinic_id 조회
        const { data: applicant } = await supabase
          .from('users')
          .select('clinic_id')
          .eq('id', typedGroup.created_by)
          .maybeSingle()

        if (applicant) {
          await supabase.from('user_notifications').insert({
            clinic_id: (applicant as any).clinic_id,
            user_id: typedGroup.created_by,
            type: 'telegram_board_approved',
            title: '텔레그램 게시판이 승인되었습니다',
            content: `"${typedGroup.board_title}" 게시판이 승인되어 활성화되었습니다.`,
            link: `/community/telegram/${typedGroup.board_slug}`,
            reference_type: 'telegram_group',
            reference_id: groupId,
            created_by: userId,
          })
        }
      } catch (notifError) {
        console.error('[POST /api/telegram/groups/review] Notification error:', notifError)
      }

      return NextResponse.json({ data: updated, error: null })
    } else {
      // 반려: status → rejected
      if (!rejectionReason) {
        return NextResponse.json(
          { data: null, error: '반려 사유를 입력해주세요.' },
          { status: 400 }
        )
      }

      const { data: updated, error: updateError } = await supabase
        .from('telegram_groups')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason,
          reviewed_by: userId,
          reviewed_at: now,
        })
        .eq('id', groupId)
        .select()
        .single()

      if (updateError) {
        console.error('[POST /api/telegram/groups/review] Update error:', updateError)
        return NextResponse.json({ data: null, error: updateError.message }, { status: 500 })
      }

      // 신청자에게 반려 알림 발송
      try {
        const { data: applicant } = await supabase
          .from('users')
          .select('clinic_id')
          .eq('id', typedGroup.created_by)
          .maybeSingle()

        if (applicant) {
          await supabase.from('user_notifications').insert({
            clinic_id: (applicant as any).clinic_id,
            user_id: typedGroup.created_by,
            type: 'telegram_board_rejected',
            title: '텔레그램 게시판 신청이 반려되었습니다',
            content: `"${typedGroup.board_title}" 게시판 / 사유: ${rejectionReason}`,
            link: '/community/telegram',
            reference_type: 'telegram_group',
            reference_id: groupId,
            created_by: userId,
          })
        }
      } catch (notifError) {
        console.error('[POST /api/telegram/groups/review] Notification error:', notifError)
      }

      return NextResponse.json({ data: updated, error: null })
    }
  } catch (error) {
    console.error('[POST /api/telegram/groups/review] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
