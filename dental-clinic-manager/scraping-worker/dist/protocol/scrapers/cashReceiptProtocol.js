import { queryAllPages, buildPeriodParams, parseAmount, buildResult } from './baseProtocolScraper.js';
import { createChildLogger } from '../../utils/logger.js';
const log = createChildLogger('cashReceiptProtocol');
const CASH_RECEIPT_SALES_ACTION = '/hometax-api/v1/cash-receipt/sales';
const CASH_RECEIPT_PURCHASE_ACTION = '/hometax-api/v1/cash-receipt/purchase';
function normalizeRecord(raw, type) {
    return {
        type,
        trade_date: raw.trdDt || raw.trade_date || '',
        trade_time: raw.trdTm || raw.trade_time || '',
        store_name: raw.frNm || raw.store_name || '',
        store_biz_no: raw.frTin || raw.store_biz_no || '',
        supply_amount: parseAmount(raw.splCft || raw.supply_amount || 0),
        vat: parseAmount(raw.txamt || raw.vat || 0),
        total_amount: parseAmount(raw.totAmt || raw.total_amount || 0),
        approval_no: raw.aprvNo || raw.approval_no || '',
        deductible: type === 'purchase',
    };
}
/** 현금영수증 매출 (Protocol) */
export async function scrapeCashReceiptSalesProtocol(session, year, month) {
    log.info({ year, month }, '현금영수증 매출 Protocol 스크래핑 시작');
    const { startDate, endDate } = buildPeriodParams(year, month);
    const records = await queryAllPages(session, CASH_RECEIPT_SALES_ACTION, {
        inqrDtStrt: startDate,
        inqrDtEnd: endDate,
    });
    const normalized = records.map(r => normalizeRecord(r, 'sales'));
    log.info({ year, month, count: normalized.length }, '현금영수증 매출 Protocol 스크래핑 완료');
    return buildResult('cash_receipt_sales', normalized, year, month);
}
/** 현금영수증 매입 (Protocol) */
export async function scrapeCashReceiptPurchaseProtocol(session, year, month) {
    log.info({ year, month }, '현금영수증 매입 Protocol 스크래핑 시작');
    const { startDate, endDate } = buildPeriodParams(year, month);
    const records = await queryAllPages(session, CASH_RECEIPT_PURCHASE_ACTION, {
        inqrDtStrt: startDate,
        inqrDtEnd: endDate,
    });
    const normalized = records.map(r => normalizeRecord(r, 'purchase'));
    log.info({ year, month, count: normalized.length }, '현금영수증 매입 Protocol 스크래핑 완료');
    return buildResult('cash_receipt_purchase', normalized, year, month);
}
//# sourceMappingURL=cashReceiptProtocol.js.map