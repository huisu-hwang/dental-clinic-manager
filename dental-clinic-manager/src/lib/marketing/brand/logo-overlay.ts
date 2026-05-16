import sharp from 'sharp';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const LOGO_CACHE = new Map<string, { buffer: Buffer; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * 클리닉 로고를 fetch 후 캐시. URL → PNG 버퍼.
 */
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

async function loadClinicLogoUrl(clinicId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('clinic_brand_assets')
    .select('logo_url')
    .eq('clinic_id', clinicId)
    .maybeSingle();
  const url = data?.logo_url as string | undefined;
  return url && url.trim() ? url.trim() : null;
}

/**
 * 생성된 이미지(base64 PNG)에 클리닉 로고를 우상단에 합성한다.
 * - 로고가 없으면 원본 그대로 반환.
 * - 로고 크기: 캔버스 짧은 변의 12% (가독성과 시각적 비중 균형).
 * - 위치: 우상단, 패딩 = 짧은 변의 3%.
 * - 반투명 흰 라운드 배경 박스로 다양한 배경에서도 식별성 확보.
 */
export async function overlayClinicLogo(
  imageBase64: string,
  clinicId: string | undefined
): Promise<string> {
  if (!clinicId) return imageBase64;
  try {
    const logoUrl = await loadClinicLogoUrl(clinicId);
    if (!logoUrl) return imageBase64;
    const logoBuf = await fetchLogoBuffer(logoUrl);
    if (!logoBuf) return imageBase64;

    const baseBuf = Buffer.from(imageBase64, 'base64');
    const base = sharp(baseBuf);
    const meta = await base.metadata();
    const W = meta.width || 1024;
    const H = meta.height || 1024;
    const shortSide = Math.min(W, H);
    const targetW = Math.round(shortSide * 0.12);
    const pad = Math.round(shortSide * 0.03);

    // 로고를 targetW 로 비례 리사이즈 (PNG/JPEG/SVG 모두 sharp 가 처리)
    const logoResized = await sharp(logoBuf, { failOn: 'none' })
      .resize({ width: targetW, withoutEnlargement: false, fit: 'inside' })
      .png()
      .toBuffer({ resolveWithObject: true });

    const logoW = logoResized.info.width;
    const logoH = logoResized.info.height;

    // 라운드 사각형 배경 (반투명 흰색) - SVG 로 생성
    const boxPad = Math.max(6, Math.round(targetW * 0.12));
    const boxW = logoW + boxPad * 2;
    const boxH = logoH + boxPad * 2;
    const r = Math.max(8, Math.round(boxPad * 1.5));
    const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${boxW}" height="${boxH}"><rect x="0" y="0" width="${boxW}" height="${boxH}" rx="${r}" ry="${r}" fill="white" fill-opacity="0.88"/></svg>`;
    const bgBuf = await sharp(Buffer.from(bgSvg)).png().toBuffer();

    const left = W - boxW - pad;
    const top = pad;

    const out = await base
      .composite([
        { input: bgBuf, left, top },
        { input: logoResized.data, left: left + boxPad, top: top + boxPad },
      ])
      .png()
      .toBuffer();

    return out.toString('base64');
  } catch (err) {
    console.error('[logo-overlay] 합성 실패 — 원본 반환:', err);
    return imageBase64;
  }
}
