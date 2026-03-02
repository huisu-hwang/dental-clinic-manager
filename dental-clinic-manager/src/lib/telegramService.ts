/**
 * 텔레그램 그룹채팅 연동 서비스
 * Telegram Integration Service
 */

import { ensureConnection } from './supabase/connectionCheck'
import type {
  TelegramGroup,
  TelegramGroupMember,
  TelegramInviteLink,
  TelegramBoardPost,
  CreateTelegramGroupDto,
  UpdateTelegramGroupDto,
  CreateInviteLinkDto,
  ApplyTelegramGroupDto,
  ReviewTelegramGroupDto,
} from '@/types/telegram'

// Helper: 에러 메시지 추출
const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    if ('message' in error && typeof (error as any).message === 'string') return (error as any).message
    if ('error' in error && typeof (error as any).error === 'string') return (error as any).error
  }
  return 'Unknown error occurred'
}

// Helper: 현재 사용자 ID
const getCurrentUserId = (): string | null => {
  if (typeof window === 'undefined') return null
  const userStr = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
  if (!userStr) return null
  try {
    const user = JSON.parse(userStr)
    return user.id
  } catch {
    return null
  }
}

// Helper: 랜덤 alphanumeric 문자열 생성
const generateRandomCode = (length: number): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// =====================================================
// 텔레그램 그룹 서비스
// =====================================================
export const telegramGroupService = {
  /**
   * 모든 활성 텔레그램 그룹 조회
   */
  async getGroups(): Promise<{ data: TelegramGroup[] | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('telegram_groups')
        .select('*')
        .eq('is_active', true)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramGroupService.getGroups] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 단일 그룹 조회 (id)
   */
  async getGroup(id: string): Promise<{ data: TelegramGroup | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('telegram_groups')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramGroupService.getGroup] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * board_slug로 그룹 조회
   */
  async getGroupBySlug(slug: string): Promise<{ data: TelegramGroup | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('telegram_groups')
        .select('*')
        .eq('board_slug', slug)
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramGroupService.getGroupBySlug] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 현재 사용자가 멤버인 그룹 목록 조회
   */
  async getMyGroups(): Promise<{ data: TelegramGroup[] | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const { data, error } = await (supabase as any)
        .from('telegram_group_members')
        .select('telegram_groups(*)')
        .eq('user_id', userId)

      if (error) throw error

      const groups = data
        ?.map((row: any) => row.telegram_groups)
        .filter((g: any) => g && g.is_active) ?? []

      return { data: groups, error: null }
    } catch (error) {
      console.error('[telegramGroupService.getMyGroups] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 그룹 생성
   */
  async createGroup(dto: CreateTelegramGroupDto): Promise<{ data: TelegramGroup | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const { data, error } = await (supabase as any)
        .from('telegram_groups')
        .insert({
          ...dto,
          created_by: userId,
        })
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramGroupService.createGroup] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 그룹 수정
   */
  async updateGroup(id: string, dto: UpdateTelegramGroupDto): Promise<{ data: TelegramGroup | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('telegram_groups')
        .update(dto)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramGroupService.updateGroup] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 그룹 소프트 삭제 (is_active=false)
   */
  async deleteGroup(id: string): Promise<{ data: null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { error } = await (supabase as any)
        .from('telegram_groups')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error

      return { data: null, error: null }
    } catch (error) {
      console.error('[telegramGroupService.deleteGroup] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 게시판 신청 (일반 사용자)
   */
  async applyForGroup(dto: ApplyTelegramGroupDto): Promise<{ data: TelegramGroup | null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const res = await fetch('/api/telegram/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...dto }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || '신청에 실패했습니다.')
      }

      return { data: result.data, error: null }
    } catch (error) {
      console.error('[telegramGroupService.applyForGroup] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 내 신청 목록 조회 (모든 status)
   */
  async getMyApplications(): Promise<{ data: TelegramGroup[] | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const { data, error } = await (supabase as any)
        .from('telegram_groups')
        .select('*')
        .eq('created_by', userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramGroupService.getMyApplications] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 대기 중인 신청 목록 조회 (admin용)
   */
  async getPendingApplications(): Promise<{ data: (TelegramGroup & { creator?: { name: string; email: string } })[] | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('telegram_groups')
        .select('*, creator:users!telegram_groups_created_by_fkey(name, email)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      if (error) {
        // foreign key 이름이 다를 수 있으므로 fallback 시도
        const { data: fallbackData, error: fallbackError } = await (supabase as any)
          .from('telegram_groups')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: true })

        if (fallbackError) throw fallbackError
        return { data: fallbackData, error: null }
      }

      return { data, error: null }
    } catch (error) {
      console.error('[telegramGroupService.getPendingApplications] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 신청 심사 (승인/반려)
   */
  async reviewApplication(
    groupId: string,
    action: 'approve' | 'reject',
    rejectionReason?: string
  ): Promise<{ data: TelegramGroup | null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const res = await fetch(`/api/telegram/groups/${groupId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action, rejectionReason }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || '처리에 실패했습니다.')
      }

      return { data: result.data, error: null }
    } catch (error) {
      console.error('[telegramGroupService.reviewApplication] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },
}

// =====================================================
// 텔레그램 멤버 서비스
// =====================================================
export const telegramMemberService = {
  /**
   * 그룹 멤버 목록 조회 (사용자 정보 포함)
   */
  async getMembers(groupId: string): Promise<{ data: TelegramGroupMember[] | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('telegram_group_members')
        .select(`
          *,
          user:users(name, email)
        `)
        .eq('telegram_group_id', groupId)
        .order('created_at', { ascending: false })

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramMemberService.getMembers] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 멤버 추가
   */
  async addMember(
    groupId: string,
    userId: string,
    joinedVia: 'invite_link' | 'admin' = 'admin'
  ): Promise<{ data: TelegramGroupMember | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('telegram_group_members')
        .insert({
          telegram_group_id: groupId,
          user_id: userId,
          joined_via: joinedVia,
        })
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramMemberService.addMember] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 멤버 제거
   */
  async removeMember(groupId: string, userId: string): Promise<{ data: null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { error } = await (supabase as any)
        .from('telegram_group_members')
        .delete()
        .eq('telegram_group_id', groupId)
        .eq('user_id', userId)

      if (error) throw error

      return { data: null, error: null }
    } catch (error) {
      console.error('[telegramMemberService.removeMember] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 현재 사용자가 그룹 멤버인지 확인
   */
  async checkMembership(groupId: string): Promise<{ data: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) return { data: false, error: null }

      const { data, error } = await (supabase as any)
        .from('telegram_group_members')
        .select('id')
        .eq('telegram_group_id', groupId)
        .eq('user_id', userId)
        .maybeSingle()

      if (error) throw error

      return { data: !!data, error: null }
    } catch (error) {
      console.error('[telegramMemberService.checkMembership] Error:', error)
      return { data: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 초대 코드로 그룹 참가
   */
  async joinViaInvite(inviteCode: string): Promise<{ data: TelegramGroupMember | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      // 1. 초대 링크 유효성 검사
      const { data: link, error: linkError } = await (supabase as any)
        .from('telegram_invite_links')
        .select('*, telegram_groups(*)')
        .eq('invite_code', inviteCode)
        .eq('is_active', true)
        .maybeSingle()

      if (linkError) throw linkError
      if (!link) throw new Error('유효하지 않은 초대 코드입니다.')

      // 만료 확인
      if (link.expires_at && new Date(link.expires_at) < new Date()) {
        throw new Error('만료된 초대 링크입니다.')
      }

      // 최대 사용 횟수 확인
      if (link.max_uses !== null && link.use_count >= link.max_uses) {
        throw new Error('초대 링크 사용 횟수가 초과되었습니다.')
      }

      const groupId = link.telegram_group_id

      // 2. 이미 멤버인지 확인
      const { data: existing } = await (supabase as any)
        .from('telegram_group_members')
        .select('id')
        .eq('telegram_group_id', groupId)
        .eq('user_id', userId)
        .maybeSingle()

      if (existing) throw new Error('이미 그룹 멤버입니다.')

      // 3. 멤버 추가
      const { data: member, error: memberError } = await (supabase as any)
        .from('telegram_group_members')
        .insert({
          telegram_group_id: groupId,
          user_id: userId,
          joined_via: 'invite_link',
        })
        .select()
        .single()

      if (memberError) throw memberError

      // 4. use_count 증가
      await (supabase as any)
        .from('telegram_invite_links')
        .update({ use_count: link.use_count + 1 })
        .eq('id', link.id)

      return { data: member, error: null }
    } catch (error) {
      console.error('[telegramMemberService.joinViaInvite] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },
}

// =====================================================
// 텔레그램 초대 링크 서비스
// =====================================================
export const telegramInviteLinkService = {
  /**
   * 초대 링크 생성
   */
  async createInviteLink(dto: CreateInviteLinkDto): Promise<{ data: TelegramInviteLink | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const inviteCode = generateRandomCode(12)

      const { data, error } = await (supabase as any)
        .from('telegram_invite_links')
        .insert({
          telegram_group_id: dto.telegram_group_id,
          invite_code: inviteCode,
          created_by: userId,
          expires_at: dto.expires_at ?? null,
          max_uses: dto.max_uses ?? null,
        })
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramInviteLinkService.createInviteLink] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 그룹의 초대 링크 목록 조회
   */
  async getInviteLinks(groupId: string): Promise<{ data: TelegramInviteLink[] | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('telegram_invite_links')
        .select('*')
        .eq('telegram_group_id', groupId)
        .order('created_at', { ascending: false })

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramInviteLinkService.getInviteLinks] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 초대 링크 비활성화
   */
  async deactivateLink(linkId: string): Promise<{ data: null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { error } = await (supabase as any)
        .from('telegram_invite_links')
        .update({ is_active: false })
        .eq('id', linkId)

      if (error) throw error

      return { data: null, error: null }
    } catch (error) {
      console.error('[telegramInviteLinkService.deactivateLink] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 초대 코드 유효성 검사 (그룹 정보 포함)
   */
  async validateLink(inviteCode: string): Promise<{ data: TelegramInviteLink | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('telegram_invite_links')
        .select('*, telegram_groups(*)')
        .eq('invite_code', inviteCode)
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('유효하지 않은 초대 코드입니다.')

      // 만료 확인
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        throw new Error('만료된 초대 링크입니다.')
      }

      // 최대 사용 횟수 확인
      if (data.max_uses !== null && data.use_count >= data.max_uses) {
        throw new Error('초대 링크 사용 횟수가 초과되었습니다.')
      }

      return { data, error: null }
    } catch (error) {
      console.error('[telegramInviteLinkService.validateLink] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },
}

// =====================================================
// 텔레그램 게시글 서비스
// =====================================================
export const telegramBoardPostService = {
  /**
   * 게시글 목록 조회
   */
  async getPosts(
    groupId: string,
    options?: {
      postType?: 'summary' | 'file' | 'link'
      limit?: number
      offset?: number
      search?: string
    }
  ): Promise<{ data: TelegramBoardPost[] | null; total: number; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      let query = (supabase as any)
        .from('telegram_board_posts')
        .select('*', { count: 'exact' })
        .eq('telegram_group_id', groupId)
        .order('created_at', { ascending: false })

      if (options?.postType) {
        query = query.eq('post_type', options.postType)
      }

      if (options?.search) {
        query = query.or(`title.ilike.%${options.search}%,content.ilike.%${options.search}%`)
      }

      const limit = options?.limit ?? 20
      const offset = options?.offset ?? 0

      query = query.range(offset, offset + limit - 1)

      const { data, count, error } = await query

      if (error) throw error

      return { data, total: count ?? 0, error: null }
    } catch (error) {
      console.error('[telegramBoardPostService.getPosts] Error:', error)
      return { data: null, total: 0, error: extractErrorMessage(error) }
    }
  },

  /**
   * 단일 게시글 조회 (조회수 증가)
   */
  async getPost(id: string): Promise<{ data: TelegramBoardPost | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      // 조회수 RPC 호출
      await (supabase as any).rpc('increment_telegram_post_view_count', { post_id: id })

      const { data, error } = await (supabase as any)
        .from('telegram_board_posts')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramBoardPostService.getPost] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 그룹 동기화 상태 조회
   */
  async getSyncStatus(groupId: string): Promise<{
    data: { lastSync: string | null; todayMessages: number; totalPosts: number } | null
    error: string | null
  }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      // 그룹 정보에서 last_sync_at 조회
      const { data: group, error: groupError } = await (supabase as any)
        .from('telegram_groups')
        .select('last_sync_at')
        .eq('id', groupId)
        .maybeSingle()

      if (groupError) throw groupError

      // 오늘 메시지 수
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const { count: todayMessages, error: msgError } = await (supabase as any)
        .from('telegram_messages')
        .select('id', { count: 'exact', head: true })
        .eq('telegram_group_id', groupId)
        .gte('telegram_date', today.toISOString())

      if (msgError) throw msgError

      // 전체 게시글 수
      const { count: totalPosts, error: postError } = await (supabase as any)
        .from('telegram_board_posts')
        .select('id', { count: 'exact', head: true })
        .eq('telegram_group_id', groupId)

      if (postError) throw postError

      return {
        data: {
          lastSync: group?.last_sync_at ?? null,
          todayMessages: todayMessages ?? 0,
          totalPosts: totalPosts ?? 0,
        },
        error: null,
      }
    } catch (error) {
      console.error('[telegramBoardPostService.getSyncStatus] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },
}
