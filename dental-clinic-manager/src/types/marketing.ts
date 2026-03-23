// ============================================
// 마케팅 자동화 시스템 타입 정의
// ============================================

// ─── 기본 열거형 ───

export type PostType = 'informational' | 'promotional' | 'notice' | 'clinical';

export type ToneType = 'friendly' | 'polite' | 'casual' | 'expert' | 'warm';

export type NoticeTemplate = 'holiday' | 'schedule' | 'event' | 'equipment' | 'staff' | 'general';

export type ImageStyleOption = 'allow_person' | 'use_own_image' | 'infographic_only';

export type PromptCategory = 'content' | 'image' | 'transform' | 'quality';

export type CalendarStatus = 'draft' | 'pending_approval' | 'approved' | 'in_progress' | 'completed';

export type CalendarItemStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'modified'
  | 'generating'
  | 'review'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed';

export type FactCheckVerdict = 'verified' | 'unverified' | 'incorrect' | 'outdated';

// ─── 플랫폼 ───

export interface PlatformOptions {
  naverBlog: boolean;
  instagram: boolean;
  facebook: boolean;
  threads: boolean;
}

export interface PlatformSettingConfig {
  naverBlog: {
    enabled: boolean;
    loginMethod: 'cookie' | 'credential';
    blogId: string;
  };
  instagram: {
    enabled: boolean;
    connected: boolean;
    accountId?: string;
  };
  facebook: {
    enabled: boolean;
    connected: boolean;
    pageId?: string;
    pageName?: string;
  };
  threads: {
    enabled: boolean;
    connected: boolean;
    userId?: string;
  };
}

// ─── DB 모델 ───

export interface MarketingPlatformSetting {
  id: string;
  clinic_id: string;
  platform: string;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MarketingPrompt {
  id: string;
  clinic_id: string;
  category: PromptCategory;
  prompt_key: string;
  name: string;
  system_prompt: string;
  variables: string[];
  version: number;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingPromptHistory {
  id: string;
  prompt_id: string;
  prompt_key: string;
  version: number;
  previous_content: string | null;
  new_content: string | null;
  changed_by: string | null;
  change_note: string | null;
  changed_at: string;
}

export interface ContentCalendar {
  id: string;
  clinic_id: string;
  period_start: string;
  period_end: string;
  status: CalendarStatus;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  items?: ContentCalendarItem[];
}

export interface ContentCalendarItem {
  id: string;
  calendar_id: string;
  publish_date: string;
  publish_time: string;
  title: string;
  topic: string | null;
  keyword: string | null;
  post_type: PostType;
  tone: ToneType;
  use_research: boolean;
  fact_check: boolean;
  platforms: PlatformOptions;
  status: CalendarItemStatus;
  generated_content: string | null;
  generated_images: GeneratedImageMeta[] | null;
  published_urls: Partial<Record<string, string>> | null;
  fail_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClinicalPhoto {
  id: string;
  item_id: string;
  photo_type: 'before' | 'after' | 'process' | 'xray';
  file_path: string;
  caption: string | null;
  patient_consent: boolean;
  anonymized: boolean;
  uploaded_at: string;
}

export interface ContentPublishLog {
  id: string;
  item_id: string;
  platform: string;
  status: 'success' | 'failed';
  published_url: string | null;
  error_message: string | null;
  duration_seconds: number | null;
  published_at: string;
}

export interface KeywordPublishHistory {
  id: string;
  clinic_id: string;
  keyword: string;
  published_at: string;
  item_id: string | null;
}

// ─── 글 생성 옵션 ───

export interface ContentGenerateOptions {
  topic: string;
  keyword: string;
  postType: PostType;
  tone: ToneType;
  useResearch: boolean;
  factCheck: boolean;
  platforms: PlatformOptions;
  imageStyle?: ImageStyleOption;
  imageCount?: number;
  referenceImageBase64?: string;
  schedule: {
    publishAt?: string;
    snsDelayMinutes: number;
  };
  clinical?: ClinicalInput;
  notice?: NoticeInput;
}

export interface ClinicalInput {
  procedureType: string;
  procedureDetail?: string;
  duration?: string;
  patientAge?: string;
  patientGender?: string;
  chiefComplaint?: string;
  patientConsent: boolean;
  includePrice: boolean;
}

export interface NoticeInput {
  template: NoticeTemplate;
  templateData: Record<string, string>;
}

// ─── 생성 결과 ───

export interface GeneratedContent {
  title: string;
  body: string;
  imageMarkers: ImageMarker[];
  hashtags: string[];
  wordCount: number;
  keywordCount: number;
}

export interface ImageMarker {
  position: number;
  prompt: string;
  sectionTitle: string;
}

export interface GeneratedImageMeta {
  fileName: string;
  prompt: string;
  path?: string;
  width?: number;
  height?: number;
}

// ─── 플랫폼별 변환 결과 ───

export interface PlatformContent {
  naverBlog?: NaverBlogContent;
  instagram?: InstagramContent;
  facebook?: FacebookContent;
  threads?: ThreadsContent;
}

export interface NaverBlogContent {
  title: string;
  body: string;
  images: GeneratedImageMeta[];
  hashtags: string[];
}

export interface InstagramContent {
  caption: string;
  images: GeneratedImageMeta[];
  hashtags: string[];
  location?: string;
}

export interface FacebookContent {
  message: string;
  link?: string;
  images?: GeneratedImageMeta[];
  hashtags: string[];
}

export interface ThreadsContent {
  text: string;
  image?: GeneratedImageMeta;
  link?: string;
}

// ─── 품질 검증 ───

export interface FactCheckResult {
  claim: string;
  verdict: FactCheckVerdict;
  source?: string;
  suggestion?: string;
  confidence: number;
}

export interface MedicalLawCheckResult {
  forbiddenWords: { word: string; position: number }[];
  exaggeration: boolean;
  guaranteedResult: boolean;
  priceComparison: boolean;
  hasDisclaimer: boolean;
  hasConsentFlag: boolean;
  isAnonymized: boolean;
  passed: boolean;
  details: string[];
}

export interface SEOValidationResult {
  titleHasKeyword: boolean;
  keywordAtFront: boolean;
  bodyLength: number;
  bodyLengthPassed: boolean;
  keywordCount: number;
  keywordCountPassed: boolean;
  forbiddenKeywordsFound: string[];
  passed: boolean;
}

// ─── 주간 리포트 ───

export interface WeeklyReport {
  period: string;
  totalPlanned: number;
  published: number;
  failed: number;
  platformBreakdown: Record<string, number>;
  topKeywords: string[];
  nextWeekPreview: string[];
}

// ─── 어투 라벨 (UI 표시용) ───

export const TONE_LABELS: Record<ToneType, { label: string; description: string }> = {
  friendly: { label: '친근체', description: '~해요, ~거든요 (일상/가벼운 정보글)' },
  polite: { label: '정중체', description: '~합니다, ~드립니다 (전문 정보글)' },
  casual: { label: '구어체', description: '~인데요, ~더라고요 (후기형 글)' },
  expert: { label: '전문가', description: '논문/데이터 기반 (의료 정보)' },
  warm: { label: '공감체', description: '~셨죠?, 걱정되시죠? (환자 불안 해소)' },
};

export const POST_TYPE_LABELS: Record<PostType, string> = {
  informational: '정보성',
  promotional: '홍보성',
  notice: '공지글',
  clinical: '임상글',
};

export const NOTICE_TEMPLATE_LABELS: Record<NoticeTemplate, string> = {
  holiday: '휴진/연휴 안내',
  schedule: '진료시간 변경',
  event: '이벤트/프로모션',
  equipment: '신규 장비/시설',
  staff: '인사/채용',
  general: '일반 공지',
};

export const IMAGE_STYLE_LABELS: Record<ImageStyleOption, { label: string; description: string }> = {
  allow_person: { label: '인물 포함', description: '이미지에 인물(환자, 의사 등) 생성 허용' },
  use_own_image: { label: '본인 이미지 활용', description: '인물 생성 시 업로드한 참조 이미지 활용' },
  infographic_only: { label: '인포그래픽만', description: '도표, 다이어그램 등 정보 시각화 이미지만 생성' },
};

// ─── 금지 키워드 (네이버 SEO) ───

export const FORBIDDEN_COMMERCIAL_KEYWORDS = [
  '후기', '효과', '효능', '카드', '추천', '최초', '최저', '최대',
  '최고', '체험', '제일', '저렴한곳', '완전', '엄청', '신용',
  '무료', '공짜', '가장', '가입', '1위',
];

// ─── 기본 플랫폼 프리셋 ───

export const DEFAULT_PLATFORM_PRESETS: Record<PostType, PlatformOptions> = {
  informational: { naverBlog: true, instagram: true, facebook: false, threads: true },
  promotional: { naverBlog: true, instagram: true, facebook: true, threads: true },
  notice: { naverBlog: true, instagram: false, facebook: false, threads: false },
  clinical: { naverBlog: true, instagram: true, facebook: false, threads: false },
};
