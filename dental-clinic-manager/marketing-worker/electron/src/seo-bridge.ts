import os from 'os';
import { SeoApiClient, SeoJob } from './seo-api-client';
import { getConfig } from './config-store';
import { log } from './logger';

// ============================================
// SEO Job 폴링 + 분석 실행 브리지
// ============================================

export type SeoStatus = 'idle' | 'polling' | 'analyzing' | 'error';

type StatusCallback = (status: SeoStatus, message?: string) => void;

let client: SeoApiClient | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let currentStatus: SeoStatus = 'idle';
let isProcessingLocally = false; // 로컬에서 잡 처리 중 여부
const statusCallbacks: StatusCallback[] = [];

const POLL_INTERVAL = 5000;       // 5초
const HEARTBEAT_INTERVAL = 30000; // 30초
const JOB_TIMEOUT_MS = 5 * 60 * 1000; // 잡 1건 처리 최대 5분 (Playwright/네이버 hang 방지)

function setStatus(status: SeoStatus, message?: string): void {
  currentStatus = status;
  statusCallbacks.forEach(cb => cb(status, message));
}

export function startSeoWorker(): void {
  const cfg = getConfig();
  if (!cfg.dashboardUrl || !cfg.workerApiKey) return;

  client = new SeoApiClient();

  heartbeatTimer = setInterval(() => sendHeartbeat(), HEARTBEAT_INTERVAL);
  pollTimer = setInterval(() => pollForJobs(), POLL_INTERVAL);
  setStatus('polling');
  log('info', '[SEO] 워커 시작');
}

export function stopSeoWorker(): void {
  if (pollTimer) clearInterval(pollTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  pollTimer = null;
  heartbeatTimer = null;
  client = null;
  setStatus('idle');
  log('info', '[SEO] 워커 중지');
}

export function getSeoStatus(): SeoStatus {
  return currentStatus;
}

export function onSeoStatusChange(cb: StatusCallback): void {
  statusCallbacks.push(cb);
}

async function pollForJobs(): Promise<void> {
  if (!client || isProcessingLocally) return;

  try {
    const { job, runningCount } = await client.fetchPendingJob();

    // 워커가 stop_requested 상태면 잡 픽업하지 않음 (heartbeat에서 종료 처리됨)
    if (!client) return;

    if (job) {
      isProcessingLocally = true;
      setStatus('analyzing', `키워드 "${job.params.keyword}" 분석 중...`);
      await processJob(job);
      isProcessingLocally = false;
      setStatus('polling');
    } else if (runningCount > 0) {
      // 로컬 처리 중이 아니지만 DB에 running 잡이 있으면 분석 중 표시
      setStatus('analyzing', `${runningCount}건 분석 진행 중...`);
    } else {
      // running 잡도 없으면 대기 상태
      setStatus('polling');
    }
  } catch (err) {
    log('error', `[SEO] 폴링 오류: ${err instanceof Error ? err.message : err}`);
    if (isProcessingLocally) isProcessingLocally = false;
  }
}

async function processJob(job: SeoJob): Promise<void> {
  log('info', `[SEO] Job 처리 시작: ${job.job_type} - "${job.params.keyword}"`);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { chromium } = require('playwright');
  let browser: any = null;

  try {
    // 전체 잡 처리에 5분 timeout — Playwright/네이버 hang 시 자동 fail 처리
    await Promise.race([
      (async () => {
        browser = await chromium.launch({ headless: getConfig().headless });
        const context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });
        const page = await context.newPage();

        if (job.job_type === 'keyword_analysis') {
          await processKeywordAnalysis(job, page);
        } else if (job.job_type === 'competitor_compare') {
          await processCompetitorCompare(job, page);
        }
      })(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Job timeout: ${JOB_TIMEOUT_MS / 1000}초 내 완료되지 않음`)), JOB_TIMEOUT_MS)
      ),
    ]);

    await client!.updateJobStatus(job.id, 'completed');
    log('info', `[SEO] Job 완료: ${job.id}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', `[SEO] Job 실패: ${msg}`);
    try {
      await client!.updateJobStatus(job.id, 'failed', { error_message: msg });
    } catch (updateErr) {
      log('error', `[SEO] Job 실패 상태 업데이트 실패: ${updateErr instanceof Error ? updateErr.message : updateErr}`);
    }
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore close errors */ }
    }
  }
}

/**
 * 키워드 분석: 네이버 블로그 검색 → 상위 5개 글 정량/정성 분석
 */
async function processKeywordAnalysis(job: SeoJob, page: any): Promise<void> {
  const keyword = job.params.keyword;

  // 1. 분석 레코드 생성
  await client!.saveData({
    type: 'keyword_analysis',
    data: {
      keyword,
      status: 'analyzing',
      job_id: job.id,
      analyzed_by: job.params.clinicId,
    },
  });

  // 2. 네이버 블로그 검색
  const searchUrl = `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(keyword)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 3. 상위 5개 블로그 URL 수집
  const postUrls: string[] = await page.evaluate(() => {
    const links: string[] = [];
    const items = document.querySelectorAll('.title_area a, .api_txt_lines.total_tit');
    items.forEach((el: Element) => {
      const href = (el as HTMLAnchorElement).href;
      if (href && href.includes('blog.naver.com') && links.length < 5) {
        links.push(href);
      }
    });
    return links;
  });

  log('info', `[SEO] "${keyword}" 검색 결과: ${postUrls.length}개 블로그 발견`);

  // 4. 각 글 분석
  const analyzedPosts = [];
  for (let i = 0; i < postUrls.length; i++) {
    try {
      const postData = await scrapeAndAnalyzePost(page, postUrls[i], keyword, i + 1);
      analyzedPosts.push(postData);

      // 개별 포스트 저장
      await client!.saveData({
        type: 'analyzed_post',
        data: { ...postData, keyword },
      });

      log('info', `[SEO] 포스트 ${i + 1}/${postUrls.length} 분석 완료`);
    } catch (err) {
      log('warn', `[SEO] 포스트 ${i + 1} 분석 실패: ${err instanceof Error ? err.message : err}`);
    }
  }

  // 5. 통계 요약 계산 + 상태 업데이트
  const summary = calculateSummary(analyzedPosts);
  await client!.saveData({
    type: 'update_analysis_status',
    data: {
      keyword,
      job_id: job.id,
      status: 'completed',
      summary,
      post_count: analyzedPosts.length,
    },
  });
}

/**
 * 경쟁 비교: 내 글 vs 상위 5개 경쟁 글
 */
async function processCompetitorCompare(job: SeoJob, page: any): Promise<void> {
  const { keyword, myPostUrl } = job.params;
  if (!myPostUrl) throw new Error('myPostUrl이 필요합니다');

  // 1. 경쟁 글 분석
  const searchUrl = `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(keyword)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const postUrls: string[] = await page.evaluate(() => {
    const links: string[] = [];
    document.querySelectorAll('.title_area a, .api_txt_lines.total_tit').forEach((el: Element) => {
      const href = (el as HTMLAnchorElement).href;
      if (href && href.includes('blog.naver.com') && links.length < 5) {
        links.push(href);
      }
    });
    return links;
  });

  const competitorPosts = [];
  for (const url of postUrls) {
    try {
      const data = await scrapeAndAnalyzePost(page, url, keyword, competitorPosts.length + 1);
      competitorPosts.push(data);
    } catch { /* skip */ }
  }

  // 2. 내 글 분석
  const myPost = await scrapeAndAnalyzePost(page, myPostUrl, keyword, 0);

  // 3. GAP 계산
  const gaps = calculateGaps(myPost, competitorPosts);
  const overallScore = calculateOverallScore(myPost, competitorPosts);

  // 4. 결과 저장
  await client!.saveData({
    type: 'compare_result',
    data: {
      keyword,
      my_post_url: myPostUrl,
      my_post_data: myPost,
      gaps,
      overall_score: overallScore,
      job_id: job.id,
      analyzed_by: job.params.clinicId,
    },
  });
}

/**
 * 개별 블로그 글 스크래핑 + 정량/정성 분석
 */
async function scrapeAndAnalyzePost(page: any, url: string, keyword: string, rank: number): Promise<any> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // iframe 내부 콘텐츠 접근 (네이버 블로그는 iframe 사용)
  let contentFrame = page;
  try {
    const iframe = await page.waitForSelector('#mainFrame', { timeout: 5000 });
    if (iframe) {
      contentFrame = await iframe.contentFrame();
      await contentFrame.waitForTimeout(1000);
    }
  } catch { /* iframe 없는 경우 */ }

  // 정량 데이터 추출
  const quantitative = await contentFrame.evaluate((kw: string) => {
    const title = document.querySelector('.se-title-text, .pcol1')?.textContent?.trim() || '';
    const bodyEl = document.querySelector('.se-main-container, #postViewArea');
    const bodyText = bodyEl?.textContent?.trim() || '';
    const images = document.querySelectorAll('.se-image-resource, img[id^="img"]');
    const videos = document.querySelectorAll('iframe[src*="youtube"], iframe[src*="tv.naver"], .se-video');
    const headings = document.querySelectorAll('.se-text-paragraph-align- .se-text-paragraph span[style*="font-size: 2"], h2, h3, h4');
    const paragraphs = document.querySelectorAll('.se-text-paragraph, p');
    const allLinks = document.querySelectorAll('a[href]');
    let externalLinks = 0;
    let internalLinks = 0;
    allLinks.forEach((a: Element) => {
      const href = (a as HTMLAnchorElement).href;
      if (href.includes('blog.naver.com')) internalLinks++;
      else if (href.startsWith('http')) externalLinks++;
    });

    // 키워드 위치
    const kwLower = kw.toLowerCase();
    const titleLower = title.toLowerCase();
    let keywordPosition = 'none';
    if (titleLower.includes(kwLower)) {
      const idx = titleLower.indexOf(kwLower);
      if (idx < title.length / 3) keywordPosition = 'front';
      else if (idx < (title.length * 2) / 3) keywordPosition = 'middle';
      else keywordPosition = 'end';
    }

    // 키워드 반복 횟수
    const bodyLower = bodyText.toLowerCase();
    let keywordCount = 0;
    let searchIdx = 0;
    while ((searchIdx = bodyLower.indexOf(kwLower, searchIdx)) !== -1) {
      keywordCount++;
      searchIdx += kwLower.length;
    }

    return {
      title,
      title_length: title.length,
      body_length: bodyText.length,
      body_text: bodyText.substring(0, 10000),
      image_count: images.length,
      has_video: videos.length > 0,
      video_count: videos.length,
      keyword_count: keywordCount,
      keyword_position: keywordPosition,
      heading_count: headings.length,
      paragraph_count: paragraphs.length,
      external_link_count: externalLinks,
      internal_link_count: internalLinks,
    };
  }, keyword);

  // 정성 분석
  const qualitative = analyzeQualitative(quantitative);

  return {
    rank,
    post_url: url,
    blog_url: url.split('/').slice(0, 4).join('/'),
    ...quantitative,
    ...qualitative,
  };
}

/**
 * 정성 분석 (키워드 기반)
 */
function analyzeQualitative(data: any) {
  const body = (data.body_text || '').toLowerCase();

  // 구조
  const has_structure = data.heading_count >= 2 && data.paragraph_count >= 5;

  // 경험/후기
  const expKeywords = ['직접', '실제로', '경험', '후기', '사용해', '느낌', '솔직', '개인적'];
  const expCount = expKeywords.filter(k => body.includes(k)).length;
  const experience_level = expCount >= 3 ? 'high' : expCount >= 1 ? 'medium' : 'low';

  // 독창성
  const originality_level = data.body_length > 3000 && data.image_count >= 5 ? 'high' :
    data.body_length > 1500 && data.image_count >= 3 ? 'medium' : 'low';

  // 가독성
  const avgParaLen = data.paragraph_count > 0 ? data.body_length / data.paragraph_count : data.body_length;
  const readability_level = avgParaLen < 300 && data.heading_count >= 2 ? 'high' :
    avgParaLen < 500 ? 'medium' : 'low';

  // 글 목적
  const adKeywords = ['광고', '협찬', '제공받', '소정의'];
  const reviewKeywords = ['후기', '리뷰', '사용기', '체험'];
  const hasAd = adKeywords.some(k => body.includes(k));
  const hasReview = reviewKeywords.some(k => body.includes(k));
  const content_purpose = hasAd ? 'ad' : hasReview ? 'review' : 'info';

  // CTA
  const ctaKeywords = ['댓글', '공감', '이웃추가', '구독', '팔로우'];
  const has_cta = ctaKeywords.some(k => body.includes(k));

  // 톤
  const casualKeywords = ['ㅋㅋ', 'ㅎㅎ', '~', '요!', '네요'];
  const proKeywords = ['됩니다', '합니다', '바랍니다', '드립니다'];
  const casualCount = casualKeywords.filter(k => body.includes(k)).length;
  const proCount = proKeywords.filter(k => body.includes(k)).length;
  const tone = casualCount > proCount ? 'casual' : proCount > casualCount ? 'professional' : 'informative';

  // 광고 표시
  const has_ad_disclosure = hasAd;

  // 멀티미디어
  const multimedia_level = (data.image_count >= 10 || data.has_video) ? 'high' :
    data.image_count >= 5 ? 'medium' : 'low';

  return {
    has_structure,
    experience_level,
    originality_level,
    readability_level,
    content_purpose,
    image_quality: data.image_count >= 5 ? 'original' : 'stock',
    has_cta,
    tone,
    has_ad_disclosure,
    multimedia_level,
  };
}

/**
 * 통계 요약 계산
 */
function calculateSummary(posts: any[]) {
  if (posts.length === 0) return {};

  const numFields = ['title_length', 'body_length', 'image_count', 'video_count',
    'keyword_count', 'heading_count', 'paragraph_count'];

  const summary: Record<string, any> = {};
  for (const field of numFields) {
    const values = posts.map(p => p[field] || 0).sort((a: number, b: number) => a - b);
    summary[field] = {
      avg: Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length),
      median: values[Math.floor(values.length / 2)],
      min: values[0],
      max: values[values.length - 1],
    };
  }
  return summary;
}

/**
 * GAP 분석
 */
function calculateGaps(myPost: any, competitors: any[]): any[] {
  if (competitors.length === 0) return [];

  const gaps: any[] = [];
  const fields = [
    { key: 'body_length', label: '본문 길이', unit: '자' },
    { key: 'image_count', label: '이미지 수', unit: '개' },
    { key: 'heading_count', label: '소제목 수', unit: '개' },
    { key: 'keyword_count', label: '키워드 반복', unit: '회' },
    { key: 'paragraph_count', label: '문단 수', unit: '개' },
  ];

  for (const f of fields) {
    const myVal = myPost[f.key] || 0;
    const avgVal = Math.round(competitors.reduce((s: number, c: any) => s + (c[f.key] || 0), 0) / competitors.length);
    const gap = avgVal - myVal;

    if (gap > 0) {
      const ratio = gap / Math.max(avgVal, 1);
      gaps.push({
        category: 'quantitative',
        item: f.label,
        myValue: `${myVal}${f.unit}`,
        competitorAvg: `${avgVal}${f.unit}`,
        gap: `${gap}${f.unit} 부족`,
        priority: ratio > 0.5 ? 'critical' : ratio > 0.3 ? 'high' : ratio > 0.1 ? 'medium' : 'low',
        suggestion: `${f.label}을(를) ${avgVal}${f.unit} 이상으로 늘리세요.`,
      });
    }
  }

  return gaps.sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.priority] || 4) - (order[b.priority] || 4);
  });
}

/**
 * 종합 점수 계산 (100점 만점)
 */
function calculateOverallScore(myPost: any, competitors: any[]): number {
  if (competitors.length === 0) return 50;

  let score = 100;
  const fields = ['body_length', 'image_count', 'heading_count', 'keyword_count', 'paragraph_count'];

  for (const field of fields) {
    const myVal = myPost[field] || 0;
    const avgVal = competitors.reduce((s: number, c: any) => s + (c[field] || 0), 0) / competitors.length;
    if (avgVal > 0 && myVal < avgVal) {
      const deficit = (avgVal - myVal) / avgVal;
      score -= Math.min(deficit * 20, 10); // 최대 항목당 -10점
    }
  }

  // 정성 보너스/감점
  if (myPost.has_structure) score += 2;
  if (myPost.experience_level === 'high') score += 3;
  if (myPost.readability_level === 'high') score += 2;
  if (myPost.has_cta) score += 1;

  return Math.max(0, Math.min(100, Math.round(score)));
}

async function sendHeartbeat(): Promise<void> {
  if (!client) return;
  try {
    const result = await client.sendHeartbeat(
      `electron-seo-${os.hostname()}`,
      isProcessingLocally || currentStatus === 'analyzing' ? 'busy' : 'online'
    );
    // DB에서 stop_requested=true 이면 워커 즉시 종료
    if (result?.stop_requested) {
      log('info', '[SEO] stop_requested 신호 수신, 워커 종료');
      stopSeoWorker();
    }
  } catch { /* ignore */ }
}
