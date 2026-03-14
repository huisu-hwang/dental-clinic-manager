import { BrowserContext } from 'playwright';
import { withPage, navigateToMenu, setPeriod, clickSearchAndWait, scrapeAllPages, ScrapeResult } from './baseScraper.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('creditCardSalesScraper');

// 홈택스 신용카드 매출 메뉴 경로
const CREDIT_CARD_SALES_MENU = '/ui/pp/aghab/a/EtsaahAMain.xml';

function normalizeRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const values = Object.values(raw);
  return {
    year_month: values[0] || '',
    count: parseInt(String(values[1] || '0').replace(/[,\s]/g, ''), 10) || 0,
    total_amount: parseAmount(values[2]),
    card_payment: parseAmount(values[3]),
    purchase_card_payment: parseAmount(values[4]),
    cash_back: parseAmount(values[5]),
  };
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    return parseInt(value.replace(/[,원\s]/g, ''), 10) || 0;
  }
  return 0;
}

/** 신용카드 매출 스크래핑 */
export async function scrapeCreditCardSales(
  context: BrowserContext,
  year: number,
  month: number,
): Promise<ScrapeResult> {
  log.info({ year, month }, '신용카드 매출 스크래핑 시작');

  const records = await withPage(context, async (page) => {
    await navigateToMenu(page, CREDIT_CARD_SALES_MENU);
    await setPeriod(page, year, month);
    await clickSearchAndWait(page);
    return scrapeAllPages(page);
  });

  const normalized = records.map(r => normalizeRecord(r));

  log.info({ year, month, count: normalized.length }, '신용카드 매출 스크래핑 완료');

  return {
    dataType: 'credit_card_sales',
    records: normalized,
    totalCount: normalized.length,
    scrapedAt: new Date().toISOString(),
    period: { year, month },
  };
}
