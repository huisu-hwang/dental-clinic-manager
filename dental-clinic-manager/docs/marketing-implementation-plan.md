# 마케팅 자동화 시스템 - 상세 구현 계획

> 프로젝트: dental-clinic-manager 마케팅 모듈
> 작성일: 2026-03-17
> 기획안: [marketing-automation-plan.md](./marketing-automation-plan.md)
> SEO 가이드: [naver-blog-guidelines.md](./naver-blog-guidelines.md)

---

## 전체 구현 로드맵

```
Phase 1: 기반 구축 (MVP)        → DB + 타입 + 프롬프트 관리 + 글 생성 + 블로그 발행
Phase 2: 이미지 & 품질           → 나노바나나2 + 논문인용 + 팩트체크 + 의료법검증
Phase 3: 캘린더 & 스케줄         → AI 캘린더 생성 + 승인 UI + 자동 스케줄러
Phase 4: 멀티 플랫폼             → 인스타/페이스북/쓰레드 API + 자동 변환
Phase 5: 공지글 & 임상글         → 템플릿 + 임상사진 처리 + 원장 승인
Phase 6: 고도화                  → 키워드 자동 조사 + 성과 추적 + A/B 테스트
```

---

## Phase 1: 기반 구축 (MVP)

### 1-1. 데이터베이스 테이블 생성

**파일:** `supabase/migrations/20260318_marketing_tables.sql`

```sql
-- 1. 플랫폼 설정
CREATE TABLE marketing_platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id),
  platform VARCHAR(20) NOT NULL,
  enabled BOOLEAN DEFAULT FALSE,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, platform)
);

-- 2. 프롬프트 관리
CREATE TABLE marketing_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id),
  category VARCHAR(20) NOT NULL,
  prompt_key VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  system_prompt TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, prompt_key, version)
);

-- 3. 프롬프트 변경 이력
CREATE TABLE marketing_prompt_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID REFERENCES marketing_prompts(id),
  prompt_key VARCHAR(50) NOT NULL,
  version INTEGER NOT NULL,
  previous_content TEXT,
  new_content TEXT,
  changed_by UUID REFERENCES users(id),
  change_note TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 콘텐츠 캘린더
CREATE TABLE content_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 캘린더 항목
CREATE TABLE content_calendar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id UUID REFERENCES content_calendars(id) ON DELETE CASCADE,
  publish_date DATE NOT NULL,
  publish_time TIME NOT NULL,
  title VARCHAR(200) NOT NULL,
  topic TEXT,
  keyword VARCHAR(100),
  post_type VARCHAR(20) NOT NULL,
  tone VARCHAR(20) DEFAULT 'friendly',
  use_research BOOLEAN DEFAULT FALSE,
  fact_check BOOLEAN DEFAULT FALSE,
  platforms JSONB DEFAULT '{"naverBlog": true}',
  status VARCHAR(20) DEFAULT 'proposed',
  generated_content TEXT,
  generated_images JSONB,
  published_urls JSONB,
  fail_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 임상글 사진
CREATE TABLE clinical_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES content_calendar_items(id) ON DELETE CASCADE,
  photo_type VARCHAR(20) NOT NULL,
  file_path TEXT NOT NULL,
  caption TEXT,
  patient_consent BOOLEAN DEFAULT FALSE,
  anonymized BOOLEAN DEFAULT FALSE,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 발행 로그
CREATE TABLE content_publish_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES content_calendar_items(id),
  platform VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  published_url TEXT,
  error_message TEXT,
  duration_seconds INTEGER,
  published_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. 키워드 발행 이력
CREATE TABLE keyword_publish_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id),
  keyword VARCHAR(100) NOT NULL,
  published_at DATE NOT NULL,
  item_id UUID REFERENCES content_calendar_items(id),
  UNIQUE(clinic_id, keyword, published_at)
);

-- RLS 정책
ALTER TABLE marketing_platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_prompt_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_publish_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_publish_history ENABLE ROW LEVEL SECURITY;
```

**실행:** `mcp__supabase__apply_migration` (프로젝트 ID: `beahjntkmkfhpcbhfnrr`)

### 1-2. TypeScript 타입 정의

**파일:** `src/types/marketing.ts`

```typescript
// ─── 글 유형 ───
export type PostType = 'informational' | 'promotional' | 'notice' | 'clinical';

// ─── 어투 ───
export type ToneType = 'friendly' | 'polite' | 'casual' | 'expert' | 'warm';

// ─── 플랫폼 ───
export interface PlatformOptions {
  naverBlog: boolean;
  instagram: boolean;
  facebook: boolean;
  threads: boolean;
}

// ─── 공지글 템플릿 ───
export type NoticeTemplate = 'holiday' | 'schedule' | 'event' | 'equipment' | 'staff' | 'general';

// ─── 글 생성 옵션 (통합) ───
export interface ContentGenerateOptions {
  topic: string;
  keyword: string;
  postType: PostType;
  tone: ToneType;
  useResearch: boolean;
  factCheck: boolean;
  platforms: PlatformOptions;
  schedule: {
    publishAt?: Date;
    snsDelayMinutes: number;
  };
  clinical?: ClinicalInput;
  notice?: NoticeInput;
}

// ─── 임상글 입력 ───
export interface ClinicalInput {
  procedureType: string;
  procedureDetail?: string;
  duration?: string;
  photos: ClinicalPhoto[];
  patientAge?: string;
  patientGender?: string;
  chiefComplaint?: string;
  patientConsent: boolean;
  includePrice: boolean;
}

export interface ClinicalPhoto {
  type: 'before' | 'after' | 'process' | 'xray';
  file: File;
  caption?: string;
}

// ─── 공지글 입력 ───
export interface NoticeInput {
  template: NoticeTemplate;
  templateData: Record<string, string>;
}

// ─── 팩트체크 결과 ───
export interface FactCheckResult {
  claim: string;
  verdict: 'verified' | 'unverified' | 'incorrect' | 'outdated';
  source?: string;
  suggestion?: string;
  confidence: number;
}

// ─── 의료법 검증 결과 ───
export interface MedicalLawCheckResult {
  forbiddenWords: { word: string; position: number }[];
  exaggeration: boolean;
  guaranteedResult: boolean;
  priceComparison: boolean;
  hasDisclaimer: boolean;
  hasConsentFlag: boolean;
  isAnonymized: boolean;
  passed: boolean;
}

// ─── 플랫폼별 변환 결과 ───
export interface PlatformContent {
  naverBlog?: { title: string; body: string; images: ImageFile[]; hashtags: string[] };
  instagram?: { caption: string; images: ImageFile[]; hashtags: string[]; location?: string };
  facebook?: { message: string; link?: string; images?: ImageFile[]; hashtags: string[] };
  threads?: { text: string; image?: ImageFile; link?: string };
}

// ─── 이미지 ───
export interface ImageFile {
  buffer: Buffer;
  path: string;
  fileName: string;       // 한글 파일명
  prompt: string;         // 생성 프롬프트
  platform: string;       // 대상 플랫폼
  width: number;
  height: number;
}

// ─── 캘린더 ───
export type CalendarStatus = 'draft' | 'pending_approval' | 'approved' | 'in_progress' | 'completed';
export type CalendarItemStatus =
  | 'proposed' | 'approved' | 'rejected' | 'modified'
  | 'generating' | 'review' | 'scheduled'
  | 'publishing' | 'published' | 'failed';

export interface ContentCalendar {
  id: string;
  clinicId: string;
  periodStart: string;
  periodEnd: string;
  status: CalendarStatus;
  items: ContentCalendarItem[];
  createdAt: Date;
  approvedAt?: Date;
  approvedBy?: string;
}

export interface ContentCalendarItem {
  id: string;
  calendarId: string;
  publishDate: string;
  publishTime: string;
  title: string;
  topic: string;
  keyword: string;
  postType: PostType;
  tone: ToneType;
  useResearch: boolean;
  factCheck: boolean;
  platforms: PlatformOptions;
  status: CalendarItemStatus;
  generatedContent?: string;
  generatedImages?: ImageFile[];
  publishedUrls?: Partial<Record<string, string>>;
  failReason?: string;
}

// ─── 프롬프트 관리 ───
export type PromptCategory = 'content' | 'image' | 'transform' | 'quality';

export interface MarketingPrompt {
  id: string;
  clinicId: string;
  category: PromptCategory;
  promptKey: string;
  name: string;
  systemPrompt: string;
  variables: string[];
  version: number;
  isActive: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── 플랫폼 설정 ───
export interface PlatformSettingConfig {
  naverBlog: { enabled: boolean; loginMethod: 'cookie' | 'credential'; blogId: string };
  instagram: { enabled: boolean; connected: boolean; accountId?: string };
  facebook: { enabled: boolean; connected: boolean; pageId?: string; pageName?: string };
  threads: { enabled: boolean; connected: boolean; userId?: string };
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
```

### 1-3. 기본 프롬프트 시드 데이터

**파일:** `src/lib/marketing/default-prompts.ts`

초기 설치 시 DB에 삽입할 기본 프롬프트 14종:

| 키 | 카테고리 | 용도 |
|----|--------|------|
| `content.informational` | content | 정보성 글 생성 |
| `content.promotional` | content | 홍보성 글 생성 |
| `content.notice.holiday` | content | 휴진 공지 |
| `content.notice.schedule` | content | 진료시간 변경 |
| `content.notice.event` | content | 이벤트 공지 |
| `content.notice.equipment` | content | 장비 도입 공지 |
| `content.notice.staff` | content | 인사/채용 공지 |
| `content.notice.general` | content | 일반 공지 |
| `content.clinical` | content | 임상글 생성 |
| `image.blog` | image | 블로그 이미지 프롬프트 |
| `image.carousel` | image | 인스타 캐러셀 이미지 |
| `image.filename` | image | 한글 파일명 생성 |
| `transform.instagram` | transform | 블로그→인스타 변환 |
| `transform.facebook` | transform | 블로그→페이스북 변환 |
| `transform.threads` | transform | 블로그→쓰레드 변환 |
| `quality.factcheck` | quality | 팩트체크 |
| `quality.medical_law` | quality | 의료법 검증 |
| `quality.research` | quality | 논문 인용 생성 |

각 프롬프트에 네이버 SEO 가이드라인 규칙 내장:
- 제목: 키워드 앞쪽 배치, 간결, 서브키워드 최소화
- 본문: 1,000자+, 키워드 3~5회 자연 배치
- 금지 키워드 목록: 후기, 효과, 추천, 최저, 1위 등
- 어투별 스타일 지시문 (5종 각각 별도 프롬프트 섹션)

### 1-4. AI 글 생성 엔진

**파일:** `src/lib/marketing/content-generator.ts`

```
구현 내용:
1. Claude API 호출 래퍼
2. 프롬프트 로딩 (DB에서 활성 프롬프트 조회)
3. 변수 치환 ({{keyword}}, {{topic}}, {{tone}} 등)
4. 어투 적용 로직
5. 섹션별 [IMAGE: 설명] 마커 자동 삽입
6. 금지 키워드 자동 필터링 (생성 후 검증)
7. 글자수 검증 (1,000자 미만 시 재생성)
8. 결과 파싱 (title, body, imageMarkers[] 분리)
```

**의존성:** `@anthropic-ai/sdk`

**핵심 함수:**
```typescript
generateContent(options: ContentGenerateOptions): Promise<GeneratedContent>
applyTone(content: string, tone: ToneType): string
validateSEORules(content: GeneratedContent): SEOValidationResult
filterForbiddenKeywords(text: string): { cleaned: string; found: string[] }
```

### 1-5. 네이버 블로그 자동 발행 (Playwright)

**파일:** `marketing-worker/publisher/naver-blog-publisher.ts`

```
구현 내용:
1. 브라우저 인스턴스 관리 (launch, context, page)
2. 네이버 로그인 (쿠키 방식 / credential 방식)
3. 글쓰기 페이지 진입
4. 팝업 처리 (임시저장 알림 등)
5. 카테고리 선택
6. 제목 입력 (타이핑 시뮬레이션)
7. 본문 입력 (타이핑 시뮬레이션 + 문단별 이미지 삽입)
8. 이미지 삽입 (클립보드 붙여넣기 / 파일 업로드 폴백)
9. 해시태그 입력
10. 발행 버튼 클릭
11. 발행 완료 확인 + URL 추출
```

**파일:** `marketing-worker/typing-simulator.ts`

```
구현 내용:
1. humanType() - 글자별 10~50ms 랜덤 딜레이
2. typeParagraph() - 문단 사이 1~3초 랜덤 휴식
3. randomDelay() - 범위 기반 랜덤 대기
4. DELAYS 상수 (각 동작별 min/max 대기시간)
5. switchToEditorFrame() - iframe 전환 + 대기
6. switchToMainFrame() - 메인 전환 + 대기
```

**체류시간 확보 핵심 규칙:**
```
글자 딜레이:        10~50ms / 글자
문단 딜레이:        1~3초
동작 전환 딜레이:   1.5~3.5초
iframe 전환 딜레이: 1.5~3.5초
1건 총 소요시간:    5~10분
하루 최대:          3건
발행 간격:          최소 30분~1시간
```

**이미지 삽입 (1순위: 클립보드 붙여넣기):**
```typescript
async function pasteImage(page: Page, imagePath: string) {
  await page.click('.se-text-paragraph');
  // base64 → Blob → ClipboardItem → paste 이벤트 디스패치
  // iframe 내부에서 실행
  await page.waitForSelector('.se-image-resource', { timeout: 30000 });
}
```

**의존성:** `playwright`

### 1-6. 프롬프트 관리 UI (마스터 전용)

**파일:**
```
src/app/master/marketing/prompts/page.tsx            # 프롬프트 대시보드
src/app/master/marketing/prompts/content/page.tsx     # 글 생성 프롬프트 편집
src/app/master/marketing/prompts/image/page.tsx       # 이미지 생성 프롬프트 편집
src/app/master/marketing/prompts/transform/page.tsx   # 플랫폼 변환 프롬프트 편집
src/app/master/marketing/prompts/history/page.tsx     # 변경 이력
src/app/master/marketing/prompts/test/page.tsx        # 테스트 샌드박스
src/components/marketing/PromptEditor.tsx             # 프롬프트 에디터 컴포넌트
src/components/marketing/PromptTestSandbox.tsx        # 테스트 샌드박스 컴포넌트
src/components/marketing/PromptVersionDiff.tsx        # 버전 비교 diff 뷰
```

```
구현 내용:
1. 카테고리별 프롬프트 목록 (content/image/transform/quality 탭)
2. 코드 에디터 (구문 강조, {{변수}} 자동완성)
3. 실시간 편집 + 저장
4. 버전 관리 (저장 시 자동 버전 증가)
5. 이전 버전 복원
6. 변경 이력 (diff 형태로 확인)
7. 테스트 샌드박스:
   - 주제/키워드/어투 입력
   - 수정한 프롬프트로 즉시 샘플 생성
   - 결과 분석 (글자수, 키워드 횟수, 금지표현 검출)
   - A/B 비교 (두 버전 동시 생성)
8. 권한: master 계정만 접근 가능 (middleware에서 체크)
```

### 1-7. 관리 UI 기본 레이아웃

**파일:**
```
src/app/admin/marketing/page.tsx                     # 대시보드
src/app/admin/marketing/layout.tsx                   # 마케팅 레이아웃 (사이드바)
src/app/admin/marketing/posts/page.tsx               # 글 목록
src/app/admin/marketing/posts/new/page.tsx           # 새 글 작성
src/app/admin/marketing/settings/page.tsx            # 플랫폼 설정
src/components/marketing/MarketingNav.tsx             # 마케팅 네비게이션
src/components/marketing/PostList.tsx                 # 글 목록 컴포넌트
src/components/marketing/PostForm.tsx                 # 글 작성 폼
src/components/marketing/PlatformSelector.tsx         # 플랫폼 선택 체크박스
src/components/marketing/ToneSelector.tsx             # 어투 선택 드롭다운
```

**글 작성 폼 구성요소:**
```
┌─ 기본 정보 ─────────────────────────────┐
│ 주제:     [텍스트 입력]                    │
│ 키워드:   [텍스트 입력]                    │
│ 글 유형:  [정보성 ▼]                      │
│ 어투:     [친근체 ▼]                      │
├─ 품질 옵션 ─────────────────────────────┤
│ ☐ 논문 인용     ☐ 팩트체크                │
├─ 배포 플랫폼 ───────────────────────────┤
│ ☑ 네이버블로그  ☑ 인스타  ☐ 페이스북  ☑ 쓰레드 │
├─ 발행 스케줄 ───────────────────────────┤
│ ○ 즉시 발행    ● 예약 발행 [날짜][시간]    │
│ SNS 지연: [30]분                         │
└──────────────────────────────────────┘
```

### 1-8. API 라우트

**파일:**
```
src/app/api/marketing/generate/route.ts      # POST: 글 생성
src/app/api/marketing/publish/route.ts       # POST: 수동 발행 트리거
src/app/api/marketing/posts/route.ts         # GET: 글 목록, POST: 글 저장
src/app/api/marketing/posts/[id]/route.ts    # GET/PUT/DELETE: 개별 글
src/app/api/marketing/prompts/route.ts       # GET/POST: 프롬프트 관리
src/app/api/marketing/prompts/[id]/route.ts  # PUT: 프롬프트 수정
src/app/api/marketing/prompts/test/route.ts  # POST: 프롬프트 테스트
src/app/api/marketing/settings/route.ts      # GET/PUT: 플랫폼 설정
```

### 1-9. 워커 기본 구조

**파일:** `marketing-worker/`

```
marketing-worker/
├── package.json                     # playwright, @anthropic-ai/sdk 등
├── tsconfig.json
├── index.ts                         # 워커 엔트리포인트
├── config.ts                        # 환경변수/설정
├── publisher/
│   └── naver-blog-publisher.ts      # Playwright 블로그 발행
├── typing-simulator.ts              # 타이핑 시뮬레이션
└── utils/
    └── delay.ts                     # randomDelay, DELAYS 상수
```

**실행 환경:** Mac mini M4 (기존 scraping-worker와 동일 머신)

---

## Phase 2: 이미지 & 품질

### 2-1. AI 이미지 생성 (나노바나나 2)

**파일:** `src/lib/marketing/image-generator.ts`

```
구현 내용:
1. Gemini 3.1 Flash Image API 호출
2. 본문의 [IMAGE: 설명] 마커 파싱 → 이미지 프롬프트 추출
3. 이미지 생성 (글당 3~7장)
4. 한글 파일명 생성 (Claude Haiku API로 프롬프트 → 파일명 변환)
5. 임시 파일 저장
6. 동일 프롬프트 중복 방지 (캐시 체크)
```

**의존성:** `@google/genai`

**핵심 함수:**
```typescript
generateBlogImage(prompt: string): Promise<ImageFile>
generateImageFileName(prompt: string): Promise<string>   // 한글 파일명
parseImageMarkers(body: string): ImageMarker[]
```

### 2-2. 이미지 프로세서

**파일:** `marketing-worker/image-processor.ts`

```
구현 내용:
1. 플랫폼별 크롭/리사이즈
   - 네이버 블로그: 원본 그대로 (가로형)
   - 인스타그램: 1080x1080 (1:1) 또는 1080x1350 (4:5)
   - 페이스북: 1200x630 (OG 이미지)
   - 쓰레드: 1080x1080 (1:1)
2. 워터마크 삽입 (옵션, 임상글용)
3. 얼굴 모자이크 (임상글 환자 사진)
4. 밝기/대비 자동 보정 (임상 사진)
```

**의존성:** `sharp` (이미지 처리)

### 2-3. 논문 인용 기능

**파일:** `src/lib/marketing/research-citation.ts`

```
구현 내용:
1. 키워드 → 검색 쿼리 생성
2. 논문 검색 API 호출
   - Google Scholar (SerpAPI)
   - PubMed (NCBI E-utilities) - 치과/의료 논문
   - KCI Open API - 국내 논문
3. 관련도 순 정렬 → 상위 2~3편 선별
4. 핵심 결과 추출
5. 쉬운 말로 풀어쓰기 (Claude API 활용)
6. 본문에 자연스럽게 삽입
7. 글 하단 출처 목록 생성
```

**의존성:** `serpapi` (또는 직접 HTTP 호출)

### 2-4. 팩트체크 기능

**파일:** `src/lib/marketing/fact-checker.ts`

```
구현 내용:
1. 본문에서 사실 주장 추출 (수치, 통계, 의학적 주장)
   → Claude API로 주장 문장 리스트 추출
2. 각 주장을 검증 소스와 대조
   - 대한치과의사협회
   - 국민건강보험공단
   - 학술 논문 DB
   - 식약처
   - 건강보험심사평가원
3. 검증 등급 판정: verified / unverified / incorrect / outdated
4. 결과 리포트 생성 (FactCheckResult[])
5. 자동 조치:
   - incorrect → 수정 제안 생성 + 자동 교체
   - unverified → "~로 알려져 있습니다" 완화 표현 적용
   - outdated → 최신 데이터 검색 + 업데이트
```

### 2-5. 의료법 자동 검증

**파일:** `src/lib/marketing/medical-law-checker.ts`

```
구현 내용:
1. 금지 표현 스캔: "최고", "최초", "유일", "100%", "보장" 등
2. 상업 금지 키워드 스캔: 후기, 효과, 효능, 추천, 최저, 1위 등
3. 과장 광고 패턴 감지
4. 결과 보장 표현 감지 ("반드시", "확실히", "무조건")
5. 타 병원 비용 비교 감지
6. 면책 문구 존재 여부 확인
7. 환자 동의 플래그 확인 (임상글)
8. 익명화 완료 확인 (임상글)
9. 종합 판정 (passed/failed + 상세 사유)
10. 자동 수정 제안
```

---

## Phase 3: 캘린더 & 스케줄

### 3-1. AI 캘린더 자동 생성

**파일:** `src/lib/marketing/calendar-generator.ts`

```
구현 내용:
1. 기간/빈도/비율 입력 받기
2. 기존 발행 이력 조회 (keyword_publish_history)
   → 이미 사용한 키워드 제외
3. 계절/시기 반영 키워드 제안
   → Claude API로 "3월 치과 관련 추천 주제" 생성
4. 정보성:홍보성 = 2:1 비율 자동 배분
5. 글 유형별 기본 플랫폼 프리셋 적용
6. 같은 키워드 최소 2주 간격 배치
7. 하루 최대 3건, 발행 간격 30분+ 준수
8. 주말/공휴일 건너뛰기 (설정에 따라)
9. 캘린더 항목 생성 (proposed 상태)
10. pending_approval 상태로 전환 → 승인 요청 알림
```

### 3-2. 캘린더 승인 UI

**파일:**
```
src/app/admin/marketing/calendar/page.tsx              # 캘린더 메인 (주간/월간 뷰)
src/app/admin/marketing/calendar/[id]/page.tsx         # 캘린더 상세/승인
src/components/marketing/CalendarView.tsx               # 캘린더 뷰 (주간/월간)
src/components/marketing/CalendarItem.tsx               # 개별 항목 카드
src/components/marketing/CalendarItemEditor.tsx         # 항목 수정 모달
src/components/marketing/CalendarBulkActions.tsx        # 전체승인/거절
```

```
구현 내용:
1. 주간/월간 뷰 전환
2. 각 항목 카드: 제목, 키워드, 유형, 어투, 플랫폼, 상태
3. 개별 승인/수정/거절 버튼
4. 전체 승인/거절 벌크 액션
5. 드래그 앤 드롭으로 날짜 이동
6. 수정 모달: 제목, 키워드, 어투, 플랫폼 등 편집
7. 임상글 표시: 사진 업로드 필요 알림, 원장 승인 필요 뱃지
8. 상태 뱃지: proposed(회색), approved(초록), rejected(빨강), published(파랑)
```

### 3-3. 자동 발행 스케줄러

**파일:** `marketing-worker/scheduler.ts`

```
구현 내용:
1. cron 기반 매 5분 실행
2. Supabase에서 approved + 발행시간 도달 항목 조회
3. 순차 처리 파이프라인:
   a. status → 'generating'
   b. 키워드 조사 (Phase 6에서 자동화, 초기에는 수동 키워드 사용)
   c. AI 본문 생성 (content-generator)
   d. AI 이미지 생성 (image-generator) - Phase 2 이후
   e. 논문 인용 삽입 (옵션) - Phase 2 이후
   f. 팩트체크 (옵션) - Phase 2 이후
   g. 의료법 검증 (해당 시) - Phase 2 이후
   h. status → 'review' (임상글만)
   i. status → 'scheduled'
   j. 네이버 블로그 발행 (naver-blog-publisher)
   k. SNS 발행 (Phase 4 이후)
   l. status → 'published', URL 저장
   m. 발행 로그 기록 (content_publish_logs)
   n. 키워드 이력 기록 (keyword_publish_history)
4. 에러 처리: status → 'failed', failReason 기록
5. 재시도 로직: 실패 시 10분 후 1회 재시도
6. 관리자 알림 (성공/실패)
```

**의존성:** `node-cron` 또는 `cron` 패키지

### 3-4. 알림 시스템

**파일:** `src/lib/marketing/notification.ts`

```
구현 내용:
1. 앱 내 알림 (기존 알림 시스템 활용)
2. 알림 종류:
   - 캘린더 생성 → 승인 요청
   - 발행 성공/실패
   - 임상글 원장 검토 요청
   - 플랫폼 토큰 만료 경고
3. 주간 리포트 생성 (WeeklyReport 인터페이스)
```

### 3-5. API 라우트 (캘린더)

**파일:**
```
src/app/api/marketing/calendar/route.ts              # GET: 목록, POST: 생성 요청
src/app/api/marketing/calendar/[id]/route.ts          # GET/PUT/DELETE
src/app/api/marketing/calendar/[id]/approve/route.ts  # POST: 전체 승인
src/app/api/marketing/calendar/[id]/items/route.ts    # GET: 항목 목록
src/app/api/marketing/calendar/items/[id]/route.ts    # PUT: 개별 항목 수정
src/app/api/marketing/calendar/items/[id]/approve/route.ts  # POST: 개별 승인
src/app/api/marketing/calendar/items/[id]/reject/route.ts   # POST: 개별 거절
```

---

## Phase 4: 멀티 플랫폼

### 4-1. 플랫폼별 콘텐츠 변환

**파일:**
```
src/lib/marketing/platform-adapters/naver-blog.ts    # 원본 그대로
src/lib/marketing/platform-adapters/instagram.ts     # 300~500자 요약 + 캐러셀
src/lib/marketing/platform-adapters/facebook.ts      # 500~800자 요약 + 링크
src/lib/marketing/platform-adapters/threads.ts       # 핵심 한 줄 + CTA
```

**각 어댑터 구현 내용:**

**instagram.ts:**
```
1. 블로그 본문 → 300~500자 요약 (Claude API, transform.instagram 프롬프트)
2. 핵심 포인트 3~5개 불릿 추출
3. 해시태그 15~20개 생성
4. 이미지 → 1:1 또는 4:5 비율 크롭
5. 캐러셀 구성:
   - 1장: 표지 (제목 텍스트 이미지)
   - 2~5장: 핵심 포인트별 이미지
   - 마지막: CTA ("프로필 링크에서 자세히")
6. 위치 태그: "하얀치과"
```

**facebook.ts:**
```
1. 블로그 본문 → 500~800자 요약 (transform.facebook 프롬프트)
2. 블로그 URL 포함 (Open Graph 미리보기)
3. 해시태그 3~5개
4. 대표 이미지 1~3장 (1200x630 OG 규격)
5. 공유 유도 문구 추가
```

**threads.ts:**
```
1. 핵심 한 줄 추출 (transform.threads 프롬프트)
2. 호기심 유발 문구
3. 블로그 URL
4. 대표 이미지 1장 (1:1)
5. 해시태그 5~10개
```

### 4-2. Meta Graph API 연동

**파일:** `marketing-worker/publisher/meta-publisher.ts`

```
구현 내용:
1. Meta Business 계정 OAuth 연동
2. 장기 토큰 발급/갱신
3. 인스타그램 발행:
   - 단일 이미지: /media → /media_publish
   - 캐러셀: /media (각 이미지) → /media (캐러셀 컨테이너) → /media_publish
4. 페이스북 페이지 발행:
   - /feed (텍스트 + 링크)
   - /photos (이미지 첨부)
5. 발행 결과 URL 추출
6. 에러 처리 (토큰 만료, Rate Limit 등)
```

**의존성:** 직접 HTTP 호출 (`fetch`) - 별도 SDK 불필요

### 4-3. Threads API 연동

**파일:** `marketing-worker/publisher/threads-publisher.ts`

```
구현 내용:
1. Threads API OAuth 연동
2. 텍스트 포스트 생성
3. 이미지 포스트 생성 (이미지 URL 필요 → Supabase Storage 업로드 후 URL 사용)
4. 발행 결과 URL 추출
```

### 4-4. 배포 오케스트레이터

**파일:** `marketing-worker/publisher/publish-orchestrator.ts`

```
구현 내용:
1. 플랫폼별 변환 (platform-adapters 호출)
2. 이미지 리사이즈 (image-processor 호출)
3. 순차 배포:
   a. 네이버 블로그 (Playwright, 5~10분)
   b. 대기 (snsDelayMinutes, 기본 30분)
   c. 인스타그램 (Graph API)
   d. 페이스북 (Graph API)
   e. 쓰레드 (Threads API)
4. 각 플랫폼 발행 결과 로그 기록
5. 실패 시 해당 플랫폼만 재시도 (다른 플랫폼 영향 없음)
6. 전체 완료 시 publishedUrls 업데이트
```

### 4-5. 플랫폼 설정 UI

**파일:**
```
src/app/admin/marketing/settings/page.tsx              # 설정 메인
src/app/admin/marketing/settings/platforms/page.tsx     # 플랫폼별 상세
src/components/marketing/PlatformSettingCard.tsx        # 플랫폼 설정 카드
src/components/marketing/MetaOAuthButton.tsx            # Meta 계정 연동 버튼
src/components/marketing/NaverLoginConfig.tsx           # 네이버 로그인 설정
```

```
구현 내용:
1. 플랫폼별 활성화/비활성화 토글
2. 네이버 블로그: 로그인 방식 선택 (쿠키/credential), 블로그 ID 입력
3. 인스타/페이스북: Meta OAuth 연동 버튼, 연동 상태 표시
4. 쓰레드: Threads OAuth 연동 버튼
5. 토큰 만료 경고 표시
6. 연결 테스트 버튼
7. 글 유형별 기본 플랫폼 프리셋 설정
```

---

## Phase 5: 공지글 & 임상글

### 5-1. 병원 공지글 템플릿 시스템

**파일:**
```
src/components/marketing/notice/NoticeTemplateSelector.tsx  # 템플릿 선택
src/components/marketing/notice/HolidayNoticeForm.tsx       # 휴진 공지 폼
src/components/marketing/notice/ScheduleNoticeForm.tsx      # 진료시간 변경 폼
src/components/marketing/notice/EventNoticeForm.tsx         # 이벤트 폼
src/components/marketing/notice/EquipmentNoticeForm.tsx     # 장비 도입 폼
src/components/marketing/notice/StaffNoticeForm.tsx         # 인사/채용 폼
src/components/marketing/notice/GeneralNoticeForm.tsx       # 일반 공지 폼
```

```
구현 내용:
1. 6가지 템플릿 선택 화면
2. 템플릿별 입력 폼 (필수 정보만)
   - holiday: 연휴명, 휴진기간, 재개일, 응급연락처
   - schedule: 변경 내용, 적용일, 변경 이유
   - event: 이벤트명, 기간, 내용, 조건
   - equipment: 장비명, 도입일, 효과/혜택
   - staff: 이름, 직위, 전공, 인사말
   - general: 제목, 내용
3. AI 공지문 생성 (해당 notice 프롬프트 사용)
4. 병원 사진 직접 첨부 (이미지 업로드)
5. 미리보기
6. 검색허용 해제 옵션 (기본 해제 권장)
7. 배포 플랫폼 선택 (기본: 블로그만)
```

### 5-2. 임상글 시스템

**파일:**
```
src/app/admin/marketing/posts/clinical/page.tsx         # 임상글 작성
src/components/marketing/clinical/ClinicalPhotoUpload.tsx # 사진 업로드
src/components/marketing/clinical/ClinicalForm.tsx       # 시술 정보 폼
src/components/marketing/clinical/ConsentCheckbox.tsx    # 동의서 확인
src/components/marketing/clinical/ClinicalPreview.tsx    # 미리보기
src/app/admin/marketing/posts/[id]/review/page.tsx      # 원장 검토 페이지
```

```
구현 내용:
1. 임상 사진 업로드 (before/after/process/xray 타입 분류)
2. 사진 자동 처리:
   - 얼굴 모자이크 (구강 부위만 노출)
   - 환자 이름/차트번호 제거
   - 밝기/대비 보정 (옵션)
   - 워터마크 삽입 (옵션)
3. 시술 정보 입력 폼:
   - 시술 종류, 상세, 기간
   - 환자 정보 (익명: 나이대, 성별, 주소)
   - 어투 선택, 논문 인용 여부
4. 환자 동의서 확인 체크박스 (필수)
   - 미체크 시 생성/발행 버튼 비활성화
5. AI 본문 생성 (사진 기반 + 시술 정보 기반)
   → 도입부/진단/치료계획/시술과정/결과&관리 구조
6. 의료법 자동 검증 (필수)
7. 미리보기 (Before↔After 비교 레이아웃)
8. 원장 검토/승인 페이지:
   - 본문 확인/수정
   - 사진 확인
   - 의료법 검증 결과 표시
   - 승인/반려 버튼
```

---

## Phase 6: 고도화

### 6-1. 키워드 자동 조사/제안

**파일:** `src/lib/marketing/keyword-researcher.ts`

```
구현 내용:
1. 네이버 검색어 트렌드 API 연동 (DataLab)
2. 자동 키워드 제안:
   - 치과 업종 관련 정보성 키워드 DB 구축
   - 검색량/경쟁도 자동 분석
   - 로얄키워드 자동 발굴 (꾸준한 검색량 + 적은 문서수 + 정보성)
3. 연관검색어 자동 수집
4. 키워드별 상위 노출 글 3개 벤치마킹 분석
5. 캘린더 생성 시 자동으로 최적 키워드 배정
```

### 6-2. 발행 성과 추적

**파일:**
```
src/app/admin/marketing/reports/page.tsx               # 리포트 메인
src/components/marketing/reports/WeeklyReportCard.tsx   # 주간 리포트
src/components/marketing/reports/KeywordPerformance.tsx  # 키워드 성과
src/components/marketing/reports/PlatformStats.tsx       # 플랫폼별 통계
```

```
구현 내용:
1. 발행 건수 통계 (일/주/월별)
2. 플랫폼별 발행 현황
3. 키워드별 발행 이력
4. 실패율/성공률
5. (가능 시) 네이버 블로그 조회수 스크래핑
6. 주간/월간 자동 리포트 생성
```

### 6-3. A/B 테스트

```
구현 내용:
1. 동일 주제 → 2가지 제목으로 생성
2. 동일 주제 → 2가지 어투로 생성
3. 성과 비교 (조회수, 체류시간)
4. 최적 패턴 학습 → 프롬프트 개선 제안
```

---

## 환경 변수 추가

```env
# AI API Keys
ANTHROPIC_API_KEY=sk-...                    # Claude API (글 생성)
GEMINI_API_KEY=...                          # 나노바나나 2 (이미지 생성)

# 네이버 블로그
NAVER_BLOG_ID=...                           # 블로그 ID
NAVER_LOGIN_COOKIE=...                      # 로그인 쿠키 (또는 credential)

# Meta (인스타/페이스북)
META_ACCESS_TOKEN=...                       # 장기 토큰
META_INSTAGRAM_ACCOUNT_ID=...
META_FACEBOOK_PAGE_ID=...

# Threads
THREADS_ACCESS_TOKEN=...
THREADS_USER_ID=...

# 논문 검색
SERPAPI_KEY=...                             # Google Scholar 검색

# 워커
MARKETING_WORKER_PORT=3001
```

---

## 의존성 패키지

### 메인 앱 (dental-clinic-manager)
```json
{
  "@anthropic-ai/sdk": "latest",
  "@google/genai": "latest"
}
```

### 워커 (marketing-worker)
```json
{
  "playwright": "latest",
  "@anthropic-ai/sdk": "latest",
  "@google/genai": "latest",
  "sharp": "latest",
  "node-cron": "latest",
  "@supabase/supabase-js": "latest"
}
```

---

## 파일 생성 총 목록

### Phase 1 (32개 파일)
```
# DB
supabase/migrations/20260318_marketing_tables.sql

# 타입
src/types/marketing.ts

# 라이브러리
src/lib/marketing/content-generator.ts
src/lib/marketing/default-prompts.ts

# API 라우트
src/app/api/marketing/generate/route.ts
src/app/api/marketing/publish/route.ts
src/app/api/marketing/posts/route.ts
src/app/api/marketing/posts/[id]/route.ts
src/app/api/marketing/prompts/route.ts
src/app/api/marketing/prompts/[id]/route.ts
src/app/api/marketing/prompts/test/route.ts
src/app/api/marketing/settings/route.ts

# 관리 UI
src/app/admin/marketing/page.tsx
src/app/admin/marketing/layout.tsx
src/app/admin/marketing/posts/page.tsx
src/app/admin/marketing/posts/new/page.tsx
src/app/admin/marketing/settings/page.tsx

# 마스터 UI (프롬프트)
src/app/master/marketing/prompts/page.tsx
src/app/master/marketing/prompts/content/page.tsx
src/app/master/marketing/prompts/image/page.tsx
src/app/master/marketing/prompts/transform/page.tsx
src/app/master/marketing/prompts/history/page.tsx
src/app/master/marketing/prompts/test/page.tsx

# 컴포넌트
src/components/marketing/MarketingNav.tsx
src/components/marketing/PostList.tsx
src/components/marketing/PostForm.tsx
src/components/marketing/PlatformSelector.tsx
src/components/marketing/ToneSelector.tsx
src/components/marketing/PromptEditor.tsx
src/components/marketing/PromptTestSandbox.tsx
src/components/marketing/PromptVersionDiff.tsx

# 워커
marketing-worker/package.json
marketing-worker/tsconfig.json
marketing-worker/index.ts
marketing-worker/config.ts
marketing-worker/publisher/naver-blog-publisher.ts
marketing-worker/typing-simulator.ts
marketing-worker/utils/delay.ts
```

### Phase 2 (4개 파일)
```
src/lib/marketing/image-generator.ts
src/lib/marketing/research-citation.ts
src/lib/marketing/fact-checker.ts
src/lib/marketing/medical-law-checker.ts
marketing-worker/image-processor.ts
```

### Phase 3 (12개 파일)
```
src/lib/marketing/calendar-generator.ts
src/lib/marketing/notification.ts
src/app/admin/marketing/calendar/page.tsx
src/app/admin/marketing/calendar/[id]/page.tsx
src/app/api/marketing/calendar/route.ts
src/app/api/marketing/calendar/[id]/route.ts
src/app/api/marketing/calendar/[id]/approve/route.ts
src/app/api/marketing/calendar/[id]/items/route.ts
src/app/api/marketing/calendar/items/[id]/route.ts
src/components/marketing/CalendarView.tsx
src/components/marketing/CalendarItem.tsx
src/components/marketing/CalendarItemEditor.tsx
marketing-worker/scheduler.ts
```

### Phase 4 (10개 파일)
```
src/lib/marketing/platform-adapters/naver-blog.ts
src/lib/marketing/platform-adapters/instagram.ts
src/lib/marketing/platform-adapters/facebook.ts
src/lib/marketing/platform-adapters/threads.ts
src/app/admin/marketing/settings/platforms/page.tsx
src/components/marketing/PlatformSettingCard.tsx
src/components/marketing/MetaOAuthButton.tsx
src/components/marketing/NaverLoginConfig.tsx
marketing-worker/publisher/meta-publisher.ts
marketing-worker/publisher/threads-publisher.ts
marketing-worker/publisher/publish-orchestrator.ts
```

### Phase 5 (14개 파일)
```
src/components/marketing/notice/NoticeTemplateSelector.tsx
src/components/marketing/notice/HolidayNoticeForm.tsx
src/components/marketing/notice/ScheduleNoticeForm.tsx
src/components/marketing/notice/EventNoticeForm.tsx
src/components/marketing/notice/EquipmentNoticeForm.tsx
src/components/marketing/notice/StaffNoticeForm.tsx
src/components/marketing/notice/GeneralNoticeForm.tsx
src/app/admin/marketing/posts/clinical/page.tsx
src/components/marketing/clinical/ClinicalPhotoUpload.tsx
src/components/marketing/clinical/ClinicalForm.tsx
src/components/marketing/clinical/ConsentCheckbox.tsx
src/components/marketing/clinical/ClinicalPreview.tsx
src/app/admin/marketing/posts/[id]/review/page.tsx
```

### Phase 6 (5개 파일)
```
src/lib/marketing/keyword-researcher.ts
src/app/admin/marketing/reports/page.tsx
src/components/marketing/reports/WeeklyReportCard.tsx
src/components/marketing/reports/KeywordPerformance.tsx
src/components/marketing/reports/PlatformStats.tsx
```

**총: 약 77개 파일**

---

**마지막 업데이트: 2026-03-17**
