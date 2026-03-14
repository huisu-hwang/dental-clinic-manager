import { BrowserContext } from 'playwright';
import { withPage, navigateToMenu, setPeriod, clickSearchAndWait, scrapeAllPages, ScrapeResult } from './baseScraper.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('businessCardScraper');

// 홈택스 사업용 신용카드 매입세액 공제 메뉴 경로
const BUSINESS_CARD_MENU = '/ui/pp/agfab/a/EtsaafAMain.xml';

function normalizeRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const values = Object.values(raw);
  return {
    trade_date: values[0] || '',
    card_company: values[1] || '',
    card_number_masked: values[2] || '',
    store_name: values[3] || '',
    store_biz_no: values[4] || '',
    supply_amount: parseAmount(values[5]),
    vat: parseAmount(values[6]),
    total_amount: parseAmount(values[7]),
    deduction_type: values[8] || '',
    is_deductible: String(values[8] || '').includes('공제'),
  };
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    return parseInt(value.replace(/[,원\s]/g, ''), 10) || 0;
  }
  return 0;
}

/** 사업용 신용카드 매입 스크래핑 */
export async function scrapeBusinessCardPurchase(
  context: BrowserContext,
  year: number,
  month: number,
): Promise<ScrapeResult> {
  log.info({ year, month }, '사업용 신용카드 매입 스크래핑 시작');

  const records = await withPage(context, async (page) => {
    await navigateToMenu(page, BUSINESS_CARD_MENU);
    await setPeriod(page, year, month);
    await clickSearchAndWait(page);
    return scrapeAllPages(page);
  });

  const normalized = records.map(r => normalizeRecord(r));

  log.info({ year, month, count: normalized.length }, '사업용 신용카드 매입 스크래핑 완료');

  return {
    dataType: 'business_card_purchase',
    records: normalized,
    totalCount: normalized.length,
    scrapedAt: new Date().toISOString(),
    period: { year, month },
  };
}
