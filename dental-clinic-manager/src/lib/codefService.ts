// ============================================
// 코드에프 (CODEF) API 서비스
// Created: 2026-02-06
// ============================================

import {
  CodefServiceType,
  CodefConfig,
  CodefApiResponse,
  CodefAccountCreateResponse,
  TaxInvoiceListRequest,
  TaxInvoiceListResponse,
  TaxInvoiceItem,
  CashReceiptListRequest,
  CashReceiptListResponse,
  CashReceiptItem,
  BusinessCardRequest,
  BusinessCardResponse,
  BusinessCardItem,
  SyncResult,
  CODEF_ENDPOINTS,
  CODEF_ORGANIZATION,
} from '@/types/codef';

// CODEF API 환경별 URL
const CODEF_API_URL = {
  [CodefServiceType.SANDBOX]: 'https://sandbox.codef.io',
  [CodefServiceType.DEMO]: 'https://development.codef.io',
  [CodefServiceType.PRODUCT]: 'https://api.codef.io',
};

const CODEF_OAUTH_URL = 'https://oauth.codef.io/oauth/token';

// 환경변수에서 설정 로드
const getCodefConfig = (): CodefConfig => {
  const serviceTypeEnv = process.env.CODEF_SERVICE_TYPE || 'SANDBOX';
  let serviceType: CodefServiceType;

  switch (serviceTypeEnv.toUpperCase()) {
    case 'PRODUCT':
      serviceType = CodefServiceType.PRODUCT;
      break;
    case 'DEMO':
      serviceType = CodefServiceType.DEMO;
      break;
    default:
      serviceType = CodefServiceType.SANDBOX;
  }

  return {
    clientId: process.env.CODEF_CLIENT_ID || '',
    clientSecret: process.env.CODEF_CLIENT_SECRET || '',
    publicKey: process.env.CODEF_PUBLIC_KEY || '',
    serviceType,
  };
};

// 토큰 캐시
let accessTokenCache: {
  token: string;
  expiresAt: number;
} | null = null;

/**
 * CODEF Access Token 발급
 */
async function getAccessToken(): Promise<string> {
  const config = getCodefConfig();

  // 캐시된 토큰이 유효하면 재사용
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) {
    return accessTokenCache.token;
  }

  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`
  ).toString('base64');

  const response = await fetch(CODEF_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials&scope=read',
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.statusText}`);
  }

  const data = await response.json();

  // 토큰 캐시 (만료 5분 전까지)
  accessTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  return data.access_token;
}

/**
 * RSA 공개키로 데이터 암호화
 */
async function encryptRSA(plainText: string): Promise<string> {
  const config = getCodefConfig();

  if (!config.publicKey) {
    throw new Error('CODEF public key is not configured');
  }

  // Node.js crypto를 사용한 RSA 암호화
  const crypto = await import('crypto');
  const publicKey = `-----BEGIN PUBLIC KEY-----\n${config.publicKey}\n-----END PUBLIC KEY-----`;

  const encrypted = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(plainText, 'utf8')
  );

  return encrypted.toString('base64');
}

/**
 * CODEF API 호출
 */
async function callCodefApi<T>(
  endpoint: string,
  params: object
): Promise<CodefApiResponse<T>> {
  const config = getCodefConfig();
  const token = await getAccessToken();
  const baseUrl = CODEF_API_URL[config.serviceType];

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`CODEF API error: ${response.statusText}`);
  }

  const result = await response.json();

  // Base64 디코딩 (CODEF는 응답을 Base64로 인코딩)
  if (typeof result === 'string') {
    const decoded = Buffer.from(result, 'base64').toString('utf8');
    return JSON.parse(decoded);
  }

  return result;
}

// ============================================
// 계정 관리 API
// ============================================

/**
 * CODEF 계정 등록 (Connected ID 발급)
 * @param userId 홈택스 부서사용자 ID
 * @param password 홈택스 부서사용자 비밀번호
 * @param identity 대표자 주민등록번호 앞 6자리 (YYMMDD) 또는 사업자등록번호 (10자리)
 */
export async function createCodefAccount(
  userId: string,
  password: string,
  identity?: string
): Promise<CodefApiResponse<CodefAccountCreateResponse['data']>> {
  const encryptedPassword = await encryptRSA(password);

  const accountInfo: Record<string, string> = {
    countryCode: 'KR',
    businessType: 'NT',  // 공공기관
    clientType: 'B',     // 사업자
    organization: CODEF_ORGANIZATION.HOMETAX,
    loginType: '1',      // ID/PW 로그인
    id: userId,
    password: encryptedPassword,
  };

  // identity 파라미터 추가 (홈택스 로그인 시 필요할 수 있음)
  if (identity) {
    accountInfo.identity = identity;
  }

  const params = {
    accountList: [accountInfo],
  };

  return callCodefApi(CODEF_ENDPOINTS.ACCOUNT_CREATE, params);
}

/**
 * CODEF 계정 추가
 */
export async function addCodefAccount(
  connectedId: string,
  userId: string,
  password: string,
  identity?: string
): Promise<CodefApiResponse<CodefAccountCreateResponse['data']>> {
  const encryptedPassword = await encryptRSA(password);

  const accountInfo: Record<string, string> = {
    countryCode: 'KR',
    businessType: 'NT',
    clientType: 'B',
    organization: CODEF_ORGANIZATION.HOMETAX,
    loginType: '1',
    id: userId,
    password: encryptedPassword,
  };

  if (identity) {
    accountInfo.identity = identity;
  }

  const params = {
    connectedId,
    accountList: [accountInfo],
  };

  return callCodefApi(CODEF_ENDPOINTS.ACCOUNT_ADD, params);
}

/**
 * CODEF 계정 삭제
 */
export async function deleteCodefAccount(
  connectedId: string
): Promise<CodefApiResponse<unknown>> {
  const params = {
    connectedId,
    accountList: [
      {
        countryCode: 'KR',
        businessType: 'NT',
        clientType: 'B',
        organization: CODEF_ORGANIZATION.HOMETAX,
        loginType: '1',
      },
    ],
  };

  return callCodefApi(CODEF_ENDPOINTS.ACCOUNT_DELETE, params);
}

// ============================================
// 세금계산서 조회 API
// ============================================

/**
 * 매출 세금계산서 조회
 */
export async function getTaxInvoiceSales(
  connectedId: string,
  startDate: string,
  endDate: string
): Promise<TaxInvoiceItem[]> {
  const params: TaxInvoiceListRequest = {
    connectedId,
    organization: CODEF_ORGANIZATION.HOMETAX,
    inquiryType: '01',  // 매출
    startDate: startDate.replace(/-/g, ''),
    endDate: endDate.replace(/-/g, ''),
  };

  const response = await callCodefApi<TaxInvoiceListResponse>(
    CODEF_ENDPOINTS.TAX_INVOICE_SALES,
    params
  );

  if (response.result.code !== 'CF-00000') {
    console.error('Tax invoice sales error:', response.result);
    return [];
  }

  return response.data?.resTaxInvoiceList || [];
}

/**
 * 매입 세금계산서 조회
 */
export async function getTaxInvoicePurchase(
  connectedId: string,
  startDate: string,
  endDate: string
): Promise<TaxInvoiceItem[]> {
  const params: TaxInvoiceListRequest = {
    connectedId,
    organization: CODEF_ORGANIZATION.HOMETAX,
    inquiryType: '02',  // 매입
    startDate: startDate.replace(/-/g, ''),
    endDate: endDate.replace(/-/g, ''),
  };

  const response = await callCodefApi<TaxInvoiceListResponse>(
    CODEF_ENDPOINTS.TAX_INVOICE_PURCHASE,
    params
  );

  if (response.result.code !== 'CF-00000') {
    console.error('Tax invoice purchase error:', response.result);
    return [];
  }

  return response.data?.resTaxInvoiceList || [];
}

// ============================================
// 현금영수증 조회 API
// ============================================

/**
 * 매출 현금영수증 조회
 */
export async function getCashReceiptSales(
  connectedId: string,
  startDate: string,
  endDate: string
): Promise<CashReceiptItem[]> {
  const params: CashReceiptListRequest = {
    connectedId,
    organization: CODEF_ORGANIZATION.HOMETAX,
    inquiryType: '01',  // 매출
    startDate: startDate.replace(/-/g, ''),
    endDate: endDate.replace(/-/g, ''),
  };

  const response = await callCodefApi<CashReceiptListResponse>(
    CODEF_ENDPOINTS.CASH_RECEIPT_SALES,
    params
  );

  if (response.result.code !== 'CF-00000') {
    console.error('Cash receipt sales error:', response.result);
    return [];
  }

  return response.data?.resCashReceiptList || [];
}

/**
 * 매입 현금영수증 조회
 */
export async function getCashReceiptPurchase(
  connectedId: string,
  startDate: string,
  endDate: string
): Promise<CashReceiptItem[]> {
  const params: CashReceiptListRequest = {
    connectedId,
    organization: CODEF_ORGANIZATION.HOMETAX,
    inquiryType: '02',  // 매입
    startDate: startDate.replace(/-/g, ''),
    endDate: endDate.replace(/-/g, ''),
  };

  const response = await callCodefApi<CashReceiptListResponse>(
    CODEF_ENDPOINTS.CASH_RECEIPT_PURCHASE,
    params
  );

  if (response.result.code !== 'CF-00000') {
    console.error('Cash receipt purchase error:', response.result);
    return [];
  }

  return response.data?.resCashReceiptList || [];
}

// ============================================
// 사업자카드 조회 API
// ============================================

/**
 * 사업자카드 사용내역 조회
 */
export async function getBusinessCardHistory(
  connectedId: string,
  startDate: string,
  endDate: string
): Promise<BusinessCardItem[]> {
  const params: BusinessCardRequest = {
    connectedId,
    organization: CODEF_ORGANIZATION.HOMETAX,
    startDate: startDate.replace(/-/g, ''),
    endDate: endDate.replace(/-/g, ''),
  };

  const response = await callCodefApi<BusinessCardResponse>(
    CODEF_ENDPOINTS.BUSINESS_CARD,
    params
  );

  if (response.result.code !== 'CF-00000') {
    console.error('Business card error:', response.result);
    return [];
  }

  return response.data?.resCardUseList || [];
}

// ============================================
// 통합 동기화 함수
// ============================================

/**
 * 홈택스 데이터 전체 동기화
 */
export async function syncHometaxData(
  connectedId: string,
  year: number,
  month: number
): Promise<SyncResult> {
  const errors: string[] = [];
  const syncedCount = {
    taxInvoiceSales: 0,
    taxInvoicePurchase: 0,
    cashReceiptSales: 0,
    cashReceiptPurchase: 0,
    businessCard: 0,
  };

  // 조회 기간 설정 (해당 월 전체)
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  try {
    // 1. 매출 세금계산서
    const taxInvoiceSales = await getTaxInvoiceSales(connectedId, startDate, endDate);
    syncedCount.taxInvoiceSales = taxInvoiceSales.length;
  } catch (error) {
    errors.push(`매출 세금계산서 조회 실패: ${error}`);
  }

  try {
    // 2. 매입 세금계산서
    const taxInvoicePurchase = await getTaxInvoicePurchase(connectedId, startDate, endDate);
    syncedCount.taxInvoicePurchase = taxInvoicePurchase.length;
  } catch (error) {
    errors.push(`매입 세금계산서 조회 실패: ${error}`);
  }

  try {
    // 3. 매출 현금영수증
    const cashReceiptSales = await getCashReceiptSales(connectedId, startDate, endDate);
    syncedCount.cashReceiptSales = cashReceiptSales.length;
  } catch (error) {
    errors.push(`매출 현금영수증 조회 실패: ${error}`);
  }

  try {
    // 4. 매입 현금영수증
    const cashReceiptPurchase = await getCashReceiptPurchase(connectedId, startDate, endDate);
    syncedCount.cashReceiptPurchase = cashReceiptPurchase.length;
  } catch (error) {
    errors.push(`매입 현금영수증 조회 실패: ${error}`);
  }

  try {
    // 5. 사업자카드 사용내역
    const businessCard = await getBusinessCardHistory(connectedId, startDate, endDate);
    syncedCount.businessCard = businessCard.length;
  } catch (error) {
    errors.push(`사업자카드 내역 조회 실패: ${error}`);
  }

  return {
    success: errors.length === 0,
    syncedCount,
    errors,
    syncDate: new Date().toISOString(),
  };
}

/**
 * 세금계산서를 지출 데이터로 변환
 */
export function convertTaxInvoiceToExpense(
  invoice: TaxInvoiceItem,
  categoryId: string
): {
  amount: number;
  description: string;
  vendor_name: string;
  has_tax_invoice: boolean;
  tax_invoice_number: string;
  tax_invoice_date: string;
  is_hometax_synced: boolean;
} {
  return {
    amount: parseInt(invoice.grandTotal, 10) || 0,
    description: invoice.itemName || '세금계산서',
    vendor_name: invoice.supplierCorpName,
    has_tax_invoice: true,
    tax_invoice_number: invoice.issueId,
    tax_invoice_date: formatCodefDate(invoice.issueDate),
    is_hometax_synced: true,
  };
}

/**
 * 현금영수증을 지출 데이터로 변환
 */
export function convertCashReceiptToExpense(
  receipt: CashReceiptItem,
  categoryId: string
): {
  amount: number;
  description: string;
  vendor_name: string;
  is_hometax_synced: boolean;
} {
  return {
    amount: parseInt(receipt.totalAmount, 10) || 0,
    description: `현금영수증 - ${receipt.approvalNumber}`,
    vendor_name: receipt.franchiseeName,
    is_hometax_synced: true,
  };
}

/**
 * 사업자카드 내역을 지출 데이터로 변환
 */
export function convertBusinessCardToExpense(
  card: BusinessCardItem,
  categoryId: string
): {
  amount: number;
  description: string;
  vendor_name: string;
  payment_method: 'card';
  is_business_card: boolean;
  is_hometax_synced: boolean;
} {
  return {
    amount: parseInt(card.totalAmount, 10) || 0,
    description: `사업자카드 - ${card.approvalNumber}`,
    vendor_name: card.merchantName,
    payment_method: 'card',
    is_business_card: true,
    is_hometax_synced: true,
  };
}

// 유틸리티 함수
function formatCodefDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return '';
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

/**
 * CODEF 설정 확인
 */
export function isCodefConfigured(): boolean {
  const config = getCodefConfig();
  return !!(config.clientId && config.clientSecret && config.publicKey);
}

/**
 * CODEF 서비스 타입 반환
 */
export function getCodefServiceType(): string {
  const config = getCodefConfig();
  switch (config.serviceType) {
    case CodefServiceType.PRODUCT:
      return '정식';
    case CodefServiceType.DEMO:
      return '데모';
    default:
      return '샌드박스';
  }
}
