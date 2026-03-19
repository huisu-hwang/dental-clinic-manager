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
}

/**
 * 네이버 연관검색어 수집 (자동완성 API)
 */
export async function fetchNaverSuggestions(query: string): Promise<string[]> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://ac.search.naver.com/nx/ac?q=${encoded}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
    });

    const data = await res.json();
    const items: string[] = data.items?.[0] || [];
    return items.map((item: string | string[]) => Array.isArray(item) ? item[0] : item).filter(Boolean);
  } catch (error) {
    console.error('[KeywordResearch] 연관검색어 수집 실패:', error);
    return [];
  }
}

/**
 * 치과 관련 시즌별 키워드 제안
 */
export function getSeasonalKeywords(month: number): KeywordSuggestion[] {
  const seasonalMap: Record<number, KeywordSuggestion[]> = {
    1: [
      { keyword: '새해 치과 검진', reason: '신년 건강 관리 시즌', searchVolume: '1,000~3,000', difficulty: 'easy' },
      { keyword: '겨울 잇몸 관리', reason: '건조한 겨울 잇몸 트러블 증가', searchVolume: '500~1,000', difficulty: 'easy' },
    ],
    2: [
      { keyword: '발렌타인 치아미백', reason: '특별한 날 외모 관리', searchVolume: '500~1,000', difficulty: 'medium' },
    ],
    3: [
      { keyword: '봄 스케일링', reason: '봄맞이 구강 관리', searchVolume: '1,000~3,000', difficulty: 'easy' },
      { keyword: '학기 시작 교정', reason: '새 학기 교정 상담 증가', searchVolume: '1,000~3,000', difficulty: 'medium' },
    ],
    4: [
      { keyword: '치아 시린증 원인', reason: '환절기 치아 민감 증가', searchVolume: '3,000~5,000', difficulty: 'medium' },
    ],
    5: [
      { keyword: '어린이날 치과 검진', reason: '어린이 구강 검진 시즌', searchVolume: '1,000~3,000', difficulty: 'easy' },
    ],
    6: [
      { keyword: '여름 구강 관리', reason: '아이스크림/찬 음식 시린이', searchVolume: '1,000~3,000', difficulty: 'easy' },
      { keyword: '치아 보험 적용', reason: '연중 검색 꾸준, 여름 정보 탐색 증가', searchVolume: '3,000~5,000', difficulty: 'medium' },
    ],
    7: [
      { keyword: '여름 휴가 치과', reason: '휴가 전 치료 완료 수요', searchVolume: '500~1,000', difficulty: 'easy' },
      { keyword: '사랑니 발치 후 관리', reason: '방학 시즌 사랑니 발치 증가', searchVolume: '5,000~10,000', difficulty: 'medium' },
    ],
    8: [
      { keyword: '잇몸 출혈 원인', reason: '상시 검색 키워드', searchVolume: '3,000~5,000', difficulty: 'medium' },
    ],
    9: [
      { keyword: '추석 치통 응급', reason: '명절 치과 응급 대비', searchVolume: '500~1,000', difficulty: 'easy' },
      { keyword: '가을 스케일링', reason: '하반기 구강 관리', searchVolume: '1,000~3,000', difficulty: 'easy' },
    ],
    10: [
      { keyword: '치과 정기검진 주기', reason: '건강검진 시즌', searchVolume: '1,000~3,000', difficulty: 'easy' },
    ],
    11: [
      { keyword: '연말 치과 보험', reason: '보험 혜택 소진 시즌', searchVolume: '3,000~5,000', difficulty: 'medium' },
      { keyword: '임플란트 비용', reason: '연말 시술 결정 시기', searchVolume: '10,000+', difficulty: 'hard' },
    ],
    12: [
      { keyword: '연말 스케일링', reason: '보험 적용 스케일링 소진', searchVolume: '3,000~5,000', difficulty: 'easy' },
      { keyword: '치아 미백 가격', reason: '연말 모임 외모 관리', searchVolume: '3,000~5,000', difficulty: 'medium' },
    ],
  };

  return seasonalMap[month] || [];
}

/**
 * 상시 정보성 키워드 풀 (치과)
 */
export const EVERGREEN_DENTAL_KEYWORDS: KeywordSuggestion[] = [
  { keyword: '스케일링 주기', reason: '꾸준한 검색량, 정보성', searchVolume: '3,000~5,000', difficulty: 'easy' },
  { keyword: '치실 사용법', reason: '정보성 HOW-TO, 경쟁 적음', searchVolume: '1,000~3,000', difficulty: 'easy' },
  { keyword: '잇몸 건강 관리', reason: '꾸준한 검색량', searchVolume: '1,000~3,000', difficulty: 'easy' },
  { keyword: '충치 초기 증상', reason: '정보성, 내원 유도', searchVolume: '3,000~5,000', difficulty: 'medium' },
  { keyword: '임플란트 수명', reason: '정보성, 체류시간 김', searchVolume: '1,000~3,000', difficulty: 'medium' },
  { keyword: '교정 기간', reason: '꾸준한 관심', searchVolume: '3,000~5,000', difficulty: 'medium' },
  { keyword: '치아 시림 원인', reason: '정보성, 경쟁 낮음', searchVolume: '1,000~3,000', difficulty: 'easy' },
  { keyword: '칫솔 교체 주기', reason: 'HOW-TO, 경쟁 매우 낮음', searchVolume: '500~1,000', difficulty: 'easy' },
  { keyword: '구강세정기 사용법', reason: '트렌드 키워드', searchVolume: '3,000~5,000', difficulty: 'medium' },
  { keyword: '치아 변색 원인', reason: '정보성, 미백 연결', searchVolume: '1,000~3,000', difficulty: 'easy' },
  { keyword: '스케일링 후 주의사항', reason: 'HOW-TO, 체류시간 김', searchVolume: '1,000~3,000', difficulty: 'easy' },
  { keyword: '사랑니 발치 비용', reason: '꾸준한 검색량', searchVolume: '5,000~10,000', difficulty: 'medium' },
  { keyword: '치과 공포증 극복', reason: '공감형 콘텐츠', searchVolume: '500~1,000', difficulty: 'easy' },
  { keyword: '유아 치과 첫 방문', reason: '부모 대상 정보성', searchVolume: '500~1,000', difficulty: 'easy' },
  { keyword: '잇몸 퇴축 원인', reason: '중장년 관심 키워드', searchVolume: '1,000~3,000', difficulty: 'easy' },
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

  // 이미 사용한 키워드 제외
  const filtered = combined.filter(
    (k) => !excludeKeywords.includes(k.keyword)
  );

  // easy 우선, 그 다음 medium
  filtered.sort((a, b) => {
    const order = { easy: 0, medium: 1, hard: 2 };
    return order[a.difficulty] - order[b.difficulty];
  });

  return filtered.slice(0, count);
}
