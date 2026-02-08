/**
 * 커뮤니티 게시판 서비스
 * Community Service - 닉네임 기반 익명 커뮤니티 게시판
 */

import { ensureConnection } from './supabase/connectionCheck'
import type {
  CommunityProfile,
  CommunityPost,
  CommunityComment,
  CommunityPoll,
  CommunityPollOption,
  CommunityReport,
  CommunityPenalty,
  CommunityCategory,
  CommunityCategoryItem,
  CreatePostDto,
  UpdatePostDto,
  CreateCommentDto,
  CreateReportDto,
  IssuePenaltyDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  ReportStatus,
} from '@/types/community'

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

// Helper: 현재 사용자 정보
const getCurrentUser = (): { id: string; role: string; name: string } | null => {
  if (typeof window === 'undefined') return null
  const userStr = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
  if (!userStr) return null
  try {
    return JSON.parse(userStr)
  } catch {
    return null
  }
}

// =====================================================
// 프로필 서비스
// =====================================================
export const communityProfileService = {
  /**
   * 내 프로필 조회
   */
  async getMyProfile(): Promise<{ data: CommunityProfile | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const { data, error } = await (supabase as any)
        .from('community_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[communityProfileService.getMyProfile] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 프로필 생성 (닉네임 설정)
   */
  async createProfile(nickname: string, avatarSeed?: string): Promise<{ data: CommunityProfile | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const { data, error } = await (supabase as any)
        .from('community_profiles')
        .insert({
          user_id: userId,
          nickname,
          avatar_seed: avatarSeed || nickname,
        })
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[communityProfileService.createProfile] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 프로필 수정
   */
  async updateProfile(updates: { nickname?: string; avatar_seed?: string; bio?: string }): Promise<{ data: CommunityProfile | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const updateData: any = {}
      if (updates.nickname !== undefined) {
        updateData.nickname = updates.nickname
        updateData.nickname_changed_at = new Date().toISOString()
      }
      if (updates.avatar_seed !== undefined) updateData.avatar_seed = updates.avatar_seed
      if (updates.bio !== undefined) updateData.bio = updates.bio

      const { data, error } = await (supabase as any)
        .from('community_profiles')
        .update(updateData)
        .eq('user_id', userId)
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[communityProfileService.updateProfile] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 닉네임 사용 가능 여부 확인
   */
  async checkNicknameAvailable(nickname: string): Promise<{ available: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('community_profiles')
        .select('id')
        .eq('nickname', nickname)
        .maybeSingle()

      if (error) throw error

      return { available: !data, error: null }
    } catch (error) {
      console.error('[communityProfileService.checkNicknameAvailable] Error:', error)
      return { available: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 프로필 ID로 조회
   */
  async getProfile(profileId: string): Promise<{ data: CommunityProfile | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('community_profiles')
        .select('*')
        .eq('id', profileId)
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[communityProfileService.getProfile] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },
}

// =====================================================
// 게시글 서비스
// =====================================================
export const communityPostService = {
  /**
   * 게시글 목록 조회
   */
  async getPosts(options?: {
    category?: CommunityCategory
    limit?: number
    offset?: number
    search?: string
    sort?: 'latest' | 'popular'
  }): Promise<{ data: CommunityPost[] | null; total: number; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const limit = options?.limit || 20
      const offset = options?.offset || 0

      let query = (supabase as any)
        .from('community_posts')
        .select('*, profile:community_profiles(*)', { count: 'exact' })
        .eq('is_blinded', false)
        .order('is_pinned', { ascending: false })

      if (options?.sort === 'popular') {
        query = query.order('like_count', { ascending: false })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      if (options?.category) {
        query = query.eq('category', options.category)
      }

      if (options?.search) {
        query = query.or(`title.ilike.%${options.search}%,content.ilike.%${options.search}%`)
      }

      query = query.range(offset, offset + limit - 1)

      const { data, error, count } = await query

      if (error) throw error

      // 좋아요/북마크 상태 확인
      const userId = getCurrentUserId()
      let posts = data || []

      if (userId && posts.length > 0) {
        const { data: myProfile } = await (supabase as any)
          .from('community_profiles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle()

        if (myProfile) {
          const postIds = posts.map((p: any) => p.id)

          const [likesResult, bookmarksResult] = await Promise.all([
            (supabase as any)
              .from('community_likes')
              .select('post_id')
              .eq('profile_id', myProfile.id)
              .in('post_id', postIds),
            (supabase as any)
              .from('community_bookmarks')
              .select('post_id')
              .eq('profile_id', myProfile.id)
              .in('post_id', postIds),
          ])

          const likedPostIds = new Set((likesResult.data || []).map((l: any) => l.post_id))
          const bookmarkedPostIds = new Set((bookmarksResult.data || []).map((b: any) => b.post_id))

          posts = posts.map((post: any) => ({
            ...post,
            is_liked: likedPostIds.has(post.id),
            is_bookmarked: bookmarkedPostIds.has(post.id),
          }))
        }
      }

      return { data: posts, total: count || 0, error: null }
    } catch (error) {
      console.error('[communityPostService.getPosts] Error:', error)
      return { data: null, total: 0, error: extractErrorMessage(error) }
    }
  },

  /**
   * 게시글 상세 조회
   */
  async getPost(id: string): Promise<{ data: CommunityPost | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('community_posts')
        .select('*, profile:community_profiles(*)')
        .eq('id', id)
        .single()

      if (error) throw error

      // 조회수 증가
      await (supabase as any).rpc('increment_community_post_view_count', { p_post_id: id })

      // 좋아요/북마크 상태 확인
      const userId = getCurrentUserId()
      let post = { ...data, is_liked: false, is_bookmarked: false }

      if (userId) {
        const { data: myProfile } = await (supabase as any)
          .from('community_profiles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle()

        if (myProfile) {
          const [likeResult, bookmarkResult] = await Promise.all([
            (supabase as any)
              .from('community_likes')
              .select('id')
              .eq('profile_id', myProfile.id)
              .eq('post_id', id)
              .maybeSingle(),
            (supabase as any)
              .from('community_bookmarks')
              .select('id')
              .eq('profile_id', myProfile.id)
              .eq('post_id', id)
              .maybeSingle(),
          ])

          post.is_liked = !!likeResult.data
          post.is_bookmarked = !!bookmarkResult.data
        }
      }

      return { data: post, error: null }
    } catch (error) {
      console.error('[communityPostService.getPost] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 인기 게시글 조회
   */
  async getPopularPosts(limit: number = 5): Promise<{ data: CommunityPost[] | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      // 최근 7일간 인기글
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)

      const { data, error } = await (supabase as any)
        .from('community_posts')
        .select('*, profile:community_profiles(nickname, avatar_seed)')
        .eq('is_blinded', false)
        .gte('created_at', weekAgo.toISOString())
        .order('like_count', { ascending: false })
        .limit(limit)

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[communityPostService.getPopularPosts] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 게시글 작성
   */
  async createPost(profileId: string, input: CreatePostDto): Promise<{ data: CommunityPost | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('community_posts')
        .insert({
          profile_id: profileId,
          category: input.category,
          title: input.title,
          content: input.content,
          has_poll: !!input.poll,
        })
        .select()
        .single()

      if (error) throw error

      // 투표 생성
      if (input.poll && data) {
        const { data: pollData, error: pollError } = await (supabase as any)
          .from('community_polls')
          .insert({
            post_id: data.id,
            question: input.poll.question,
            is_multiple_choice: input.poll.is_multiple_choice || false,
            is_anonymous: input.poll.is_anonymous !== false,
            ends_at: input.poll.ends_at || null,
          })
          .select()
          .single()

        if (pollError) {
          console.error('[communityPostService.createPost] Poll creation error:', pollError)
        } else if (pollData && input.poll.options.length > 0) {
          const options = input.poll.options.map((text, index) => ({
            poll_id: pollData.id,
            option_text: text,
            sort_order: index,
          }))

          await (supabase as any)
            .from('community_poll_options')
            .insert(options)
        }
      }

      return { data, error: null }
    } catch (error) {
      console.error('[communityPostService.createPost] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 게시글 수정
   */
  async updatePost(id: string, input: UpdatePostDto): Promise<{ data: CommunityPost | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const updateData: any = {}
      if (input.title !== undefined) updateData.title = input.title
      if (input.content !== undefined) updateData.content = input.content
      if (input.category !== undefined) updateData.category = input.category

      const { data, error } = await (supabase as any)
        .from('community_posts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[communityPostService.updatePost] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 게시글 삭제
   */
  async deletePost(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { error } = await (supabase as any)
        .from('community_posts')
        .delete()
        .eq('id', id)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[communityPostService.deletePost] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 좋아요 토글
   */
  async toggleLike(profileId: string, postId: string): Promise<{ data: { liked: boolean; like_count: number } | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .rpc('toggle_community_post_like', { p_profile_id: profileId, p_post_id: postId })

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[communityPostService.toggleLike] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 북마크 토글
   */
  async toggleBookmark(profileId: string, postId: string): Promise<{ data: { bookmarked: boolean } | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      // 기존 북마크 확인
      const { data: existing } = await (supabase as any)
        .from('community_bookmarks')
        .select('id')
        .eq('profile_id', profileId)
        .eq('post_id', postId)
        .maybeSingle()

      if (existing) {
        await (supabase as any).from('community_bookmarks').delete().eq('id', existing.id)
        await (supabase as any)
          .from('community_posts')
          .update({ bookmark_count: (supabase as any).rpc ? undefined : 0 })
          .eq('id', postId)

        // 수동 카운터 감소
        const { data: post } = await (supabase as any)
          .from('community_posts')
          .select('bookmark_count')
          .eq('id', postId)
          .single()
        if (post) {
          await (supabase as any)
            .from('community_posts')
            .update({ bookmark_count: Math.max(0, post.bookmark_count - 1) })
            .eq('id', postId)
        }

        return { data: { bookmarked: false }, error: null }
      } else {
        await (supabase as any)
          .from('community_bookmarks')
          .insert({ profile_id: profileId, post_id: postId })

        // 수동 카운터 증가
        const { data: post } = await (supabase as any)
          .from('community_posts')
          .select('bookmark_count')
          .eq('id', postId)
          .single()
        if (post) {
          await (supabase as any)
            .from('community_posts')
            .update({ bookmark_count: post.bookmark_count + 1 })
            .eq('id', postId)
        }

        return { data: { bookmarked: true }, error: null }
      }
    } catch (error) {
      console.error('[communityPostService.toggleBookmark] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 내 북마크 목록
   */
  async getMyBookmarks(profileId: string, options?: {
    limit?: number
    offset?: number
  }): Promise<{ data: CommunityPost[] | null; total: number; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const limit = options?.limit || 20
      const offset = options?.offset || 0

      const { data, error, count } = await (supabase as any)
        .from('community_bookmarks')
        .select('post:community_posts(*, profile:community_profiles(*))', { count: 'exact' })
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error

      const posts = (data || []).map((item: any) => ({ ...item.post, is_bookmarked: true }))

      return { data: posts, total: count || 0, error: null }
    } catch (error) {
      console.error('[communityPostService.getMyBookmarks] Error:', error)
      return { data: null, total: 0, error: extractErrorMessage(error) }
    }
  },
}

// =====================================================
// 댓글 서비스
// =====================================================
export const communityCommentService = {
  /**
   * 댓글 목록 조회 (트리 구조)
   */
  async getComments(postId: string): Promise<{ data: CommunityComment[] | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('community_comments')
        .select('*, profile:community_profiles(id, nickname, avatar_seed)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })

      if (error) throw error

      // 좋아요 상태 확인
      const userId = getCurrentUserId()
      let comments = data || []

      if (userId && comments.length > 0) {
        const { data: myProfile } = await (supabase as any)
          .from('community_profiles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle()

        if (myProfile) {
          const commentIds = comments.map((c: any) => c.id)
          const { data: likes } = await (supabase as any)
            .from('community_likes')
            .select('comment_id')
            .eq('profile_id', myProfile.id)
            .in('comment_id', commentIds)

          const likedIds = new Set((likes || []).map((l: any) => l.comment_id))
          comments = comments.map((c: any) => ({ ...c, is_liked: likedIds.has(c.id) }))
        }
      }

      // 트리 구조로 변환
      const commentMap = new Map<string, CommunityComment>()
      const rootComments: CommunityComment[] = []

      comments.forEach((comment: CommunityComment) => {
        commentMap.set(comment.id, { ...comment, replies: [] })
      })

      commentMap.forEach((comment) => {
        if (comment.parent_id && commentMap.has(comment.parent_id)) {
          commentMap.get(comment.parent_id)!.replies!.push(comment)
        } else {
          rootComments.push(comment)
        }
      })

      return { data: rootComments, error: null }
    } catch (error) {
      console.error('[communityCommentService.getComments] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 댓글 작성
   */
  async createComment(postId: string, profileId: string, input: CreateCommentDto): Promise<{ data: CommunityComment | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('community_comments')
        .insert({
          post_id: postId,
          profile_id: profileId,
          parent_id: input.parent_id || null,
          content: input.content,
        })
        .select('*, profile:community_profiles(id, nickname, avatar_seed)')
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[communityCommentService.createComment] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 댓글 수정
   */
  async updateComment(id: string, content: string): Promise<{ data: CommunityComment | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('community_comments')
        .update({ content })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[communityCommentService.updateComment] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 댓글 삭제
   */
  async deleteComment(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { error } = await (supabase as any)
        .from('community_comments')
        .delete()
        .eq('id', id)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[communityCommentService.deleteComment] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 댓글 좋아요 토글
   */
  async toggleLike(profileId: string, commentId: string): Promise<{ data: { liked: boolean; like_count: number } | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .rpc('toggle_community_comment_like', { p_profile_id: profileId, p_comment_id: commentId })

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[communityCommentService.toggleLike] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },
}

// =====================================================
// 투표 서비스
// =====================================================
export const communityPollService = {
  /**
   * 투표 조회
   */
  async getPoll(postId: string): Promise<{ data: CommunityPoll | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data: poll, error } = await (supabase as any)
        .from('community_polls')
        .select('*, options:community_poll_options(*)')
        .eq('post_id', postId)
        .maybeSingle()

      if (error) throw error
      if (!poll) return { data: null, error: null }

      // 사용자 투표 확인
      const userId = getCurrentUserId()
      let userVotes: string[] = []

      if (userId) {
        const { data: myProfile } = await (supabase as any)
          .from('community_profiles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle()

        if (myProfile) {
          const { data: votes } = await (supabase as any)
            .from('community_poll_votes')
            .select('option_id')
            .eq('poll_id', poll.id)
            .eq('profile_id', myProfile.id)

          userVotes = (votes || []).map((v: any) => v.option_id)
        }
      }

      // 총 투표 수 계산
      const totalVotes = (poll.options || []).reduce((sum: number, opt: any) => sum + opt.vote_count, 0)

      // 옵션 정렬
      const sortedOptions = (poll.options || []).sort((a: any, b: any) => a.sort_order - b.sort_order)

      return {
        data: {
          ...poll,
          options: sortedOptions,
          user_votes: userVotes,
          total_votes: totalVotes,
        },
        error: null,
      }
    } catch (error) {
      console.error('[communityPollService.getPoll] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 투표하기
   */
  async vote(pollId: string, optionIds: string[], profileId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      // 기존 투표 삭제 후 새 투표 등록
      await (supabase as any)
        .from('community_poll_votes')
        .delete()
        .eq('poll_id', pollId)
        .eq('profile_id', profileId)

      // 새 투표 등록
      const votes = optionIds.map(optionId => ({
        poll_id: pollId,
        option_id: optionId,
        profile_id: profileId,
      }))

      const { error } = await (supabase as any)
        .from('community_poll_votes')
        .insert(votes)

      if (error) throw error

      // 투표 수 재계산
      for (const optionId of optionIds) {
        const { count } = await (supabase as any)
          .from('community_poll_votes')
          .select('*', { count: 'exact', head: true })
          .eq('option_id', optionId)

        await (supabase as any)
          .from('community_poll_options')
          .update({ vote_count: count || 0 })
          .eq('id', optionId)
      }

      return { success: true, error: null }
    } catch (error) {
      console.error('[communityPollService.vote] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },
}

// =====================================================
// 신고 서비스
// =====================================================
export const communityReportService = {
  /**
   * 신고 제출
   */
  async submitReport(profileId: string, input: CreateReportDto): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { error } = await (supabase as any)
        .from('community_reports')
        .insert({
          reporter_profile_id: profileId,
          post_id: input.post_id || null,
          comment_id: input.comment_id || null,
          reason: input.reason,
          detail: input.detail || null,
        })

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[communityReportService.submitReport] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },
}

// =====================================================
// 관리자 서비스
// =====================================================
export const communityAdminService = {
  /**
   * 신고 목록 조회
   */
  async getReports(options?: {
    status?: ReportStatus
    limit?: number
    offset?: number
  }): Promise<{ data: CommunityReport[] | null; total: number; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const limit = options?.limit || 20
      const offset = options?.offset || 0

      let query = (supabase as any)
        .from('community_reports')
        .select('*, reporter_profile:community_profiles!reporter_profile_id(*), post:community_posts(*), comment:community_comments(*)', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (options?.status) {
        query = query.eq('status', options.status)
      }

      query = query.range(offset, offset + limit - 1)

      const { data, error, count } = await query

      if (error) throw error

      return { data, total: count || 0, error: null }
    } catch (error) {
      console.error('[communityAdminService.getReports] Error:', error)
      return { data: null, total: 0, error: extractErrorMessage(error) }
    }
  },

  /**
   * 신고 검토 처리
   */
  async reviewReport(reportId: string, status: 'action_taken' | 'dismissed'): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const { error } = await (supabase as any)
        .from('community_reports')
        .update({
          status,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', reportId)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[communityAdminService.reviewReport] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 제재 발급
   */
  async issuePenalty(input: IssuePenaltyDto): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const expiresAt = input.duration_days
        ? new Date(Date.now() + input.duration_days * 24 * 60 * 60 * 1000).toISOString()
        : null

      // 제재 기록 추가
      const { error: penaltyError } = await (supabase as any)
        .from('community_penalties')
        .insert({
          profile_id: input.profile_id,
          type: input.type,
          reason: input.reason,
          duration_days: input.duration_days || null,
          issued_by: userId,
          expires_at: expiresAt,
        })

      if (penaltyError) throw penaltyError

      // 프로필 업데이트
      const updateData: any = {
        warning_count: (supabase as any).rpc ? undefined : 0,
      }

      if (input.type === 'warning') {
        // 경고 횟수 증가
        const { data: profile } = await (supabase as any)
          .from('community_profiles')
          .select('warning_count')
          .eq('id', input.profile_id)
          .single()

        if (profile) {
          await (supabase as any)
            .from('community_profiles')
            .update({ warning_count: profile.warning_count + 1 })
            .eq('id', input.profile_id)
        }
      } else if (input.type === 'temp_ban') {
        await (supabase as any)
          .from('community_profiles')
          .update({ is_banned: true, ban_until: expiresAt })
          .eq('id', input.profile_id)
      } else if (input.type === 'permanent_ban') {
        await (supabase as any)
          .from('community_profiles')
          .update({ is_banned: true, ban_until: null })
          .eq('id', input.profile_id)
      }

      return { success: true, error: null }
    } catch (error) {
      console.error('[communityAdminService.issuePenalty] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 제재 이력 조회
   */
  async getPenalties(profileId?: string): Promise<{ data: CommunityPenalty[] | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      let query = (supabase as any)
        .from('community_penalties')
        .select('*, profile:community_profiles(id, nickname)')
        .order('created_at', { ascending: false })

      if (profileId) {
        query = query.eq('profile_id', profileId)
      }

      const { data, error } = await query

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[communityAdminService.getPenalties] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 게시글 블라인드 처리
   */
  async blindPost(postId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { error } = await (supabase as any)
        .from('community_posts')
        .update({ is_blinded: true })
        .eq('id', postId)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[communityAdminService.blindPost] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 게시글 블라인드 해제
   */
  async unblindPost(postId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { error } = await (supabase as any)
        .from('community_posts')
        .update({ is_blinded: false })
        .eq('id', postId)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[communityAdminService.unblindPost] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 댓글 블라인드 처리
   */
  async blindComment(commentId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { error } = await (supabase as any)
        .from('community_comments')
        .update({ is_blinded: true })
        .eq('id', commentId)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[communityAdminService.blindComment] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 사용자 실명 조회 (신고 대상자)
   */
  async getUserIdentity(profileId: string): Promise<{ data: { name: string; email: string; role: string } | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      // 프로필에서 user_id 조회
      const { data: profile, error: profileError } = await (supabase as any)
        .from('community_profiles')
        .select('user_id')
        .eq('id', profileId)
        .single()

      if (profileError) throw profileError

      // 사용자 정보 조회
      const { data: user, error: userError } = await (supabase as any)
        .from('users')
        .select('name, email, role')
        .eq('id', profile.user_id)
        .single()

      if (userError) throw userError

      return { data: user, error: null }
    } catch (error) {
      console.error('[communityAdminService.getUserIdentity] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },
}

// =====================================================
// 카테고리 서비스
// =====================================================
export const communityCategoryService = {
  /**
   * 카테고리 목록 조회 (활성 카테고리만 또는 전체)
   */
  async getCategories(includeInactive: boolean = false): Promise<{ data: CommunityCategoryItem[] | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      let query = (supabase as any)
        .from('community_categories')
        .select('*')
        .order('sort_order', { ascending: true })

      if (!includeInactive) {
        query = query.eq('is_active', true)
      }

      const { data, error } = await query

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[communityCategoryService.getCategories] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 카테고리 생성 (master_admin)
   */
  async createCategory(input: CreateCategoryDto): Promise<{ data: CommunityCategoryItem | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      // 현재 최대 sort_order 조회
      const { data: maxOrder } = await (supabase as any)
        .from('community_categories')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextOrder = (maxOrder?.sort_order ?? -1) + 1

      const { data, error } = await (supabase as any)
        .from('community_categories')
        .insert({
          slug: input.slug,
          label: input.label,
          color_bg: input.color_bg || 'bg-gray-100',
          color_text: input.color_text || 'text-gray-700',
          sort_order: nextOrder,
        })
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[communityCategoryService.createCategory] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 카테고리 수정 (master_admin)
   */
  async updateCategory(id: string, input: UpdateCategoryDto): Promise<{ data: CommunityCategoryItem | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const updateData: any = {}
      if (input.slug !== undefined) updateData.slug = input.slug
      if (input.label !== undefined) updateData.label = input.label
      if (input.color_bg !== undefined) updateData.color_bg = input.color_bg
      if (input.color_text !== undefined) updateData.color_text = input.color_text
      if (input.is_active !== undefined) updateData.is_active = input.is_active
      if (input.sort_order !== undefined) updateData.sort_order = input.sort_order

      const { data, error } = await (supabase as any)
        .from('community_categories')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[communityCategoryService.updateCategory] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 카테고리 삭제 (master_admin)
   * 해당 카테고리의 게시글이 있으면 삭제 불가
   */
  async deleteCategory(id: string, slug: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      // 해당 카테고리를 사용하는 게시글이 있는지 확인
      const { count } = await (supabase as any)
        .from('community_posts')
        .select('*', { count: 'exact', head: true })
        .eq('category', slug)

      if (count && count > 0) {
        return { success: false, error: `이 주제에 ${count}개의 게시글이 있어 삭제할 수 없습니다. 먼저 비활성화를 사용하세요.` }
      }

      const { error } = await (supabase as any)
        .from('community_categories')
        .delete()
        .eq('id', id)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[communityCategoryService.deleteCategory] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 카테고리 순서 변경 (master_admin)
   */
  async reorderCategories(orderedIds: { id: string; sort_order: number }[]): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      for (const item of orderedIds) {
        const { error } = await (supabase as any)
          .from('community_categories')
          .update({ sort_order: item.sort_order })
          .eq('id', item.id)

        if (error) throw error
      }

      return { success: true, error: null }
    } catch (error) {
      console.error('[communityCategoryService.reorderCategories] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },
}

// 통합 export
export const communityService = {
  profiles: communityProfileService,
  posts: communityPostService,
  comments: communityCommentService,
  polls: communityPollService,
  reports: communityReportService,
  admin: communityAdminService,
  categories: communityCategoryService,
}

export default communityService
