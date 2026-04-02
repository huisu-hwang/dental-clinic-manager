import { Notification } from 'electron';
import { EmailApiClient, EmailMail } from './email-api-client';
import { parseExcelLabExpense } from './lab-expense-parser';
import { getConfig } from './config-store';
import { log } from './logger';

// ============================================
// 이메일 모니터링 브리지
// 30분마다 새 메일 확인 + 자동 처리
// ============================================

export type EmailMonitorStatus = 'idle' | 'polling' | 'processing' | 'error';

type StatusCallback = (status: EmailMonitorStatus, message?: string) => void;

let client: EmailApiClient | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let currentStatus: EmailMonitorStatus = 'idle';
const statusCallbacks: StatusCallback[] = [];

const POLL_INTERVAL = 30 * 60 * 1000; // 30분

function setStatus(status: EmailMonitorStatus, message?: string): void {
  currentStatus = status;
  statusCallbacks.forEach(cb => cb(status, message));
}

export function startEmailMonitor(): void {
  const cfg = getConfig();
  if (!cfg.dashboardUrl || !cfg.workerApiKey) return;

  client = new EmailApiClient();

  // 시작 직후 1회 확인
  checkAndProcess().catch(err => {
    log('error', `[Email] 초기 확인 오류: ${err instanceof Error ? err.message : err}`);
  });

  pollTimer = setInterval(() => {
    checkAndProcess().catch(err => {
      log('error', `[Email] 폴링 오류: ${err instanceof Error ? err.message : err}`);
    });
  }, POLL_INTERVAL);

  setStatus('polling');
  log('info', '[Email] 이메일 모니터링 시작 (30분 주기)');
}

export function stopEmailMonitor(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  client = null;
  setStatus('idle');
  log('info', '[Email] 이메일 모니터링 중지');
}

export function getEmailMonitorStatus(): EmailMonitorStatus {
  return currentStatus;
}

export function onEmailStatusChange(cb: StatusCallback): void {
  statusCallbacks.push(cb);
}

// ============================================
// 메일 확인 + 처리 메인 로직
// ============================================

async function checkAndProcess(): Promise<void> {
  if (!client || currentStatus === 'processing') return;

  setStatus('processing', '메일 확인 중...');

  try {
    // clinicId는 설정에서 가져올 수 없으므로 'default'로 요청
    // 서버 측에서 API Key 기반으로 clinic을 식별한다
    const result = await client.checkForMails('default');

    if (!result.mails || result.mails.length === 0) {
      log('info', '[Email] 새 메일 없음');
      setStatus('polling');
      return;
    }

    log('info', `[Email] 새 메일 ${result.mails.length}건 발견`);

    let labProcessed = 0;
    let taxProcessed = 0;

    for (const mail of result.mails) {
      try {
        if (mail.type === 'lab') {
          await processLabMail(mail);
          labProcessed++;
        } else if (mail.type === 'tax_office') {
          await processTaxOfficeMail(mail);
          taxProcessed++;
        }
      } catch (err) {
        log('error', `[Email] 메일 처리 실패 (${mail.subject}): ${err instanceof Error ? err.message : err}`);
      }
    }

    // 마지막 확인 시각 업데이트
    await client.updateSettings('default', {
      lastCheckedAt: new Date().toISOString(),
    });

    // 결과 알림
    notifyResult(labProcessed, taxProcessed);
    setStatus('polling');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', `[Email] 메일 확인 실패: ${msg}`);
    setStatus('error', msg);

    // 오류 후 다음 폴링까지 polling 상태로 복귀
    setTimeout(() => {
      if (currentStatus === 'error') setStatus('polling');
    }, 5000);
  }
}

// ============================================
// 기공료 메일 처리
// ============================================

async function processLabMail(mail: EmailMail): Promise<void> {
  if (!client) return;

  log('info', `[Email] 기공료 메일 처리: "${mail.subject}"`);

  const excelAttachments = mail.attachments.filter(att =>
    att.name.match(/\.(xlsx?|csv)$/i)
  );

  if (excelAttachments.length === 0) {
    log('warn', `[Email] 기공료 메일에 엑셀 첨부파일 없음: "${mail.subject}"`);
    return;
  }

  // 발신자 이름에서 업체명 추출 (예: "ABC기공소 <abc@lab.com>" → "ABC기공소")
  const vendorName = extractVendorName(mail.from);

  for (const att of excelAttachments) {
    try {
      const downloaded = await client.downloadAttachment('default', mail.id, att.id);
      const buffer = Buffer.from(downloaded.data, 'base64');
      const items = parseExcelLabExpense(buffer, vendorName);

      if (items.length === 0) {
        log('warn', `[Email] 파싱 결과 없음: ${att.name}`);
        continue;
      }

      // 현재 연/월 기준으로 저장
      const now = new Date();
      await client.saveLabExpense({
        clinicId: 'default',
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        items,
      });

      log('info', `[Email] 기공료 ${items.length}건 저장 완료 (${att.name})`);
    } catch (err) {
      log('error', `[Email] 첨부파일 처리 실패 (${att.name}): ${err instanceof Error ? err.message : err}`);
    }
  }
}

// ============================================
// 세무 메일 처리 (급여명세서 ZIP)
// ============================================

async function processTaxOfficeMail(mail: EmailMail): Promise<void> {
  if (!client) return;

  log('info', `[Email] 세무 메일 처리: "${mail.subject}"`);

  const zipAttachments = mail.attachments.filter(att =>
    att.name.match(/\.zip$/i)
  );

  if (zipAttachments.length === 0) {
    log('warn', `[Email] 세무 메일에 ZIP 첨부파일 없음: "${mail.subject}"`);
    return;
  }

  for (const att of zipAttachments) {
    try {
      const downloaded = await client.downloadAttachment('default', mail.id, att.id);
      const now = new Date();

      const result = await client.uploadPayslip({
        clinicId: 'default',
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        zipData: downloaded.data, // base64 encoded
      });

      log('info', `[Email] 급여명세서 ${result.uploadedCount}건 업로드 완료 (${att.name})`);
    } catch (err) {
      log('error', `[Email] ZIP 업로드 실패 (${att.name}): ${err instanceof Error ? err.message : err}`);
    }
  }
}

// ============================================
// 유틸리티
// ============================================

function extractVendorName(from: string): string {
  // "ABC기공소 <abc@lab.com>" → "ABC기공소"
  const nameMatch = from.match(/^(.+?)\s*<.*>$/);
  if (nameMatch) return nameMatch[1].trim();

  // "abc@lab.com" → "abc"
  const emailMatch = from.match(/^([^@]+)@/);
  if (emailMatch) return emailMatch[1].trim();

  return from.trim();
}

function notifyResult(labCount: number, taxCount: number): void {
  if (!Notification.isSupported()) return;
  if (labCount === 0 && taxCount === 0) return;

  const parts: string[] = [];
  if (labCount > 0) parts.push(`기공료 ${labCount}건`);
  if (taxCount > 0) parts.push(`급여명세서 ${taxCount}건`);

  new Notification({
    title: '이메일 자동 처리 완료',
    body: `${parts.join(', ')} 처리되었습니다.`,
  }).show();
}
