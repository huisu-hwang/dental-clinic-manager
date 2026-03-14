import { HttpSession } from '../../types/scrapingContext.js';
import { ScrapeResult } from '../../hometax/scrapers/baseScraper.js';
import { queryAllPages, buildPeriodParams, parseAmount, buildResult } from './baseProtocolScraper.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('creditCardSalesProtocol');

const CREDIT_CARD_SALES_ACTION = '/hometax-api/v1/credit-card/sales';

function normalizeRecord(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    year_month: raw.yrMnth || raw.year_month || '',
    count: parseInt(String(raw.cnt || raw.count || '0').replace(/[,\s]/g, ''), 10) || 0,
    total_amount: parseAmount(raw.totAmt || raw.total_amount || 0),
    card_payment: parseAmount(raw.cdAmt || raw.card_payment || 0),
    purchase_card_payment: parseAmount(raw.prchsCdAmt || raw.purchase_card_payment || 0),
    cash_back: parseAmount(raw.cshBkAmt || raw.cash_back || 0),
  };
}

/** 신용카드 매출 (Protocol) */
export async function scrapeCreditCardSalesProtocol(
  session: HttpSession,
  year: number,
  month: number,
): Promise<ScrapeResult> {
  log.info({ year, month }, '신용카드 매출 Protocol 스크래핑 시작');

  const { startDate, endDate } = buildPeriodParams(year, month);
  const records = await queryAllPages(session, CREDIT_CARD_SALES_ACTION, {
    inqrDtStrt: startDate,
    inqrDtEnd: endDate,
  });

  const normalized = records.map(r => normalizeRecord(r));
  log.info({ year, month, count: normalized.length }, '신용카드 매출 Protocol 스크래핑 완료');
  return buildResult('credit_card_sales', normalized, year, month);
}
