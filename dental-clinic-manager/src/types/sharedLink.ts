// 공유 링크 타입 정의

export type SourceType = 'announcement' | 'document' | 'community_post'
export type AccessLevel = 'authenticated' | 'public'

export interface SharedLink {
  id: string
  token: string
  source_type: SourceType
  source_id: string
  access_level: AccessLevel
  is_active: boolean
  created_by: string | null
  created_at: string
}

export interface CreateSharedLinkDto {
  source_type: SourceType
  source_id: string
  access_level: AccessLevel
}

// 공유 페이지에서 사용할 통합 데이터 타입
export interface SharedPostData {
  source_type: SourceType
  access_level: AccessLevel
  title: string
  content: string
  author_name: string
  created_at: string
  // 문서 전용 필드
  description?: string
  file_url?: string
  file_name?: string
  file_size?: number
  // 공지사항 전용 필드
  category?: string
  is_important?: boolean
  start_date?: string
  end_date?: string
}

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  authenticated: '서비스 가입자만',
  public: '링크를 가진 모든 사람',
}

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  announcement: '공지사항',
  document: '문서',
  community_post: '커뮤니티 게시글',
}
