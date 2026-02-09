// ============================================
// 코드에프 (CODEF) API 서비스
// easycodef-node 라이브러리 사용 + node-forge RSA 암호화
// Created: 2026-02-06
// Updated: 2026-02-09 - PDF 문서 기반 엔드포인트/파라미터 전면 수정
// ============================================

import {
  CodefApiResponse,
  CodefAccountCreateResponse,
  TaxInvoiceStatisticsItem,
  CashReceiptPurchaseItem,
  CashReceiptSalesItem,
  SyncResult,
  CODEF_ORGANIZATION,
  CODEF_ENDPOINTS,
} from '@/types/codef';
import forge from 'node-forge';
import crypto from 'crypto';

// easycodef-node 라이브러리 동적 import
let EasyCodef: any = null;
let EasyCodefConstant: any = null;

async function loadEasyCodef() {
  if (!EasyCodef) {
    const easycodef = await import('easycodef-node');
    EasyCodef = easycodef.EasyCodef || (easycodef.default && easycodef.default.EasyCodef);
    EasyCodefConstant = easycodef.EasyCodefConstant || (easycodef.default && easycodef.default.EasyCodefConstant);
  }
  return { EasyCodef, EasyCodefConstant };
}

// ============================================
// 암호화 유틸리티
// ============================================

/**
 * node-forge를 사용한 RSA 암호화 (OpenSSL 3.0 호환)
 * CODEF API 전송용 비밀번호 암호화
 */
function encryptRSAWithForge(publicKeyBase64: string, plainText: string): string {
  let cleanKey = publicKeyBase64.replace(/[\s\n\r]/g, '');

  // SPKI 헤더 자동 수정
  if (cleanKey.includes('OCAQIIBCgK') && !cleanKey.includes('OCAQ8AMIIBCgK')) {
    cleanKey = cleanKey.replace('OCAQIIBCgK', 'OCAQ8AMIIBCgK');
    console.warn('CODEF: RSA 공개키 SPKI 헤더가 자동 수정되었습니다.');
  }

  if (cleanKey.length % 4 !== 0) {
    throw new Error(`RSA 공개키가 올바르지 않습니다. (base64 길이: ${cleanKey.length})`);
  }

  const formattedKey = cleanKey.match(/.{1,64}/g)?.join('\n') || cleanKey;
  const pemKey = '-----BEGIN PUBLIC KEY-----\n' + formattedKey + '\n-----END PUBLIC KEY-----';
  const publicKey = forge.pki.publicKeyFromPem(pemKey);
  const encrypted = publicKey.encrypt(plainText, 'RSAES-PKCS1-V1_5');
  return forge.util.encode64(encrypted);
}

/**
 * AES-256-GCM 암호화 (DB 저장용 비밀번호 암호화)
 */
export function encryptPasswordForStorage(plainText: string): string {
  const secret = process.env.CODEF_CLIENT_SECRET || 'default-secret-key-for-encryption';
  const key = crypto.scryptSync(secret, 'codef-pw-salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * AES-256-GCM 복호화 (DB에서 비밀번호 읽기)
 */
export function decryptPasswordFromStorage(encryptedText: string): string {
  const secret = process.env.CODEF_CLIENT_SECRET || 'default-secret-key-for-encryption';
  const key = crypto.scryptSync(secret, 'codef-pw-salt', 32);
  const [ivHex, authTagHex, encryptedData] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ============================================
// CODEF 설정
// ============================================

const getCodefConfig = () => {
  const serviceTypeEnv = (process.env.CODEF_SERVICE_TYPE || 'SANDBOX').trim().toUpperCase();
  let serviceType: number;
  switch (serviceTypeEnv) {
    case 'PRODUCT':
    case '0':
      serviceType = 0;
      break;
    case 'DEMO':
    case '1':
      serviceType = 1;
      break;
    default:
      serviceType = 2;
  }

  let clientId = (process.env.CODEF_CLIENT_ID || '').trim();
  let clientSecret = (process.env.CODEF_CLIENT_SECRET || '').trim();
  const publicKey = (process.env.CODEF_PUBLIC_KEY || '').trim();

  // CLIENT_SECRET 자동 수정: UUID 형식(36자) 뒤에 추가된 잘못된 문자 제거
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const uuidMatch = clientSecret.match(uuidPattern);
  if (uuidMatch && clientSecret.length > 36) {
    clientSecret = uuidMatch[0];
  }

  return { clientId, clientSecret, publicKey, serviceType };
};

async function createCodefInstance() {
  const { EasyCodef, EasyCodefConstant } = await loadEasyCodef();
  const config = getCodefConfig();

  if (!config.clientId || !config.clientSecret || !config.publicKey) {
    throw new Error('CODEF API 설정이 완료되지 않았습니다.');
  }

  const codef = new EasyCodef();
  codef.setPublicKey(config.publicKey);

  if (config.serviceType === 0) {
    codef.setClientInfo(config.clientId, config.clientSecret);
  } else {
    codef.setClientInfoForDemo(config.clientId, config.clientSecret);
  }

  return { codef, serviceType: config.serviceType };
}

async function getServiceTypeConstant(serviceType: number) {
  const { EasyCodefConstant } = await loadEasyCodef();
  switch (serviceType) {
    case 0: return EasyCodefConstant.SERVICE_TYPE_API;
    case 1: return EasyCodefConstant.SERVICE_TYPE_DEMO;
    default: return EasyCodefConstant.SERVICE_TYPE_SANDBOX;
  }
}

// ============================================
// 계정 관리 API
// ============================================

export async function getConnectedIdList(): Promise<CodefApiResponse<{ connectedIdList: string[] }>> {
  try {
    const { codef, serviceType } = await createCodefInstance();
    const serviceTypeConstant = await getServiceTypeConstant(serviceType);
    const response = await codef.getConnectedIdList(serviceTypeConstant, {});
    return typeof response === 'string' ? JSON.parse(response) : response;
  } catch (error: any) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('CODEF getConnectedIdList error:', errMsg);
    return {
      result: { code: 'CF-99999', extraMessage: '', message: errMsg, transactionId: '' },
      data: { connectedIdList: [] },
    };
  }
}

export async function createCodefAccount(
  userId: string, password: string, identity: string
): Promise<CodefApiResponse<CodefAccountCreateResponse['data']>> {
  try {
    const { codef, serviceType } = await createCodefInstance();
    const config = getCodefConfig();
    const serviceTypeConstant = await getServiceTypeConstant(serviceType);
    const encryptedPassword = encryptRSAWithForge(config.publicKey, password);

    const param = {
      accountList: [{
        countryCode: 'KR',
        businessType: 'NT',
        clientType: 'P',
        organization: CODEF_ORGANIZATION.HOMETAX,
        loginType: '1',
        id: userId,
        password: encryptedPassword,
        identity: identity,
      }],
    };

    const response = await codef.createAccount(serviceTypeConstant, param);
    return typeof response === 'string' ? JSON.parse(response) : response;
  } catch (error: any) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('CODEF createAccount error:', errMsg);
    return {
      result: { code: 'CF-99999', extraMessage: String(error?.stack || ''), message: errMsg, transactionId: '' },
      data: null as any,
    };
  }
}

export async function updateCodefAccount(
  connectedId: string, userId: string, password: string, identity: string
): Promise<CodefApiResponse<CodefAccountCreateResponse['data']>> {
  try {
    const { codef, serviceType } = await createCodefInstance();
    const config = getCodefConfig();
    const serviceTypeConstant = await getServiceTypeConstant(serviceType);
    const encryptedPassword = encryptRSAWithForge(config.publicKey, password);

    const param = {
      connectedId,
      accountList: [{
        countryCode: 'KR',
        businessType: 'NT',
        clientType: 'P',
        organization: CODEF_ORGANIZATION.HOMETAX,
        loginType: '1',
        id: userId,
        password: encryptedPassword,
        identity: identity,
      }],
    };

    const response = await codef.updateAccount(serviceTypeConstant, param);
    return typeof response === 'string' ? JSON.parse(response) : response;
  } catch (error: any) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('CODEF updateAccount error:', errMsg);
    return {
      result: { code: 'CF-99999', extraMessage: String(error?.stack || ''), message: errMsg, transactionId: '' },
      data: null as any,
    };
  }
}

export async function addCodefAccount(
  connectedId: string, userId: string, password: string, identity: string
): Promise<CodefApiResponse<CodefAccountCreateResponse['data']>> {
  try {
    const { codef, serviceType } = await createCodefInstance();
    const config = getCodefConfig();
    const serviceTypeConstant = await getServiceTypeConstant(serviceType);
    const encryptedPassword = encryptRSAWithForge(config.publicKey, password);

    const param = {
      connectedId,
      accountList: [{
        countryCode: 'KR',
        businessType: 'NT',
        clientType: 'P',
        organization: CODEF_ORGANIZATION.HOMETAX,
        loginType: '1',
        id: userId,
        password: encryptedPassword,
        identity: identity,
      }],
    };

    const response = await codef.addAccount(serviceTypeConstant, param);
    return typeof response === 'string' ? JSON.parse(response) : response;
  } catch (error: any) {
    console.error('CODEF addAccount error:', error);
    return {
      result: { code: 'CF-99999', extraMessage: '', message: error instanceof Error ? error.message : '계정 추가 실패', transactionId: '' },
      data: null as any,
    };
  }
}

export async function deleteCodefAccount(connectedId: string): Promise<CodefApiResponse<unknown>> {
  try {
    const { codef, serviceType } = await createCodefInstance();
    const serviceTypeConstant = await getServiceTypeConstant(serviceType);

    const param = {
      connectedId,
      accountList: [{
        countryCode: 'KR',
        businessType: 'NT',
        clientType: 'P',
        organization: CODEF_ORGANIZATION.HOMETAX,
        loginType: '1',
      }],
    };

    const response = await codef.deleteAccount(serviceTypeConstant, param);
    return typeof response === 'string' ? JSON.parse(response) : response;
  } catch (error) {
    console.error('CODEF deleteAccount error:', error);
    return {
      result: { code: 'CF-99999', extraMessage: '', message: error instanceof Error ? error.message : '계정 삭제 실패', transactionId: '' },
      data: null,
    };
  }
}

// ============================================
// 상품 조회 API (PDF 문서 기반 정확한 엔드포인트)
// ============================================

async function requestProduct<T>(productUrl: string, params: object): Promise<CodefApiResponse<T>> {
  try {
    const { codef, serviceType } = await createCodefInstance();
    const serviceTypeConstant = await getServiceTypeConstant(serviceType);
    console.log(`CODEF requestProduct: ${productUrl}`, JSON.stringify(params).substring(0, 200));
    const response = await codef.requestProduct(productUrl, serviceTypeConstant, params);
    const result = typeof response === 'string' ? JSON.parse(response) : response;
    console.log(`CODEF response code: ${result?.result?.code}, message: ${result?.result?.message}`);
    return result;
  } catch (error) {
    console.error('CODEF requestProduct error:', error);
    return {
      result: { code: 'CF-99999', extraMessage: '', message: error instanceof Error ? error.message : '상품 조회 실패', transactionId: '' },
      data: null as any,
    };
  }
}

/**
 * 전자세금계산서 기간별 매출/매입 통계
 * Endpoint: /v1/kr/public/nt/tax-invoice/sales-purchase-statistics
 * Organization: 0002
 * 직접 인증 방식 (loginType=1, userId, userPassword)
 */
export async function getTaxInvoiceStatistics(
  hometaxId: string,
  hometaxPassword: string,
  yearMonth: string  // YYYYMM 형식
): Promise<TaxInvoiceStatisticsItem[]> {
  const config = getCodefConfig();
  const encryptedPassword = encryptRSAWithForge(config.publicKey, hometaxPassword);

  const params = {
    organization: CODEF_ORGANIZATION.HOMETAX,  // 0002
    loginType: '1',          // ID/PW 로그인
    userId: hometaxId,
    userPassword: encryptedPassword,
    inquiryType: '01',       // 01: 전자세금계산서
    searchType: '01',        // 01: 월별
    startDate: yearMonth,    // YYYYMM
    endDate: yearMonth,      // YYYYMM (같은 달)
    type: '1',               // 1: 상세포함 (거래처별 명세)
    identity: '',
    telecom: '',
  };

  const response = await requestProduct<TaxInvoiceStatisticsItem[] | TaxInvoiceStatisticsItem>(
    CODEF_ENDPOINTS.TAX_INVOICE_STATISTICS,
    params
  );

  if (response.result.code !== 'CF-00000') {
    console.error('Tax invoice statistics error:', response.result);
    return [];
  }

  // 응답이 배열일 수도, 단건일 수도 있음
  const data = response.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return [data as TaxInvoiceStatisticsItem];
  return [];
}

/**
 * 현금영수증 매입내역
 * Endpoint: /v1/kr/public/nt/cash-receipt/purchase-details
 * Organization: 0003
 * 직접 인증 방식 (loginType=1, id, userPassword)
 */
export async function getCashReceiptPurchaseDetails(
  hometaxId: string,
  hometaxPassword: string,
  startDate: string,  // YYYYMMDD
  endDate: string     // YYYYMMDD
): Promise<CashReceiptPurchaseItem[]> {
  const config = getCodefConfig();
  const encryptedPassword = encryptRSAWithForge(config.publicKey, hometaxPassword);

  const params = {
    organization: CODEF_ORGANIZATION.CASH_RECEIPT,  // 0003
    loginType: '1',          // ID/PW 로그인
    id: hometaxId,
    userPassword: encryptedPassword,
    startDate: startDate,    // YYYYMMDD
    endDate: endDate,        // YYYYMMDD
    orderBy: '0',            // 최신순
    inquiryType: '0',        // 전체
    identity: '',
    telecom: '',
  };

  const response = await requestProduct<CashReceiptPurchaseItem[] | CashReceiptPurchaseItem>(
    CODEF_ENDPOINTS.CASH_RECEIPT_PURCHASE,
    params
  );

  if (response.result.code !== 'CF-00000') {
    console.error('Cash receipt purchase error:', response.result);
    return [];
  }

  const data = response.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'resUsedDate' in (data as any)) return [data as CashReceiptPurchaseItem];
  return [];
}

/**
 * 현금영수증 매출내역
 * Endpoint: /v1/kr/public/nt/cash-receipt/sales-details
 * Organization: 0003
 * 직접 인증 방식 (loginType=1, id, userPassword)
 */
export async function getCashReceiptSalesDetails(
  hometaxId: string,
  hometaxPassword: string,
  startDate: string,  // YYYYMMDD
  endDate: string     // YYYYMMDD
): Promise<CashReceiptSalesItem[]> {
  const config = getCodefConfig();
  const encryptedPassword = encryptRSAWithForge(config.publicKey, hometaxPassword);

  const params = {
    organization: CODEF_ORGANIZATION.CASH_RECEIPT,  // 0003
    loginType: '1',          // ID/PW 로그인
    id: hometaxId,
    userPassword: encryptedPassword,
    startDate: startDate,    // YYYYMMDD
    endDate: endDate,        // YYYYMMDD
    orderBy: '0',            // 최신순
    identity: '',
    telecom: '',
  };

  const response = await requestProduct<CashReceiptSalesItem[] | CashReceiptSalesItem>(
    CODEF_ENDPOINTS.CASH_RECEIPT_SALES,
    params
  );

  if (response.result.code !== 'CF-00000') {
    console.error('Cash receipt sales error:', response.result);
    return [];
  }

  const data = response.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'resUsedDate' in (data as any)) return [data as CashReceiptSalesItem];
  return [];
}

// ============================================
// 하위 호환성 유지 함수 (기존 sync 라우트 import 대응)
// ============================================

export async function getTaxInvoiceSales(
  connectedId: string, startDate: string, endDate: string
): Promise<any[]> {
  console.warn('getTaxInvoiceSales: deprecated - use getTaxInvoiceStatistics instead');
  return [];
}

export async function getTaxInvoicePurchase(
  connectedId: string, startDate: string, endDate: string
): Promise<any[]> {
  console.warn('getTaxInvoicePurchase: deprecated - use getTaxInvoiceStatistics instead');
  return [];
}

export async function getCashReceiptSales(
  connectedId: string, startDate: string, endDate: string
): Promise<any[]> {
  console.warn('getCashReceiptSales: deprecated - use getCashReceiptSalesDetails instead');
  return [];
}

export async function getCashReceiptPurchase(
  connectedId: string, startDate: string, endDate: string
): Promise<any[]> {
  console.warn('getCashReceiptPurchase: deprecated - use getCashReceiptPurchaseDetails instead');
  return [];
}

export async function getBusinessCardHistory(
  connectedId: string, startDate: string, endDate: string
): Promise<any[]> {
  console.warn('getBusinessCardHistory: deprecated - card approval requires separate card company connection');
  return [];
}

// ============================================
// 통합 동기화 함수
// ============================================

export async function syncHometaxData(
  hometaxId: string,
  hometaxPassword: string,
  year: number,
  month: number
): Promise<SyncResult> {
  const errors: string[] = [];
  const syncedCount = {
    taxInvoiceSales: 0,
    taxInvoicePurchase: 0,
    cashReceiptSales: 0,
    cashReceiptPurchase: 0,
  };

  const yearMonth = `${year}${String(month).padStart(2, '0')}`;
  const startDate = `${year}${String(month).padStart(2, '0')}01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}${String(month).padStart(2, '0')}${lastDay}`;

  // 1. 세금계산서 매출/매입 통계
  try {
    const taxStats = await getTaxInvoiceStatistics(hometaxId, hometaxPassword, yearMonth);
    for (const item of taxStats) {
      if (item.resType === '0') {
        syncedCount.taxInvoiceSales += parseInt(item.resNumber, 10) || 0;
      } else if (item.resType === '1') {
        syncedCount.taxInvoicePurchase += parseInt(item.resNumber, 10) || 0;
      }
    }
  } catch (error) {
    errors.push(`세금계산서 통계 조회 실패: ${error}`);
  }

  // 2. 현금영수증 매입내역
  try {
    const cashPurchase = await getCashReceiptPurchaseDetails(hometaxId, hometaxPassword, startDate, endDate);
    syncedCount.cashReceiptPurchase = cashPurchase.length;
  } catch (error) {
    errors.push(`현금영수증 매입 조회 실패: ${error}`);
  }

  // 3. 현금영수증 매출내역
  try {
    const cashSales = await getCashReceiptSalesDetails(hometaxId, hometaxPassword, startDate, endDate);
    syncedCount.cashReceiptSales = cashSales.length;
  } catch (error) {
    errors.push(`현금영수증 매출 조회 실패: ${error}`);
  }

  return {
    success: errors.length === 0,
    syncedCount,
    errors,
    syncDate: new Date().toISOString(),
  };
}

// ============================================
// 변환 함수 (세금계산서 통계 → 요약 데이터)
// ============================================

export function convertTaxInvoiceStatsToSummary(items: TaxInvoiceStatisticsItem[]) {
  let salesSupplyValue = 0;
  let salesTaxAmt = 0;
  let salesCount = 0;
  let purchaseSupplyValue = 0;
  let purchaseTaxAmt = 0;
  let purchaseCount = 0;

  for (const item of items) {
    const supplyValue = parseInt(item.resSupplyValue, 10) || 0;
    const taxAmt = parseInt(item.resTaxAmt || '0', 10) || 0;
    const count = parseInt(item.resNumber, 10) || 0;

    if (item.resType === '0') {  // 매출
      salesSupplyValue += supplyValue;
      salesTaxAmt += taxAmt;
      salesCount += count;
    } else if (item.resType === '1') {  // 매입
      purchaseSupplyValue += supplyValue;
      purchaseTaxAmt += taxAmt;
      purchaseCount += count;
    }
  }

  return {
    sales: { supplyValue: salesSupplyValue, taxAmt: salesTaxAmt, count: salesCount },
    purchase: { supplyValue: purchaseSupplyValue, taxAmt: purchaseTaxAmt, count: purchaseCount },
  };
}

/**
 * 현금영수증 매입내역을 지출 데이터로 변환
 */
export function convertCashReceiptPurchaseToExpense(item: CashReceiptPurchaseItem) {
  return {
    amount: parseInt(item.resTotalAmount, 10) || 0,
    description: `현금영수증 매입 - ${item.resApprovalNo}`,
    vendor_name: item.resMemberStoreName || item.resCompanyNm || '',
    has_tax_invoice: false,
    tax_invoice_number: item.resApprovalNo,
    tax_invoice_date: formatCodefDate(item.resUsedDate),
    payment_method: 'cash' as const,
    is_hometax_synced: true,
    hometax_sync_date: new Date().toISOString(),
  };
}

/**
 * 세금계산서 매입 거래처별 상세를 지출 데이터로 변환
 */
export function convertTaxInvoicePurchaseToExpense(
  partner: { resCompanyIdentityNo: string; resCompanyNm: string; resNumber: string; resSupplyValue: string; resTaxAmt?: string },
  yearMonth: string
) {
  const supplyValue = parseInt(partner.resSupplyValue, 10) || 0;
  const taxAmt = parseInt(partner.resTaxAmt || '0', 10) || 0;
  return {
    amount: supplyValue + taxAmt,
    description: `세금계산서 매입 - ${partner.resCompanyNm} (${partner.resNumber}건)`,
    vendor_name: partner.resCompanyNm,
    has_tax_invoice: true,
    tax_invoice_number: partner.resCompanyIdentityNo,
    tax_invoice_date: `${yearMonth.slice(0, 4)}-${yearMonth.slice(4, 6)}-01`,
    payment_method: 'transfer' as const,
    is_hometax_synced: true,
    hometax_sync_date: new Date().toISOString(),
  };
}

// 하위 호환성: 기존 import에서 사용
export function convertTaxInvoiceToExpense(invoice: any, categoryId: string) {
  return {
    amount: parseInt(invoice.grandTotal || '0', 10) || 0,
    description: invoice.itemName || '세금계산서',
    vendor_name: invoice.supplierCorpName || '',
    has_tax_invoice: true,
    tax_invoice_number: invoice.issueId || '',
    tax_invoice_date: formatCodefDate(invoice.issueDate || ''),
    is_hometax_synced: true,
  };
}

export function convertCashReceiptToExpense(receipt: any, categoryId: string) {
  return {
    amount: parseInt(receipt.totalAmount || '0', 10) || 0,
    description: `현금영수증 - ${receipt.approvalNumber || ''}`,
    vendor_name: receipt.franchiseeName || '',
    is_hometax_synced: true,
  };
}

export function convertBusinessCardToExpense(card: any, categoryId: string) {
  return {
    amount: parseInt(card.totalAmount || '0', 10) || 0,
    description: `사업자카드 - ${card.approvalNumber || ''}`,
    vendor_name: card.merchantName || '',
    payment_method: 'card' as const,
    is_business_card: true,
    is_hometax_synced: true,
  };
}

// ============================================
// 유틸리티 함수
// ============================================

function formatCodefDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return '';
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

export function isCodefConfigured(): boolean {
  const config = getCodefConfig();
  return !!(config.clientId && config.clientSecret && config.publicKey);
}

export function getCodefServiceType(): string {
  const config = getCodefConfig();
  switch (config.serviceType) {
    case 0: return '정식';
    case 1: return '데모';
    default: return '샌드박스';
  }
}
