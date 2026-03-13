import { getSupabaseClient } from '../db/supabaseClient.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('notifier');

export type NotificationType = 'sync_complete' | 'sync_failed' | 'settlement_complete' | 'anomaly_detected';

interface NotificationPayload {
  clinicId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/** 앱 내 알림 생성 (notifications 테이블) */
export async function createNotification(payload: NotificationPayload): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('notifications')
    .insert({
      clinic_id: payload.clinicId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      metadata: payload.metadata || {},
      is_read: false,
      created_at: new Date().toISOString(),
    });

  if (error) {
    // notifications 테이블이 없을 수 있음 - 경고만 출력
    log.warn({ error, type: payload.type }, '알림 생성 실패 (테이블 미존재 가능)');
  } else {
    log.info({ clinicId: payload.clinicId, type: payload.type }, '알림 생성 완료');
  }
}

/** 일일 수집 완료 알림 */
export async function notifySyncComplete(
  clinicId: string,
  results: Record<string, { success: boolean; count: number }>,
): Promise<void> {
  const successTypes = Object.entries(results)
    .filter(([, r]) => r.success)
    .map(([dt, r]) => `${getDataTypeLabel(dt)} ${r.count}건`);

  const failedTypes = Object.entries(results)
    .filter(([, r]) => !r.success)
    .map(([dt]) => getDataTypeLabel(dt));

  const totalCount = Object.values(results).reduce((sum, r) => sum + r.count, 0);

  let message: string;
  let type: NotificationType;

  if (failedTypes.length === 0) {
    type = 'sync_complete';
    message = `홈택스 데이터 수집 완료 - ${successTypes.join(', ')} (총 ${totalCount}건)`;
  } else if (successTypes.length > 0) {
    type = 'sync_complete';
    message = `홈택스 데이터 부분 수집 - 성공: ${successTypes.join(', ')} / 실패: ${failedTypes.join(', ')}`;
  } else {
    type = 'sync_failed';
    message = `홈택스 데이터 수집 실패 - ${failedTypes.join(', ')}`;
  }

  await createNotification({
    clinicId,
    type,
    title: type === 'sync_failed' ? '홈택스 수집 실패' : '홈택스 수집 완료',
    message,
    metadata: { results, totalCount },
  });
}

/** 월말 결산 완료 알림 */
export async function notifySettlementComplete(
  clinicId: string,
  year: number,
  month: number,
  settlement: Record<string, unknown>,
): Promise<void> {
  await createNotification({
    clinicId,
    type: 'settlement_complete',
    title: '월말 결산 완료',
    message: `${year}년 ${month}월 홈택스 결산이 완료되었습니다.`,
    metadata: { year, month, settlement },
  });
}

/** 수집 실패 알림 */
export async function notifySyncFailed(
  clinicId: string,
  errorMessage: string,
  jobId: string,
): Promise<void> {
  await createNotification({
    clinicId,
    type: 'sync_failed',
    title: '홈택스 수집 실패',
    message: `홈택스 데이터 수집 실패 - ${errorMessage}`,
    metadata: { jobId, errorMessage },
  });
}

/** 데이터 타입 한글 라벨 */
function getDataTypeLabel(dataType: string): string {
  const labels: Record<string, string> = {
    tax_invoice_sales: '세금계산서 매출',
    tax_invoice_purchase: '세금계산서 매입',
    cash_receipt_sales: '현금영수증 매출',
    cash_receipt_purchase: '현금영수증 매입',
    business_card_purchase: '사업용카드 매입',
    credit_card_sales: '신용카드 매출',
  };
  return labels[dataType] || dataType;
}
