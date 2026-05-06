import os from 'os';
import { ScrapingApiClient, ScrapingJob, HometaxCredentials } from './scraping-api-client';
import { getConfig } from './config-store';
import { log } from './logger';
import { scrapeHometaxData, returnToMain } from './hometax-scrapers';

// ============================================
// 스크래핑 Job 처리 브리지 (사용자 PC 워커)
// scraping-jobs를 폴링하여 홈택스 스크래핑 후 대시보드 API로 전송
// ============================================

// 홈택스 진입점: 종합소득세 시즌에는 루트가 splash 페이지(agitx_index.html?isCdn=Y)로 redirect됨.
// 진짜 SPA URL(`websquare.html?w2xPath=...&menuCd=index3`)로 직접 진입하면 splash 우회 가능.
// splash로 빠지면 "홈택스 바로가기" 박스(TH4BOX)를 클릭해서 진짜 SPA로 이동.
const HOMETAX_MAIN = 'https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3';

export type ScrapingStatus = 'idle' | 'polling' | 'scraping' | 'error';

type StatusCallback = (status: ScrapingStatus, message?: string) => void;

let scrapingClient: ScrapingApiClient | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let currentStatus: ScrapingStatus = 'idle';
const statusCallbacks: StatusCallback[] = [];

// 폴링 주기를 짧게 가져가서 사용자가 동기화를 누른 직후 빠르게 픽업
const POLL_INTERVAL = 3000;
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
  // 홈택스가 HeadlessChrome user-agent를 차단하므로 일반 Chrome user-agent로 위장.
  // ERR_CONNECTION_RESET 차단 회피.
  const browser = await chromium.launch({
    headless: cfg.headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  // navigator.webdriver 제거로 추가 봇 감지 우회
  await context.addInitScript(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    Object.defineProperty(globalThis.navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();

  const results: Record<string, { success: boolean; count: number; error?: string }> = {};

  try {
    // 로그인 (한 번만) — 로그인 후 page는 이미 메인에 진입한 상태
    await loginToHometax(page, credentials);

    // fn_topMenuOpen 사용 가능 상태 확인 — 사용 가능하면 별도 메인 페이지 재로드 불필요
    const ready = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return typeof (globalThis as any).$c?.pp?.fn_topMenuOpen === 'function';
    }).catch(() => false);

    if (!ready) {
      log('info', '[Scraping] WebSquare 미초기화 — 메인 페이지 재로드');
      await page.goto(HOMETAX_MAIN, { waitUntil: 'load', timeout: 30000 });
      await page
        .locator('text=로그아웃')
        .first()
        .waitFor({ state: 'visible', timeout: 8000 })
        .catch(() => {});
    }

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

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 가시성 기반 클릭 + JS 폴백 */
async function safeClick(page: any, selectors: string[], description: string, timeout = 8000): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      await locator.click({ timeout });
      log('info', `[Scraping/login] 클릭 성공 (${description}): ${selector}`);
      return true;
    } catch {
      try {
        const clicked = await page.evaluate((sel: string) => {
          const doc = (globalThis as any).document;
          const elements = doc.querySelectorAll(sel);
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as any;
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 || rect.height > 0 || el.offsetParent !== null) {
              el.click();
              return true;
            }
          }
          if (elements.length > 0) {
            (elements[0] as any).click();
            return true;
          }
          return false;
        }, selector);
        if (clicked) {
          log('info', `[Scraping/login] 클릭 성공 (JS, ${description}): ${selector}`);
          return true;
        }
      } catch {
        // continue
      }
    }
  }
  return false;
}

/** 가시성 기반 입력 + JS 폴백 */
async function safeType(page: any, selectors: string[], text: string, description: string): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: 4000 });
      await locator.click({ timeout: 3000 });
      await locator.fill('');
      await page.keyboard.type(text, { delay: 30 });
      log('info', `[Scraping/login] 입력 성공 (${description})`);
      return true;
    } catch {
      try {
        const ok = await page.evaluate((args: { sel: string; val: string }) => {
          const doc = (globalThis as any).document;
          const win = globalThis as any;
          const el = doc.querySelector(args.sel);
          if (!el) return false;
          el.focus();
          const setter = win.Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(el, args.val);
          else el.value = args.val;
          el.dispatchEvent(new win.Event('input', { bubbles: true }));
          el.dispatchEvent(new win.Event('change', { bubbles: true }));
          el.dispatchEvent(new win.Event('keyup', { bubbles: true }));
          return true;
        }, { sel: selector, val: text });
        if (ok) {
          log('info', `[Scraping/login] 입력 성공 (JS, ${description})`);
          return true;
        }
      } catch {
        // continue
      }
    }
  }
  return false;
}

async function loginToHometax(page: any, credentials: HometaxCredentials): Promise<void> {
  // 1) 세션 쿠키 복원 시도
  if (credentials.session_data?.cookies) {
    try {
      await page.context().addCookies(credentials.session_data.cookies);
      await page.goto(HOMETAX_MAIN, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1200);
      const logoutCount = await page.locator('text=로그아웃').count();
      if (logoutCount > 0) {
        log('info', '[Scraping/login] 세션 쿠키로 로그인 성공');
        return;
      }
    } catch {
      log('info', '[Scraping/login] 세션 쿠키 만료, 재로그인...');
    }
  }

  // 2) ID/PW 로그인 — 메인 페이지(`/ui/pp/index_pp.xml`)에 이미 임베드된 로그인 박스 활용
  // 헤더 "로그인" 버튼은 클릭하지 않음 — 메인에 이미 로그인 박스가 있고,
  // 헤더 클릭 시 다른 화면으로 navigate되어 ID 필드가 사라지는 문제 발생.
  // 홈택스가 가끔 첫 connection을 ERR_CONNECTION_RESET으로 차단하므로 retry 적용.
  let gotoErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(HOMETAX_MAIN, { waitUntil: 'load', timeout: 30000 });
      gotoErr = null;
      break;
    } catch (err) {
      gotoErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      log('warn', `[Scraping/login] page.goto 실패 (시도 ${attempt}/3): ${msg}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  if (gotoErr) throw gotoErr;
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  // 종합소득세 시즌 splash 페이지(agitx_index.html) 자동 우회.
  // "홈택스 바로가기" 박스(TH4BOX)를 클릭하면 진짜 SPA로 이동.
  if (page.url().includes('agitx_index.html')) {
    log('info', '[Scraping/login] splash 페이지 감지 — 홈택스 바로가기 클릭');
    const bypassed = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const candidates = ['TH4BOX', 'RD3BOX'];
      for (const id of candidates) {
        const box = doc.getElementById(id);
        if (!box) continue;
        const a = box.querySelector('a');
        if (a) { a.click(); return id; }
      }
      // 폴백: "홈택스 바로가기" 텍스트로 검색
      const all = doc.querySelectorAll('a');
      for (const el of Array.from(all) as any[]) {
        if ((el.textContent || '').includes('홈택스')) { el.click(); return 'text-fallback'; }
      }
      return null;
    }).catch(() => null);
    if (bypassed) {
      log('info', `[Scraping/login] splash 우회 클릭: ${bypassed}`);
      await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    } else {
      log('warn', '[Scraping/login] splash 우회 실패 — 진짜 SPA URL로 직접 이동 재시도');
      await page.goto('https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3', { waitUntil: 'load', timeout: 30000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    }
  }

  // 보안 팝업 닫기 (있으면)
  for (const sel of ['.popup_close', '.btn_close', 'button:has-text("닫기")', 'a:has-text("닫기")']) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) {
        await loc.click({ timeout: 1500 }).catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  // SPA 동적 로딩 안정화 — 로그인 박스(공동/간편/아이디)가 보일 때까지 대기.
  // 홈택스는 첫 응답으로 CDN wrapper(agitx_index.html?isCdn=Y)를 보내고
  // 그 안의 JS가 비동기로 진짜 SPA를 fetch하는 2단계 로딩 구조.
  // 핵심 element가 안 보이면 reload로 SPA 강제 갱신.
  const idLoginSelector = '[id*="loginboxFrame_anchor24"], a:has-text("아이디 로그인")';
  let loginBoxReady = await page
    .locator(idLoginSelector)
    .first()
    .waitFor({ state: 'visible', timeout: 30000 })
    .then(() => true)
    .catch(() => false);

  if (!loginBoxReady) {
    log('warn', '[Scraping/login] CDN wrapper 감지 가능성 — 강제 reload 후 재대기');
    await page.reload({ waitUntil: 'load', timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    loginBoxReady = await page
      .locator(idLoginSelector)
      .first()
      .waitFor({ state: 'visible', timeout: 30000 })
      .then(() => true)
      .catch(() => false);
  }

  if (!loginBoxReady) {
    // 그래도 안 보이면 진단 후 진행 (TreeWalker 폴백 시도)
    const diag = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      return {
        url: location.href,
        title: doc.title,
        htmlLen: doc.body?.innerHTML?.length || 0,
        anchorCount: doc.querySelectorAll('a').length,
      };
    }).catch(() => null);
    log('error', `[Scraping/login] 로그인 박스 미발견 — 진단: ${JSON.stringify(diag)}`);
  }

  // "아이디 로그인" 탭 클릭 — 정확한 ID 우선 + TreeWalker 폴백
  const idTabClicked = await safeClick(
    page,
    [
      '#mf_txppWframe_loginboxFrame_anchor24',
      'a[id*="loginboxFrame_anchor24"]',
      'a.w2group.ico12.txt',
      'a:has-text("아이디 로그인")',
      'text=아이디 로그인',
    ],
    '아이디 로그인 탭',
    8000,
  );

  if (!idTabClicked) {
    // TreeWalker 폴백 — 직접 텍스트 매칭
    await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const win = globalThis as any;
      const doc = win.document;
      const walker = doc.createTreeWalker(doc.body, win.NodeFilter.SHOW_ELEMENT);
      let node: any = walker.currentNode;
      while (node) {
        const el = node as any;
        const directText = Array.from(el.childNodes as any[])
          .filter((n: any) => n.nodeType === win.Node.TEXT_NODE)
          .map((n: any) => (n.textContent?.trim() || '') as string)
          .join('');
        if (directText === '아이디 로그인') {
          el.click();
          return;
        }
        node = walker.nextNode();
      }
    }).catch(() => {});
  }

  // ID 입력 필드 visible 대기 → 탭 전환 성공의 핵심 지표
  const idVisible = await page
    .locator('input[id*="iptUserId"], input[name="iptUserId"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false);

  if (!idVisible) {
    log('warn', '[Scraping/login] ID 필드 미발견 — DOM 진단 정보 수집');
    const diag = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const inputs = Array.from(doc.querySelectorAll('input') as any[])
        .filter((el: any) => el.offsetParent !== null)
        .slice(0, 10)
        .map((el: any) => ({ id: el.id, name: el.name, type: el.type, ph: el.placeholder }));
      return { url: location.href, inputCount: inputs.length, sample: inputs };
    }).catch(() => null);
    log('error', `[Scraping/login] DOM 상태: ${JSON.stringify(diag)}`);
  }

  // ID 입력 — 실제 hometax DOM 기준: input[name="iptUserId"] / [id*="iptUserId"]
  const idTyped = await safeType(
    page,
    [
      'input[name="iptUserId"]',
      'input[id*="iptUserId"]',
      'input[id="mf_txppWframe_loginboxFrame_iptUserId"]',
      'input[placeholder*="아이디"]',
    ],
    credentials.hometax_user_id,
    '아이디',
  );
  if (!idTyped) throw new Error('홈택스 로그인 실패: 아이디 입력 필드 미발견');

  // PW 입력
  const pwTyped = await safeType(
    page,
    [
      'input[name="iptUserPw"]',
      'input[id*="iptUserPw"]',
      'input[id="mf_txppWframe_loginboxFrame_iptUserPw"]',
      'input[type="password"]',
    ],
    credentials.password,
    '비밀번호',
  );
  if (!pwTyped) throw new Error('홈택스 로그인 실패: 비밀번호 입력 필드 미발견');

  // 로그인 버튼 클릭 — 다양한 UI 케이스 대응
  const submitClicked = await safeClick(
    page,
    [
      'input[class*="btn_idlogin"]',
      'input[class*="btn_login"]',
      '#mf_txppWframe_loginboxFrame_wq_uuid_923',
      '#mf_txppWframe_loginboxFrame_trigger2',
      '#mf_txppWframe_anchor25',
      'a.logingbtn',
      '#mf_txppWframe_anchor48',
      'button:has-text("로그인")',
    ],
    '로그인 제출 버튼',
    8000,
  );
  if (!submitClicked) throw new Error('홈택스 로그인 실패: 로그인 제출 버튼 미발견');

  // 2차 인증 (주민등록번호) 대응 — 팝업 감지 시에만 처리
  const has2FA = await page
    .locator('text=아이디 로그인 2차 인증')
    .first()
    .waitFor({ state: 'visible', timeout: 2500 })
    .then(() => true)
    .catch(() => false);

  if (has2FA) {
    if (!credentials.resident_number) {
      throw new Error('홈택스 로그인 실패: 2차 인증 필요 — 인증 정보에 주민등록번호 등록 필요');
    }
    const birth6 = credentials.resident_number.substring(0, 6);
    const gender1 = credentials.resident_number.substring(6, 7);
    log('info', '[Scraping/login] 2차 인증 — 주민번호 입력');

    await safeType(
      page,
      ['input[id*="birth"]:not([disabled])', '.w2window input[type="text"]', 'input[placeholder*="생년월일"]'],
      birth6,
      '2차 인증 생년월일',
    );

    const gTyped = await safeType(
      page,
      [
        'input[id*="gndr"]:not([disabled])',
        'input[id*="gender"]:not([disabled])',
        '.w2window input[type="password"]',
        'input[placeholder*="뒷자리"]',
      ],
      gender1,
      '2차 인증 성별',
    );

    if (!gTyped) {
      await page.evaluate((val: string) => {
        const doc = (globalThis as any).document;
        const win = globalThis as any;
        const popup = doc.querySelector('.w2window') || doc.body;
        const inputs = Array.from(popup.querySelectorAll('input:not([type="hidden"])') as any[]).filter(
          (el: any) => el.offsetParent !== null || el.offsetWidth > 0,
        );
        const target = inputs.length >= 2 ? inputs[1] : inputs[inputs.length - 1];
        if (target) {
          target.focus();
          const setter = win.Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(target, val);
          else target.value = val;
          target.dispatchEvent(new win.Event('input', { bubbles: true }));
          target.dispatchEvent(new win.Event('change', { bubbles: true }));
        }
      }, gender1).catch(() => {});
    }

    await safeClick(
      page,
      [
        '.w2window input[type="button"].btn',
        '.w2window input.w2trigger.btn',
        '.w2window a:has-text("확인")',
        '.w2window button:has-text("확인")',
        'button:has-text("확인")',
        'a:has-text("확인")',
      ],
      '2차 인증 확인',
      6000,
    );
    await page.waitForTimeout(2000);
  }

  // 로그인 결과 대기 — 로그아웃 버튼 출현
  try {
    await page
      .locator('a:has-text("로그아웃")')
      .or(page.locator('button:has-text("로그아웃")'))
      .or(page.locator('text=로그아웃'))
      .first()
      .waitFor({ state: 'visible', timeout: 20000 });
    log('info', '[Scraping/login] ID/PW 로그인 성공');
  } catch {
    throw new Error('홈택스 로그인 실패: 로그아웃 버튼이 표시되지 않음');
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
