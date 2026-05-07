import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { loadUserContext, hasPermission } from '@/lib/marketing/brand/server-permissions';

const BUCKET = 'marketing-brand';
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
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

  const fd = await request.formData();
  const file = fd.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: '파일 없음' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: '5MB 이하' }, { status: 413 });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const objectPath = `clinics/${ctx.clinicId}/logo.${ext}`;
  const arrBuf = await file.arrayBuffer();
  const { error: upErr } = await admin.storage.from(BUCKET).upload(objectPath, Buffer.from(arrBuf), {
    contentType: file.type || 'image/png',
    upsert: true,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
  return NextResponse.json({ url: pub.publicUrl });
}
