import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { loadUserContext, hasPermission } from '@/lib/marketing/brand/server-permissions';

const BUCKET = 'marketing-brand';

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const ctx = await loadUserContext(user.id);
  if (!hasPermission(ctx, 'marketing_brand_manage')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }
  if (!ctx?.clinicId) return NextResponse.json({ error: '소속 클리닉 없음' }, { status: 403 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.caption === 'string' || body.caption === null) updates.caption = body.caption;
  if (typeof body.sort_order === 'number') updates.sort_order = body.sort_order;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: '업데이트할 필드 없음' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  const { data, error } = await (admin as any)
    .from('clinic_brand_photos')
    .update(updates)
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
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

  const ctx = await loadUserContext(user.id);
  if (!hasPermission(ctx, 'marketing_brand_manage')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }
  if (!ctx?.clinicId) return NextResponse.json({ error: '소속 클리닉 없음' }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  const { data: photo } = await (admin as any)
    .from('clinic_brand_photos')
    .select('photo_url')
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle();

  await (admin as any).from('clinic_brand_photos').delete().eq('id', id).eq('clinic_id', ctx.clinicId);

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
