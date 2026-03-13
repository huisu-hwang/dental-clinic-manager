import { HttpSession } from '../../types/scrapingContext.js';
import { ScrapeResult } from '../../hometax/scrapers/baseScraper.js';
import { queryAllPages, buildPeriodParams, parseAmount, buildResult } from './baseProtocolScraper.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('businessCardProtocol');

const BUSINESS_CARD_ACTION = '/hometax-api/v1/business-card/purchase';

function normalizeRecord(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    trade_date: raw.trdDt || raw.trade_date || '',
    card_company: raw.cdcoNm || raw.card_company || '',
    card_number_masked: raw.cardNo || raw.card_number_masked || '',
    store_name: raw.frNm || raw.store_name || '',
    store_biz_no: raw.frTin || raw.store_biz_no || '',
    supply_amount: parseAmount(raw.splCft || raw.supply_amount || 0),
    vat: parseAmount(raw.txamt || raw.vat || 0),
    total_amount: parseAmount(raw.totAmt || raw.total_amount || 0),
    deduction_type: raw.ddcYnNm || raw.deduction_type || '',
    is_deductible: String(raw.ddcYnNm || raw.deduction_type || '').includes('공제'),
  };
}

/** 사업용 신용카드 매입 (Protocol) */
export async function scrapeBusinessCardPurchaseProtocol(
  session: HttpSession,
  year: number,
  month: number,
): Promise<ScrapeResult> {
  log.info({ year, month }, '사업용 신용카드 매입 Protocol 스크래핑 시작');

  const { startDate, endDate } = buildPeriodParams(year, month);
  const records = await queryAllPages(session, BUSINESS_CARD_ACTION, {
    inqrDtStrt: startDate,
    inqrDtEnd: endDate,
  });

  const normalized = records.map(r => normalizeRecord(r));
  log.info({ year, month, count: normalized.length }, '사업용 신용카드 매입 Protocol 스크래핑 완료');
  return buildResult('business_card_purchase', normalized, year, month);
}
