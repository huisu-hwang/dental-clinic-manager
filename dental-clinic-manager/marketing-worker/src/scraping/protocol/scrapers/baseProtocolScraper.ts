import { HttpSession } from '../../types/scrapingContext.js';
import { httpPost } from '../httpClient.js';
import { createChildLogger } from '../../utils/logger.js';
import { ScrapeResult } from '../../hometax/scrapers/baseScraper.js';

const log = createChildLogger('baseProtocolScraper');

/** WebSquare XML Action 요청 (홈택스 데이터 조회 공통 패턴) */
export async function queryData(
  session: HttpSession,
  actionUrl: string,
  xmlPayload: string,
): Promise<string> {
  const res = await httpPost(
    session,
    actionUrl,
    xmlPayload,
    'xml',
    {
      'X-Requested-With': 'XMLHttpRequest',
      'AJAX': 'true',
    },
  );

  if (res.status !== 200) {
    throw new Error(`데이터 조회 실패: ${res.status} - ${actionUrl}`);
  }

  return res.body;
}

/** WebSquare JSON Action 요청 */
export async function queryJsonData(
  session: HttpSession,
  actionUrl: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await httpPost(
    session,
    actionUrl,
    payload,
    'json',
    {
      'X-Requested-With': 'XMLHttpRequest',
      'AJAX': 'true',
    },
  );

  if (res.status !== 200) {
    throw new Error(`데이터 조회 실패: ${res.status} - ${actionUrl}`);
  }

  try {
    return JSON.parse(res.body);
  } catch {
    return { _raw: res.body };
  }
}

/** 기간 파라미터 생성 (YYYYMMDD 형식) */
export function buildPeriodParams(year: number, month: number): { startDate: string; endDate: string } {
  const startDate = `${year}${String(month).padStart(2, '0')}01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}${String(month).padStart(2, '0')}${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

/** JSON 응답에서 리스트 데이터 추출 (홈택스 공통 응답 구조) */
export function extractListFromResponse(data: Record<string, unknown>): Record<string, unknown>[] {
  // 홈택스 응답은 보통 { list: [...] } 또는 { data: { list: [...] } } 형태
  if (Array.isArray(data.list)) return data.list as Record<string, unknown>[];
  if (Array.isArray(data.data)) return data.data as Record<string, unknown>[];

  // 중첩 구조 탐색
  for (const value of Object.values(data)) {
    if (typeof value === 'object' && value !== null) {
      const nested = value as Record<string, unknown>;
      if (Array.isArray(nested.list)) return nested.list as Record<string, unknown>[];
      if (Array.isArray(nested.data)) return nested.data as Record<string, unknown>[];
    }
  }

  // 응답 자체가 배열일 수 있음
  if (Array.isArray(data)) return data as unknown as Record<string, unknown>[];

  log.warn({ keys: Object.keys(data) }, '리스트 데이터를 찾을 수 없음');
  return [];
}

/** 페이지네이션 처리 (Protocol 모드) */
export async function queryAllPages(
  session: HttpSession,
  actionUrl: string,
  basePayload: Record<string, unknown>,
  maxPages: number = 50,
): Promise<Record<string, unknown>[]> {
  const allRecords: Record<string, unknown>[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const payload = {
      ...basePayload,
      pageNum: page,
      pageSize: 100,
    };

    const response = await queryJsonData(session, actionUrl, payload);
    const records = extractListFromResponse(response);

    if (records.length === 0) break;

    allRecords.push(...records);

    // 전체 건수 확인
    const totalCount = Number(response.totalCount || response.total_count || response.cnt || 0);
    if (totalCount > 0 && allRecords.length >= totalCount) break;

    log.debug({ page, fetched: records.length, total: allRecords.length }, '페이지 데이터 수집');
  }

  return allRecords;
}

/** 금액 파싱 */
export function parseAmount(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    return parseInt(value.replace(/[,원\s]/g, ''), 10) || 0;
  }
  return 0;
}

/** ScrapeResult 빌더 */
export function buildResult(
  dataType: string,
  records: Record<string, unknown>[],
  year: number,
  month: number,
): ScrapeResult {
  return {
    dataType,
    records,
    totalCount: records.length,
    scrapedAt: new Date().toISOString(),
    period: { year, month },
  };
}
