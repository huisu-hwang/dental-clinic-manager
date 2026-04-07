import { createChildLogger } from '../utils/logger.js';
import type { QuantitativeResult } from './quantitativeAnalyzer.js';

const log = createChildLogger('textMiner');

export interface TextMiningResult {
  competitorKeywords: {
    keyword: string;
    frequency: number;
    postCount: number;
    perPostFrequency: number[];
  }[];
  recommendedKeywords: string[];
  avgBodyLength: number;
  avgImageCount: number;
  avgHeadingCount: number;
  avgKeywordCount: number;
  commonTags: string[];
  titlePatterns: string[];
}

const STOPWORDS = new Set([
  '은', '는', '이', '가', '을', '를', '에', '의', '로', '와', '과', '등', '한', '된',
  '하는', '합니다', '입니다', '있는', '없는', '되는', '하고', '에서', '으로', '까지',
  '부터', '에게', '처럼', '같은', '통해', '대한', '위한', '것은', '것이', '것을',
  '수도', '때문', '하면', '해서', '그리고', '하지만', '또한', '그런', '이런', '저런', '어떤',
  '있습니다', '없습니다', '됩니다', '해서', '그래서', '때문에', '있어요', '없어요', '해요',
  '거예요', '이에요', '이것', '그것', '저것', '여기', '거기', '저기', '정말', '진짜',
  '아주', '매우', '정도', '이번', '다음', '모든', '많은',
  '니다', '습니', '습니다', '하게', '되어', '며서', '면서', '기도', '에도', '지만',
  '으며', '으면', '였어', '었어', '았어', '였습', '었습', '았습', '취소', '확인',
  '입니', '합니', '정을', '것을', '것이', '것은', '에는', '에게', '에서', '으로',
  '하여', '해야', '해야합', '수있', '수없', '해도', '해주', '할수', '라고', '라는',
  '이며', '으며', '이고', '이나', '에서는', '까지', '부터', '한다', '된다',
  '어요', '었어요', '했어요', '겠어요', '네요', '나요', '요한', '하기', '했습',
  '는데', '했는', '되는데', '인데', '려면', '는것', '이런', '하는데', '에요',
]);

/** 토큰에서 키워드 후보 생성: 전체 어절 + 2-4자 character n-gram */
function extractNgrams(token: string): string[] {
  const ngrams: string[] = [];

  // 전체 어절도 후보에 포함 (2자 이상)
  if (token.length >= 2) {
    ngrams.push(token);
  }

  // 3자 이상이면 부분 n-gram 생성 (한국어 어절은 조사 포함 3-4자가 많음)
  if (token.length >= 3) {
    for (let n = 2; n <= Math.min(4, token.length - 1); n++) {
      for (let i = 0; i <= token.length - n; i++) {
        ngrams.push(token.slice(i, i + n));
      }
    }
  }

  return ngrams;
}

/** 어절 분리: 공백 기준 */
function tokenize(text: string): string[] {
  return text
    .replace(/[^\uAC00-\uD7A3\u3131-\u314Ea-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/** 순수 숫자/기호 여부 (한국어는 제외) */
function isPureNumberOrSymbol(s: string): boolean {
  return /^[^a-zA-Z\uAC00-\uD7A3\u3131-\u314E]+$/.test(s);
}

/** 한국어 문자 포함 여부 (한글이 없는 N-gram 필터용) */
function containsKorean(s: string): boolean {
  return /[\uAC00-\uD7A3\u3131-\u314E]/.test(s);
}

/**
 * QuantitativeResult[] 에서 텍스트 마이닝 수행
 *
 * @param quantResults - 정량 분석 결과 배열
 * @param keyword - 메인 키워드 (결과에서 제외)
 */
export function mineKeywordsFromResults(
  quantResults: QuantitativeResult[],
  keyword: string,
): TextMiningResult {
  const normalizedMainKeyword = keyword.toLowerCase().replace(/\s+/g, '');

  // keyword -> { frequency, postCount, perPostFrequency }
  const kwMap = new Map<string, { frequency: number; perPostFrequency: number[] }>();

  for (const post of quantResults) {
    const text = post.bodyText || '';
    const tokens = tokenize(text);

    // 이 포스트에서 후보 키워드별 빈도
    const postKwFreq = new Map<string, number>();

    // 1) Character n-gram (2-4자) - 한국어 포함 키워드만
    for (const token of tokens) {
      if (STOPWORDS.has(token)) continue;
      if (!containsKorean(token)) continue; // 한국어 없는 토큰 스킵
      const ngrams = extractNgrams(token);
      for (const ng of ngrams) {
        if (STOPWORDS.has(ng)) continue;
        if (isPureNumberOrSymbol(ng)) continue;
        if (!containsKorean(ng)) continue; // 한국어 없는 N-gram 스킵
        postKwFreq.set(ng, (postKwFreq.get(ng) ?? 0) + 1);
      }
    }

    // 2) 어절 바이그램 - 최소 하나는 한국어 포함
    for (let i = 0; i < tokens.length - 1; i++) {
      const t1 = tokens[i];
      const t2 = tokens[i + 1];
      if (STOPWORDS.has(t1) || STOPWORDS.has(t2)) continue;
      const bigram = `${t1} ${t2}`;
      if (isPureNumberOrSymbol(bigram)) continue;
      if (!containsKorean(bigram)) continue; // 한국어 없는 바이그램 스킵
      postKwFreq.set(bigram, (postKwFreq.get(bigram) ?? 0) + 1);
    }

    // 전역 맵에 누적
    for (const [kw, freq] of postKwFreq) {
      const existing = kwMap.get(kw);
      if (existing) {
        existing.frequency += freq;
        existing.perPostFrequency.push(freq);
      } else {
        kwMap.set(kw, { frequency: freq, perPostFrequency: [freq] });
      }
    }
  }

  // 필터링 + 정렬
  const totalPosts = quantResults.length;
  const candidates: {
    keyword: string;
    frequency: number;
    postCount: number;
    perPostFrequency: number[];
    score: number;
  }[] = [];

  for (const [kw, data] of kwMap) {
    const postCount = data.perPostFrequency.length;

    // 2개 이상 포스트에 등장해야 함
    if (postCount < 2) continue;

    // 순수 숫자/기호 제외
    if (isPureNumberOrSymbol(kw)) continue;

    // 메인 키워드와 동일한 키워드 제외
    if (kw.toLowerCase().replace(/\s+/g, '') === normalizedMainKeyword) continue;

    const score = data.frequency * postCount;
    candidates.push({ keyword: kw, frequency: data.frequency, postCount, perPostFrequency: data.perPostFrequency, score });
  }

  // score 내림차순 정렬
  candidates.sort((a, b) => b.score - a.score);

  // 중복 제거: 더 긴 키워드의 부분 N-gram 제거
  // 상위 50개 후보 중에서 서브스트링 관계인 짧은 키워드를 제거
  const topPool = candidates.slice(0, 50);
  const deduped: typeof candidates = [];
  for (const c of topPool) {
    // 이 키워드가 상위 후보 중 더 긴 키워드의 부분 문자열인지 확인
    const isSubstring = topPool.some(
      (other) => other.keyword !== c.keyword
        && other.keyword.length > c.keyword.length
        && other.keyword.includes(c.keyword)
        && Math.abs(other.frequency - c.frequency) / Math.max(other.frequency, 1) < 0.15 // 빈도가 유사한 경우만 (동일 원천)
    );
    if (!isSubstring) deduped.push(c);
    if (deduped.length >= 15) break;
  }
  const top15 = deduped;

  const competitorKeywords = top15.map(({ keyword: kw, frequency, postCount, perPostFrequency }) => ({
    keyword: kw,
    frequency,
    postCount,
    perPostFrequency,
  }));

  const recommendedKeywords = top15.map((c) => c.keyword);

  // 통계 집계
  const avgBodyLength =
    totalPosts > 0
      ? Math.round(quantResults.reduce((s, r) => s + r.bodyLength, 0) / totalPosts)
      : 0;

  const avgImageCount =
    totalPosts > 0
      ? Math.round((quantResults.reduce((s, r) => s + r.imageCount, 0) / totalPosts) * 10) / 10
      : 0;

  const avgHeadingCount =
    totalPosts > 0
      ? Math.round((quantResults.reduce((s, r) => s + r.headingCount, 0) / totalPosts) * 10) / 10
      : 0;

  const avgKeywordCount =
    totalPosts > 0
      ? Math.round((quantResults.reduce((s, r) => s + r.keywordCount, 0) / totalPosts) * 10) / 10
      : 0;

  // 공통 태그: 2개 이상 포스트에서 등장한 태그
  const tagFreq = new Map<string, number>();
  for (const post of quantResults) {
    for (const tag of post.tags) {
      tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1);
    }
  }
  const commonTags = [...tagFreq.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  // 제목 패턴: 상위 포스트 제목 수집 (rank 기준 정렬)
  const titlePatterns = [...quantResults]
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.title)
    .filter(Boolean);

  log.info(
    {
      totalPosts,
      candidateCount: candidates.length,
      top15Count: top15.length,
      avgBodyLength,
      commonTagsCount: commonTags.length,
    },
    '텍스트 마이닝 완료',
  );

  return {
    competitorKeywords,
    recommendedKeywords,
    avgBodyLength,
    avgImageCount,
    avgHeadingCount,
    avgKeywordCount,
    commonTags,
    titlePatterns,
  };
}
