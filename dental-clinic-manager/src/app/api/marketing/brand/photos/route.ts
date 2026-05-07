import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

const BUCKET = 'marketing-brand';
const MAX_BYTES = 10 * 1024 * 1024;

async function getProfile(userId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin.from('users').select('clinic_id, permissions').eq('id', userId).maybeSingle();
  return data;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const profile = await getProfile(user.id);
  if (!profile?.clinic_id) return NextResponse.json({ error: '소속 클리닉 없음' }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  const { data } = await (admin as any)
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

  const profile = await getProfile(user.id);
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

  const { data: row, error: insErr } = await (admin as any)
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
