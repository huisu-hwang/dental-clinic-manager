import sharp from 'sharp';
import type { BrandAssets } from '@/types/brand';

interface Props {
  assets: BrandAssets;
  photoBuffer: Buffer;  // 원본 사진
  logoBuffer: Buffer | null;
}

const MAX_W = 1600;
const MAX_H = 1200;

export async function renderPhotoOverlay({ assets, photoBuffer, logoBuffer }: Props): Promise<Buffer> {
  // 1. 사진 리사이즈 (긴 변 기준)
  const base = sharp(photoBuffer).rotate(); // EXIF 회전 보정
  const meta = await base.metadata();
  const w = meta.width ?? MAX_W;
  const h = meta.height ?? MAX_H;
  const scale = Math.min(MAX_W / w, MAX_H / h, 1);
  const targetW = Math.round(w * scale);
  const targetH = Math.round(h * scale);

  let pipeline = base.resize(targetW, targetH, { fit: 'inside' });

  // 2. 워터마크 SVG (우상단)
  const nameKo = (assets.name_ko ?? '').replace(/[<>&"]/g, '');
  const nameEn = (assets.name_en ?? '').replace(/[<>&"]/g, '');
  const wmW = 360;
  const wmH = 90;
  const wmX = targetW - wmW - 24;
  const wmY = 24;

  const overlays: sharp.OverlayOptions[] = [];

  if (logoBuffer) {
    const logoSized = await sharp(logoBuffer).resize(72, 72, { fit: 'inside' }).png().toBuffer();
    overlays.push({ input: logoSized, top: wmY + 9, left: wmX + 12 });
  }

  const textSvg = `
    <svg width="${wmW - (logoBuffer ? 96 : 12)}" height="${wmH}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .ko { font: bold 28px Pretendard, sans-serif; fill: #FFFFFF; }
        .en { font: 14px Inter, sans-serif; fill: #DADADA; letter-spacing: 2px; }
      </style>
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" rx="12" ry="12"/>
      <text x="16" y="40" class="ko">${nameKo}</text>
      <text x="16" y="64" class="en">${nameEn}</text>
    </svg>
  `;
  overlays.push({ input: Buffer.from(textSvg), top: wmY, left: wmX + (logoBuffer ? 96 : 0) });

  pipeline = pipeline.composite(overlays);
  return pipeline.png().toBuffer();
}
