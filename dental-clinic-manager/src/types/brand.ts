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
  /** 텍스트 카드 외곽 테두리 두께(px). 0~60. */
  title_border_width: number;
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

// 라이브 미리보기용 — 저장되지 않은 자산 변경을 임시로 합성에 적용 (캐시 안 함).
export type DraftBrandAssets = Partial<Pick<BrandAssets,
  | 'name_ko'
  | 'name_en'
  | 'logo_url'
  | 'primary_color'
  | 'secondary_color'
  | 'slogan'
  | 'medical_law_preset'
  | 'medical_law_top_text'
  | 'medical_law_bottom_text'
  | 'title_border_width'
>>;

// Render API payload
export interface RenderMedicalLawPayload {
  type: 'medical_law';
  draftAssets?: DraftBrandAssets;
}

export interface RenderTitleCardPayload {
  type: 'title';
  copy: string;
  draftAssets?: DraftBrandAssets;
}

export interface RenderPhotoPayload {
  type: 'photo';
  photoId: string;
  draftAssets?: DraftBrandAssets;
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
