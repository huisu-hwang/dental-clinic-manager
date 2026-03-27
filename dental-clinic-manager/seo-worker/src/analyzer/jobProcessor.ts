import { getSupabaseClient } from '../db/supabaseClient.js';
import { createChildLogger } from '../utils/logger.js';
import { searchNaverBlog, scrapePostDetail } from './naverScraper.js';
import { analyzeQuantitative, calculateQuantitativeSummary } from './quantitativeAnalyzer.js';
import { analyzeQualitative } from './qualitativeAnalyzer.js';
import { completeJob } from '../queue/jobConsumer.js';
import type { SeoJob } from '../queue/jobConsumer.js';
import type { QuantitativeResult } from './quantitativeAnalyzer.js';
import type { QualitativeResult } from './qualitativeAnalyzer.js';

const log = createChildLogger('jobProcessor');

/**
 * SEO 분석 잡 처리 메인 함수
 */
export async function processSeoJob(job: SeoJob): Promise<void> {
  const { keyword, myPostUrl } = job.params;
  log.info({ jobId: job.id, jobType: job.job_type, keyword }, 'SEO 잡 처리 시작');

  if (job.job_type === 'keyword_analysis') {
    await processKeywordAnalysis(job.id, keyword, job.created_by);
  } else if (job.job_type === 'competitor_compare') {
    await processCompetitorCompare(job.id, keyword, myPostUrl || '', job.created_by);
  } else {
    throw new Error(`알 수 없는 잡 타입: ${job.job_type}`);
  }
}

/**
 * 키워드 분석 처리
 */
async function processKeywordAnalysis(jobId: string, keyword: string, userId: string): Promise<void> {
  const supabase = getSupabaseClient();

  // 1. 분석 레코드 생성
  const { data: analysis, error: createError } = await supabase
    .from('seo_keyword_analyses')
    .insert({
      keyword,
      analyzed_by: userId,
      status: 'collecting',
      job_id: jobId,
    })
    .select()
    .single();

  if (createError || !analysis) {
    throw new Error(`분석 레코드 생성 실패: ${createError?.message}`);
  }

  const analysisId = analysis.id;
  log.info({ analysisId, keyword }, '분석 레코드 생성 완료');

  try {
    // 2. 네이버 검색 → 상위 5개 수집
    const searchResults = await searchNaverBlog(keyword);
    if (searchResults.length === 0) {
      throw new Error('검색 결과가 없습니다.');
    }

    // 3. 상태 업데이트: 정량 분석 중
    await supabase
      .from('seo_keyword_analyses')
      .update({ status: 'analyzing_quantitative' })
      .eq('id', analysisId);

    // 4. 각 글 상세 스크래핑 + 정량 분석
    const quantResults: QuantitativeResult[] = [];
    const qualResults: QualitativeResult[] = [];

    for (const post of searchResults) {
      try {
        log.info({ rank: post.rank, url: post.postUrl }, '글 스크래핑 시작');

        const detail = await scrapePostDetail(post.postUrl);
        const quantResult = analyzeQuantitative(keyword, post, detail);
        quantResults.push(quantResult);

        // 딜레이: 네이버 차단 방지
        await sleep(2000);
      } catch (err) {
        log.warn({ err, rank: post.rank, url: post.postUrl }, '글 스크래핑 실패, 건너뜀');
      }
    }

    // 5. 상태 업데이트: 정성 분석 중
    await supabase
      .from('seo_keyword_analyses')
      .update({ status: 'analyzing_qualitative' })
      .eq('id', analysisId);

    // 6. 정성 분석
    for (const qr of quantResults) {
      const qualResult = analyzeQualitative(
        qr.bodyText,
        '', // bodyHtml은 정량분석에서 미보관 → 빈 문자열
        qr.imageCount,
        qr.headingCount,
        qr.paragraphCount,
      );
      qualResults.push(qualResult);
    }

    // 7. DB에 개별 포스트 결과 저장
    for (let i = 0; i < quantResults.length; i++) {
      const qr = quantResults[i];
      const ql = qualResults[i];

      await supabase.from('seo_analyzed_posts').insert({
        analysis_id: analysisId,
        rank: qr.rank,
        post_url: qr.postUrl,
        blog_url: qr.blogUrl,
        blog_name: qr.blogName,
        title: qr.title,
        title_length: qr.titleLength,
        keyword_position: qr.keywordPosition,
        body_length: qr.bodyLength,
        image_count: qr.imageCount,
        has_video: qr.hasVideo,
        video_count: qr.videoCount,
        keyword_count: qr.keywordCount,
        heading_count: qr.headingCount,
        paragraph_count: qr.paragraphCount,
        external_link_count: qr.externalLinkCount,
        internal_link_count: qr.internalLinkCount,
        comment_count: qr.commentCount,
        like_count: qr.likeCount,
        tag_count: qr.tagCount,
        tags: qr.tags,
        has_structure: ql.hasStructure,
        experience_level: ql.experienceLevel,
        originality_level: ql.originalityLevel,
        readability_level: ql.readabilityLevel,
        content_purpose: ql.contentPurpose,
        image_quality: ql.imageQuality,
        has_cta: ql.hasCta,
        tone: ql.tone,
        has_ad_disclosure: ql.hasAdDisclosure,
        multimedia_level: ql.multimediaLevel,
        body_text: qr.bodyText.substring(0, 10000), // 10000자까지만 저장
      });
    }

    // 8. 통계 요약 계산
    const quantSummary = calculateQuantitativeSummary(quantResults);
    const keywordPositionDist = countDistribution(quantResults.map((r) => r.keywordPosition));
    const videoRate = quantResults.filter((r) => r.hasVideo).length / Math.max(quantResults.length, 1);

    const qualSummary = {
      structureRate: qualResults.filter((r) => r.hasStructure).length / Math.max(qualResults.length, 1),
      experienceDistribution: countDistribution(qualResults.map((r) => r.experienceLevel)),
      originalityDistribution: countDistribution(qualResults.map((r) => r.originalityLevel)),
      readabilityDistribution: countDistribution(qualResults.map((r) => r.readabilityLevel)),
      purposeDistribution: countDistribution(qualResults.map((r) => r.contentPurpose)),
      imageQualityDistribution: countDistribution(qualResults.map((r) => r.imageQuality)),
      ctaRate: qualResults.filter((r) => r.hasCta).length / Math.max(qualResults.length, 1),
      toneDistribution: countDistribution(qualResults.map((r) => r.tone)),
      adDisclosureRate: qualResults.filter((r) => r.hasAdDisclosure).length / Math.max(qualResults.length, 1),
      multimediaDistribution: countDistribution(qualResults.map((r) => r.multimediaLevel)),
    };

    const summary = {
      quantitative: quantSummary,
      keywordPositionDistribution: keywordPositionDist,
      videoRate,
      qualitative: qualSummary,
    };

    // 9. 분석 완료 업데이트
    await supabase
      .from('seo_keyword_analyses')
      .update({
        status: 'completed',
        summary,
        analyzed_at: new Date().toISOString(),
      })
      .eq('id', analysisId);

    // 10. Job 완료
    await completeJob(jobId, { analysisId, postCount: quantResults.length });

    log.info({ jobId, analysisId, postCount: quantResults.length }, '키워드 분석 완료');

  } catch (err) {
    // 분석 실패 상태 업데이트
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('seo_keyword_analyses')
      .update({ status: 'failed', error_message: message })
      .eq('id', analysisId);

    throw err;
  }
}

/**
 * 경쟁 비교 처리
 */
async function processCompetitorCompare(
  jobId: string,
  keyword: string,
  myPostUrl: string,
  userId: string,
): Promise<void> {
  const supabase = getSupabaseClient();

  // 1. 키워드 분석 먼저 수행 (상위 글 수집)
  const searchResults = await searchNaverBlog(keyword);
  if (searchResults.length === 0) {
    throw new Error('검색 결과가 없습니다.');
  }

  // 2. 상위 글 분석
  const competitorResults: QuantitativeResult[] = [];
  const competitorQual: QualitativeResult[] = [];

  for (const post of searchResults) {
    try {
      const detail = await scrapePostDetail(post.postUrl);
      const quantResult = analyzeQuantitative(keyword, post, detail);
      competitorResults.push(quantResult);

      const qualResult = analyzeQualitative(
        detail.bodyText,
        detail.bodyHtml,
        detail.imageCount,
        detail.headingCount,
        detail.paragraphCount,
      );
      competitorQual.push(qualResult);

      await sleep(2000);
    } catch (err) {
      log.warn({ err, rank: post.rank }, '경쟁 글 스크래핑 실패');
    }
  }

  // 3. 내 글 분석
  log.info({ myPostUrl }, '내 블로그 글 분석 시작');
  const myDetail = await scrapePostDetail(myPostUrl);
  const myQuant = analyzeQuantitative(keyword, {
    rank: 0,
    postUrl: myPostUrl,
    blogUrl: '',
    blogName: '내 블로그',
    title: myDetail.title,
  }, myDetail);
  const myQual = analyzeQualitative(
    myDetail.bodyText,
    myDetail.bodyHtml,
    myDetail.imageCount,
    myDetail.headingCount,
    myDetail.paragraphCount,
  );

  // 4. GAP 분석
  const gaps = calculateGaps(myQuant, myQual, competitorResults, competitorQual);

  // 5. 종합 점수 계산 (100점 만점)
  const overallScore = calculateOverallScore(myQuant, myQual, competitorResults, competitorQual);

  // 6. DB 저장
  const { error } = await supabase.from('seo_compare_results').insert({
    keyword,
    my_post_url: myPostUrl,
    my_post_data: { quantitative: myQuant, qualitative: myQual },
    gaps,
    overall_score: overallScore,
    analyzed_by: userId,
    job_id: jobId,
  });

  if (error) {
    throw new Error(`비교 결과 저장 실패: ${error.message}`);
  }

  await completeJob(jobId, { overallScore, gapCount: gaps.length });
  log.info({ jobId, overallScore, gapCount: gaps.length }, '경쟁 비교 완료');
}

// --- GAP 분석 ---

interface GapItem {
  category: 'quantitative' | 'qualitative';
  item: string;
  myValue: string | number;
  competitorAvg: string | number;
  gap: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  suggestion: string;
}

function calculateGaps(
  myQuant: QuantitativeResult,
  myQual: QualitativeResult,
  compQuant: QuantitativeResult[],
  compQual: QualitativeResult[],
): GapItem[] {
  const gaps: GapItem[] = [];

  // 정량 GAP
  const avgBodyLength = avg(compQuant.map((r) => r.bodyLength));
  if (myQuant.bodyLength < avgBodyLength * 0.7) {
    gaps.push({
      category: 'quantitative',
      item: '본문 글자수',
      myValue: myQuant.bodyLength,
      competitorAvg: Math.round(avgBodyLength),
      gap: `상위 평균 대비 ${Math.round((1 - myQuant.bodyLength / avgBodyLength) * 100)}% 부족`,
      priority: 'critical',
      suggestion: `본문을 ${Math.round(avgBodyLength)}자 이상으로 늘리세요. 구체적 경험, 사례, 비교 분석을 추가하면 자연스럽게 분량이 늘어납니다.`,
    });
  }

  const avgImageCount = avg(compQuant.map((r) => r.imageCount));
  if (myQuant.imageCount < avgImageCount * 0.6) {
    gaps.push({
      category: 'quantitative',
      item: '이미지 개수',
      myValue: myQuant.imageCount,
      competitorAvg: Math.round(avgImageCount * 10) / 10,
      gap: `상위 평균 대비 ${Math.round((1 - myQuant.imageCount / avgImageCount) * 100)}% 부족`,
      priority: 'high',
      suggestion: `이미지를 ${Math.ceil(avgImageCount)}개 이상 삽입하세요. 직접 촬영한 최신 이미지가 가장 효과적입니다.`,
    });
  }

  if (myQuant.keywordPosition !== 'front') {
    const frontRate = compQuant.filter((r) => r.keywordPosition === 'front').length / Math.max(compQuant.length, 1);
    if (frontRate >= 0.5) {
      gaps.push({
        category: 'quantitative',
        item: '제목 키워드 위치',
        myValue: myQuant.keywordPosition,
        competitorAvg: `상위 ${Math.round(frontRate * 100)}%가 앞배치`,
        gap: '키워드가 제목 앞부분에 없음',
        priority: 'high',
        suggestion: '제목 앞부분에 핵심 키워드를 배치하세요. 15~25자 내외가 권장됩니다.',
      });
    }
  }

  if (myQuant.keywordCount < 3) {
    gaps.push({
      category: 'quantitative',
      item: '키워드 반복 횟수',
      myValue: myQuant.keywordCount,
      competitorAvg: Math.round(avg(compQuant.map((r) => r.keywordCount)) * 10) / 10,
      gap: '키워드 반복이 부족합니다 (권장: 3~5회)',
      priority: 'medium',
      suggestion: '본문에 키워드를 3~5회 자연스럽게 포함시키세요. 소제목에도 포함하면 효과적입니다.',
    });
  }

  const avgHeadingCount = avg(compQuant.map((r) => r.headingCount));
  if (myQuant.headingCount < avgHeadingCount * 0.5) {
    gaps.push({
      category: 'quantitative',
      item: '소제목 개수',
      myValue: myQuant.headingCount,
      competitorAvg: Math.round(avgHeadingCount * 10) / 10,
      gap: '소제목(구조화)이 부족합니다',
      priority: 'medium',
      suggestion: '소제목을 활용해 글을 구조화하세요. 서론-본론-결론 구조가 효과적입니다.',
    });
  }

  const videoRate = compQuant.filter((r) => r.hasVideo).length / Math.max(compQuant.length, 1);
  if (!myQuant.hasVideo && videoRate >= 0.5) {
    gaps.push({
      category: 'quantitative',
      item: '동영상',
      myValue: '없음',
      competitorAvg: `상위 ${Math.round(videoRate * 100)}%가 포함`,
      gap: '동영상이 없습니다',
      priority: 'low',
      suggestion: '관련 동영상을 삽입하면 체류시간이 늘어나 SEO에 도움됩니다.',
    });
  }

  // 정성 GAP
  if (myQual.experienceLevel === 'low') {
    gaps.push({
      category: 'qualitative',
      item: '경험/후기 반영',
      myValue: '낮음',
      competitorAvg: majorityLevel(compQual.map((r) => r.experienceLevel)),
      gap: '실제 경험이 부족합니다',
      priority: 'critical',
      suggestion: '직접 경험한 내용, 구체적 후기, 개인적 의견을 추가하세요. D.I.A. 알고리즘은 경험 정보를 높이 평가합니다.',
    });
  }

  if (myQual.originalityLevel === 'low') {
    gaps.push({
      category: 'qualitative',
      item: '독창성',
      myValue: '낮음',
      competitorAvg: majorityLevel(compQual.map((r) => r.originalityLevel)),
      gap: '차별화된 콘텐츠가 부족합니다',
      priority: 'high',
      suggestion: '다른 글에서 찾을 수 없는 고유한 관점이나 정보를 추가하세요.',
    });
  }

  if (myQual.readabilityLevel === 'low') {
    gaps.push({
      category: 'qualitative',
      item: '가독성',
      myValue: '낮음',
      competitorAvg: majorityLevel(compQual.map((r) => r.readabilityLevel)),
      gap: '가독성이 낮습니다',
      priority: 'medium',
      suggestion: '문단을 3~4줄로 짧게 구성하고, 소제목과 볼드를 활용하세요.',
    });
  }

  // 우선순위 정렬
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  gaps.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return gaps;
}

function calculateOverallScore(
  myQuant: QuantitativeResult,
  myQual: QualitativeResult,
  compQuant: QuantitativeResult[],
  compQual: QualitativeResult[],
): number {
  let score = 100;

  // 정량 감점
  const avgBody = avg(compQuant.map((r) => r.bodyLength));
  if (avgBody > 0) score -= Math.max(0, (1 - myQuant.bodyLength / avgBody)) * 15;

  const avgImg = avg(compQuant.map((r) => r.imageCount));
  if (avgImg > 0) score -= Math.max(0, (1 - myQuant.imageCount / avgImg)) * 10;

  if (myQuant.keywordPosition !== 'front') score -= 8;
  if (myQuant.keywordCount < 3) score -= 5;

  const avgHeading = avg(compQuant.map((r) => r.headingCount));
  if (avgHeading > 0 && myQuant.headingCount < avgHeading * 0.5) score -= 5;

  // 정성 감점
  if (myQual.experienceLevel === 'low') score -= 15;
  else if (myQual.experienceLevel === 'medium') score -= 5;

  if (myQual.originalityLevel === 'low') score -= 12;
  else if (myQual.originalityLevel === 'medium') score -= 4;

  if (myQual.readabilityLevel === 'low') score -= 8;
  if (!myQual.hasStructure) score -= 7;

  return Math.max(0, Math.round(score));
}

// --- 유틸리티 ---

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function countDistribution<T extends string>(values: T[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const v of values) {
    dist[v] = (dist[v] || 0) + 1;
  }
  return dist;
}

function majorityLevel(levels: string[]): string {
  const dist = countDistribution(levels);
  return Object.entries(dist).sort((a, b) => b[1] - a[1])[0]?.[0] || 'medium';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
