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
    const { data: assets } = await (admin as any)
      .from('clinic_brand_assets')
      .select('*')
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (!assets) return NextResponse.json({ error: '브랜드 자산 미설정' }, { status: 404 });

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
