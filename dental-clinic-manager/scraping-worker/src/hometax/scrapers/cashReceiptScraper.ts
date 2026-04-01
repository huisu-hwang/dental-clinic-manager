import { Page, BrowserContext } from 'playwright';
import { withPage, ScrapeResult } from './baseScraper.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('cashReceiptScraper');

const HOMETAX_MAIN = 'https://www.hometax.go.kr/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml';

// 메뉴 ID: 현금영수증 매입내역(지출증빙) 조회
const MENU_ID = 'menuAtag_4605010100';

async function screenshot(page: Page, label: string): Promise<string> {
  const path = `/tmp/hometax-cashreceipt-${label}-${Date.now()}.png`;
  await page.screenshot({ path, fullPage: false }).catch(() => {});
  log.info({ screenshot: path, url: page.url() }, `스크린샷: ${label}`);
  return path;
}

/** month → 분기 계산 */
function getQuarter(month: number): number {
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

/** 분기 → 기간 문자열 */
function getQuarterPeriod(year: number, quarter: number): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = quarter * 3;
  const endDay = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][endMonth];
  return {
    start: `${year}${String(startMonth).padStart(2, '0')}01`,
    end: `${year}${String(endMonth).padStart(2, '0')}${endDay}`,
  };
}

// 메뉴 ID: 현금영수증 매출내역 누계조회
const SALES_MENU_ID = 'menuAtag_4606010200';

/**
 * 현금영수증 매출 스크래핑 흐름:
 * 1. 로그인 (완료 상태)
 * 2. 계산서·영수증·카드 메뉴
 *   2.1 현금영수증 가맹점 클릭
 *   2.2 가맹점 매출 조회 클릭
 *   2.3 현금영수증 매출내역 누계조회 클릭
 *     → $c.pp.fn_topMenuOpen($p, 'menuAtag_4606010200')
 *   2.4 조회 클릭
 *   2.5 필요 데이터 스크래핑
 */
export async function scrapeCashReceiptSales(
  context: BrowserContext,
  year: number,
  month: number,
  _clinicId?: string,
  sharedPage?: Page,
): Promise<ScrapeResult> {
  log.info({ year, month }, '현금영수증 매출내역 누계조회 스크래핑 시작');

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

    // ── Step 2.1~2.3: 현금영수증 매출내역 누계조회 메뉴 이동 ──
    log.info({ menuId: SALES_MENU_ID }, 'Step 2.1~2.3: 현금영수증 매출내역 누계조회 메뉴 이동');

    const navResult = await page.evaluate((menuId: string) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const win = globalThis as any;
      try {
        if (win.$c?.pp?.fn_topMenuOpen) {
          win.$c.pp.fn_topMenuOpen(win.$p, menuId);
          return `success: ${menuId}`;
        }
        const el = win.document.getElementById(menuId);
        if (el) { el.click(); return `clicked: ${menuId}`; }
        return 'not_found';
      } catch (e) {
        return `error: ${(e as any).message}`;
      }
    }, SALES_MENU_ID).catch(() => 'evaluate_error');

    log.info({ navResult }, '메뉴 네비게이션 결과');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(5000);

    if (!page.url().includes('tmIdx=')) {
      await screenshot(page, 'nav-failed');
      throw new Error('현금영수증 매출내역 누계조회 메뉴 이동 실패');
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

    // 년도 설정 (오늘 날짜 기준)
    const yearSet = await page.evaluate((y: number) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const win = globalThis as any;
      const yStr = String(y);
      const results: string[] = [];

      const selects = doc.querySelectorAll('select');
      for (const el of Array.from(selects) as any[]) {
        if (el.offsetParent === null && el.offsetWidth === 0) continue;
        const opts = el.querySelectorAll('option');
        for (const opt of Array.from(opts) as any[]) {
          const optVal = opt.value || '';
          const optText = opt.textContent?.trim() || '';
          if (optVal === yStr || optText === yStr || optVal === `${yStr}년` || optText === `${yStr}년` || optVal.startsWith(yStr)) {
            el.value = opt.value;
            el.dispatchEvent(new win.Event('change', { bubbles: true }));
            results.push(`select: ${el.id} → ${opt.value}`);
            break;
          }
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

    // ── Step 2.5: 필요 데이터 스크래핑 ──
    log.info('Step 2.5: 데이터 스크래핑');

    const data = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const results: Record<string, any>[] = [];

      const tables = doc.querySelectorAll('table');
      for (const table of Array.from(tables) as any[]) {
        if (table.offsetParent === null && table.offsetWidth === 0) continue;

        const headers: string[] = [];
        const headerCells = table.querySelectorAll('thead th, thead td');
        for (const cell of Array.from(headerCells) as any[]) {
          headers.push(cell.textContent?.trim() || '');
        }

        const rows = table.querySelectorAll('tbody tr');
        if (rows.length === 0) continue;

        const tableRecords: Record<string, any>[] = [];
        for (const row of Array.from(rows) as any[]) {
          const cells = row.querySelectorAll('td');
          if (cells.length < 3) continue;

          const record: Record<string, any> = {};
          let hasNumericData = false;
          for (let i = 0; i < cells.length; i++) {
            const text = (cells[i] as any).textContent?.trim() || '';
            record[headers[i] || `col_${i}`] = text;
            if (text.match(/[\d,]+/) && text !== '0') hasNumericData = true;
          }
          if (hasNumericData) tableRecords.push(record);
        }

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

  log.info({ year, month, count: records.length }, '현금영수증 매출내역 누계조회 스크래핑 완료');

  return {
    dataType: 'cash_receipt_sales',
    records,
    totalCount: records.length,
    scrapedAt: new Date().toISOString(),
    period: { year, month },
  };
}

/**
 * 현금영수증 매입 스크래핑 흐름:
 * 1. 로그인 (완료 상태)
 * 2. 계산서·영수증·카드 메뉴
 *   2.1 현금영수증 매입 지출 증빙
 *   2.2 현금영수증 매입내역 지출증빙 조회
 *   2.3 분기별 클릭
 *   2.4 조회기간에서 해당 분기인지 확인
 *   2.5 조회 클릭
 *   2.6 필요정보 스크래핑
 */
export async function scrapeCashReceiptPurchase(
  context: BrowserContext,
  year: number,
  month: number,
  _clinicId?: string,
  sharedPage?: Page,
): Promise<ScrapeResult> {
  // 사용자 설정 월 기준으로 분기 계산
  const quarter = getQuarter(month || 1);
  log.info({ year, month, quarter }, '현금영수증 매입 지출증빙 스크래핑 시작');

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

    // ── Step 2.1~2.2: 현금영수증 매입내역 지출증빙 조회 메뉴 이동 ──
    log.info({ menuId: MENU_ID }, 'Step 2.1~2.2: 현금영수증 매입내역(지출증빙) 조회 메뉴 이동');

    const navResult = await page.evaluate((menuId: string) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const win = globalThis as any;
      try {
        if (win.$c?.pp?.fn_topMenuOpen) {
          win.$c.pp.fn_topMenuOpen(win.$p, menuId);
          return `success: ${menuId}`;
        }
        const el = win.document.getElementById(menuId);
        if (el) { el.click(); return `clicked: ${menuId}`; }
        return 'not_found';
      } catch (e) {
        return `error: ${(e as any).message}`;
      }
    }, MENU_ID).catch(() => 'evaluate_error');

    log.info({ navResult }, '메뉴 네비게이션 결과');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(5000);

    // 메뉴 이동 확인
    if (!page.url().includes('tmIdx=')) {
      await screenshot(page, 'nav-failed');
      // 페이지 텍스트로 현재 위치 확인
      const pageTitle = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const title = doc.querySelector('.sub_title, .page_title, h2, h3');
        return title?.textContent?.trim() || doc.title || '';
      }).catch(() => '');
      log.warn({ pageTitle, url: page.url() }, '메뉴 이동 미확인 — 계속 시도');
    }
    await screenshot(page, '2.2-menu-opened');

    // ── Step 2.3: 분기별 클릭 ──
    log.info({ quarter }, 'Step 2.3: 분기별 클릭');
    await page.waitForTimeout(3000);

    // Form 요소 분석 (디버그)
    const formElements = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      return Array.from(doc.querySelectorAll('input, select, label, a.w2anchor2, button') as any[])
        .filter((el: any) => el.offsetParent !== null || el.offsetWidth > 0)
        .map((el: any) => ({
          tag: el.tagName, id: el.id?.substring(0, 60) || '', type: el.type || '',
          value: (el.value || '').substring(0, 30), text: (el.textContent || '').substring(0, 30),
          class: el.className?.substring(0, 40) || '',
        }))
        .slice(0, 30);
    }).catch(() => []);
    log.info({ formElements }, 'Form 요소 분석');

    // "분기별" 라디오/탭/링크 클릭
    const quarterTabResult = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const win = globalThis as any;

      // 1차: 라디오 버튼에서 "분기별" 찾기
      const radios = doc.querySelectorAll('input[type="radio"]');
      for (const radio of Array.from(radios) as any[]) {
        const label = doc.querySelector(`label[for="${radio.id}"]`);
        const labelText = label?.textContent?.trim() || '';
        if (labelText.includes('분기') || radio.value?.includes('분기') || radio.value === 'Q') {
          radio.checked = true;
          radio.click();
          radio.dispatchEvent(new win.Event('change', { bubbles: true }));
          return `radio: ${radio.id} label="${labelText}"`;
        }
      }

      // 2차: 탭/링크에서 "분기별" 찾기
      const allClickable = doc.querySelectorAll('a, button, span, div, label, li');
      for (const el of Array.from(allClickable) as any[]) {
        const text = el.textContent?.trim() || '';
        if (text === '분기별' || text === '분기' || text === '분기별조회') {
          if (el.offsetParent !== null || el.offsetWidth > 0) {
            el.click();
            return `clicked: ${el.tagName}#${el.id} text="${text}"`;
          }
        }
      }

      // 3차: WebSquare selectbox에서 분기 옵션
      const selects = doc.querySelectorAll('select');
      for (const sel of Array.from(selects) as any[]) {
        if (sel.offsetParent === null && sel.offsetWidth === 0) continue;
        const opts = sel.querySelectorAll('option');
        for (const opt of Array.from(opts) as any[]) {
          const optText = opt.textContent?.trim() || '';
          if (optText.includes('분기')) {
            sel.value = opt.value;
            sel.dispatchEvent(new win.Event('change', { bubbles: true }));
            return `select: ${sel.id} → "${optText}"`;
          }
        }
      }

      return 'not_found';
    }).catch(() => 'error');
    log.info({ quarterTabResult }, '분기별 클릭 결과');

    await page.waitForTimeout(2000);
    await screenshot(page, '2.3-quarter-tab');

    // ── Step 2.4: 조회기간에서 해당 분기인지 확인 ──
    log.info({ year, quarter }, 'Step 2.4: 조회기간 확인/설정');

    const period = getQuarterPeriod(year, quarter);
    const quarterLabel = `${quarter}분기`;

    // 년도 설정 (오늘 날짜 기준)
    const yearSet = await page.evaluate((y: number) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const win = globalThis as any;
      const yStr = String(y);
      const results: string[] = [];

      const selects = doc.querySelectorAll('select');
      for (const el of Array.from(selects) as any[]) {
        if (el.offsetParent === null && el.offsetWidth === 0) continue;
        const opts = el.querySelectorAll('option');
        for (const opt of Array.from(opts) as any[]) {
          const optVal = opt.value || '';
          const optText = opt.textContent?.trim() || '';
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

    // 분기 설정 (select에서 해당 분기 선택)
    const quarterSet = await page.evaluate((q: number) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const win = globalThis as any;
      const qStr = String(q);
      const qLabel = `${q}분기`;
      const results: string[] = [];

      const selects = doc.querySelectorAll('select');
      for (const el of Array.from(selects) as any[]) {
        if (el.offsetParent === null && el.offsetWidth === 0) continue;
        const opts = el.querySelectorAll('option');
        for (const opt of Array.from(opts) as any[]) {
          const optVal = opt.value || '';
          const optText = opt.textContent?.trim() || '';
          if (optVal === qStr || optText === qLabel || optText.includes(`${q}분기`) || optVal === `Q${q}` || optText === `${q}/4분기`) {
            el.value = opt.value;
            el.dispatchEvent(new win.Event('change', { bubbles: true }));
            results.push(`select: ${el.id} → ${opt.value} (${optText})`);
            break;
          }
        }
      }

      return results.length > 0 ? results : ['no_quarter_field_found'];
    }, quarter).catch(() => ['error']);
    log.info({ quarterSet, quarterLabel }, '분기 설정 결과');

    // 기간 입력 필드가 있으면 직접 설정 (YYYYMMDD 형식)
    const periodSet = await page.evaluate((p: { start: string; end: string }) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const win = globalThis as any;
      const results: string[] = [];

      const inputs = doc.querySelectorAll('input[type="text"], input:not([type])');
      const dateInputs: any[] = [];
      for (const el of Array.from(inputs) as any[]) {
        if (el.offsetParent === null && el.offsetWidth === 0) continue;
        // 날짜 형식 필드 (YYYY-MM-DD, YYYYMMDD, YYYY.MM.DD)
        if (el.value?.match(/^\d{4}[-./]?\d{2}[-./]?\d{2}$/) || el.id?.toLowerCase().includes('date') || el.id?.toLowerCase().includes('from') || el.id?.toLowerCase().includes('to')) {
          dateInputs.push(el);
        }
      }

      // 시작일/종료일 쌍으로 설정
      if (dateInputs.length >= 2) {
        const setter = win.Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
        // 시작일
        const startVal = p.start;
        if (setter) setter.call(dateInputs[0], startVal);
        else dateInputs[0].value = startVal;
        dateInputs[0].dispatchEvent(new win.Event('change', { bubbles: true }));
        results.push(`start: ${dateInputs[0].id} → ${startVal}`);

        // 종료일
        const endVal = p.end;
        if (setter) setter.call(dateInputs[1], endVal);
        else dateInputs[1].value = endVal;
        dateInputs[1].dispatchEvent(new win.Event('change', { bubbles: true }));
        results.push(`end: ${dateInputs[1].id} → ${endVal}`);
      }

      return results.length > 0 ? results : ['no_date_fields_found'];
    }, period).catch(() => ['error']);
    log.info({ periodSet, period }, '기간 설정 결과');

    await page.waitForTimeout(1000);
    await screenshot(page, '2.4-period-set');

    // ── Step 2.5: 조회 클릭 ──
    log.info('Step 2.5: 조회 클릭');

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
      await screenshot(page, '2.5-search-failed');
      throw new Error('조회 버튼을 찾을 수 없습니다');
    }

    // 로딩 대기
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await page.locator('.loading, .spinner, .w2loading').first()
      .waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});

    await screenshot(page, '2.5-search-done');

    // ── Step 2.6: 필요정보 스크래핑 ──
    log.info('Step 2.6: 데이터 스크래핑');

    const data = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const results: Record<string, any>[] = [];

      // visible 테이블 중 데이터 테이블 찾기 (td가 3개 이상)
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
          if (cells.length < 3) continue;

          const record: Record<string, any> = {};
          let hasNumericData = false;
          for (let i = 0; i < cells.length; i++) {
            const text = (cells[i] as any).textContent?.trim() || '';
            record[headers[i] || `col_${i}`] = text;
            if (text.match(/[\d,]+/) && text !== '0') hasNumericData = true;
          }
          if (hasNumericData) tableRecords.push(record);
        }

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
      await screenshot(page, '2.6-no-data');
    }

    return data;
  };

  const records = sharedPage
    ? await doScrape(sharedPage)
    : await withPage(context, doScrape);

  log.info({ year, month, quarter, count: records.length }, '현금영수증 매입 지출증빙 스크래핑 완료');

  return {
    dataType: 'cash_receipt_purchase',
    records,
    totalCount: records.length,
    scrapedAt: new Date().toISOString(),
    period: { year, month },
  };
}
