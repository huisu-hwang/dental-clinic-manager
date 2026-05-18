import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { loadUserContext, hasPermission } from '@/lib/marketing/brand/server-permissions';

// GET /api/marketing/brand/image-sets — 클리닉의 세트 목록(+카드 포함)
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sets } = await (admin as any)
    .from('clinic_brand_image_sets')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cards } = await (admin as any)
    .from('clinic_brand_image_set_cards')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .order('sort_order', { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged = (sets ?? []).map((s: any) => ({
    ...s,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cards: (cards ?? []).filter((c: any) => c.set_id === s.id),
  }));

  return NextResponse.json({ sets: merged });
}

// POST /api/marketing/brand/image-sets — 세트 생성
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const ctx = await loadUserContext(user.id);
  if (!hasPermission(ctx, 'marketing_brand_manage')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }
  if (!ctx?.clinicId) return NextResponse.json({ error: '소속 클리닉 없음' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = (body.name as string | undefined)?.trim();
  if (!name) return NextResponse.json({ error: '세트 이름 누락' }, { status: 400 });
  const description = (body.description as string | undefined)?.trim() || null;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('clinic_brand_image_sets')
    .insert({ clinic_id: ctx.clinicId, name, description })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ set: { ...data, cards: [] } });
}
