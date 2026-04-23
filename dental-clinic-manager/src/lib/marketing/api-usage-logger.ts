import { getSupabaseAdmin } from '@/lib/supabase/admin';

// ============================================
// API 사용량 로거 (fire-and-forget 패턴)
// 글 생성에 영향 없이 백그라운드에서 DB INSERT
// ============================================

export interface LogApiUsageParams {
  clinicId: string;
  postId?: string;
  generationSessionId: string;
  apiProvider: 'anthropic' | 'google' | 'openai';
  model: string;
  callType:
    | 'text_generation'
    | 'text_retry'
    | 'image_generation'
    | 'filename_generation'
    | 'platform_image'
    | 'platform_text';
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  generationOptions?: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
  durationMs?: number;
}

interface CostSettings {
  model: string;
  inputPricePer1m: number;
  outputPricePer1m: number;
  imagePricePerCall: number;
}

// ─── 메모리 캐시 (5분 TTL) ───

interface CacheEntry {
  settings: CostSettings[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

function getCached(clinicId: string): CostSettings[] | null {
  const entry = cache.get(clinicId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(clinicId);
    return null;
  }
  return entry.settings;
}

function setCached(clinicId: string, settings: CostSettings[]): void {
  cache.set(clinicId, {
    settings,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ─── 단가 조회 (캐시 우선) ───

async function getCostSettings(clinicId: string): Promise<CostSettings[]> {
  const cached = getCached(clinicId);
  if (cached) return cached;

  const settings = await getOrSeedCostSettings(clinicId);
  setCached(clinicId, settings);
  return settings;
}

export async function getOrSeedCostSettings(clinicId: string): Promise<CostSettings[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  // 기존 설정 조회
  const { data, error } = await admin
    .from('marketing_cost_settings')
    .select('model, input_price_per_1m, output_price_per_1m, image_price_per_call')
    .eq('clinic_id', clinicId);

  if (!error && data && data.length > 0) {
    return data.map((row) => ({
      model: row.model as string,
      inputPricePer1m: Number(row.input_price_per_1m),
      outputPricePer1m: Number(row.output_price_per_1m),
      imagePricePerCall: Number(row.image_price_per_call),
    }));
  }

  // 설정이 없으면 seed SQL 함수 호출
  try {
    await admin.rpc('seed_marketing_cost_settings', { p_clinic_id: clinicId });
  } catch (seedError) {
    // seed 함수가 없는 경우 직접 INSERT
    console.warn('[ApiUsageLogger] seed_marketing_cost_settings RPC 없음, 직접 삽입:', seedError);
    const defaults = [
      { clinic_id: clinicId, model: 'claude-sonnet-4-6', input_price_per_1m: 3.0, output_price_per_1m: 15.0, image_price_per_call: 0 },
      { clinic_id: clinicId, model: 'claude-haiku-4-5', input_price_per_1m: 0.8, output_price_per_1m: 4.0, image_price_per_call: 0 },
      { clinic_id: clinicId, model: 'gemini-3.0-flash', input_price_per_1m: 0, output_price_per_1m: 0, image_price_per_call: 0.04 },
      { clinic_id: clinicId, model: 'gpt-image-2', input_price_per_1m: 0, output_price_per_1m: 0, image_price_per_call: 0.04 },
      { clinic_id: clinicId, model: 'exchange_rate', input_price_per_1m: 0, output_price_per_1m: 0, image_price_per_call: 0, usd_to_krw: 1380 },
    ];
    await admin.from('marketing_cost_settings').upsert(defaults, { onConflict: 'clinic_id,model', ignoreDuplicates: true });
  }

  // 시드 후 재조회
  const { data: seeded } = await admin
    .from('marketing_cost_settings')
    .select('model, input_price_per_1m, output_price_per_1m, image_price_per_call')
    .eq('clinic_id', clinicId);

  if (!seeded || seeded.length === 0) return [];

  return seeded.map((row) => ({
    model: row.model as string,
    inputPricePer1m: Number(row.input_price_per_1m),
    outputPricePer1m: Number(row.output_price_per_1m),
    imagePricePerCall: Number(row.image_price_per_call),
  }));
}

// ─── 비용 계산 ───

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  settings: CostSettings[]
): number {
  // 모델명 정규화 (claude-haiku-4-5-20251001 → claude-haiku-4-5)
  const normalizedModel = normalizeModelName(model);
  const setting = settings.find((s) => normalizeModelName(s.model) === normalizedModel);

  if (!setting) return 0;

  // 이미지 모델: per-call 단가 우선 (토큰 유무 관계없이)
  if (setting.imagePricePerCall > 0) {
    return setting.imagePricePerCall;
  }

  const inputCost = (inputTokens / 1_000_000) * setting.inputPricePer1m;
  const outputCost = (outputTokens / 1_000_000) * setting.outputPricePer1m;
  return inputCost + outputCost;
}

function normalizeModelName(model: string): string {
  // claude-haiku-4-5-20251001 → claude-haiku-4-5
  return model.replace(/-\d{8}$/, '');
}

// ─── 메인 로깅 함수 (fire-and-forget) ───

export function logApiUsage(params: LogApiUsageParams): void {
  // fire-and-forget: await 없이 호출, 실패해도 글 생성에 영향 없음
  _logApiUsageAsync(params).catch((err) => {
    console.warn('[ApiUsageLogger] 로깅 실패 (무시됨):', err);
  });
}

async function _logApiUsageAsync(params: LogApiUsageParams): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const inputTokens = params.inputTokens ?? 0;
  const outputTokens = params.outputTokens ?? 0;
  const totalTokens = params.totalTokens ?? inputTokens + outputTokens;

  // 단가 조회 → 비용 계산
  let costUsd = 0;
  try {
    const settings = await getCostSettings(params.clinicId);
    costUsd = calculateCost(params.model, inputTokens, outputTokens, settings);

    // 이미지 호출 (토큰 없음)은 per-call 단가 적용
    if (
      (params.callType === 'image_generation' || params.callType === 'platform_image') &&
      inputTokens === 0 &&
      outputTokens === 0
    ) {
      const normalizedModel = normalizeModelName(params.model);
      const setting = settings.find((s) => normalizeModelName(s.model) === normalizedModel);
      if (setting) costUsd = setting.imagePricePerCall;
    }
  } catch (err) {
    console.warn('[ApiUsageLogger] 단가 조회 실패, cost_usd=0:', err);
  }

  const { error } = await admin.from('marketing_api_usage').insert({
    clinic_id: params.clinicId,
    post_id: params.postId ?? null,
    generation_session_id: params.generationSessionId,
    api_provider: params.apiProvider,
    model: params.model,
    call_type: params.callType,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    cost_usd: costUsd,
    generation_options: params.generationOptions ?? null,
    success: params.success,
    error_message: params.errorMessage ?? null,
    duration_ms: params.durationMs ?? null,
  });

  if (error) {
    console.warn('[ApiUsageLogger] INSERT 실패:', error.message);
  }
}
