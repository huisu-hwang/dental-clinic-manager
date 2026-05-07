# 클리닉 브랜드 이미지 템플릿 시스템 설계

**작성일**: 2026-05-07
**상태**: Draft (검토 대기)
**관련 영역**: 마케팅 자동화, 블로그 생성

## 1. 배경 & 목표

### 1.1 배경
현재 마케팅 블로그 글 작성 흐름은 본문에 `[IMAGE: 설명]` 마커가 들어가면 매번 AI(Gemini/OpenAI)가 새 이미지를 생성한다. 이 방식은 두 가지 한계가 있다.
- **브랜드 일관성 부재**: 매 글마다 그림체·색감이 달라져 클리닉 정체성이 드러나지 않는다.
- **반복 자산 미활용**: 의료법 준수 안내처럼 "거의 모든 글에 동일하게" 들어가야 하는 이미지를 매번 새로 생성하는 비용·일관성 손실이 크다.

### 1.2 목표
- 클리닉이 **로고·브랜드 컬러·슬로건·병원 사진**을 한 번 등록하면, 블로그 글 작성 시 자동으로 끼워 넣을 수 있는 **재사용 가능한 브랜드 이미지 3종**을 코드로 합성한다.
- 매번 결과가 동일한 **결정적 합성**으로 브랜드 통일감을 보장한다.
- 기존 AI 이미지 생성 흐름(`[IMAGE: 설명]`)은 그대로 유지하여 **호환성**을 깨지 않는다.

### 1.3 비목표 (Non-Goals)
- AI 기반 자유 그래픽 생성은 본 기능 범위가 아니다 (기존 흐름 유지).
- 본 스펙에서는 **3종 템플릿 + 1개 의료법 컬러 프리셋 5종**만 지원한다. 향후 스킨 추가는 별도 작업.
- 인스타그램·페이스북 등 비-블로그 플랫폼 적용은 본 스펙 범위 외 (확장 여지만 남김).

## 2. 브랜드 이미지 3종 정의

### 2.1 의료법 준수 안내 이미지 (medical_law)
- **용도**: 거의 모든 블로그 글의 시작 부분에 삽입하여 의료법 제56조 준수를 명시.
- **특징**: 클리닉마다 거의 정적 (클리닉명/로고만 치환). 자산 변경 전까지는 같은 이미지 재사용.
- **레이아웃** (참조: 사용자 첨부 이미지 #3):
  - 상단 말풍선 박스: "본 포스팅은 **의료법 제56조 및 동법 시행령을 준수**하여 **{clinic_name}**에서 정보제공을 위해 직접 작성하였습니다."
  - 하단 박스: "모든 시술 및 수술은 **부작용이 발생**할 수 있으니 **의료진과 충분한 상담 후 치료**받으시기 바랍니다." + 로고 + 클리닉명(영문)
- **컬러 프리셋 5종** (Q5 결정):
  1. 노랑/블랙 (첨부 이미지 #3과 동일) — 강한 시인성
  2. 민트그린/네이비 — 청결·신뢰
  3. 샌드베이지/다크그린 — 차분·자연
  4. 소프트핑크/차콜 — 따뜻·여성 친화
  5. 퓨어화이트/딥블루 — 미니멀·전문가
- **사이즈**: 1200 × 630 px (블로그 본문 가로폭 기준).

### 2.2 텍스트(타이틀 카드) 이미지 (title)
- **용도**: 블로그 글 본문 첫 단락 다음에 삽입하여 글 주제를 시각적으로 강조.
- **특징**: 레이아웃·컬러·로고는 고정, **중앙 카피**만 글마다 동적.
- **레이아웃** (참조: 사용자 첨부 이미지 #1):
  - 외곽: 주 브랜드 컬러 프레임 (모서리 컬 효과는 옵션)
  - 상단 작은 강조문구: 슬로건 (예: "보건복지부 인증 치주과 전문의 의료진의 책임진료!")
  - 중앙 큰 텍스트: 사용자 입력 카피 (기본값 = `{clinic_name_ko} / {keyword}`, 사용자 수정 가능)
  - 영문 클리닉명 (작은 글씨)
  - 하단 로고 + 클리닉명(한/영)
- **사이즈**: 1080 × 1080 px (정사각, 인스타 호환).

### 2.3 병원 사진 오버레이 이미지 (photo)
- **용도**: 블로그 글에 실제 병원 사진을 노출하여 신뢰도 강화.
- **특징**: 클리닉이 업로드한 사진 풀에서 선택, 우상단에 로고+클리닉명 워터마크 자동 합성.
- **레이아웃** (참조: 사용자 첨부 이미지 #2):
  - 배경: 업로드 사진 (원본 비율 유지, contain or cover)
  - 우상단 오버레이: 로고 + 클리닉명(한/영) — 반투명 배경 옵션
- **사이즈**: 원본 사진 비율 유지, 최대 1600 × 1200 px로 다운스케일.

## 3. 데이터 모델

### 3.1 신규 테이블

#### `clinic_brand_assets` (1:1 with `clinics`)
```sql
CREATE TABLE clinic_brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,
  name_ko TEXT,                     -- 비우면 clinics.name 사용
  name_en TEXT,                     -- 영문명, 예: "GANGNAM SM DENTAL CLINIC"
  logo_url TEXT,                    -- Supabase Storage public URL
  primary_color TEXT NOT NULL DEFAULT '#1B5E20',     -- 텍스트 이미지 프레임 컬러
  secondary_color TEXT NOT NULL DEFAULT '#FFC107',   -- 강조 컬러
  slogan TEXT,                      -- 텍스트 이미지 상단 강조 문구
  medical_law_preset TEXT NOT NULL DEFAULT 'yellow_black',
                                    -- 'yellow_black' | 'mint_navy' | 'sand_green' | 'pink_charcoal' | 'white_blue'
  medical_law_top_text TEXT NOT NULL DEFAULT '본 포스팅은 의료법 제56조 및 동법 시행령을 준수하여 {clinic_name}에서 정보제공을 위해 직접 작성하였습니다.',
  medical_law_bottom_text TEXT NOT NULL DEFAULT '모든 시술 및 수술은 부작용이 발생할 수 있으니 의료진과 충분한 상담 후 치료받으시기 바랍니다.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clinic_brand_assets_clinic_id ON clinic_brand_assets(clinic_id);
```

#### `clinic_brand_photos` (1:N with `clinics`)
```sql
CREATE TABLE clinic_brand_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,          -- Supabase Storage public URL
  caption TEXT,                     -- 사용자 메모 (예: "임플란트 시술실")
  sort_order INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clinic_brand_photos_clinic_id ON clinic_brand_photos(clinic_id);
```

#### `clinic_brand_image_renders` (합성 결과 캐시)
```sql
CREATE TABLE clinic_brand_image_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  image_type TEXT NOT NULL,         -- 'medical_law' | 'title' | 'photo'
  cache_key TEXT NOT NULL,          -- 합성에 영향을 주는 입력의 해시
  image_url TEXT NOT NULL,          -- Supabase Storage public URL
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_clinic_brand_image_renders_key
  ON clinic_brand_image_renders(clinic_id, image_type, cache_key);
```

`cache_key` 산정 규칙:
- `medical_law`: `hash(name_ko, logo_url, medical_law_preset, medical_law_top_text, medical_law_bottom_text)`
- `title`: `hash(name_ko, name_en, logo_url, primary_color, slogan, copy_text)`
- `photo`: `hash(photo_id, name_ko, logo_url)` — 사진+로고 합성 결과를 사진별로 캐시

### 3.2 RLS 정책
- `clinic_brand_assets`, `clinic_brand_photos`: 같은 `clinic_id` 사용자만 SELECT 가능. INSERT/UPDATE/DELETE는 `marketing_brand_manage` 권한 보유자만.
- `clinic_brand_image_renders`: 같은 `clinic_id` 사용자만 SELECT. INSERT는 서비스 롤(서버 API)만.

### 3.3 Supabase Storage 버킷
- `marketing-brand` (public): 로고 이미지, 사진, 합성 결과 PNG 저장.
- 경로 규칙:
  - `clinics/{clinic_id}/logo.{ext}`
  - `clinics/{clinic_id}/photos/{photo_id}.{ext}`
  - `clinics/{clinic_id}/renders/{type}/{cache_key}.png`

## 4. 합성 엔진

### 4.1 라이브러리 선택
- **`satori`** (`@vercel/satori`) — React JSX → SVG. Vercel OG 이미지 표준. 한글 폰트 지원, 결정적, 빠름 (수십 ms).
- **`sharp`** — SVG → PNG 변환 + 사진 리사이즈/오버레이.
- **폰트**: Pretendard (KR) + Inter (EN). 폰트 파일은 `public/fonts/` 또는 빌드 타임 정적 임포트.

### 4.2 서버 API
새 엔드포인트:
- `POST /api/marketing/brand/render` — body: `{ type: 'medical_law' | 'title' | 'photo', payload: {...} }` → `{ url }` 반환
- 인증: Supabase 세션 기반(`createClient`로 user 확인) + clinic 멤버십 확인
- 동작:
  1. `clinic_id` (세션) + `type` + `payload`로 `cache_key` 산출
  2. `clinic_brand_image_renders`에서 캐시 조회 → 있으면 그대로 반환
  3. 없으면 satori로 합성 → sharp로 PNG 변환 → Storage 업로드 → 캐시 INSERT → URL 반환

자산 CRUD API:
- `GET /api/marketing/brand/assets` — 현재 클리닉 자산 조회
- `PUT /api/marketing/brand/assets` — UPSERT
- `POST /api/marketing/brand/photos` (multipart) — 사진 업로드
- `DELETE /api/marketing/brand/photos/:id` — 사진 삭제
- `PATCH /api/marketing/brand/photos/:id` — 캡션·정렬 수정

### 4.3 React JSX 템플릿 컴포넌트 (서버 전용)
- `src/lib/marketing/brand-templates/MedicalLawNotice.tsx`
- `src/lib/marketing/brand-templates/TitleCard.tsx`
- `src/lib/marketing/brand-templates/PhotoOverlay.tsx`
- 모두 satori가 받을 수 있는 제한된 JSX (인라인 스타일만, flex 기반 레이아웃)로 작성.

## 5. 사용자 흐름

### 5.1 마스터 관리 페이지: "브랜드 이미지 설정"
**경로**: `/dashboard/marketing/brand`
**권한**: `marketing_brand_manage`
**구성**:
- **입력 폼 (좌측 또는 상단)**
  - 클리닉명(한글) — 비우면 `clinics.name` 사용
  - 클리닉명(영문) — 텍스트 입력
  - 로고 이미지 — 드래그 앤 드롭 업로드 (PNG 권장, 5MB 이하)
  - 주 브랜드 컬러 — 컬러 피커
  - 보조 브랜드 컬러 — 컬러 피커
  - 슬로건 1줄 — 텍스트 입력
  - 의료법 이미지 컬러 프리셋 — 5종 라디오 카드 (각각 썸네일 미리보기 200×100)
  - 의료법 문장 (상단·하단) — textarea, 기본값 채워짐, 수정 가능. `{clinic_name}` 플레이스홀더 지원.
- **사진 업로드 영역**
  - 드래그 앤 드롭 + 파일 선택, **갯수 제한 없음**, 추후 추가/삭제 가능
  - 썸네일 그리드, 각 사진 캡션 인라인 편집, 정렬 순서 드래그 변경
- **실시간 미리보기 (우측)**
  - 3종 이미지 모두 즉시 미리보기 (입력 변경 시 디바운스 후 재렌더)
  - "이 자산 저장" 버튼 → DB UPSERT + 캐시 무효화

### 5.2 글 작성 폼 (`NewPostForm.tsx`)
**새 섹션 추가** (기존 SEO 섹션과 이미지 섹션 사이):

```
┌─ 4. 브랜드 이미지 (clinic_name 브랜드) ───────────────────┐
│  ☑ 의료법 안내 이미지   위치: ☑위 ▢중간 ▢끝              │
│  ☑ 텍스트 이미지       위치: ▢위 ☑중간 ▢끝              │
│       카피 (글에 들어갈 중앙 큰 글씨):                    │
│       [강남숙면치과 / 임플란트            ] (자동 채움)   │
│  ☑ 병원 사진 이미지    위치: ▢위 ▢중간 ☑끝              │
│       사진 선택: ◉ 랜덤  ◯ 직접 선택  ◯ 순서 회전        │
│       (직접 선택 시) [📷][📷][📷][📷] 사진 그리드        │
└──────────────────────────────────────────────────────────┘
```

기본값:
- 3종 모두 토글 ON
- 위치 기본: 의료법=위, 텍스트=중간, 사진=끝
- 텍스트 카피: `{clinic_name_ko} / {keyword}`
- 사진 모드: 랜덤

### 5.3 본문 삽입 메커니즘
- `content-generator.ts`가 글 본문을 만들 때, 위 섹션의 설정에 따라 본문 마커를 추가:
  - `[BRAND_IMAGE:medical_law]`
  - `[BRAND_IMAGE:title|copy=강남숙면치과 / 임플란트]`
  - `[BRAND_IMAGE:photo|mode=random]` 또는 `[BRAND_IMAGE:photo|id=<photo_id>]`
- 이미지 처리 단계에서 마커를 인식하여 `/api/marketing/brand/render`로 합성 요청 → 본문 내 마커를 합성된 이미지 URL로 치환.
- 기존 `[IMAGE: 설명]` AI 이미지 마커 처리는 **변경 없음** — 두 종류 마커가 본문에 공존 가능.

### 5.4 위치 결정 알고리즘
본문은 보통 도입 / 본문 / 마무리 3단 구조이다.
- **위**: 도입부 첫 단락 직전
- **중간**: 본문 H2 또는 H3 사이 중간 지점 (헤딩 갯수의 중앙값)
- **끝**: 마무리/면책 문구 직전

한 종류 이미지에 여러 위치가 체크된 경우 각 위치마다 모두 삽입한다. 같은 위치에 여러 종류 이미지가 들어가는 경우 우선순위는 `medical_law` → `title` → `photo` 순으로 위에서 아래로 배치한다.

### 5.5 텍스트 카피·문장 치환 규칙
- 의료법 문장의 `{clinic_name}` 플레이스홀더는 합성 시점(서버)에 `clinic_brand_assets.name_ko`(없으면 `clinics.name`)로 치환한다.
- 텍스트 이미지의 사용자 입력 카피는 satori JSX의 텍스트 노드로 그대로 렌더링된다 (HTML 이스케이프 불필요 — DOM이 아닌 SVG 텍스트).
- 카피 최대 길이 30자(개행 1회 허용). 초과 시 자동으로 말줄임.

## 6. 권한

새 권한 키 추가 (`src/types/permissions.ts`):
- `marketing_brand_view` — 브랜드 이미지 설정 페이지 조회
- `marketing_brand_manage` — 자산 등록/수정/삭제

기본 부여:
- `owner`, `vice_director`, `manager` → 둘 다
- `staff` → view 없음 (글 작성 폼 내 사용은 `marketing_post_create` 권한이 있는 자에게 자동 노출)

`NEW_FEATURE_PREFIXES`에 `marketing_brand_` 추가하여 기존 직원에게 자동 노출.

## 7. 메뉴 등록
`src/config/menuConfig.ts`의 마케팅 하위 메뉴에 항목 추가:
```ts
{
  key: 'marketing-brand',
  label: '브랜드 이미지',
  href: '/dashboard/marketing/brand',
  permissions: ['marketing_brand_view'],
}
```

## 8. 영향 범위 & 기존 기능 보호

### 변경되는 파일/모듈
- 신규: 마이그레이션 SQL 1개, API route 2개 (자산 CRUD, 합성), 페이지 1개, 컴포넌트 5~7개, 템플릿 JSX 3개, 권한·메뉴 정의 추가
- 수정: `NewPostForm.tsx` (섹션 1개 추가), `content-generator.ts` (마커 생성 로직 분기), 이미지 처리 단계 (마커 치환)

### 보호 대상
- 기존 `[IMAGE: 설명]` AI 이미지 마커 처리: 변경 없음, 두 마커가 공존
- 기존 SEO 분석 미리보기, 글 생성, 캘린더, 발행 흐름: 변경 없음
- `clinics.name`, `clinics.logo` 등 기존 컬럼: 그대로 유지, 본 기능은 별도 테이블 사용

## 9. 마이그레이션 & 롤아웃

1. 마이그레이션 적용 (테이블 3개 + Storage 버킷 + 권한 시드)
2. 새 페이지/API 배포 — 자산 미설정 클리닉은 글 작성 폼에서 "브랜드 이미지 설정 안내" 배너만 노출, 토글은 모두 disabled
3. 기존 글/자료에 영향 없음 (opt-in 기능)

## 10. 테스트 계획

### 10.1 단위/통합
- satori 합성 결과가 cache_key 동일 시 동일 PNG 바이너리 (deterministic)
- 자산 변경 시 캐시 무효화 (UPDATE clinic_brand_assets → 해당 clinic_id의 medical_law·title 캐시 SOFT 무효화: 새 cache_key로 재생성)
- 권한 없는 사용자 접근 차단 (RLS + API 가드)

### 10.2 E2E (테스트 계정 `whitedc0902@gmail.com`)
- 로그인 → 마케팅 → 브랜드 이미지 설정 → 로고/컬러/슬로건 입력 → 미리보기 확인 → 저장
- 글 작성 → 브랜드 이미지 섹션 토글 모두 ON, 위치 변경 → 글 생성 → 본문에 합성 이미지 3장 정확한 위치에 삽입되었는지 확인
- 사진 모드 3종(랜덤/직접/회전) 각각 동작 확인
- 의료법 컬러 프리셋 변경 → 다음 글 생성 시 새 컬러로 재합성

### 10.3 시각 회귀
- 첨부된 사용자 참조 이미지 3장과 합성 결과를 시각 비교 (Figma/스크린샷)

## 11. 미정/추후 과제 (스코프 외)
- 텍스트 이미지의 모서리 컬 효과: MVP에서는 단순 사각형 프레임으로 시작, 추후 옵션화
- 사진 이미지 워터마크 위치 옵션 (현재 우상단 고정)
- 인스타그램용 1080×1350 변형
- 클리닉별 다중 스킨 (현재 1세트만)
