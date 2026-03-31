import { HttpSession } from '../../types/scrapingContext.js';
import { ScrapeResult } from '../../hometax/scrapers/baseScraper.js';
import { queryAllPages, buildPeriodParams, parseAmount, buildResult } from './baseProtocolScraper.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('taxInvoiceProtocol');

// 홈택스 전자세금계산서 API 경로
const TAX_INVOICE_SALES_ACTION = '/hometax-api/v1/tax-invoice/sales';
const TAX_INVOICE_PURCHASE_ACTION = '/hometax-api/v1/tax-invoice/purchase';

/** 세금계산서 레코드 정규화 */
function normalizeRecord(raw: Record<string, unknown>, type: 'sales' | 'purchase'): Record<string, unknown> {
  return {
    type,
    issue_date: raw.issDt || raw.iss_dt || raw.issueDate || '',
    supplier_name: type === 'purchase' ? (raw.splrNm || raw.supplier_name || '') : '',
    supplier_biz_no: type === 'purchase' ? (raw.splrTin || raw.supplier_biz_no || '') : '',
    buyer_name: type === 'sales' ? (raw.dmnrNm || raw.buyer_name || '') : '',
    buyer_biz_no: type === 'sales' ? (raw.dmnrTin || raw.buyer_biz_no || '') : '',
    supply_amount: parseAmount(raw.splCft || raw.supplyAmount || raw.supply_amount || 0),
    tax_amount: parseAmount(raw.txamt || raw.taxAmount || raw.tax_amount || 0),
    total_amount: parseAmount(raw.totAmt || raw.totalAmount || raw.total_amount || 0),
    invoice_type: raw.etxivKndCd || raw.invoiceType || '일반',
    status: raw.etxivClsfCd || raw.status || '',
  };
}

/** 세금계산서 매출 (Protocol) */
export async function scrapeTaxInvoiceSalesProtocol(
  session: HttpSession,
  year: number,
  month: number,
): Promise<ScrapeResult> {
  log.info({ year, month }, '세금계산서 매출 Protocol 스크래핑 시작');

  const { startDate, endDate } = buildPeriodParams(year, month);
  const records = await queryAllPages(session, TAX_INVOICE_SALES_ACTION, {
    inqrDtStrt: startDate,
    inqrDtEnd: endDate,
    splrTin: '', // 사업자번호 (빈값=전체)
    etxivClsfCd: '', // 분류코드 (빈값=전체)
  });

  const normalized = records.map(r => normalizeRecord(r, 'sales'));
  log.info({ year, month, count: normalized.length }, '세금계산서 매출 Protocol 스크래핑 완료');
  return buildResult('tax_invoice_sales', normalized, year, month);
}

/** 세금계산서 매입 (Protocol) */
export async function scrapeTaxInvoicePurchaseProtocol(
  session: HttpSession,
  year: number,
  month: number,
): Promise<ScrapeResult> {
  log.info({ year, month }, '세금계산서 매입 Protocol 스크래핑 시작');

  const { startDate, endDate } = buildPeriodParams(year, month);
  const records = await queryAllPages(session, TAX_INVOICE_PURCHASE_ACTION, {
    inqrDtStrt: startDate,
    inqrDtEnd: endDate,
    dmnrTin: '',
    etxivClsfCd: '',
  });

  const normalized = records.map(r => normalizeRecord(r, 'purchase'));
  log.info({ year, month, count: normalized.length }, '세금계산서 매입 Protocol 스크래핑 완료');
  return buildResult('tax_invoice_purchase', normalized, year, month);
}
