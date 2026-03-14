import { scrapeTaxInvoiceSalesProtocol, scrapeTaxInvoicePurchaseProtocol } from './taxInvoiceProtocol.js';
import { scrapeCashReceiptSalesProtocol, scrapeCashReceiptPurchaseProtocol } from './cashReceiptProtocol.js';
import { scrapeBusinessCardPurchaseProtocol } from './businessCardProtocol.js';
import { scrapeCreditCardSalesProtocol } from './creditCardSalesProtocol.js';
const PROTOCOL_SCRAPER_MAP = {
    tax_invoice_sales: scrapeTaxInvoiceSalesProtocol,
    tax_invoice_purchase: scrapeTaxInvoicePurchaseProtocol,
    cash_receipt_sales: scrapeCashReceiptSalesProtocol,
    cash_receipt_purchase: scrapeCashReceiptPurchaseProtocol,
    business_card_purchase: scrapeBusinessCardPurchaseProtocol,
    credit_card_sales: scrapeCreditCardSalesProtocol,
};
/** Protocol 모드 스크래퍼 실행 */
export async function runProtocolScraper(session, dataType, year, month) {
    const scraper = PROTOCOL_SCRAPER_MAP[dataType];
    if (!scraper) {
        throw new Error(`지원하지 않는 데이터 타입 (protocol): ${dataType}`);
    }
    return scraper(session, year, month);
}
//# sourceMappingURL=index.js.map