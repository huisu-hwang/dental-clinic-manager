/**
 * Telegram Groups API
 * GET  /api/telegram/groups - 텔레그램 그룹 목록 조회
 *   - master_admin: 모든 그룹 (status 필터 지원)
 *   - 일반 사용자: approved 그룹만
 * POST /api/telegram/groups - 그룹 생성/신청
 *   - master_admin: status='approved', is_active=true로 직접 생성
 *   - 일반 사용자: status='pending', is_active=false로 신청
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// 사용자 정보 조회 헬퍼
async function getUserInfo(userId: string | null): Promise<{ role: string; clinic_id: string; name: string } | null> {
  if (!userId) return null
  const supabase = getSupabaseAdmin()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('users')
    .select('role, clinic_id, name')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return null
  return data as { role: string; clinic_id: string; name: string }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 })
    }
    const userId = user.id
    const statusFilter = new URL(request.url).searchParams.get('status')

    const userInfo = await getUserInfo(userId)
    if (!userInfo) {
      return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 })
    }

    const isMasterAdmin = userInfo.role === 'master_admin'

    let query = supabase
      .from('telegram_groups')
      .select('*')
      .order('created_at', { ascending: false })

    if (isMasterAdmin) {
      // master_admin: status 필터 지원
      if (statusFilter) {
        query = query.eq('status', statusFilter)
      }
    } else {
      // 일반 사용자: approved만 조회 가능
      query = query.eq('status', 'approved')
    }

    const { data, error } = await query

    if (error) {
      console.error('[GET /api/telegram/groups] DB error:', error)
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, error: null })
  } catch (error) {
    console.error('[GET /api/telegram/groups] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const body = await request.json()
    const { ...dto } = body

    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 })
    }
    const userId = user.id

    const userInfo = await getUserInfo(userId)
    if (!userInfo) {
      return NextResponse.json({ data: null, error: '사용자 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    const isMasterAdmin = userInfo.role === 'master_admin'

    const { telegram_chat_id, chat_title, board_slug, board_title } = dto
    if (!telegram_chat_id || !chat_title || !board_slug || !board_title) {
      return NextResponse.json(
        { data: null, error: 'telegram_chat_id, chat_title, board_slug, board_title은 필수입니다.' },
        { status: 400 }
      )
    }

    // 중복 체크: 같은 chat_id 또는 board_slug가 이미 있는지
    const { data: existing } = await supabase
      .from('telegram_groups')
      .select('id, status, telegram_chat_id, board_slug')
      .or(`telegram_chat_id.eq.${telegram_chat_id},board_slug.eq.${board_slug}`)

    if (existing && existing.length > 0) {
      const dupChatId = existing.find((g: any) => g.telegram_chat_id === Number(telegram_chat_id))
      const dupSlug = existing.find((g: any) => g.board_slug === board_slug && !g.board_slug.startsWith('pending_'))

      // 웹훅으로 자동 생성된 pending 레코드 → claim (UPDATE)
      if (dupChatId && dupChatId.board_slug.startsWith('pending_')) {
        const { application_reason, board_description, ...groupFields } = dto

        const updateData: Record<string, unknown> = {
          board_slug,
          board_title,
          board_description: board_description || null,
          application_reason: application_reason || null,
          visibility: dto.visibility || 'private',
          created_by: userId,
        }

        if (isMasterAdmin) {
          updateData.status = 'approved'
          updateData.is_active = true
          updateData.reviewed_by = userId
          updateData.reviewed_at = new Date().toISOString()
        }

        const { data: claimedGroup, error: claimError } = await supabase
          .from('telegram_groups')
          .update(updateData)
          .eq('id', dupChatId.id)
          .select()
          .single()

        if (claimError) {
          console.error('[POST /api/telegram/groups] Claim error:', claimError)
          return NextResponse.json({ data: null, error: claimError.message }, { status: 500 })
        }

        // 일반 사용자의 경우 master_admin에게 알림
        if (!isMasterAdmin) {
          try {
            const { data: admins } = await supabase
              .from('users')
              .select('id')
              .eq('role', 'master_admin')

            if (admins && admins.length > 0) {
              const clinicId = userInfo.clinic_id
              const notifications = admins.map((admin: any) => ({
                clinic_id: clinicId,
                user_id: admin.id,
                type: 'telegram_board_pending',
                title: '텔레그램 게시판 신청이 접수되었습니다',
                content: `${userInfo.name}님이 "${board_title}" 게시판을 신청했습니다.`,
                link: '/dashboard/community/admin?tab=telegram',
                reference_type: 'telegram_group',
                reference_id: claimedGroup.id,
                created_by: userId,
              }))

              await supabase.from('user_notifications').insert(notifications)
            }
          } catch (notifError) {
            console.error('[POST /api/telegram/groups] Notification error:', notifError)
          }
        }

        return NextResponse.json({ data: claimedGroup, error: null }, { status: 201 })
      }

      // 이미 사용자가 claim했거나 승인된 그룹
      if (dupChatId) {
        const statusLabel = dupChatId.status === 'pending' ? '(승인 대기 중)' : ''
        return NextResponse.json(
          { data: null, error: `이미 등록된 텔레그램 그룹입니다. ${statusLabel}` },
          { status: 409 }
        )
      }
      if (dupSlug) {
        return NextResponse.json(
          { data: null, error: '이미 사용 중인 게시판 URL입니다. 다른 슬러그를 사용해주세요.' },
          { status: 409 }
        )
      }
    }

    if (isMasterAdmin) {
      // master_admin: 바로 승인 상태로 생성
      const { data, error } = await supabase
        .from('telegram_groups')
        .insert({
          ...dto,
          visibility: dto.visibility || 'private',
          status: 'approved',
          is_active: true,
          created_by: userId,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        console.error('[POST /api/telegram/groups] DB error:', error)
        return NextResponse.json({ data: null, error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data, error: null }, { status: 201 })
    } else {
      // 일반 사용자: pending 상태로 신청
      const { application_reason, ...groupDto } = dto

      const { data, error } = await supabase
        .from('telegram_groups')
        .insert({
          ...groupDto,
          application_reason: application_reason || null,
          visibility: dto.visibility || 'private',
          status: 'pending',
          is_active: false,
          created_by: userId,
        })
        .select()
        .single()

      if (error) {
        console.error('[POST /api/telegram/groups] DB error:', error)
        return NextResponse.json({ data: null, error: error.message }, { status: 500 })
      }

      // master_admin들에게 알림 발송
      try {
        const { data: admins } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'master_admin')

        if (admins && admins.length > 0) {
          const clinicId = userInfo.clinic_id
          const notifications = admins.map((admin: any) => ({
            clinic_id: clinicId,
            user_id: admin.id,
            type: 'telegram_board_pending',
            title: '텔레그램 게시판 신청이 접수되었습니다',
            content: `${userInfo.name}님이 "${board_title}" 게시판을 신청했습니다.`,
            link: '/dashboard/community/admin?tab=telegram',
            reference_type: 'telegram_group',
            reference_id: data.id,
            created_by: userId,
          }))

          await supabase.from('user_notifications').insert(notifications)
        }
      } catch (notifError) {
        // 알림 실패는 신청 자체에 영향을 주지 않음
        console.error('[POST /api/telegram/groups] Notification error:', notifError)
      }

      return NextResponse.json({ data, error: null }, { status: 201 })
    }
  } catch (error) {
    console.error('[POST /api/telegram/groups] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
