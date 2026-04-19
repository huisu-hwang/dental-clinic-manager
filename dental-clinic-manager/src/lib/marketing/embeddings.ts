import { GoogleGenAI } from '@google/genai';

// ============================================
// 텍스트 임베딩 클라이언트 (Gemini embedding-001)
// 제목 의미 유사도 기반 중복 검사용
// - outputDimensionality=768 로 축소 (저장 절감, 정확도 유지)
// - 코사인 유사도 ≥ 0.85 → 의미적 중복으로 판단
// - 미설정 시 null 반환 (호출 측에서 토큰 유사도로 폴백)
// ============================================

const EMBED_MODEL = 'gemini-embedding-001';
const OUTPUT_DIM = 768;

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return cachedClient;
}

export function isEmbeddingsConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * 단일 텍스트 임베딩
 * - 실패 시 null (조용히 폴백 가능하도록)
 */
export async function embedText(text: string): Promise<number[] | null> {
  const client = getClient();
  if (!client || !text) return null;

  try {
    const res = await client.models.embedContent({
      model: EMBED_MODEL,
      contents: [text],
      config: { outputDimensionality: OUTPUT_DIM },
    });
    const embeddings = res.embeddings;
    if (!embeddings || embeddings.length === 0) return null;
    const values = embeddings[0]?.values;
    return Array.isArray(values) ? values : null;
  } catch (error) {
    console.error('[Embeddings] embedText 실패:', error);
    return null;
  }
}

/**
 * 일괄 임베딩 (Gemini는 batch 요청도 단일 호출로 가능)
 * - 100개씩 청크
 */
export async function embedTextsBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  const client = getClient();
  if (!client) return texts.map(() => null);

  const out: (number[] | null)[] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const chunk = texts.slice(i, i + 100);
    try {
      const res = await client.models.embedContent({
        model: EMBED_MODEL,
        contents: chunk,
        config: { outputDimensionality: OUTPUT_DIM },
      });
      const embeddings = res.embeddings || [];
      for (let j = 0; j < chunk.length; j++) {
        const vals = embeddings[j]?.values;
        out.push(Array.isArray(vals) ? vals : null);
      }
    } catch (error) {
      console.error('[Embeddings] embedTextsBatch chunk 실패:', error);
      for (let j = 0; j < chunk.length; j++) out.push(null);
    }
  }
  return out;
}

/**
 * 코사인 유사도 (-1.0 ~ 1.0)
 * 두 벡터 길이가 다르면 0
 */
export function cosineSimilarity(a: number[] | null, b: number[] | null): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * JSON ↔ float[] 변환 (DB text 컬럼 직렬화)
 */
export function serializeEmbedding(v: number[] | null): string | null {
  if (!v || v.length === 0) return null;
  // 6자리 소수로 반올림 → 저장 크기 절반 (768 × 8B → 768 × 4B)
  return JSON.stringify(v.map((x) => Math.round(x * 1e6) / 1e6));
}

export function deserializeEmbedding(s: string | null): number[] | null {
  if (!s) return null;
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}
