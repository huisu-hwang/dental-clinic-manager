import sharp from 'sharp';
import satori from 'satori';
import React from 'react';
import { readFile } from 'fs/promises';
import path from 'path';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const LOGO_CACHE = new Map<string, { buffer: Buffer; fetchedAt: number }>();
const FOOTER_CACHE = new Map<string, { buffer: Buffer; width: number; height: number; fetchedAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

let cachedFonts: { name: 'Pretendard'; data: Buffer; weight: 400 | 700; style: 'normal' }[] | null = null;

async function loadFonts() {
  if (cachedFonts) return cachedFonts;
  const root = process.cwd();
  const [regular, bold] = await Promise.all([
    readFile(path.join(root, 'public/fonts/Pretendard-Regular.ttf')),
    readFile(path.join(root, 'public/fonts/Pretendard-Bold.ttf')),
  ]);
  cachedFonts = [
    { name: 'Pretendard', data: regular, weight: 400, style: 'normal' },
    { name: 'Pretendard', data: bold, weight: 700, style: 'normal' },
  ];
  return cachedFonts;
}

async function fetchLogoBuffer(logoUrl: string): Promise<Buffer | null> {
  const cached = LOGO_CACHE.get(logoUrl);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.buffer;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    LOGO_CACHE.set(logoUrl, { buffer: buf, fetchedAt: Date.now() });
    return buf;
  } catch (err) {
    console.error('[logo-overlay] fetch 실패:', err);
    return null;
  }
}

async function loadClinicBrand(clinicId: string): Promise<{ logoUrl: string; nameKo: string; nameEn: string | null; primaryColor: string | null } | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('clinic_brand_assets')
    .select('logo_url, name_ko, name_en, primary_color')
    .eq('clinic_id', clinicId)
    .maybeSingle();
  const logoUrl = (data?.logo_url as string | undefined)?.trim();
  const nameKo = ((data?.name_ko as string | undefined) ?? '').trim();
  const nameEn = ((data?.name_en as string | undefined) ?? '').trim() || null;
  const primaryColor = ((data?.primary_color as string | undefined) ?? '').trim() || null;
  if (!logoUrl || !nameKo) return null;
  return { logoUrl, nameKo, nameEn, primaryColor };
}

function isValidHexColor(s: string | null): s is string {
  return !!s && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
}

/**
 * 클리닉 푸터 PNG (가로 풀폭 흰 띠 안에 로고+클리닉명) 를 satori 로 합성.
 * 풀폭 띠 형태이므로 AI 가 그린 가짜 클리닉명/로고가 있어도 자연스럽게 완전히 덮어 가림.
 * 상단에 브랜드 컬러 1px 라인으로 시각적 분리.
 * 클리닉당 + 가로폭당 메모리 캐시 — 한 클리닉에서 여러 이미지를 만들어도 1회만 합성.
 */
async function renderFooterPng(
  clinicId: string,
  logoUrl: string,
  nameKo: string,
  primaryColor: string | null,
  imageWidthPx: number,
  imageHeightPx: number,
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  const cacheKey = `${clinicId}::${imageWidthPx}x${imageHeightPx}`;
  const cached = FOOTER_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { buffer: cached.buffer, width: cached.width, height: cached.height };
  }

  try {
    const logoBuf = await fetchLogoBuffer(logoUrl);
    if (!logoBuf) return null;
    const ext = logoUrl.split('.').pop()?.toLowerCase() || 'png';
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
    const logoDataUrl = `data:${mime};base64,${logoBuf.toString('base64')}`;

    // 풀폭 푸터 바: 이미지 가로 전체, 높이 = 이미지 짧은 변의 12%
    const W = imageWidthPx;
    const shortSide = Math.min(imageWidthPx, imageHeightPx);
    const H = Math.round(shortSide * 0.12);
    const accentLineHeight = Math.max(2, Math.round(H * 0.04));
    const logoSize = Math.round(H * 0.56);
    const fontSize = Math.round(H * 0.36);
    const gap = Math.round(H * 0.18);

    const accentColor = isValidHexColor(primaryColor) ? primaryColor : '#0ea5e9';

    const fonts = await loadFonts();
    const element = React.createElement(
      'div',
      {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'white',
        },
      },
      // 상단 brand 컬러 라인
      React.createElement('div', {
        style: { width: '100%', height: `${accentLineHeight}px`, background: accentColor },
      }),
      // 본문 (로고 + 클리닉명, 가운데 정렬)
      React.createElement(
        'div',
        {
          style: {
            flex: '1 1 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: `${gap}px`,
            paddingTop: '2px',
          },
        },
        React.createElement('img', {
          src: logoDataUrl,
          width: logoSize,
          height: logoSize,
          style: { objectFit: 'contain' },
        }),
        React.createElement(
          'span',
          {
            style: {
              fontFamily: 'Pretendard',
              fontWeight: 700,
              fontSize: `${fontSize}px`,
              color: '#111827',
              letterSpacing: '-0.02em',
            },
          },
          nameKo,
        ),
      ),
    );

    const svg = await satori(element, { width: W, height: H, fonts });
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    FOOTER_CACHE.set(cacheKey, { buffer, width: W, height: H, fetchedAt: Date.now() });
    return { buffer, width: W, height: H };
  } catch (err) {
    console.error('[logo-overlay] 푸터 렌더 실패:', err);
    return null;
  }
}

/**
 * 생성된 이미지(base64 PNG)에 클리닉 푸터(로고+클리닉명)를 하단에 가로 풀폭으로 합성한다.
 * - 푸터 폭: 이미지 가로 100%
 * - 푸터 높이: 짧은 변의 12% (AI 가 비워둔 영역에 정확히 맞춤)
 * - AI 가 그린 가짜 클리닉명/로고가 있어도 흰 배경 풀폭 띠로 자연스럽게 덮어 가림
 * - 상단에 brand primary color 1~2px 라인으로 시각적 분리
 */
export async function overlayClinicLogo(
  imageBase64: string,
  clinicId: string | undefined,
): Promise<string> {
  if (!clinicId) return imageBase64;
  try {
    const brand = await loadClinicBrand(clinicId);
    if (!brand) return imageBase64;

    const baseBuf = Buffer.from(imageBase64, 'base64');
    const base = sharp(baseBuf);
    const meta = await base.metadata();
    const W = meta.width || 1024;
    const H = meta.height || 1024;

    const footer = await renderFooterPng(
      clinicId,
      brand.logoUrl,
      brand.nameKo,
      brand.primaryColor,
      W,
      H,
    );
    if (!footer) return imageBase64;

    const left = 0;
    const top = H - footer.height;

    const out = await base
      .composite([{ input: footer.buffer, left, top }])
      .png()
      .toBuffer();

    return out.toString('base64');
  } catch (err) {
    console.error('[logo-overlay] 합성 실패 — 원본 반환:', err);
    return imageBase64;
  }
}
