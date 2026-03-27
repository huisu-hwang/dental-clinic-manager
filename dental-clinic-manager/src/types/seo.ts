// ============================================
// 네이버 블로그 SEO 분석 타입 정의
// ============================================

// --- 정량 분석 항목 (13개) ---
export interface QuantitativeMetrics {
  title: string
  titleLength: number
  keywordPosition: 'front' | 'middle' | 'end' | 'none' // 제목 내 키워드 위치
  bodyLength: number // 본문 글자수
  imageCount: number
  hasVideo: boolean
  videoCount: number
  keywordCount: number // 키워드 반복 횟수
  headingCount: number // 소제목(H태그) 개수
  paragraphCount: number // 문단 수
  externalLinkCount: number
  internalLinkCount: number
  commentCount: number
  likeCount: number // 공감 수
  tagCount: number
  tags: string[]
}

// --- 정성 분석 항목 (10개) ---
export type QualityLevel = 'high' | 'medium' | 'low'
export type ContentPurpose = 'info' | 'review' | 'ad'
export type ImageQuality = 'original' | 'stock' | 'capture' | 'mixed'
export type ContentTone = 'casual' | 'informative' | 'professional'

export interface QualitativeMetrics {
  hasStructure: boolean // 서론-본론-결론 구조
  experienceLevel: QualityLevel // 경험/후기 반영
  originalityLevel: QualityLevel // 독창성
  readabilityLevel: QualityLevel // 가독성
  contentPurpose: ContentPurpose // 글의 목적
  imageQuality: ImageQuality // 이미지 품질
  hasCta: boolean // CTA(행동유도) 존재
  tone: ContentTone // 톤/어조
  hasAdDisclosure: boolean // 광고 표시 여부
  multimediaLevel: QualityLevel // 멀티미디어 활용도
}

// --- 분석된 개별 포스트 ---
export interface AnalyzedPost {
  rank: number // 검색 순위 (1~5)
  postUrl: string
  blogUrl: string
  blogName: string
  quantitative: QuantitativeMetrics
  qualitative: QualitativeMetrics
  bodyText?: string // 본문 텍스트 (비교용, 저장 시 생략 가능)
}

// --- 키워드 분석 결과 ---
export interface KeywordAnalysisResult {
  id: string
  keyword: string
  analyzedAt: string
  analyzedBy: string
  status: 'pending' | 'collecting' | 'analyzing_quantitative' | 'analyzing_qualitative' | 'completed' | 'failed'
  posts: AnalyzedPost[]
  summary?: AnalysisSummary
  errorMessage?: string
}

// --- 통계 요약 ---
export interface AnalysisSummary {
  quantitative: {
    [key in keyof Omit<QuantitativeMetrics, 'title' | 'keywordPosition' | 'hasVideo' | 'tags'>]?: {
      avg: number
      median: number
      min: number
      max: number
    }
  }
  keywordPositionDistribution: Record<string, number> // front: 3, middle: 1, end: 1
  videoRate: number // 동영상 포함 비율 (0~1)
  qualitative: {
    structureRate: number // 서론-본론-결론 비율
    experienceDistribution: Record<QualityLevel, number>
    originalityDistribution: Record<QualityLevel, number>
    readabilityDistribution: Record<QualityLevel, number>
    purposeDistribution: Record<ContentPurpose, number>
    imageQualityDistribution: Record<ImageQuality, number>
    ctaRate: number
    toneDistribution: Record<ContentTone, number>
    adDisclosureRate: number
    multimediaDistribution: Record<QualityLevel, number>
  }
}

// --- GAP 비교 ---
export type GapPriority = 'critical' | 'high' | 'medium' | 'low'

export interface GapItem {
  category: 'quantitative' | 'qualitative'
  item: string // 항목명
  myValue: string | number
  competitorAvg: string | number
  gap: string // 차이 설명
  priority: GapPriority
  suggestion: string // 구체적 개선 제안
}

export interface CompareResult {
  id: string
  keyword: string
  myPostUrl: string
  myPost: AnalyzedPost
  competitors: AnalyzedPost[]
  gaps: GapItem[]
  overallScore: number // 100점 만점
  analyzedAt: string
}

// --- 종합 보고서 ---
export interface SeoReport {
  id: string
  title: string
  analysisIds: string[] // 포함된 키워드 분석 ID 목록
  totalKeywords: number
  totalPosts: number
  generatedAt: string
  overview: string // 분석 개요
  quantitativeInsights: string // 정량 지표 인사이트
  qualitativeInsights: string // 정성 지표 인사이트
  commonPatterns: string[] // 상위 노출 공통 패턴
  recommendations: string[] // 권장 사항
  aggregatedSummary: AnalysisSummary // 전체 통계
}

// --- SEO 잡 (워커용) ---
export type SeoJobType = 'keyword_analysis' | 'competitor_compare'
export type SeoJobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface SeoJob {
  id: string
  jobType: SeoJobType
  status: SeoJobStatus
  params: {
    keyword: string
    myPostUrl?: string // compare 시
  }
  result?: KeywordAnalysisResult | CompareResult
  errorMessage?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  createdBy: string
}

// --- API 요청/응답 ---
export interface AnalyzeRequest {
  keyword: string
}

export interface CompareRequest {
  keyword: string
  myPostUrl: string
}

export interface SeoApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
