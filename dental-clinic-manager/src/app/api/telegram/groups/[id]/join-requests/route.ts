/**
 * Telegram Group Join Requests API
 *
 *   GET  /api/telegram/groups/[id]/join-requests           — 모임장/master: 신청 목록(기본 pending), staff: mine=1로 본인 신청만
 *   POST /api/telegram/groups/[id]/join-requests           — 본인 가입 신청 생성
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type GroupRow = { id: string; board_slug: string; board_title: string; created_by: string | null }

async function isMaster(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from('users').select('role').eq('id', userId).maybeSingle()
  return data?.role === 'master_admin'
}

async function fetchGroup(groupId: string): Promise<GroupRow | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('telegram_groups')
    .select('id, board_slug, board_title, created_by')
    .eq('id', groupId)
    .maybeSingle()
  return data as GroupRow | null
}

async function getRequesterClinicId(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from('users').select('clinic_id').eq('id', userId).maybeSingle()
  return data?.clinic_id ?? null
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: groupId } = await context.params
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ data: null, error: 'DB error' }, { status: 500 })

  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: '인증 필요' }, { status: 401 })

  const group = await fetchGroup(groupId)
  if (!group) return NextResponse.json({ data: null, error: '그룹을 찾을 수 없습니다' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const mine = searchParams.get('mine') === '1'
  const statusFilter = searchParams.get('status') || 'pending'

  const master = await isMaster(user.id)
  const isCreator = group.created_by === user.id

  // 본인 신청만 조회는 누구나 가능
  if (mine) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('telegram_group_join_requests')
      .select('*')
      .eq('telegram_group_id', groupId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    return NextResponse.json({ data: data?.[0] ?? null, error: null })
  }

  // 전체 조회는 모임장/master만
  if (!master && !isCreator) {
    return NextResponse.json({ data: null, error: '권한이 없습니다' }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from('telegram_group_join_requests')
    .select('*, applicant:users!telegram_group_join_requests_user_id_fkey(id, name, email)')
    .eq('telegram_group_id', groupId)
    .order('created_at', { ascending: false })
  if (statusFilter !== 'all') q = q.eq('status', statusFilter)
  const { data, error } = await q
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: groupId } = await context.params
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ data: null, error: 'DB error' }, { status: 500 })

  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ data: null, error: '인증 필요' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const message: string | null = (body?.message ?? '').toString().trim().slice(0, 500) || null

  const group = await fetchGroup(groupId)
  if (!group) return NextResponse.json({ data: null, error: '그룹을 찾을 수 없습니다' }, { status: 404 })

  // 이미 멤버면 거부
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingMember } = await (supabase as any)
    .from('telegram_group_members')
    .select('id')
    .eq('telegram_group_id', groupId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (existingMember) {
    return NextResponse.json({ data: null, error: '이미 모임 멤버입니다' }, { status: 400 })
  }

  // pending 신청이 이미 있으면 거부
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingReq } = await (supabase as any)
    .from('telegram_group_join_requests')
    .select('id, status')
    .eq('telegram_group_id', groupId)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()
  if (existingReq) {
    return NextResponse.json({ data: existingReq, error: '이미 신청이 접수되어 대기 중입니다' }, { status: 409 })
  }

  // 신규 신청 INSERT
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('telegram_group_join_requests')
    .insert({ telegram_group_id: groupId, user_id: user.id, message })
    .select()
    .single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })

  // 모임장 + master_admin 에게 알림
  if (group.created_by) {
    const requesterClinicId = await getRequesterClinicId(user.id)
    // 알림은 모임장 clinic 기준이 더 자연스러우나, 그룹은 글로벌이므로 신청자 clinic 사용
    if (requesterClinicId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requesterUser = await (supabase as any).from('users').select('name, email').eq('id', user.id).maybeSingle()
      const requesterName = requesterUser.data?.name || requesterUser.data?.email || '사용자'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ownerClinic = await (supabase as any).from('users').select('clinic_id').eq('id', group.created_by).maybeSingle()
      const ownerClinicId = ownerClinic.data?.clinic_id ?? requesterClinicId
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('user_notifications').insert({
        clinic_id: ownerClinicId,
        user_id: group.created_by,
        type: 'group_join_requested',
        title: '소모임 가입 신청',
        content: `${requesterName}님이 "${group.board_title}" 모임 가입을 신청했습니다`,
        link: `/dashboard/community/telegram/${group.board_slug}?manage=requests`,
        reference_type: 'group_join_request',
        reference_id: data.id,
        created_by: user.id,
      })
    }
  }

  return NextResponse.json({ data, error: null }, { status: 201 })
}
