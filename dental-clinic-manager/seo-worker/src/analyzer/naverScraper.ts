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
    // 블로그 탭 전용 URL (ssc=tab.blog.all 파라미터 포함)
    const searchUrl = `https://search.naver.com/search.naver?ssc=tab.blog.all&where=blog&query=${encodeURIComponent(keyword)}`;
    log.info({ keyword, url: searchUrl }, '네이버 블로그 검색 시작');

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // page.evaluate로 DOM에서 직접 블로그 글 추출
    const extractedPosts = await page.evaluate(() => {
      const results: { title: string; postUrl: string; blogUrl: string; blogName: string }[] = [];
      const seenUrls = new Set<string>();

      // 모든 blog.naver.com 링크 중 글 URL 패턴(blogid/postnum)인 것을 찾기
      const allLinks = document.querySelectorAll('a[href*="blog.naver.com"]');

      allLinks.forEach((a) => {
        const href = a.getAttribute('href') || '';
        const text = (a.textContent || '').trim();

        // 글 URL 패턴 확인 (blog.naver.com/blogid/숫자)
        const postMatch = href.match(/blog\.naver\.com\/([^/?#]+)\/(\d+)/);
        if (!postMatch) return;

        // 제목 텍스트가 충분히 긴 링크만 (5자 이상, 미리보기 텍스트는 보통 더 김)
        if (text.length < 5 || text.length > 200) return;

        // 이미 수집된 URL 건너뜀
        if (seenUrls.has(href)) return;

        // 미리보기/본문 스니펫 링크 제외 - 제목 링크만 선택
        // 제목 링크는 보통 상위 컨테이너에서 첫 번째로 등장하는 짧은 텍스트
        const parentText = (a.parentElement?.textContent || '').trim();
        // 본문 미리보기 링크는 텍스트가 매우 길다 (60자 이상)
        if (text.length > 60) return;

        seenUrls.add(href);

        const blogId = postMatch[1];
        const blogUrl = `https://blog.naver.com/${blogId}`;

        // 블로그명 찾기 - 상위 요소에서 blogid 링크 중 글이 아닌 것
        let blogName = blogId;
        let container = a.parentElement;
        for (let i = 0; i < 15 && container; i++) {
          container = container.parentElement;
        }
        if (container) {
          const nameLinks = container.querySelectorAll(`a[href*="blog.naver.com/${blogId}"]`);
          nameLinks.forEach((nl) => {
            const nlHref = nl.getAttribute('href') || '';
            const nlText = (nl.textContent || '').trim();
            // 글 URL이 아닌 블로그 홈 URL이고 텍스트가 있으면 블로그명
            if (!nlHref.match(/\/\d+$/) && nlText.length > 0 && nlText.length < 50) {
              blogName = nlText;
            }
          });
        }

        results.push({
          title: text,
          postUrl: href,
          blogUrl,
          blogName,
        });
      });

      return results;
    });

    // 상위 5개만 사용
    const maxResults = Math.min(extractedPosts.length, 5);
    for (let i = 0; i < maxResults; i++) {
      const p = extractedPosts[i];
      posts.push({
        rank: i + 1,
        postUrl: p.postUrl,
        blogUrl: p.blogUrl,
        blogName: p.blogName,
        title: p.title,
      });
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
