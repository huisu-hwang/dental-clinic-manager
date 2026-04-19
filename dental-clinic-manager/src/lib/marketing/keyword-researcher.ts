import type { TopicCategory, JourneyStage } from '@/types/marketing';

// ============================================
// 키워드 자동 조사/제안
// 네이버 DataLab + 연관검색어 기반 키워드 분석
// ============================================

export interface KeywordAnalysis {
  keyword: string;
  monthlySearchVolume: number;  // 월간 검색량 (추정)
  competition: 'low' | 'medium' | 'high';
  documentCount: number;        // 문서 수
  isRoyalKeyword: boolean;      // 로얄키워드 여부
  relatedKeywords: string[];
}

export interface KeywordSuggestion {
  keyword: string;
  reason: string;
  searchVolume: string;        // "1,000~3,000" 형태
  difficulty: 'easy' | 'medium' | 'hard';
  topicCategory?: TopicCategory;
  journeyStage?: JourneyStage;
}

/**
 * 네이버 연관검색어 수집 (자동완성 API)
 * - 모바일 엔드포인트(`frm=nv_mobile`)가 PC보다 응답이 안정적
 * - st=100 으로 더 많은 후보 확보
 */
export async function fetchNaverSuggestions(query: string): Promise<string[]> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://ac.search.naver.com/nx/ac?q=${encoded}&st=100&frm=nv_mobile&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&ans=2&run=2&rev=4&q_enc=UTF-8`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    const data = await res.json();
    const items = (data.items?.[0] || []) as (string | string[])[];
    return items
      .map((item) => (Array.isArray(item) ? item[0] : item))
      .filter((s): s is string => typeof s === 'string' && s.length > 0);
  } catch (error) {
    console.error('[KeywordResearch] 연관검색어 수집 실패:', error);
    return [];
  }
}

/**
 * 치과 관련 시즌별 키워드 제안 (6축 카테고리·환자여정 태그 포함)
 */
export function getSeasonalKeywords(month: number): KeywordSuggestion[] {
  const seasonalMap: Record<number, KeywordSuggestion[]> = {
    1: [
      { keyword: '새해 치과 검진', reason: '신년 건강 관리 시즌', searchVolume: '1,000~3,000', difficulty: 'easy', topicCategory: 'info', journeyStage: 'awareness' },
      { keyword: '겨울 잇몸 관리', reason: '건조한 겨울 잇몸 트러블 증가', searchVolume: '500~1,000', difficulty: 'easy', topicCategory: 'symptom', journeyStage: 'awareness' },
    ],
    2: [
      { keyword: '신학기 소아 충치 검진', reason: '신학기 어린이 구강 검진', searchVolume: '500~1,000', difficulty: 'easy', topicCategory: 'info', journeyStage: 'awareness' },
      { keyword: '치아미백 비용', reason: '특별한 날 외모 관리 수요', searchVolume: '3,000~5,000', difficulty: 'medium', topicCategory: 'cost', journeyStage: 'decision' },
    ],
    3: [
      { keyword: '봄 스케일링', reason: '봄맞이 구강 관리', searchVolume: '1,000~3,000', difficulty: 'easy', topicCategory: 'treatment', journeyStage: 'consideration' },
      { keyword: '학기 시작 교정 시기', reason: '새 학기 교정 상담 증가', searchVolume: '1,000~3,000', difficulty: 'medium', topicCategory: 'treatment', journeyStage: 'consideration' },
    ],
    4: [
      { keyword: '치아 시린증 원인', reason: '환절기 치아 민감 증가', searchVolume: '3,000~5,000', difficulty: 'medium', topicCategory: 'symptom', journeyStage: 'consideration' },
      { keyword: '봄 환절기 구강 건조', reason: '환절기 구강 건강 트렌드', searchVolume: '500~1,000', difficulty: 'easy', topicCategory: 'info', journeyStage: 'retention' },
    ],
    5: [
      { keyword: '어린이날 치과 검진', reason: '어린이 구강 검진 시즌', searchVolume: '1,000~3,000', difficulty: 'easy', topicCategory: 'info', journeyStage: 'awareness' },
      { keyword: '가정의달 치과 방문', reason: '가족 단위 내원 증가', searchVolume: '500~1,000', difficulty: 'easy', topicCategory: 'clinic_news', journeyStage: 'decision' },
    ],
    6: [
      { keyword: '6월 9일 치아의 날', reason: '치아의 날 캠페인', searchVolume: '1,000~3,000', difficulty: 'easy', topicCategory: 'info', journeyStage: 'awareness' },
      { keyword: '여름 구강 관리', reason: '아이스크림/찬 음식 시린이', searchVolume: '1,000~3,000', difficulty: 'easy', topicCategory: 'symptom', journeyStage: 'awareness' },
      { keyword: '치아 보험 적용 항목', reason: '연중 검색 꾸준, 여름 정보 탐색 증가', searchVolume: '3,000~5,000', difficulty: 'medium', topicCategory: 'cost', journeyStage: 'decision' },
    ],
    7: [
      { keyword: '여름 휴가 전 치과 방문', reason: '휴가 전 치료 완료 수요', searchVolume: '500~1,000', difficulty: 'easy', topicCategory: 'info', journeyStage: 'retention' },
      { keyword: '사랑니 발치 후 관리', reason: '방학 시즌 사랑니 발치 증가', searchVolume: '5,000~10,000', difficulty: 'medium', topicCategory: 'treatment', journeyStage: 'consideration' },
    ],
    8: [
      { keyword: '잇몸 출혈 원인', reason: '상시 검색 키워드', searchVolume: '3,000~5,000', difficulty: 'medium', topicCategory: 'symptom', journeyStage: 'consideration' },
      { keyword: '여름방학 교정 시작 시기', reason: '방학 교정 수요', searchVolume: '1,000~3,000', difficulty: 'medium', topicCategory: 'treatment', journeyStage: 'consideration' },
    ],
    9: [
      { keyword: '추석 치통 응급 처치', reason: '명절 치과 응급 대비', searchVolume: '500~1,000', difficulty: 'easy', topicCategory: 'info', journeyStage: 'retention' },
      { keyword: '가을 스케일링', reason: '하반기 구강 관리', searchVolume: '1,000~3,000', difficulty: 'easy', topicCategory: 'treatment', journeyStage: 'consideration' },
    ],
    10: [
      { keyword: '치과 정기검진 주기', reason: '건강검진 시즌', searchVolume: '1,000~3,000', difficulty: 'easy', topicCategory: 'info', journeyStage: 'retention' },
      { keyword: '가을 환절기 구내염', reason: '환절기 구강 질환', searchVolume: '1,000~3,000', difficulty: 'easy', topicCategory: 'symptom', journeyStage: 'consideration' },
    ],
    11: [
      { keyword: '연말 치과 보험 소진', reason: '보험 혜택 소진 시즌', searchVolume: '3,000~5,000', difficulty: 'medium', topicCategory: 'cost', journeyStage: 'decision' },
      { keyword: '임플란트 비용', reason: '연말 시술 결정 시기', searchVolume: '10,000+', difficulty: 'hard', topicCategory: 'cost', journeyStage: 'decision' },
    ],
    12: [
      { keyword: '연말 스케일링', reason: '보험 적용 스케일링 소진', searchVolume: '3,000~5,000', difficulty: 'easy', topicCategory: 'treatment', journeyStage: 'consideration' },
      { keyword: '치아 미백 가격', reason: '연말 모임 외모 관리', searchVolume: '3,000~5,000', difficulty: 'medium', topicCategory: 'cost', journeyStage: 'decision' },
      { keyword: '겨울 방학 임플란트', reason: '방학 임플란트 시즌', searchVolume: '1,000~3,000', difficulty: 'hard', topicCategory: 'treatment', journeyStage: 'decision' },
    ],
  };

  return seasonalMap[month] || [];
}

/**
 * 상시 정보성 키워드 풀 (치과) — 6축 카테고리 + 환자 여정 태깅
 */
export const EVERGREEN_DENTAL_KEYWORDS: KeywordSuggestion[] = [
  // info (건강 생활정보) — awareness/retention
  { keyword: '스케일링 주기', reason: '꾸준한 검색량, 정보성', searchVolume: '3,000~5,000', difficulty: 'easy', topicCategory: 'info', journeyStage: 'awareness' },
  { keyword: '치실 사용법', reason: '정보성 HOW-TO, 경쟁 적음', searchVolume: '1,000~3,000', difficulty: 'easy', topicCategory: 'info', journeyStage: 'retention' },
  { keyword: '잇몸 건강 관리법', reason: '꾸준한 검색량', searchVolume: '1,000~3,000', difficulty: 'easy', topicCategory: 'info', journeyStage: 'retention' },
  { keyword: '칫솔 교체 주기', reason: 'HOW-TO, 경쟁 매우 낮음', searchVolume: '500~1,000', difficulty: 'easy', topicCategory: 'info', journeyStage: 'retention' },
  { keyword: '구강세정기 사용법', reason: '트렌드 키워드', searchVolume: '3,000~5,000', difficulty: 'medium', topicCategory: 'info', journeyStage: 'awareness' },
  { keyword: '스케일링 후 주의사항', reason: 'HOW-TO, 체류시간 김', searchVolume: '1,000~3,000', difficulty: 'easy', topicCategory: 'info', journeyStage: 'retention' },
  { keyword: '유아 치과 첫 방문 시기', reason: '부모 대상 정보성', searchVolume: '500~1,000', difficulty: 'easy', topicCategory: 'info', journeyStage: 'awareness' },
  // symptom (증상/질환) — consideration
  { keyword: '충치 초기 증상', reason: '정보성, 내원 유도', searchVolume: '3,000~5,000', difficulty: 'medium', topicCategory: 'symptom', journeyStage: 'consideration' },
  { keyword: '치아 시림 원인', reason: '정보성, 경쟁 낮음', searchVolume: '1,000~3,000', difficulty: 'easy', topicCategory: 'symptom', journeyStage: 'consideration' },
  { keyword: '치아 변색 원인', reason: '정보성, 미백 연결', searchVolume: '1,000~3,000', difficulty: 'easy', topicCategory: 'symptom', journeyStage: 'consideration' },
  { keyword: '잇몸 퇴축 원인', reason: '중장년 관심 키워드', searchVolume: '1,000~3,000', difficulty: 'easy', topicCategory: 'symptom', journeyStage: 'consideration' },
  { keyword: '입냄새 원인과 해결', reason: '상시 고검색 키워드', searchVolume: '5,000~10,000', difficulty: 'medium', topicCategory: 'symptom', journeyStage: 'consideration' },
  // treatment (치료/시술) — consideration
  { keyword: '임플란트 수명', reason: '정보성, 체류시간 김', searchVolume: '1,000~3,000', difficulty: 'medium', topicCategory: 'treatment', journeyStage: 'consideration' },
  { keyword: '교정 치료 기간', reason: '꾸준한 관심', searchVolume: '3,000~5,000', difficulty: 'medium', topicCategory: 'treatment', journeyStage: 'consideration' },
  { keyword: '신경치료 과정', reason: '정보성, 두려움 해소', searchVolume: '1,000~3,000', difficulty: 'medium', topicCategory: 'treatment', journeyStage: 'consideration' },
  // cost (비용/보험) — decision
  { keyword: '사랑니 발치 비용', reason: '꾸준한 검색량', searchVolume: '5,000~10,000', difficulty: 'medium', topicCategory: 'cost', journeyStage: 'decision' },
  { keyword: '임플란트 건강보험 적용', reason: '비용 결정 단계 핵심', searchVolume: '3,000~5,000', difficulty: 'medium', topicCategory: 'cost', journeyStage: 'decision' },
  { keyword: '치과 진료비 세액공제', reason: '연말정산 시즌', searchVolume: '1,000~3,000', difficulty: 'easy', topicCategory: 'cost', journeyStage: 'decision' },
  // clinic_news (원내 소식) — decision
  { keyword: '치과 공포증 극복 방법', reason: '공감형 콘텐츠, 브랜딩', searchVolume: '500~1,000', difficulty: 'easy', topicCategory: 'clinic_news', journeyStage: 'decision' },
];

/**
 * 키워드 추천 (시즌별 + 상시)
 */
export function suggestKeywords(
  month: number,
  excludeKeywords: string[] = [],
  count: number = 10
): KeywordSuggestion[] {
  const seasonal = getSeasonalKeywords(month);
  const combined = [...seasonal, ...EVERGREEN_DENTAL_KEYWORDS];

  // 이미 사용한 키워드 제외 (부분 일치도 차단하여 유사 키워드 중복 방지)
  const filtered = combined.filter(
    (k) => !excludeKeywords.some((ex) => ex.includes(k.keyword) || k.keyword.includes(ex))
  );

  // easy 우선, 그 다음 medium
  filtered.sort((a, b) => {
    const order = { easy: 0, medium: 1, hard: 2 };
    return order[a.difficulty] - order[b.difficulty];
  });

  return filtered.slice(0, count);
}

/**
 * 카테고리/여정 단계별 키워드 풀 선별 (시즌 + 상시 통합)
 */
export function getKeywordPool(
  month: number,
  excludeKeywords: string[] = []
): KeywordSuggestion[] {
  const combined = [...getSeasonalKeywords(month), ...EVERGREEN_DENTAL_KEYWORDS];
  return combined.filter(
    (k) => !excludeKeywords.some((ex) => ex.includes(k.keyword) || k.keyword.includes(ex))
  );
}

/**
 * 여러 키워드의 연관 키워드 일괄 조회 (네이버 자동완성 기반)
 * SearchAd API 미제공 환경에서 relKeywords 대체용
 *
 * - 동시성 4 제한 (자동완성 API 부하 방지)
 * - 각 시드당 최대 6개 연관어 반환
 * - 시드와 동일한 결과 제외
 */
export async function getRelatedKeywordsBatch(
  seeds: string[],
  perSeed: number = 6
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const concurrency = 4;
  const queue = [...seeds];

  async function worker() {
    while (queue.length > 0) {
      const seed = queue.shift();
      if (!seed) continue;
      try {
        const suggestions = await fetchNaverSuggestions(seed);
        const filtered = suggestions
          .filter((s) => s && s !== seed && !s.includes('-') && s.length >= 2)
          .slice(0, perSeed);
        result.set(seed, filtered);
      } catch {
        result.set(seed, []);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return result;
}

/**
 * 제목 유사도 (단순 토큰 Jaccard + substring)
 * 동일/유사 주제 중복 방지용
 */
export function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const na = a.replace(/\s+/g, '').toLowerCase();
  const nb = b.replace(/\s+/g, '').toLowerCase();
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  const tokenize = (s: string) =>
    new Set(
      s
        .split(/[\s,.\-!?·()\[\]]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    );
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union > 0 ? inter / union : 0;
}
