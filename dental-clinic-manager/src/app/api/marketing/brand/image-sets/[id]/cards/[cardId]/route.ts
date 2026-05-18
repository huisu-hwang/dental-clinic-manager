import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { loadUserContext, hasPermission } from '@/lib/marketing/brand/server-permissions';

async function authorize() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: '인증 필요' }, { status: 401 }) };
  const ctx = await loadUserContext(user.id);
  if (!hasPermission(ctx, 'marketing_brand_manage')) {
    return { error: NextResponse.json({ error: '권한 없음' }, { status: 403 }) };
  }
  if (!ctx?.clinicId) return { error: NextResponse.json({ error: '소속 클리닉 없음' }, { status: 403 }) };
  return { clinicId: ctx.clinicId };
}

// PATCH — 카드 카피/정렬 수정
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; cardId: string }> }) {
  const auth = await authorize();
  if ('error' in auth) return auth.error;
  const { cardId } = await params;

  const body = await request.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = {};
  if (typeof body.title_copy === 'string' || body.title_copy === null) update.title_copy = body.title_copy?.trim() || null;
  if (typeof body.subtitle_copy === 'string' || body.subtitle_copy === null) update.subtitle_copy = body.subtitle_copy?.trim() || null;
  if (typeof body.sort_order === 'number') update.sort_order = body.sort_order;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: '변경 사항 없음' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('clinic_brand_image_set_cards')
    .update(update)
    .eq('id', cardId)
    .eq('clinic_id', auth.clinicId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}

// DELETE — 카드 삭제 (Storage 원본 파일은 cleanup 작업에서 별도 처리)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; cardId: string }> }) {
  const auth = await authorize();
  if ('error' in auth) return auth.error;
  const { cardId } = await params;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('clinic_brand_image_set_cards')
    .delete()
    .eq('id', cardId)
    .eq('clinic_id', auth.clinicId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
