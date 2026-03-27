import { Page } from 'playwright';
import { createPage } from './browserManager.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('naverScraper');

export interface ScrapedPost {
  rank: number;
  postUrl: string;
  blogUrl: string;
  blogName: string;
  title: string;
}

export interface PostDetail {
  title: string;
  bodyText: string;
  bodyHtml: string;
  imageCount: number;
  hasVideo: boolean;
  videoCount: number;
  headingCount: number;
  paragraphCount: number;
  externalLinkCount: number;
  internalLinkCount: number;
  commentCount: number;
  likeCount: number;
  tagCount: number;
  tags: string[];
}

/**
 * 네이버 블로그 검색에서 상위 5개 글 URL 수집
 */
export async function searchNaverBlog(keyword: string): Promise<ScrapedPost[]> {
  const { context, page } = await createPage();
  const posts: ScrapedPost[] = [];

  try {
    const searchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}&sm=tab_opt&nso=so%3Ar%2Cp%3Aall`;
    log.info({ keyword, url: searchUrl }, '네이버 블로그 검색 시작');

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 블로그 검색 결과 수집 (상위 5개)
    const results = await page.$$('div.detail_box');
    const maxResults = Math.min(results.length, 5);

    for (let i = 0; i < maxResults; i++) {
      try {
        const detail = results[i];

        // 제목과 URL
        const titleEl = await detail.$('a.title_link');
        if (!titleEl) continue;

        const title = (await titleEl.textContent() || '').trim();
        const postUrl = await titleEl.getAttribute('href') || '';

        // 블로그명
        const blogNameEl = await detail.$('a.name');
        const blogName = (await blogNameEl?.textContent() || '').trim();
        const blogUrl = await blogNameEl?.getAttribute('href') || '';

        // 광고 필터링 (ad 클래스 확인)
        const parent = await detail.$('xpath=..');
        const adBadge = await parent?.$('.spblog_og.ico_ad, .ad_dsc');
        if (adBadge) {
          log.debug({ rank: i + 1, title }, '광고 글 건너뜀');
          continue;
        }

        posts.push({
          rank: posts.length + 1,
          postUrl,
          blogUrl,
          blogName,
          title,
        });

        if (posts.length >= 5) break;
      } catch (err) {
        log.warn({ err, index: i }, '검색 결과 파싱 중 오류');
      }
    }

    log.info({ keyword, count: posts.length }, '검색 결과 수집 완료');
  } catch (err) {
    log.error({ err, keyword }, '네이버 검색 실패');
    throw err;
  } finally {
    await context.close();
  }

  return posts;
}

/**
 * 개별 블로그 글 페이지에서 정량 데이터 수집
 */
export async function scrapePostDetail(postUrl: string): Promise<PostDetail> {
  const { context, page } = await createPage();

  try {
    log.info({ postUrl }, '블로그 글 상세 스크래핑 시작');

    // 네이버 블로그는 iframe 내에 콘텐츠가 있음
    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // iframe 내부 콘텐츠 접근
    let contentPage: Page = page;
    const mainFrame = page.frame('mainFrame');
    if (mainFrame) {
      await mainFrame.waitForLoadState('domcontentloaded');
      contentPage = mainFrame as unknown as Page;
    }

    // 모바일 URL로 리다이렉트 시 처리
    const currentUrl = page.url();
    if (currentUrl.includes('m.blog.naver.com')) {
      await page.waitForTimeout(1000);
    }

    // 제목
    const title = await extractText(contentPage, [
      '.se-title-text',
      '.pcol1 .itemSubjectBol498',
      'h3.se_textarea',
      '.tit_h3',
      'title',
    ]);

    // 본문 텍스트
    const bodyText = await extractText(contentPage, [
      '.se-main-container',
      '#postViewArea',
      '.post-view',
      '#post-area',
    ]);

    // 본문 HTML
    const bodyHtml = await extractHtml(contentPage, [
      '.se-main-container',
      '#postViewArea',
      '.post-view',
    ]);

    // 이미지 수
    const imageCount = await countElements(contentPage, [
      '.se-main-container img.se-image-resource',
      '.se-main-container img',
      '#postViewArea img',
    ]);

    // 동영상 수
    const videoCount = await countElements(contentPage, [
      '.se-video',
      '.se-oglink-video',
      'iframe[src*="video"]',
      'iframe[src*="youtube"]',
      'iframe[src*="tv.naver"]',
      'video',
    ]);

    // 소제목(H태그) 수
    const headingCount = await countElements(contentPage, [
      '.se-module-text.se-title',
      '.se-section-title',
      'h2, h3, h4',
    ]);

    // 문단 수
    const paragraphCount = await countParagraphs(contentPage);

    // 링크 분석
    const { externalLinkCount, internalLinkCount } = await analyzeLinks(contentPage, postUrl);

    // 댓글 수
    const commentCount = await extractNumber(contentPage, [
      '.comment_count',
      '.u_cbox_count',
      '.comment_info .num',
    ]);

    // 공감(좋아요) 수
    const likeCount = await extractNumber(contentPage, [
      '.u_likeit_list_count',
      '.like_count',
      '.sympathy_count',
    ]);

    // 태그
    const tags = await extractTags(contentPage);

    const result: PostDetail = {
      title,
      bodyText,
      bodyHtml,
      imageCount,
      hasVideo: videoCount > 0,
      videoCount,
      headingCount,
      paragraphCount,
      externalLinkCount,
      internalLinkCount,
      commentCount,
      likeCount,
      tagCount: tags.length,
      tags,
    };

    log.info({
      postUrl,
      bodyLength: bodyText.length,
      imageCount,
      videoCount,
      tagCount: tags.length,
    }, '블로그 글 스크래핑 완료');

    return result;
  } catch (err) {
    log.error({ err, postUrl }, '블로그 글 스크래핑 실패');
    throw err;
  } finally {
    await context.close();
  }
}

// --- 유틸리티 함수들 ---

async function extractText(page: Page, selectors: string[]): Promise<string> {
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const text = await el.textContent();
        if (text && text.trim().length > 0) return text.trim();
      }
    } catch {
      // 다음 셀렉터 시도
    }
  }
  return '';
}

async function extractHtml(page: Page, selectors: string[]): Promise<string> {
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const html = await el.innerHTML();
        if (html && html.trim().length > 0) return html.trim();
      }
    } catch {
      // 다음 셀렉터 시도
    }
  }
  return '';
}

async function countElements(page: Page, selectors: string[]): Promise<number> {
  let maxCount = 0;
  for (const selector of selectors) {
    try {
      const els = await page.$$(selector);
      if (els.length > maxCount) maxCount = els.length;
    } catch {
      // 다음 셀렉터 시도
    }
  }
  return maxCount;
}

async function countParagraphs(page: Page): Promise<number> {
  try {
    const seEls = await page.$$('.se-text-paragraph');
    if (seEls.length > 0) return seEls.length;

    const pEls = await page.$$('#postViewArea p, .post-view p');
    if (pEls.length > 0) return pEls.length;

    // BR 기반으로 문단 추정
    const text = await extractText(page, ['.se-main-container', '#postViewArea']);
    return text.split(/\n\n+/).filter((p) => p.trim().length > 0).length;
  } catch {
    return 0;
  }
}

async function analyzeLinks(page: Page, postUrl: string): Promise<{ externalLinkCount: number; internalLinkCount: number }> {
  try {
    const blogId = extractBlogId(postUrl);
    const linkEls = await page.$$('.se-main-container a[href], #postViewArea a[href]');
    const links: string[] = [];
    for (const el of linkEls) {
      const href = await el.getAttribute('href');
      if (href) links.push(href);
    }

    let external = 0;
    let internal = 0;

    for (const href of links) {
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;

      if (href.includes('blog.naver.com') && blogId && href.includes(blogId)) {
        internal++;
      } else if (href.startsWith('http')) {
        external++;
      }
    }

    return { externalLinkCount: external, internalLinkCount: internal };
  } catch {
    return { externalLinkCount: 0, internalLinkCount: 0 };
  }
}

function extractBlogId(url: string): string | null {
  const match = url.match(/blog\.naver\.com\/([^/?#]+)/);
  return match ? match[1] : null;
}

async function extractNumber(page: Page, selectors: string[]): Promise<number> {
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const text = await el.textContent();
        if (text) {
          const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
          if (!isNaN(num)) return num;
        }
      }
    } catch {
      // 다음 셀렉터 시도
    }
  }
  return 0;
}

async function extractTags(page: Page): Promise<string[]> {
  try {
    const tagEls = await page.$$('.post_tag a, .wrap_tag a, .se-tag a, .tag_area a');
    const tags: string[] = [];
    for (const el of tagEls) {
      const text = await el.textContent();
      if (text) {
        const cleaned = text.trim().replace(/^#/, '');
        if (cleaned) tags.push(cleaned);
      }
    }
    return tags;
  } catch {
    return [];
  }
}
