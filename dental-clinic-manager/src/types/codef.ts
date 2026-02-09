// ============================================
// 코드에프 (CODEF) API 타입 정의
// Created: 2026-02-06
// Updated: 2026-02-09 - PDF 문서 기반 전면 수정
// ============================================

// 서비스 타입
export enum CodefServiceType {
  PRODUCT = 0,    // 정식
  DEMO = 1,       // 데모
  SANDBOX = 2,    // 샌드박스
}

// 기관 코드
export const CODEF_ORGANIZATION = {
  HOMETAX: '0002',         // 국세청 홈택스 (세금계산서)
  CASH_RECEIPT: '0003',    // 국세청 현금영수증
  CREDIT_CARD_SALES: '0006', // 국세청 신용카드 매출
} as const;

// API 엔드포인트 (PDF 문서 기반 정확한 경로)
export const CODEF_ENDPOINTS = {
  // 전자세금계산서 기간별 매출/매입 통계 (#아이디, #공동인증서, #금융인증서, #추가인증, #간편인증)
  TAX_INVOICE_STATISTICS: '/v1/kr/public/nt/tax-invoice/sales-purchase-statistics',

  // 현금영수증 매입내역 (#아이디, #공동인증서, #추가인증, #간편인증)
  CASH_RECEIPT_PURCHASE: '/v1/kr/public/nt/cash-receipt/purchase-details',

  // 현금영수증 매출내역 (#아이디, #공동인증서, #금융인증서, #추가인증, #간편인증)
  CASH_RECEIPT_SALES: '/v1/kr/public/nt/cash-receipt/sales-details',

  // 신용카드 매출자료 조회 (#공동인증서 전용 - 인증서 필요)
  CREDIT_CARD_SALES: '/v1/kr/public/nt/tax-payment/credit-card-sales-data-list',

  // 승인내역 (#connectedId - 카드사별 별도 연결 필요)
  CARD_APPROVAL: '/v1/kr/card/p/account/approval-list',

  // 계정 관리
  ACCOUNT_CREATE: '/v1/account/create',
  ACCOUNT_ADD: '/v1/account/add',
  ACCOUNT_UPDATE: '/v1/account/update',
  ACCOUNT_DELETE: '/v1/account/delete',
  ACCOUNT_LIST: '/v1/account/list',
} as const;

// ============================================
// CODEF 공통 타입
// ============================================

export interface CodefApiResponse<T = unknown> {
  result: {
    code: string;               // CF-00000: 성공
    extraMessage: string;
    message: string;
    transactionId: string;
  };
  data: T;
}

export interface CodefAccountCreateResponse {
  result: {
    code: string;
    extraMessage: string;
    message: string;
    transactionId: string;
  };
  data: {
    connectedId: string;
    accountList: Array<{
      organization: string;
      loginType: string;
      id: string;
    }>;
  };
}

// ============================================
// 전자세금계산서 기간별 매출/매입 통계
// Endpoint: /v1/kr/public/nt/tax-invoice/sales-purchase-statistics
// Organization: 0002
// ============================================

export interface TaxInvoiceStatisticsItem {
  resType: string;              // "0": 매출, "1": 매입
  resYearMonth: string;         // 발급월별/분기별/년도별 텍스트 (ex. "2022/01", "2022년 1기 예정")
  resPartnerCnt: string;        // 총거래처수
  resNumber: string;            // 총매수
  resSupplyValue: string;       // 총공급가액
  resTaxAmt?: string;           // 총세액 (inquiryType="01"인 경우만)
  resPartnerSpecList?: TaxInvoicePartnerSpec[]; // type="1"인 경우 제공
}

export interface TaxInvoicePartnerSpec {
  resCompanyIdentityNo: string; // 거래처사업자번호
  resCompanyNm: string;         // 상호(사업장명)
  resNumber: string;            // 발급건수
  resSupplyValue: string;       // 공급가액
  resTaxAmt?: string;           // 세액
}

// ============================================
// 현금영수증 매입내역
// Endpoint: /v1/kr/public/nt/cash-receipt/purchase-details
// Organization: 0003
// ============================================

export interface CashReceiptPurchaseItem {
  resUserNm: string;            // 성명 (사용자명)
  resCompanyNm?: string;        // 상호(사업장명)
  resCompanyIdentityNo: string; // 사업자등록번호
  resUsedDate: string;          // 매입일자 (YYYYMMDD)
  resUsedTime: string;          // 매입일시 (HHmmss)
  resTransTypeNm: string;       // 거래구분 (승인거래, 취소거래 등)
  resDeductDescription: string; // 공제여부 (공제, 불공제)
  resMemberStoreName?: string;  // 가맹점명
  resApprovalNo: string;        // 승인번호
  resMemberStoreCorpNo: string; // 가맹점 사업자번호
  resSupplyValue: string;       // 공급가액
  resVAT: string;               // 부가세
  resTip: string;               // 봉사료
  resIDMeans: string;           // 신분확인 수단 (발급수단)
  resTotalAmount: string;       // 합계금액 (매입금액)
  commStartDate: string;        // 시작일자
  commEndDate: string;          // 종료일자
}

// ============================================
// 현금영수증 매출내역
// Endpoint: /v1/kr/public/nt/cash-receipt/sales-details
// Organization: 0003
// ============================================

export interface CashReceiptSalesItem {
  resUsedDate: string;          // 매출일자 (YYYYMMDD)
  resUsedTime: string;          // 매출일시 (HHmmss)
  resTransTypeNm: string;       // 거래구분
  resIssueType: string;         // 발행구분
  resApprovalNo: string;        // 승인번호
  resSupplyValue: string;       // 공급가액
  resVAT: string;               // 부가세
  resTip: string;               // 봉사료
  resIDMeans: string;           // 신분확인 수단 (발급수단)
  resTotalAmount: string;       // 합계금액 (총금액)
  resCompanyIdentityNo: string; // 사업자등록번호
  resCompanyNm: string;         // 상호(사업장명)
  commStartDate: string;        // 시작일자
  commEndDate: string;          // 종료일자
  resUseType?: string;          // 용도구분 (ex. "소비자소득공제용")
  resNote?: string;             // 비고 (ex. "일반거래")
}

// ============================================
// 신용카드 매출자료 조회 (공동인증서 전용)
// Endpoint: /v1/kr/public/nt/tax-payment/credit-card-sales-data-list
// Organization: 0006
// ============================================

export interface CreditCardSalesHistoryItem {
  resYearMonth: string;         // 승인년월 YYYYMM
  resCount: string;             // 건수(통수)
  resTotalAmount: string;       // 합계금액 (매출액계)
  resPaymentAmt: string;       // 결제금액 (신용카드 결제)
  resPaymentAmt1: string;       // 결제금액1 (구매전용카드 결제)
  resCashBack: string;          // 봉사료
}

export interface CreditCardSalesTotalItem {
  resQuarter: string;           // 승인분기
  resType: string;              // 자료구분
  resCount: string;             // 건수(통수)
  resTotalAmount: string;       // 합계금액 (매출액계)
}

export interface CreditCardSalesData {
  resSalesHistoryList: CreditCardSalesHistoryItem[];  // 신용카드/제로페이 매출 자료
  resTotalList: CreditCardSalesTotalItem[];            // 매출자료구분별 합계
  resSalesHistoryList1: Array<{                        // 판매(결제)대행 매출자료
    resYearMonth: string;
    resCount: string;
    resSalesAmount: string;
    resCompanyNm: string;
  }>;
}

// ============================================
// 카드 승인내역 (#connectedId)
// Endpoint: /v1/kr/card/p/account/approval-list
// ============================================

export interface CardApprovalItem {
  resUsedDate: string;          // 사용일자 (YYYYMMDD)
  resUsedTime: string;          // 사용일시
  resCardNo: string;            // 카드번호 (마스킹)
  resCardNo1?: string;          // 카드번호1
  resCardName: string;          // 카드명
  resMemberStoreName: string;   // 가맹점명
  resUsedAmount: string;        // 이용금액
  resPaymentType: string;       // 결제방법 ("1":일시불, "2":할부, "3":그외)
  resInstallmentMonth?: string; // 할부개월
  resApprovalNo: string;        // 승인번호
  resPaymentDueDate?: string;   // 결제예정일
  resHomeForeignType: string;   // 국내/외 구분 ("1":국내, "2":해외)
  resMemberStoreCorpNo?: string; // 가맹점 사업자번호
  resMemberStoreType?: string;  // 가맹점 업종
  resMemberStoreTelNo?: string; // 가맹점 전화번호
  resMemberStoreAddr?: string;  // 가맹점 주소
  resMemberStoreNo?: string;    // 가맹점번호
  resCancelYN: string;          // 취소여부 ("0":정상, "1":취소, "2":부분취소, "3":거절)
  resCancelAmount?: string;     // 취소금액
  resVAT?: string;              // 부가세
  resCashBack?: string;         // 봉사료
  resKRWAmt?: string;           // 원화금액
  resAccountCurrency: string;   // 통화코드 (KRW, JPY, USD, EUR)
  commStartDate: string;        // 시작일자
  commEndDate: string;          // 종료일자
}

// ============================================
// 하위 호환성 유지를 위한 레거시 타입
// ============================================

// 기존 코드에서 사용하던 타입 - TaxInvoiceItem 매핑
export interface TaxInvoiceItem {
  issueId: string;
  issueDate: string;
  sendDate: string;
  supplierCorpNum: string;
  supplierCorpName: string;
  supplierCeoName: string;
  buyerCorpNum: string;
  buyerCorpName: string;
  buyerCeoName: string;
  totalAmount: string;
  taxAmount: string;
  grandTotal: string;
  itemName: string;
  invoiceType: string;
  chargeDirection: string;
}

// 기존 CashReceiptItem - 하위 호환성
export interface CashReceiptItem {
  tradeDate: string;
  tradeTime: string;
  franchiseeName: string;
  franchiseeRegNumber: string;
  totalAmount: string;
  supplyAmount: string;
  taxAmount: string;
  serviceAmount: string;
  approvalNumber: string;
  tradeType: string;
}

// 기존 BusinessCardItem - 하위 호환성
export interface BusinessCardItem {
  cardNo: string;
  cardCompany: string;
  useDate: string;
  useTime: string;
  merchantName: string;
  merchantRegNumber: string;
  totalAmount: string;
  approvalNumber: string;
  approvalStatus: string;
}

// ============================================
// 설정 및 기타 타입
// ============================================

export interface CodefConfig {
  clientId: string;
  clientSecret: string;
  publicKey: string;
  serviceType: CodefServiceType;
}

export interface HometaxConnectionConfig {
  connectedId: string | null;
  userId: string;
  isConnected: boolean;
  lastSyncDate: string | null;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  errorMessage: string | null;
}

export interface SyncResult {
  success: boolean;
  syncedCount: {
    taxInvoiceSales: number;
    taxInvoicePurchase: number;
    cashReceiptSales: number;
    cashReceiptPurchase: number;
  };
  errors: string[];
  syncDate: string;
}

export interface CodefSyncRecord {
  id: string;
  clinic_id: string;
  year: number;
  month: number;
  sync_type: string;
  tax_invoice_sales_count: number;
  tax_invoice_purchase_count: number;
  cash_receipt_sales_count: number;
  cash_receipt_purchase_count: number;
  total_synced: number;
  errors: string[];
  synced_at: string;
}
