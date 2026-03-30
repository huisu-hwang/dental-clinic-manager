import { Page, BrowserContext } from 'playwright';
import { withPage, ScrapeResult } from './baseScraper.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('creditCardSalesScraper');

const HOMETAX_MAIN = 'https://www.hometax.go.kr/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml';

// 메뉴 ID: 신용카드·판매(결제)대행 매출자료 조회
const MENU_ID = 'menuAtag_4607010000';

// ── 헬퍼 ──

async function screenshot(page: Page, label: string): Promise<string> {
  const path = `/tmp/hometax-card-${label}-${Date.now()}.png`;
  await page.screenshot({ path, fullPage: false }).catch(() => {});
  log.info({ screenshot: path, url: page.url() }, `스크린샷: ${label}`);
  return path;
}

/** 페이지 내 모든 visible input/select/button 요소 덤프 (디버그) */
async function dumpFormElements(page: Page, label: string): Promise<void> {
  const elements = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;
    const results: any[] = [];
    const els = doc.querySelectorAll('input, select, a, button, [class*="radio"], [class*="select"], [class*="combo"]');
    for (const el of Array.from(els) as any[]) {
      if (el.offsetParent === null && el.offsetWidth === 0) continue; // hidden 스킵
      results.push({
        tag: el.tagName,
        id: el.id?.substring(0, 60) || '',
        type: el.type || '',
        class: el.className?.substring(0, 60) || '',
        value: (el.value || el.textContent?.trim() || '').substring(0, 40),
        name: el.name || '',
      });
    }
    return results;
  }).catch(() => []);
  log.info({ label, count: elements.length, elements: elements.slice(0, 30) }, 'Form 요소 덤프');
}

// ── 메인 흐름 ──

/**
 * 신용카드 매출 스크래핑 흐름:
 * 1. 로그인 후 (loginService에서 처리 완료)
 * 2. 계산서·영수증·카드 > 신용카드 매출 > 신용카드·판매(결제)대행 매출자료 조회
 *    → $c.pp.fn_topMenuOpen($p, 'menuAtag_4607010000')
 * 2.3 결제년도 및 분기 선택 후 조회
 * 2.4 필요 정보 스크래핑
 */
export async function scrapeCreditCardSales(
  context: BrowserContext,
  year: number,
  month: number,
): Promise<ScrapeResult> {
  log.info({ year, month }, '신용카드 매출 스크래핑 시작');

  const records = await withPage(context, async (page) => {
    // ── Step 1: 메인 페이지 접속 + 로그인 확인 ──
    log.info('메인 페이지 접속');
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

    if (!isLoggedIn) {
      throw new Error('홈택스 세션이 만료되었습니다.');
    }
    await screenshot(page, '1-logged-in');

    // ── Step 2.1~2.2: 신용카드·판매(결제)대행 매출자료 조회 메뉴 이동 ──
    log.info('Step 2.1~2.2: 신용카드 매출자료 조회 메뉴 이동');

    const navResult = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const win = globalThis as any;
      try {
        if (win.$c?.pp?.fn_topMenuOpen) {
          win.$c.pp.fn_topMenuOpen(win.$p, 'menuAtag_4607010000');
          return 'success';
        }
        const el = win.document.getElementById('menuAtag_4607010000');
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
      await screenshot(page, '2-nav-failed');
      throw new Error('신용카드 매출자료 조회 메뉴 이동 실패');
    }
    await screenshot(page, '2-menu-opened');

    // ── Step 2.3: 결제년도 및 분기 선택 후 조회 ──
    log.info({ year, month }, 'Step 2.3: 결제년도/분기 선택');

    // 페이지 로딩 완료 대기 (WebSquare 콘텐츠 로딩)
    await page.waitForTimeout(3000);

    // 페이지 Form 요소 분석
    await dumpFormElements(page, 'before-search');

    // 년도 설정 — WebSquare의 select/input 요소에서 년도 변경
    const yearSet = await page.evaluate((y: number) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const win = globalThis as any;
      const yStr = String(y);
      const results: string[] = [];

      // 1차: WebSquare w2combo (셀렉트박스)
      const combos = doc.querySelectorAll('select, [class*="w2combo"], [class*="combo"]');
      for (const el of Array.from(combos) as any[]) {
        if (el.offsetParent === null && el.offsetWidth === 0) continue;
        const opts = el.querySelectorAll ? el.querySelectorAll('option') : [];
        for (const opt of Array.from(opts) as any[]) {
          const optVal = opt.value || '';
          const optText = opt.textContent?.trim() || '';
          if (optVal === yStr || optText === yStr || optVal === `${yStr}년` || optText === `${yStr}년` || optVal.startsWith(yStr)) {
            el.value = opt.value;
            el.dispatchEvent(new win.Event('change', { bubbles: true }));
            results.push(`combo: ${el.id} set to ${yStr}`);
            break;
          }
        }
      }

      // 2차: input[type=text] 필드 (년도 입력)
      const inputs = doc.querySelectorAll('input[type="text"], input:not([type])');
      for (const el of Array.from(inputs) as any[]) {
        if (el.offsetParent === null && el.offsetWidth === 0) continue;
        const val = el.value || '';
        // 이미 년도가 입력되어 있거나 id에 year 포함
        if (val.match(/^\d{4}$/) || el.id?.toLowerCase().includes('year') || el.id?.toLowerCase().includes('yyyy')) {
          const setter = win.Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(el, yStr);
          else el.value = yStr;
          el.dispatchEvent(new win.Event('input', { bubbles: true }));
          el.dispatchEvent(new win.Event('change', { bubbles: true }));
          results.push(`input: ${el.id} set to ${yStr}`);
        }
      }

      return results.length > 0 ? results : ['no_year_field_found'];
    }, year).catch(() => ['error']);

    log.info({ yearSet }, '년도 설정 결과');

    // 분기 선택 (month → 분기 변환: 1~3=1분기, 4~6=2분기, ...)
    const quarter = Math.ceil(month / 3);
    const quarterSet = await page.evaluate((q: number) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const win = globalThis as any;
      const qStr = String(q);
      const results: string[] = [];

      // 분기 셀렉트/라디오 검색
      const selects = doc.querySelectorAll('select, [class*="w2combo"]');
      for (const el of Array.from(selects) as any[]) {
        if (el.offsetParent === null && el.offsetWidth === 0) continue;
        const opts = el.querySelectorAll ? el.querySelectorAll('option') : [];
        for (const opt of Array.from(opts) as any[]) {
          const optText = opt.textContent?.trim() || '';
          const optVal = opt.value || '';
          // "1분기", "1/4분기", "1" 등 매칭
          if (optVal === qStr || optText.includes(`${q}분기`) || optText === `${q}/4분기`) {
            el.value = opt.value;
            el.dispatchEvent(new win.Event('change', { bubbles: true }));
            results.push(`quarter combo: ${el.id} set to ${optText}`);
            break;
          }
        }
      }

      // 라디오/체크박스
      const radios = doc.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      for (const el of Array.from(radios) as any[]) {
        if (el.offsetParent === null && el.offsetWidth === 0) continue;
        const label = el.parentElement?.textContent?.trim() || '';
        if (label.includes(`${q}분기`)) {
          el.checked = true;
          el.click();
          el.dispatchEvent(new win.Event('change', { bubbles: true }));
          results.push(`radio: ${el.id} = ${label}`);
        }
      }

      return results.length > 0 ? results : ['no_quarter_field_found'];
    }, quarter).catch(() => ['error']);

    log.info({ quarter, quarterSet }, '분기 설정 결과');

    await page.waitForTimeout(1000);
    await screenshot(page, '3-period-set');

    // 조회 버튼 클릭 — 현재 메뉴 컨텐츠 영역 내의 조회 버튼만 타겟
    log.info('조회 버튼 클릭');

    const searchClicked = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;

      // 메인 콘텐츠 영역 내의 조회 버튼 찾기 (헤더/GNB 제외)
      // WebSquare에서 콘텐츠는 보통 특정 프레임이나 div 안에 로드됨
      const contentArea = doc.querySelector('[class*="content"], [id*="content"], .w2group_frame')
        || doc.body;

      // 조회 버튼: input[type=button], a, button 중 "조회" 텍스트를 가진 것
      const candidates = contentArea.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
      for (const el of Array.from(candidates) as any[]) {
        const text = (el.textContent?.trim() || el.value || '');
        // 정확히 "조회"이거나 "조회하기" — 너무 긴 텍스트는 다른 메뉴 링크
        if ((text === '조회' || text === '조회하기') && (el.offsetParent !== null || el.offsetWidth > 0)) {
          el.click();
          return `clicked: ${el.tagName}#${el.id} text="${text}"`;
        }
      }

      // WebSquare trigger/anchor 버튼 중 조회
      const triggers = contentArea.querySelectorAll('.w2trigger, .w2anchor2');
      for (const el of Array.from(triggers) as any[]) {
        const text = (el.textContent?.trim() || el.value || '');
        if (text === '조회') {
          el.click();
          return `trigger: ${el.tagName}#${el.id} text="${text}"`;
        }
      }

      return 'not_found';
    }).catch(() => 'error');

    log.info({ searchClicked }, '조회 버튼 클릭 결과');

    if (searchClicked === 'not_found' || searchClicked === 'error') {
      await screenshot(page, '3-search-btn-failed');
      throw new Error('조회 버튼을 찾을 수 없습니다');
    }

    // 로딩 대기
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await page.locator('.loading, .spinner, .w2loading').first()
      .waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});

    await screenshot(page, '4-search-done');

    // ── Step 2.4: 데이터 스크래핑 ──
    log.info('Step 2.4: 데이터 스크래핑');

    const data = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const results: Record<string, any>[] = [];

      // 모든 visible 테이블에서 데이터 추출
      const tables = doc.querySelectorAll('table');
      for (const table of Array.from(tables) as any[]) {
        if (table.offsetParent === null && table.offsetWidth === 0) continue;

        // 헤더 추출
        const headers: string[] = [];
        const headerCells = table.querySelectorAll('thead th, thead td, tr:first-child th');
        for (const cell of Array.from(headerCells) as any[]) {
          headers.push(cell.textContent?.trim() || '');
        }

        // 데이터 행 추출
        const rows = table.querySelectorAll('tbody tr, tr');
        for (const row of Array.from(rows) as any[]) {
          // 헤더 행 스킵
          if (row.querySelector('th') && !row.querySelector('td')) continue;
          const cells = row.querySelectorAll('td');
          if (cells.length === 0) continue;

          const record: Record<string, any> = {};
          let hasData = false;
          for (let i = 0; i < cells.length; i++) {
            const text = (cells[i] as any).textContent?.trim() || '';
            const key = headers[i] || `col_${i}`;
            record[key] = text;
            if (text && text !== '-' && text !== '0' && text !== '') hasData = true;
          }
          if (hasData) results.push(record);
        }
        if (results.length > 0) break; // 첫 번째 데이터 테이블
      }

      // WebSquare 그리드 폴백
      if (results.length === 0) {
        const gridCells = doc.querySelectorAll('.w2grid_data .w2grid_cell, .w2grid .w2grid_row');
        if (gridCells.length > 0) {
          // 그리드 헤더
          const gHeaders: string[] = [];
          const gHeaderCells = doc.querySelectorAll('.w2grid_header .w2grid_cell');
          for (const c of Array.from(gHeaderCells) as any[]) {
            gHeaders.push(c.textContent?.trim() || '');
          }
          // 그리드 행
          const gRows = doc.querySelectorAll('.w2grid_data tr, .w2grid .w2grid_row');
          for (const row of Array.from(gRows) as any[]) {
            const cells = row.querySelectorAll('.w2grid_cell, td');
            const record: Record<string, any> = {};
            let hasData = false;
            for (let i = 0; i < cells.length; i++) {
              const text = (cells[i] as any).textContent?.trim() || '';
              record[gHeaders[i] || `col_${i}`] = text;
              if (text && text !== '0') hasData = true;
            }
            if (hasData) results.push(record);
          }
        }
      }

      return results;
    }).catch(() => []);

    log.info({ recordCount: data.length, sample: data.slice(0, 2) }, '데이터 추출 완료');

    if (data.length === 0) {
      // 디버그: 페이지 본문 텍스트 일부
      const bodyText = await page.evaluate(() =>
        ((globalThis as any).document.body?.innerText || '').substring(0, 1500)
      ).catch(() => '');
      log.warn({ bodyText }, '데이터 없음 — 페이지 텍스트 덤프');
      await screenshot(page, '4-no-data');
    }

    return data;
  });

  log.info({ year, month, count: records.length }, '신용카드 매출 스크래핑 완료');

  return {
    dataType: 'credit_card_sales',
    records,
    totalCount: records.length,
    scrapedAt: new Date().toISOString(),
    period: { year, month },
  };
}
