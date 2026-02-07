// ============================================
// 코드에프 (CODEF) API 타입 정의
// Created: 2026-02-06
// ============================================

// 서비스 타입
export enum CodefServiceType {
  PRODUCT = 0,    // 정식
  DEMO = 1,       // 데모
  SANDBOX = 2,    // 샌드박스
}

// 기관 코드
export const CODEF_ORGANIZATION = {
  HOMETAX: '0004',  // 국세청 홈택스 (공공기관)
} as const;

// API 엔드포인트
export const CODEF_ENDPOINTS = {
  // 홈택스 전자세금계산서
  TAX_INVOICE_SALES: '/v1/kr/public/nt/tax-invoice/sales',           // 매출 세금계산서
  TAX_INVOICE_PURCHASE: '/v1/kr/public/nt/tax-invoice/purchase',     // 매입 세금계산서
  TAX_INVOICE_LIST: '/v1/kr/public/nt/tax-invoice/list',             // 세금계산서 목록

  // 홈택스 현금영수증
  CASH_RECEIPT_SALES: '/v1/kr/public/nt/cash-receipt/sales',         // 매출 현금영수증
  CASH_RECEIPT_PURCHASE: '/v1/kr/public/nt/cash-receipt/purchase',   // 매입 현금영수증

  // 홈택스 사업자카드
  BUSINESS_CARD: '/v1/kr/public/nt/business-card/use-history',       // 사업자카드 사용내역

  // 계정 관리
  ACCOUNT_CREATE: '/v1/account/create',
  ACCOUNT_ADD: '/v1/account/add',
  ACCOUNT_UPDATE: '/v1/account/update',
  ACCOUNT_DELETE: '/v1/account/delete',
  ACCOUNT_LIST: '/v1/account/list',
} as const;

// CODEF 인증 타입
export type CodefAuthType = 'password' | 'cert';

// CODEF 계정 등록 요청
export interface CodefAccountCreateRequest {
  countryCode: string;          // 국가코드 (KR)
  businessType: string;         // 비즈니스 타입 (BK: 은행, CD: 카드, NT: 공공)
  clientType: string;           // 클라이언트 타입 (P: 개인, B: 사업자)
  organization: string;         // 기관코드
  loginType: string;            // 로그인 타입 (0: 인증서, 1: ID/PW)
  id: string;                   // 로그인 ID (홈택스 부서사용자 ID)
  password: string;             // 로그인 비밀번호 (암호화 필요)
  identity?: string;            // 주민등록번호 앞 6자리 또는 사업자등록번호 (YYMMDD or 10자리)
  birthDate?: string;           // 생년월일 (YYYYMMDD)
}

// CODEF 계정 등록 응답
export interface CodefAccountCreateResponse {
  result: {
    code: string;
    extraMessage: string;
    message: string;
    transactionId: string;
  };
  data: {
    connectedId: string;        // 연결 ID (이후 API 호출에 사용)
    accountList: Array<{
      organization: string;
      loginType: string;
      id: string;
    }>;
  };
}

// CODEF API 기본 응답
export interface CodefApiResponse<T = unknown> {
  result: {
    code: string;               // 결과 코드 (CF-00000: 성공)
    extraMessage: string;
    message: string;
    transactionId: string;
  };
  data: T;
}

// 세금계산서 조회 요청
export interface TaxInvoiceListRequest {
  connectedId: string;          // 연결 ID
  organization: string;         // 기관코드 (0002: 홈택스)
  inquiryType: string;          // 조회구분 (01: 매출, 02: 매입)
  startDate: string;            // 시작일자 (YYYYMMDD)
  endDate: string;              // 종료일자 (YYYYMMDD)
  supplierRegNumber?: string;   // 공급자 사업자번호
  buyerRegNumber?: string;      // 공급받는자 사업자번호
}

// 세금계산서 항목
export interface TaxInvoiceItem {
  issueId: string;              // 승인번호
  issueDate: string;            // 발급일자
  sendDate: string;             // 전송일자
  supplierCorpNum: string;      // 공급자 사업자번호
  supplierCorpName: string;     // 공급자 상호
  supplierCeoName: string;      // 공급자 대표자명
  buyerCorpNum: string;         // 공급받는자 사업자번호
  buyerCorpName: string;        // 공급받는자 상호
  buyerCeoName: string;         // 공급받는자 대표자명
  totalAmount: string;          // 공급가액
  taxAmount: string;            // 세액
  grandTotal: string;           // 합계금액
  itemName: string;             // 품목명
  invoiceType: string;          // 세금계산서 종류
  chargeDirection: string;      // 청구방향 (01: 청구, 02: 영수)
}

// 세금계산서 목록 응답
export interface TaxInvoiceListResponse {
  resInquiryType: string;
  resResultCount: string;
  resTaxInvoiceList: TaxInvoiceItem[];
}

// 현금영수증 조회 요청
export interface CashReceiptListRequest {
  connectedId: string;
  organization: string;
  inquiryType: string;          // 조회구분 (01: 매출, 02: 매입)
  startDate: string;
  endDate: string;
}

// 현금영수증 항목
export interface CashReceiptItem {
  tradeDate: string;            // 거래일자
  tradeTime: string;            // 거래시간
  franchiseeName: string;       // 가맹점명
  franchiseeRegNumber: string;  // 가맹점 사업자번호
  totalAmount: string;          // 총금액
  supplyAmount: string;         // 공급가액
  taxAmount: string;            // 부가세
  serviceAmount: string;        // 봉사료
  approvalNumber: string;       // 승인번호
  tradeType: string;            // 거래유형 (승인/취소)
}

// 현금영수증 목록 응답
export interface CashReceiptListResponse {
  resInquiryType: string;
  resResultCount: string;
  resCashReceiptList: CashReceiptItem[];
}

// 사업자카드 사용내역 요청
export interface BusinessCardRequest {
  connectedId: string;
  organization: string;
  startDate: string;
  endDate: string;
  cardNo?: string;              // 카드번호 (선택)
}

// 사업자카드 사용내역 항목
export interface BusinessCardItem {
  cardNo: string;               // 카드번호
  cardCompany: string;          // 카드사
  useDate: string;              // 사용일자
  useTime: string;              // 사용시간
  merchantName: string;         // 가맹점명
  merchantRegNumber: string;    // 가맹점 사업자번호
  totalAmount: string;          // 이용금액
  approvalNumber: string;       // 승인번호
  approvalStatus: string;       // 승인상태
}

// 사업자카드 사용내역 응답
export interface BusinessCardResponse {
  resResultCount: string;
  resCardUseList: BusinessCardItem[];
}

// CODEF 설정 인터페이스
export interface CodefConfig {
  clientId: string;
  clientSecret: string;
  publicKey: string;
  serviceType: CodefServiceType;
}

// 홈택스 연동 설정
export interface HometaxConnectionConfig {
  connectedId: string | null;   // CODEF 연결 ID
  userId: string;               // 홈택스 부서사용자 ID
  isConnected: boolean;
  lastSyncDate: string | null;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  errorMessage: string | null;
}

// 동기화 결과
export interface SyncResult {
  success: boolean;
  syncedCount: {
    taxInvoiceSales: number;
    taxInvoicePurchase: number;
    cashReceiptSales: number;
    cashReceiptPurchase: number;
    businessCard: number;
  };
  errors: string[];
  syncDate: string;
}

// 데이터베이스 저장용 타입
export interface CodefSyncRecord {
  id: string;
  clinic_id: string;
  connected_id: string;
  sync_type: 'tax_invoice' | 'cash_receipt' | 'business_card';
  sync_direction: 'sales' | 'purchase';
  start_date: string;
  end_date: string;
  synced_count: number;
  status: 'pending' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
