import { Page, BrowserContext } from 'playwright';
import { withPage, ScrapeResult } from './baseScraper.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('businessCardScraper');

const HOMETAX_MAIN = 'https://www.hometax.go.kr/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml';

/**
 * 사업용신용카드 매입세액 공제 확인/변경 메뉴 — 월별 조회 후 총 사용금액 추출
 *
 * 흐름:
 * 1. 홈택스 로그인 (선행)
 * 2. 계산서·영수증·카드 → 신용카드 매입 → 사업용 신용카드 사용 내역
 *    → 사업용신용카드 매입세액 공제 확인/변경
 *    (fn_topMenuOpen 후보 ID + 키워드 매칭 폴백)
 * 3. 조회기간을 "월별"로 선택
 * 4. 해당 연/월 선택
 * 5. 조회 버튼 클릭
 * 6. 총 사용금액 + 전체 행을 추출
 */

// 사업용신용카드 매입세액 공제 확인/변경 메뉴 후보 ID (홈택스 환경 변동 대응)
const DEDUCTION_MENU_CANDIDATES = [
  'menuAtag_4608020200',
  'menuAtag_4608020100',
  'menuAtag_4608010100',
  'menuAtag_4608010200',
];

const DEDUCTION_MENU_KEYWORDS = [
  '매입세액 공제 확인/변경',
  '매입세액공제 확인/변경',
  '매입세액 공제',
];

async function screenshot(page: Page, label: string): Promise<string> {
  const path = `/tmp/hometax-bizcard-${label}-${Date.now()}.png`;
  await page.screenshot({ path, fullPage: false }).catch(() => {});
  log.info({ screenshot: path, url: page.url() }, `스크린샷: ${label}`);
  return path;
}

/** 사업용신용카드 매입세액 공제 확인/변경 메뉴로 이동 */
async function navigateToDeductionMenu(page: Page): Promise<void> {
  log.info('매입세액 공제 확인/변경 메뉴 이동 시도');

  // 1) 후보 ID로 fn_topMenuOpen 시도
  for (const id of DEDUCTION_MENU_CANDIDATES) {
    const result = await page.evaluate((menuId: string) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const win = globalThis as any;
      try {
        if (win.$c?.pp?.fn_topMenuOpen) {
          win.$c.pp.fn_topMenuOpen(win.$p, menuId);
          return 'success';
        }
        const el = win.document.getElementById(menuId);
        if (el) { el.click(); return 'clicked'; }
        return 'not_found';
      } catch (e) {
        return `error: ${(e as any).message}`;
      }
    }, id).catch(() => 'evaluate_error');

    log.info({ id, result }, '메뉴 ID 시도');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500);

    if (page.url().includes('tmIdx=')) {
      log.info({ id }, '메뉴 ID로 이동 성공');
      return;
    }
  }

  // 2) 키워드 기반 메뉴 매칭 폴백
  log.info('후보 ID 실패 — 키워드 매칭 폴백');
  const keywordMatch = await page.evaluate((keywords: string[]) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;
    const win = globalThis as any;
    const items = Array.from(
      doc.querySelectorAll('a[id*="menuAtag"], a[id*="combineMenuAtag"]') as any[],
    );
    for (const el of items) {
      const text = (el.textContent?.trim() || '').replace(/\s+/g, ' ');
      for (const kw of keywords) {
        if (text.includes(kw)) {
          try {
            if (win.$c?.pp?.fn_topMenuOpen) {
              win.$c.pp.fn_topMenuOpen(win.$p, el.id);
            } else {
              el.click();
            }
            return { id: el.id, text };
          } catch (e) {
            return { error: String((e as any).message), id: el.id, text };
          }
        }
      }
    }
    return null;
  }, DEDUCTION_MENU_KEYWORDS).catch(() => null);

  log.info({ keywordMatch }, '키워드 매칭 결과');
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);

  if (!page.url().includes('tmIdx=')) {
    await screenshot(page, 'nav-failed');
    throw new Error('사업용신용카드 매입세액 공제 확인/변경 메뉴로 이동 실패');
  }

  await screenshot(page, 'menu-opened');
}

/** "월별" 조회 기간 라디오/탭 클릭 */
async function selectMonthlyPeriod(page: Page): Promise<void> {
  log.info('조회기간 "월별" 선택');

  const result = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;
    const win = globalThis as any;

    // 1) 라디오 버튼: label 텍스트가 "월별" 또는 value === 'M'
    const radios = doc.querySelectorAll('input[type="radio"]');
    for (const r of Array.from(radios) as any[]) {
      const labelEl = doc.querySelector(`label[for="${r.id}"]`);
      const labelText = labelEl?.textContent?.trim() || '';
      const valueText = (r.value || '').toString();
      if (
        labelText === '월별' ||
        labelText.includes('월별') ||
        valueText === 'M' ||
        valueText.includes('월')
      ) {
        r.checked = true;
        r.click();
        r.dispatchEvent(new win.Event('change', { bubbles: true }));
        return `radio: ${r.id} (label="${labelText}", value="${valueText}")`;
      }
    }

    // 2) 탭/버튼: 텍스트가 "월별"
    const candidates = doc.querySelectorAll('a, button, span, div, label, li');
    for (const el of Array.from(candidates) as any[]) {
      const text = el.textContent?.trim() || '';
      if (text === '월별' && (el.offsetParent !== null || el.offsetWidth > 0)) {
        el.click();
        return `tab: ${el.tagName}#${el.id}`;
      }
    }

    return 'not_found';
  }).catch(() => 'error');

  log.info({ result }, '월별 선택 결과');
  await page.waitForTimeout(1500);
}

/** 연/월 select 또는 input에 값 설정 */
async function selectYearMonth(page: Page, year: number, month: number): Promise<void> {
  const ym = `${year}${String(month).padStart(2, '0')}`;
  log.info({ year, month, ym }, '연월 설정');

  const results = await page.evaluate(
    (params: { y: number; m: number; ym: string }) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const win = globalThis as any;
      const yStr = String(params.y);
      const mStr = String(params.m).padStart(2, '0');
      const logs: string[] = [];

      const setSelectValue = (el: any, candidates: string[]): boolean => {
        const opts = el.querySelectorAll('option');
        for (const opt of Array.from(opts) as any[]) {
          const v = (opt.value || '').toString();
          const t = (opt.textContent || '').toString().trim();
          if (candidates.includes(v) || candidates.includes(t)) {
            el.value = opt.value;
            el.dispatchEvent(new win.Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      };

      const setInputValue = (el: any, value: string) => {
        const setter = win.Object.getOwnPropertyDescriptor(
          win.HTMLInputElement.prototype,
          'value',
        )?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new win.Event('input', { bubbles: true }));
        el.dispatchEvent(new win.Event('change', { bubbles: true }));
      };

      // 1) yyyymm 단일 select 시도 (예: 202504)
      const allSelects = Array.from(doc.querySelectorAll('select') as any[]).filter(
        (el: any) => el.offsetParent !== null || el.offsetWidth > 0,
      );
      for (const sel of allSelects) {
        if (
          setSelectValue(sel, [params.ym, `${yStr}${mStr}`, `${yStr}-${mStr}`, `${yStr}년 ${params.m}월`])
        ) {
          logs.push(`yyyymm select: ${sel.id || sel.name} → ${params.ym}`);
          return logs;
        }
      }

      // 2) 연도 select / 월 select 분리 처리
      let yearSet = false;
      let monthSet = false;
      for (const sel of allSelects) {
        const idLower = (sel.id || '').toLowerCase();
        const nameLower = (sel.name || '').toLowerCase();
        const isYear =
          idLower.includes('year') ||
          idLower.includes('yyyy') ||
          nameLower.includes('year');
        const isMonth =
          idLower.includes('month') ||
          idLower.includes('mm') ||
          nameLower.includes('month');

        if (isYear && !yearSet) {
          if (setSelectValue(sel, [yStr, `${yStr}년`])) {
            logs.push(`year select: ${sel.id} → ${yStr}`);
            yearSet = true;
          }
        }
        if (isMonth && !monthSet) {
          if (
            setSelectValue(sel, [
              mStr,
              String(params.m),
              `${params.m}월`,
              `${mStr}월`,
            ])
          ) {
            logs.push(`month select: ${sel.id} → ${mStr}`);
            monthSet = true;
          }
        }
      }

      // 휴리스틱 fallback: yearSet/monthSet 안 됐으면 옵션 텍스트로 추론
      if (!yearSet || !monthSet) {
        for (const sel of allSelects) {
          const opts = Array.from(sel.querySelectorAll('option') as any[]);
          const hasYearOption = opts.some((o: any) => /^20\d{2}(년)?$/.test((o.textContent || '').trim()));
          const hasMonthOption = opts.some((o: any) =>
            /^(0?[1-9]|1[0-2])(월)?$/.test((o.textContent || '').trim()),
          );
          if (!yearSet && hasYearOption) {
            if (setSelectValue(sel, [yStr, `${yStr}년`])) {
              logs.push(`year (heuristic): ${sel.id} → ${yStr}`);
              yearSet = true;
            }
          } else if (!monthSet && hasMonthOption) {
            if (
              setSelectValue(sel, [
                mStr,
                String(params.m),
                `${params.m}월`,
                `${mStr}월`,
              ])
            ) {
              logs.push(`month (heuristic): ${sel.id} → ${mStr}`);
              monthSet = true;
            }
          }
        }
      }

      // 3) input fallback (yyyymm 또는 yyyymmdd)
      if (!yearSet || !monthSet) {
        const inputs = Array.from(
          doc.querySelectorAll('input[type="text"], input:not([type])') as any[],
        ).filter((el: any) => el.offsetParent !== null || el.offsetWidth > 0);
        for (const el of inputs) {
          const idLower = (el.id || '').toLowerCase();
          if (idLower.includes('year') || idLower.includes('yyyy')) {
            setInputValue(el, yStr);
            logs.push(`year input: ${el.id} → ${yStr}`);
          }
          if (idLower.includes('month') || idLower.includes('mm')) {
            setInputValue(el, mStr);
            logs.push(`month input: ${el.id} → ${mStr}`);
          }
        }
      }

      return logs.length > 0 ? logs : ['no_field_set'];
    },
    { y: year, m: month, ym },
  ).catch(() => ['error']);

  log.info({ results }, '연월 설정 결과');
  await page.waitForTimeout(1000);
}

/** 조회 버튼 클릭 + 결과 대기 */
async function clickSearch(page: Page): Promise<void> {
  const clicked = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;
    const candidates = doc.querySelectorAll(
      'a, button, input[type="button"], input[type="submit"], .w2trigger, .w2anchor2',
    );
    for (const el of Array.from(candidates) as any[]) {
      const text = (el.textContent?.trim() || el.value || '').toString();
      if (
        (text === '조회' || text === '조회하기') &&
        (el.offsetParent !== null || el.offsetWidth > 0)
      ) {
        el.click();
        return `clicked: ${el.tagName}#${el.id} text="${text}"`;
      }
    }
    return 'not_found';
  }).catch(() => 'error');

  log.info({ clicked }, '조회 버튼 클릭 결과');
  if (clicked === 'not_found' || clicked === 'error') {
    await screenshot(page, 'search-failed');
    throw new Error('조회 버튼을 찾을 수 없습니다');
  }

  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page
    .locator('.loading, .spinner, .w2loading')
    .first()
    .waitFor({ state: 'hidden', timeout: 15000 })
    .catch(() => {});
}

/** 결과 페이지에서 데이터 + 총 사용금액 추출 */
async function extractResults(page: Page): Promise<{
  records: Record<string, unknown>[];
  totalUsageAmount: number | null;
}> {
  return await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;
    const records: Record<string, any>[] = [];

    const parseAmt = (s: string): number => {
      const cleaned = String(s).replace(/[,원\s]/g, '');
      const n = parseInt(cleaned, 10);
      return Number.isFinite(n) ? n : 0;
    };

    // visible 데이터 테이블 추출
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
        if (cells.length < 2) continue;
        const record: Record<string, any> = {};
        let hasNumeric = false;
        for (let i = 0; i < cells.length; i++) {
          const text = (cells[i] as any).textContent?.trim() || '';
          record[headers[i] || `col_${i}`] = text;
          if (text.match(/[\d,]+/) && text !== '0') hasNumeric = true;
        }
        if (hasNumeric) tableRecords.push(record);
      }

      if (tableRecords.length > 0) {
        records.push(...tableRecords);
        break;
      }
    }

    // WebSquare grid 폴백
    if (records.length === 0) {
      const gHeaders: string[] = [];
      const ghc = doc.querySelectorAll('.w2grid_header .w2grid_cell');
      for (const c of Array.from(ghc) as any[]) gHeaders.push(c.textContent?.trim() || '');
      const gRows = doc.querySelectorAll('.w2grid_data tr, .w2grid .w2grid_row');
      for (const row of Array.from(gRows) as any[]) {
        const cells = row.querySelectorAll('.w2grid_cell, td');
        if (cells.length < 2) continue;
        const record: Record<string, any> = {};
        let hasData = false;
        for (let i = 0; i < cells.length; i++) {
          const text = (cells[i] as any).textContent?.trim() || '';
          record[gHeaders[i] || `col_${i}`] = text;
          if (text.match(/[\d,]+/) && text !== '0') hasData = true;
        }
        if (hasData) records.push(record);
      }
    }

    // "총 사용금액" 추출 — 합계 행 또는 별도 표시
    let totalUsageAmount: number | null = null;
    const TOTAL_KEYS = ['총 사용금액', '총사용금액', '총사용 금액', '합계', '계'];

    for (const record of records) {
      for (const key of Object.keys(record)) {
        if (TOTAL_KEYS.some((tk) => key.replace(/\s/g, '').includes(tk.replace(/\s/g, '')))) {
          const amt = parseAmt(record[key]);
          if (amt > 0) {
            totalUsageAmount = (totalUsageAmount ?? 0) + amt;
          }
        }
      }
    }

    // 페이지 내 "총 사용금액 NNN원" 텍스트 폴백
    if (totalUsageAmount === null || totalUsageAmount === 0) {
      const bodyText = doc.body?.innerText || '';
      const m = bodyText.match(/총\s*사용\s*금액[^\d]*([\d,]+)/);
      if (m) {
        const amt = parseAmt(m[1]);
        if (amt > 0) totalUsageAmount = amt;
      }
    }

    return { records, totalUsageAmount };
  }).catch(() => ({ records: [] as Record<string, any>[], totalUsageAmount: null }));
}

export async function scrapeBusinessCardPurchase(
  context: BrowserContext,
  year: number,
  month: number,
  _clinicId?: string,
  sharedPage?: Page,
): Promise<ScrapeResult> {
  log.info({ year, month }, '사업용 신용카드 매입세액 공제 확인/변경 — 월별 스크래핑 시작');

  const doScrape = async (page: Page) => {
    if (!sharedPage) {
      await page.goto(HOMETAX_MAIN, { waitUntil: 'load', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const isLoggedIn = await page
        .locator('a:has-text("로그아웃")')
        .or(page.locator('button:has-text("로그아웃")'))
        .or(page.locator('text=로그아웃'))
        .first()
        .waitFor({ state: 'visible', timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      if (!isLoggedIn) throw new Error('홈택스 세션이 만료되었습니다.');
    } else {
      log.info('공유 페이지 사용 — 메인 페이지/로그인 확인 생략');
    }

    await navigateToDeductionMenu(page);
    await page.waitForTimeout(3000);

    await selectMonthlyPeriod(page);
    await screenshot(page, 'period-monthly');

    await selectYearMonth(page, year, month);
    await screenshot(page, 'year-month-set');

    await clickSearch(page);
    await screenshot(page, 'search-done');

    const { records, totalUsageAmount } = await extractResults(page);
    log.info(
      { recordCount: records.length, totalUsageAmount, sample: records.slice(0, 2) },
      '결과 추출 완료',
    );

    if (records.length === 0) {
      const bodyText = await page
        .evaluate(() => ((globalThis as any).document.body?.innerText || '').substring(0, 1500))
        .catch(() => '');
      log.warn({ bodyText }, '데이터 없음 — 페이지 텍스트 덤프');
      await screenshot(page, 'no-data');
    }

    // 총 사용금액을 별도 metadata 행으로 추가 (consumer가 합산 시 인식)
    if (totalUsageAmount !== null) {
      records.unshift({
        '구분': '총 사용금액',
        '총 사용금액': totalUsageAmount.toLocaleString(),
        '거래년월': `${year}-${String(month).padStart(2, '0')}`,
      });
    }

    return records;
  };

  const records = sharedPage
    ? await doScrape(sharedPage)
    : await withPage(context, doScrape);

  log.info(
    { year, month, count: records.length },
    '사업용 신용카드 매입세액 공제 확인/변경 스크래핑 완료',
  );

  return {
    dataType: 'business_card_purchase',
    records,
    totalCount: records.length,
    scrapedAt: new Date().toISOString(),
    period: { year, month },
  };
}
