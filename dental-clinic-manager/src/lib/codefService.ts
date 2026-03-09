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
  TaxInvoiceDetailItem,
  CashReceiptPurchaseItem,
  CashReceiptSalesItem,
  CreditCardSalesData,
  BusinessCardDeductionItem,
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
      // DEMO 환경 (development.codef.io) - NT 상품 API 지원
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

// ============================================
// 공동인증서 기반 계정 관리 API
// loginType: '0' (인증서 로그인)
// ============================================

export async function createCodefAccountWithCert(
  certDerBase64: string, keyDerBase64: string, certPassword: string, identity: string
): Promise<CodefApiResponse<CodefAccountCreateResponse['data']>> {
  try {
    const { codef, serviceType } = await createCodefInstance();
    const config = getCodefConfig();
    const serviceTypeConstant = await getServiceTypeConstant(serviceType);
    const encryptedPassword = encryptRSAWithForge(config.publicKey, certPassword);

    const param = {
      accountList: [{
        countryCode: 'KR',
        businessType: 'NT',
        clientType: 'P',
        organization: CODEF_ORGANIZATION.HOMETAX,
        loginType: '0',
        certFile: certDerBase64,
        keyFile: keyDerBase64,
        password: encryptedPassword,
        identity: identity,
      }],
    };

    const response = await codef.createAccount(serviceTypeConstant, param);
    return typeof response === 'string' ? JSON.parse(response) : response;
  } catch (error: any) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('CODEF createAccountWithCert error:', errMsg);
    return {
      result: { code: 'CF-99999', extraMessage: String(error?.stack || ''), message: errMsg, transactionId: '' },
      data: null as any,
    };
  }
}

export async function updateCodefAccountWithCert(
  connectedId: string, certDerBase64: string, keyDerBase64: string, certPassword: string, identity: string
): Promise<CodefApiResponse<CodefAccountCreateResponse['data']>> {
  try {
    const { codef, serviceType } = await createCodefInstance();
    const config = getCodefConfig();
    const serviceTypeConstant = await getServiceTypeConstant(serviceType);
    const encryptedPassword = encryptRSAWithForge(config.publicKey, certPassword);

    const param = {
      connectedId,
      accountList: [{
        countryCode: 'KR',
        businessType: 'NT',
        clientType: 'P',
        organization: CODEF_ORGANIZATION.HOMETAX,
        loginType: '0',
        certFile: certDerBase64,
        keyFile: keyDerBase64,
        password: encryptedPassword,
        identity: identity,
      }],
    };

    const response = await codef.updateAccount(serviceTypeConstant, param);
    return typeof response === 'string' ? JSON.parse(response) : response;
  } catch (error: any) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('CODEF updateAccountWithCert error:', errMsg);
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

async function requestProduct<T>(productUrl: string, params: object): Promise<CodefApiResponse<T> & { _fallback?: boolean }> {
  const config = getCodefConfig();

  // SANDBOX 폴백 헬퍼 함수
  async function trySandboxFallback(reason: string): Promise<CodefApiResponse<T> & { _fallback?: boolean }> {
    try {
      console.warn(`CODEF requestProduct: SANDBOX 폴백 시도 (사유: ${reason})`);
      const { EasyCodef: EasyCodefLib } = await loadEasyCodef();
      const sandboxCodef = new EasyCodefLib();
      sandboxCodef.setPublicKey(config.publicKey);
      sandboxCodef.setClientInfoForDemo(config.clientId, config.clientSecret);
      const sandboxTypeConstant = await getServiceTypeConstant(2);
      const sandboxResponse = await sandboxCodef.requestProduct(productUrl, sandboxTypeConstant, params);
      const sandboxResult = typeof sandboxResponse === 'string' ? JSON.parse(sandboxResponse) : sandboxResponse;
      console.log(`CODEF SANDBOX fallback response code: ${sandboxResult?.result?.code}, message: ${sandboxResult?.result?.message}`);
      sandboxResult._fallback = true;
      return sandboxResult;
    } catch (sandboxError) {
      console.error('CODEF SANDBOX fallback also failed:', sandboxError);
      return {
        result: { code: 'CF-99999', extraMessage: '', message: `SANDBOX 폴백 실패: ${sandboxError instanceof Error ? sandboxError.message : String(sandboxError)}`, transactionId: '' },
        data: null as any,
        _fallback: true,
      };
    }
  }

  try {
    const { codef, serviceType } = await createCodefInstance();
    const serviceTypeConstant = await getServiceTypeConstant(serviceType);
    console.log(`CODEF requestProduct: ${productUrl}`, JSON.stringify(params).substring(0, 200));
    const response = await codef.requestProduct(productUrl, serviceTypeConstant, params);
    const result = typeof response === 'string' ? JSON.parse(response) : response;
    console.log(`CODEF response code: ${result?.result?.code}, message: ${result?.result?.message}`);

    // DEMO/정식 모드에서 실패 시 SANDBOX로 폴백
    if (result?.result?.code !== 'CF-00000' && serviceType !== 2) {
      return await trySandboxFallback(`${serviceType === 1 ? 'DEMO' : '정식'} 모드 에러 ${result?.result?.code}`);
    }

    return result;
  } catch (error) {
    console.error('CODEF requestProduct error:', error);
    // 예외 발생 시에도 SANDBOX 폴백 시도
    if (config.serviceType !== 2) {
      return await trySandboxFallback(`예외 발생: ${error instanceof Error ? error.message : String(error)}`);
    }
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
): Promise<{ data: TaxInvoiceStatisticsItem[]; isSandboxFallback: boolean }> {
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

  const isSandboxFallback = !!(response as any)._fallback;

  if (response.result.code !== 'CF-00000') {
    if (isSandboxFallback) {
      console.warn('getTaxInvoiceStatistics: SANDBOX 폴백 에러, 빈 데이터 반환:', response.result.code);
      return { data: [], isSandboxFallback };
    }
    console.error('Tax invoice statistics error:', response.result);
    return { data: [], isSandboxFallback: false };
  }

  // 응답이 배열일 수도, 단건일 수도 있음
  const data = response.data;
  if (Array.isArray(data)) return { data, isSandboxFallback };
  if (data && typeof data === 'object') return { data: [data as TaxInvoiceStatisticsItem], isSandboxFallback };
  return { data: [], isSandboxFallback };
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
): Promise<{ data: CashReceiptPurchaseItem[]; isSandboxFallback: boolean }> {
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

  const isSandboxFallback = !!(response as any)._fallback;

  if (response.result.code !== 'CF-00000') {
    if (isSandboxFallback) {
      console.warn('getCashReceiptPurchaseDetails: SANDBOX 폴백 에러, 빈 데이터 반환:', response.result.code);
      return { data: [], isSandboxFallback };
    }
    console.error('Cash receipt purchase error:', response.result);
    return { data: [], isSandboxFallback: false };
  }

  const data = response.data;
  if (Array.isArray(data)) return { data, isSandboxFallback };
  if (data && typeof data === 'object' && 'resUsedDate' in (data as any)) return { data: [data as CashReceiptPurchaseItem], isSandboxFallback };
  return { data: [], isSandboxFallback };
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
): Promise<{ data: CashReceiptSalesItem[]; isSandboxFallback: boolean }> {
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

  const isSandboxFallback = !!(response as any)._fallback;

  if (response.result.code !== 'CF-00000') {
    if (isSandboxFallback) {
      console.warn('getCashReceiptSalesDetails: SANDBOX 폴백 에러, 빈 데이터 반환:', response.result.code);
      return { data: [], isSandboxFallback };
    }
    console.error('Cash receipt sales error:', response.result);
    return { data: [], isSandboxFallback: false };
  }

  const data = response.data;
  if (Array.isArray(data)) return { data, isSandboxFallback };
  if (data && typeof data === 'object' && 'resUsedDate' in (data as any)) return { data: [data as CashReceiptSalesItem], isSandboxFallback };
  return { data: [], isSandboxFallback };
}

// ============================================
// 인증서 기반 API 전용 인스턴스 (DEMO 모드 지원)
// 공동인증서 전용 API는 DEMO 환경에서도 실제 데이터 조회 가능
// ============================================

function getActualServiceType(): number {
  const env = (process.env.CODEF_SERVICE_TYPE || 'SANDBOX').trim().toUpperCase();
  switch (env) {
    case 'PRODUCT': case '0': return 0;
    case 'DEMO': case '1': return 1;
    default: return 2;
  }
}

// 토큰 발급 가능 여부를 사전 검증 (캐시)
let _tokenValidationCache: { serviceType: number; valid: boolean; checkedAt: number } | null = null;
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5분

async function validateTokenForServiceType(codef: any, serviceType: number): Promise<boolean> {
  // 캐시된 결과가 있으면 재사용
  if (_tokenValidationCache &&
      _tokenValidationCache.serviceType === serviceType &&
      Date.now() - _tokenValidationCache.checkedAt < TOKEN_CACHE_TTL) {
    return _tokenValidationCache.valid;
  }

  try {
    const serviceTypeConstant = await getServiceTypeConstant(serviceType);
    const tokenResult = await codef.requestToken(serviceTypeConstant);
    const valid = !!(tokenResult && typeof tokenResult === 'string' && tokenResult.length > 0);
    _tokenValidationCache = { serviceType, valid, checkedAt: Date.now() };
    return valid;
  } catch {
    _tokenValidationCache = { serviceType, valid: false, checkedAt: Date.now() };
    return false;
  }
}

async function createCodefInstanceForCertApi(): Promise<{ codef: any; serviceType: number; fallback: boolean }> {
  const { EasyCodef } = await loadEasyCodef();
  const config = getCodefConfig();
  const requestedServiceType = getActualServiceType();

  if (!config.publicKey) {
    throw new Error('CODEF API 설정이 완료되지 않았습니다. (PUBLIC_KEY 누락)');
  }

  // 정식(PRODUCT) 모드: 반드시 사용자 인증 정보 필요
  if (requestedServiceType === 0) {
    if (!config.clientId || !config.clientSecret) {
      throw new Error('CODEF 정식 서비스 사용을 위한 CLIENT_ID/CLIENT_SECRET이 설정되지 않았습니다.');
    }
    const codef = new EasyCodef();
    codef.setPublicKey(config.publicKey);
    codef.setClientInfo(config.clientId, config.clientSecret);
    return { codef, serviceType: 0, fallback: false };
  }

  // DEMO 또는 SANDBOX 모드: 사용자 인증 정보로 시도 후 실패 시 SANDBOX 폴백
  if (config.clientId && config.clientSecret) {
    const codef = new EasyCodef();
    codef.setPublicKey(config.publicKey);
    codef.setClientInfoForDemo(config.clientId, config.clientSecret);

    // 토큰 발급 가능 여부 사전 검증
    const tokenValid = await validateTokenForServiceType(codef, requestedServiceType);
    if (tokenValid) {
      console.log(`CODEF: ${requestedServiceType === 1 ? 'DEMO' : 'SANDBOX'} 인증 성공`);
      return { codef, serviceType: requestedServiceType, fallback: false };
    }

    // DEMO 인증 실패 시 SANDBOX로 폴백
    console.warn(`CODEF: ${requestedServiceType === 1 ? 'DEMO' : 'SANDBOX'} 인증 실패 (CLIENT_ID가 유효하지 않음). SANDBOX로 폴백합니다.`);
    _tokenValidationCache = null; // 캐시 초기화
  } else {
    console.warn('CODEF: CLIENT_ID/CLIENT_SECRET이 설정되지 않았습니다. SANDBOX 모드로 동작합니다.');
  }

  // SANDBOX 폴백: 라이브러리 내장 샌드박스 인증 사용
  const codef = new EasyCodef();
  codef.setPublicKey(config.publicKey);
  // EasyCodef는 SANDBOX용 내장 인증 정보를 가지고 있으므로 별도 설정 불필요
  return { codef, serviceType: 2, fallback: requestedServiceType !== 2 };
}

async function requestProductForCertApi<T>(productUrl: string, params: object): Promise<CodefApiResponse<T> & { _fallback?: boolean }> {
  try {
    const { codef, serviceType, fallback } = await createCodefInstanceForCertApi();
    const serviceTypeConstant = await getServiceTypeConstant(serviceType);
    const serviceLabel = serviceType === 0 ? '정식' : serviceType === 1 ? '데모' : '샌드박스';
    console.log(`CODEF requestProduct (cert API, serviceType=${serviceLabel}${fallback ? ' [폴백]' : ''}): ${productUrl}`);
    console.log(`CODEF params:`, JSON.stringify(params).substring(0, 300));

    const response = await codef.requestProduct(productUrl, serviceTypeConstant, params);

    // easycodef-node 라이브러리가 HTML 에러 페이지를 반환하는 경우 처리
    if (typeof response === 'string') {
      if (response.startsWith('<') || response.startsWith('<!')) {
        // HTML 에러 응답 파싱
        const msgMatch = response.match(/<b>Message<\/b>\s*(.*?)<\/p>/);
        const errMsg = msgMatch ? msgMatch[1] : 'CODEF 서버 오류 (HTML 응답)';
        console.error('CODEF HTML error response:', errMsg);
        return {
          result: { code: 'CF-99998', extraMessage: errMsg, message: `CODEF 서버 오류: ${errMsg}`, transactionId: '' },
          data: null as any,
          _fallback: fallback,
        };
      }

      try {
        const result = JSON.parse(response);
        console.log(`CODEF response code: ${result?.result?.code}, message: ${result?.result?.message}`);
        return { ...result, _fallback: fallback };
      } catch {
        console.error('CODEF response parse error. Raw:', response.substring(0, 200));
        return {
          result: { code: 'CF-99997', extraMessage: '', message: 'CODEF 응답 파싱 실패', transactionId: '' },
          data: null as any,
          _fallback: fallback,
        };
      }
    }

    const result = response;
    console.log(`CODEF response code: ${result?.result?.code}, message: ${result?.result?.message}`);
    return { ...result, _fallback: fallback };
  } catch (error) {
    // easycodef-node 라이브러리 내부에서 발생하는 에러 처리
    const errMsg = error instanceof Error ? error.message : String(error);

    // 토큰 발급 실패 (HTTP 500 HTML 응답을 JSON.parse하려다 실패)
    if (errMsg.includes('Unexpected token') || errMsg.includes('is not valid JSON')) {
      console.error('CODEF 토큰 발급 실패 (인증 정보 오류):', errMsg);
      return {
        result: {
          code: 'CF-99996',
          extraMessage: '',
          message: 'CODEF 인증 실패: CLIENT_ID 또는 CLIENT_SECRET이 유효하지 않습니다. CODEF 홈페이지에서 인증 정보를 확인하세요.',
          transactionId: '',
        },
        data: null as any,
      };
    }

    // HTTP 상태 코드 에러
    if (errMsg.includes('Response status code')) {
      console.error('CODEF HTTP error:', errMsg);
      return {
        result: {
          code: 'CF-99995',
          extraMessage: errMsg,
          message: `CODEF 서버 연결 오류: ${errMsg}`,
          transactionId: '',
        },
        data: null as any,
      };
    }

    console.error('CODEF requestProduct (cert) error:', error);
    return {
      result: { code: 'CF-99999', extraMessage: '', message: errMsg || '상품 조회 실패', transactionId: '' },
      data: null as any,
    };
  }
}

// ============================================
// 신용카드 매출자료 조회 (공동인증서 전용)
// Endpoint: /v1/kr/public/nt/tax-payment/credit-card-sales-data-list
// Organization: 0006
// 인증 방식: 공동인증서 (certFile, keyFile, certPassword)
// ============================================

export async function getCreditCardSalesData(
  certFile: string,        // Base64 인코딩된 인증서 DER 또는 PFX 파일
  certPassword: string,    // 인증서 비밀번호 (평문 - 내부에서 RSA 암호화)
  keyFile: string,         // Base64 인코딩된 키 파일 (DER/KEY 방식일 때)
  certType: string,        // "1": DER/KEY, "pfx": PFX
  year: string,            // YYYY 형식
  startQuarter: string,    // 조회시작 분기 "1", "2", "3", "4"
  endQuarter: string       // 조회종료 분기 "1", "2", "3", "4"
): Promise<{ salesData: CreditCardSalesData | null; isSandboxFallback: boolean }> {
  const config = getCodefConfig();
  const encryptedPassword = encryptRSAWithForge(config.publicKey, certPassword);

  const params = {
    organization: CODEF_ORGANIZATION.CREDIT_CARD_SALES,  // 0006
    certFile,
    certPassword: encryptedPassword,
    keyFile: keyFile || '',
    certType: certType || '1',
    year,
    startDate: startQuarter,    // 분기 번호 ("1"~"4")
    endDate: endQuarter,        // 분기 번호 ("1"~"4")
  };

  const response = await requestProductForCertApi<CreditCardSalesData | CreditCardSalesData[]>(
    CODEF_ENDPOINTS.CREDIT_CARD_SALES,
    params
  );

  const isSandboxFallback = !!(response as any)._fallback;

  if (response.result.code !== 'CF-00000') {
    if (isSandboxFallback) {
      console.warn('getCreditCardSalesData: SANDBOX 폴백 에러, 빈 데이터 반환:', response.result.code);
      return { salesData: null, isSandboxFallback };
    }
    console.error('Credit card sales data error:', response.result);
    throw new Error(`CODEF 오류 [${response.result.code}]: ${response.result.message || '알 수 없는 오류'}`);
  }

  // SANDBOX는 data를 배열로 반환 (각 항목이 CreditCardSalesHistoryItem 형태)
  // DEMO/정식은 data를 객체로 반환 (resSalesHistoryList, resTotalList, resSalesHistoryList1 포함)
  const rawData = response.data;

  if (!rawData) {
    return { salesData: null, isSandboxFallback };
  }

  // 배열 응답인 경우 (SANDBOX): CreditCardSalesData 구조로 변환
  if (Array.isArray(rawData)) {
    console.log('CODEF: SANDBOX 배열 응답 -> CreditCardSalesData 구조로 변환');
    const salesData: CreditCardSalesData = {
      resSalesHistoryList: rawData.map((item: any) => ({
        resYearMonth: item.resYearMonth || '',
        resCount: item.resCount || '0',
        resTotalAmount: item.resTotalAmount || '0',
        resPaymentAmt: item.resPaymentAmt || '0',
        resPaymentAmt1: item.resPaymentAmt1 || '0',
        resCashBack: item.resCashBack || '0',
      })),
      resTotalList: [],
      resSalesHistoryList1: [],
    };
    return { salesData, isSandboxFallback };
  }

  // 객체 응답인 경우 (DEMO/정식): 그대로 사용
  return { salesData: rawData as CreditCardSalesData, isSandboxFallback };
}

// ============================================
// 전자세금계산서 상세 (공동인증서 기반)
// Endpoint: /v1/kr/public/nt/tax-invoice/info-detail
// Organization: 0002
// ============================================

export async function getTaxInvoiceDetailWithCert(
  certFile: string,
  certPassword: string,
  keyFile: string,
  certType: string,
  startDate: string,     // YYYYMMDD
  endDate: string,       // YYYYMMDD
  identity?: string
): Promise<{ data: TaxInvoiceDetailItem[]; isSandboxFallback: boolean }> {
  const config = getCodefConfig();
  const encryptedPassword = encryptRSAWithForge(config.publicKey, certPassword);

  const params: Record<string, string> = {
    organization: CODEF_ORGANIZATION.HOMETAX,  // 0002
    loginType: '0',          // 인증서 로그인
    certFile,
    keyFile: keyFile || '',
    certPassword: encryptedPassword,
    certType: certType || '1',
    approvalNo: '',          // 승인번호 (빈값 = 전체)
    identity: identity || '',
    originDataYN: '0',       // 원문 DATA 미포함
  };

  const response = await requestProductForCertApi<TaxInvoiceDetailItem[] | TaxInvoiceDetailItem>(
    CODEF_ENDPOINTS.TAX_INVOICE_DETAIL,
    params
  );

  const isSandboxFallback = !!(response as any)._fallback;

  if (response.result.code !== 'CF-00000') {
    // SANDBOX 폴백 시 에러는 빈 데이터로 처리 (SANDBOX가 인증서 로그인 미지원)
    if (isSandboxFallback) {
      console.warn('Tax invoice detail: SANDBOX 폴백 에러, 빈 데이터 반환:', response.result.code);
      return { data: [], isSandboxFallback };
    }
    console.error('Tax invoice detail error:', response.result);
    throw new Error(`CODEF 오류 [${response.result.code}]: ${response.result.message || '알 수 없는 오류'}`);
  }

  const rawData = response.data;
  if (!rawData) return { data: [], isSandboxFallback };

  const items = Array.isArray(rawData) ? rawData : [rawData];

  // API는 startDate/endDate 입력을 지원하지 않으므로 (approvalNo 기반 조회)
  // 반환된 데이터에서 commStartDate/resReportingDate 기준으로 날짜 필터링
  if (startDate || endDate) {
    const filtered = items.filter((item: TaxInvoiceDetailItem) => {
      const itemDate = item.resReportingDate || item.commStartDate || '';
      if (startDate && itemDate < startDate) return false;
      if (endDate && itemDate > endDate) return false;
      return true;
    });
    return { data: filtered, isSandboxFallback };
  }

  return { data: items, isSandboxFallback };
}

// ============================================
// 전자세금계산서 통계 (공동인증서 기반)
// ============================================

export async function getTaxInvoiceStatisticsWithCert(
  certFile: string,
  certPassword: string,
  keyFile: string,
  certType: string,
  yearMonth: string,     // YYYYMM
  identity?: string
): Promise<{ data: TaxInvoiceStatisticsItem[]; isSandboxFallback: boolean }> {
  const config = getCodefConfig();
  const encryptedPassword = encryptRSAWithForge(config.publicKey, certPassword);

  const params: Record<string, string> = {
    organization: CODEF_ORGANIZATION.HOMETAX,  // 0002
    loginType: '0',          // 인증서 로그인
    certFile,
    keyFile: keyFile || '',
    certPassword: encryptedPassword,
    certType: certType || '1',
    inquiryType: '01',       // 전자세금계산서
    searchType: '01',        // 월별
    startDate: yearMonth,
    endDate: yearMonth,
    type: '1',               // 상세 포함
    identity: identity || '',
    telecom: '',
  };

  const response = await requestProductForCertApi<TaxInvoiceStatisticsItem[] | TaxInvoiceStatisticsItem>(
    CODEF_ENDPOINTS.TAX_INVOICE_STATISTICS,
    params
  );

  const isSandboxFallback = !!(response as any)._fallback;

  if (response.result.code !== 'CF-00000') {
    if (isSandboxFallback) {
      console.warn('Tax invoice statistics: SANDBOX 폴백 에러, 빈 데이터 반환:', response.result.code);
      return { data: [], isSandboxFallback };
    }
    console.error('Tax invoice statistics (cert) error:', response.result);
    throw new Error(`CODEF 오류 [${response.result.code}]: ${response.result.message || '알 수 없는 오류'}`);
  }

  const rawData = response.data;
  if (!rawData) return { data: [], isSandboxFallback };

  const items = Array.isArray(rawData) ? rawData : [rawData];
  return { data: items, isSandboxFallback };
}

// ============================================
// 현금영수증 매입내역 (공동인증서 기반)
// ============================================

export async function getCashReceiptPurchaseWithCert(
  certFile: string,
  certPassword: string,
  keyFile: string,
  certType: string,
  startDate: string,     // YYYYMMDD
  endDate: string,       // YYYYMMDD
  identity?: string
): Promise<{ data: CashReceiptPurchaseItem[]; isSandboxFallback: boolean }> {
  const config = getCodefConfig();
  const encryptedPassword = encryptRSAWithForge(config.publicKey, certPassword);

  const params: Record<string, string> = {
    organization: CODEF_ORGANIZATION.CASH_RECEIPT,  // 0003
    loginType: '0',          // 인증서 로그인
    certFile,
    keyFile: keyFile || '',
    certPassword: encryptedPassword,
    certType: certType || '1',
    startDate,
    endDate,
    orderBy: '0',            // 최신순
    inquiryType: '0',        // 전체
    identity: identity || '',
    telecom: '',
  };

  const response = await requestProductForCertApi<CashReceiptPurchaseItem[] | CashReceiptPurchaseItem>(
    CODEF_ENDPOINTS.CASH_RECEIPT_PURCHASE,
    params
  );

  const isSandboxFallback = !!(response as any)._fallback;

  if (response.result.code !== 'CF-00000') {
    if (isSandboxFallback) {
      console.warn('Cash receipt purchase: SANDBOX 폴백 에러, 빈 데이터 반환:', response.result.code);
      return { data: [], isSandboxFallback };
    }
    console.error('Cash receipt purchase (cert) error:', response.result);
    throw new Error(`CODEF 오류 [${response.result.code}]: ${response.result.message || '알 수 없는 오류'}`);
  }

  const rawData = response.data;
  if (!rawData) return { data: [], isSandboxFallback };

  const items = Array.isArray(rawData) ? rawData : [rawData];
  return { data: items, isSandboxFallback };
}

// ============================================
// 사업용 신용카드 매입세액 공제 확인/변경 조회 (공동인증서 기반)
// Endpoint: /v1/kr/public/nt/cash-receipt/deduction-of-business-credit-card-purchase-amount
// Organization: 0003
// ============================================

export async function getBusinessCardDeductionWithCert(
  certFile: string,
  certPassword: string,
  keyFile: string,
  certType: string,
  searchType: string,    // "0": 일별, "1": 월별, "2": 분기별
  startDate: string,     // searchType에 따라: "0"→YYYYMMDD, "1"→YYYYMM, "2"→YYYY+분기(ex.20191)
  inquiryType?: string,  // "0": 전체, "1": 공제대상, "2": 불공제대상
  detailYN?: string,     // "0": 미포함, "1": 카드정보 포함
  identity?: string
): Promise<{ data: BusinessCardDeductionItem[]; isSandboxFallback: boolean }> {
  const config = getCodefConfig();
  const encryptedPassword = encryptRSAWithForge(config.publicKey, certPassword);

  const params: Record<string, string> = {
    organization: CODEF_ORGANIZATION.CASH_RECEIPT,  // 0003
    loginType: '0',          // 인증서 로그인
    certFile,
    keyFile: keyFile || '',
    certPassword: encryptedPassword,
    certType: certType || '1',
    searchType,
    startDate,
    inquiryType: inquiryType || '0',
    detailYN: detailYN || '0',
    identity: identity || '',
    telecom: '',
  };

  const response = await requestProductForCertApi<BusinessCardDeductionItem[] | BusinessCardDeductionItem>(
    CODEF_ENDPOINTS.BUSINESS_CARD_DEDUCTION,
    params
  );

  const isSandboxFallback = !!(response as any)._fallback;

  if (response.result.code !== 'CF-00000') {
    if (isSandboxFallback) {
      console.warn('Business card deduction: SANDBOX 폴백 에러, 빈 데이터 반환:', response.result.code);
      return { data: [], isSandboxFallback };
    }
    console.error('Business card deduction (cert) error:', response.result);
    throw new Error(`CODEF 오류 [${response.result.code}]: ${response.result.message || '알 수 없는 오류'}`);
  }

  const rawData = response.data;
  if (!rawData) return { data: [], isSandboxFallback };

  const items = Array.isArray(rawData) ? rawData : [rawData];
  return { data: items, isSandboxFallback };
}

export function getActualCodefServiceType(): string {
  const actualType = getActualServiceType();
  switch (actualType) {
    case 0: return '정식';
    case 1: return '데모';
    default: return '샌드박스';
  }
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
    const { data: taxStats } = await getTaxInvoiceStatistics(hometaxId, hometaxPassword, yearMonth);
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
    const { data: cashPurchase } = await getCashReceiptPurchaseDetails(hometaxId, hometaxPassword, startDate, endDate);
    syncedCount.cashReceiptPurchase = cashPurchase.length;
  } catch (error) {
    errors.push(`현금영수증 매입 조회 실패: ${error}`);
  }

  // 3. 현금영수증 매출내역
  try {
    const { data: cashSales } = await getCashReceiptSalesDetails(hometaxId, hometaxPassword, startDate, endDate);
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
  const envType = (process.env.CODEF_SERVICE_TYPE || 'SANDBOX').trim().toUpperCase();
  // 실제 환경변수 기준으로 표시 (DEMO→SANDBOX 자동 전환과 무관하게)
  switch (envType) {
    case 'PRODUCT':
    case '0':
      return '정식';
    case 'DEMO':
    case '1':
      return '데모(샌드박스)';
    default:
      return '샌드박스';
  }
}
