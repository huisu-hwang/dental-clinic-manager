import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { loadUserContext, hasPermission } from '@/lib/marketing/brand/server-permissions';
import type { BrandAssets, MedicalLawPresetKey } from '@/types/brand';

const VALID_PRESETS: MedicalLawPresetKey[] = ['yellow_black', 'mint_navy', 'sand_green', 'pink_charcoal', 'white_blue'];

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const ctx = await loadUserContext(user.id);
  if (!hasPermission(ctx, 'marketing_brand_view')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }
  if (!ctx?.clinicId) return NextResponse.json({ error: '소속 클리닉 없음' }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  const { data } = await (admin as any)
    .from('clinic_brand_assets')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle();

  return NextResponse.json({ assets: data ?? null });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const ctx = await loadUserContext(user.id);
  if (!hasPermission(ctx, 'marketing_brand_manage')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }
  if (!ctx?.clinicId) return NextResponse.json({ error: '소속 클리닉 없음' }, { status: 403 });

  const body = await request.json();
  const preset: MedicalLawPresetKey = VALID_PRESETS.includes(body.medical_law_preset)
    ? body.medical_law_preset
    : 'yellow_black';

  const rawWidth = Number(body.title_border_width);
  const titleBorderWidth = Number.isFinite(rawWidth) ? Math.min(60, Math.max(0, Math.round(rawWidth))) : 16;

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
    title_border_width: titleBorderWidth,
  };

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  const { data, error } = await (admin as any)
    .from('clinic_brand_assets')
    .upsert({ clinic_id: ctx.clinicId, ...payload }, { onConflict: 'clinic_id' })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ assets: data });
}
