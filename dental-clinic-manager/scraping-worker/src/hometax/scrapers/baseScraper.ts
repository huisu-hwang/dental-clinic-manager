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
  const mainUrl = `${HOMETAX_BASE}/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml`;

  // 1. 메인 페이지 먼저 방문하여 세션 활성화
  log.info({ menuPath }, '메인 페이지 세션 활성화');
  await page.goto(mainUrl, { waitUntil: 'load', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // 2. 로그인 상태 확인
  const mainPageUrl = page.url();
  const mainPageScreenshot = `/tmp/hometax-main-${Date.now()}.png`;
  await page.screenshot({ path: mainPageScreenshot, fullPage: false }).catch(() => {});
  log.info({ mainPageUrl, mainPageScreenshot }, '메인 페이지 상태 스크린샷');

  const isLoggedIn = await page.locator('a:has-text("로그아웃")')
    .or(page.locator('button:has-text("로그아웃")'))
    .or(page.locator('text=로그아웃'))
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false);

  if (!isLoggedIn) {
    log.error({ mainPageUrl }, '홈택스 세션 만료 — 재로그인 필요');
    throw new Error('홈택스 세션이 만료되었습니다. 재로그인이 필요합니다.');
  }
  log.info({ mainPageUrl }, '로그인 상태 확인 완료');

  // 3. $c.pp.fn_topMenuOpen 함수를 사용한 메뉴 네비게이션
  log.info({ menuPath }, 'WebSquare 메뉴 네비게이션 시도');

  // 3-1. "조회" 관련 메뉴 ID 탐색
  const menuExploreResult = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;

    // 모든 메뉴 항목 수집 (onclick에 fn_topMenuOpen이 있는 것들)
    const menuItems = Array.from(doc.querySelectorAll('a[id*="menuAtag"], a[id*="combineMenuAtag"]') as any[])
      .map((el: any) => ({
        id: el.id, text: el.textContent?.trim() || '', onclick: el.getAttribute('onclick') || '',
      }));

    // 조회 관련 메뉴 필터링
    const queryMenus = menuItems.filter((m: any) =>
      m.text.includes('조회') || m.text.includes('목록') || m.text.includes('합계표') || m.text.includes('현황')
    );

    return { total: menuItems.length, queryMenus, allMenus: menuItems.slice(0, 100) };
  }).catch(() => ({ total: 0, queryMenus: [], allMenus: [] }));

  log.info({
    totalMenus: menuExploreResult.total,
    queryMenuCount: menuExploreResult.queryMenus.length,
    queryMenus: menuExploreResult.queryMenus,
  }, '홈택스 조회 메뉴 탐색 결과');

  // 3-2. menuPath → 홈택스 메뉴 ID 직접 매핑
  // 발견된 메뉴 코드 기반 (menuAtag_XXXXXXXXXX → $c.pp.fn_topMenuOpen 호출)
  const MENU_ID_MAP: Record<string, string> = {
    '/ui/pp/agaab/a/EtsaabAMain.xml': 'menuAtag_4609060300',   // 전자세금계산서 기간별 매출/매입 통계 조회
    '/ui/pp/agbab/a/EtsbabAMain.xml': 'menuAtag_4609060300',   // 전자세금계산서 기간별 매출/매입 통계 조회 (매입 탭)
    '/ui/pp/agcaa/a/EtscaaAMain.xml': 'menuAtag_4606010100',   // 현금영수증 매출내역 조회
    '/ui/pp/agcba/a/EtscbaAMain.xml': 'menuAtag_4605010100',   // 현금영수증 매입내역(지출증빙) 조회
    '/ui/pp/agdba/a/EtsdbaAMain.xml': 'menuAtag_4608020300',   // 사업용신용카드 매입내역 누계 조회
    '/ui/pp/agdaa/a/EtsdaaAMain.xml': 'menuAtag_4607010000',   // 신용카드·판매(결제)대행 매출자료 조회
  };

  let targetMenuId = MENU_ID_MAP[menuPath] || '';

  // 직접 매핑에 없으면 키워드 기반 검색
  if (!targetMenuId) {
    const MENU_SEARCH_KEYWORDS: Record<string, string[]> = {
      '/ui/pp/agaab/a/EtsaabAMain.xml': ['기간별 매출/매입 통계', '발급 목록조회', '매출'],
      '/ui/pp/agbab/a/EtsbabAMain.xml': ['기간별 매출/매입 통계', '합계표 조회', '매입'],
      '/ui/pp/agcaa/a/EtscaaAMain.xml': ['현금영수증 매출내역', '현금영수증 매출'],
      '/ui/pp/agcba/a/EtscbaAMain.xml': ['현금영수증 매입내역', '현금영수증 매입'],
      '/ui/pp/agdba/a/EtsdbaAMain.xml': ['매입내역 누계 조회', '사업용 신용카드'],
      '/ui/pp/agdaa/a/EtsdaaAMain.xml': ['신용카드·판매(결제)대행', '신용카드 매출'],
    };

    const keywords = MENU_SEARCH_KEYWORDS[menuPath] || [];
    for (const keyword of keywords) {
      const match = menuExploreResult.allMenus.find((m: any) => m.text.includes(keyword) && m.onclick.includes('fn_topMenuOpen'));
      if (match) {
        targetMenuId = match.id;
        log.info({ targetMenuId, matchedText: match.text, keyword }, '메뉴 ID 키워드 매칭 성공');
        break;
      }
    }
  }

  // 3-3. $c.pp.fn_topMenuOpen으로 메뉴 열기
  if (targetMenuId) {
    log.info({ targetMenuId, menuPath }, '$c.pp.fn_topMenuOpen 호출');
    const openResult = await page.evaluate((menuId: string) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const win = globalThis as any;
      try {
        if (win.$c?.pp?.fn_topMenuOpen) {
          win.$c.pp.fn_topMenuOpen(win.$p, menuId);
          return 'success';
        }
        // 대안: 해당 메뉴 요소를 직접 클릭
        const el = win.document.getElementById(menuId);
        if (el) {
          el.click();
          return 'clicked';
        }
        return 'not_found';
      } catch (e) {
        return `error: ${(e as any).message}`;
      }
    }, targetMenuId).catch(() => 'evaluate_error');

    log.info({ openResult, targetMenuId }, '메뉴 열기 결과');

    // 네비게이션 대기
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(5000);
  } else {
    log.warn({ menuPath }, '매칭되는 메뉴 ID를 찾지 못함 — 전체 메뉴 목록 로깅');
    // 발견된 모든 메뉴 로깅 (디버그용)
    for (const m of menuExploreResult.allMenus.slice(0, 50)) {
      log.debug({ id: m.id, text: m.text }, '메뉴 항목');
    }
  }

  // 4. 최종 상태 확인 — SPA이므로 URL 파라미터(tmIdx, tm3lIdx)로 판단
  const finalUrl = page.url();
  const ss = `/tmp/hometax-nav-result-${Date.now()}.png`;
  await page.screenshot({ path: ss, fullPage: false }).catch(() => {});

  log.info({ finalUrl, screenshot: ss }, '메뉴 이동 후 상태');

  // 성공 조건: URL에 tmIdx 또는 tm3lIdx 파라미터가 있으면 메뉴 이동 성공
  const hasMenuParam = finalUrl.includes('tmIdx=') || finalUrl.includes('tm3lIdx=');

  if (!hasMenuParam) {
    log.error({ menuPath, finalUrl, targetMenuId }, '메뉴 접근 실패');
    throw new Error(`메뉴 페이지 접근 실패: ${menuPath}`);
  }

  log.info({ finalUrl, frameCount: page.frames().length }, '메뉴 이동 완료');
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

/** 조회 버튼 클릭 후 결과 대기 — WebSquare <a> 태그 지원, iframe 포함 탐색 */
export async function clickSearchAndWait(page: Page): Promise<void> {
  // WebSquare에서 조회 버튼은 <a> 태그일 수 있음
  const searchSelectors = [
    'a:has-text("조회")',
    'button:has-text("조회")',
    'input[value="조회"]',
    '[class*="search"]:has-text("조회")',
    '[role="button"]:has-text("조회")',
    'span:has-text("조회")',
  ];

  // 먼저 메인 프레임에서 조회 버튼이 나타날 때까지 최대 20초 대기
  const combinedSelector = searchSelectors.join(', ');
  await page.waitForSelector(combinedSelector, { state: 'visible', timeout: 20000 }).catch(() => {
    log.warn({ url: page.url() }, '조회 버튼 대기 타임아웃 (20s), 강제 진행');
  });

  let clicked = false;

  // 1. 메인 프레임 시도
  for (const sel of searchSelectors) {
    try {
      const loc = page.locator(sel).first();
      await loc.click({ timeout: 5000 });
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

  // 2. iframe 내부 탐색 (WebSquare가 iframe을 사용하는 경우)
  if (!clicked) {
    const frames = page.frames().filter(f => f !== page.mainFrame());
    log.info({ frameCount: frames.length }, 'iframe 탐색 시작');
    for (const frame of frames) {
      for (const sel of searchSelectors) {
        try {
          const loc = frame.locator(sel).first();
          await loc.click({ timeout: 3000 });
          log.info({ selector: sel, frameUrl: frame.url() }, '조회 버튼 클릭 (iframe)');
          clicked = true;
          break;
        } catch { /* continue */ }
      }
      if (clicked) break;
    }
  }

  if (!clicked) {
    // 디버그: 페이지 텍스트와 URL 덤프
    const pageText = await page.evaluate(() => ((globalThis as any).document?.body?.innerText || '').substring(0, 2000)).catch(() => ''); // eslint-disable-line @typescript-eslint/no-explicit-any
    const pageUrl = page.url();
    const frameUrls = page.frames().map(f => f.url());
    log.error({ pageUrl, frameUrls, pageText }, '조회 버튼을 찾을 수 없음 - 페이지 상태 덤프');

    // 디버그 스크린샷 저장
    const screenshotPath = `/tmp/hometax-debug-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    log.error({ screenshotPath }, '디버그 스크린샷 저장');

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
