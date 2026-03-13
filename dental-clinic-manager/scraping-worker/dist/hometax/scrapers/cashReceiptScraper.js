import { withPage, navigateToMenu, setPeriod, clickSearchAndWait, scrapeAllPages } from './baseScraper.js';
import { createChildLogger } from '../../utils/logger.js';
const log = createChildLogger('cashReceiptScraper');
// 홈택스 현금영수증 메뉴 경로
const CASH_RECEIPT_SALES_MENU = '/ui/pp/agdab/a/EtsaadAMain.xml';
const CASH_RECEIPT_PURCHASE_MENU = '/ui/pp/ageab/a/EtsaaeAMain.xml';
function normalizeRecord(raw, type) {
    const values = Object.values(raw);
    return {
        type,
        trade_date: values[0] || '',
        trade_time: values[1] || '',
        store_name: values[2] || '',
        store_biz_no: values[3] || '',
        supply_amount: parseAmount(values[4]),
        vat: parseAmount(values[5]),
        total_amount: parseAmount(values[6]),
        approval_no: values[7] || '',
        deductible: type === 'purchase',
    };
}
function parseAmount(value) {
    if (typeof value === 'number')
        return value;
    if (typeof value === 'string') {
        return parseInt(value.replace(/[,원\s]/g, ''), 10) || 0;
    }
    return 0;
}
/** 현금영수증 매출 스크래핑 */
export async function scrapeCashReceiptSales(context, year, month) {
    log.info({ year, month }, '현금영수증 매출 스크래핑 시작');
    const records = await withPage(context, async (page) => {
        await navigateToMenu(page, CASH_RECEIPT_SALES_MENU);
        await setPeriod(page, year, month);
        await clickSearchAndWait(page);
        return scrapeAllPages(page);
    });
    const normalized = records.map(r => normalizeRecord(r, 'sales'));
    log.info({ year, month, count: normalized.length }, '현금영수증 매출 스크래핑 완료');
    return {
        dataType: 'cash_receipt_sales',
        records: normalized,
        totalCount: normalized.length,
        scrapedAt: new Date().toISOString(),
        period: { year, month },
    };
}
/** 현금영수증 매입 스크래핑 */
export async function scrapeCashReceiptPurchase(context, year, month) {
    log.info({ year, month }, '현금영수증 매입 스크래핑 시작');
    const records = await withPage(context, async (page) => {
        await navigateToMenu(page, CASH_RECEIPT_PURCHASE_MENU);
        await setPeriod(page, year, month);
        await clickSearchAndWait(page);
        return scrapeAllPages(page);
    });
    const normalized = records.map(r => normalizeRecord(r, 'purchase'));
    log.info({ year, month, count: normalized.length }, '현금영수증 매입 스크래핑 완료');
    return {
        dataType: 'cash_receipt_purchase',
        records: normalized,
        totalCount: normalized.length,
        scrapedAt: new Date().toISOString(),
        period: { year, month },
    };
}
//# sourceMappingURL=cashReceiptScraper.js.map