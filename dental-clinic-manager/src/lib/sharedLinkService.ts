/**
 * 공유 링크 서비스
 * SharedLink Service - 게시물 링크 공유 CRUD
 */

import { ensureConnection } from './supabase/connectionCheck'
import type { SharedLink, CreateSharedLinkDto, SourceType } from '@/types/sharedLink'

// Helper: 에러 메시지 추출
const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    if ('message' in error && typeof (error as any).message === 'string') return (error as any).message
  }
  return 'Unknown error occurred'
}

// Helper: 현재 사용자 ID
const getCurrentUserId = (): string | null => {
  if (typeof window === 'undefined') return null
  const userStr = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
  if (!userStr) return null
  try {
    return JSON.parse(userStr).id
  } catch {
    return null
  }
}

// 랜덤 토큰 생성 (22자 URL-safe)
function generateToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 22)
}

export const sharedLinkService = {
  // 공유 링크 생성 (동일 게시물+접근레벨이면 기존 링크 반환)
  async createSharedLink(dto: CreateSharedLinkDto): Promise<{ data: SharedLink | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      const userId = getCurrentUserId()
      if (!userId) return { data: null, error: '로그인이 필요합니다.' }

      // 기존 활성 링크 확인
      const { data: existing } = await supabase
        .from('shared_links')
        .select('*')
        .eq('source_type', dto.source_type)
        .eq('source_id', dto.source_id)
        .eq('access_level', dto.access_level)
        .eq('is_active', true)
        .single()

      if (existing) {
        return { data: existing, error: null }
      }

      const token = generateToken()

      const { data, error } = await supabase
        .from('shared_links')
        .insert({
          token,
          source_type: dto.source_type,
          source_id: dto.source_id,
          access_level: dto.access_level,
          is_active: true,
          created_by: userId,
        })
        .select()
        .single()

      if (error) throw error
      return { data, error: null }
    } catch (error) {
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  // 게시물의 활성 공유 링크 조회
  async getSharedLinks(sourceType: SourceType, sourceId: string): Promise<{ data: SharedLink[]; error: string | null }> {
    try {
      const supabase = await ensureConnection()

      const { data, error } = await supabase
        .from('shared_links')
        .select('*')
        .eq('source_type', sourceType)
        .eq('source_id', sourceId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      return { data: data || [], error: null }
    } catch (error) {
      return { data: [], error: extractErrorMessage(error) }
    }
  },

  // 공유 링크 비활성화
  async deactivateSharedLink(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()

      const { error } = await supabase
        .from('shared_links')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
      return { success: true, error: null }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 공유 URL 생성 헬퍼
  getShareUrl(token: string): string {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    return `${baseUrl}/shared/${token}`
  },
}
