import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { loadUserContext, hasPermission } from '@/lib/marketing/brand/server-permissions';
import { randomUUID } from 'crypto';

const BUCKET = 'marketing-brand';
const MAX_BYTES = 10 * 1024 * 1024;

// POST /api/marketing/brand/image-sets/[id]/cards — 카드(이미지 + 카피) 추가
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const ctx = await loadUserContext(user.id);
  if (!hasPermission(ctx, 'marketing_brand_manage')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }
  if (!ctx?.clinicId) return NextResponse.json({ error: '소속 클리닉 없음' }, { status: 403 });

  const { id: setId } = await params;

  const formData = await request.formData();
  const file = formData.get('file');
  const titleCopy = (formData.get('title_copy') as string | null)?.trim() || null;
  const subtitleCopy = (formData.get('subtitle_copy') as string | null)?.trim() || null;
  if (!(file instanceof File)) return NextResponse.json({ error: '파일 누락' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: '10MB 이하만 가능' }, { status: 413 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'admin 미가용' }, { status: 500 });

  // 세트 소유 검증
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: setRow } = await (admin as any)
    .from('clinic_brand_image_sets')
    .select('id, clinic_id')
    .eq('id', setId)
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle();
  if (!setRow) return NextResponse.json({ error: '세트 없음 또는 권한 없음' }, { status: 404 });

  const cardId = randomUUID();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const objectPath = `clinics/${ctx.clinicId}/sets/${setId}/originals/${cardId}.${ext}`;
  const arrBuf = await file.arrayBuffer();
  const { error: upErr } = await admin.storage.from(BUCKET).upload(objectPath, Buffer.from(arrBuf), {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(objectPath);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error: insErr } = await (admin as any)
    .from('clinic_brand_image_set_cards')
    .insert({
      id: cardId,
      set_id: setId,
      clinic_id: ctx.clinicId,
      image_url: pub.publicUrl,
      title_copy: titleCopy,
      subtitle_copy: subtitleCopy,
    })
    .select('*')
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ card: row });
}
