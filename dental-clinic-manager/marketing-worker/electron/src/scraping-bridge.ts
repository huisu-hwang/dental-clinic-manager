import os from 'os';
import { ScrapingApiClient, ScrapingJob, HometaxCredentials } from './scraping-api-client';
import { getConfig } from './config-store';
import { log } from './logger';

// ============================================
// 스크래핑 Job 처리 브리지
// ============================================

export type ScrapingStatus = 'idle' | 'polling' | 'scraping' | 'error';

type StatusCallback = (status: ScrapingStatus, message?: string) => void;

let scrapingClient: ScrapingApiClient | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let currentStatus: ScrapingStatus = 'idle';
const statusCallbacks: StatusCallback[] = [];

const POLL_INTERVAL = 10000;      // 10초마다 Job 폴링
const HEARTBEAT_INTERVAL = 30000; // 30초마다 heartbeat

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
  log('info', '[Scraping] 스크래핑 워커 시작');
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
  const credentials = await scrapingClient!.getCredentials(job.clinic_id);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { chromium } = require('playwright');
  const cfg = getConfig();
  const browser = await chromium.launch({ headless: cfg.headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await loginToHometax(page, credentials);

    for (const dataType of job.data_types) {
      try {
        const data = await scrapeDataType(page, dataType, job.date_from, job.date_to);

        await scrapingClient!.saveScrapedData({
          job_id: job.id,
          clinic_id: job.clinic_id,
          data_type: dataType,
          date_from: job.date_from,
          date_to: job.date_to,
          raw_data: data,
          record_count: data.length,
        });

        log('info', `[Scraping] ${dataType} 수집 완료: ${data.length}건`);
      } catch (err) {
        log('error', `[Scraping] ${dataType} 수집 실패: ${err}`);
      }
    }

    await scrapingClient!.updateJobStatus(job.id, 'completed', {
      result_summary: { data_types_completed: job.data_types.length },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', `[Scraping] Job 실패: ${msg}`);
    await scrapingClient!.updateJobStatus(job.id, 'failed', { error_message: msg });
  } finally {
    await browser.close();
  }
}

async function loginToHometax(page: any, credentials: HometaxCredentials): Promise<void> {
  // 세션 쿠키가 있으면 복원 시도
  if (credentials.session_data?.cookies) {
    try {
      await page.context().addCookies(credentials.session_data.cookies);
      await page.goto(
        'https://www.hometax.go.kr/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml'
      );
      await page.waitForTimeout(3000);
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
  await page.goto(
    'https://www.hometax.go.kr/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml'
  );
  await page.waitForTimeout(3000);

  await page.click('#anchor2');
  await page.waitForTimeout(1000);

  await page.fill('#iptUserId', credentials.hometax_user_id);
  await page.fill('#iptUserPw', credentials.password);
  await page.waitForTimeout(500);

  await page.click('#anchor_login_btn02');
  await page.waitForTimeout(5000);

  const logoutCount = await page.locator('text=로그아웃').count();
  if (logoutCount === 0) {
    throw new Error('홈택스 로그인 실패');
  }
  log('info', '[Scraping] ID/PW 로그인 성공');
}

async function scrapeDataType(
  page: any,
  dataType: string,
  dateFrom: string,
  dateTo: string
): Promise<any[]> {
  // TODO: 기존 scraping-worker/src/hometax/scrapers/ 로직을 import하여 사용
  // 현재는 기본 구조만 제공 (placeholder)
  log('info', `[Scraping] ${dataType} 수집 시작 (${dateFrom} ~ ${dateTo})`);
  return [];
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
