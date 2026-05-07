# 클리닉 브랜드 이미지 템플릿 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 클리닉이 로고·브랜드 컬러·슬로건·병원 사진을 등록하면, 블로그 글 생성 시 의료법 안내·텍스트 카드·사진 오버레이 3종 브랜드 이미지를 코드로 합성하여 본문에 자동 삽입하는 시스템을 구축한다.

**Architecture:** Supabase 테이블 3종 + Storage 버킷 1개로 자산을 영속화하고, satori(JSX→SVG) + sharp(SVG→PNG)로 결정적 합성한다. 합성 결과는 `clinic_brand_image_renders`에 캐시하여 재사용한다. 글 본문에 `[BRAND_IMAGE:type|...]` 마커가 들어가면 `marker-resolver`가 이를 합성된 PNG URL로 치환한다.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase (PostgreSQL + Storage), satori (`@vercel/satori`), sharp, Tailwind CSS 4, Pretendard·Inter 폰트.

**Spec:** [`docs/superpowers/specs/2026-05-07-clinic-brand-image-templates-design.md`](../specs/2026-05-07-clinic-brand-image-templates-design.md)

---

## File Structure

### 신규 생성

| Path | 책임 |
|------|------|
| `supabase/migrations/20260507_clinic_brand_image_templates.sql` | DB 스키마 (테이블 3종 + RLS + Storage 버킷) |
| `src/types/brand.ts` | TypeScript 타입 (BrandAssets, BrandPhoto, BrandImageType, render payload) |
| `src/lib/marketing/brand/presets.ts` | 의료법 컬러 프리셋 5종 정의 |
| `src/lib/marketing/brand/cache-key.ts` | 합성 입력 → SHA-1 cache_key 산출 |
| `src/lib/marketing/brand/templates/MedicalLawNotice.tsx` | 의료법 안내 satori JSX |
| `src/lib/marketing/brand/templates/TitleCard.tsx` | 텍스트 카드 satori JSX |
| `src/lib/marketing/brand/templates/PhotoOverlay.tsx` | 사진 + 로고 워터마크 합성 (sharp 직접 사용) |
| `src/lib/marketing/brand/render-engine.ts` | satori + sharp 호출, 폰트 로딩, Storage 업로드, 캐시 조회/저장 |
| `src/lib/marketing/brand/marker-resolver.ts` | `[BRAND_IMAGE:...]` 본문 마커 파싱·치환 |
| `src/app/api/marketing/brand/assets/route.ts` | 자산 GET/PUT |
| `src/app/api/marketing/brand/photos/route.ts` | 사진 업로드 POST |
| `src/app/api/marketing/brand/photos/[id]/route.ts` | 사진 수정/삭제 PATCH/DELETE |
| `src/app/api/marketing/brand/render/route.ts` | 합성 POST (캐시 우선, miss 시 생성) |
| `src/app/dashboard/marketing/brand/page.tsx` | 브랜드 설정 페이지 (서버 컴포넌트, 권한 가드) |
| `src/components/marketing/brand/BrandSettingsForm.tsx` | 자산 입력 폼 (이름·컬러·슬로건·문장) |
| `src/components/marketing/brand/MedicalLawPresetPicker.tsx` | 5종 프리셋 라디오 카드 |
| `src/components/marketing/brand/BrandPhotoUploader.tsx` | 드래그 앤 드롭 + 사진 그리드 |
| `src/components/marketing/brand/BrandPreview.tsx` | 3종 이미지 실시간 미리보기 |
| `src/components/marketing/brand/BrandImageSection.tsx` | 글 작성 폼 안의 브랜드 이미지 섹션 |
| `src/hooks/useBrandAssets.ts` | 클라이언트 자산 조회/저장 훅 |
| `tests/lib/brand/cache-key.test.ts` | 캐시 키 결정성/충돌 테스트 |
| `tests/lib/brand/marker-resolver.test.ts` | 마커 파서 테스트 |

### 수정

| Path | 변경 내용 |
|------|----------|
| `package.json` | `satori`, `sharp`, `@types/sharp` 추가 |
| `src/types/permissions.ts` | `marketing_brand_view`/`marketing_brand_manage` + `PERMISSION_GROUPS`·설명·`DEFAULT_PERMISSIONS`·`NEW_FEATURE_PREFIXES` |
| `src/config/menuConfig.ts` | 마케팅 하위 "브랜드 이미지" 메뉴 |
| `src/types/marketing.ts` | `ContentGenerateOptions`에 `brandImageOptions` 필드 추가 |
| `src/lib/marketing/content-generator.ts` | 본문 생성 후 옵션에 따라 `[BRAND_IMAGE:...]` 마커 삽입 |
| `src/app/api/marketing/generate/route.ts` (또는 이미지 처리 단계) | `marker-resolver` 호출하여 마커를 PNG URL로 치환 |
| `src/components/marketing/NewPostForm.tsx` | 새 섹션 `<BrandImageSection />` 추가 |
| `public/fonts/` | `PretendardVariable.ttf`, `Inter.ttf` 추가 |

---

## Phase 1: Foundation

### Task 1: 의존성 설치 및 폰트 추가

**Files:**
- Modify: `package.json`
- Create: `public/fonts/PretendardVariable.ttf`
- Create: `public/fonts/Inter-Regular.ttf`

- [ ] **Step 1: satori, sharp 설치**

```bash
cd dental-clinic-manager && npm install satori sharp
```

Expected: package.json `dependencies`에 `satori`와 `sharp` 추가.

- [ ] **Step 2: 폰트 다운로드**

Pretendard Variable과 Inter Regular을 `public/fonts/`에 배치한다. (위 두 폰트 모두 OFL 라이선스로 임베드 허용)

```bash
mkdir -p public/fonts
curl -L -o public/fonts/PretendardVariable.ttf "https://github.com/orioncactus/pretendard/raw/main/packages/pretendard/dist/public/variable/PretendardVariable.ttf"
curl -L -o public/fonts/Inter-Regular.ttf "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.ttf"
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

Expected: 빌드 통과. 새 의존성 import는 아직 없음.

- [ ] **Step 4: 커밋**

```bash
git add package.json package-lock.json public/fonts/
git commit -m "chore(marketing/brand): satori/sharp 의존성 + Pretendard·Inter 폰트 추가"
```

---

### Task 2: DB 마이그레이션 작성 및 적용

**Files:**
- Create: `supabase/migrations/20260507_clinic_brand_image_templates.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- 클리닉 브랜드 이미지 템플릿 시스템
-- 2026-05-07

-- 1. 자산 테이블 (1:1 with clinics)
CREATE TABLE clinic_brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,
  name_ko TEXT,
  name_en TEXT,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#1B5E20',
  secondary_color TEXT NOT NULL DEFAULT '#FFC107',
  slogan TEXT,
  medical_law_preset TEXT NOT NULL DEFAULT 'yellow_black',
  medical_law_top_text TEXT NOT NULL DEFAULT '본 포스팅은 의료법 제56조 및 동법 시행령을 준수하여 {clinic_name}에서 정보제공을 위해 직접 작성하였습니다.',
  medical_law_bottom_text TEXT NOT NULL DEFAULT '모든 시술 및 수술은 부작용이 발생할 수 있으니 의료진과 충분한 상담 후 치료받으시기 바랍니다.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clinic_brand_assets_clinic_id ON clinic_brand_assets(clinic_id);

-- 2. 사진 풀
CREATE TABLE clinic_brand_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clinic_brand_photos_clinic_id ON clinic_brand_photos(clinic_id);

-- 3. 합성 결과 캐시
CREATE TABLE clinic_brand_image_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  image_type TEXT NOT NULL CHECK (image_type IN ('medical_law', 'title', 'photo')),
  cache_key TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_clinic_brand_image_renders_key
  ON clinic_brand_image_renders(clinic_id, image_type, cache_key);

-- 4. updated_at 자동 갱신
CREATE OR REPLACE FUNCTION set_updated_at_clinic_brand_assets()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clinic_brand_assets_updated_at
  BEFORE UPDATE ON clinic_brand_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_clinic_brand_assets();

-- 5. RLS
ALTER TABLE clinic_brand_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_brand_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_brand_image_renders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_assets_select" ON clinic_brand_assets
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "brand_assets_modify" ON clinic_brand_assets
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "brand_photos_select" ON clinic_brand_photos
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "brand_photos_modify" ON clinic_brand_photos
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "brand_renders_select" ON clinic_brand_image_renders
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- INSERT는 service_role(서버 API)만 (정책 미정의 → service_role 키만 가능)

-- 6. Storage 버킷
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-brand', 'marketing-brand', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "brand_storage_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'marketing-brand');

CREATE POLICY "brand_storage_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'marketing-brand'
    AND (storage.foldername(name))[1] = 'clinics'
  );

CREATE POLICY "brand_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'marketing-brand'
    AND (storage.foldername(name))[1] = 'clinics'
  );
```

- [ ] **Step 2: Supabase MCP로 적용**

`mcp__supabase__apply_migration`을 사용하여 프로젝트 `beahjntkmkfhpcbhfnrr`에 적용한다. name은 `clinic_brand_image_templates`.

- [ ] **Step 3: 적용 검증**

```bash
mcp__supabase__list_tables (schemas=['public'])
```

Expected: `clinic_brand_assets`, `clinic_brand_photos`, `clinic_brand_image_renders` 3개 테이블 확인.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260507_clinic_brand_image_templates.sql
git commit -m "feat(marketing/brand): 브랜드 이미지 자산·사진·렌더 캐시 테이블 마이그레이션"
```

---

### Task 3: 권한 등록

**Files:**
- Modify: `src/types/permissions.ts`

- [ ] **Step 1: Permission union에 키 2개 추가**

`src/types/permissions.ts`의 `Permission` union 타입에 추가 (마지막 마케팅 권한 근처):

```ts
  | 'marketing_brand_view'    // 브랜드 이미지 설정 조회
  | 'marketing_brand_manage'  // 브랜드 이미지 자산 관리
```

- [ ] **Step 2: PERMISSION_GROUPS 추가**

마케팅 그룹에 신규 항목 추가:

```ts
{
  id: 'marketing_brand',
  label: '마케팅 - 브랜드 이미지',
  permissions: [
    { key: 'marketing_brand_view', label: '브랜드 이미지 설정 조회' },
    { key: 'marketing_brand_manage', label: '브랜드 이미지 자산 관리' },
  ],
},
```

(기존 PERMISSION_GROUPS 구조에 맞게 조정 — 한 객체로 추가)

- [ ] **Step 3: PERMISSION_DESCRIPTIONS 추가**

```ts
marketing_brand_view: '클리닉의 브랜드 이미지 설정 페이지 조회',
marketing_brand_manage: '로고/컬러/사진 등 브랜드 자산 등록·수정·삭제',
```

- [ ] **Step 4: DEFAULT_PERMISSIONS에 부여**

`owner`, `vice_director`, `manager`의 배열에 `'marketing_brand_view', 'marketing_brand_manage'` 추가.

- [ ] **Step 5: NEW_FEATURE_PREFIXES에 추가**

```ts
export const NEW_FEATURE_PREFIXES = [
  // ...existing...
  'marketing_brand_',
] as const
```

- [ ] **Step 6: 권한 검증 스크립트 실행**

```bash
npm run check:permissions
```

Expected: 통과.

- [ ] **Step 7: 커밋**

```bash
git add src/types/permissions.ts
git commit -m "feat(marketing/brand): marketing_brand_view/manage 권한 등록"
```

---

### Task 4: 메뉴 등록

**Files:**
- Modify: `src/config/menuConfig.ts`

- [ ] **Step 1: MENU_CONFIG에 항목 추가**

`MENU_CONFIG` 배열의 마케팅 관련 항목 근처에 추가:

```ts
{
  key: 'marketing-brand',
  label: '브랜드 이미지',
  href: '/dashboard/marketing/brand',
  permissions: ['marketing_brand_view'],
  premiumFeatureId: 'marketing',
},
```

(기존 메뉴 항목의 형식과 일치하도록 — 실제 항목 구조 확인 후 적용)

- [ ] **Step 2: 빌드 검증**

```bash
npm run build
```

Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/config/menuConfig.ts
git commit -m "feat(marketing/brand): 사이드바 '브랜드 이미지' 메뉴 추가"
```

---

## Phase 2: 합성 엔진

### Task 5: 타입 정의 및 색상 프리셋

**Files:**
- Create: `src/types/brand.ts`
- Create: `src/lib/marketing/brand/presets.ts`

- [ ] **Step 1: `src/types/brand.ts` 작성**

```ts
export type BrandImageType = 'medical_law' | 'title' | 'photo';

export type MedicalLawPresetKey =
  | 'yellow_black'
  | 'mint_navy'
  | 'sand_green'
  | 'pink_charcoal'
  | 'white_blue';

export interface BrandAssets {
  id: string;
  clinic_id: string;
  name_ko: string | null;
  name_en: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  slogan: string | null;
  medical_law_preset: MedicalLawPresetKey;
  medical_law_top_text: string;
  medical_law_bottom_text: string;
  created_at: string;
  updated_at: string;
}

export interface BrandPhoto {
  id: string;
  clinic_id: string;
  photo_url: string;
  caption: string | null;
  sort_order: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface MedicalLawPreset {
  key: MedicalLawPresetKey;
  label: string;
  background: string;
  accent: string;
  textOnAccent: string;
  textOnBackground: string;
}

// Render API payload
export interface RenderMedicalLawPayload {
  type: 'medical_law';
}

export interface RenderTitleCardPayload {
  type: 'title';
  copy: string;
}

export interface RenderPhotoPayload {
  type: 'photo';
  photoId: string;
}

export type RenderPayload =
  | RenderMedicalLawPayload
  | RenderTitleCardPayload
  | RenderPhotoPayload;

// 글 작성 폼이 글 생성 옵션에 함께 전달
export interface BrandImageOptions {
  medicalLaw: { enabled: boolean; positions: ('top' | 'middle' | 'bottom')[] };
  title:       { enabled: boolean; positions: ('top' | 'middle' | 'bottom')[]; copy: string };
  photo:       { enabled: boolean; positions: ('top' | 'middle' | 'bottom')[]; mode: 'random' | 'manual' | 'rotate'; photoId?: string };
}
```

- [ ] **Step 2: `src/lib/marketing/brand/presets.ts` 작성**

```ts
import type { MedicalLawPreset, MedicalLawPresetKey } from '@/types/brand';

export const MEDICAL_LAW_PRESETS: Record<MedicalLawPresetKey, MedicalLawPreset> = {
  yellow_black: {
    key: 'yellow_black',
    label: '노랑/블랙 — 강한 시인성',
    background: '#FBC531',
    accent: '#1B1B1B',
    textOnAccent: '#FFFFFF',
    textOnBackground: '#1B1B1B',
  },
  mint_navy: {
    key: 'mint_navy',
    label: '민트그린/네이비 — 청결·신뢰',
    background: '#A8E6CF',
    accent: '#1A237E',
    textOnAccent: '#FFFFFF',
    textOnBackground: '#0D1B5E',
  },
  sand_green: {
    key: 'sand_green',
    label: '샌드베이지/다크그린 — 차분·자연',
    background: '#F5E6CA',
    accent: '#2E5339',
    textOnAccent: '#F5E6CA',
    textOnBackground: '#2E5339',
  },
  pink_charcoal: {
    key: 'pink_charcoal',
    label: '소프트핑크/차콜 — 따뜻함',
    background: '#F8C9D4',
    accent: '#3A3A3A',
    textOnAccent: '#FFFFFF',
    textOnBackground: '#3A3A3A',
  },
  white_blue: {
    key: 'white_blue',
    label: '퓨어화이트/딥블루 — 미니멀',
    background: '#FFFFFF',
    accent: '#0B3D91',
    textOnAccent: '#FFFFFF',
    textOnBackground: '#0B3D91',
  },
};

export const MEDICAL_LAW_PRESET_LIST = Object.values(MEDICAL_LAW_PRESETS);
```

- [ ] **Step 3: 빌드 검증**

```bash
npm run build
```

Expected: 통과 (타입 임포트만 추가되었을 뿐).

- [ ] **Step 4: 커밋**

```bash
git add src/types/brand.ts src/lib/marketing/brand/presets.ts
git commit -m "feat(marketing/brand): 브랜드 타입 정의 + 의료법 컬러 프리셋 5종"
```

---

### Task 6: cache-key 유틸리티 (TDD)

**Files:**
- Create: `src/lib/marketing/brand/cache-key.ts`
- Create: `tests/lib/brand/cache-key.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/lib/brand/cache-key.test.ts
import { computeCacheKey } from '@/lib/marketing/brand/cache-key';
import type { BrandAssets } from '@/types/brand';

const sampleAssets: BrandAssets = {
  id: 'a', clinic_id: 'c', name_ko: '강남숙면치과', name_en: 'GANGNAM SM',
  logo_url: 'https://example/logo.png', primary_color: '#1B5E20', secondary_color: '#FFC107',
  slogan: '책임진료', medical_law_preset: 'yellow_black',
  medical_law_top_text: '본 포스팅은…', medical_law_bottom_text: '모든 시술…',
  created_at: '', updated_at: '',
};

describe('computeCacheKey', () => {
  it('same inputs → same key (deterministic)', () => {
    const a = computeCacheKey('medical_law', sampleAssets, {});
    const b = computeCacheKey('medical_law', sampleAssets, {});
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{40}$/); // sha1 hex
  });

  it('different copy → different title key', () => {
    const a = computeCacheKey('title', sampleAssets, { copy: 'A' });
    const b = computeCacheKey('title', sampleAssets, { copy: 'B' });
    expect(a).not.toBe(b);
  });

  it('photo key depends only on photoId + name + logo', () => {
    const a = computeCacheKey('photo', sampleAssets, { photoId: 'p1' });
    const b = computeCacheKey('photo', sampleAssets, { photoId: 'p1' });
    const c = computeCacheKey('photo', sampleAssets, { photoId: 'p2' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('medical_law key ignores primary_color (irrelevant input)', () => {
    const a = computeCacheKey('medical_law', sampleAssets, {});
    const b = computeCacheKey('medical_law', { ...sampleAssets, primary_color: '#000000' }, {});
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

```bash
npx jest tests/lib/brand/cache-key.test.ts
```

Expected: FAIL — `cache-key.ts` 미존재.

- [ ] **Step 3: `cache-key.ts` 구현**

```ts
import { createHash } from 'crypto';
import type { BrandAssets, BrandImageType } from '@/types/brand';

interface KeyInputs {
  copy?: string;
  photoId?: string;
}

export function computeCacheKey(
  type: BrandImageType,
  assets: BrandAssets,
  inputs: KeyInputs,
): string {
  const parts: string[] = [type];
  // type별로 영향을 주는 필드만 포함하여, 무관 필드 변경에는 캐시가 무효화되지 않게 한다
  switch (type) {
    case 'medical_law':
      parts.push(
        assets.name_ko ?? '',
        assets.logo_url ?? '',
        assets.medical_law_preset,
        assets.medical_law_top_text,
        assets.medical_law_bottom_text,
      );
      break;
    case 'title':
      parts.push(
        assets.name_ko ?? '',
        assets.name_en ?? '',
        assets.logo_url ?? '',
        assets.primary_color,
        assets.slogan ?? '',
        inputs.copy ?? '',
      );
      break;
    case 'photo':
      parts.push(
        assets.name_ko ?? '',
        assets.logo_url ?? '',
        inputs.photoId ?? '',
      );
      break;
  }
  return createHash('sha1').update(parts.join('\x1f')).digest('hex');
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest tests/lib/brand/cache-key.test.ts
```

Expected: 4개 테스트 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/marketing/brand/cache-key.ts tests/lib/brand/cache-key.test.ts
git commit -m "feat(marketing/brand): cache-key 유틸리티 + TDD"
```

---

### Task 7: MedicalLawNotice 템플릿 (satori JSX)

**Files:**
- Create: `src/lib/marketing/brand/templates/MedicalLawNotice.tsx`

- [ ] **Step 1: 템플릿 컴포넌트 작성**

```tsx
import type { BrandAssets, MedicalLawPreset } from '@/types/brand';

interface Props {
  assets: BrandAssets;
  preset: MedicalLawPreset;
  logoDataUrl: string | null;
}

// satori는 React DOM을 렌더링하지 않고 JSX 트리를 SVG로 직접 변환한다.
// 인라인 스타일과 flex 레이아웃만 사용 가능하다.
export function MedicalLawNotice({ assets, preset, logoDataUrl }: Props) {
  const clinicName = assets.name_ko || '';
  const topText = assets.medical_law_top_text.replace('{clinic_name}', clinicName);
  const bottomText = assets.medical_law_bottom_text;

  return (
    <div style={{
      width: 1200, height: 630, display: 'flex', flexDirection: 'column',
      background: preset.background, fontFamily: 'Pretendard',
    }}>
      {/* 상단 박스 */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 80px',
      }}>
        <div style={{
          background: '#FFFFFF', borderRadius: 16, padding: '32px 48px',
          border: `4px solid ${preset.accent}`,
          fontSize: 32, color: preset.textOnBackground,
          textAlign: 'center', lineHeight: 1.5,
        }}>
          {topText}
        </div>
      </div>
      {/* 하단 박스 */}
      <div style={{
        background: preset.accent, color: preset.textOnAccent,
        padding: '36px 80px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 16,
      }}>
        <div style={{ fontSize: 28, textAlign: 'center', lineHeight: 1.5 }}>
          {bottomText}
        </div>
        {logoDataUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={logoDataUrl} width={48} height={48} alt="" />
            <span style={{ fontSize: 26, fontWeight: 700 }}>{clinicName}</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인 (lint/type)**

```bash
npm run build
```

Expected: 통과 — 아직 호출자가 없어 컴포넌트만 존재.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/marketing/brand/templates/MedicalLawNotice.tsx
git commit -m "feat(marketing/brand): MedicalLawNotice satori JSX 템플릿"
```

---

### Task 8: TitleCard 템플릿

**Files:**
- Create: `src/lib/marketing/brand/templates/TitleCard.tsx`

- [ ] **Step 1: 템플릿 작성**

```tsx
import type { BrandAssets } from '@/types/brand';

interface Props {
  assets: BrandAssets;
  copy: string;            // 사용자 입력, 최대 30자 + 1회 개행
  logoDataUrl: string | null;
}

export function TitleCard({ assets, copy, logoDataUrl }: Props) {
  const primary = assets.primary_color;
  const slogan = assets.slogan ?? '';
  const nameKo = assets.name_ko ?? '';
  const nameEn = assets.name_en ?? '';

  // 30자 + 개행 1회 제한 (스펙 5.5)
  const truncated = copy.length > 31 ? copy.slice(0, 30) + '…' : copy;

  return (
    <div style={{
      width: 1080, height: 1080, display: 'flex', padding: 40,
      background: '#FFFFFF', fontFamily: 'Pretendard',
    }}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: primary, borderRadius: 24, padding: 60,
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* 슬로건 */}
        {slogan && (
          <div style={{
            background: 'rgba(0,0,0,0.6)', color: '#FFFFFF',
            padding: '12px 28px', borderRadius: 999,
            fontSize: 28, fontWeight: 700,
          }}>
            {slogan}
          </div>
        )}
        {/* 중앙 카피 */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', whiteSpace: 'pre-wrap',
          fontSize: 110, fontWeight: 900, color: '#FBC531',
          textShadow: '4px 4px 0 #1B1B1B',
        }}>
          {truncated}
        </div>
        {/* 영문명 */}
        {nameEn && (
          <div style={{
            fontSize: 26, letterSpacing: 4, color: 'rgba(255,255,255,0.7)',
            fontFamily: 'Inter',
          }}>
            {nameEn}
          </div>
        )}
        {/* 로고 + 한글명 */}
        {(logoDataUrl || nameKo) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            background: '#FFFFFF', borderRadius: 16, padding: '14px 28px',
          }}>
            {logoDataUrl && <img src={logoDataUrl} width={56} height={56} alt="" />}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: '#1B1B1B' }}>
                {nameKo}
              </span>
              {nameEn && (
                <span style={{ fontSize: 16, color: '#666666', fontFamily: 'Inter' }}>
                  {nameEn}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 검증**

```bash
npm run build
```

Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/marketing/brand/templates/TitleCard.tsx
git commit -m "feat(marketing/brand): TitleCard satori JSX 템플릿"
```

---

### Task 9: PhotoOverlay 템플릿 (sharp 직접)

**Files:**
- Create: `src/lib/marketing/brand/templates/PhotoOverlay.tsx`

PhotoOverlay는 satori 대신 sharp로 사진 위에 SVG 워터마크를 합성한다.

- [ ] **Step 1: 합성 함수 작성**

```ts
// src/lib/marketing/brand/templates/PhotoOverlay.tsx (확장자는 그대로 .tsx 유지하나 JSX 미사용)
import sharp from 'sharp';
import type { BrandAssets } from '@/types/brand';

interface Props {
  assets: BrandAssets;
  photoBuffer: Buffer;  // 원본 사진
  logoBuffer: Buffer | null;
}

const MAX_W = 1600;
const MAX_H = 1200;

export async function renderPhotoOverlay({ assets, photoBuffer, logoBuffer }: Props): Promise<Buffer> {
  // 1. 사진 리사이즈 (긴 변 기준)
  const base = sharp(photoBuffer).rotate(); // EXIF 회전 보정
  const meta = await base.metadata();
  const w = meta.width ?? MAX_W;
  const h = meta.height ?? MAX_H;
  const scale = Math.min(MAX_W / w, MAX_H / h, 1);
  const targetW = Math.round(w * scale);
  const targetH = Math.round(h * scale);

  let pipeline = base.resize(targetW, targetH, { fit: 'inside' });

  // 2. 워터마크 SVG (우상단)
  const nameKo = (assets.name_ko ?? '').replace(/[<>&"]/g, '');
  const nameEn = (assets.name_en ?? '').replace(/[<>&"]/g, '');
  const wmW = 360;
  const wmH = 90;
  const wmX = targetW - wmW - 24;
  const wmY = 24;

  const overlays: sharp.OverlayOptions[] = [];

  if (logoBuffer) {
    const logoSized = await sharp(logoBuffer).resize(72, 72, { fit: 'inside' }).png().toBuffer();
    overlays.push({ input: logoSized, top: wmY + 9, left: wmX + 12 });
  }

  const textSvg = `
    <svg width="${wmW - (logoBuffer ? 96 : 12)}" height="${wmH}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .ko { font: bold 28px Pretendard, sans-serif; fill: #FFFFFF; }
        .en { font: 14px Inter, sans-serif; fill: #DADADA; letter-spacing: 2px; }
      </style>
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" rx="12" ry="12"/>
      <text x="16" y="40" class="ko">${nameKo}</text>
      <text x="16" y="64" class="en">${nameEn}</text>
    </svg>
  `;
  overlays.push({ input: Buffer.from(textSvg), top: wmY, left: wmX + (logoBuffer ? 96 : 0) });

  pipeline = pipeline.composite(overlays);
  return pipeline.png().toBuffer();
}
```

- [ ] **Step 2: 빌드 검증**

```bash
npm run build
```

Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/marketing/brand/templates/PhotoOverlay.tsx
git commit -m "feat(marketing/brand): PhotoOverlay sharp 합성 함수"
```

---

### Task 10: render-engine (오케스트레이션)

**Files:**
- Create: `src/lib/marketing/brand/render-engine.ts`

- [ ] **Step 1: 폰트 로더 + 렌더 엔진 작성**

```ts
import satori from 'satori';
import sharp from 'sharp';
import { readFile } from 'fs/promises';
import path from 'path';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { computeCacheKey } from './cache-key';
import { MEDICAL_LAW_PRESETS } from './presets';
import { MedicalLawNotice } from './templates/MedicalLawNotice';
import { TitleCard } from './templates/TitleCard';
import { renderPhotoOverlay } from './templates/PhotoOverlay';
import type { BrandAssets, BrandImageType, BrandPhoto } from '@/types/brand';

const BUCKET = 'marketing-brand';

let cachedFonts: Awaited<ReturnType<typeof loadFonts>> | null = null;

async function loadFonts() {
  const root = process.cwd();
  const [pretendard, inter] = await Promise.all([
    readFile(path.join(root, 'public/fonts/PretendardVariable.ttf')),
    readFile(path.join(root, 'public/fonts/Inter-Regular.ttf')),
  ]);
  return [
    { name: 'Pretendard', data: pretendard, weight: 400 as const, style: 'normal' as const },
    { name: 'Pretendard', data: pretendard, weight: 700 as const, style: 'normal' as const },
    { name: 'Pretendard', data: pretendard, weight: 900 as const, style: 'normal' as const },
    { name: 'Inter', data: inter, weight: 400 as const, style: 'normal' as const },
  ];
}

async function fetchAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchAsDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  const buf = await fetchAsBuffer(url);
  const b64 = buf.toString('base64');
  const ext = url.split('.').pop()?.toLowerCase() || 'png';
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${b64}`;
}

interface RenderArgs {
  type: BrandImageType;
  assets: BrandAssets;
  copy?: string;
  photo?: BrandPhoto;
}

export async function renderBrandImage({ type, assets, copy, photo }: RenderArgs): Promise<string> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Supabase admin client unavailable');

  const cacheKey = computeCacheKey(type, assets, { copy, photoId: photo?.id });

  // 1. 캐시 조회
  const { data: cached } = await admin
    .from('clinic_brand_image_renders')
    .select('image_url')
    .eq('clinic_id', assets.clinic_id)
    .eq('image_type', type)
    .eq('cache_key', cacheKey)
    .maybeSingle();
  if (cached?.image_url) return cached.image_url;

  // 2. 합성
  const fonts = (cachedFonts ??= await loadFonts());
  let pngBuffer: Buffer;

  if (type === 'medical_law') {
    const preset = MEDICAL_LAW_PRESETS[assets.medical_law_preset];
    const logoDataUrl = await fetchAsDataUrl(assets.logo_url);
    const svg = await satori(
      MedicalLawNotice({ assets, preset, logoDataUrl }) as React.ReactElement,
      { width: 1200, height: 630, fonts },
    );
    pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  } else if (type === 'title') {
    if (typeof copy !== 'string') throw new Error('title render requires copy');
    const logoDataUrl = await fetchAsDataUrl(assets.logo_url);
    const svg = await satori(
      TitleCard({ assets, copy, logoDataUrl }) as React.ReactElement,
      { width: 1080, height: 1080, fonts },
    );
    pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  } else if (type === 'photo') {
    if (!photo) throw new Error('photo render requires photo');
    const photoBuffer = await fetchAsBuffer(photo.photo_url);
    const logoBuffer = assets.logo_url ? await fetchAsBuffer(assets.logo_url) : null;
    pngBuffer = await renderPhotoOverlay({ assets, photoBuffer, logoBuffer });
  } else {
    throw new Error(`Unsupported brand image type: ${type}`);
  }

  // 3. Storage 업로드
  const objectPath = `clinics/${assets.clinic_id}/renders/${type}/${cacheKey}.png`;
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(objectPath, pngBuffer, { contentType: 'image/png', upsert: true });
  if (uploadErr) throw uploadErr;

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
  const publicUrl = pub.publicUrl;

  // 4. 캐시 INSERT (동시성: ON CONFLICT 무시)
  await admin
    .from('clinic_brand_image_renders')
    .upsert(
      { clinic_id: assets.clinic_id, image_type: type, cache_key: cacheKey, image_url: publicUrl },
      { onConflict: 'clinic_id,image_type,cache_key' },
    );

  return publicUrl;
}
```

(컴포넌트가 React 노드 반환이지만 satori는 React 트리를 직접 받지 않고 `react-element` 형태로 받음. 위 캐스팅이 동작 안 하면 `React.createElement(MedicalLawNotice, props)`로 바꿔 호출.)

- [ ] **Step 2: 호출 형태 보정**

위 import 형태가 satori v0.10+에서 정상 동작하는지 빌드로 확인. 실패 시 다음과 같이 변경:

```ts
import React from 'react';
const element = React.createElement(MedicalLawNotice, { assets, preset, logoDataUrl });
const svg = await satori(element, { width: 1200, height: 630, fonts });
```

- [ ] **Step 3: 빌드 검증**

```bash
npm run build
```

Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/marketing/brand/render-engine.ts
git commit -m "feat(marketing/brand): render-engine 오케스트레이션 (satori+sharp+캐시)"
```

---

### Task 11: render API 엔드포인트

**Files:**
- Create: `src/app/api/marketing/brand/render/route.ts`

- [ ] **Step 1: 라우트 작성**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { renderBrandImage } from '@/lib/marketing/brand/render-engine';
import type { BrandAssets, BrandImageType, BrandPhoto } from '@/types/brand';

export const maxDuration = 60;

interface RenderBody {
  type: BrandImageType;
  copy?: string;
  photoId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

    const body: RenderBody = await request.json();
    if (!body.type) return NextResponse.json({ error: 'type 누락' }, { status: 400 });

    // 사용자의 clinic_id 조회
    const { data: profile } = await admin
      .from('users')
      .select('clinic_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.clinic_id) return NextResponse.json({ error: '소속 클리닉 없음' }, { status: 403 });
    const clinicId = profile.clinic_id;

    // 자산 조회
    const { data: assets } = await admin
      .from('clinic_brand_assets')
      .select('*')
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (!assets) return NextResponse.json({ error: '브랜드 자산 미설정' }, { status: 404 });

    // 사진 조회 (필요 시)
    let photo: BrandPhoto | undefined;
    if (body.type === 'photo') {
      if (!body.photoId) return NextResponse.json({ error: 'photoId 필요' }, { status: 400 });
      const { data: p } = await admin
        .from('clinic_brand_photos')
        .select('*')
        .eq('id', body.photoId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
      if (!p) return NextResponse.json({ error: '사진 없음' }, { status: 404 });
      photo = p as BrandPhoto;
    }

    const url = await renderBrandImage({
      type: body.type,
      assets: assets as BrandAssets,
      copy: body.copy,
      photo,
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[brand/render] error:', err);
    const message = err instanceof Error ? err.message : '렌더 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: 빌드 검증**

```bash
npm run build
```

Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/marketing/brand/render/route.ts
git commit -m "feat(marketing/brand): /api/marketing/brand/render 엔드포인트"
```

---

## Phase 3: 자산 관리 API

### Task 12: 자산 GET/PUT API

**Files:**
- Create: `src/app/api/marketing/brand/assets/route.ts`

- [ ] **Step 1: 라우트 작성**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { BrandAssets, MedicalLawPresetKey } from '@/types/brand';

const VALID_PRESETS: MedicalLawPresetKey[] = ['yellow_black', 'mint_navy', 'sand_green', 'pink_charcoal', 'white_blue'];

async function getClinicId(userId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin.from('users').select('clinic_id').eq('id', userId).maybeSingle();
  return data?.clinic_id ?? null;
}

async function checkManagePermission(userId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data } = await admin
    .from('users')
    .select('permissions')
    .eq('id', userId)
    .maybeSingle();
  const perms = (data?.permissions ?? []) as string[];
  return perms.includes('marketing_brand_manage');
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const clinicId = await getClinicId(user.id);
  if (!clinicId) return NextResponse.json({ error: '소속 클리닉 없음' }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  const { data } = await admin
    .from('clinic_brand_assets')
    .select('*')
    .eq('clinic_id', clinicId)
    .maybeSingle();

  return NextResponse.json({ assets: data ?? null });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const canManage = await checkManagePermission(user.id);
  if (!canManage) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

  const clinicId = await getClinicId(user.id);
  if (!clinicId) return NextResponse.json({ error: '소속 클리닉 없음' }, { status: 403 });

  const body = await request.json();
  const preset: MedicalLawPresetKey = VALID_PRESETS.includes(body.medical_law_preset)
    ? body.medical_law_preset
    : 'yellow_black';

  const payload: Partial<BrandAssets> = {
    name_ko: body.name_ko ?? null,
    name_en: body.name_en ?? null,
    logo_url: body.logo_url ?? null,
    primary_color: body.primary_color || '#1B5E20',
    secondary_color: body.secondary_color || '#FFC107',
    slogan: body.slogan ?? null,
    medical_law_preset: preset,
    medical_law_top_text: body.medical_law_top_text || '본 포스팅은 의료법 제56조 및 동법 시행령을 준수하여 {clinic_name}에서 정보제공을 위해 직접 작성하였습니다.',
    medical_law_bottom_text: body.medical_law_bottom_text || '모든 시술 및 수술은 부작용이 발생할 수 있으니 의료진과 충분한 상담 후 치료받으시기 바랍니다.',
  };

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  // UPSERT
  const { data, error } = await admin
    .from('clinic_brand_assets')
    .upsert({ clinic_id: clinicId, ...payload }, { onConflict: 'clinic_id' })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 자산 변경 시 medical_law·title 캐시는 cache_key가 자동으로 새로워져 다음 호출 때 재생성됨.
  // 별도 명시적 무효화는 불필요.

  return NextResponse.json({ assets: data });
}
```

- [ ] **Step 2: 빌드 검증**

```bash
npm run build
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/marketing/brand/assets/route.ts
git commit -m "feat(marketing/brand): assets GET/PUT API"
```

---

### Task 13: 사진 업로드 API

**Files:**
- Create: `src/app/api/marketing/brand/photos/route.ts`
- Create: `src/app/api/marketing/brand/photos/[id]/route.ts`

- [ ] **Step 1: `photos/route.ts` 작성 (목록 + 업로드)**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

const BUCKET = 'marketing-brand';
const MAX_BYTES = 10 * 1024 * 1024;

async function getClinicId(userId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin.from('users').select('clinic_id, permissions').eq('id', userId).maybeSingle();
  return data;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const profile = await getClinicId(user.id);
  if (!profile?.clinic_id) return NextResponse.json({ error: '소속 클리닉 없음' }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  const { data } = await admin
    .from('clinic_brand_photos')
    .select('*')
    .eq('clinic_id', profile.clinic_id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  return NextResponse.json({ photos: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const profile = await getClinicId(user.id);
  if (!profile?.clinic_id) return NextResponse.json({ error: '소속 클리닉 없음' }, { status: 403 });
  const perms = (profile.permissions ?? []) as string[];
  if (!perms.includes('marketing_brand_manage')) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get('file');
  const caption = (formData.get('caption') as string | null) ?? null;
  if (!(file instanceof File)) return NextResponse.json({ error: '파일 누락' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: '10MB 이하만 가능' }, { status: 413 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  const photoId = randomUUID();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const objectPath = `clinics/${profile.clinic_id}/photos/${photoId}.${ext}`;
  const arrBuf = await file.arrayBuffer();
  const { error: upErr } = await admin.storage.from(BUCKET).upload(objectPath, Buffer.from(arrBuf), {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(objectPath);

  const { data: row, error: insErr } = await admin
    .from('clinic_brand_photos')
    .insert({
      id: photoId,
      clinic_id: profile.clinic_id,
      photo_url: pub.publicUrl,
      caption,
      uploaded_by: user.id,
    })
    .select('*')
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ photo: row });
}
```

- [ ] **Step 2: `photos/[id]/route.ts` 작성 (PATCH/DELETE)**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = 'marketing-brand';

async function getProfile(userId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin.from('users').select('clinic_id, permissions').eq('id', userId).maybeSingle();
  return data;
}

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const profile = await getProfile(user.id);
  const perms = (profile?.permissions ?? []) as string[];
  if (!profile?.clinic_id || !perms.includes('marketing_brand_manage')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.caption === 'string' || body.caption === null) updates.caption = body.caption;
  if (typeof body.sort_order === 'number') updates.sort_order = body.sort_order;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: '업데이트할 필드 없음' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  const { data, error } = await admin
    .from('clinic_brand_photos')
    .update(updates)
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ photo: data });
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const profile = await getProfile(user.id);
  const perms = (profile?.permissions ?? []) as string[];
  if (!profile?.clinic_id || !perms.includes('marketing_brand_manage')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  const { data: photo } = await admin
    .from('clinic_brand_photos')
    .select('photo_url')
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)
    .maybeSingle();

  await admin.from('clinic_brand_photos').delete().eq('id', id).eq('clinic_id', profile.clinic_id);

  if (photo?.photo_url) {
    const prefix = `/storage/v1/object/public/${BUCKET}/`;
    const idx = photo.photo_url.indexOf(prefix);
    if (idx >= 0) {
      const path = photo.photo_url.slice(idx + prefix.length);
      await admin.storage.from(BUCKET).remove([path]);
    }
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: 빌드 검증**

```bash
npm run build
```

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/marketing/brand/photos/
git commit -m "feat(marketing/brand): 사진 업로드/수정/삭제 API"
```

---

## Phase 4: 설정 페이지 UI

### Task 14: useBrandAssets 훅

**Files:**
- Create: `src/hooks/useBrandAssets.ts`

- [ ] **Step 1: 훅 작성**

```ts
'use client';
import { useCallback, useEffect, useState } from 'react';
import type { BrandAssets, BrandPhoto } from '@/types/brand';

export function useBrandAssets() {
  const [assets, setAssets] = useState<BrandAssets | null>(null);
  const [photos, setPhotos] = useState<BrandPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, p] = await Promise.all([
        fetch('/api/marketing/brand/assets').then(r => r.json()),
        fetch('/api/marketing/brand/photos').then(r => r.json()),
      ]);
      setAssets(a.assets);
      setPhotos(p.photos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const saveAssets = useCallback(async (input: Partial<BrandAssets>) => {
    const res = await fetch('/api/marketing/brand/assets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '저장 실패');
    setAssets(json.assets);
    return json.assets as BrandAssets;
  }, []);

  const uploadPhoto = useCallback(async (file: File, caption?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (caption) fd.append('caption', caption);
    const res = await fetch('/api/marketing/brand/photos', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '업로드 실패');
    setPhotos(prev => [...prev, json.photo]);
    return json.photo as BrandPhoto;
  }, []);

  const deletePhoto = useCallback(async (id: string) => {
    const res = await fetch(`/api/marketing/brand/photos/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || '삭제 실패');
    }
    setPhotos(prev => prev.filter(p => p.id !== id));
  }, []);

  const updatePhoto = useCallback(async (id: string, update: Partial<Pick<BrandPhoto, 'caption' | 'sort_order'>>) => {
    const res = await fetch(`/api/marketing/brand/photos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '수정 실패');
    setPhotos(prev => prev.map(p => p.id === id ? json.photo : p));
  }, []);

  return { assets, photos, loading, error, refresh, saveAssets, uploadPhoto, deletePhoto, updatePhoto };
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/hooks/useBrandAssets.ts
git commit -m "feat(marketing/brand): useBrandAssets 클라이언트 훅"
```

---

### Task 15: MedicalLawPresetPicker 컴포넌트

**Files:**
- Create: `src/components/marketing/brand/MedicalLawPresetPicker.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';
import { MEDICAL_LAW_PRESET_LIST } from '@/lib/marketing/brand/presets';
import type { MedicalLawPresetKey } from '@/types/brand';

interface Props {
  value: MedicalLawPresetKey;
  onChange: (key: MedicalLawPresetKey) => void;
}

export function MedicalLawPresetPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {MEDICAL_LAW_PRESET_LIST.map(p => (
        <button
          key={p.key}
          type="button"
          onClick={() => onChange(p.key)}
          className={`relative rounded-xl border-2 overflow-hidden text-left transition-all ${
            value === p.key ? 'border-at-accent shadow-md' : 'border-at-border hover:border-at-text-weak'
          }`}
        >
          <div className="h-20 flex" style={{ background: p.background }}>
            <div className="flex-1" />
            <div className="w-1/3 flex items-center justify-center" style={{ background: p.accent, color: p.textOnAccent, fontSize: 11, fontWeight: 700 }}>
              {p.label.split(' — ')[0]}
            </div>
          </div>
          <div className="px-2 py-1.5 bg-white">
            <p className="text-[11px] font-medium text-at-text">{p.label.split(' — ')[0]}</p>
            <p className="text-[10px] text-at-text-weak">{p.label.split(' — ')[1] ?? ''}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/marketing/brand/MedicalLawPresetPicker.tsx
git commit -m "feat(marketing/brand): MedicalLawPresetPicker 5종 라디오 카드"
```

---

### Task 16: BrandPhotoUploader 컴포넌트

**Files:**
- Create: `src/components/marketing/brand/BrandPhotoUploader.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';
import { useRef } from 'react';
import type { BrandPhoto } from '@/types/brand';
import { TrashIcon, PhotoIcon } from '@heroicons/react/24/outline';

interface Props {
  photos: BrandPhoto[];
  onUpload: (file: File) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
  onUpdateCaption: (id: string, caption: string) => Promise<void>;
}

export function BrandPhotoUploader({ photos, onUpload, onDelete, onUpdateCaption }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      try { await onUpload(f); } catch (e) { console.error(e); }
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      <div
        className="border-2 border-dashed border-at-border rounded-xl p-6 text-center hover:border-at-accent cursor-pointer"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        <PhotoIcon className="h-8 w-8 mx-auto text-at-text-weak" />
        <p className="text-sm text-at-text-secondary mt-2">사진을 드래그하거나 클릭하여 업로드</p>
        <p className="text-xs text-at-text-weak mt-0.5">JPG/PNG, 10MB 이하 — 갯수 제한 없음</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map(photo => (
            <div key={photo.id} className="rounded-lg border border-at-border overflow-hidden bg-white">
              <div className="aspect-[4/3] bg-at-surface-alt">
                <img src={photo.photo_url} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="p-2 space-y-1.5">
                <input
                  type="text"
                  value={photo.caption ?? ''}
                  placeholder="캡션 (예: 임플란트 시술실)"
                  onBlur={(e) => onUpdateCaption(photo.id, e.target.value)}
                  className="w-full text-xs px-1.5 py-1 border border-at-border rounded"
                />
                <button
                  type="button"
                  onClick={() => onDelete(photo.id)}
                  className="text-[11px] text-red-600 hover:underline inline-flex items-center gap-1"
                >
                  <TrashIcon className="h-3 w-3" /> 삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/marketing/brand/BrandPhotoUploader.tsx
git commit -m "feat(marketing/brand): BrandPhotoUploader 드래그 업로드 + 그리드"
```

---

### Task 17: BrandPreview 컴포넌트

**Files:**
- Create: `src/components/marketing/brand/BrandPreview.tsx`

- [ ] **Step 1: 컴포넌트 작성**

서버 합성 API를 디바운스 호출하여 3종 이미지를 미리본다.

```tsx
'use client';
import { useEffect, useState } from 'react';
import type { BrandAssets, BrandPhoto } from '@/types/brand';

interface Props {
  assets: BrandAssets | null;
  photos: BrandPhoto[];
  sampleCopy?: string;  // 텍스트 카드 미리보기용
}

const TYPES = [
  { type: 'medical_law', label: '의료법 안내' },
  { type: 'title', label: '텍스트 카드' },
  { type: 'photo', label: '병원 사진' },
] as const;

export function BrandPreview({ assets, photos, sampleCopy = '강남숙면치과 / 임플란트' }: Props) {
  const [urls, setUrls] = useState<Partial<Record<typeof TYPES[number]['type'], string>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!assets) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const requests: Promise<{ key: string; url?: string }>[] = [];
        requests.push(
          fetch('/api/marketing/brand/render', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'medical_law' }),
          }).then(r => r.json()).then(j => ({ key: 'medical_law', url: j.url })),
        );
        requests.push(
          fetch('/api/marketing/brand/render', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'title', copy: sampleCopy }),
          }).then(r => r.json()).then(j => ({ key: 'title', url: j.url })),
        );
        if (photos.length > 0) {
          requests.push(
            fetch('/api/marketing/brand/render', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'photo', photoId: photos[0].id }),
            }).then(r => r.json()).then(j => ({ key: 'photo', url: j.url })),
          );
        }
        const results = await Promise.all(requests);
        if (cancelled) return;
        const next: typeof urls = {};
        for (const r of results) (next as Record<string, string | undefined>)[r.key] = r.url;
        setUrls(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [assets, photos, sampleCopy]);

  if (!assets) return <p className="text-sm text-at-text-weak">먼저 자산을 저장해주세요.</p>;

  return (
    <div className="space-y-4">
      {TYPES.map(({ type, label }) => (
        <div key={type} className="rounded-lg border border-at-border bg-white p-3">
          <p className="text-xs font-semibold text-at-text-secondary mb-2">{label}</p>
          {urls[type] ? (
            <img src={urls[type]} alt={label} className="max-w-full rounded" />
          ) : (
            <div className="aspect-video bg-at-surface-alt flex items-center justify-center text-xs text-at-text-weak">
              {loading ? '합성 중…' : type === 'photo' && photos.length === 0 ? '사진을 먼저 업로드해주세요' : '대기'}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/marketing/brand/BrandPreview.tsx
git commit -m "feat(marketing/brand): BrandPreview 3종 실시간 미리보기"
```

---

### Task 18: BrandSettingsForm 컴포넌트

**Files:**
- Create: `src/components/marketing/brand/BrandSettingsForm.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';
import { useState, useEffect } from 'react';
import type { BrandAssets, MedicalLawPresetKey } from '@/types/brand';
import { MedicalLawPresetPicker } from './MedicalLawPresetPicker';

interface Props {
  assets: BrandAssets | null;
  onSave: (input: Partial<BrandAssets>) => Promise<BrandAssets>;
  onLogoUpload: (file: File) => Promise<string>; // returns logo URL
}

export function BrandSettingsForm({ assets, onSave, onLogoUpload }: Props) {
  const [nameKo, setNameKo] = useState(assets?.name_ko ?? '');
  const [nameEn, setNameEn] = useState(assets?.name_en ?? '');
  const [logoUrl, setLogoUrl] = useState(assets?.logo_url ?? '');
  const [primary, setPrimary] = useState(assets?.primary_color ?? '#1B5E20');
  const [secondary, setSecondary] = useState(assets?.secondary_color ?? '#FFC107');
  const [slogan, setSlogan] = useState(assets?.slogan ?? '');
  const [preset, setPreset] = useState<MedicalLawPresetKey>(assets?.medical_law_preset ?? 'yellow_black');
  const [topText, setTopText] = useState(assets?.medical_law_top_text ?? '본 포스팅은 의료법 제56조 및 동법 시행령을 준수하여 {clinic_name}에서 정보제공을 위해 직접 작성하였습니다.');
  const [bottomText, setBottomText] = useState(assets?.medical_law_bottom_text ?? '모든 시술 및 수술은 부작용이 발생할 수 있으니 의료진과 충분한 상담 후 치료받으시기 바랍니다.');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assets) return;
    setNameKo(assets.name_ko ?? '');
    setNameEn(assets.name_en ?? '');
    setLogoUrl(assets.logo_url ?? '');
    setPrimary(assets.primary_color);
    setSecondary(assets.secondary_color);
    setSlogan(assets.slogan ?? '');
    setPreset(assets.medical_law_preset);
    setTopText(assets.medical_law_top_text);
    setBottomText(assets.medical_law_bottom_text);
  }, [assets]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await onSave({
        name_ko: nameKo || null,
        name_en: nameEn || null,
        logo_url: logoUrl || null,
        primary_color: primary,
        secondary_color: secondary,
        slogan: slogan || null,
        medical_law_preset: preset,
        medical_law_top_text: topText,
        medical_law_bottom_text: bottomText,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleLogo = async (file: File) => {
    try {
      const url = await onLogoUpload(file);
      setLogoUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '로고 업로드 실패');
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="클리닉명 (한글)">
          <input value={nameKo} onChange={(e) => setNameKo(e.target.value)} className={inputCls} placeholder="강남숙면치과" />
        </Field>
        <Field label="클리닉명 (영문)">
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={inputCls} placeholder="GANGNAM SM DENTAL CLINIC" />
        </Field>
      </div>

      <Field label="로고 이미지">
        <div className="flex items-center gap-3">
          {logoUrl && <img src={logoUrl} alt="" className="h-16 w-16 object-contain bg-white border border-at-border rounded" />}
          <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 border border-at-border rounded-lg hover:bg-at-surface-alt text-sm">
            업로드
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogo(f); }} />
          </label>
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="주 브랜드 컬러">
          <div className="flex items-center gap-2">
            <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-9 w-12 cursor-pointer" />
            <input value={primary} onChange={(e) => setPrimary(e.target.value)} className={inputCls} />
          </div>
        </Field>
        <Field label="보조 브랜드 컬러">
          <div className="flex items-center gap-2">
            <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-9 w-12 cursor-pointer" />
            <input value={secondary} onChange={(e) => setSecondary(e.target.value)} className={inputCls} />
          </div>
        </Field>
      </div>

      <Field label="슬로건 (텍스트 이미지 상단)">
        <input value={slogan} onChange={(e) => setSlogan(e.target.value)} className={inputCls} placeholder="보건복지부 인증 치주과 전문의 의료진의 책임진료!" />
      </Field>

      <Field label="의료법 안내 컬러 프리셋">
        <MedicalLawPresetPicker value={preset} onChange={setPreset} />
      </Field>

      <Field label="의료법 안내 — 상단 문장">
        <textarea value={topText} onChange={(e) => setTopText(e.target.value)} className={`${inputCls} min-h-[60px]`} />
        <p className="text-[11px] text-at-text-weak mt-1">{'`{clinic_name}`은 클리닉명으로 자동 치환됩니다.'}</p>
      </Field>

      <Field label="의료법 안내 — 하단 문장">
        <textarea value={bottomText} onChange={(e) => setBottomText(e.target.value)} className={`${inputCls} min-h-[60px]`} />
      </Field>

      {error && <p className="text-sm text-at-error">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-at-accent text-white rounded-lg text-sm font-medium hover:bg-at-accent-hover disabled:opacity-50"
      >
        {saving ? '저장 중…' : '브랜드 자산 저장'}
      </button>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-at-border rounded-lg text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-at-text-secondary mb-1.5">{label}</label>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/marketing/brand/BrandSettingsForm.tsx
git commit -m "feat(marketing/brand): BrandSettingsForm 입력 폼"
```

---

### Task 19: 로고 업로드 보조 API + 페이지

**Files:**
- Create: `src/app/api/marketing/brand/logo/route.ts`
- Create: `src/app/dashboard/marketing/brand/page.tsx`
- Create: `src/app/dashboard/marketing/brand/BrandSettingsClient.tsx`

- [ ] **Step 1: 로고 업로드 API**

```ts
// src/app/api/marketing/brand/logo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = 'marketing-brand';
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  const { data: profile } = await admin
    .from('users')
    .select('clinic_id, permissions')
    .eq('id', user.id)
    .maybeSingle();
  const perms = (profile?.permissions ?? []) as string[];
  if (!profile?.clinic_id || !perms.includes('marketing_brand_manage')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }

  const fd = await request.formData();
  const file = fd.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: '파일 없음' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: '5MB 이하' }, { status: 413 });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const objectPath = `clinics/${profile.clinic_id}/logo.${ext}`;
  const arrBuf = await file.arrayBuffer();
  const { error: upErr } = await admin.storage.from(BUCKET).upload(objectPath, Buffer.from(arrBuf), {
    contentType: file.type || 'image/png',
    upsert: true,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
  return NextResponse.json({ url: pub.publicUrl });
}
```

- [ ] **Step 2: 페이지 (서버 컴포넌트, 권한 가드)**

기존 마케팅 페이지의 권한 체크 패턴을 참조하여 작성. 핵심:

```tsx
// src/app/dashboard/marketing/brand/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BrandSettingsClient } from './BrandSettingsClient';

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth');

  const { data: profile } = await supabase
    .from('users')
    .select('permissions')
    .eq('id', user.id)
    .maybeSingle();
  const perms = (profile?.permissions ?? []) as string[];
  if (!perms.includes('marketing_brand_view')) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-at-text-secondary">이 페이지를 볼 권한이 없습니다.</p>
      </div>
    );
  }

  return <BrandSettingsClient canManage={perms.includes('marketing_brand_manage')} />;
}
```

- [ ] **Step 3: 클라이언트 컴포넌트**

```tsx
// src/app/dashboard/marketing/brand/BrandSettingsClient.tsx
'use client';
import { useBrandAssets } from '@/hooks/useBrandAssets';
import { BrandSettingsForm } from '@/components/marketing/brand/BrandSettingsForm';
import { BrandPhotoUploader } from '@/components/marketing/brand/BrandPhotoUploader';
import { BrandPreview } from '@/components/marketing/brand/BrandPreview';

interface Props { canManage: boolean }

export function BrandSettingsClient({ canManage }: Props) {
  const { assets, photos, loading, saveAssets, uploadPhoto, deletePhoto, updatePhoto } = useBrandAssets();

  const handleLogoUpload = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/marketing/brand/logo', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '업로드 실패');
    return json.url;
  };

  if (loading) return <div className="p-8 text-sm text-at-text-weak">불러오는 중…</div>;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-at-text">브랜드 이미지 설정</h1>
        <p className="text-sm text-at-text-secondary mt-1">블로그 글에 자동으로 삽입될 의료법 안내·텍스트 카드·사진 오버레이의 디자인 자산을 설정합니다.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl border border-at-border p-5">
            <h2 className="text-sm font-semibold text-at-text mb-4">자산 입력</h2>
            {canManage ? (
              <BrandSettingsForm assets={assets} onSave={saveAssets} onLogoUpload={handleLogoUpload} />
            ) : (
              <p className="text-sm text-at-text-weak">조회만 가능합니다 (자산 관리 권한 없음).</p>
            )}
          </section>

          <section className="bg-white rounded-xl border border-at-border p-5">
            <h2 className="text-sm font-semibold text-at-text mb-4">병원 사진 ({photos.length}장)</h2>
            {canManage ? (
              <BrandPhotoUploader
                photos={photos}
                onUpload={uploadPhoto}
                onDelete={deletePhoto}
                onUpdateCaption={(id, caption) => updatePhoto(id, { caption })}
              />
            ) : (
              <p className="text-sm text-at-text-weak">조회만 가능합니다.</p>
            )}
          </section>
        </div>

        <aside className="lg:col-span-1">
          <section className="bg-white rounded-xl border border-at-border p-5 sticky top-4">
            <h2 className="text-sm font-semibold text-at-text mb-4">미리보기</h2>
            <BrandPreview assets={assets} photos={photos} />
          </section>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 빌드 검증**

```bash
npm run build
```

Expected: 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/marketing/brand/logo/ src/app/dashboard/marketing/brand/
git commit -m "feat(marketing/brand): 브랜드 이미지 설정 페이지"
```

---

## Phase 5: 글 작성 폼 통합

### Task 20: BrandImageOptions를 ContentGenerateOptions에 추가

**Files:**
- Modify: `src/types/marketing.ts`

- [ ] **Step 1: import 추가 + 옵션 필드 확장**

`src/types/marketing.ts`에서 `ContentGenerateOptions` 인터페이스에 추가:

```ts
import type { BrandImageOptions } from './brand'; // 또는 동일 파일이라면 이 줄 생략하고 brand.ts에서 직접 export

// ... 기존 필드 그대로 유지 ...
export interface ContentGenerateOptions {
  // ... 기존 ...
  brandImageOptions?: BrandImageOptions;
}
```

(`brand.ts`에서 import 사용. 순환 의존이 발생하면 `BrandImageOptions`를 `marketing.ts`로 옮기거나 별도 공용 타입 파일로 분리한다.)

- [ ] **Step 2: 빌드 검증**

```bash
npm run build
```

- [ ] **Step 3: 커밋**

```bash
git add src/types/marketing.ts src/types/brand.ts
git commit -m "feat(marketing/brand): ContentGenerateOptions에 brandImageOptions 추가"
```

---

### Task 21: BrandImageSection 컴포넌트

**Files:**
- Create: `src/components/marketing/brand/BrandImageSection.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useBrandAssets } from '@/hooks/useBrandAssets';
import type { BrandImageOptions } from '@/types/brand';
import Link from 'next/link';

interface Props {
  clinicNameForCopy: string;        // 자동 카피 채움용
  keyword: string;
  value: BrandImageOptions;
  onChange: (next: BrandImageOptions) => void;
  disabled?: boolean;
}

const POSITIONS: { key: 'top' | 'middle' | 'bottom'; label: string }[] = [
  { key: 'top', label: '위' },
  { key: 'middle', label: '중간' },
  { key: 'bottom', label: '끝' },
];

export function BrandImageSection({ clinicNameForCopy, keyword, value, onChange, disabled }: Props) {
  const { assets, photos } = useBrandAssets();
  const [copyTouched, setCopyTouched] = useState(false);

  // 자동 카피 (사용자가 수정하지 않은 경우만)
  useEffect(() => {
    if (copyTouched) return;
    const auto = `${clinicNameForCopy} / ${keyword}`.trim();
    if (auto !== value.title.copy) {
      onChange({ ...value, title: { ...value.title, copy: auto } });
    }
  }, [clinicNameForCopy, keyword, copyTouched, onChange, value]);

  const togglePosition = (
    section: keyof BrandImageOptions,
    pos: 'top' | 'middle' | 'bottom',
  ) => {
    const cur = value[section].positions;
    const next = cur.includes(pos) ? cur.filter(p => p !== pos) : [...cur, pos];
    onChange({ ...value, [section]: { ...value[section], positions: next } });
  };

  const setEnabled = (section: keyof BrandImageOptions, enabled: boolean) => {
    onChange({ ...value, [section]: { ...value[section], enabled } });
  };

  if (!assets) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
        브랜드 이미지가 아직 설정되지 않았습니다.{' '}
        <Link href="/dashboard/marketing/brand" className="text-amber-800 underline">설정 페이지로 이동</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-at-border p-4 bg-at-surface-alt/40">
      <p className="text-sm font-semibold text-at-text">브랜드 이미지</p>

      {/* 의료법 */}
      <Row
        label="의료법 안내 이미지"
        enabled={value.medicalLaw.enabled}
        onEnabledChange={(v) => setEnabled('medicalLaw', v)}
        disabled={disabled}
      >
        <PositionPicker positions={value.medicalLaw.positions} onToggle={(p) => togglePosition('medicalLaw', p)} disabled={disabled || !value.medicalLaw.enabled} />
      </Row>

      {/* 텍스트 */}
      <Row
        label="텍스트 카드 이미지"
        enabled={value.title.enabled}
        onEnabledChange={(v) => setEnabled('title', v)}
        disabled={disabled}
      >
        <PositionPicker positions={value.title.positions} onToggle={(p) => togglePosition('title', p)} disabled={disabled || !value.title.enabled} />
        <input
          type="text"
          value={value.title.copy}
          onChange={(e) => { setCopyTouched(true); onChange({ ...value, title: { ...value.title, copy: e.target.value } }); }}
          disabled={disabled || !value.title.enabled}
          placeholder="중앙 큰 글씨 (자동 채움 — 수정 가능)"
          className="mt-2 w-full px-2 py-1.5 border border-at-border rounded text-xs"
        />
      </Row>

      {/* 사진 */}
      <Row
        label="병원 사진 이미지"
        enabled={value.photo.enabled}
        onEnabledChange={(v) => setEnabled('photo', v)}
        disabled={disabled || photos.length === 0}
      >
        {photos.length === 0 ? (
          <p className="text-xs text-at-text-weak">사진이 없습니다 — 설정 페이지에서 업로드하세요.</p>
        ) : (
          <>
            <PositionPicker positions={value.photo.positions} onToggle={(p) => togglePosition('photo', p)} disabled={disabled || !value.photo.enabled} />
            <div className="mt-2 flex items-center gap-3 text-xs">
              {(['random', 'manual', 'rotate'] as const).map(m => (
                <label key={m} className="inline-flex items-center gap-1">
                  <input type="radio" checked={value.photo.mode === m}
                    onChange={() => onChange({ ...value, photo: { ...value.photo, mode: m, photoId: m === 'manual' ? value.photo.photoId : undefined } })}
                    disabled={disabled || !value.photo.enabled} />
                  {m === 'random' ? '랜덤' : m === 'manual' ? '직접 선택' : '순서 회전'}
                </label>
              ))}
            </div>
            {value.photo.mode === 'manual' && (
              <div className="mt-2 grid grid-cols-4 sm:grid-cols-6 gap-2">
                {photos.map(p => (
                  <button key={p.id} type="button"
                    onClick={() => onChange({ ...value, photo: { ...value.photo, photoId: p.id } })}
                    className={`rounded overflow-hidden border-2 ${value.photo.photoId === p.id ? 'border-at-accent' : 'border-transparent'}`}
                  >
                    <img src={p.photo_url} alt="" className="w-full aspect-square object-cover" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </Row>
    </div>
  );
}

function Row({ label, enabled, onEnabledChange, disabled, children }: { label: string; enabled: boolean; onEnabledChange: (v: boolean) => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 border-t border-at-border pt-3 first:border-t-0 first:pt-0">
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} disabled={disabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        <span className="font-medium text-at-text-secondary">{label}</span>
      </label>
      <div className="pl-6">{children}</div>
    </div>
  );
}

function PositionPicker({ positions, onToggle, disabled }: { positions: ('top' | 'middle' | 'bottom')[]; onToggle: (p: 'top' | 'middle' | 'bottom') => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3 text-xs text-at-text-secondary">
      <span>위치:</span>
      {POSITIONS.map(({ key, label }) => (
        <label key={key} className="inline-flex items-center gap-1">
          <input type="checkbox" checked={positions.includes(key)} disabled={disabled}
            onChange={() => onToggle(key)} />
          {label}
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/marketing/brand/BrandImageSection.tsx
git commit -m "feat(marketing/brand): 글 작성 폼용 BrandImageSection"
```

---

### Task 22: NewPostForm에 BrandImageSection 통합

**Files:**
- Modify: `src/components/marketing/NewPostForm.tsx`

- [ ] **Step 1: state 추가**

`useState`로 `brandImageOptions` 추가, 기본값:

```ts
const [brandImageOptions, setBrandImageOptions] = useState<BrandImageOptions>({
  medicalLaw: { enabled: true, positions: ['top'] },
  title:      { enabled: true, positions: ['middle'], copy: '' },
  photo:      { enabled: true, positions: ['bottom'], mode: 'random' },
});
```

- [ ] **Step 2: 섹션 추가**

기존 SEO 미리보기 섹션 다음, 이미지 옵션 섹션 앞에 새 섹션 추가:

```tsx
<section>
  <SectionHeader number={4} title="브랜드 이미지" icon={SparklesIcon} iconColor="text-violet-600" iconBg="bg-violet-50" />
  <fieldset disabled={isGenerating} className="transition-opacity">
    <BrandImageSection
      clinicNameForCopy={clinicName /* 기존 폼이 가진 값 사용 */}
      keyword={keyword}
      value={brandImageOptions}
      onChange={setBrandImageOptions}
      disabled={isGenerating}
    />
  </fieldset>
</section>
```

뒤따르는 섹션 번호(이미지 옵션, 일정 등)를 +1씩 시프트.

- [ ] **Step 3: submit payload에 포함**

`onSubmit`에서 `ContentGenerateOptions`에 `brandImageOptions`를 포함하여 generate API로 전송.

- [ ] **Step 4: 빌드 검증**

```bash
npm run build
```

- [ ] **Step 5: 커밋**

```bash
git add src/components/marketing/NewPostForm.tsx
git commit -m "feat(marketing/brand): NewPostForm에 브랜드 이미지 섹션 통합"
```

---

### Task 23: marker-resolver (TDD)

**Files:**
- Create: `src/lib/marketing/brand/marker-resolver.ts`
- Create: `tests/lib/brand/marker-resolver.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/lib/brand/marker-resolver.test.ts
import { parseBrandMarkers } from '@/lib/marketing/brand/marker-resolver';

describe('parseBrandMarkers', () => {
  it('detects medical_law marker', () => {
    const markers = parseBrandMarkers('hello [BRAND_IMAGE:medical_law] world');
    expect(markers).toEqual([{ raw: '[BRAND_IMAGE:medical_law]', type: 'medical_law', params: {}, index: 6 }]);
  });

  it('parses title with copy parameter', () => {
    const markers = parseBrandMarkers('[BRAND_IMAGE:title|copy=강남숙면치과 / 임플란트]');
    expect(markers).toHaveLength(1);
    expect(markers[0].type).toBe('title');
    expect(markers[0].params.copy).toBe('강남숙면치과 / 임플란트');
  });

  it('parses photo with id', () => {
    const markers = parseBrandMarkers('[BRAND_IMAGE:photo|id=abc-123]');
    expect(markers[0].type).toBe('photo');
    expect(markers[0].params.id).toBe('abc-123');
  });

  it('parses photo with mode', () => {
    const markers = parseBrandMarkers('[BRAND_IMAGE:photo|mode=random]');
    expect(markers[0].params.mode).toBe('random');
  });

  it('returns empty for body without markers', () => {
    expect(parseBrandMarkers('no markers here')).toEqual([]);
  });
});
```

- [ ] **Step 2: 실행하여 실패 확인**

```bash
npx jest tests/lib/brand/marker-resolver.test.ts
```

Expected: FAIL.

- [ ] **Step 3: 구현**

```ts
// src/lib/marketing/brand/marker-resolver.ts
import { renderBrandImage } from './render-engine';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { BrandAssets, BrandImageType, BrandPhoto } from '@/types/brand';

export interface BrandMarker {
  raw: string;
  type: BrandImageType;
  params: Record<string, string>;
  index: number;
}

const MARKER_RE = /\[BRAND_IMAGE:([a-z_]+)(?:\|([^\]]*))?\]/g;

export function parseBrandMarkers(body: string): BrandMarker[] {
  const out: BrandMarker[] = [];
  for (const m of body.matchAll(MARKER_RE)) {
    const type = m[1] as BrandImageType;
    if (type !== 'medical_law' && type !== 'title' && type !== 'photo') continue;
    const params: Record<string, string> = {};
    if (m[2]) {
      for (const pair of m[2].split('|')) {
        const eq = pair.indexOf('=');
        if (eq < 0) continue;
        params[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
      }
    }
    out.push({ raw: m[0], type, params, index: m.index ?? 0 });
  }
  return out;
}

interface ResolveContext {
  clinicId: string;
  rotateCounter?: number; // 'rotate' 모드용 시드
}

export async function resolveBrandMarkers(body: string, ctx: ResolveContext): Promise<string> {
  const markers = parseBrandMarkers(body);
  if (markers.length === 0) return body;

  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('admin 미가용');

  const { data: assets } = await admin
    .from('clinic_brand_assets')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle();
  if (!assets) return body; // 자산 없으면 마커 그대로 두지 않고 빈 문자열로 치환
  const a = assets as BrandAssets;

  // 사진 풀 미리 로드 (random/rotate에 사용)
  const { data: photoRows } = await admin
    .from('clinic_brand_photos')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .order('sort_order', { ascending: true });
  const photos = (photoRows ?? []) as BrandPhoto[];

  let out = body;
  let rotateIdx = ctx.rotateCounter ?? 0;

  // markers index가 변동되므로 끝에서부터 치환
  for (const marker of markers.slice().reverse()) {
    let url = '';
    try {
      if (marker.type === 'medical_law') {
        url = await renderBrandImage({ type: 'medical_law', assets: a });
      } else if (marker.type === 'title') {
        const copy = marker.params.copy || `${a.name_ko ?? ''} / `.trim();
        url = await renderBrandImage({ type: 'title', assets: a, copy });
      } else if (marker.type === 'photo') {
        let chosen: BrandPhoto | undefined;
        if (marker.params.id) {
          chosen = photos.find(p => p.id === marker.params.id);
        } else if (marker.params.mode === 'rotate') {
          if (photos.length > 0) chosen = photos[rotateIdx++ % photos.length];
        } else if (marker.params.mode === 'random' || !marker.params.mode) {
          if (photos.length > 0) chosen = photos[Math.floor(Math.random() * photos.length)];
        }
        if (chosen) url = await renderBrandImage({ type: 'photo', assets: a, photo: chosen });
      }
    } catch (err) {
      console.error('[brand marker resolve] error:', err);
    }
    const replacement = url ? `\n\n![](${url})\n\n` : '';
    out = out.slice(0, marker.index) + replacement + out.slice(marker.index + marker.raw.length);
  }

  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest tests/lib/brand/marker-resolver.test.ts
```

Expected: 5개 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/marketing/brand/marker-resolver.ts tests/lib/brand/marker-resolver.test.ts
git commit -m "feat(marketing/brand): 본문 마커 파서/리졸버 + TDD"
```

---

### Task 24: content-generator에서 마커 삽입

**Files:**
- Modify: `src/lib/marketing/content-generator.ts`

- [ ] **Step 1: 본문 후처리에 마커 삽입 헬퍼 추가**

`generateContent` 마지막 단계(반환 직전)에 `brandImageOptions`에 따라 본문에 마커를 끼워 넣는다. 헬퍼:

```ts
import type { BrandImageOptions } from '@/types/brand';

function insertBrandMarkers(body: string, opts?: BrandImageOptions): string {
  if (!opts) return body;

  // 위치 파싱: H2/H3 헤딩 위치를 찾음 (마크다운 가정)
  const lines = body.split('\n');
  const headingIdx: number[] = [];
  lines.forEach((l, i) => { if (/^##\s/.test(l)) headingIdx.push(i); });
  const middleHeading = headingIdx.length > 0 ? headingIdx[Math.floor(headingIdx.length / 2)] : Math.floor(lines.length / 2);

  type Spot = 'top' | 'middle' | 'bottom';
  const buckets: Record<Spot, string[]> = { top: [], middle: [], bottom: [] };

  const pushSorted = (spot: Spot, type: 'medical_law' | 'title' | 'photo', marker: string) => {
    buckets[spot].push(marker);
  };

  if (opts.medicalLaw.enabled) {
    for (const pos of opts.medicalLaw.positions) pushSorted(pos, 'medical_law', '[BRAND_IMAGE:medical_law]');
  }
  if (opts.title.enabled) {
    const copy = opts.title.copy.replace(/\]/g, '');
    for (const pos of opts.title.positions) pushSorted(pos, 'title', `[BRAND_IMAGE:title|copy=${copy}]`);
  }
  if (opts.photo.enabled) {
    const tail = opts.photo.mode === 'manual' && opts.photo.photoId
      ? `id=${opts.photo.photoId}`
      : `mode=${opts.photo.mode}`;
    for (const pos of opts.photo.positions) pushSorted(pos, 'photo', `[BRAND_IMAGE:photo|${tail}]`);
  }

  // 우선순위 정렬: medical_law → title → photo (스펙 5.4)
  const order = (m: string) => m.includes('medical_law') ? 0 : m.includes('title') ? 1 : 2;
  for (const k of ['top', 'middle', 'bottom'] as const) {
    buckets[k].sort((a, b) => order(a) - order(b));
  }

  const top = buckets.top.join('\n\n');
  const middle = buckets.middle.join('\n\n');
  const bottom = buckets.bottom.join('\n\n');

  let result = '';
  if (top) result += top + '\n\n';
  if (middle && headingIdx.length > 0) {
    const before = lines.slice(0, middleHeading).join('\n');
    const after = lines.slice(middleHeading).join('\n');
    result += before + '\n\n' + middle + '\n\n' + after;
  } else {
    result += body;
    if (middle) result += '\n\n' + middle;
  }
  if (bottom) result += '\n\n' + bottom;
  return result;
}
```

- [ ] **Step 2: `generateContent` 반환 직전 호출**

`return { title, body, ... }` 직전에:

```ts
const finalBody = insertBrandMarkers(parsed.body, options.brandImageOptions);
return { title: parsed.title, body: finalBody, /* ...rest unchanged */ };
```

- [ ] **Step 3: 빌드 검증**

```bash
npm run build
```

- [ ] **Step 4: 커밋**

```bash
git add src/lib/marketing/content-generator.ts
git commit -m "feat(marketing/brand): content-generator에서 BRAND_IMAGE 마커 삽입"
```

---

### Task 25: generate API에서 마커 → URL 치환

**Files:**
- Modify: `src/app/api/marketing/generate/route.ts`

- [ ] **Step 1: 마커 리졸버 호출 단계 추가**

`generate` 흐름의 본문 가공 단계(이미지 생성 직후 또는 직전)에 다음 호출을 추가:

```ts
import { resolveBrandMarkers } from '@/lib/marketing/brand/marker-resolver';

// ... 기존 본문이 fullBody에 있다고 가정 ...
const bodyWithBrand = await resolveBrandMarkers(fullBody, { clinicId });
```

`bodyWithBrand`를 이후 단계(저장, 응답)에서 사용. 기존 `[IMAGE: 설명]` AI 마커 처리는 변경하지 않는다.

- [ ] **Step 2: 빌드 검증**

```bash
npm run build
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/marketing/generate/route.ts
git commit -m "feat(marketing/brand): generate API에 brand 마커 리졸버 적용"
```

---

## Phase 6: E2E 검증 및 배포

### Task 26: 브라우저 수동 검증

**Files:** (없음 — 검증만)

- [ ] **Step 1: 개발 서버 실행**

```bash
npm run dev
```

- [ ] **Step 2: Chrome DevTools MCP로 테스트 계정 로그인**

테스트 계정 `whitedc0902@gmail.com` / `ghkdgmltn81!` 로그인.

- [ ] **Step 3: 브랜드 이미지 설정 페이지 검증**

`/dashboard/marketing/brand` 진입 → 다음 항목 확인:
- 자산 폼 입력 가능 (한/영문, 컬러, 슬로건, 의료법 텍스트)
- 5종 프리셋 라디오 카드 노출, 선택 가능
- 로고 업로드 → 미리보기 즉시 표시
- 사진 드래그 업로드 (3장 이상)
- "브랜드 자산 저장" 클릭 → 저장 성공 메시지 / 에러 없음
- 우측 미리보기에 의료법 안내·텍스트 카드·사진 오버레이 PNG가 모두 합성되어 표시

- [ ] **Step 4: 글 작성 폼 검증**

`/dashboard/marketing/posts/new` 진입 → 키워드 입력 → 브랜드 이미지 섹션에서:
- 3종 토글 모두 ON 기본값 확인
- 위치 체크박스 변경 가능
- 텍스트 카피 자동 채움(`{name_ko} / {keyword}`) → 직접 수정 가능
- 사진 모드 3종 라디오 + manual 시 사진 그리드 노출
- 글 생성 실행 → 본문에 브랜드 이미지 3장이 정확히 삽입되는지 확인 (마크다운 미리보기 또는 발행 직전 본문 inspect)

- [ ] **Step 5: 콘솔 에러 0건 확인**

`mcp__chrome-devtools__list_console_messages` (types: ['error'])로 에러 없음 확인.

- [ ] **Step 6: 문제 발견 시**

해당 Task로 돌아가 수정 → Step 1~5 반복. 모든 항목 정상 작동까지 반복.

---

### Task 27: 빌드 + develop 푸시

- [ ] **Step 1: 최종 빌드**

```bash
npm run build
```

Expected: 통과.

- [ ] **Step 2: 권한 검증**

```bash
npm run check:permissions
```

Expected: 통과.

- [ ] **Step 3: develop 푸시**

```bash
git push origin develop
```

푸시 실패 시(rebase 필요 등): 원인 파악 → `git pull --rebase origin develop` → 충돌 해결 → 다시 푸시 (멈추지 말고 자동 재시도).

- [ ] **Step 4: PR 생성 + main 머지 (사용자 지시 시)**

CLAUDE.md 규칙: "기능 정상 작동확인 되면 develop 브랜치에 푸쉬하고 pr 생성 후 main 에 병합"

```bash
gh pr create --base main --head develop --title "feat: 클리닉 브랜드 이미지 템플릿 시스템" --body "$(cat <<'EOF'
## Summary
- 3종 브랜드 이미지(의료법 안내·텍스트 카드·사진 오버레이) 템플릿 시스템 추가
- satori + sharp 기반 결정적 합성, 결과 캐시
- 마스터 설정 페이지 + 글 작성 폼 통합
- 기존 [IMAGE: ...] AI 이미지 마커는 변경 없음, 호환 유지

## Test plan
- [ ] 브랜드 이미지 설정 페이지에서 자산/사진 저장
- [ ] 미리보기 3종 정상 합성
- [ ] 글 작성 시 브랜드 이미지 섹션 노출, 위치/모드 변경 동작
- [ ] 글 생성 후 본문에 브랜드 이미지 PNG가 위치별로 삽입되는지 확인

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

머지 후 main의 최신 상태 확인.

---

## Self-Review

### Spec coverage
| Spec 섹션 | 커버하는 Task |
|----------|--------------|
| 2.1 의료법 안내 템플릿 | Task 7 |
| 2.2 텍스트 카드 템플릿 | Task 8 |
| 2.3 사진 오버레이 템플릿 | Task 9 |
| 3.1 DB 스키마 | Task 2 |
| 3.2 RLS | Task 2 |
| 3.3 Storage 버킷 | Task 2 |
| 4.1 satori + sharp 라이브러리 | Task 1, 10 |
| 4.2 render API | Task 11, 12, 13, 19 |
| 4.3 JSX 템플릿 | Task 7, 8, 9 |
| 5.1 마스터 페이지 | Task 14~19 |
| 5.2 글 작성 폼 섹션 | Task 21, 22 |
| 5.3 본문 마커 메커니즘 | Task 23, 24, 25 |
| 5.4 위치 알고리즘 | Task 24 |
| 5.5 카피 치환 규칙 | Task 8 (TitleCard 자르기) + Task 7 (`{clinic_name}` 치환) |
| 6 권한 | Task 3 |
| 7 메뉴 | Task 4 |
| 10 테스트 | Task 6, 23, 26 |

### Placeholder scan
- "TBD"/"TODO" 없음 ✓
- 모든 step에 실제 코드 또는 명령 포함 ✓
- 모든 파일 경로 명시 ✓

### Type consistency
- `BrandImageType`: 'medical_law' | 'title' | 'photo' — 모든 사용처 일치 ✓
- `BrandImageOptions`: medicalLaw / title / photo 키 → BrandImageSection·content-generator 모두 동일 ✓
- `MedicalLawPresetKey`: 5종 — presets.ts와 API 검증 일치 ✓
- `RenderArgs.copy/photo`: render-engine·marker-resolver·render API 시그니처 일치 ✓
