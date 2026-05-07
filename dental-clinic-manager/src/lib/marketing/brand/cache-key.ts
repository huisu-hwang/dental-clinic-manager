import { createHash } from 'crypto';
import type { BrandAssets, BrandImageType } from '@/types/brand';

interface KeyInputs {
  copy?: string;
  photoId?: string;
}

export function computeCacheKey(
  type: BrandImageType,
  assets: BrandAssets,
  inputs: KeyInputs,
): string {
  const parts: string[] = [type];
  // type별로 영향을 주는 필드만 포함하여, 무관 필드 변경에는 캐시가 무효화되지 않게 한다
  switch (type) {
    case 'medical_law':
      parts.push(
        assets.name_ko ?? '',
        assets.logo_url ?? '',
        assets.medical_law_preset,
        assets.medical_law_top_text,
        assets.medical_law_bottom_text,
      );
      break;
    case 'title':
      parts.push(
        assets.name_ko ?? '',
        assets.name_en ?? '',
        assets.logo_url ?? '',
        assets.primary_color,
        assets.slogan ?? '',
        String(assets.title_border_width ?? 16),
        inputs.copy ?? '',
      );
      break;
    case 'photo':
      parts.push(
        assets.name_ko ?? '',
        assets.logo_url ?? '',
        inputs.photoId ?? '',
      );
      break;
  }
  return createHash('sha1').update(parts.join('\x1f')).digest('hex');
}
