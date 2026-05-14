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

      const isValidPostUrl = (href: string): boolean => {
        try {
          const u = new URL(href);
          if (!u.hostname.endsWith('blog.naver.com')) return false;
          if (u.hostname === 'section.blog.naver.com') return false;
          if (u.pathname.includes('PostView.naver')) {
            return !!(u.searchParams.get('blogId') && u.searchParams.get('logNo'));
          }
          const seg = u.pathname.split('/').filter(Boolean);
          if (seg.length < 2) return false;
          const [blogId, postId] = seg;
          if (!blogId || blogId.endsWith('.naver')) return false;
          return /^\d+$/.test(postId);
        } catch {
          return false;
        }
      };

      const normalizePostUrl = (href: string): string => {
        try {
          const u = new URL(href);
          if (u.pathname.includes('PostView.naver')) {
            const blogId = u.searchParams.get('blogId');
            const logNo = u.searchParams.get('logNo');
            if (blogId && logNo) {
              return `https://blog.naver.com/${blogId}/${logNo}`;
            }
          }
          if (u.hostname === 'm.blog.naver.com') {
            u.hostname = 'blog.naver.com';
          }
          return u.toString();
        } catch {
          return href;
        }
      };

      const getBlogId = (href: string): string | null => {
        try {
          const u = new URL(href);
          if (u.pathname.includes('PostView.naver')) return u.searchParams.get('blogId');
          const seg = u.pathname.split('/').filter(Boolean);
          return seg[0] || null;
        } catch {
          return null;
        }
      };

      const selectors = [
        '.title_area a',
        '.api_txt_lines.total_tit',
        'a.title_link',
        '.bx .title_area a',
        '.lst_total a[href*="blog.naver.com"]',
        'a[href*="blog.naver.com"]',
      ];

      for (const selector of selectors) {
        const links = document.querySelectorAll(selector);
        for (const link of links) {
          const rawHref = (link as HTMLAnchorElement).href || '';
          const text = (link.textContent || '').trim().replace(/\s+/g, ' ');
          if (!rawHref || !rawHref.includes('blog.naver.com')) continue;
          if (results.length >= 5) break;

          const postUrl = normalizePostUrl(rawHref);
          if (seenUrls.has(postUrl) || !isValidPostUrl(postUrl)) continue;
          if (text.length < 3 || text.length > 200) continue;

          seenUrls.add(postUrl);

          const blogId = getBlogId(postUrl);
          const blogUrl = blogId ? `https://blog.naver.com/${blogId}` : '';
          let blogName = blogId || '';

          const resultRoot =
            link.closest('[class*="bx"], [class*="fds-"], [class*="view_wrap"], li') ||
            link.parentElement;
          if (resultRoot && blogId) {
            const nameCandidates = resultRoot.querySelectorAll('a[href*="blog.naver.com"]');
            for (const nameLink of nameCandidates) {
              const nameHref = (nameLink as HTMLAnchorElement).href || '';
              const nameText = (nameLink.textContent || '').trim();
              if (!nameText || nameText === text || nameText.length > 50) continue;
              if (!nameHref.includes(`blog.naver.com/${blogId}`)) continue;
              if (isValidPostUrl(normalizePostUrl(nameHref))) continue;
              blogName = nameText;
              break;
            }
          }

          results.push({
            title: text,
            postUrl,
            blogUrl,
            blogName: blogName || blogId || '',
          });
        }
        if (results.length >= 5) break;
      }

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

    // 본문 텍스트 (SE 에디터 텍스트 블록만 추출 — 이미지 alt, 지도, 공백 문자 제외)
    const bodyText = await extractBodyText(contentPage);

    // 본문 HTML
    const bodyHtml = await extractHtml(contentPage, [
      '.se-main-container',
      '#postViewArea',
      '.post-view',
    ]);

    // 이미지 수 (콘텐츠 이미지만 카운트 — 지도 타일, UI 아이콘 제외)
    const imageCount = await countContentImages(contentPage);

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

/** 본문 텍스트만 정확하게 추출 (SE 에디터 텍스트 블록, 이미지/지도/공백 제외) */
async function extractBodyText(page: Page): Promise<string> {
  try {
    // SE 에디터: .se-text-paragraph 에서 순수 텍스트만 수집
    const seText = await page.evaluate(() => {
      const paragraphs = document.querySelectorAll('.se-main-container .se-text-paragraph');
      if (paragraphs.length > 0) {
        const texts: string[] = [];
        paragraphs.forEach((p) => {
          const t = (p.textContent || '').trim()
            .replace(/\u200B/g, '') // zero-width space 제거
            .replace(/\u00A0/g, ' '); // non-breaking space → 일반 공백
          if (t) texts.push(t);
        });
        return texts.join('\n');
      }
      return '';
    });
    if (seText && seText.length > 0) return seText;

    // 구형 에디터: #postViewArea 내 p 태그 텍스트
    const legacyText = await page.evaluate(() => {
      const area = document.querySelector('#postViewArea');
      if (!area) return '';
      const paragraphs = area.querySelectorAll('p, div.se_textarea');
      if (paragraphs.length > 0) {
        const texts: string[] = [];
        paragraphs.forEach((p) => {
          const t = (p.textContent || '').trim()
            .replace(/\u200B/g, '')
            .replace(/\u00A0/g, ' ');
          if (t) texts.push(t);
        });
        return texts.join('\n');
      }
      // fallback: 전체 textContent에서 공백 정리
      return (area.textContent || '').trim()
        .replace(/\u200B/g, '')
        .replace(/\s{3,}/g, '\n');
    });
    return legacyText;
  } catch {
    return '';
  }
}

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

async function countContentImages(page: Page): Promise<number> {
  try {
    return await page.evaluate(() => {
      const bodyEl = document.querySelector('.se-main-container, #postViewArea, .post-view');
      if (!bodyEl) return 0;

      const images = bodyEl.querySelectorAll('img');
      const sources = new Set<string>();

      images.forEach((img) => {
        const src =
          img.getAttribute('data-lazy-src') ||
          img.getAttribute('data-src') ||
          img.getAttribute('src') ||
          '';
        const normalizedSrc = src.trim();
        if (!normalizedSrc || normalizedSrc.startsWith('data:')) return;

        const widthAttr = Number(img.getAttribute('width') || '0');
        const heightAttr = Number(img.getAttribute('height') || '0');
        const naturalWidth = (img as HTMLImageElement).naturalWidth || 0;
        const naturalHeight = (img as HTMLImageElement).naturalHeight || 0;
        const width = naturalWidth || widthAttr;
        const height = naturalHeight || heightAttr;
        if ((width > 0 && width < 80) || (height > 0 && height < 80)) return;

        const className = (img.getAttribute('class') || '').toLowerCase();
        const alt = (img.getAttribute('alt') || '').toLowerCase();
        if (
          className.includes('emoji') ||
          className.includes('icon') ||
          className.includes('sticker') ||
          alt.includes('emoji') ||
          alt.includes('icon')
        ) {
          return;
        }

        if (
          /\/(profile|thumbnail|thumb|icon|emoji|sticker|map|marker)\b/i.test(normalizedSrc) ||
          normalizedSrc.includes('staticmap') ||
          normalizedSrc.includes('/MapService/')
        ) {
          return;
        }

        sources.add(normalizedSrc);
      });

      return sources.size;
    });
  } catch {
    return 0;
  }
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
