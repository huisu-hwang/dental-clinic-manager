import { Page, BrowserContext } from 'playwright';
import { createPage } from '../../browser/browserManager.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('baseScraper');

const HOMETAX_BASE = 'https://www.hometax.go.kr';

export interface ScrapeResult {
  dataType: string;
  records: Record<string, unknown>[];
  totalCount: number;
  scrapedAt: string;
  period: { year: number; month: number };
}

/** 홈택스 메뉴 페이지로 이동 */
export async function navigateToMenu(page: Page, menuPath: string): Promise<void> {
  const url = `${HOMETAX_BASE}/websquare/websquare.wq?w2xPath=${menuPath}`;
  log.info({ menuPath }, '메뉴 이동');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000); // WebSquare 렌더링 대기
}

/** 조회 기간 설정 (연/월) */
export async function setPeriod(page: Page, year: number, month: number): Promise<void> {
  const startDate = `${year}${String(month).padStart(2, '0')}01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}${String(month).padStart(2, '0')}${String(lastDay).padStart(2, '0')}`;

  // 시작일 입력 — locator + JS fallback
  const startSelectors = ['input[id*="start"]', 'input[id*="Start"]', 'input[id*="from"]', 'input[id*="From"]'];
  for (const sel of startSelectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.fill('');
        await loc.fill(startDate);
        break;
      }
    } catch { /* continue */ }
  }

  // 종료일 입력
  const endSelectors = ['input[id*="end"]', 'input[id*="End"]', 'input[id*="to"]', 'input[id*="To"]'];
  for (const sel of endSelectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.fill('');
        await loc.fill(endDate);
        break;
      }
    } catch { /* continue */ }
  }

  log.debug({ startDate, endDate }, '조회 기간 설정');
}

/** 조회 버튼 클릭 후 결과 대기 — WebSquare <a> 태그 지원 */
export async function clickSearchAndWait(page: Page): Promise<void> {
  // WebSquare에서 조회 버튼은 <a> 태그일 수 있음
  const searchSelectors = [
    'a:has-text("조회")',
    'button:has-text("조회")',
    'input[value="조회"]',
    '[class*="search"]:has-text("조회")',
  ];

  let clicked = false;
  for (const sel of searchSelectors) {
    try {
      const loc = page.locator(sel).first();
      await loc.click({ timeout: 10000 });
      log.debug({ selector: sel }, '조회 버튼 클릭 (locator)');
      clicked = true;
      break;
    } catch {
      // JS fallback
      try {
        const jsClicked = await page.evaluate((s: string) => {
          const doc = (globalThis as any).document; // eslint-disable-line @typescript-eslint/no-explicit-any
          const el = doc.querySelector(s);
          if (el) { (el as any).click(); return true; } // eslint-disable-line @typescript-eslint/no-explicit-any
          return false;
        }, sel);
        if (jsClicked) {
          log.debug({ selector: sel }, '조회 버튼 클릭 (JS fallback)');
          clicked = true;
          break;
        }
      } catch { /* continue */ }
    }
  }

  if (!clicked) {
    throw new Error('조회 버튼을 찾을 수 없습니다');
  }

  // 로딩 완료 대기
  try {
    await page.waitForSelector('.loading, .spinner, .w2loading', { state: 'hidden', timeout: 30000 });
  } catch {
    // 로딩 인디케이터가 없을 수 있음
  }

  await page.waitForTimeout(2000);
}

/** HTML 테이블에서 데이터 추출 */
export async function parseTable(page: Page, tableSelector?: string): Promise<Record<string, unknown>[]> {
  const selector = tableSelector || 'table tbody tr, .w2grid .w2grid_row';

  const rows = await page.$$(selector);
  if (rows.length === 0) {
    log.info('테이블 데이터 없음');
    return [];
  }

  const records: Record<string, unknown>[] = [];

  // 헤더 추출
  const headers: string[] = [];
  const headerCells = await page.$$('table thead th, .w2grid .w2grid_header .w2grid_cell');
  for (const cell of headerCells) {
    const text = (await cell.textContent())?.trim() || '';
    headers.push(text);
  }

  // 행 데이터 추출
  for (const row of rows) {
    const cells = await row.$$('td, .w2grid_cell');
    const record: Record<string, unknown> = {};

    for (let i = 0; i < cells.length; i++) {
      const text = (await cells[i].textContent())?.trim() || '';
      const key = headers[i] || `col_${i}`;
      record[key] = text;
    }

    if (Object.keys(record).length > 0) {
      records.push(record);
    }
  }

  log.info({ recordCount: records.length }, '테이블 데이터 파싱 완료');
  return records;
}

/** 페이지네이션 처리하며 모든 데이터 수집 */
export async function scrapeAllPages(page: Page, tableSelector?: string): Promise<Record<string, unknown>[]> {
  const allRecords: Record<string, unknown>[] = [];

  // 첫 페이지 데이터
  const firstPage = await parseTable(page, tableSelector);
  allRecords.push(...firstPage);

  // 페이지네이션이 있는 경우 계속 수집
  let pageNum = 2;
  const MAX_PAGES = 50;

  while (pageNum <= MAX_PAGES) {
    const nextBtn = await page.$(`a:has-text("${pageNum}"), button:has-text("${pageNum}"), .w2pager a[data-page="${pageNum}"]`);
    if (!nextBtn) {
      // "다음" 버튼 시도
      const nextArrow = await page.$('a:has-text("다음"), button:has-text("다음"), .w2pager .next');
      if (!nextArrow) break;

      const isDisabled = await nextArrow.getAttribute('disabled');
      if (isDisabled) break;

      await nextArrow.click();
    } else {
      await nextBtn.click();
    }

    await page.waitForTimeout(2000);

    const pageRecords = await parseTable(page, tableSelector);
    if (pageRecords.length === 0) break;

    allRecords.push(...pageRecords);
    pageNum++;
  }

  log.info({ totalRecords: allRecords.length, pages: pageNum - 1 }, '전체 페이지 스크래핑 완료');
  return allRecords;
}

/** 새 페이지에서 스크래핑 수행 후 페이지 닫기 */
export async function withPage<T>(
  context: BrowserContext,
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const page = await createPage(context);
  try {
    return await fn(page);
  } finally {
    await page.close();
  }
}
