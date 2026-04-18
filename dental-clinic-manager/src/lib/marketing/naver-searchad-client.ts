import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { NaverKeywordInsight } from '@/types/marketing';

// ============================================
// 네이버 검색광고 API 클라이언트
// - /keywordstool 엔드포인트: 월간 검색량·경쟁도·연관 키워드
// - 쿼터: 기본 1,000 req/day, HMAC-SHA256 서명 필수
// - 인증 누락 시 mock 데이터 반환 (개발자센터 등록 전에도 플랜 생성 가능)
// ============================================

const API_BASE = 'https://api.searchad.naver.com';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

export function isSearchAdConfigured(): boolean {
  return Boolean(
    process.env.NAVER_SEARCHAD_API_KEY &&
      process.env.NAVER_SEARCHAD_SECRET_KEY &&
      process.env.NAVER_SEARCHAD_CUSTOMER_ID
  );
}

function buildSignature(timestamp: string, method: string, uri: string, secret: string): string {
  const message = `${timestamp}.${method.toUpperCase()}.${uri}`;
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
}

interface KeywordsToolItem {
  relKeyword: string;
  monthlyPcQcCnt: number | string;
  monthlyMobileQcCnt: number | string;
  compIdx: string;
  plAvgDepth?: number;
}

function normalizeQc(v: number | string | undefined): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number') return v;
  const s = v.replace(/,/g, '').trim();
  if (s === '<' || s === '< 10') return 5;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * DB 캐시 조회 (24시간 이내 데이터)
 */
async function readCache(keywords: string[]): Promise<Map<string, NaverKeywordInsight>> {
  const result = new Map<string, NaverKeywordInsight>();
  const supabase = getSupabaseAdmin();
  if (!supabase) return result;

  const { data } = await supabase
    .from('naver_keyword_insights_cache')
    .select('*')
    .in('keyword', keywords);

  const cutoff = Date.now() - CACHE_TTL_MS;
  for (const row of data || []) {
    if (new Date(row.fetched_at as string).getTime() < cutoff) continue;
    result.set(row.keyword, {
      keyword: row.keyword,
      monthlyPcQc: row.monthly_pc_qc ?? 0,
      monthlyMobileQc: row.monthly_mobile_qc ?? 0,
      compIdx: row.comp_idx ?? '중간',
      relKeywords: Array.isArray(row.rel_keywords) ? row.rel_keywords : [],
    });
  }

  return result;
}

/**
 * DB 캐시 업서트
 */
async function writeCache(insights: NaverKeywordInsight[]): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || insights.length === 0) return;
  const rows = insights.map((i) => ({
    keyword: i.keyword,
    monthly_pc_qc: i.monthlyPcQc,
    monthly_mobile_qc: i.monthlyMobileQc,
    comp_idx: i.compIdx,
    rel_keywords: i.relKeywords,
    fetched_at: new Date().toISOString(),
  }));
  await supabase.from('naver_keyword_insights_cache').upsert(rows, { onConflict: 'keyword' });
}

/**
 * Mock 인사이트 (API 미설정 / 오류 시 fallback)
 */
function mockInsight(keyword: string): NaverKeywordInsight {
  // 간이 해시로 결정적 수치 (빌드 재현 가능성 확보)
  let hash = 0;
  for (let i = 0; i < keyword.length; i++) hash = (hash * 31 + keyword.charCodeAt(i)) & 0xffff;
  const base = 200 + (hash % 4800); // 200~5000
  return {
    keyword,
    monthlyPcQc: Math.floor(base * 0.4),
    monthlyMobileQc: Math.floor(base * 0.6),
    compIdx: hash % 3 === 0 ? '낮음' : hash % 3 === 1 ? '중간' : '높음',
    relKeywords: [],
  };
}

/**
 * 네이버 검색광고 키워드 인사이트 조회 (최대 5개/호출)
 * 쿼터 절감: 캐시 → 실 API → mock 순으로 fallback
 */
export async function getKeywordInsights(hintKeywords: string[]): Promise<NaverKeywordInsight[]> {
  if (hintKeywords.length === 0) return [];

  // 1. 캐시 조회
  const cache = await readCache(hintKeywords);
  const uncached = hintKeywords.filter((k) => !cache.has(k));

  if (uncached.length === 0) {
    return hintKeywords.map((k) => cache.get(k)!);
  }

  const result: NaverKeywordInsight[] = hintKeywords.map((k) => cache.get(k)!).filter(Boolean);

  // 2. 미설정 시 mock
  if (!isSearchAdConfigured()) {
    console.warn('[NaverSearchAd] API 미설정 — mock 인사이트 사용');
    const mocks = uncached.map(mockInsight);
    result.push(...mocks);
    await writeCache(mocks);
    return result;
  }

  // 3. 실 API 호출 (검색광고는 한 번에 최대 5개)
  const chunks: string[][] = [];
  for (let i = 0; i < uncached.length; i += 5) {
    chunks.push(uncached.slice(i, i + 5));
  }

  for (const chunk of chunks) {
    try {
      const timestamp = Date.now().toString();
      const method = 'GET';
      const uri = '/keywordstool';
      const apiKey = process.env.NAVER_SEARCHAD_API_KEY!;
      const secret = process.env.NAVER_SEARCHAD_SECRET_KEY!;
      const customerId = process.env.NAVER_SEARCHAD_CUSTOMER_ID!;
      const signature = buildSignature(timestamp, method, uri, secret);

      const params = new URLSearchParams({
        hintKeywords: chunk.join(','),
        showDetail: '1',
      });

      const res = await fetch(`${API_BASE}${uri}?${params.toString()}`, {
        method,
        headers: {
          'X-Timestamp': timestamp,
          'X-API-KEY': apiKey,
          'X-Customer': customerId,
          'X-Signature': signature,
        },
      });

      if (!res.ok) {
        console.error(`[NaverSearchAd] ${res.status}: ${await res.text().catch(() => '')}`);
        const mocks = chunk.map(mockInsight);
        result.push(...mocks);
        await writeCache(mocks);
        continue;
      }

      const data = (await res.json()) as { keywordList: KeywordsToolItem[] };
      const list = data.keywordList || [];

      for (const hint of chunk) {
        // 정확 매칭 우선, 없으면 첫 항목 사용
        const exact = list.find((it) => it.relKeyword === hint);
        const item = exact || list[0];
        if (!item) {
          const m = mockInsight(hint);
          result.push(m);
          continue;
        }
        const rel = list
          .filter((it) => it.relKeyword !== hint)
          .slice(0, 10)
          .map((it) => it.relKeyword);

        const insight: NaverKeywordInsight = {
          keyword: hint,
          monthlyPcQc: normalizeQc(item.monthlyPcQcCnt),
          monthlyMobileQc: normalizeQc(item.monthlyMobileQcCnt),
          compIdx: item.compIdx || '중간',
          relKeywords: rel,
        };
        result.push(insight);
      }

      await writeCache(
        chunk.map((hint) => {
          const exact = list.find((it) => it.relKeyword === hint);
          return {
            keyword: hint,
            monthlyPcQc: normalizeQc(exact?.monthlyPcQcCnt),
            monthlyMobileQc: normalizeQc(exact?.monthlyMobileQcCnt),
            compIdx: exact?.compIdx || '중간',
            relKeywords: list
              .filter((it) => it.relKeyword !== hint)
              .slice(0, 10)
              .map((it) => it.relKeyword),
          };
        })
      );
    } catch (error) {
      console.error('[NaverSearchAd] 호출 실패:', error);
      const mocks = chunk.map(mockInsight);
      result.push(...mocks);
    }
  }

  return result;
}

/**
 * 검색량 합계 헬퍼
 */
export function totalMonthlyQc(insight: NaverKeywordInsight): number {
  return (insight.monthlyPcQc || 0) + (insight.monthlyMobileQc || 0);
}
