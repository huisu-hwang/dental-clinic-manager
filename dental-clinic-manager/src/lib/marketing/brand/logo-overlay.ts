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

async function loadClinicBrand(clinicId: string): Promise<{ logoUrl: string; nameKo: string; nameEn: string | null } | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('clinic_brand_assets')
    .select('logo_url, name_ko, name_en')
    .eq('clinic_id', clinicId)
    .maybeSingle();
  const logoUrl = (data?.logo_url as string | undefined)?.trim();
  const nameKo = ((data?.name_ko as string | undefined) ?? '').trim();
  const nameEn = ((data?.name_en as string | undefined) ?? '').trim() || null;
  if (!logoUrl || !nameKo) return null;
  return { logoUrl, nameKo, nameEn };
}

/**
 * 클리닉 푸터 PNG (둥근 흰 박스 안에 로고+클리닉명) 를 satori 로 합성.
 * 클리닉당 메모리 캐시 — 한 클리닉에서 여러 이미지를 만들어도 1회만 합성.
 */
async function renderFooterPng(
  clinicId: string,
  logoUrl: string,
  nameKo: string,
  targetWidthPx: number,
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  const cacheKey = `${clinicId}::${targetWidthPx}`;
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

    // satori 가 가변 폰트 메트릭에 약하므로 고정 사이즈 SVG 합성.
    // 박스 비율: width:height = 5:1 (가로형 명함 비율)
    const W = targetWidthPx;
    const H = Math.round(W / 5);
    const padding = Math.round(H * 0.18);
    const logoBoxSize = Math.round(H * 0.62);
    const fontSize = Math.round(H * 0.42);

    const fonts = await loadFonts();
    const element = React.createElement(
      'div',
      {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'white',
          borderRadius: `${Math.round(H * 0.4)}px`,
          padding: `${padding}px ${Math.round(padding * 2)}px`,
          boxSizing: 'border-box',
        },
      },
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: `${Math.round(padding * 0.8)}px`,
          },
        },
        React.createElement('img', {
          src: logoDataUrl,
          width: logoBoxSize,
          height: logoBoxSize,
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
 * 생성된 이미지(base64 PNG)에 클리닉 푸터(로고+클리닉명)를 하단 중앙에 합성한다.
 * - 푸터 폭: 이미지 폭의 38%
 * - 위치: 하단 중앙, 하단 패딩 = 짧은 변의 3%
 * - 흰 라운드 배경 박스로 다양한 배경에서도 식별성 확보
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
    const shortSide = Math.min(W, H);
    const footerW = Math.round(W * 0.38);
    const padBottom = Math.round(shortSide * 0.04);

    const footer = await renderFooterPng(clinicId, brand.logoUrl, brand.nameKo, footerW);
    if (!footer) return imageBase64;

    const left = Math.round((W - footer.width) / 2);
    const top = H - footer.height - padBottom;

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
