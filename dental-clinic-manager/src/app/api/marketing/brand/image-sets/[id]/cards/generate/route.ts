import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { loadUserContext, hasPermission } from '@/lib/marketing/brand/server-permissions';
import { generateBlogImage } from '@/lib/marketing/image-generator';
import { randomUUID } from 'crypto';

const BUCKET = 'marketing-brand';

// Vercel 서버리스: AI 이미지 생성은 30s+ 걸릴 수 있어 타임아웃 늘림
export const maxDuration = 120;

/**
 * POST /api/marketing/brand/image-sets/[id]/cards/generate
 *
 * 사용자 프롬프트 + 카피로 AI 이미지를 생성해 세트 카드로 저장한다.
 * - 기존 generateBlogImage 재사용 (클리닉 브랜드 prefix 자동 적용)
 * - imageStyle='infographic_only' 강제 (인물 없는 정보형 카드 — 진료시간/위치/대표 진료 등)
 * - Storage 업로드 후 clinic_brand_image_set_cards 에 INSERT
 */
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
  const body = await request.json().catch(() => ({}));
  const prompt = (body.prompt as string | undefined)?.trim();
  const titleCopy = (body.title_copy as string | undefined)?.trim() || null;
  const subtitleCopy = (body.subtitle_copy as string | undefined)?.trim() || null;
  if (!prompt) return NextResponse.json({ error: '프롬프트가 비어있습니다' }, { status: 400 });

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

  // AI 이미지 생성 (인포그래픽 스타일 — 인물 없이 정보형 카드)
  let imageBase64: string;
  try {
    const result = await generateBlogImage(
      prompt,
      'infographic_only',
      undefined,
      ctx.clinicId,
    );
    imageBase64 = result.imageBase64;
  } catch (err) {
    console.error('[brand-card-generate] 이미지 생성 실패:', err);
    const message = err instanceof Error ? err.message : '이미지 생성 실패';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Storage 업로드
  const cardId = randomUUID();
  const objectPath = `clinics/${ctx.clinicId}/sets/${setId}/originals/${cardId}.png`;
  const buffer = Buffer.from(imageBase64, 'base64');
  const { error: upErr } = await admin.storage.from(BUCKET).upload(objectPath, buffer, {
    contentType: 'image/png',
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: `업로드 실패: ${upErr.message}` }, { status: 500 });

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(objectPath);

  // 카드 INSERT
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
