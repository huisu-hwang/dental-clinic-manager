/**
 * AI 자동 구현 태스크 서비스
 * AI Suggestion Service - 자유게시판 "제안" 글에 대한 AI 자동 구현 워크플로우
 */

import { ensureConnection } from './supabase/connectionCheck'
import type { AiSuggestionTask } from '@/types/community'

// Helper: 에러 메시지 추출
const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    if ('message' in error && typeof (error as any).message === 'string') return (error as any).message
    if ('error' in error && typeof (error as any).error === 'string') return (error as any).error
  }
  return 'Unknown error occurred'
}

// =====================================================
// AI 자동 구현 태스크 서비스
// =====================================================
export const aiSuggestionService = {
  /**
   * 특정 게시글의 태스크 조회 (없으면 null)
   */
  async getTaskByPostId(postId: string): Promise<{ data: AiSuggestionTask | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('ai_suggestion_tasks')
        .select('*')
        .eq('post_id', postId)
        .maybeSingle()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[aiSuggestionService.getTaskByPostId] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * AI 자동 구현 태스크 요청 (신규 생성)
   */
  async requestTask(postId: string, requestedBy: string): Promise<{ data: AiSuggestionTask | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('ai_suggestion_tasks')
        .insert({
          post_id: postId,
          status: 'pending',
          requested_by: requestedBy,
        })
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[aiSuggestionService.requestTask] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 진행 중인 태스크 취소 (pending/running 상태일 때만)
   */
  async cancelTask(postId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { error } = await (supabase as any)
        .from('ai_suggestion_tasks')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        })
        .eq('post_id', postId)
        .in('status', ['pending', 'running'])

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[aiSuggestionService.cancelTask] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 실패/취소된 태스크 재시도 (기존 row를 pending으로 리셋)
   */
  async retryTask(postId: string, requestedBy: string): Promise<{ data: AiSuggestionTask | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('ai_suggestion_tasks')
        .update({
          status: 'pending',
          error_message: null,
          worker_log: null,
          pr_url: null,
          pr_number: null,
          branch_name: null,
          commit_sha: null,
          requested_by: requestedBy,
          started_at: null,
          completed_at: null,
        })
        .eq('post_id', postId)
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[aiSuggestionService.retryTask] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },
}

export default aiSuggestionService
