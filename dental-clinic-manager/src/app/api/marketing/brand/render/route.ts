import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { renderBrandImage } from '@/lib/marketing/brand/render-engine';
import type { BrandAssets, BrandImageType, BrandPhoto, DraftBrandAssets } from '@/types/brand';

export const maxDuration = 60;

interface RenderBody {
  type: BrandImageType;
  copy?: string;
  photoId?: string;
  /** 저장되지 않은 자산을 라이브 미리보기로 합성할 때 사용. 합성 결과는 캐시하지 않는다. */
  draftAssets?: DraftBrandAssets;
}

const DRAFT_KEYS: (keyof DraftBrandAssets)[] = [
  'name_ko', 'name_en', 'logo_url',
  'primary_color', 'secondary_color', 'slogan',
  'medical_law_preset', 'medical_law_top_text', 'medical_law_bottom_text',
  'title_border_width',
];

function applyDraft(base: BrandAssets, draft: DraftBrandAssets | undefined): BrandAssets {
  if (!draft) return base;
  const merged = { ...base };
  for (const k of DRAFT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(draft, k)) {
      // 안전한 동적 대입
      (merged as unknown as Record<string, unknown>)[k] = (draft as unknown as Record<string, unknown>)[k];
    }
  }
  return merged;
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
    const { data: rawAssets } = await (admin as any)
      .from('clinic_brand_assets')
      .select('*')
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (!rawAssets) return NextResponse.json({ error: '브랜드 자산 미설정' }, { status: 404 });

    const assets = applyDraft(rawAssets as BrandAssets, body.draftAssets);

    // 사진 조회 (필요 시)
    let photo: BrandPhoto | undefined;
    if (body.type === 'photo') {
      if (!body.photoId) return NextResponse.json({ error: 'photoId 필요' }, { status: 400 });
      const { data: p } = await (admin as any)
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
      assets,
      copy: body.copy,
      photo,
      // draft 모드일 때는 cache hit/miss를 캐시 테이블에 기록하지 않음 (DB 미저장 상태이므로 의미 없음)
      bypassCache: !!body.draftAssets,
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[brand/render] error:', err);
    const message = err instanceof Error ? err.message : '렌더 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
