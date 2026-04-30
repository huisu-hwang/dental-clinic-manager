import os from 'os';
import { ScrapingApiClient, ScrapingJob, HometaxCredentials } from './scraping-api-client';
import { getConfig } from './config-store';
import { log } from './logger';
import { scrapeHometaxData, returnToMain } from './hometax-scrapers';

// ============================================
// 스크래핑 Job 처리 브리지 (사용자 PC 워커)
// scraping-jobs를 폴링하여 홈택스 스크래핑 후 대시보드 API로 전송
// ============================================

const HOMETAX_MAIN = 'https://www.hometax.go.kr/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml';

export type ScrapingStatus = 'idle' | 'polling' | 'scraping' | 'error';

type StatusCallback = (status: ScrapingStatus, message?: string) => void;

let scrapingClient: ScrapingApiClient | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let currentStatus: ScrapingStatus = 'idle';
const statusCallbacks: StatusCallback[] = [];

const POLL_INTERVAL = 10000;
const HEARTBEAT_INTERVAL = 30000;

export function startScraping(): void {
  const cfg = getConfig();
  if (!cfg.dashboardUrl || !cfg.workerApiKey) {
    log('error', '[Scraping] 설정 미완료: dashboardUrl 또는 workerApiKey 없음');
    return;
  }

  scrapingClient = new ScrapingApiClient(cfg.dashboardUrl, cfg.workerApiKey);

  heartbeatTimer = setInterval(() => sendHeartbeat(), HEARTBEAT_INTERVAL);
  pollTimer = setInterval(() => pollForJobs(), POLL_INTERVAL);
  setStatus('polling');
  log('info', '[Scraping] 스크래핑 워커 시작 (사용자 PC)');
}

export function stopScraping(): void {
  if (pollTimer) clearInterval(pollTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  pollTimer = null;
  heartbeatTimer = null;
  scrapingClient = null;
  setStatus('idle');
  log('info', '[Scraping] 스크래핑 워커 중지');
}

export function getScrapingStatus(): ScrapingStatus {
  return currentStatus;
}

export function onScrapingStatusChange(cb: StatusCallback): void {
  statusCallbacks.push(cb);
}

function setStatus(status: ScrapingStatus, message?: string): void {
  currentStatus = status;
  statusCallbacks.forEach((cb) => cb(status, message));
}

async function pollForJobs(): Promise<void> {
  if (!scrapingClient || currentStatus === 'scraping') return;

  try {
    const job = await scrapingClient.fetchPendingJob();
    if (!job) return;

    setStatus('scraping', `"${job.data_types.join(', ')}" 수집 중...`);
    await processJob(job);
    setStatus('polling');
  } catch (err) {
    log('error', `[Scraping] 폴링 오류: ${err}`);
  }
}

async function processJob(job: ScrapingJob): Promise<void> {
  let credentials: HometaxCredentials;
  try {
    credentials = await scrapingClient!.getCredentials(job.clinic_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', `[Scraping] 인증정보 조회 실패: ${msg}`);
    await scrapingClient!.updateJobStatus(job.id, 'failed', { error_message: `인증정보 조회 실패: ${msg}` });
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { chromium } = require('playwright');
  const cfg = getConfig();
  const browser = await chromium.launch({ headless: cfg.headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results: Record<string, { success: boolean; count: number; error?: string }> = {};

  try {
    // 로그인 (한 번만)
    await loginToHometax(page, credentials);

    // 메인 페이지 최초 로드 후 모든 데이터 타입 순차 처리
    await page.goto(HOMETAX_MAIN, { waitUntil: 'load', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    for (let i = 0; i < job.data_types.length; i++) {
      const dataType = job.data_types[i];
      try {
        const result = await scrapeHometaxData(page, dataType, job.target_year, job.target_month);

        await scrapingClient!.saveScrapedData({
          jobId: job.id,
          clinicId: job.clinic_id,
          dataType,
          year: job.target_year,
          month: job.target_month,
          rawData: result.records,
          summary: { totalCount: result.totalCount },
        });

        results[dataType] = { success: true, count: result.totalCount };
        log('info', `[Scraping] ${dataType} 수집 완료: ${result.totalCount}건`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log('error', `[Scraping] ${dataType} 수집 실패: ${msg}`);
        results[dataType] = { success: false, count: 0, error: msg };
      }

      // 다음 데이터 타입을 위해 메인 페이지 복귀 (마지막 제외)
      if (i < job.data_types.length - 1) {
        await returnToMain(page).catch(() => {});
      }
    }

    // 모든 데이터 타입의 성공 여부 집계
    const allSuccess = Object.values(results).every((r) => r.success);
    const partialSuccess = Object.values(results).some((r) => r.success);
    const totalRecords = Object.values(results).reduce((sum, r) => sum + r.count, 0);

    if (allSuccess || partialSuccess) {
      await scrapingClient!.updateJobStatus(job.id, 'completed', {
        result_summary: {
          results,
          totalRecords,
          partialFailure: !allSuccess,
        },
      });
    } else {
      const failedTypes = Object.entries(results)
        .filter(([, r]) => !r.success)
        .map(([dt]) => dt)
        .join(', ');
      await scrapingClient!.updateJobStatus(job.id, 'failed', {
        error_message: `모든 데이터 타입 스크래핑 실패: ${failedTypes}`,
        result_summary: { results },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', `[Scraping] Job 실패: ${msg}`);
    await scrapingClient!.updateJobStatus(job.id, 'failed', { error_message: msg }).catch(() => {});
  } finally {
    await browser.close().catch(() => {});
  }
}

async function loginToHometax(page: any, credentials: HometaxCredentials): Promise<void> {
  // 세션 쿠키가 있으면 복원 시도
  if (credentials.session_data?.cookies) {
    try {
      await page.context().addCookies(credentials.session_data.cookies);
      await page.goto(HOMETAX_MAIN, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);
      const logoutCount = await page.locator('text=로그아웃').count();
      if (logoutCount > 0) {
        log('info', '[Scraping] 세션 쿠키로 로그인 성공');
        return;
      }
    } catch {
      log('info', '[Scraping] 세션 쿠키 만료, 재로그인...');
    }
  }

  // ID/PW 로그인
  await page.goto(HOMETAX_MAIN, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1500);

  // 아이디 로그인 탭
  await page.click('#anchor2');
  await page.waitForTimeout(500);

  // 입력
  await page.fill('#iptUserId', credentials.hometax_user_id);
  await page.fill('#iptUserPw', credentials.password);
  await page.waitForTimeout(300);

  // 로그인 버튼
  await page.click('#anchor_login_btn02');

  // 로그인 결과 대기 — 이벤트 기반 (최대 15초)
  try {
    await page.waitForSelector('text=로그아웃', { timeout: 15000 });
    log('info', '[Scraping] ID/PW 로그인 성공');
  } catch {
    throw new Error('홈택스 로그인 실패 — 로그아웃 버튼을 찾을 수 없음');
  }
}

async function sendHeartbeat(): Promise<void> {
  if (!scrapingClient) return;
  try {
    const result = await scrapingClient.sendHeartbeat(
      `electron-${os.hostname()}`,
      currentStatus === 'scraping' ? 'busy' : 'online'
    );
    if (result.stop_requested) {
      log('info', '[Scraping] 서버에서 중지 요청 수신');
      stopScraping();
    }
  } catch {
    // heartbeat 실패는 무시
  }
}
