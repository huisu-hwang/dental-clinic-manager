import { withPage, navigateToMenu, setPeriod, clickSearchAndWait, scrapeAllPages } from './baseScraper.js';
import { createChildLogger } from '../../utils/logger.js';
const log = createChildLogger('taxInvoiceScraper');
// 홈택스 전자세금계산서 메뉴 경로
const TAX_INVOICE_SALES_MENU = '/ui/pp/agaab/a/EtsaabAMain.xml';
const TAX_INVOICE_PURCHASE_MENU = '/ui/pp/agbab/a/EtsbabAMain.xml';
/** 세금계산서 레코드 정규화 */
function normalizeRecord(raw, type) {
    const values = Object.values(raw);
    return {
        type,
        issue_date: values[0] || '',
        supplier_name: type === 'sales' ? '' : (values[1] || ''),
        supplier_biz_no: type === 'sales' ? '' : (values[2] || ''),
        buyer_name: type === 'purchase' ? '' : (values[1] || ''),
        buyer_biz_no: type === 'purchase' ? '' : (values[2] || ''),
        supply_amount: parseAmount(values[3]),
        tax_amount: parseAmount(values[4]),
        total_amount: parseAmount(values[5]),
        invoice_type: values[6] || '일반',
        status: values[7] || '',
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
/** 세금계산서 매출 스크래핑 */
export async function scrapeTaxInvoiceSales(context, year, month) {
    log.info({ year, month }, '세금계산서 매출 스크래핑 시작');
    const records = await withPage(context, async (page) => {
        await navigateToMenu(page, TAX_INVOICE_SALES_MENU);
        await setPeriod(page, year, month);
        await clickSearchAndWait(page);
        return scrapeAllPages(page);
    });
    const normalized = records.map(r => normalizeRecord(r, 'sales'));
    log.info({ year, month, count: normalized.length }, '세금계산서 매출 스크래핑 완료');
    return {
        dataType: 'tax_invoice_sales',
        records: normalized,
        totalCount: normalized.length,
        scrapedAt: new Date().toISOString(),
        period: { year, month },
    };
}
/** 세금계산서 매입 스크래핑 */
export async function scrapeTaxInvoicePurchase(context, year, month) {
    log.info({ year, month }, '세금계산서 매입 스크래핑 시작');
    const records = await withPage(context, async (page) => {
        await navigateToMenu(page, TAX_INVOICE_PURCHASE_MENU);
        await setPeriod(page, year, month);
        await clickSearchAndWait(page);
        return scrapeAllPages(page);
    });
    const normalized = records.map(r => normalizeRecord(r, 'purchase'));
    log.info({ year, month, count: normalized.length }, '세금계산서 매입 스크래핑 완료');
    return {
        dataType: 'tax_invoice_purchase',
        records: normalized,
        totalCount: normalized.length,
        scrapedAt: new Date().toISOString(),
        period: { year, month },
    };
}
//# sourceMappingURL=taxInvoiceScraper.js.map