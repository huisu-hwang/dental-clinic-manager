// 커뮤니티 게시판 타입 정의

// 커뮤니티 카테고리 (동적 관리 - DB 기반)
export type CommunityCategory = string

// 카테고리 아이템 (DB 테이블 매핑)
export interface CommunityCategoryItem {
  id: string
  slug: string
  label: string
  color_bg: string
  color_text: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// 신고 사유
export type ReportReason =
  | 'spam'            // 스팸/광고
  | 'harassment'      // 괴롭힘/욕설
  | 'inappropriate'   // 부적절한 콘텐츠
  | 'privacy'         // 개인정보 노출
  | 'misinformation'  // 허위정보
  | 'other'           // 기타

// 신고 상태
export type ReportStatus = 'pending' | 'reviewed' | 'action_taken' | 'dismissed'

// 제재 유형
export type PenaltyType = 'warning' | 'temp_ban' | 'permanent_ban'

// 커뮤니티 프로필
export interface CommunityProfile {
  id: string
  user_id: string
  nickname: string
  avatar_seed?: string
  bio?: string
  is_banned: boolean
  ban_until?: string
  warning_count: number
  total_posts: number
  total_comments: number
  nickname_changed_at?: string
  created_at: string
  updated_at: string
}

// 커뮤니티 게시글
export interface CommunityPost {
  id: string
  profile_id: string
  category: CommunityCategory
  title: string
  content: string
  is_pinned: boolean
  is_blinded: boolean
  view_count: number
  like_count: number
  comment_count: number
  bookmark_count: number
  has_poll: boolean
  created_at: string
  updated_at: string
  // 조인 데이터
  profile?: CommunityProfile
  is_liked?: boolean
  is_bookmarked?: boolean
}

// 커뮤니티 댓글
export interface CommunityComment {
  id: string
  post_id: string
  profile_id: string
  parent_id?: string
  content: string
  is_blinded: boolean
  like_count: number
  created_at: string
  updated_at: string
  // 조인 데이터
  profile?: CommunityProfile
  is_liked?: boolean
  replies?: CommunityComment[]
}

// 투표
export interface CommunityPoll {
  id: string
  post_id: string
  question: string
  is_multiple_choice: boolean
  is_anonymous: boolean
  ends_at?: string
  created_at: string
  options?: CommunityPollOption[]
  user_votes?: string[]  // 사용자가 투표한 option_id 배열
  total_votes?: number
}

// 투표 선택지
export interface CommunityPollOption {
  id: string
  poll_id: string
  option_text: string
  vote_count: number
  sort_order: number
}

// 신고
export interface CommunityReport {
  id: string
  reporter_profile_id: string
  post_id?: string
  comment_id?: string
  reason: ReportReason
  detail?: string
  status: ReportStatus
  reviewed_by?: string
  reviewed_at?: string
  created_at: string
  // 조인 데이터
  reporter_profile?: CommunityProfile
  post?: CommunityPost
  comment?: CommunityComment
}

// 제재 이력
export interface CommunityPenalty {
  id: string
  profile_id: string
  type: PenaltyType
  reason: string
  duration_days?: number
  is_active: boolean
  issued_by: string
  expires_at?: string
  created_at: string
  // 조인 데이터
  profile?: CommunityProfile
}

// DTO: 게시글 생성
export interface CreatePostDto {
  category: CommunityCategory
  title: string
  content: string
  poll?: {
    question: string
    options: string[]
    is_multiple_choice?: boolean
    is_anonymous?: boolean
    ends_at?: string
  }
}

// DTO: 게시글 수정
export interface UpdatePostDto {
  title?: string
  content?: string
  category?: CommunityCategory
}

// DTO: 댓글 생성
export interface CreateCommentDto {
  content: string
  parent_id?: string
}

// DTO: 신고 생성
export interface CreateReportDto {
  post_id?: string
  comment_id?: string
  reason: ReportReason
  detail?: string
}

// DTO: 카테고리 생성
export interface CreateCategoryDto {
  slug: string
  label: string
  color_bg?: string
  color_text?: string
}

// DTO: 카테고리 수정
export interface UpdateCategoryDto {
  slug?: string
  label?: string
  color_bg?: string
  color_text?: string
  is_active?: boolean
  sort_order?: number
}

// DTO: 제재 발급
export interface IssuePenaltyDto {
  profile_id: string
  type: PenaltyType
  reason: string
  duration_days?: number
}

// 라벨 상수 (폴백용 기본값)
export const COMMUNITY_CATEGORY_LABELS: Record<string, string> = {
  free: '자유게시판',
  advice: '질문/조언',
  info: '정보공유',
  humor: '유머',
  daily: '일상',
  career: '커리어',
}

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: '스팸/광고',
  harassment: '괴롭힘/욕설',
  inappropriate: '부적절한 콘텐츠',
  privacy: '개인정보 노출',
  misinformation: '허위정보',
  other: '기타',
}

export const PENALTY_TYPE_LABELS: Record<PenaltyType, string> = {
  warning: '경고',
  temp_ban: '임시 차단',
  permanent_ban: '영구 차단',
}

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: '대기중',
  reviewed: '검토완료',
  action_taken: '조치완료',
  dismissed: '기각',
}

// 카테고리 색상 (폴백용 기본값)
export const COMMUNITY_CATEGORY_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700',
  advice: 'bg-blue-100 text-blue-700',
  info: 'bg-green-100 text-green-700',
  humor: 'bg-yellow-100 text-yellow-700',
  daily: 'bg-purple-100 text-purple-700',
  career: 'bg-orange-100 text-orange-700',
}

// 동적 카테고리 헬퍼: CommunityCategoryItem[] → Record<string, string> 변환
export function buildCategoryLabels(categories: CommunityCategoryItem[]): Record<string, string> {
  const labels: Record<string, string> = {}
  categories.forEach((cat) => { labels[cat.slug] = cat.label })
  return labels
}

export function buildCategoryColors(categories: CommunityCategoryItem[]): Record<string, string> {
  const colors: Record<string, string> = {}
  categories.forEach((cat) => { colors[cat.slug] = `${cat.color_bg} ${cat.color_text}` })
  return colors
}
