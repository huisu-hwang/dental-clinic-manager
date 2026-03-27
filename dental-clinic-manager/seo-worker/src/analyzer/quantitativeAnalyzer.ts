import { createChildLogger } from '../utils/logger.js';
import type { ScrapedPost, PostDetail } from './naverScraper.js';

const log = createChildLogger('quantitative');

export interface QuantitativeResult {
  rank: number;
  postUrl: string;
  blogUrl: string;
  blogName: string;
  title: string;
  titleLength: number;
  keywordPosition: 'front' | 'middle' | 'end' | 'none';
  bodyLength: number;
  imageCount: number;
  hasVideo: boolean;
  videoCount: number;
  keywordCount: number;
  headingCount: number;
  paragraphCount: number;
  externalLinkCount: number;
  internalLinkCount: number;
  commentCount: number;
  likeCount: number;
  tagCount: number;
  tags: string[];
  bodyText: string;
}

/**
 * 정량 분석 수행: 스크래핑 데이터 + 키워드 기반 분석
 */
export function analyzeQuantitative(
  keyword: string,
  post: ScrapedPost,
  detail: PostDetail,
): QuantitativeResult {
  const title = detail.title || post.title;
  const titleLength = title.length;
  const keywordPosition = getKeywordPosition(title, keyword);
  const keywordCount = countKeywordOccurrences(detail.bodyText, keyword);

  const result: QuantitativeResult = {
    rank: post.rank,
    postUrl: post.postUrl,
    blogUrl: post.blogUrl,
    blogName: post.blogName,
    title,
    titleLength,
    keywordPosition,
    bodyLength: detail.bodyText.length,
    imageCount: detail.imageCount,
    hasVideo: detail.hasVideo,
    videoCount: detail.videoCount,
    keywordCount,
    headingCount: detail.headingCount,
    paragraphCount: detail.paragraphCount,
    externalLinkCount: detail.externalLinkCount,
    internalLinkCount: detail.internalLinkCount,
    commentCount: detail.commentCount,
    likeCount: detail.likeCount,
    tagCount: detail.tagCount,
    tags: detail.tags,
    bodyText: detail.bodyText,
  };

  log.info({
    rank: post.rank,
    titleLength,
    keywordPosition,
    bodyLength: detail.bodyText.length,
    imageCount: detail.imageCount,
    keywordCount,
  }, '정량 분석 완료');

  return result;
}

/** 제목 내 키워드 위치 판단 */
function getKeywordPosition(title: string, keyword: string): 'front' | 'middle' | 'end' | 'none' {
  const normalizedTitle = title.toLowerCase().replace(/\s+/g, '');
  const normalizedKeyword = keyword.toLowerCase().replace(/\s+/g, '');

  const index = normalizedTitle.indexOf(normalizedKeyword);
  if (index === -1) return 'none';

  const titleLen = normalizedTitle.length;
  const relativePos = index / titleLen;

  if (relativePos <= 0.33) return 'front';
  if (relativePos <= 0.66) return 'middle';
  return 'end';
}

/** 본문 내 키워드 등장 횟수 */
function countKeywordOccurrences(text: string, keyword: string): number {
  if (!text || !keyword) return 0;
  const normalized = text.toLowerCase();
  const kw = keyword.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = normalized.indexOf(kw, pos)) !== -1) {
    count++;
    pos += kw.length;
  }
  return count;
}

/** 정량 통계 요약 계산 */
export function calculateQuantitativeSummary(results: QuantitativeResult[]): Record<string, { avg: number; median: number; min: number; max: number }> {
  const numericFields: (keyof QuantitativeResult)[] = [
    'titleLength', 'bodyLength', 'imageCount', 'videoCount',
    'keywordCount', 'headingCount', 'paragraphCount',
    'externalLinkCount', 'internalLinkCount', 'commentCount',
    'likeCount', 'tagCount',
  ];

  const summary: Record<string, { avg: number; median: number; min: number; max: number }> = {};

  for (const field of numericFields) {
    const values = results.map((r) => Number(r[field]) || 0).sort((a, b) => a - b);
    if (values.length === 0) continue;

    const sum = values.reduce((a, b) => a + b, 0);
    const mid = Math.floor(values.length / 2);
    const median = values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;

    summary[field] = {
      avg: Math.round((sum / values.length) * 10) / 10,
      median: Math.round(median * 10) / 10,
      min: values[0],
      max: values[values.length - 1],
    };
  }

  return summary;
}
