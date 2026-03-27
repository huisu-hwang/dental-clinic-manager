import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('qualitative');

export interface QualitativeResult {
  hasStructure: boolean;
  experienceLevel: 'high' | 'medium' | 'low';
  originalityLevel: 'high' | 'medium' | 'low';
  readabilityLevel: 'high' | 'medium' | 'low';
  contentPurpose: 'info' | 'review' | 'ad';
  imageQuality: 'original' | 'stock' | 'capture' | 'mixed';
  hasCta: boolean;
  tone: 'casual' | 'informative' | 'professional';
  hasAdDisclosure: boolean;
  multimediaLevel: 'high' | 'medium' | 'low';
}

/**
 * 정성 분석: 휴리스틱 기반 자동 평가
 * (향후 Claude API 연동으로 교체 가능)
 */
export function analyzeQualitative(
  bodyText: string,
  bodyHtml: string,
  imageCount: number,
  headingCount: number,
  paragraphCount: number,
): QualitativeResult {

  // 1. 글 구조 (서론-본론-결론)
  const hasStructure = headingCount >= 2 && paragraphCount >= 5;

  // 2. 경험/후기 반영
  const experienceKeywords = ['직접', '실제로', '경험', '후기', '다녀왔', '먹어봤', '써봤', '사용해봤', '방문', '체험', '솔직'];
  const expCount = experienceKeywords.filter((kw) => bodyText.includes(kw)).length;
  const experienceLevel = expCount >= 3 ? 'high' : expCount >= 1 ? 'medium' : 'low';

  // 3. 독창성 (본문 길이 + 이미지 수로 간접 추정)
  const originalityLevel = bodyText.length > 3000 && imageCount >= 5 ? 'high'
    : bodyText.length > 1500 ? 'medium' : 'low';

  // 4. 가독성 (문단 길이, 소제목 활용)
  const avgParagraphLen = paragraphCount > 0 ? bodyText.length / paragraphCount : bodyText.length;
  const readabilityLevel = avgParagraphLen < 300 && headingCount >= 2 ? 'high'
    : avgParagraphLen < 500 ? 'medium' : 'low';

  // 5. 글의 목적
  const adKeywords = ['협찬', '제공받', '광고', '소정의', '원고료', '체험단', '업체로부터'];
  const reviewKeywords = ['후기', '리뷰', '비교', '추천', '장단점', '별점'];
  const hasAdWords = adKeywords.some((kw) => bodyText.includes(kw));
  const hasReviewWords = reviewKeywords.some((kw) => bodyText.includes(kw));
  const contentPurpose: 'info' | 'review' | 'ad' = hasAdWords ? 'ad' : hasReviewWords ? 'review' : 'info';

  // 6. 이미지 품질 (HTML 분석)
  const hasOriginalImg = bodyHtml.includes('se-image-resource') || bodyHtml.includes('postthumb');
  const hasStockImg = bodyHtml.includes('pixabay') || bodyHtml.includes('unsplash') || bodyHtml.includes('shutterstock');
  const hasCaptureImg = bodyHtml.includes('screen') || bodyHtml.includes('capture');
  const imageQuality: 'original' | 'stock' | 'capture' | 'mixed' =
    (hasOriginalImg && !hasStockImg) ? 'original'
    : hasStockImg ? 'stock'
    : hasCaptureImg ? 'capture'
    : 'mixed';

  // 7. CTA 존재
  const ctaKeywords = ['댓글', '공감', '좋아요', '구독', '팔로우', '눌러주', '남겨주', '알려주'];
  const hasCta = ctaKeywords.some((kw) => bodyText.includes(kw));

  // 8. 톤/어조
  const casualKeywords = ['ㅋㅋ', 'ㅎㅎ', '~', '요!', '네요', '거든요', '잖아요'];
  const professionalKeywords = ['따라서', '결론적으로', '분석', '통계', '데이터', '연구'];
  const casualCount = casualKeywords.filter((kw) => bodyText.includes(kw)).length;
  const professionalCount = professionalKeywords.filter((kw) => bodyText.includes(kw)).length;
  const tone: 'casual' | 'informative' | 'professional' =
    casualCount > professionalCount ? 'casual'
    : professionalCount > casualCount ? 'professional'
    : 'informative';

  // 9. 광고 표시 여부
  const adDisclosureKeywords = ['협찬', '제공받', '광고', '소정의 원고료', '업체로부터 제공'];
  const hasAdDisclosure = adDisclosureKeywords.some((kw) => bodyText.includes(kw));

  // 10. 멀티미디어 활용도
  const hasTable = bodyHtml.includes('<table') || bodyHtml.includes('se-table');
  const hasList = bodyHtml.includes('<ul') || bodyHtml.includes('<ol') || bodyHtml.includes('se-list');
  const hasMap = bodyHtml.includes('naver.com/map') || bodyHtml.includes('map.kakao');
  const multimediaScore = [hasTable, hasList, hasMap, imageCount >= 8].filter(Boolean).length;
  const multimediaLevel: 'high' | 'medium' | 'low' =
    multimediaScore >= 3 ? 'high' : multimediaScore >= 1 ? 'medium' : 'low';

  const result: QualitativeResult = {
    hasStructure,
    experienceLevel,
    originalityLevel,
    readabilityLevel,
    contentPurpose,
    imageQuality,
    hasCta,
    tone,
    hasAdDisclosure,
    multimediaLevel,
  };

  log.info({
    hasStructure,
    experienceLevel,
    originalityLevel,
    contentPurpose,
  }, '정성 분석 완료');

  return result;
}
