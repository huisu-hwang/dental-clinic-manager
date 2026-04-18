// ============================================
// 네이버 데이터랩 API 클라이언트
// - POST /v1/datalab/search: 키워드 검색어 트렌드 (상대값)
// - 인증: X-Naver-Client-Id / X-Naver-Client-Secret (OpenAPI)
// - 용도: 시즌성/급상승 키워드 판정
// - 미설정 시 mock 반환 (생성 파이프라인 중단 방지)
// ============================================

const API_URL = 'https://openapi.naver.com/v1/datalab/search';

export function isDataLabConfigured(): boolean {
  return Boolean(
    process.env.NAVER_DATALAB_CLIENT_ID && process.env.NAVER_DATALAB_CLIENT_SECRET
  );
}

export interface TrendPoint {
  period: string;  // YYYY-MM-DD 또는 YYYY-MM
  ratio: number;   // 해당 기간 내 최대값을 100으로 한 상대값
}

export interface KeywordTrendResult {
  keyword: string;
  groupName: string;
  data: TrendPoint[];
}

export interface TrendRequest {
  startDate: string;       // YYYY-MM-DD
  endDate: string;         // YYYY-MM-DD
  timeUnit: 'date' | 'week' | 'month';
  keywordGroups: { groupName: string; keywords: string[] }[];
}

function mockTrend(req: TrendRequest): KeywordTrendResult[] {
  // 간단한 계절성 — 여름/연말 상승 패턴
  const points: TrendPoint[] = [];
  const start = new Date(req.startDate);
  const end = new Date(req.endDate);
  const step = req.timeUnit === 'date' ? 1 : req.timeUnit === 'week' ? 7 : 30;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + step)) {
    const m = d.getMonth() + 1;
    const base = 50 + (m === 6 || m === 12 ? 40 : m === 7 || m === 8 ? 30 : 10);
    points.push({
      period:
        req.timeUnit === 'month'
          ? `${d.getFullYear()}-${String(m).padStart(2, '0')}-01`
          : d.toISOString().split('T')[0],
      ratio: base + ((d.getDate() * 7) % 20),
    });
  }
  return req.keywordGroups.map((g) => ({
    keyword: g.keywords[0],
    groupName: g.groupName,
    data: points.map((p) => ({ ...p })),
  }));
}

/**
 * 키워드 트렌드 조회
 */
export async function getKeywordTrend(
  req: TrendRequest
): Promise<KeywordTrendResult[]> {
  if (!isDataLabConfigured()) {
    console.warn('[NaverDataLab] API 미설정 — mock 트렌드 반환');
    return mockTrend(req);
  }

  try {
    const body = {
      startDate: req.startDate,
      endDate: req.endDate,
      timeUnit: req.timeUnit,
      keywordGroups: req.keywordGroups.map((g) => ({
        groupName: g.groupName,
        keywords: g.keywords.slice(0, 20), // 그룹당 최대 20개
      })).slice(0, 5), // 최대 5그룹
    };

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Naver-Client-Id': process.env.NAVER_DATALAB_CLIENT_ID!,
        'X-Naver-Client-Secret': process.env.NAVER_DATALAB_CLIENT_SECRET!,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`[NaverDataLab] ${res.status}: ${await res.text().catch(() => '')}`);
      return mockTrend(req);
    }

    const json = (await res.json()) as {
      results: { title: string; keywords: string[]; data: { period: string; ratio: number }[] }[];
    };

    return (json.results || []).map((r) => ({
      keyword: r.keywords[0],
      groupName: r.title,
      data: r.data.map((d) => ({ period: d.period, ratio: d.ratio })),
    }));
  } catch (error) {
    console.error('[NaverDataLab] 호출 실패:', error);
    return mockTrend(req);
  }
}

/**
 * 해당 월 기준 키워드별 상대 트렌드 점수 (0~100)
 * 월 평균 ratio를 반환. 높을수록 시즌 매칭도 높음.
 */
export async function getSeasonalScores(
  keywords: string[],
  month: number,
  year: number = new Date().getFullYear()
): Promise<Map<string, number>> {
  const startDate = `${year - 1}-01-01`;
  const endDate = `${year}-12-31`;

  // 최대 5그룹 × 20키워드 제약을 고려해 청크 단위로 호출
  const scores = new Map<string, number>();
  for (let i = 0; i < keywords.length; i += 100) {
    const chunk = keywords.slice(i, i + 100);
    const groups: { groupName: string; keywords: string[] }[] = [];
    for (let j = 0; j < chunk.length; j += 20) {
      groups.push({ groupName: `g${j}`, keywords: chunk.slice(j, j + 20) });
    }
    for (let k = 0; k < groups.length; k += 5) {
      const slice = groups.slice(k, k + 5);
      const results = await getKeywordTrend({
        startDate,
        endDate,
        timeUnit: 'month',
        keywordGroups: slice,
      });

      for (const r of results) {
        const targetPoints = r.data.filter((d) => {
          const m = parseInt(d.period.split('-')[1], 10);
          return m === month;
        });
        if (targetPoints.length === 0) {
          scores.set(r.keyword, 50);
          continue;
        }
        const avg =
          targetPoints.reduce((sum, p) => sum + (p.ratio || 0), 0) / targetPoints.length;
        scores.set(r.keyword, Math.round(avg));
      }
    }
  }

  return scores;
}
