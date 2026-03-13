export type NotificationType = 'sync_complete' | 'sync_failed' | 'settlement_complete' | 'anomaly_detected';
interface NotificationPayload {
    clinicId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
}
/** 앱 내 알림 생성 (notifications 테이블) */
export declare function createNotification(payload: NotificationPayload): Promise<void>;
/** 일일 수집 완료 알림 */
export declare function notifySyncComplete(clinicId: string, results: Record<string, {
    success: boolean;
    count: number;
}>): Promise<void>;
/** 월말 결산 완료 알림 */
export declare function notifySettlementComplete(clinicId: string, year: number, month: number, settlement: Record<string, unknown>): Promise<void>;
/** 수집 실패 알림 */
export declare function notifySyncFailed(clinicId: string, errorMessage: string, jobId: string): Promise<void>;
export {};
//# sourceMappingURL=notifier.d.ts.map