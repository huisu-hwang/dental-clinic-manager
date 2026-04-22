import { getSupabaseAdmin } from '@/lib/supabase/admin';

// ============================================
// 이미지 생성 모델(프로바이더) 전역 설정
// - 마스터가 'gemini' 또는 'openai' 중 선택
// - marketing_master_settings 테이블에 저장 (key = 'image_provider')
// - 5분 메모리 캐시
// ============================================

export type ImageProvider = 'gemini' | 'openai';

export const DEFAULT_IMAGE_PROVIDER: ImageProvider = 'gemini';
const SETTING_KEY = 'image_provider';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  provider: ImageProvider;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

function normalize(value: string | null | undefined): ImageProvider {
  if (value === 'openai') return 'openai';
  return 'gemini';
}

export async function getImageProvider(): Promise<ImageProvider> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.provider;
  }

  const admin = getSupabaseAdmin();
  if (!admin) return DEFAULT_IMAGE_PROVIDER;

  try {
    const { data, error } = await admin
      .from('marketing_master_settings')
      .select('value')
      .eq('key', SETTING_KEY)
      .maybeSingle();

    if (error) {
      // 테이블 부재 등: 기본값
      console.warn('[ImageProvider] 설정 조회 실패, 기본값 사용:', error.message);
      return DEFAULT_IMAGE_PROVIDER;
    }

    const provider = normalize(data?.value);
    cache = { provider, expiresAt: Date.now() + CACHE_TTL_MS };
    return provider;
  } catch (err) {
    console.warn('[ImageProvider] 설정 조회 예외, 기본값 사용:', err);
    return DEFAULT_IMAGE_PROVIDER;
  }
}

export async function setImageProvider(provider: ImageProvider, userId?: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Admin 클라이언트를 사용할 수 없습니다.');

  const { error } = await admin
    .from('marketing_master_settings')
    .upsert(
      {
        key: SETTING_KEY,
        value: provider,
        updated_at: new Date().toISOString(),
        updated_by: userId ?? null,
      },
      { onConflict: 'key' },
    );

  if (error) throw error;

  cache = { provider, expiresAt: Date.now() + CACHE_TTL_MS };
}

export function invalidateImageProviderCache(): void {
  cache = null;
}
