import type { Page } from 'playwright';
import { log } from './logger';

// ============================================
// 홈택스 스크래퍼 (사용자 PC 워커용)
// scraping-worker/src/hometax/scrapers/ 의 핵심 로직 이식
// - sharedPage 모드 전용 (workerBridge에서 단일 페이지 공유)
// - /tmp 스크린샷 호출 제거 (Windows 호환)
// ============================================

const HOMETAX_MAIN = 'https://www.hometax.go.kr/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml';

export interface ScrapeResult {
  dataType: string;
  records: Record<string, unknown>[];
  totalCount: number;
  scrapedAt: string;
  period: { year: number; month: number };
}

export type DataType =
  | 'cash_receipt_purchase'
  | 'business_card_purchase';

/** 메뉴 ID 매핑 (홈택스 fn_topMenuOpen 호출용) */
const MENU_ID_MAP: Record<DataType, string> = {
  cash_receipt_purchase: 'menuAtag_4605010100',
  business_card_purchase: 'menuAtag_4608020200',
};

// 사업용신용카드 매입세액 공제 확인/변경 메뉴 후보 (홈택스 환경 변동 대응)
const BUSINESS_CARD_DEDUCTION_CANDIDATES = [
  'menuAtag_4608020200',
  'menuAtag_4608020100',
  'menuAtag_4608010100',
  'menuAtag_4608010200',
];

const BUSINESS_CARD_DEDUCTION_KEYWORDS = [
  '매입세액 공제 확인/변경',
  '매입세액공제 확인/변경',
  '매입세액 공제',
];

/** YYYYMMDD 형식 월별 기간 */
function getMonthPeriod(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}${String(month).padStart(2, '0')}01`,
    end: `${year}${String(month).padStart(2, '0')}${String(lastDay).padStart(2, '0')}`,
  };
}

/** 메뉴 네비게이션: $c.pp.fn_topMenuOpen 호출 */
async function navigateToMenu(page: Page, menuId: string): Promise<void> {
  const navResult = await page.evaluate((id: string) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const win = globalThis as any;
    try {
      if (win.$c?.pp?.fn_topMenuOpen) {
        win.$c.pp.fn_topMenuOpen(win.$p, id);
        return `success: ${id}`;
      }
      const el = win.document.getElementById(id);
      if (el) {
        el.click();
        return `clicked: ${id}`;
      }
      return 'not_found';
    } catch (e) {
      return `error: ${(e as any).message}`;
    }
  }, menuId).catch(() => 'evaluate_error');

  log('info', `[Hometax] 메뉴 네비게이션: ${navResult}`);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(5000);

  if (!page.url().includes('tmIdx=')) {
    throw new Error(`메뉴 이동 실패: ${menuId}`);
  }
}

/** 년도 select/input 자동 설정 */
async function setYear(page: Page, year: number): Promise<void> {
  await page.evaluate((y: number) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;
    const win = globalThis as any;
    const yStr = String(y);

    // select 요소
    const selects = doc.querySelectorAll('select');
    for (const el of Array.from(selects) as any[]) {
      if (el.offsetParent === null && el.offsetWidth === 0) continue;
      const opts = el.querySelectorAll('option');
      for (const opt of Array.from(opts) as any[]) {
        const optVal = opt.value || '';
        const optText = opt.textContent?.trim() || '';
        if (
          optVal === yStr ||
          optText === yStr ||
          optVal === `${yStr}년` ||
          optText === `${yStr}년` ||
          optVal.startsWith(yStr)
        ) {
          el.value = opt.value;
          el.dispatchEvent(new win.Event('change', { bubbles: true }));
          break;
        }
      }
    }

    // input 필드
    const inputs = doc.querySelectorAll('input[type="text"], input:not([type])');
    for (const el of Array.from(inputs) as any[]) {
      if (el.offsetParent === null && el.offsetWidth === 0) continue;
      if (el.value?.match(/^\d{4}/) || el.id?.toLowerCase().includes('year') || el.id?.toLowerCase().includes('yyyy')) {
        const setter = win.Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, yStr);
        else el.value = yStr;
        el.dispatchEvent(new win.Event('input', { bubbles: true }));
        el.dispatchEvent(new win.Event('change', { bubbles: true }));
      }
    }
  }, year).catch(() => {});

  await page.waitForTimeout(1000);
}

/** "일별/월별" 기간 탭 클릭 (현금영수증 매입용) */
async function clickPeriodTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;
    const win = globalThis as any;

    // 라디오 우선
    const radios = doc.querySelectorAll('input[type="radio"]');
    for (const radio of Array.from(radios) as any[]) {
      const label = doc.querySelector(`label[for="${radio.id}"]`);
      const labelText = label?.textContent?.trim() || '';
      if (labelText.includes('일별') || radio.value?.includes('일별') || radio.value === 'D') {
        radio.checked = true;
        radio.click();
        radio.dispatchEvent(new win.Event('change', { bubbles: true }));
        return;
      }
    }

    // 탭/링크 폴백
    const allClickable = doc.querySelectorAll('a, button, span, div, label, li');
    for (const el of Array.from(allClickable) as any[]) {
      const text = el.textContent?.trim() || '';
      if (text === '일별' || text === '월별' || text === '일별조회') {
        if (el.offsetParent !== null || el.offsetWidth > 0) {
          el.click();
          return;
        }
      }
    }
  }).catch(() => {});

  await page.waitForTimeout(2000);
}

/** 시작일/종료일 입력 (YYYYMMDD) */
async function setDateRange(page: Page, start: string, end: string): Promise<void> {
  await page.evaluate((p: { start: string; end: string }) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;
    const win = globalThis as any;

    const inputs = doc.querySelectorAll('input[type="text"], input:not([type])');
    const dateInputs: any[] = [];
    for (const el of Array.from(inputs) as any[]) {
      if (el.offsetParent === null && el.offsetWidth === 0) continue;
      if (
        el.value?.match(/^\d{4}[-./]?\d{2}[-./]?\d{2}$/) ||
        el.id?.toLowerCase().includes('date') ||
        el.id?.toLowerCase().includes('from') ||
        el.id?.toLowerCase().includes('to')
      ) {
        dateInputs.push(el);
      }
    }

    if (dateInputs.length >= 2) {
      const setter = win.Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(dateInputs[0], p.start);
      else dateInputs[0].value = p.start;
      dateInputs[0].dispatchEvent(new win.Event('change', { bubbles: true }));

      if (setter) setter.call(dateInputs[1], p.end);
      else dateInputs[1].value = p.end;
      dateInputs[1].dispatchEvent(new win.Event('change', { bubbles: true }));
    }
  }, { start, end }).catch(() => {});

  await page.waitForTimeout(1000);
}

/** 조회 버튼 클릭 + 결과 대기 */
async function clickSearch(page: Page): Promise<void> {
  const searchClicked = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;
    const candidates = doc.querySelectorAll(
      'a, button, input[type="button"], input[type="submit"], .w2trigger, .w2anchor2'
    );
    for (const el of Array.from(candidates) as any[]) {
      const text = el.textContent?.trim() || el.value || '';
      if ((text === '조회' || text === '조회하기') && (el.offsetParent !== null || el.offsetWidth > 0)) {
        el.click();
        return `clicked: ${el.tagName}#${el.id}`;
      }
    }
    return 'not_found';
  }).catch(() => 'error');

  if (searchClicked === 'not_found' || searchClicked === 'error') {
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

/** 데이터 테이블 파싱 (HTML table + WebSquare grid 폴백) */
async function parseDataTable(page: Page): Promise<Record<string, unknown>[]> {
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
  }).catch(() => [] as Record<string, any>[]);

  return data;
}

/** 현금영수증 매입(지출증빙) — 월별 조회 */
async function scrapeCashReceiptPurchase(
  page: Page,
  year: number,
  month: number
): Promise<ScrapeResult> {
  log('info', `[Hometax] 현금영수증 매입 스크래핑 시작 (${year}-${month})`);

  await navigateToMenu(page, MENU_ID_MAP.cash_receipt_purchase);
  await page.waitForTimeout(3000);

  await clickPeriodTab(page);

  const period = getMonthPeriod(year, month);
  await setYear(page, year);
  await setDateRange(page, period.start, period.end);

  await clickSearch(page);

  const records = await parseDataTable(page);
  log('info', `[Hometax] 현금영수증 매입 ${records.length}건 수집`);

  return {
    dataType: 'cash_receipt_purchase',
    records,
    totalCount: records.length,
    scrapedAt: new Date().toISOString(),
    period: { year, month },
  };
}

/** 사업용신용카드 매입세액 공제 확인/변경 메뉴로 이동 (후보 ID + 키워드 매칭) */
async function navigateToBusinessCardDeduction(page: Page): Promise<void> {
  for (const id of BUSINESS_CARD_DEDUCTION_CANDIDATES) {
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

    log('info', `[Hometax] 매입세액 공제 메뉴 ID 시도: ${id} → ${result}`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500);

    if (page.url().includes('tmIdx=')) return;
  }

  // 키워드 매칭 폴백
  await page.evaluate((keywords: string[]) => {
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
            return;
          } catch {
            // ignore
          }
        }
      }
    }
  }, BUSINESS_CARD_DEDUCTION_KEYWORDS).catch(() => {});

  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);

  if (!page.url().includes('tmIdx=')) {
    throw new Error('사업용신용카드 매입세액 공제 확인/변경 메뉴 이동 실패');
  }
}

/** "월별" 조회기간 라디오/탭 클릭 */
async function selectMonthlyPeriod(page: Page): Promise<void> {
  await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;
    const win = globalThis as any;

    const radios = doc.querySelectorAll('input[type="radio"]');
    for (const r of Array.from(radios) as any[]) {
      const labelEl = doc.querySelector(`label[for="${r.id}"]`);
      const labelText = labelEl?.textContent?.trim() || '';
      const valueText = (r.value || '').toString();
      if (labelText.includes('월별') || valueText === 'M' || valueText.includes('월')) {
        r.checked = true;
        r.click();
        r.dispatchEvent(new win.Event('change', { bubbles: true }));
        return;
      }
    }

    const candidates = doc.querySelectorAll('a, button, span, div, label, li');
    for (const el of Array.from(candidates) as any[]) {
      const text = el.textContent?.trim() || '';
      if (text === '월별' && (el.offsetParent !== null || el.offsetWidth > 0)) {
        el.click();
        return;
      }
    }
  }).catch(() => {});

  await page.waitForTimeout(1500);
}

/** 연/월 select 또는 input 설정 */
async function setYearMonth(page: Page, year: number, month: number): Promise<void> {
  const ym = `${year}${String(month).padStart(2, '0')}`;
  await page.evaluate(
    (params: { y: number; m: number; ym: string }) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const win = globalThis as any;
      const yStr = String(params.y);
      const mStr = String(params.m).padStart(2, '0');

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

      const allSelects = Array.from(doc.querySelectorAll('select') as any[]).filter(
        (el: any) => el.offsetParent !== null || el.offsetWidth > 0,
      );

      // 1) yyyymm 단일 select 시도
      for (const sel of allSelects) {
        if (
          setSelectValue(sel, [params.ym, `${yStr}${mStr}`, `${yStr}-${mStr}`, `${yStr}년 ${params.m}월`])
        ) return;
      }

      // 2) 연도 + 월 분리 select
      let yearSet = false;
      let monthSet = false;
      for (const sel of allSelects) {
        const idLower = (sel.id || '').toLowerCase();
        const nameLower = (sel.name || '').toLowerCase();
        const isYear =
          idLower.includes('year') || idLower.includes('yyyy') || nameLower.includes('year');
        const isMonth =
          idLower.includes('month') || idLower.includes('mm') || nameLower.includes('month');
        if (isYear && !yearSet && setSelectValue(sel, [yStr, `${yStr}년`])) yearSet = true;
        if (
          isMonth &&
          !monthSet &&
          setSelectValue(sel, [mStr, String(params.m), `${params.m}월`, `${mStr}월`])
        )
          monthSet = true;
      }

      // 휴리스틱 폴백
      if (!yearSet || !monthSet) {
        for (const sel of allSelects) {
          const opts = Array.from(sel.querySelectorAll('option') as any[]);
          const hasYearOption = opts.some((o: any) =>
            /^20\d{2}(년)?$/.test((o.textContent || '').trim()),
          );
          const hasMonthOption = opts.some((o: any) =>
            /^(0?[1-9]|1[0-2])(월)?$/.test((o.textContent || '').trim()),
          );
          if (!yearSet && hasYearOption && setSelectValue(sel, [yStr, `${yStr}년`])) yearSet = true;
          else if (
            !monthSet &&
            hasMonthOption &&
            setSelectValue(sel, [mStr, String(params.m), `${params.m}월`, `${mStr}월`])
          )
            monthSet = true;
        }
      }
    },
    { y: year, m: month, ym },
  ).catch(() => {});

  await page.waitForTimeout(1000);
}

/** 사업용신용카드 매입세액 공제 확인/변경 — 월별 조회 → 총 사용금액 */
async function scrapeBusinessCardPurchase(
  page: Page,
  year: number,
  month: number
): Promise<ScrapeResult> {
  log('info', `[Hometax] 사업용 신용카드 매입세액 공제 확인/변경 — 월별 (${year}-${month})`);

  await navigateToBusinessCardDeduction(page);
  await page.waitForTimeout(3000);

  await selectMonthlyPeriod(page);
  await setYearMonth(page, year, month);
  await clickSearch(page);

  const records = await parseDataTable(page);

  // 총 사용금액 추출
  const totalUsageAmount = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;
    const parseAmt = (s: string): number => {
      const cleaned = String(s).replace(/[,원\s]/g, '');
      const n = parseInt(cleaned, 10);
      return Number.isFinite(n) ? n : 0;
    };
    const bodyText = doc.body?.innerText || '';
    const m = bodyText.match(/총\s*사용\s*금액[^\d]*([\d,]+)/);
    if (m) return parseAmt(m[1]);
    return null as number | null;
  }).catch(() => null);

  if (totalUsageAmount !== null && totalUsageAmount > 0) {
    records.unshift({
      '구분': '총 사용금액',
      '총 사용금액': totalUsageAmount.toLocaleString(),
      '거래년월': `${year}-${String(month).padStart(2, '0')}`,
    });
  }

  log(
    'info',
    `[Hometax] 사업용 신용카드 매입세액 공제 ${records.length}건 (총 사용금액=${totalUsageAmount ?? 'N/A'})`,
  );

  return {
    dataType: 'business_card_purchase',
    records,
    totalCount: records.length,
    scrapedAt: new Date().toISOString(),
    period: { year, month },
  };
}

/** 데이터 타입별 디스패처 */
export async function scrapeHometaxData(
  page: Page,
  dataType: string,
  year: number,
  month: number
): Promise<ScrapeResult> {
  switch (dataType) {
    case 'cash_receipt_purchase':
      return scrapeCashReceiptPurchase(page, year, month);
    case 'business_card_purchase':
      return scrapeBusinessCardPurchase(page, year, month);
    default:
      log('warn', `[Hometax] 미지원 데이터 타입: ${dataType}`);
      return {
        dataType,
        records: [],
        totalCount: 0,
        scrapedAt: new Date().toISOString(),
        period: { year, month },
      };
  }
}

/** 다음 스크래퍼를 위해 메인 페이지로 복귀 */
export async function returnToMain(page: Page): Promise<void> {
  await page
    .goto(HOMETAX_MAIN, { waitUntil: 'domcontentloaded', timeout: 30000 })
    .catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
}
