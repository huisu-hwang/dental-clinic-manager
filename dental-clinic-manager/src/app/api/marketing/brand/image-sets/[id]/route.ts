import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { loadUserContext, hasPermission } from '@/lib/marketing/brand/server-permissions';

async function authorize(): Promise<{ clinicId: string } | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  const ctx = await loadUserContext(user.id);
  if (!hasPermission(ctx, 'marketing_brand_manage')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }
  if (!ctx?.clinicId) return NextResponse.json({ error: '소속 클리닉 없음' }, { status: 403 });
  return { clinicId: ctx.clinicId };
}

// PATCH — 세트 이름/설명 수정
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = {};
  if (typeof body.name === 'string') update.name = body.name.trim();
  if (typeof body.description === 'string' || body.description === null) update.description = body.description?.trim() || null;
  if (typeof body.sort_order === 'number') update.sort_order = body.sort_order;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: '변경 사항 없음' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('clinic_brand_image_sets')
    .update(update)
    .eq('id', id)
    .eq('clinic_id', auth.clinicId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ set: data });
}

// DELETE — 세트 삭제 (카드는 cascade)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('clinic_brand_image_sets')
    .delete()
    .eq('id', id)
    .eq('clinic_id', auth.clinicId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
