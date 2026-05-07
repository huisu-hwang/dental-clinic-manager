import satori from 'satori';
import sharp from 'sharp';
import React from 'react';
import { readFile } from 'fs/promises';
import path from 'path';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { computeCacheKey } from './cache-key';
import { MEDICAL_LAW_PRESETS } from './presets';
import { MedicalLawNotice } from './templates/MedicalLawNotice';
import { TitleCard } from './templates/TitleCard';
import { renderPhotoOverlay } from './templates/PhotoOverlay';
import type { BrandAssets, BrandImageType, BrandPhoto } from '@/types/brand';

const BUCKET = 'marketing-brand';

let cachedFonts: Awaited<ReturnType<typeof loadFonts>> | null = null;

async function loadFonts() {
  const root = process.cwd();
  const [pretendardRegular, pretendardBold, pretendardBlack, inter] = await Promise.all([
    readFile(path.join(root, 'public/fonts/Pretendard-Regular.ttf')),
    readFile(path.join(root, 'public/fonts/Pretendard-Bold.ttf')),
    readFile(path.join(root, 'public/fonts/Pretendard-Black.ttf')),
    readFile(path.join(root, 'public/fonts/Inter-Regular.ttf')),
  ]);
  // satori는 가변 폰트(variable fonts) 메트릭 파싱이 실패하므로 weight별 static TTF를 사용한다.
  return [
    { name: 'Pretendard', data: pretendardRegular, weight: 400 as const, style: 'normal' as const },
    { name: 'Pretendard', data: pretendardBold, weight: 700 as const, style: 'normal' as const },
    { name: 'Pretendard', data: pretendardBlack, weight: 900 as const, style: 'normal' as const },
    { name: 'Inter', data: inter, weight: 400 as const, style: 'normal' as const },
  ];
}

async function fetchAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchAsDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  const buf = await fetchAsBuffer(url);
  const b64 = buf.toString('base64');
  const ext = url.split('.').pop()?.toLowerCase() || 'png';
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${b64}`;
}

interface RenderArgs {
  type: BrandImageType;
  assets: BrandAssets;
  copy?: string;
  photo?: BrandPhoto;
  /** true면 캐시 조회/저장을 건너뛰고 무조건 새로 합성 (라이브 미리보기 전용) */
  bypassCache?: boolean;
}

export async function renderBrandImage({ type, assets, copy, photo, bypassCache }: RenderArgs): Promise<string> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Supabase admin client unavailable');

  const cacheKey = computeCacheKey(type, assets, { copy, photoId: photo?.id });

  // 1. 캐시 조회 (테이블이 generated types에 아직 없어 any 캐스트)
  if (!bypassCache) {
    const { data: cached } = await (admin as any)
      .from('clinic_brand_image_renders')
      .select('image_url')
      .eq('clinic_id', assets.clinic_id)
      .eq('image_type', type)
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (cached?.image_url) return cached.image_url as string;
  }

  // 2. 합성
  const fonts = (cachedFonts ??= await loadFonts());
  let pngBuffer: Buffer;

  if (type === 'medical_law') {
    const preset = MEDICAL_LAW_PRESETS[assets.medical_law_preset];
    const logoDataUrl = await fetchAsDataUrl(assets.logo_url);
    const element = React.createElement(MedicalLawNotice, { assets, preset, logoDataUrl });
    const svg = await satori(element, { width: 1200, height: 630, fonts });
    pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  } else if (type === 'title') {
    if (typeof copy !== 'string') throw new Error('title render requires copy');
    const logoDataUrl = await fetchAsDataUrl(assets.logo_url);
    const element = React.createElement(TitleCard, { assets, copy, logoDataUrl });
    const svg = await satori(element, { width: 1080, height: 1080, fonts });
    pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  } else if (type === 'photo') {
    if (!photo) throw new Error('photo render requires photo');
    const photoBuffer = await fetchAsBuffer(photo.photo_url);
    const logoBuffer = assets.logo_url ? await fetchAsBuffer(assets.logo_url) : null;
    pngBuffer = await renderPhotoOverlay({ assets, photoBuffer, logoBuffer });
  } else {
    throw new Error(`Unsupported brand image type: ${type}`);
  }

  // 3. Storage 업로드 — draft 모드는 별도 폴더에 저장 (캐시 INSERT 없음, upsert로 덮어씀)
  const objectFolder = bypassCache ? 'drafts' : 'renders';
  const objectPath = `clinics/${assets.clinic_id}/${objectFolder}/${type}/${cacheKey}.png`;
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(objectPath, pngBuffer, { contentType: 'image/png', upsert: true });
  if (uploadErr) throw uploadErr;

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
  // draft URL은 브라우저 캐시 무력화 (같은 path로 덮어쓰는 경우 갱신을 보장)
  const publicUrl = bypassCache ? `${pub.publicUrl}?t=${Date.now()}` : pub.publicUrl;

  // 4. 캐시 INSERT (저장 자산일 때만)
  if (!bypassCache) {
    await (admin as any)
      .from('clinic_brand_image_renders')
      .upsert(
        { clinic_id: assets.clinic_id, image_type: type, cache_key: cacheKey, image_url: publicUrl },
        { onConflict: 'clinic_id,image_type,cache_key' },
      );
  }

  return publicUrl;
}
