// ============================================
// 코드에프 (CODEF) API 서비스
// easycodef-node 라이브러리 사용 + node-forge RSA 암호화
// Created: 2026-02-06
// Updated: 2026-02-09
// ============================================

import {
  CodefServiceType,
  CodefApiResponse,
  CodefAccountCreateResponse,
  TaxInvoiceItem,
  CashReceiptItem,
  BusinessCardItem,
  SyncResult,
  CODEF_ORGANIZATION,
} from '@/types/codef';
import forge from 'node-forge';

// easycodef-node 라이브러리 동적 import
let EasyCodef: any = null;
let EasyCodefConstant: any = null;
let EasyCodefUtil: any = null;

async function loadEasyCodef() {
  if (!EasyCodef) {
    const easycodef = await import('easycodef-node');
    EasyCodef = easycodef.EasyCodef || (easycodef.default && easycodef.default.EasyCodef);
    EasyCodefConstant = easycodef.EasyCodefConstant || (easycodef.default && easycodef.default.EasyCodefConstant);
    EasyCodefUtil = easycodef.EasyCodefUtil || (easycodef.default && easycodef.default.EasyCodefUtil);
  }
  return { EasyCodef, EasyCodefConstant, EasyCodefUtil };
}

/**
 * node-forge를 사용한 RSA 암호화 (OpenSSL 3.0 호환)
 * easycodef-node의 encryptRSA 대신 사용
 */
function encryptRSAWithForge(publicKeyBase64: string, plainText: string): string {
  // 공개키 정리: 공백, 개행 제거
  let cleanKey = publicKeyBase64.replace(/[\s\n\r]/g, '');

  // SPKI 헤더 검증 및 자동 수정: 잘못된 SPKI 헤더 패턴 감지
  // 정상: ...OCAQ8AMIIBCgK... (RSA 2048 SPKI 표준 헤더)
  // 비정상: ...OCAQIIBCgK... (3자 누락)
  if (cleanKey.includes('OCAQIIBCgK') && !cleanKey.includes('OCAQ8AMIIBCgK')) {
    cleanKey = cleanKey.replace('OCAQIIBCgK', 'OCAQ8AMIIBCgK');
    console.warn('CODEF: RSA 공개키 SPKI 헤더가 자동 수정되었습니다.');
  }

  // base64 길이 검증 (4의 배수)
  if (cleanKey.length % 4 !== 0) {
    throw new Error(`RSA 공개키가 올바르지 않습니다. (base64 길이: ${cleanKey.length}, 4의 배수여야 함)`);
  }

  const formattedKey = cleanKey.match(/.{1,64}/g)?.join('\n') || cleanKey;
  const pemKey = '-----BEGIN PUBLIC KEY-----\n' + formattedKey + '\n-----END PUBLIC KEY-----';
  const publicKey = forge.pki.publicKeyFromPem(pemKey);
  const encrypted = publicKey.encrypt(plainText, 'RSAES-PKCS1-V1_5');
  return forge.util.encode64(encrypted);
}

// 환경변수에서 설정 로드
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
      serviceType = 2; // SANDBOX
  }

  // 환경변수 값 trim 처리
  let clientId = (process.env.CODEF_CLIENT_ID || '').trim();
  let clientSecret = (process.env.CODEF_CLIENT_SECRET || '').trim();
  const publicKey = (process.env.CODEF_PUBLIC_KEY || '').trim();

  // CLIENT_SECRET 자동 수정: UUID 형식(36자) 뒤에 추가된 잘못된 문자 제거
  // (환경변수 복사-붙여넣기 시 PUBLIC_KEY 일부가 SECRET에 붙는 오류 대응)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const uuidMatch = clientSecret.match(uuidPattern);
  if (uuidMatch && clientSecret.length > 36) {
    console.warn(`CODEF: CLIENT_SECRET에서 UUID 이후 불필요한 문자가 감지되어 자동 수정되었습니다. (원래 길이: ${clientSecret.length})`);
    clientSecret = uuidMatch[0];
  }

  return {
    clientId,
    clientSecret,
    publicKey,
    serviceType,
  };
};

// CODEF 인스턴스 생성
async function createCodefInstance() {
  const { EasyCodef, EasyCodefConstant } = await loadEasyCodef();
  const config = getCodefConfig();

  if (!config.clientId || !config.clientSecret || !config.publicKey) {
    throw new Error('CODEF API 설정이 완료되지 않았습니다.');
  }

  const codef = new EasyCodef();
  codef.setPublicKey(config.publicKey);

  // 서비스 타입에 따라 클라이언트 정보 설정
  if (config.serviceType === 0) {
    // 정식
    codef.setClientInfo(config.clientId, config.clientSecret);
  } else {
    // 데모/샌드박스
    codef.setClientInfoForDemo(config.clientId, config.clientSecret);
  }

  return { codef, serviceType: config.serviceType };
}

// 서비스 타입 상수 가져오기
async function getServiceTypeConstant(serviceType: number) {
  const { EasyCodefConstant } = await loadEasyCodef();

  switch (serviceType) {
    case 0:
      return EasyCodefConstant.SERVICE_TYPE_API;
    case 1:
      return EasyCodefConstant.SERVICE_TYPE_DEMO;
    default:
      return EasyCodefConstant.SERVICE_TYPE_SANDBOX;
  }
}

// ============================================
// 계정 관리 API
// ============================================

/**
 * CODEF 계정 등록 (Connected ID 발급)
 * @param userId 홈택스 본인 계정 아이디
 * @param password 홈택스 본인 계정 비밀번호
 * @param identity 대표자 주민등록번호 앞 6자리 (YYMMDD) 또는 사업자등록번호 (loginType '1'에서 필수)
 */
export async function createCodefAccount(
  userId: string,
  password: string,
  identity: string
): Promise<CodefApiResponse<CodefAccountCreateResponse['data']>> {
  try {
    const { codef, serviceType } = await createCodefInstance();
    const config = getCodefConfig();
    const serviceTypeConstant = await getServiceTypeConstant(serviceType);

    // 비밀번호 RSA 암호화 (node-forge 사용 - OpenSSL 3.0 호환)
    const encryptedPassword = encryptRSAWithForge(config.publicKey, password);

    // 계정 정보 설정
    const accountInfo: Record<string, string> = {
      countryCode: 'KR',
      businessType: 'NT',  // 공공기관
      clientType: 'P',     // 개인 (원장 본인 계정)
      organization: CODEF_ORGANIZATION.HOMETAX,
      loginType: '1',      // ID/PW 로그인
      id: userId,
      password: encryptedPassword,
      identity: identity,  // 주민번호 앞7자리 또는 사업자등록번호 (필수)
    };

    const param = {
      accountList: [accountInfo],
    };

    // 계정 생성 요청
    const response = await codef.createAccount(serviceTypeConstant, param);
    const result = typeof response === 'string' ? JSON.parse(response) : response;

    return result;
  } catch (error: any) {
    const errMsg = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
    console.error('CODEF createAccount error:', errMsg, error);
    return {
      result: {
        code: 'CF-99999',
        extraMessage: String(error?.stack || ''),
        message: errMsg || '계정 등록 중 오류가 발생했습니다.',
        transactionId: '',
      },
      data: null as any,
    };
  }
}

/**
 * CODEF 계정 추가
 */
export async function addCodefAccount(
  connectedId: string,
  userId: string,
  password: string,
  identity: string
): Promise<CodefApiResponse<CodefAccountCreateResponse['data']>> {
  try {
    const { codef, serviceType } = await createCodefInstance();
    const config = getCodefConfig();
    const serviceTypeConstant = await getServiceTypeConstant(serviceType);

    const encryptedPassword = encryptRSAWithForge(config.publicKey, password);

    const accountInfo: Record<string, string> = {
      countryCode: 'KR',
      businessType: 'NT',
      clientType: 'P',     // 개인 (원장 본인 계정)
      organization: CODEF_ORGANIZATION.HOMETAX,
      loginType: '1',
      id: userId,
      password: encryptedPassword,
      identity: identity,  // 주민번호 앞6자리 또는 사업자등록번호 (필수)
    };

    const param = {
      connectedId,
      accountList: [accountInfo],
    };

    const response = await codef.addAccount(serviceTypeConstant, param);
    const result = typeof response === 'string' ? JSON.parse(response) : response;

    return result;
  } catch (error) {
    console.error('CODEF addAccount error:', error);
    return {
      result: {
        code: 'CF-99999',
        extraMessage: '',
        message: error instanceof Error ? error.message : '계정 추가 중 오류가 발생했습니다.',
        transactionId: '',
      },
      data: null as any,
    };
  }
}

/**
 * CODEF 계정 삭제
 */
export async function deleteCodefAccount(
  connectedId: string
): Promise<CodefApiResponse<unknown>> {
  try {
    const { codef, serviceType } = await createCodefInstance();
    const serviceTypeConstant = await getServiceTypeConstant(serviceType);

    const param = {
      connectedId,
      accountList: [
        {
          countryCode: 'KR',
          businessType: 'NT',
          clientType: 'P',     // 개인 (원장 본인 계정)
          organization: CODEF_ORGANIZATION.HOMETAX,
          loginType: '1',
        },
      ],
    };

    const response = await codef.deleteAccount(serviceTypeConstant, param);
    const result = typeof response === 'string' ? JSON.parse(response) : response;

    return result;
  } catch (error) {
    console.error('CODEF deleteAccount error:', error);
    return {
      result: {
        code: 'CF-99999',
        extraMessage: '',
        message: error instanceof Error ? error.message : '계정 삭제 중 오류가 발생했습니다.',
        transactionId: '',
      },
      data: null,
    };
  }
}

// ============================================
// 상품 조회 API
// ============================================

/**
 * CODEF 상품 요청 공통 함수
 */
async function requestProduct<T>(
  productUrl: string,
  params: object
): Promise<CodefApiResponse<T>> {
  try {
    const { codef, serviceType } = await createCodefInstance();
    const serviceTypeConstant = await getServiceTypeConstant(serviceType);

    const response = await codef.requestProduct(productUrl, serviceTypeConstant, params);
    const result = typeof response === 'string' ? JSON.parse(response) : response;

    return result;
  } catch (error) {
    console.error('CODEF requestProduct error:', error);
    return {
      result: {
        code: 'CF-99999',
        extraMessage: '',
        message: error instanceof Error ? error.message : '상품 조회 중 오류가 발생했습니다.',
        transactionId: '',
      },
      data: null as any,
    };
  }
}

/**
 * 매출 세금계산서 조회
 */
export async function getTaxInvoiceSales(
  connectedId: string,
  startDate: string,
  endDate: string
): Promise<TaxInvoiceItem[]> {
  const params = {
    connectedId,
    organization: CODEF_ORGANIZATION.HOMETAX,
    inquiryType: '01',  // 매출
    startDate: startDate.replace(/-/g, ''),
    endDate: endDate.replace(/-/g, ''),
  };

  const response = await requestProduct<any>(
    '/v1/kr/public/nt/tax-invoice/sales',
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
  const params = {
    connectedId,
    organization: CODEF_ORGANIZATION.HOMETAX,
    inquiryType: '02',  // 매입
    startDate: startDate.replace(/-/g, ''),
    endDate: endDate.replace(/-/g, ''),
  };

  const response = await requestProduct<any>(
    '/v1/kr/public/nt/tax-invoice/purchase',
    params
  );

  if (response.result.code !== 'CF-00000') {
    console.error('Tax invoice purchase error:', response.result);
    return [];
  }

  return response.data?.resTaxInvoiceList || [];
}

/**
 * 매출 현금영수증 조회
 */
export async function getCashReceiptSales(
  connectedId: string,
  startDate: string,
  endDate: string
): Promise<CashReceiptItem[]> {
  const params = {
    connectedId,
    organization: CODEF_ORGANIZATION.HOMETAX,
    inquiryType: '01',
    startDate: startDate.replace(/-/g, ''),
    endDate: endDate.replace(/-/g, ''),
  };

  const response = await requestProduct<any>(
    '/v1/kr/public/nt/cash-receipt/sales',
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
  const params = {
    connectedId,
    organization: CODEF_ORGANIZATION.HOMETAX,
    inquiryType: '02',
    startDate: startDate.replace(/-/g, ''),
    endDate: endDate.replace(/-/g, ''),
  };

  const response = await requestProduct<any>(
    '/v1/kr/public/nt/cash-receipt/purchase',
    params
  );

  if (response.result.code !== 'CF-00000') {
    console.error('Cash receipt purchase error:', response.result);
    return [];
  }

  return response.data?.resCashReceiptList || [];
}

/**
 * 사업자카드 사용내역 조회
 */
export async function getBusinessCardHistory(
  connectedId: string,
  startDate: string,
  endDate: string
): Promise<BusinessCardItem[]> {
  const params = {
    connectedId,
    organization: CODEF_ORGANIZATION.HOMETAX,
    startDate: startDate.replace(/-/g, ''),
    endDate: endDate.replace(/-/g, ''),
  };

  const response = await requestProduct<any>(
    '/v1/kr/public/nt/business-card/use-history',
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

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  try {
    const taxInvoiceSales = await getTaxInvoiceSales(connectedId, startDate, endDate);
    syncedCount.taxInvoiceSales = taxInvoiceSales.length;
  } catch (error) {
    errors.push(`매출 세금계산서 조회 실패: ${error}`);
  }

  try {
    const taxInvoicePurchase = await getTaxInvoicePurchase(connectedId, startDate, endDate);
    syncedCount.taxInvoicePurchase = taxInvoicePurchase.length;
  } catch (error) {
    errors.push(`매입 세금계산서 조회 실패: ${error}`);
  }

  try {
    const cashReceiptSales = await getCashReceiptSales(connectedId, startDate, endDate);
    syncedCount.cashReceiptSales = cashReceiptSales.length;
  } catch (error) {
    errors.push(`매출 현금영수증 조회 실패: ${error}`);
  }

  try {
    const cashReceiptPurchase = await getCashReceiptPurchase(connectedId, startDate, endDate);
    syncedCount.cashReceiptPurchase = cashReceiptPurchase.length;
  } catch (error) {
    errors.push(`매입 현금영수증 조회 실패: ${error}`);
  }

  try {
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

// ============================================
// 변환 함수
// ============================================

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
    case 0:
      return '정식';
    case 1:
      return '데모';
    default:
      return '샌드박스';
  }
}
