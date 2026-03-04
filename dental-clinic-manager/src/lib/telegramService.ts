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
  TelegramBoardComment,
  TelegramBoardVote,
  TelegramBoardCategory,
  ContributionVoteResults,
  CreateTelegramGroupDto,
  UpdateTelegramGroupDto,
  CreateInviteLinkDto,
  ApplyTelegramGroupDto,
  ReviewTelegramGroupDto,
  CreateTelegramBoardPostDto,
  UpdateTelegramBoardPostDto,
  CreateContributionVoteDto,
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
   * 봇 정보 조회 (딥 링크 생성용)
   */
  async getBotInfo(): Promise<{ data: { username: string } | null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const res = await fetch(`/api/telegram/bot-info?userId=${userId}`)
      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || '봇 정보를 가져올 수 없습니다.')
      }

      return { data: result.data, error: null }
    } catch (error) {
      console.error('[telegramGroupService.getBotInfo] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 감지된 그룹 조회 (딥 링크 플로우에서 폴링용)
   */
  async getDetectedGroups(token?: string): Promise<{ data: { id: string; telegram_chat_id: number; chat_title: string; chat_type: string; created_at: string }[] | null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const params = new URLSearchParams({ userId })
      if (token) params.set('token', token)

      const res = await fetch(`/api/telegram/groups/detected?${params.toString()}`)
      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || '감지된 그룹을 가져올 수 없습니다.')
      }

      return { data: result.data, error: null }
    } catch (error) {
      console.error('[telegramGroupService.getDetectedGroups] Error:', error)
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
    rejectionReason?: string,
    boardSlug?: string,
    boardTitle?: string
  ): Promise<{ data: TelegramGroup | null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const res = await fetch(`/api/telegram/groups/${groupId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action, rejectionReason, boardSlug, boardTitle }),
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
   * 그룹 멤버 목록 조회 (API 경유 - RLS 우회)
   */
  async getMembers(groupId: string): Promise<{ data: TelegramGroupMember[] | null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const res = await fetch(`/api/telegram/groups/${groupId}/members?userId=${userId}`)
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '멤버 목록 조회에 실패했습니다.')

      return { data: result.data, error: null }
    } catch (error) {
      console.error('[telegramMemberService.getMembers] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 멤버 추가 (API 경유 - RLS 우회)
   */
  async addMember(
    groupId: string,
    targetUserId: string,
    joinedVia: 'invite_link' | 'admin' = 'admin'
  ): Promise<{ data: TelegramGroupMember | null; error: string | null }> {
    try {
      const currentUserId = getCurrentUserId()
      if (!currentUserId) throw new Error('User not found')

      const res = await fetch(`/api/telegram/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          targetUserId,
          joinedVia,
        }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '멤버 추가에 실패했습니다.')

      return { data: result.data, error: null }
    } catch (error) {
      console.error('[telegramMemberService.addMember] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 멤버 제거 (API 경유 - RLS 우회)
   */
  async removeMember(groupId: string, targetUserId: string): Promise<{ data: null; error: string | null }> {
    try {
      const currentUserId = getCurrentUserId()
      if (!currentUserId) throw new Error('User not found')

      const res = await fetch(`/api/telegram/groups/${groupId}/members?userId=${targetUserId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '멤버 제거에 실패했습니다.')

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

  /**
   * 사용자 검색 (멤버 초대용) — 기존 멤버 제외
   */
  async searchUsersForInvite(
    query: string,
    groupId: string
  ): Promise<{ data: { id: string; name: string; email: string }[]; error: string | null }> {
    try {
      if (query.trim().length < 2) {
        return { data: [], error: null }
      }

      const userId = getCurrentUserId()
      const res = await fetch(
        `/api/users/search?q=${encodeURIComponent(query)}&groupId=${encodeURIComponent(groupId)}`,
        {
          headers: userId ? { 'x-user-id': userId } : {},
        }
      )

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || '사용자 검색에 실패했습니다.')
      }

      const { data } = await res.json()
      return { data: data || [], error: null }
    } catch (error) {
      console.error('[telegramMemberService.searchUsersForInvite] Error:', error)
      return { data: [], error: extractErrorMessage(error) }
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
      postType?: 'summary' | 'file' | 'link' | 'general' | 'vote'
      categoryId?: string
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
        .select('*, author:users!telegram_board_posts_created_by_fkey(name, email), category:telegram_board_categories(id, name, slug, color)', { count: 'exact' })
        .eq('telegram_group_id', groupId)
        .order('created_at', { ascending: false })

      if (options?.postType) {
        query = query.eq('post_type', options.postType)
      }

      if (options?.categoryId) {
        query = query.eq('category_id', options.categoryId)
      }

      if (options?.search) {
        query = query.or(`title.ilike.%${options.search}%,content.ilike.%${options.search}%`)
      }

      const limit = options?.limit ?? 20
      const offset = options?.offset ?? 0

      query = query.range(offset, offset + limit - 1)

      const { data, count, error } = await query

      if (error) throw error

      // 좋아요/스크랩 상태 확인
      const userId = getCurrentUserId()
      let posts = data || []

      if (userId && posts.length > 0) {
        const postIds = posts.map((p: any) => p.id)
        const supabaseConn = await ensureConnection()

        if (supabaseConn) {
          const [likesResult, scrapsResult] = await Promise.all([
            (supabaseConn as any)
              .from('telegram_board_likes')
              .select('post_id')
              .eq('user_id', userId)
              .in('post_id', postIds),
            (supabaseConn as any)
              .from('telegram_board_scraps')
              .select('post_id')
              .eq('user_id', userId)
              .in('post_id', postIds),
          ])

          const likedPostIds = new Set((likesResult.data || []).map((l: any) => l.post_id))
          const scrapedPostIds = new Set((scrapsResult.data || []).map((s: any) => s.post_id))

          posts = posts.map((post: any) => ({
            ...post,
            is_liked: likedPostIds.has(post.id),
            is_scraped: scrapedPostIds.has(post.id),
          }))
        }
      }

      return { data: posts, total: count ?? 0, error: null }
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

      const { data, error } = await (supabase as any)
        .from('telegram_board_posts')
        .select('*, author:users!telegram_board_posts_created_by_fkey(name, email), category:telegram_board_categories(id, name, slug, color)')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error

      // 좋아요/스크랩 상태 확인
      const userId = getCurrentUserId()

      // 조회수 증가 (작성자 본인은 1회만 - 본인이면 증가 안 함)
      const isAuthor = userId && data?.created_by === userId
      if (!isAuthor) {
        await (supabase as any).rpc('increment_telegram_post_view_count', { post_id: id })
      }
      let post = { ...data, is_liked: false, is_scraped: false }

      if (userId && data) {
        const [likeResult, scrapResult] = await Promise.all([
          (supabase as any)
            .from('telegram_board_likes')
            .select('id')
            .eq('user_id', userId)
            .eq('post_id', id)
            .maybeSingle(),
          (supabase as any)
            .from('telegram_board_scraps')
            .select('id')
            .eq('user_id', userId)
            .eq('post_id', id)
            .maybeSingle(),
        ])

        post.is_liked = !!likeResult.data
        post.is_scraped = !!scrapResult.data
      }

      return { data: post, error: null }
    } catch (error) {
      console.error('[telegramBoardPostService.getPost] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 글 작성 (API 경유)
   */
  async createPost(
    groupId: string,
    dto: CreateTelegramBoardPostDto
  ): Promise<{ data: TelegramBoardPost | null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const res = await fetch(`/api/telegram/groups/${groupId}/board-posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          title: dto.title,
          content: dto.content,
          notifyTelegram: dto.notify_telegram ?? false,
          fileUrls: dto.file_urls ?? [],
          categoryId: dto.category_id ?? null,
        }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '글 작성에 실패했습니다.')

      return { data: result.data, error: null }
    } catch (error) {
      console.error('[telegramBoardPostService.createPost] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 글 수정 (API 경유)
   */
  async updatePost(
    postId: string,
    dto: UpdateTelegramBoardPostDto
  ): Promise<{ data: TelegramBoardPost | null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const res = await fetch(`/api/telegram/board-posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          title: dto.title,
          content: dto.content,
          fileUrls: dto.file_urls,
          categoryId: dto.category_id,
        }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '글 수정에 실패했습니다.')

      return { data: result.data, error: null }
    } catch (error) {
      console.error('[telegramBoardPostService.updatePost] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 글 삭제 (API 경유)
   */
  async deletePost(postId: string): Promise<{ data: null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const res = await fetch(`/api/telegram/board-posts/${postId}?userId=${userId}`, {
        method: 'DELETE',
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '글 삭제에 실패했습니다.')

      return { data: null, error: null }
    } catch (error) {
      console.error('[telegramBoardPostService.deletePost] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 일괄 삭제 (API 경유)
   */
  async bulkDeletePosts(postIds: string[]): Promise<{ data: { deleted: number; failed: number } | null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const res = await fetch('/api/telegram/board-posts/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, postIds }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '일괄 삭제에 실패했습니다.')

      return { data: result.data, error: null }
    } catch (error) {
      console.error('[telegramBoardPostService.bulkDeletePosts] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 카테고리 일괄 이동 (API 경유)
   */
  async bulkMovePosts(postIds: string[], targetPostType: string): Promise<{ data: { moved: number; failed: number } | null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const res = await fetch('/api/telegram/board-posts/bulk-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, postIds, targetPostType }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '카테고리 이동에 실패했습니다.')

      return { data: result.data, error: null }
    } catch (error) {
      console.error('[telegramBoardPostService.bulkMovePosts] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 좋아요 토글
   */
  async toggleLike(userId: string, postId: string): Promise<{ data: { liked: boolean; like_count: number } | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .rpc('toggle_telegram_board_like', { p_user_id: userId, p_post_id: postId })

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramBoardPostService.toggleLike] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 스크랩 토글
   */
  async toggleScrap(userId: string, postId: string): Promise<{ data: { scraped: boolean; scrap_count: number } | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .rpc('toggle_telegram_board_scrap', { p_user_id: userId, p_post_id: postId })

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramBoardPostService.toggleScrap] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 내 좋아요 목록
   */
  async getMyLikes(userId: string, groupId: string, options?: {
    limit?: number
    offset?: number
  }): Promise<{ data: TelegramBoardPost[] | null; total: number; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const limit = options?.limit || 20
      const offset = options?.offset || 0

      const { data, error, count } = await (supabase as any)
        .from('telegram_board_likes')
        .select('post:telegram_board_posts(*, author:users!telegram_board_posts_created_by_fkey(name, email))', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error

      // groupId로 필터 (join 후 필터)
      const posts = (data || [])
        .map((item: any) => ({ ...item.post, is_liked: true }))
        .filter((post: any) => post && post.telegram_group_id === groupId)

      return { data: posts, total: count || 0, error: null }
    } catch (error) {
      console.error('[telegramBoardPostService.getMyLikes] Error:', error)
      return { data: null, total: 0, error: extractErrorMessage(error) }
    }
  },

  /**
   * 내 스크랩 목록
   */
  async getMyScraps(userId: string, groupId: string, options?: {
    limit?: number
    offset?: number
  }): Promise<{ data: TelegramBoardPost[] | null; total: number; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const limit = options?.limit || 20
      const offset = options?.offset || 0

      const { data, error, count } = await (supabase as any)
        .from('telegram_board_scraps')
        .select('post:telegram_board_posts(*, author:users!telegram_board_posts_created_by_fkey(name, email))', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error

      // groupId로 필터 (join 후 필터)
      const posts = (data || [])
        .map((item: any) => ({ ...item.post, is_scraped: true }))
        .filter((post: any) => post && post.telegram_group_id === groupId)

      return { data: posts, total: count || 0, error: null }
    } catch (error) {
      console.error('[telegramBoardPostService.getMyScraps] Error:', error)
      return { data: null, total: 0, error: extractErrorMessage(error) }
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

// =====================================================
// 텔레그램 게시글 댓글 서비스
// =====================================================
export const telegramBoardCommentService = {
  /**
   * 댓글 목록 조회 (API 경유)
   */
  async getComments(postId: string): Promise<{ data: TelegramBoardComment[] | null; error: string | null }> {
    try {
      const res = await fetch(`/api/telegram/board-posts/${postId}/comments`)
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '댓글 조회에 실패했습니다.')

      return { data: result.data, error: null }
    } catch (error) {
      console.error('[telegramBoardCommentService.getComments] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 댓글 작성 (API 경유)
   */
  async createComment(
    postId: string,
    content: string
  ): Promise<{ data: TelegramBoardComment | null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const res = await fetch(`/api/telegram/board-posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, content }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '댓글 작성에 실패했습니다.')

      return { data: result.data, error: null }
    } catch (error) {
      console.error('[telegramBoardCommentService.createComment] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 댓글 수정 (API 경유)
   */
  async updateComment(
    postId: string,
    commentId: string,
    content: string
  ): Promise<{ data: TelegramBoardComment | null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const res = await fetch(`/api/telegram/board-posts/${postId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, content }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '댓글 수정에 실패했습니다.')

      return { data: result.data, error: null }
    } catch (error) {
      console.error('[telegramBoardCommentService.updateComment] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 댓글 삭제 (API 경유)
   */
  async deleteComment(
    postId: string,
    commentId: string
  ): Promise<{ data: null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const res = await fetch(`/api/telegram/board-posts/${postId}/comments/${commentId}?userId=${userId}`, {
        method: 'DELETE',
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '댓글 삭제에 실패했습니다.')

      return { data: null, error: null }
    } catch (error) {
      console.error('[telegramBoardCommentService.deleteComment] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },
}

// =====================================================
// 텔레그램 기여도 투표 서비스
// =====================================================
export const telegramBoardVoteService = {
  /**
   * 투표 세션 조회 (post_id 기반)
   */
  async getVote(postId: string): Promise<{ data: TelegramBoardVote | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('telegram_board_votes')
        .select('*')
        .eq('post_id', postId)
        .maybeSingle()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramBoardVoteService.getVote] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 투표 결과 조회 (RPC)
   */
  async getResults(voteId: string): Promise<{ data: ContributionVoteResults | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const { data, error } = await (supabase as any)
        .rpc('get_contribution_vote_results', {
          p_vote_id: voteId,
          p_requester_id: userId,
        })

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramBoardVoteService.getResults] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 투표 생성 (API 경유)
   */
  async createVote(
    groupId: string,
    dto: CreateContributionVoteDto
  ): Promise<{ data: TelegramBoardPost | null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const res = await fetch(`/api/telegram/groups/${groupId}/board-votes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...dto }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '투표 생성에 실패했습니다.')

      return { data: result.data, error: null }
    } catch (error) {
      console.error('[telegramBoardVoteService.createVote] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 투표 제출 (RPC)
   */
  async castVote(
    voteId: string,
    candidateIds: string[]
  ): Promise<{ data: { success: boolean; error?: string; total_voters?: number } | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const { data, error } = await (supabase as any)
        .rpc('cast_contribution_votes', {
          p_vote_id: voteId,
          p_voter_id: userId,
          p_candidate_ids: candidateIds,
        })

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[telegramBoardVoteService.castVote] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 투표 종료 (API 경유)
   */
  async closeVote(voteId: string): Promise<{ data: null; error: string | null }> {
    try {
      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const res = await fetch(`/api/telegram/board-votes/${voteId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '투표 종료에 실패했습니다.')

      return { data: null, error: null }
    } catch (error) {
      console.error('[telegramBoardVoteService.closeVote] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 후보자 목록 조회 (그룹 멤버 재사용)
   */
  async getCandidates(groupId: string): Promise<{ data: TelegramGroupMember[] | null; error: string | null }> {
    return telegramMemberService.getMembers(groupId)
  },
}

// =====================================================
// 게시판 카테고리 서비스
// =====================================================
export const telegramBoardCategoryService = {
  /**
   * 카테고리 목록 조회
   */
  async getCategories(groupId: string): Promise<{ data: TelegramBoardCategory[] | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('telegram_board_categories')
        .select('*')
        .eq('telegram_group_id', groupId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return { data, error: null }
    } catch (error) {
      console.error('[telegramBoardCategoryService.getCategories] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 카테고리 생성
   */
  async createCategory(
    groupId: string,
    data: { name: string; slug: string; color?: string; sort_order?: number }
  ): Promise<{ data: TelegramBoardCategory | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data: category, error } = await (supabase as any)
        .from('telegram_board_categories')
        .insert({
          telegram_group_id: groupId,
          name: data.name,
          slug: data.slug,
          color: data.color || 'gray',
          sort_order: data.sort_order ?? 0,
        })
        .select()
        .single()

      if (error) throw error
      return { data: category, error: null }
    } catch (error) {
      console.error('[telegramBoardCategoryService.createCategory] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 카테고리 수정
   */
  async updateCategory(
    categoryId: string,
    updates: { name?: string; color?: string; sort_order?: number }
  ): Promise<{ data: TelegramBoardCategory | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('telegram_board_categories')
        .update(updates)
        .eq('id', categoryId)
        .select()
        .single()

      if (error) throw error
      return { data, error: null }
    } catch (error) {
      console.error('[telegramBoardCategoryService.updateCategory] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 카테고리 삭제 (해당 글은 미분류로 이동)
   */
  async deleteCategory(categoryId: string, groupId: string): Promise<{ error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      // 미분류 카테고리 찾기
      const { data: defaultCat } = await (supabase as any)
        .from('telegram_board_categories')
        .select('id')
        .eq('telegram_group_id', groupId)
        .eq('is_default', true)
        .maybeSingle()

      // 해당 카테고리의 글을 미분류로 이동
      if (defaultCat) {
        await (supabase as any)
          .from('telegram_board_posts')
          .update({ category_id: defaultCat.id })
          .eq('category_id', categoryId)
      } else {
        await (supabase as any)
          .from('telegram_board_posts')
          .update({ category_id: null })
          .eq('category_id', categoryId)
      }

      const { error } = await (supabase as any)
        .from('telegram_board_categories')
        .delete()
        .eq('id', categoryId)
        .eq('is_default', false) // 기본 카테고리 삭제 방지

      if (error) throw error
      return { error: null }
    } catch (error) {
      console.error('[telegramBoardCategoryService.deleteCategory] Error:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  /**
   * 카테고리 병합 (source → target, source 삭제)
   */
  async mergeCategories(
    sourceCategoryId: string,
    targetCategoryId: string,
    groupId: string
  ): Promise<{ error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      // source의 모든 글을 target으로 이동
      await (supabase as any)
        .from('telegram_board_posts')
        .update({ category_id: targetCategoryId })
        .eq('category_id', sourceCategoryId)

      // source 카테고리 삭제
      await (supabase as any)
        .from('telegram_board_categories')
        .delete()
        .eq('id', sourceCategoryId)
        .eq('is_default', false)

      return { error: null }
    } catch (error) {
      console.error('[telegramBoardCategoryService.mergeCategories] Error:', error)
      return { error: extractErrorMessage(error) }
    }
  },
}
