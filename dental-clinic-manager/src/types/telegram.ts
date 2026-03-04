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

// 게시판 카테고리 (주제별 분류)
export interface TelegramBoardCategory {
  id: string
  telegram_group_id: string
  name: string
  slug: string
  color: string
  sort_order: number
  is_default: boolean
  post_count: number
  created_at: string
}

// 카테고리 색상 프리셋
export const TELEGRAM_CATEGORY_COLORS: { name: string; value: string; bg: string; text: string }[] = [
  { name: '회색', value: 'gray', bg: 'bg-gray-100', text: 'text-gray-700' },
  { name: '빨강', value: 'red', bg: 'bg-red-100', text: 'text-red-700' },
  { name: '주황', value: 'orange', bg: 'bg-orange-100', text: 'text-orange-700' },
  { name: '노랑', value: 'amber', bg: 'bg-amber-100', text: 'text-amber-700' },
  { name: '초록', value: 'green', bg: 'bg-green-100', text: 'text-green-700' },
  { name: '청록', value: 'teal', bg: 'bg-teal-100', text: 'text-teal-700' },
  { name: '파랑', value: 'blue', bg: 'bg-blue-100', text: 'text-blue-700' },
  { name: '남색', value: 'indigo', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { name: '보라', value: 'purple', bg: 'bg-purple-100', text: 'text-purple-700' },
  { name: '분홍', value: 'pink', bg: 'bg-pink-100', text: 'text-pink-700' },
]

// 카테고리 색상 헬퍼
export function getCategoryColorClasses(color: string): { bg: string; text: string } {
  const found = TELEGRAM_CATEGORY_COLORS.find(c => c.value === color)
  return found ? { bg: found.bg, text: found.text } : { bg: 'bg-gray-100', text: 'text-gray-700' }
}

// 게시글 (AI 요약 / 파일 / 링크 / 일반)
export interface TelegramBoardPost {
  id: string
  telegram_group_id: string
  post_type: 'summary' | 'file' | 'link' | 'general' | 'vote'
  title: string
  content: string
  source_message_ids: string[]
  summary_date: string | null
  file_urls: { url: string; name?: string; type?: string; size?: number }[]
  link_urls: { url: string; title?: string; description?: string }[]
  view_count: number
  like_count: number
  scrap_count: number
  is_pinned: boolean
  ai_model: string | null
  created_by: string | null
  comment_count: number
  category_id: string | null
  created_at: string
  updated_at: string
  // 현재 사용자의 좋아요/스크랩 상태
  is_liked?: boolean
  is_scraped?: boolean
  // join 시 작성자 정보
  author?: {
    name: string
    email: string
  }
  // join 시 카테고리 정보
  category?: TelegramBoardCategory | null
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
  file_urls?: { url: string; name: string; type?: string; size?: number }[]
  category_id?: string | null
}

// 게시글 수정 DTO
export interface UpdateTelegramBoardPostDto {
  title?: string
  content?: string
  file_urls?: { url: string; name: string; type?: string; size?: number }[]
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
  vote: '기여도 투표',
}

export const TELEGRAM_POST_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  summary: { bg: 'bg-purple-100', text: 'text-purple-700' },
  file: { bg: 'bg-blue-100', text: 'text-blue-700' },
  link: { bg: 'bg-green-100', text: 'text-green-700' },
  general: { bg: 'bg-gray-100', text: 'text-gray-700' },
  vote: { bg: 'bg-orange-100', text: 'text-orange-700' },
}

// 기여도 투표 결과 공개 시점
export type ContributionVoteResultVisibility = 'realtime' | 'after_vote' | 'after_end'

// 기여도 투표 세션
export interface TelegramBoardVote {
  id: string
  post_id: string
  telegram_group_id: string
  max_votes_per_person: number
  is_anonymous: boolean
  show_top_n: number | null
  result_visibility: ContributionVoteResultVisibility
  allow_self_vote: boolean
  status: 'active' | 'closed' | 'cancelled'
  starts_at: string
  ends_at: string | null
  closed_at: string | null
  closed_by: string | null
  total_voters: number
  total_votes_cast: number
  created_by: string
  created_at: string
  updated_at: string
}

// 기여도 투표 후보별 결과
export interface ContributionVoteCandidate {
  user_id: string
  user_name: string
  vote_count: number
  rank: number
}

// 기여도 투표 결과 (RPC 반환)
export interface ContributionVoteResults {
  results: ContributionVoteCandidate[]
  has_voted: boolean
  my_selections: string[]
  my_rank: number | null
  my_votes: number
  is_closed: boolean
  total_voters: number
  total_votes_cast: number
  result_visibility: ContributionVoteResultVisibility
  max_votes_per_person: number
  is_anonymous: boolean
  show_top_n: number | null
  allow_self_vote: boolean
  can_see_results: boolean
}

// 기여도 투표 생성 DTO
export interface CreateContributionVoteDto {
  title: string
  content: string
  max_votes_per_person: number
  is_anonymous: boolean
  show_top_n: number | null
  result_visibility: ContributionVoteResultVisibility
  allow_self_vote: boolean
  ends_at: string | null
  notify_telegram: boolean
}

// 기여도 투표 제출 DTO
export interface CastContributionVoteDto {
  candidate_ids: string[]
}

export const CONTRIBUTION_VOTE_RESULT_VISIBILITY_LABELS: Record<ContributionVoteResultVisibility, string> = {
  realtime: '실시간 공개',
  after_vote: '투표 후 공개',
  after_end: '종료 후 공개',
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
