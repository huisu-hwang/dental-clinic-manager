import { scrapeTaxInvoiceSales, scrapeTaxInvoicePurchase } from './taxInvoiceScraper.js';
import { scrapeCashReceiptSales, scrapeCashReceiptPurchase } from './cashReceiptScraper.js';
import { scrapeBusinessCardPurchase } from './businessCardScraper.js';
import { scrapeCreditCardSales } from './creditCardSalesScraper.js';
/** 데이터 타입별 스크래퍼 매핑 */
const SCRAPER_MAP = {
    tax_invoice_sales: scrapeTaxInvoiceSales,
    tax_invoice_purchase: scrapeTaxInvoicePurchase,
    cash_receipt_sales: scrapeCashReceiptSales,
    cash_receipt_purchase: scrapeCashReceiptPurchase,
    business_card_purchase: scrapeBusinessCardPurchase,
    credit_card_sales: scrapeCreditCardSales,
};
/** 지정된 데이터 타입의 스크래퍼 실행 */
export async function runScraper(context, dataType, year, month) {
    const scraper = SCRAPER_MAP[dataType];
    if (!scraper) {
        throw new Error(`지원하지 않는 데이터 타입: ${dataType}`);
    }
    return scraper(context, year, month);
}
//# sourceMappingURL=index.js.map