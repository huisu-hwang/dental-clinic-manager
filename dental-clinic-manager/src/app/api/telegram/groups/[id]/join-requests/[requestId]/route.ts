/**
 * Telegram Group Join Request — 개별 처리
 *
 *   PATCH /api/telegram/groups/[id]/join-requests/[requestId]
 *     body: { action: 'approve' | 'reject' | 'cancel', reject_reason?: string }
 *     - approve/reject: 모임장 또는 master_admin
 *     - cancel: 본인
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; requestId: string }> },
) {
  const { id: groupId, requestId } = await context.params
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ data: null, error: 'DB error' }, { status: 500 })

  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: '인증 필요' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const action = body?.action as 'approve' | 'reject' | 'cancel'
  const rejectReason: string | null = (body?.reject_reason ?? '').toString().trim().slice(0, 500) || null
  if (!['approve', 'reject', 'cancel'].includes(action)) {
    return NextResponse.json({ data: null, error: 'action 값이 잘못됨' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: req } = await (supabase as any)
    .from('telegram_group_join_requests')
    .select('id, telegram_group_id, user_id, status')
    .eq('id', requestId)
    .maybeSingle()
  if (!req || req.telegram_group_id !== groupId) {
    return NextResponse.json({ data: null, error: '신청을 찾을 수 없습니다' }, { status: 404 })
  }
  if (req.status !== 'pending') {
    return NextResponse.json({ data: null, error: `이미 처리된 신청입니다 (${req.status})` }, { status: 409 })
  }

  // 그룹/권한 확인
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: group } = await (supabase as any)
    .from('telegram_groups')
    .select('id, board_slug, board_title, created_by')
    .eq('id', groupId)
    .maybeSingle()
  if (!group) return NextResponse.json({ data: null, error: '그룹을 찾을 수 없습니다' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRow = await (supabase as any).from('users').select('role, clinic_id').eq('id', user.id).maybeSingle()
  const role = userRow.data?.role
  const callerClinicId = userRow.data?.clinic_id ?? null
  const isMaster = role === 'master_admin'
  const isCreator = group.created_by === user.id
  const isApplicant = req.user_id === user.id

  if (action === 'cancel' && !isApplicant) {
    return NextResponse.json({ data: null, error: '본인 신청만 취소할 수 있습니다' }, { status: 403 })
  }
  if (action !== 'cancel' && !isMaster && !isCreator) {
    return NextResponse.json({ data: null, error: '권한이 없습니다' }, { status: 403 })
  }

  if (action === 'cancel') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('telegram_group_join_requests')
      .update({ status: 'cancelled', reviewed_at: new Date().toISOString(), reviewed_by: user.id })
      .eq('id', requestId)
      .select()
      .single()
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    return NextResponse.json({ data, error: null })
  }

  if (action === 'approve') {
    // 멤버 추가 (UNIQUE 충돌 시 무시)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: memberError } = await (supabase as any)
      .from('telegram_group_members')
      .upsert(
        { telegram_group_id: groupId, user_id: req.user_id, joined_via: 'admin' },
        { onConflict: 'telegram_group_id,user_id', ignoreDuplicates: true },
      )
    if (memberError) {
      return NextResponse.json({ data: null, error: memberError.message }, { status: 500 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('telegram_group_join_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: user.id })
      .eq('id', requestId)
      .select()
      .single()
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })

    // 신청자에게 알림 — 신청자 clinic_id 사용
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applicant = await (supabase as any).from('users').select('clinic_id').eq('id', req.user_id).maybeSingle()
    const applicantClinicId = applicant.data?.clinic_id ?? callerClinicId
    if (applicantClinicId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('user_notifications').insert({
        clinic_id: applicantClinicId,
        user_id: req.user_id,
        type: 'group_join_approved',
        title: '소모임 가입 승인',
        content: `"${group.board_title}" 모임 가입이 승인되었습니다`,
        link: `/dashboard/community/telegram/${group.board_slug}`,
        reference_type: 'group_join_request',
        reference_id: requestId,
        created_by: user.id,
      })
    }

    return NextResponse.json({ data, error: null })
  }

  // reject
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('telegram_group_join_requests')
    .update({
      status: 'rejected',
      reject_reason: rejectReason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('id', requestId)
    .select()
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applicant = await (supabase as any).from('users').select('clinic_id').eq('id', req.user_id).maybeSingle()
  const applicantClinicId = applicant.data?.clinic_id ?? callerClinicId
  if (applicantClinicId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('user_notifications').insert({
      clinic_id: applicantClinicId,
      user_id: req.user_id,
      type: 'group_join_rejected',
      title: '소모임 가입 거절',
      content: rejectReason
        ? `"${group.board_title}" 모임 가입이 거절되었습니다. 사유: ${rejectReason}`
        : `"${group.board_title}" 모임 가입이 거절되었습니다`,
      link: `/dashboard/community/telegram`,
      reference_type: 'group_join_request',
      reference_id: requestId,
      created_by: user.id,
    })
  }

  return NextResponse.json({ data, error: null })
}
