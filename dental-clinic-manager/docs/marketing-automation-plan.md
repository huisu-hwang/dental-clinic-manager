# 하얀치과 마케팅 자동화 시스템 기획안

> 프로젝트: dental-clinic-manager 마케팅 모듈
> 작성일: 2026-03-17
> 상태: 기획 단계

---

## 1. 프로젝트 개요

### 1-1. 목표
하얀치과의 네이버 블로그, 인스타그램, 페이스북, 쓰레드 마케팅을
**AI 기반으로 완전 자동화**하는 시스템 구축.

### 1-2. 핵심 가치
- **1개 콘텐츠 → 4개 플랫폼 자동 배포**
- AI가 글 생성 + 이미지 생성 + 발행까지 원스톱
- 콘텐츠 캘린더 기반 계획적 운영
- 네이버 SEO 최적화 규칙 내장 (저품질/누락 방지)
- 의료법 준수 자동 검증

### 1-3. 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 (관리 UI) | Next.js 15 + React 19 + TypeScript (기존 프로젝트) |
| 백엔드/DB | Supabase (PostgreSQL) |
| 글 생성 AI | Claude API (Anthropic) |
| 이미지 생성 AI | 나노바나나 2 (Gemini 3.1 Flash Image API) |
| 블로그 발행 | Playwright (TypeScript) - 브라우저 자동화 |
| SNS 발행 | Meta Graph API (인스타/페이스북), Threads API |
| 논문 검색 | Google Scholar (SerpAPI), PubMed (NCBI E-utilities), KCI Open API |
| 워커 서버 | Mac mini M4 (기존 scraping-worker와 동일 머신) |
| 스케줄러 | Node.js cron 또는 Supabase Edge Functions |

### 1-4. 프로젝트 구조

```
dental-clinic-manager/
├── src/
│   ├── app/admin/marketing/           # 관리 UI 페이지
│   │   ├── page.tsx                   # 마케팅 대시보드
│   │   ├── calendar/                  # 콘텐츠 캘린더
│   │   ├── posts/                     # 글 관리 (생성/편집/상태)
│   │   ├── settings/                  # 플랫폼 연동 설정
│   │   └── reports/                   # 발행 리포트
│   ├── app/api/marketing/             # API 라우트
│   │   ├── calendar/                  # 캘린더 CRUD
│   │   ├── generate/                  # 글 생성 트리거
│   │   ├── publish/                   # 발행 트리거
│   │   └── platforms/                 # 플랫폼 연동
│   ├── components/marketing/          # 마케팅 UI 컴포넌트
│   ├── types/marketing.ts             # 타입 정의
│   └── lib/marketing/                 # 유틸리티
│       ├── content-generator.ts       # AI 글 생성 로직
│       ├── image-generator.ts         # AI 이미지 생성
│       ├── keyword-researcher.ts      # 키워드 조사
│       ├── research-citation.ts       # 논문 검색/인용
│       ├── fact-checker.ts            # 팩트체크
│       ├── medical-law-checker.ts     # 의료법 검증
│       └── platform-adapters/         # 플랫폼별 변환
│           ├── naver-blog.ts
│           ├── instagram.ts
│           ├── facebook.ts
│           └── threads.ts
├── marketing-worker/                  # 발행 자동화 워커
│   ├── publisher/
│   │   ├── naver-blog-publisher.ts    # Playwright 기반 블로그 발행
│   │   ├── meta-publisher.ts          # 인스타/페이스북 API 발행
│   │   └── threads-publisher.ts       # 쓰레드 API 발행
│   ├── scheduler.ts                   # 스케줄러 (cron)
│   ├── typing-simulator.ts            # 타이핑 시뮬레이션
│   └── image-processor.ts             # 이미지 크롭/리사이즈
└── supabase/migrations/               # DB 마이그레이션
```

---

## 2. 핵심 기능 상세

### 2-1. AI 글 생성

**입력 옵션:**
```typescript
interface ContentGenerateOptions {
  // 필수
  topic: string;                    // 주제
  keyword: string;                  // 타겟 키워드
  postType: 'informational' | 'promotional' | 'notice' | 'clinical';

  // 어투 선택 (5가지)
  tone: 'friendly'                  // 친근한 반말 (~해요, ~거든요)
    | 'polite'                      // 정중한 존댓말 (~합니다, ~드립니다)
    | 'casual'                      // 구어체 (~인데요, ~더라고요)
    | 'expert'                      // 전문가 톤 (논문/데이터 기반)
    | 'warm';                       // 따뜻한 공감체 (~셨죠?, 걱정되시죠?)

  // 품질 옵션 (토글)
  useResearch: boolean;             // 논문 인용 (선택)
  factCheck: boolean;               // 팩트체크 (선택)

  // 배포 플랫폼 (체크박스)
  platforms: {
    naverBlog: boolean;
    instagram: boolean;
    facebook: boolean;
    threads: boolean;
  };
}
```

**글 생성 파이프라인:**
```
1. 키워드 조사
   → 검색량, 경쟁도, 연관키워드 자동 분석
   → 상위 노출 글 3개 벤치마킹

2. 글 생성 (Claude API)
   → 네이버 SEO 규칙 내장 프롬프트
   → 선택된 어투 적용
   → 본문 1,000자+ (띄어쓰기 제외)
   → 키워드 자연스럽게 3~5회 배치
   → 상업 금지 키워드 자동 필터링
   → 섹션별 [IMAGE: 설명] 마커 삽입

3. 논문 인용 (옵션)
   → Google Scholar / PubMed / KCI 검색
   → 관련 논문 2~3편 선별
   → 쉬운 말로 풀어서 본문에 자연스럽게 인용
   → 글 하단 출처 목록 자동 생성

4. 팩트체크 (옵션)
   → 수치/통계/의학적 주장 자동 추출
   → 신뢰 소스 대조 (대한치과의사협회, 건보공단, 학술DB 등)
   → 검증 등급: verified / unverified / incorrect / outdated
   → 부정확 → 자동 수정, 미확인 → 완화 표현 적용

5. 의료법 검증 (임상글/홍보글)
   → 금지 표현 검사 (최고, 최초, 100% 등)
   → 과장 광고, 결과 보장 표현 차단
   → 면책 문구 자동 삽입

6. 플랫폼별 변환
   → 네이버 블로그: 원본 그대로
   → 인스타그램: 300~500자 요약 + 해시태그 15~20개
   → 페이스북: 500~800자 요약 + 블로그 링크
   → 쓰레드: 핵심 한 줄 + 호기심 유발 + 링크
```

### 2-2. AI 이미지 생성

**기술:** 나노바나나 2 (Gemini 3.1 Flash Image API)
- 최대 4K 해상도
- 텍스트 렌더링 정확도 ~90%
- 한글 텍스트 지원

**이미지 생성 흐름:**
```
글 본문의 [IMAGE: 설명] 마커 파싱
→ 각 마커에서 이미지 프롬프트 추출
→ 나노바나나 2 API로 이미지 생성
→ 한글 파일명 자동 생성 (Claude Haiku로 프롬프트 → 파일명 변환)
→ 플랫폼별 규격으로 자동 크롭/리사이즈
```

**파일명 규칙:**
```
프롬프트: "깨끗한 치과 진료실에서 임플란트 모형을 설명하는 장면"
파일명: "임플란트_모형_설명_장면.png"
```
- 핵심 내용 2~4단어, 언더스코어 구분
- 한글 파일명 → 네이버 SEO에 유리 (이미지 검색 키워드 인식)

**플랫폼별 이미지 규격:**
```
원본 (1792x1024, 가로형)
├→ 네이버 블로그: 그대로 사용
├→ 인스타그램: 1080x1080 (1:1) 또는 1080x1350 (4:5)
├→ 페이스북: 1200x630 (OG 이미지)
└→ 쓰레드: 1080x1080 (1:1)
```

**이미지 규칙 (네이버 SEO):**
- 글당 3~7장, 문단마다 배치
- 매번 고유한 이미지 (재사용/동일 프롬프트 금지)
- 이미지에 홍보문구/과다 텍스트 금지 (OCR 감지)
- 무료 스톡 이미지 지양

### 2-3. 네이버 블로그 자동 발행 (Playwright)

**체류 시간 확보 전략 (핵심):**

네이버는 "사람이 할 수 없는 속도로 행동하는가?"를 실시간 체크.
복사 붙여넣기 절대 금지 → 한 글자씩 타이핑.

```
[타이핑 시뮬레이션]
- 글자당 딜레이: 10~50ms (랜덤)
- 문단 사이 휴식: 1~3초 (랜덤)
- 고정 딜레이 금지 → 반드시 랜덤 범위 사용

[단계별 의도적 지연]
- 페이지 로딩 후: 2~3초
- 팝업 처리 후: 1~2초
- 템플릿 적용 후: 2~3초
- 제목→본문 전환: 1.5~2.5초
- 이미지 업로드 후: 2~4초
- 저장 버튼 전: 1.5~3.5초
- 저장 완료 후: 3~5초

[iframe 처리]
- 네이버 에디터 본문은 iframe 내부
- iframe 전환 시 1.5~3.5초 대기 필수
- 빠르면 버튼 클릭 실패

[포스팅 1건 목표 소요시간]
- 약 5~10분 (글자수에 따라)
- 2,200개 글을 저품질 없이 운영 가능 (마토 사례)
```

**이미지 삽입 방식:**
```
1순위: 클립보드 붙여넣기 (가장 자연스러움, 봇 감지 회피)
2순위: 파일 업로드 (폴백)
```

**발행 안전 수칙:**
- 하루 최대 3건
- 발행 간격: 최소 30분~1시간
- 발행 후 제목/키워드 수정 금지

### 2-4. SNS 자동 발행

**배포 순서:**
```
1. 네이버 블로그 발행 (Playwright) → blogUrl 획득
2. 30분~1시간 대기
3. 인스타그램 발행 (Meta Graph API)
4. 페이스북 발행 (Meta Graph API, 블로그 링크 포함)
5. 쓰레드 발행 (Threads API, 블로그 링크 포함)
```

**플랫폼별 변환:**

| 플랫폼 | 글 변환 | 이미지 | 해시태그 | 링크 |
|--------|--------|--------|---------|------|
| 네이버 블로그 | 원본 1,000자+ | 3~7장 세로 배치 | 10개 미만 | 본문 내 |
| 인스타그램 | 300~500자 요약 + 불릿 | 캐러셀 1~10장 (1:1/4:5) | 15~20개 | 프로필만 |
| 페이스북 | 500~800자 요약 | 대표 1~3장 (OG) | 3~5개 | 블로그 URL |
| 쓰레드 | 핵심 한 줄 + CTA | 대표 1장 (1:1) | 5~10개 | 블로그 URL |

**인스타그램 특화:**
- 정보성 글 → 캐러셀(슬라이드) 형태 (저장/공유율 높음)
- 마지막 슬라이드: "자세한 내용은 프로필 링크 확인" CTA
- 위치 태그: "하얀치과" 자동 설정

---

## 3. 글 유형별 상세

### 3-1. 정보성 글 (Informational)

사람들이 검색해서 찾아보는 HOW-TO 콘텐츠.

- **생성:** AI 전체 생성 (Claude API)
- **이미지:** AI 생성 (나노바나나 2)
- **키워드 SEO:** 필수
- **어투:** 사용자 선택 (5가지)
- **논문 인용:** 옵션
- **팩트체크:** 옵션
- **원장 승인:** 불필요
- **배포 기본:** 블로그 + 인스타 + 쓰레드
- **발행 빈도:** 매일

**네이버 SEO 규칙 (AI 프롬프트에 내장):**
- 제목에 키워드 앞쪽 배치, 간결하게
- 서브키워드 최소화
- 본문 1,000자+, 키워드 3~5회 자연 배치
- 상업 금지 키워드 미사용 (후기, 효과, 추천, 최저, 1위 등)
- 상위 노출 글 3개 분석 후 작성

### 3-2. 홍보성 글 (Promotional)

치과 소개, 시술 안내, 이벤트 등 직접적인 병원 홍보.

- **생성:** AI 전체 생성
- **이미지:** AI 생성
- **키워드 SEO:** 필수
- **원장 승인:** 불필요
- **배포 기본:** 전체 플랫폼
- **발행 빈도:** 2~3일 1회

**주의:** 정보성 : 홍보성 = 2:1 비율 유지 (시스템에서 자동 관리)

### 3-3. 병원 공지글 (Notice)

진료 일정 변경, 이벤트, 신규 장비 도입 등.

**6가지 템플릿:**

| 템플릿 | 용도 | 예시 |
|--------|------|------|
| `holiday` | 휴진/연휴 안내 | "설 연휴 진료 안내" |
| `schedule` | 진료시간 변경 | "7월 진료시간 변경 안내" |
| `event` | 이벤트/프로모션 | "개원 3주년 이벤트" |
| `equipment` | 신규 장비/시설 | "3D CT 장비 도입 안내" |
| `staff` | 인사/채용 | "새 원장님 소개" |
| `general` | 일반 공지 | 기타 공지사항 |

**흐름:**
```
템플릿 선택 → UI 폼에 필수 정보 입력
→ AI가 공지문 생성 → 병원 사진 직접 첨부
→ 미리보기 → 발행
```

- AI 이미지 생성 불필요 → 병원 로고/사진 직접 첨부
- 짧은 글 (500자 미만) → 검색허용 해제 권장 (지수 보호)
- **배포 기본:** 블로그만
- **발행 빈도:** 필요 시

### 3-4. 임상글 (Clinical Case)

실제 병원에서 촬영한 임상 사진을 활용한 시술 사례 포스팅.

**흐름:**
```
임상 사진 업로드 (전/후/과정/X-ray)
→ 시술 정보 입력 (UI 폼: 시술종류, 기간, 환자정보 익명)
→ AI가 사진 분석 + 본문 보조 생성
→ 의료법 준수 자동 검증
→ 원장 최종 검토/승인 (필수)
→ 발행
```

**AI 본문 구조:**
```
1. 도입부: 환자 고민/증상 공감 (익명)
2. 진단: 상태 설명 + X-ray/사진
3. 치료 계획: 시술 방법 설명
4. 시술 과정: 단계별 설명 + 임상 사진 (Before → After)
5. 결과 & 관리법: 사후 관리 안내
6. (옵션) 논문 인용
```

**임상 사진 처리:**
- 환자 얼굴 자동 모자이크/크롭 (구강 부위만 노출)
- 환자 이름/차트번호 제거
- 환자 동의서 확인 필수 (`patientConsent: boolean`) → 미확인 시 발행 차단
- 병원 로고 워터마크 (옵션)
- 밝기/대비 자동 보정 (옵션)

**의료법 자동 검증:**
- 금지 표현: "최고", "최초", "유일", "100%" 등
- 과장 광고, 결과 보장 표현 차단
- 타 병원 비용 비교 금지
- 면책 문구 자동 삽입:
  ```
  ※ 개인마다 치아 상태와 치료 결과가 다를 수 있으며,
     정확한 진단은 내원 상담을 통해 가능합니다.
  ※ 본 게시물은 환자분의 동의를 받아 작성되었습니다.
  ```

- **원장 승인:** 필수
- **배포 기본:** 블로그 + 인스타
- **발행 빈도:** 주 1~2회

---

## 4. 콘텐츠 캘린더 & 스케줄 관리

### 4-1. 개요

AI가 주간/월간 콘텐츠 계획을 자동 생성 → 사용자 컨펌 → 스케줄대로 자동 발행.

### 4-2. 캘린더 자동 생성

**요청 옵션:**
```typescript
interface ContentCalendarRequest {
  period: 'weekly' | 'monthly';
  startDate: string;
  postsPerWeek: number;            // 주당 발행 수 (기본: 5)
  ratio: {
    informational: number;         // 정보성 60%
    promotional: number;           // 홍보성 30%
    clinical: number;              // 임상글 10%
  };
  focusKeywords?: string[];        // 집중 공략 키워드
  excludeKeywords?: string[];      // 제외 키워드 (이미 발행)
}
```

**AI 캘린더 생성 시 고려 사항:**
- 같은 키워드 연속 발행 방지 (최소 2주 간격)
- 정보성 : 홍보성 = 2:1 비율 자동 배분
- 계절/시기에 맞는 주제 반영 (여름→시린이, 연말→검진)
- 이전 발행 이력 분석 → 중복 주제 방지
- 하루 최대 3건, 발행 간격 30분+ 제한 준수
- 주말/공휴일 발행 여부 설정 가능

### 4-3. 사용자 승인 UI

캘린더 형태로 주간/월간 계획을 한눈에 확인:

```
┌─────────────────────────────────────────────────────┐
│  📅 3월 3주차 콘텐츠 캘린더              [전체승인] [거절] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  3/18 (월) 09:00                                    │
│  📝 "스케일링 후 시린 이가 생기는 이유"                   │
│  🔑 키워드: 스케일링 시린이 | 정보성 | 친근체              │
│  📢 블로그 + 인스타                                    │
│  [✅ 승인] [✏️ 수정] [❌ 거절]                          │
│                                                     │
│  3/19 (화) 10:00                                    │
│  📝 "임플란트 수명 늘리는 관리법 3가지"                   │
│  🔑 키워드: 임플란트 관리 | 정보성 | 전문가톤 | 논문인용    │
│  📢 블로그 + 인스타 + 페이스북 + 쓰레드                   │
│  [✅ 승인] [✏️ 수정] [❌ 거절]                          │
│                                                     │
│  3/21 (목) 09:00                                    │
│  📝 "하얀치과 4월 진료시간 변경 안내"                     │
│  🔑 공지글 | 정중체                                    │
│  📢 블로그만                                          │
│  [✅ 승인] [✏️ 수정] [❌ 거절]                          │
│                                                     │
│  3/22 (금) 14:00                                    │
│  📝 "교정 1개월 차 변화 과정"                            │
│  🔑 임상글 | 따뜻한공감체 | 의료법검증                    │
│  📢 블로그 + 인스타                                    │
│  ⚠️ 임상사진 업로드 필요 | 원장 승인 필요                  │
│  [📸 사진업로드] [✏️ 수정] [❌ 거절]                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**수정 가능 항목:**

| 항목 | 수정 방법 |
|------|---------|
| 발행 날짜/시간 | 드래그 앤 드롭 이동 |
| 제목 | 직접 편집 (키워드 포함 여부 자동 검증) |
| 주제/키워드 | 변경 시 제목 재생성 제안 |
| 어투 | 드롭다운 선택 |
| 글 유형 | 변경 시 필수 항목 재검증 |
| 배포 플랫폼 | 체크박스 |
| 논문 인용/팩트체크 | 토글 |
| 항목 추가/삭제 | 빈 날짜에 직접 추가 / 거절 처리 |

### 4-4. 자동 발행 파이프라인

승인된 항목이 발행 시간에 도달하면 자동 실행:

```
[스케줄러] 매 5분마다 체크
→ 발행 시간 도달한 approved 항목 발견
→ status: 'generating'
   → 키워드 조사 (검색량/경쟁도)
   → AI 본문 생성 (옵션 적용)
   → AI 이미지 생성 (나노바나나 2)
   → (옵션) 논문 인용 삽입
   → (옵션) 팩트체크 실행
   → (해당 시) 의료법 검증
→ status: 'review' (임상글만 - 원장 승인 대기)
→ status: 'scheduled'
→ status: 'publishing'
   → 네이버 블로그 발행 (Playwright, 5~10분 소요)
   → 30분~1시간 대기
   → SNS 순차 배포 (Graph API / Threads API)
→ status: 'published' (완료, 각 플랫폼 URL 저장)
→ 관리자에게 알림
```

### 4-5. 알림 & 리포트

**실시간 알림:**
- 발행 성공/실패
- 캘린더 생성 → 승인 요청
- 임상글 원장 검토 요청

**주간 리포트:**
- 계획 대비 발행 실적
- 플랫폼별 발행 수
- 이번 주 사용 키워드
- 다음 주 예정 주제

---

## 5. 배포 플랫폼 관리

### 5-1. 2단계 제어 구조

**① 글로벌 설정 (관리자 설정 페이지)**

각 플랫폼을 연동/활성화. 미연동 플랫폼은 선택지에 노출 안 됨.

```typescript
interface PlatformSettings {
  naverBlog: {
    enabled: boolean;
    loginMethod: 'cookie' | 'credential';
    blogId: string;
  };
  instagram: {
    enabled: boolean;
    connected: boolean;         // Meta 계정 연동 여부
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
```

**② 글별 선택 (글 작성/캘린더 항목마다)**

활성화된 플랫폼 중 해당 글을 어디에 배포할지 체크박스 선택.

**글 유형별 기본 프리셋 (사용자 변경 가능):**

| 글 유형 | 기본 선택 플랫폼 |
|--------|-------------|
| 정보성 | 블로그 + 인스타 + 쓰레드 |
| 홍보성 | 블로그 + 인스타 + 페이스북 + 쓰레드 |
| 공지글 | 블로그만 |
| 임상글 | 블로그 + 인스타 |

### 5-2. 플랫폼 연동 방식

| 플랫폼 | 연동 방식 | 인증 |
|--------|---------|------|
| 네이버 블로그 | Playwright 브라우저 자동화 | 쿠키/로그인 정보 |
| 인스타그램 | Meta Graph API | OAuth 장기 토큰 |
| 페이스북 | Meta Graph API (동일 계정) | OAuth 장기 토큰 |
| 쓰레드 | Threads API | OAuth 장기 토큰 |

---

## 6. 데이터베이스 설계

### 6-1. 테이블 구조

```sql
-- 플랫폼 설정
CREATE TABLE marketing_platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id),
  platform VARCHAR(20) NOT NULL,          -- naver_blog, instagram, facebook, threads
  enabled BOOLEAN DEFAULT FALSE,
  config JSONB DEFAULT '{}',              -- 플랫폼별 설정 (토큰, ID 등)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, platform)
);

-- 콘텐츠 캘린더
CREATE TABLE content_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',     -- draft, pending_approval, approved, in_progress, completed
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 캘린더 항목 (개별 포스트 계획)
CREATE TABLE content_calendar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id UUID REFERENCES content_calendars(id) ON DELETE CASCADE,
  publish_date DATE NOT NULL,
  publish_time TIME NOT NULL,
  title VARCHAR(200) NOT NULL,
  topic TEXT,
  keyword VARCHAR(100),
  post_type VARCHAR(20) NOT NULL,         -- informational, promotional, notice, clinical
  tone VARCHAR(20) DEFAULT 'friendly',    -- friendly, polite, casual, expert, warm
  use_research BOOLEAN DEFAULT FALSE,
  fact_check BOOLEAN DEFAULT FALSE,
  platforms JSONB DEFAULT '{"naverBlog": true}',
  status VARCHAR(20) DEFAULT 'proposed',  -- proposed, approved, rejected, modified, generating, review, scheduled, publishing, published, failed
  generated_content TEXT,
  generated_images JSONB,                 -- [{path, prompt, fileName}]
  published_urls JSONB,                   -- {blog, instagram, facebook, threads}
  fail_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 임상글 사진
CREATE TABLE clinical_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES content_calendar_items(id) ON DELETE CASCADE,
  photo_type VARCHAR(20) NOT NULL,        -- before, after, process, xray
  file_path TEXT NOT NULL,
  caption TEXT,
  patient_consent BOOLEAN DEFAULT FALSE,
  anonymized BOOLEAN DEFAULT FALSE,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 발행 로그
CREATE TABLE content_publish_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES content_calendar_items(id),
  platform VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,            -- success, failed
  published_url TEXT,
  error_message TEXT,
  duration_seconds INTEGER,               -- 발행 소요 시간
  published_at TIMESTAMPTZ DEFAULT NOW()
);

-- 키워드 발행 이력 (중복 방지)
CREATE TABLE keyword_publish_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id),
  keyword VARCHAR(100) NOT NULL,
  published_at DATE NOT NULL,
  item_id UUID REFERENCES content_calendar_items(id),
  UNIQUE(clinic_id, keyword, published_at)
);
```

---

## 7. 관리 UI 페이지 구성

### 7-1. 페이지 구조

```
/admin/marketing/                    # 마케팅 대시보드 (요약)
/admin/marketing/calendar            # 콘텐츠 캘린더 (주간/월간)
/admin/marketing/posts               # 전체 글 목록 (상태별 필터)
/admin/marketing/posts/new           # 새 글 작성 (수동)
/admin/marketing/posts/[id]          # 글 상세/편집/미리보기
/admin/marketing/posts/[id]/review   # 임상글 원장 검토
/admin/marketing/settings            # 플랫폼 연동 설정
/admin/marketing/settings/platforms  # 플랫폼별 상세 설정
/admin/marketing/reports             # 발행 리포트/통계

# 마스터 전용 (master 권한)
/master/marketing/prompts            # 프롬프트 관리 대시보드
/master/marketing/prompts/content    # 글 생성 프롬프트 편집
/master/marketing/prompts/image      # 이미지 생성 프롬프트 편집
/master/marketing/prompts/transform  # 플랫폼 변환 프롬프트 편집
/master/marketing/prompts/history    # 프롬프트 변경 이력
/master/marketing/prompts/test       # 프롬프트 테스트 (샌드박스)
```

### 7-2. 대시보드 구성요소

```
┌─────────────────────────────────────────────────────────┐
│  📊 마케팅 대시보드                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [이번 주 발행 현황]     [승인 대기]      [발행 실패]         │
│   ✅ 3/5건 완료          📋 2건          ❌ 0건            │
│                                                         │
│  [다음 발행 예정]                                         │
│   📝 내일 09:00 "스케일링 시린이" → 블로그+인스타            │
│                                                         │
│  [이번 주 캘린더 미리보기]                                  │
│   월 ● 화 ● 수 ○ 목 ● 금 ● 토 ○ 일 ○                    │
│                                                         │
│  [플랫폼 연동 상태]                                       │
│   ✅ 네이버블로그  ✅ 인스타  ⚠️ 페이스북(토큰만료)  ✅ 쓰레드 │
│                                                         │
│  [빠른 실행]                                              │
│   [📅 캘린더 생성] [✍️ 글 작성] [⚙️ 설정]                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 7-3. 프롬프트 관리 (마스터 전용)

마스터 계정(`/master`)에서만 접근 가능. 글/이미지 생성에 사용되는 AI 프롬프트를 직접 수정/개선할 수 있는 UI.

**프롬프트 카테고리:**

| 카테고리 | 프롬프트 | 설명 |
|---------|---------|------|
| 글 생성 | `content.informational` | 정보성 글 시스템 프롬프트 |
| 글 생성 | `content.promotional` | 홍보성 글 시스템 프롬프트 |
| 글 생성 | `content.notice.*` | 공지글 템플릿별 프롬프트 (6종) |
| 글 생성 | `content.clinical` | 임상글 시스템 프롬프트 |
| 글 생성 | `tone.*` | 어투별 스타일 지시문 (5종) |
| 이미지 생성 | `image.blog` | 블로그용 이미지 생성 프롬프트 |
| 이미지 생성 | `image.carousel` | 인스타 캐러셀 이미지 프롬프트 |
| 이미지 생성 | `image.filename` | 한글 파일명 생성 프롬프트 |
| 플랫폼 변환 | `transform.instagram` | 블로그→인스타 변환 프롬프트 |
| 플랫폼 변환 | `transform.facebook` | 블로그→페이스북 변환 프롬프트 |
| 플랫폼 변환 | `transform.threads` | 블로그→쓰레드 변환 프롬프트 |
| 품질 | `quality.factcheck` | 팩트체크 시스템 프롬프트 |
| 품질 | `quality.medical_law` | 의료법 검증 프롬프트 |
| 품질 | `quality.research` | 논문 인용 프롬프트 |

**프롬프트 편집 UI:**

```
┌─────────────────────────────────────────────────────────┐
│  🔧 프롬프트 관리 (마스터 전용)                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [글 생성] [이미지 생성] [플랫폼 변환] [품질 검증]            │
│  ─────────────────────────────────────────               │
│                                                         │
│  📝 content.informational (정보성 글)                     │
│  마지막 수정: 2026-03-15 by master                        │
│  버전: v3 (이전 버전 2개)                                  │
│                                                         │
│  ┌───────────────────────────────────────────────┐      │
│  │ 시스템 프롬프트:                                  │      │
│  │                                               │      │
│  │ 당신은 치과 전문 블로그 작성자입니다.                │      │
│  │ 다음 규칙을 반드시 준수하세요:                      │      │
│  │                                               │      │
│  │ 1. 제목에 {{keyword}}를 앞쪽에 배치              │      │
│  │ 2. 본문 1,000자 이상 작성                        │      │
│  │ 3. 키워드를 본문에 자연스럽게 3~5회 배치            │      │
│  │ ...                                           │      │
│  └───────────────────────────────────────────────┘      │
│                                                         │
│  변수: {{keyword}}, {{topic}}, {{tone}}, {{research}}     │
│                                                         │
│  [💾 저장] [🧪 테스트] [↩️ 이전 버전 복원] [📋 변경 이력]    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**핵심 기능:**

| 기능 | 설명 |
|------|------|
| **실시간 편집** | 코드 에디터 (구문 강조, 변수 자동완성) |
| **변수 시스템** | `{{keyword}}`, `{{topic}}`, `{{tone}}` 등 동적 변수 삽입 |
| **테스트 샌드박스** | 수정한 프롬프트로 즉시 샘플 글/이미지 생성하여 결과 확인 |
| **버전 관리** | 모든 변경 이력 저장, 이전 버전 복원 가능 |
| **A/B 비교** | 두 버전의 프롬프트로 동일 주제 글 생성 후 비교 |
| **변경 이력** | 누가, 언제, 어떤 부분을 수정했는지 diff 형태로 확인 |

**테스트 샌드박스:**

```
┌─────────────────────────────────────────────────────────┐
│  🧪 프롬프트 테스트                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  테스트 입력:                                             │
│  주제: [스케일링 후 주의사항        ]                       │
│  키워드: [스케일링 주의사항          ]                       │
│  어투: [friendly ▼]                                      │
│                                                         │
│  [▶️ 생성 실행]                                           │
│                                                         │
│  ─── 생성 결과 미리보기 ───                                │
│                                                         │
│  제목: 스케일링 주의사항 꼭 알아야 할 5가지~                  │
│                                                         │
│  스케일링 받고 나서 뭘 조심해야 하는지                       │
│  궁금하셨죠? 오늘은 스케일링 후 주의사항을                    │
│  쉽게 정리해드릴게요!                                      │
│  ...                                                    │
│                                                         │
│  📊 분석: 글자수 1,450자 | 키워드 4회 | 금지표현 0개         │
│                                                         │
│  [✅ 이 프롬프트 적용] [🔄 다시 생성] [↩️ 취소]              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**DB 테이블:**

```sql
-- 프롬프트 관리
CREATE TABLE marketing_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id),
  category VARCHAR(20) NOT NULL,       -- content, image, transform, quality
  prompt_key VARCHAR(50) NOT NULL,     -- informational, promotional, tone.friendly 등
  name VARCHAR(100) NOT NULL,          -- 표시 이름
  system_prompt TEXT NOT NULL,         -- 프롬프트 본문
  variables JSONB DEFAULT '[]',        -- 사용 가능 변수 목록
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, prompt_key, version)
);

-- 프롬프트 변경 이력
CREATE TABLE marketing_prompt_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID REFERENCES marketing_prompts(id),
  prompt_key VARCHAR(50) NOT NULL,
  version INTEGER NOT NULL,
  previous_content TEXT,               -- 변경 전
  new_content TEXT,                    -- 변경 후
  changed_by UUID REFERENCES users(id),
  change_note TEXT,                    -- 변경 사유
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 8. 구현 단계 (Phase)

### Phase 1: 기반 구축 (MVP)
- [ ] DB 테이블 생성 (Supabase 마이그레이션)
- [ ] 관리 UI 기본 페이지 레이아웃
- [ ] 플랫폼 설정 페이지 (네이버 블로그 연동)
- [ ] AI 글 생성 기본 기능 (Claude API, 어투 선택)
- [ ] 프롬프트 관리 UI (마스터 전용: 편집, 버전 관리, 테스트 샌드박스)
- [ ] 네이버 블로그 자동 발행 (Playwright, 타이핑 시뮬레이션)
- [ ] 수동 글 작성 → 수동 발행 플로우

### Phase 2: 이미지 & 품질
- [ ] AI 이미지 생성 (나노바나나 2 연동)
- [ ] 한글 파일명 자동 생성
- [ ] 이미지 자동 삽입 (클립보드 붙여넣기)
- [ ] 논문 인용 기능 (옵션)
- [ ] 팩트체크 기능 (옵션)
- [ ] 의료법 자동 검증

### Phase 3: 캘린더 & 스케줄
- [ ] 콘텐츠 캘린더 자동 생성 (AI)
- [ ] 캘린더 승인 UI (승인/수정/거절)
- [ ] 자동 발행 스케줄러
- [ ] 발행 결과 알림
- [ ] 주간 리포트

### Phase 4: 멀티 플랫폼
- [ ] Meta Graph API 연동 (인스타/페이스북)
- [ ] Threads API 연동
- [ ] 원본 → 플랫폼별 자동 변환 (글 요약, 해시태그, 이미지 크롭)
- [ ] 플랫폼별 선택 배포

### Phase 5: 공지글 & 임상글
- [ ] 병원 공지글 템플릿 시스템 (6종)
- [ ] 임상글 사진 업로드/처리 (모자이크, 워터마크)
- [ ] 임상글 AI 본문 보조 생성
- [ ] 원장 승인 워크플로우

### Phase 6: 고도화
- [ ] 키워드 자동 조사/제안 (네이버 API 연동)
- [ ] 발행 성과 추적 (조회수, 유입 키워드)
- [ ] A/B 테스트 (제목/어투별 성과 비교)
- [ ] 경쟁 블로그 모니터링

---

## 9. 전체 옵션 체계 (최종)

```typescript
// 글 생성 + 배포 통합 옵션
interface MarketingContentOptions {
  // 콘텐츠 기본
  topic: string;                                              // 주제
  keyword: string;                                            // 타겟 키워드
  postType: 'informational' | 'promotional' | 'notice' | 'clinical';
  tone: 'friendly' | 'polite' | 'casual' | 'expert' | 'warm'; // 어투

  // 품질 옵션 (토글)
  useResearch: boolean;                                        // 논문 인용
  factCheck: boolean;                                          // 팩트체크

  // 배포 플랫폼 (체크박스, 사용자 선택)
  platforms: {
    naverBlog: boolean;
    instagram: boolean;
    facebook: boolean;
    threads: boolean;
  };

  // 배포 스케줄
  schedule: {
    publishAt?: Date;                                          // 예약 발행 시간
    snsDelayMinutes: number;                                   // SNS 배포 지연 (기본 30분)
  };

  // 임상글 전용
  clinical?: {
    photos: ClinicalPhoto[];
    patientConsent: boolean;
    procedureType: string;
    patientAge?: string;
    patientGender?: string;
  };

  // 공지글 전용
  notice?: {
    template: 'holiday' | 'schedule' | 'event' | 'equipment' | 'staff' | 'general';
    templateData: Record<string, string>;
  };
}
```

---

## 10. 참고 문서

- [네이버 블로그 가이드라인](./naver-blog-guidelines.md) - SEO 규칙, 체류시간 확보, 에디터 자동화 상세
- [전자책] 대표님을 위한 상업블로그 운영법 (이타인/William Kyeung)
- 유튜버 '마토' 자동화 영상 (2,200개 포스팅 사례)

---

**마지막 업데이트: 2026-03-17**
