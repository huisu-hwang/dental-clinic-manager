// =====================================================
// 텔레그램 그룹채팅 연동 타입 정의
// =====================================================

// 텔레그램 그룹 상태
export type TelegramGroupStatus = 'pending' | 'approved' | 'rejected'

// 텔레그램 그룹
export interface TelegramGroup {
  id: string
  telegram_chat_id: number
  chat_title: string
  chat_type: 'group' | 'supergroup'
  board_slug: string
  board_title: string
  board_description: string | null
  color_bg: string
  color_text: string
  is_active: boolean
  webhook_secret: string | null
  last_sync_at: string | null
  summary_enabled: boolean
  summary_time: string
  status: TelegramGroupStatus
  application_reason: string | null
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  link_token: string | null
  created_by: string
  created_at: string
  updated_at: string
}

// 그룹 멤버
export interface TelegramGroupMember {
  id: string
  telegram_group_id: string
  user_id: string
  role: 'member' | 'admin'
  joined_via: 'invite_link' | 'admin'
  created_at: string
  // join 시 사용자 정보
  user?: {
    name: string
    email: string
  }
}

// 초대 링크
export interface TelegramInviteLink {
  id: string
  telegram_group_id: string
  invite_code: string
  created_by: string
  expires_at: string | null
  is_active: boolean
  max_uses: number | null
  use_count: number
  created_at: string
  // join 시 그룹 정보
  telegram_group?: TelegramGroup
}

// 버퍼된 텔레그램 메시지
export interface TelegramMessage {
  id: string
  telegram_group_id: string
  telegram_message_id: number
  telegram_chat_id: number
  sender_name: string
  sender_username: string | null
  message_text: string | null
  message_type: 'text' | 'photo' | 'document' | 'video' | 'link' | 'sticker' | 'other'
  has_file: boolean
  has_link: boolean
  file_id: string | null
  file_name: string | null
  file_url: string | null
  file_mime_type: string | null
  file_size: number | null
  extracted_links: { url: string; title?: string }[]
  is_summarized: boolean
  is_posted: boolean
  telegram_date: string
  created_at: string
}

// 게시글 (AI 요약 / 파일 / 링크 / 일반)
export interface TelegramBoardPost {
  id: string
  telegram_group_id: string
  post_type: 'summary' | 'file' | 'link' | 'general'
  title: string
  content: string
  source_message_ids: string[]
  summary_date: string | null
  file_urls: { url: string; name?: string; type?: string; size?: number }[]
  link_urls: { url: string; title?: string; description?: string }[]
  view_count: number
  is_pinned: boolean
  ai_model: string | null
  created_by: string | null
  comment_count: number
  created_at: string
  updated_at: string
  // join 시 작성자 정보
  author?: {
    name: string
    email: string
  }
}

// 댓글
export interface TelegramBoardComment {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
  // join 시 사용자 정보
  user?: {
    name: string
    email: string
  }
}

// =====================================================
// DTOs
// =====================================================

export interface CreateTelegramGroupDto {
  telegram_chat_id: number
  chat_title: string
  board_slug: string
  board_title: string
  board_description?: string
  color_bg?: string
  color_text?: string
}

export interface UpdateTelegramGroupDto {
  board_title?: string
  board_description?: string
  is_active?: boolean
  summary_enabled?: boolean
  summary_time?: string
  color_bg?: string
  color_text?: string
}

export interface CreateInviteLinkDto {
  telegram_group_id: string
  expires_at?: string | null
  max_uses?: number | null
}

// 게시판 신청 DTO
export interface ApplyTelegramGroupDto {
  telegram_chat_id: number
  chat_title: string
  board_slug: string
  board_title: string
  board_description?: string
  application_reason?: string
}

// 게시판 심사 DTO
export interface ReviewTelegramGroupDto {
  action: 'approve' | 'reject'
  rejection_reason?: string
}

// 게시글 작성 DTO
export interface CreateTelegramBoardPostDto {
  title: string
  content: string
  notify_telegram?: boolean
}

// 게시글 수정 DTO
export interface UpdateTelegramBoardPostDto {
  title?: string
  content?: string
}

// 댓글 작성 DTO
export interface CreateTelegramBoardCommentDto {
  content: string
}

// =====================================================
// 상수
// =====================================================

export const TELEGRAM_POST_TYPE_LABELS: Record<string, string> = {
  summary: 'AI 요약',
  file: '공유 파일',
  link: '공유 링크',
  general: '일반 글',
}

export const TELEGRAM_POST_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  summary: { bg: 'bg-purple-100', text: 'text-purple-700' },
  file: { bg: 'bg-blue-100', text: 'text-blue-700' },
  link: { bg: 'bg-green-100', text: 'text-green-700' },
  general: { bg: 'bg-gray-100', text: 'text-gray-700' },
}

export const TELEGRAM_GROUP_STATUS_LABELS: Record<TelegramGroupStatus, string> = {
  pending: '승인 대기',
  approved: '승인됨',
  rejected: '반려됨',
}

export const TELEGRAM_GROUP_STATUS_COLORS: Record<TelegramGroupStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700' },
  approved: { bg: 'bg-green-100', text: 'text-green-700' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700' },
}
