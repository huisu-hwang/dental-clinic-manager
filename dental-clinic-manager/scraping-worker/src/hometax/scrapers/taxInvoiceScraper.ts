import { Page, BrowserContext } from 'playwright';
import { withPage, ScrapeResult } from './baseScraper.js';
import { createChildLogger } from '../../utils/logger.js';
import { getSupabaseClient } from '../../db/supabaseClient.js';
import { decryptFromJson } from '../../crypto/encryption.js';

const log = createChildLogger('taxInvoiceScraper');

const HOMETAX_BASE = 'https://www.hometax.go.kr';
const MAIN_URL = `${HOMETAX_BASE}/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml`;

// ── 공통 헬퍼 ──

/** JS 기반 안전한 클릭 */
async function jsClick(page: Page, selector: string, description: string, timeout = 10000): Promise<boolean> {
  try {
    const loc = page.locator(selector).first();
    await loc.click({ timeout });
    log.info({ selector, description }, '클릭 성공');
    return true;
  } catch {
    // JS fallback
    try {
      const clicked = await page.evaluate((sel: string) => {
        const el = (globalThis as any).document.querySelector(sel); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (el) { (el as any).click(); return true; } // eslint-disable-line @typescript-eslint/no-explicit-any
        return false;
      }, selector);
      if (clicked) {
        log.info({ selector, description }, '클릭 성공 (JS)');
        return true;
      }
    } catch { /* fall through */ }
  }
  log.warn({ selector, description }, '클릭 실패');
  return false;
}

/** JS TreeWalker로 텍스트 기반 요소 클릭 */
async function clickByText(page: Page, text: string, description: string, opts?: { exact?: boolean; parentSelector?: string }): Promise<boolean> {
  const result = await page.evaluate(({ text: t, exact, parentSel }: { text: string; exact?: boolean; parentSel?: string }) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;
    const root = parentSel ? doc.querySelector(parentSel) || doc.body : doc.body;
    const walker = doc.createTreeWalker(root, (globalThis as any).NodeFilter.SHOW_ELEMENT);
    let node: any = walker.currentNode;
    while (node) {
      const directText = Array.from(node.childNodes as any[])
        .filter((n: any) => n.nodeType === (globalThis as any).Node.TEXT_NODE)
        .map((n: any) => (n.textContent?.trim() || '') as string)
        .join('');
      const match = exact ? directText === t : directText.includes(t);
      if (match && (node.offsetParent !== null || node.offsetWidth > 0)) {
        node.click();
        return `clicked: ${node.tagName}#${node.id}`;
      }
      node = walker.nextNode();
    }
    return 'not_found';
  }, { text, exact: opts?.exact, parentSel: opts?.parentSelector }).catch(() => 'error');

  if (result !== 'not_found' && result !== 'error') {
    log.info({ text, description, result }, '텍스트 클릭 성공');
    return true;
  }
  log.warn({ text, description, result }, '텍스트 클릭 실패');
  return false;
}

/** 스크린샷 + 로그 */
async function screenshot(page: Page, label: string): Promise<string> {
  const path = `/tmp/hometax-${label}-${Date.now()}.png`;
  await page.screenshot({ path, fullPage: false }).catch(() => {});
  log.info({ screenshot: path, url: page.url() }, `스크린샷: ${label}`);
  return path;
}

/** 인증서 비밀번호 조회 */
async function getCertPassword(clinicId: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('hometax_credentials')
    .select('encrypted_cert_password')
    .eq('clinic_id', clinicId)
    .single();
  if (!data?.encrypted_cert_password) return null;
  try {
    return decryptFromJson(data.encrypted_cert_password);
  } catch {
    log.error({ clinicId }, '인증서 비밀번호 복호화 실패');
    return null;
  }
}

// ── 메인 흐름: 세금계산서 기간별 매출/매입 통계 조회 ──

/**
 * 사용자 흐름:
 * 1. 로그인 (loginService에서 처리)
 * 2. 계산서·영수증·카드 메뉴 클릭
 *   2.1 전자(세금)계산서 조회
 *   2.2 합계표·통계 조회
 *   2.3 기간별 매출/매입 통계 조회
 *   2.4 공동 금융 인증 팝업
 *   2.5 사업자명 인증서 클릭
 *   2.6 인증서 비밀번호 입력
 *   2.7 구분: 년도별 클릭
 *   2.8 조회 클릭
 *   2.9 데이터 스크래핑
 */
async function navigateToTaxInvoiceStats(page: Page, clinicId: string): Promise<void> {
  // 0. 메인 페이지 접속 및 로그인 확인
  log.info('메인 페이지 접속');
  await page.goto(MAIN_URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // 로그인 확인
  const isLoggedIn = await page.locator('a:has-text("로그아웃")')
    .or(page.locator('button:has-text("로그아웃")'))
    .or(page.locator('text=로그아웃'))
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false);

  if (!isLoggedIn) {
    throw new Error('홈택스 세션이 만료되었습니다.');
  }
  await screenshot(page, 'step0-logged-in');

  // ── Step 2: 계산서·영수증·카드 메뉴 클릭 ──
  // $c.pp.fn_topMenuOpen을 사용하여 "기간별 매출/매입 통계 조회" 메뉴로 직접 이동
  // 이것은 UI에서 계산서·영수증·카드 > 전자(세금)계산서 조회 > 합계표·통계 조회 > 기간별 매출/매입 통계 조회 를 클릭하는 것과 동일
  log.info('Step 2.1~2.3: 기간별 매출/매입 통계 조회 메뉴로 이동');

  const navResult = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const win = globalThis as any;
    try {
      if (win.$c?.pp?.fn_topMenuOpen) {
        win.$c.pp.fn_topMenuOpen(win.$p, 'menuAtag_4609060300');
        return 'success';
      }
      // 대안: 직접 요소 클릭
      const el = win.document.getElementById('menuAtag_4609060300');
      if (el) { el.click(); return 'clicked'; }
      return 'not_found';
    } catch (e) {
      return `error: ${(e as any).message}`;
    }
  }).catch(() => 'evaluate_error');

  log.info({ navResult }, '메뉴 네비게이션 결과');

  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // URL에 tmIdx가 포함되었는지 확인
  const navUrl = page.url();
  if (!navUrl.includes('tmIdx=')) {
    await screenshot(page, 'nav-failed');
    throw new Error('기간별 매출/매입 통계 조회 메뉴 이동 실패');
  }
  await screenshot(page, 'step2.3-menu-opened');

  // ── Step 2.4~2.6: 공동 금융 인증 처리 ──
  log.info('Step 2.4: 공동 금융 인증 팝업 확인');
  await page.waitForTimeout(3000);

  // 인증서 팝업이 나타나는지 확인 (최대 10초 대기)
  const hasCertPopup = await page.locator('text=인증서')
    .or(page.locator('text=공동인증서'))
    .or(page.locator('text=금융인증서'))
    .or(page.locator('.w2window'))
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false);

  if (hasCertPopup) {
    await screenshot(page, 'step2.4-cert-popup');
    log.info('공동 금융 인증 팝업 감지');

    // 팝업 DOM 분석
    const certPopupInfo = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const popup = doc.querySelector('.w2window') || doc.querySelector('[class*="popup"]');
      if (!popup) return { found: false, text: '', inputs: [], buttons: [] };
      return {
        found: true,
        text: popup.textContent?.substring(0, 500) || '',
        inputs: Array.from(popup.querySelectorAll('input') as any[]).map((el: any) => ({
          id: el.id, type: el.type, class: el.className, placeholder: el.placeholder || '',
        })),
        buttons: Array.from(popup.querySelectorAll('a, button, input[type="button"]') as any[]).map((el: any) => ({
          id: el.id, tag: el.tagName, class: el.className, text: (el.textContent?.trim() || el.value || '').substring(0, 30),
        })),
      };
    }).catch(() => ({ found: false, text: '', inputs: [], buttons: [] }));
    log.info({ certPopupInfo }, '인증서 팝업 DOM 분석');

    // Step 2.5: 사업자명 인증서 클릭
    log.info('Step 2.5: 사업자명 인증서 선택');
    // 인증서 목록에서 사업자 인증서를 찾아 클릭
    // 일반적으로 인증서 목록은 테이블/리스트로 표시됨
    const certClicked = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      // 인증서 목록 탐색 (테이블 행 또는 리스트 아이템)
      const rows = doc.querySelectorAll('tr, li, .cert-item, [class*="cert"], [class*="list"] > div');
      for (const row of Array.from(rows) as any[]) {
        const text = row.textContent || '';
        // 사업자 인증서 식별 (사업자명, 사업자등록번호 등 포함)
        if ((text.includes('사업자') || text.includes('법인') || text.includes('치과') || text.includes('하얀')) && row.offsetParent !== null) {
          row.click();
          return `clicked: ${row.tagName} text="${text.substring(0, 50)}"`;
        }
      }
      // 첫 번째 인증서 선택 (폴백)
      const firstRow = doc.querySelector('.w2window tr:not(:first-child), .w2window .w2grid_row');
      if (firstRow) {
        (firstRow as any).click();
        return `fallback: clicked first cert`;
      }
      return 'not_found';
    }).catch(() => 'error');
    log.info({ certClicked }, '인증서 선택 결과');
    await page.waitForTimeout(1000);

    // Step 2.6: 인증서 비밀번호 입력
    log.info('Step 2.6: 인증서 비밀번호 입력');
    const certPassword = await getCertPassword(clinicId);

    if (certPassword) {
      // 비밀번호 입력 필드 찾기 (password type input in popup)
      const pwTyped = await page.evaluate((pw: string) => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const doc = (globalThis as any).document;
        const win = globalThis as any;
        // 팝업 내 비밀번호 필드
        const pwFields = doc.querySelectorAll('input[type="password"]');
        for (const field of Array.from(pwFields) as any[]) {
          if (field.offsetParent !== null || field.offsetWidth > 0) {
            field.focus();
            const setter = win.Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
            if (setter) setter.call(field, pw);
            else field.value = pw;
            field.dispatchEvent(new win.Event('input', { bubbles: true }));
            field.dispatchEvent(new win.Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      }, certPassword).catch(() => false);
      log.info({ pwTyped }, '인증서 비밀번호 입력 결과');

      // 확인 버튼 클릭
      await page.waitForTimeout(1000);
      const certConfirmClicked = await jsClick(page, '.w2window input[type="button"].btn', '인증서 확인 버튼');
      if (!certConfirmClicked) {
        // 텍스트 기반 폴백
        await clickByText(page, '확인', '인증서 확인 버튼');
      }

      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(5000);
    } else {
      log.warn({ clinicId }, '인증서 비밀번호가 등록되지 않음 — 인증서 팝업을 닫고 계속 진행');
      // 취소 버튼 클릭
      await clickByText(page, '취소', '인증서 팝업 닫기');
      await page.waitForTimeout(2000);
    }

    await screenshot(page, 'step2.6-cert-done');
  } else {
    log.info('인증서 팝업 없음 — 바로 조회 가능');
  }
}

/** Step 2.7~2.8: 년도별 구분 선택 + 조회 */
async function searchByYear(page: Page, year: number): Promise<void> {
  await screenshot(page, 'step2.7-before-search');

  // Step 2.7: 구분 "년도별" 클릭
  log.info({ year }, 'Step 2.7: 구분 년도별 선택');

  // "년도별" 또는 "연도별" 라디오/옵션 클릭
  let yearOptClicked = await clickByText(page, '년도별', '년도별 옵션');
  if (!yearOptClicked) {
    yearOptClicked = await clickByText(page, '연도별', '연도별 옵션');
  }
  if (!yearOptClicked) {
    // 라디오 버튼이나 셀렉트 옵션으로 시도
    await jsClick(page, 'input[value="year"], input[value="Y"], [data-value="year"]', '년도별 라디오');
  }
  await page.waitForTimeout(1000);

  // 연도 입력/선택
  log.info({ year }, '연도 설정');
  const yearSet = await page.evaluate((y: number) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;
    const win = globalThis as any;
    // 연도 입력 필드 찾기
    const yearInputs = doc.querySelectorAll('input[id*="year"], input[id*="Year"], input[id*="yyyy"], select[id*="year"]');
    for (const input of Array.from(yearInputs) as any[]) {
      if (input.offsetParent !== null || input.offsetWidth > 0) {
        if (input.tagName === 'SELECT') {
          input.value = String(y);
          input.dispatchEvent(new win.Event('change', { bubbles: true }));
        } else {
          input.focus();
          const setter = win.Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(input, String(y));
          else input.value = String(y);
          input.dispatchEvent(new win.Event('input', { bubbles: true }));
          input.dispatchEvent(new win.Event('change', { bubbles: true }));
        }
        return true;
      }
    }
    return false;
  }, year).catch(() => false);
  log.info({ yearSet, year }, '연도 설정 결과');

  // Step 2.8: 조회 클릭
  log.info('Step 2.8: 조회 버튼 클릭');
  await page.waitForTimeout(1000);

  // 조회 버튼 클릭 — 여러 셀렉터 시도
  let searchClicked = await clickByText(page, '조회', '조회 버튼', { exact: true });
  if (!searchClicked) {
    searchClicked = await jsClick(page, 'a:has-text("조회")', '조회 버튼 (a)');
  }
  if (!searchClicked) {
    searchClicked = await jsClick(page, 'input[value="조회"]', '조회 버튼 (input)');
  }
  if (!searchClicked) {
    // 모든 버튼/앵커에서 "조회" 텍스트 검색
    searchClicked = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const els = doc.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
      for (const el of Array.from(els) as any[]) {
        const text = (el.textContent?.trim() || el.value || '');
        if (text === '조회' && (el.offsetParent !== null || el.offsetWidth > 0)) {
          el.click();
          return true;
        }
      }
      return false;
    }).catch(() => false);
    if (searchClicked) log.info('조회 버튼 클릭 성공 (전체 탐색)');
  }

  if (!searchClicked) {
    await screenshot(page, 'step2.8-search-failed');
    throw new Error('조회 버튼을 찾을 수 없습니다');
  }

  // 로딩 대기
  log.info('조회 결과 로딩 대기');
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // 로딩 스피너 사라질 때까지 대기
  await page.locator('.loading, .spinner, .w2loading').first()
    .waitFor({ state: 'hidden', timeout: 15000 })
    .catch(() => {});

  await screenshot(page, 'step2.8-search-done');
}

/** Step 2.9: 데이터 스크래핑 */
async function scrapeStatisticsData(page: Page): Promise<Record<string, unknown>[]> {
  log.info('Step 2.9: 데이터 스크래핑');
  await screenshot(page, 'step2.9-before-scrape');

  // WebSquare 그리드 또는 HTML 테이블에서 데이터 추출
  const data = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;
    const results: Record<string, any>[] = [];

    // 1차: WebSquare w2grid 탐색
    const gridRows = doc.querySelectorAll('.w2grid_row, .w2grid .w2grid_data tr, [class*="grid"] tr');
    if (gridRows.length > 0) {
      // 헤더 추출
      const headerCells = doc.querySelectorAll('.w2grid_header .w2grid_cell, thead th, [class*="grid"] thead th');
      const headers = Array.from(headerCells as any[]).map((c: any) => c.textContent?.trim() || '');

      for (const row of Array.from(gridRows) as any[]) {
        const cells = row.querySelectorAll('.w2grid_cell, td');
        const record: Record<string, any> = {};
        let hasData = false;
        for (let i = 0; i < cells.length; i++) {
          const text = (cells[i] as any).textContent?.trim() || '';
          const key = headers[i] || `col_${i}`;
          record[key] = text;
          if (text) hasData = true;
        }
        if (hasData) results.push(record);
      }
      return results;
    }

    // 2차: 일반 HTML 테이블 탐색
    const tables = doc.querySelectorAll('table');
    for (const table of Array.from(tables) as any[]) {
      if (table.offsetParent === null) continue; // hidden 테이블 스킵
      const rows = table.querySelectorAll('tbody tr, tr');
      const headerRow = table.querySelector('thead tr');
      const headers = headerRow
        ? Array.from(headerRow.querySelectorAll('th, td') as any[]).map((c: any) => c.textContent?.trim() || '')
        : [];

      for (const row of Array.from(rows) as any[]) {
        if (row.querySelector('th') && !row.querySelector('td')) continue; // 헤더 행 스킵
        const cells = row.querySelectorAll('td');
        if (cells.length === 0) continue;
        const record: Record<string, any> = {};
        let hasData = false;
        for (let i = 0; i < cells.length; i++) {
          const text = (cells[i] as any).textContent?.trim() || '';
          const key = headers[i] || `col_${i}`;
          record[key] = text;
          if (text && text !== '-' && text !== '0') hasData = true;
        }
        if (hasData) results.push(record);
      }
      if (results.length > 0) break; // 첫 번째 데이터 테이블만
    }

    // 3차: 텍스트 기반 데이터 추출 (테이블 없는 경우)
    if (results.length === 0) {
      const contentArea = doc.querySelector('[class*="content"], [class*="main"], .w2group');
      if (contentArea) {
        const text = contentArea.innerText || '';
        results.push({ raw_text: text.substring(0, 5000) });
      }
    }

    return results;
  }).catch(() => []);

  log.info({ recordCount: data.length }, '데이터 추출 완료');

  if (data.length === 0) {
    // 디버그: 페이지 전체 텍스트 덤프
    const pageText = await page.evaluate(() => {
      return ((globalThis as any).document.body?.innerText || '').substring(0, 2000);
    }).catch(() => '');
    log.warn({ pageText }, '데이터 없음 — 페이지 내용 덤프');
  }

  return data;
}

// ── 공개 API ──

// parseAmount: 세금계산서 스크래퍼 구현 시 사용 예정
// function parseAmount(value: unknown): number {
//   if (typeof value === 'number') return value;
//   if (typeof value === 'string') return parseInt(value.replace(/[,원\s]/g, ''), 10) || 0;
//   return 0;
// }

/** 세금계산서 매출 스크래핑 — 전체 흐름 (2.1 ~ 2.9) */
export async function scrapeTaxInvoiceSales(
  context: BrowserContext,
  year: number,
  _month: number,
  clinicId?: string,
): Promise<ScrapeResult> {
  log.info({ year }, '세금계산서 매출/매입 통계 스크래핑 시작');

  const records = await withPage(context, async (page) => {
    // Step 2.1~2.6: 메뉴 이동 + 인증서 처리
    await navigateToTaxInvoiceStats(page, clinicId || '');

    // Step 2.7~2.8: 년도별 조회
    await searchByYear(page, year);

    // Step 2.9: 데이터 스크래핑
    return scrapeStatisticsData(page);
  });

  log.info({ year, count: records.length }, '세금계산서 매출/매입 통계 스크래핑 완료');

  return {
    dataType: 'tax_invoice_sales',
    records,
    totalCount: records.length,
    scrapedAt: new Date().toISOString(),
    period: { year, month: 0 }, // 년도별 조회이므로 month는 0
  };
}

/** 세금계산서 매입 스크래핑 — 매출과 동일 페이지 (매출/매입 통계 조회) */
export async function scrapeTaxInvoicePurchase(
  context: BrowserContext,
  year: number,
  _month: number,
  clinicId?: string,
): Promise<ScrapeResult> {
  // 매출/매입 통계 조회 페이지는 동일 — 매출 스크래핑과 같은 흐름
  log.info({ year }, '세금계산서 매입 통계 스크래핑 시작 (매출과 동일 페이지)');

  const result = await scrapeTaxInvoiceSales(context, year, _month, clinicId);

  return {
    ...result,
    dataType: 'tax_invoice_purchase',
  };
}
