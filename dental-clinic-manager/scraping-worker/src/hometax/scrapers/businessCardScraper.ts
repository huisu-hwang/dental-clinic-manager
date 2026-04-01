import { Page, BrowserContext } from 'playwright';
import { withPage, ScrapeResult } from './baseScraper.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('businessCardScraper');

const HOMETAX_MAIN = 'https://www.hometax.go.kr/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml';

// 메뉴 ID: 매입내역 누계 조회 (사업용 신용카드 사용내역 하위) — menuAtag_4608020300

async function screenshot(page: Page, label: string): Promise<string> {
  const path = `/tmp/hometax-bizcard-${label}-${Date.now()}.png`;
  await page.screenshot({ path, fullPage: false }).catch(() => {});
  log.info({ screenshot: path, url: page.url() }, `스크린샷: ${label}`);
  return path;
}

/**
 * 신용카드 매입 스크래핑 흐름:
 * 1. 로그인 (완료)
 * 2. 계산서·영수증·카드 메뉴
 *   2.1 신용카드 매입
 *   2.2 사업용 신용카드 사용내역
 *   2.3 매입내역 누계 조회
 *     → $c.pp.fn_topMenuOpen($p, 'menuAtag_4608020300')
 *   2.4 조회년도 확인 후 조회 클릭
 *   2.5 필요 정보 스크래핑
 */
export async function scrapeBusinessCardPurchase(
  context: BrowserContext,
  year: number,
  month: number,
  _clinicId?: string,
  sharedPage?: Page,
): Promise<ScrapeResult> {
  log.info({ year, month }, '사업용 신용카드 매입내역 누계 스크래핑 시작');

  const doScrape = async (page: Page) => {
    if (!sharedPage) {
      // ── Step 1: 메인 페이지 + 로그인 확인 (단독 실행 시) ──
      await page.goto(HOMETAX_MAIN, { waitUntil: 'load', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);

      const isLoggedIn = await page.locator('a:has-text("로그아웃")')
        .or(page.locator('button:has-text("로그아웃")'))
        .or(page.locator('text=로그아웃'))
        .first()
        .waitFor({ state: 'visible', timeout: 10000 })
        .then(() => true)
        .catch(() => false);

      if (!isLoggedIn) throw new Error('홈택스 세션이 만료되었습니다.');
    } else {
      log.info('공유 페이지 사용 — 메인 페이지 로딩 및 로그인 확인 생략');
    }

    // ── Step 2.1~2.3: 매입내역 누계 조회 메뉴 이동 ──
    log.info('Step 2.1~2.3: 매입내역 누계 조회 메뉴 이동');

    const navResult = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const win = globalThis as any;
      try {
        if (win.$c?.pp?.fn_topMenuOpen) {
          win.$c.pp.fn_topMenuOpen(win.$p, 'menuAtag_4608020300');
          return 'success';
        }
        const el = win.document.getElementById('menuAtag_4608020300');
        if (el) { el.click(); return 'clicked'; }
        return 'not_found';
      } catch (e) {
        return `error: ${(e as any).message}`;
      }
    }).catch(() => 'evaluate_error');

    log.info({ navResult }, '메뉴 네비게이션 결과');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(5000);

    if (!page.url().includes('tmIdx=')) {
      await screenshot(page, 'nav-failed');
      throw new Error('매입내역 누계 조회 메뉴 이동 실패');
    }
    await screenshot(page, '2.3-menu-opened');

    // ── Step 2.4: 조회년도 확인 후 조회 클릭 ──
    log.info({ year }, 'Step 2.4: 조회년도 설정 + 조회');
    await page.waitForTimeout(3000);

    // Form 요소 분석 (디버그)
    const formElements = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      return Array.from(doc.querySelectorAll('input, select') as any[])
        .filter((el: any) => el.offsetParent !== null || el.offsetWidth > 0)
        .map((el: any) => ({
          tag: el.tagName, id: el.id?.substring(0, 60) || '', type: el.type || '',
          value: (el.value || '').substring(0, 30), class: el.className?.substring(0, 40) || '',
        }))
        .slice(0, 20);
    }).catch(() => []);
    log.info({ formElements }, 'Form 요소 분석');

    // 년도 설정 — 옵션 값이 "2025년" 형식일 수 있음
    const yearSet = await page.evaluate((y: number) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const win = globalThis as any;
      const yStr = String(y);
      const results: string[] = [];

      // select 요소에서 년도 변경
      const selects = doc.querySelectorAll('select');
      for (const el of Array.from(selects) as any[]) {
        if (el.offsetParent === null && el.offsetWidth === 0) continue;
        const opts = el.querySelectorAll('option');
        for (const opt of Array.from(opts) as any[]) {
          const optVal = opt.value || '';
          const optText = opt.textContent?.trim() || '';
          // "2025", "2025년" 모두 매칭
          if (optVal === yStr || optText === yStr || optVal === `${yStr}년` || optText === `${yStr}년` || optVal.startsWith(yStr)) {
            el.value = opt.value;
            el.dispatchEvent(new win.Event('change', { bubbles: true }));
            results.push(`select: ${el.id} → ${opt.value}`);
            break;
          }
        }
      }

      // input 필드에서 년도 변경
      const inputs = doc.querySelectorAll('input[type="text"], input:not([type])');
      for (const el of Array.from(inputs) as any[]) {
        if (el.offsetParent === null && el.offsetWidth === 0) continue;
        if (el.value?.match(/^\d{4}/) || el.id?.toLowerCase().includes('year') || el.id?.toLowerCase().includes('yyyy')) {
          const setter = win.Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(el, yStr);
          else el.value = yStr;
          el.dispatchEvent(new win.Event('input', { bubbles: true }));
          el.dispatchEvent(new win.Event('change', { bubbles: true }));
          results.push(`input: ${el.id} → ${yStr}`);
        }
      }

      return results.length > 0 ? results : ['no_year_field_found'];
    }, year).catch(() => ['error']);
    log.info({ yearSet }, '년도 설정 결과');

    await page.waitForTimeout(1000);
    await screenshot(page, '2.4-year-set');

    // 조회 버튼 클릭
    log.info('조회 버튼 클릭');
    const searchClicked = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const candidates = doc.querySelectorAll('a, button, input[type="button"], input[type="submit"], .w2trigger, .w2anchor2');
      for (const el of Array.from(candidates) as any[]) {
        const text = (el.textContent?.trim() || el.value || '');
        if ((text === '조회' || text === '조회하기') && (el.offsetParent !== null || el.offsetWidth > 0)) {
          el.click();
          return `clicked: ${el.tagName}#${el.id} text="${text}"`;
        }
      }
      return 'not_found';
    }).catch(() => 'error');

    log.info({ searchClicked }, '조회 버튼 클릭 결과');
    if (searchClicked === 'not_found' || searchClicked === 'error') {
      await screenshot(page, '2.4-search-failed');
      throw new Error('조회 버튼을 찾을 수 없습니다');
    }

    // 로딩 대기
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await page.locator('.loading, .spinner, .w2loading').first()
      .waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});

    await screenshot(page, '2.4-search-done');

    // ── Step 2.5: 데이터 스크래핑 ──
    log.info('Step 2.5: 데이터 스크래핑');

    const data = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const results: Record<string, any>[] = [];

      // visible 테이블 중 데이터 테이블 찾기 (td가 3개 이상인 테이블)
      const tables = doc.querySelectorAll('table');
      for (const table of Array.from(tables) as any[]) {
        if (table.offsetParent === null && table.offsetWidth === 0) continue;

        // 헤더 추출
        const headers: string[] = [];
        const headerCells = table.querySelectorAll('thead th, thead td');
        for (const cell of Array.from(headerCells) as any[]) {
          headers.push(cell.textContent?.trim() || '');
        }

        // 데이터 행 추출
        const rows = table.querySelectorAll('tbody tr');
        if (rows.length === 0) continue;

        const tableRecords: Record<string, any>[] = [];
        for (const row of Array.from(rows) as any[]) {
          const cells = row.querySelectorAll('td');
          if (cells.length < 3) continue; // 데이터 테이블은 최소 3컬럼

          const record: Record<string, any> = {};
          let hasNumericData = false;
          for (let i = 0; i < cells.length; i++) {
            const text = (cells[i] as any).textContent?.trim() || '';
            record[headers[i] || `col_${i}`] = text;
            // 숫자 데이터(금액, 건수)가 있는지 확인
            if (text.match(/[\d,]+/) && text !== '0') hasNumericData = true;
          }
          if (hasNumericData) tableRecords.push(record);
        }

        // 숫자 데이터가 있는 테이블을 데이터 테이블로 판단
        if (tableRecords.length > 0) {
          results.push(...tableRecords);
          break;
        }
      }

      // WebSquare 그리드 폴백
      if (results.length === 0) {
        const gHeaders: string[] = [];
        const gHeaderCells = doc.querySelectorAll('.w2grid_header .w2grid_cell');
        for (const c of Array.from(gHeaderCells) as any[]) gHeaders.push(c.textContent?.trim() || '');

        const gRows = doc.querySelectorAll('.w2grid_data tr, .w2grid .w2grid_row');
        for (const row of Array.from(gRows) as any[]) {
          const cells = row.querySelectorAll('.w2grid_cell, td');
          if (cells.length < 3) continue;
          const record: Record<string, any> = {};
          let hasData = false;
          for (let i = 0; i < cells.length; i++) {
            const text = (cells[i] as any).textContent?.trim() || '';
            record[gHeaders[i] || `col_${i}`] = text;
            if (text.match(/[\d,]+/) && text !== '0') hasData = true;
          }
          if (hasData) results.push(record);
        }
      }

      return results;
    }).catch(() => []);

    log.info({ recordCount: data.length, sample: data.slice(0, 2) }, '데이터 추출 완료');

    if (data.length === 0) {
      const bodyText = await page.evaluate(() =>
        ((globalThis as any).document.body?.innerText || '').substring(0, 1500)
      ).catch(() => '');
      log.warn({ bodyText }, '데이터 없음 — 페이지 텍스트 덤프');
      await screenshot(page, '2.5-no-data');
    }

    return data;
  };

  const records = sharedPage
    ? await doScrape(sharedPage)
    : await withPage(context, doScrape);

  log.info({ year, month, count: records.length }, '사업용 신용카드 매입내역 누계 스크래핑 완료');

  return {
    dataType: 'business_card_purchase',
    records,
    totalCount: records.length,
    scrapedAt: new Date().toISOString(),
    period: { year, month },
  };
}
