import sharp from 'sharp';
import satori from 'satori';
import React from 'react';
import { readFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { BrandImageSetCard } from '@/types/brand';

const BUCKET = 'marketing-brand';
const FETCH_CACHE = new Map<string, { buffer: Buffer; fetchedAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

let cachedFonts: { name: 'Pretendard'; data: Buffer; weight: 400 | 700 | 900; style: 'normal' }[] | null = null;

async function loadFonts() {
  if (cachedFonts) return cachedFonts;
  const root = process.cwd();
  const [regular, bold, black] = await Promise.all([
    readFile(path.join(root, 'public/fonts/Pretendard-Regular.ttf')),
    readFile(path.join(root, 'public/fonts/Pretendard-Bold.ttf')),
    readFile(path.join(root, 'public/fonts/Pretendard-Black.ttf')),
  ]);
  cachedFonts = [
    { name: 'Pretendard', data: regular, weight: 400, style: 'normal' },
    { name: 'Pretendard', data: bold, weight: 700, style: 'normal' },
    { name: 'Pretendard', data: black, weight: 900, style: 'normal' },
  ];
  return cachedFonts;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const cached = FETCH_CACHE.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.buffer;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  FETCH_CACHE.set(url, { buffer: buf, fetchedAt: Date.now() });
  return buf;
}

function randInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

interface VariantOptions {
  /** 글 제목 — 텍스트 오버레이 상단에 사용 (없으면 card.title_copy 만 표시) */
  articleTitle?: string;
  /** 글 키워드 — alt 텍스트/파일명에 활용 */
  keyword?: string;
}

/**
 * 브랜드 이미지 세트의 카드를 발행 시점마다 미세 변형해서 새 PNG 로 합성·업로드한다.
 *
 * Layer 2 변형 (네이버 유사이미지 판독 회피):
 *  1. 크롭 ±5% 랜덤 (perceptual hash window 어긋남 유발)
 *  2. 색조(hue) ±3°, 채도 ±5%, 밝기 ±3% 랜덤
 *  3. 글 제목·세트 카피를 텍스트 오버레이로 합성 (가장 강한 차별화 요소)
 *  4. EXIF 완전 제거 (sharp 기본 동작 — withMetadata 생략)
 *  5. 파일명을 발행 시점/카드/글 제목 기반 해시로 매번 다르게
 */
export async function renderImageSetVariant(
  card: BrandImageSetCard,
  opts: VariantOptions = {},
): Promise<string> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('admin 미가용');

  const baseBuf = await fetchBuffer(card.image_url);
  const meta = await sharp(baseBuf).metadata();
  const srcW = meta.width || 1024;
  const srcH = meta.height || 1024;

  // 1) 크롭 ±5%: 가장자리에서 0~5% 잘라내며 위치도 약간 시프트
  const cropPct = randInRange(0.0, 0.05);
  const cropX = Math.round(srcW * cropPct * randInRange(0, 1));
  const cropY = Math.round(srcH * cropPct * randInRange(0, 1));
  const cropW = Math.max(1, Math.round(srcW * (1 - cropPct)));
  const cropH = Math.max(1, Math.round(srcH * (1 - cropPct)));

  // 2) HSL 미세 변형
  const hueShift = Math.round(randInRange(-3, 3));
  const satMult = randInRange(0.95, 1.05);
  const briMult = randInRange(0.97, 1.03);

  // 텍스트 오버레이 영역: 하단 18% 띠 (반투명 어두운 배경 + 흰 텍스트)
  // → 픽셀 분포 자체가 바뀌어 perceptual hash 회피에 가장 효과적
  const W = cropW;
  const H = cropH;
  const overlayH = Math.round(H * 0.18);
  const titleText = (opts.articleTitle || card.title_copy || '').trim();
  const subtitleText = (card.subtitle_copy || '').trim();

  const fonts = await loadFonts();
  const titleFontSize = Math.max(18, Math.round(overlayH * 0.32));
  const subtitleFontSize = Math.max(14, Math.round(overlayH * 0.22));

  const overlayElement = React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.75) 100%)',
        padding: `${Math.round(overlayH * 0.12)}px ${Math.round(W * 0.04)}px`,
        gap: `${Math.round(overlayH * 0.06)}px`,
      },
    },
    titleText
      ? React.createElement(
          'span',
          {
            style: {
              color: 'white',
              fontFamily: 'Pretendard',
              fontWeight: 900,
              fontSize: `${titleFontSize}px`,
              letterSpacing: '-0.02em',
              textAlign: 'center',
              lineHeight: 1.2,
            },
          },
          titleText,
        )
      : null,
    subtitleText
      ? React.createElement(
          'span',
          {
            style: {
              color: 'rgba(255,255,255,0.92)',
              fontFamily: 'Pretendard',
              fontWeight: 400,
              fontSize: `${subtitleFontSize}px`,
              letterSpacing: '-0.01em',
              textAlign: 'center',
              lineHeight: 1.3,
            },
          },
          subtitleText,
        )
      : null,
  );

  let overlayPng: Buffer | null = null;
  try {
    const overlaySvg = await satori(overlayElement, { width: W, height: overlayH, fonts });
    overlayPng = await sharp(Buffer.from(overlaySvg)).png().toBuffer();
  } catch (err) {
    console.warn('[image-set-variant] overlay 렌더 실패 — 오버레이 없이 진행:', err);
  }

  // sharp 파이프라인: 크롭 → modulate → 오버레이 합성 → PNG
  let pipeline = sharp(baseBuf)
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .modulate({ brightness: briMult, saturation: satMult, hue: hueShift });

  if (overlayPng) {
    pipeline = pipeline.composite([
      { input: overlayPng, left: 0, top: H - overlayH },
    ]);
  }

  // EXIF 자동 제거 (sharp 기본 동작; withMetadata 호출하지 않음)
  const out = await pipeline.png({ compressionLevel: 8 }).toBuffer();

  // 매번 다른 파일명 (perceptual hash 우회와 무관하지만 CDN 캐시 분리용)
  const variantId = randomUUID();
  const altSlug = (opts.keyword || titleText || 'image').replace(/[^a-zA-Z0-9가-힣]/g, '_').slice(0, 40);
  const objectPath = `clinics/${card.clinic_id}/sets/${card.set_id}/${card.id}/${variantId}-${altSlug}.png`;

  const { error: upErr } = await admin.storage.from(BUCKET).upload(objectPath, out, {
    contentType: 'image/png',
    upsert: false,
  });
  if (upErr) throw new Error(`variant upload 실패: ${upErr.message}`);

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
  return pub.publicUrl;
}
