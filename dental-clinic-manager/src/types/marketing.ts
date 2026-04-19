// ============================================
// 마케팅 자동화 시스템 타입 정의
// ============================================

// ─── 기본 열거형 ───

export type PostType = 'informational' | 'promotional' | 'notice' | 'clinical';

export type ToneType = 'friendly' | 'polite' | 'casual' | 'expert' | 'warm';

export type NoticeTemplate = 'holiday' | 'schedule' | 'event' | 'equipment' | 'staff' | 'general';

export type ImageStyleOption = 'allow_person' | 'use_own_image' | 'infographic_only';

export type ImageVisualStyle =
  | 'realistic'
  | 'pixar_3d'
  | 'ghibli'
  | 'flat_illustration'
  | 'watercolor'
  | 'minimal_line';

export type PromptCategory = 'content' | 'image' | 'transform' | 'quality';

export type CalendarStatus = 'draft' | 'pending_approval' | 'approved' | 'in_progress' | 'completed';

// 주제 6축 카테고리 (의료광고법 준수 고려)
export type TopicCategory =
  | 'info'          // 건강 생활정보 (심의 제외)
  | 'symptom'       // 증상/질환 정보성
  | 'treatment'     // 치료법/시술 설명
  | 'cost'          // 비용/보험
  | 'review'        // 후기/사례 (의료광고 심의 고위험)
  | 'clinic_news';  // 원내 소식/의료진

// 환자 여정 단계
export type JourneyStage =
  | 'awareness'       // 인지 (건강정보)
  | 'consideration'   // 검색/검토 (증상·시술)
  | 'decision'        // 결정 (비용·의료진)
  | 'retention';      // 유지 (관리법)

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
  // 주제 기획 v2 필드
  topic_category: TopicCategory | null;
  journey_stage: JourneyStage | null;
  needs_medical_review: boolean;
  planning_rationale: string | null;
  estimated_search_volume: number | null;
  // 발행 후 KPI (calendar API GET 시 enrich됨)
  metrics?: PostMetricsSnapshot[];
  created_at: string;
  updated_at: string;
}

export interface PostMetricsSnapshot {
  platform: string;
  views: number | null;
  comments: number | null;
  likes: number | null;
  scraps: number | null;
  measured_at: string;
}

export type ClinicalPhotoType = 'before' | 'during' | 'after';

export interface ClinicalPhoto {
  id: string;
  item_id: string;
  photo_type: ClinicalPhotoType;
  file_path: string;
  caption: string | null;
  patient_consent: boolean;
  anonymized: boolean;
  sort_order: number;
  uploaded_at: string;
}

export interface ClinicalPhotoInput {
  photo_type: ClinicalPhotoType;
  file_path: string;
  base64: string;
  media_type: string;
  caption: string;
  sort_order: number;
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
  useSeoAnalysis?: boolean;
  platforms: PlatformOptions;
  imageStyle?: ImageStyleOption;
  imageVisualStyle?: ImageVisualStyle;
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
  selectedTeeth?: number[];
  patientConsent: boolean;
  includePrice: boolean;
  photos?: ClinicalPhotoInput[];
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
  bodyHtml: string;          // 네이버 블로그 에디터 호환 HTML
  summary: string;           // 글 요약 (검색 스니펫/메타)
  tags: string[];            // 네이버 블로그 태그 (10개 이내)
  category?: string;         // 네이버 블로그 카테고리명
  disclaimer: string;        // 의료광고 면책 문구 (본문 하단)
  wordCount: number;         // 순수 텍스트 글자 수
  keywordCount: number;      // 핵심 키워드 본문 내 빈도
  images: GeneratedImageMeta[];
  hashtags: string[];
  warnings: string[];        // 검증 경고 (글자수 부족, 키워드 밀도 이상 등)
}

// 네이버 검색광고 API 키워드 인사이트
export interface NaverKeywordInsight {
  keyword: string;
  monthlyPcQc: number;
  monthlyMobileQc: number;
  compIdx: '낮음' | '중간' | '높음' | string;
  relKeywords: string[];
}

// 환자 여정 × 카테고리 매트릭스 슬롯
export interface TopicSlot {
  journeyStage: JourneyStage;
  topicCategory: TopicCategory;
}

// AI 주제 제안 (calendar-generator v2)
export interface TopicProposal {
  title: string;
  topic: string;
  keyword: string;
  tone: ToneType;
  topicCategory: TopicCategory;
  journeyStage: JourneyStage;
  needsMedicalReview: boolean;
  planningRationale: string;
  estimatedSearchVolume: number;
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

// ─── SEO 텍스트 마이닝 결과 ───

export interface SeoKeywordMiningResult {
  competitorKeywords: { keyword: string; frequency: number; postCount: number; perPostFrequency?: number[] }[];
  recommendedKeywords: string[];
  avgBodyLength: number;
  avgImageCount: number;
  avgHeadingCount: number;
  avgKeywordCount: number;
  commonTags: string[];
  titlePatterns: string[];
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

export const TOPIC_CATEGORY_LABELS: Record<TopicCategory, { label: string; color: string; reviewRisk: 'low' | 'medium' | 'high' }> = {
  info:         { label: '건강정보',  color: 'emerald', reviewRisk: 'low' },
  symptom:      { label: '증상/질환',  color: 'sky',     reviewRisk: 'low' },
  treatment:    { label: '치료/시술',  color: 'violet',  reviewRisk: 'medium' },
  cost:         { label: '비용/보험',  color: 'amber',   reviewRisk: 'medium' },
  review:       { label: '후기/사례',  color: 'rose',    reviewRisk: 'high' },
  clinic_news:  { label: '원내소식',   color: 'slate',   reviewRisk: 'low' },
};

export const JOURNEY_STAGE_LABELS: Record<JourneyStage, { label: string; description: string }> = {
  awareness:     { label: '인지',  description: '건강정보 — 잠재 환자 유입' },
  consideration: { label: '검색',  description: '증상·시술 — 정보 탐색 단계' },
  decision:      { label: '결정',  description: '비용·의료진 — 방문 결정 단계' },
  retention:     { label: '유지',  description: '관리법 — 기존 환자 유지' },
};

// 환자 여정 × 월 20개 슬롯 기본 배분 (주 5회 × 4주)
// 총 20 = 인지 8 + 검색 6 + 결정 4 + 유지 2 (40% / 30% / 20% / 10%)
export const DEFAULT_JOURNEY_DISTRIBUTION: Record<JourneyStage, number> = {
  awareness: 40,
  consideration: 30,
  decision: 20,
  retention: 10,
};

// 각 여정 단계에서 선호되는 주제 카테고리
export const JOURNEY_CATEGORY_MAP: Record<JourneyStage, TopicCategory[]> = {
  awareness:     ['info', 'symptom'],
  consideration: ['symptom', 'treatment'],
  decision:      ['cost', 'clinic_news', 'review'],
  retention:     ['info'],
};

export const CLINICAL_PHOTO_TYPE_LABELS: Record<ClinicalPhotoType, string> = {
  before: '술전 (시술 전)',
  during: '술중 (시술 과정)',
  after: '술후 (시술 후)',
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

export const IMAGE_VISUAL_STYLE_LABELS: Record<ImageVisualStyle, { label: string; description: string; emoji: string }> = {
  realistic: { label: '사실적 사진', description: '실제 사진처럼 리얼한 스타일', emoji: '📷' },
  pixar_3d: { label: '3D 캐릭터', description: '픽사/디즈니풍 귀여운 3D 렌더링', emoji: '🎬' },
  ghibli: { label: '지브리풍', description: '스튜디오 지브리 스타일 따뜻한 수채화', emoji: '🎨' },
  flat_illustration: { label: '플랫 일러스트', description: '깔끔한 벡터 스타일 일러스트', emoji: '✏️' },
  watercolor: { label: '수채화', description: '부드러운 수채화 텍스처 아트', emoji: '🖌️' },
  minimal_line: { label: '미니멀 라인아트', description: '심플한 선화 스타일', emoji: '〰️' },
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
