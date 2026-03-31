/**
 * 스케줄러 시작
 */
export declare function startScheduler(): void;
/**
 * 즉시 발행 처리 (HTTP 트리거에서 호출)
 */
export declare function processScheduledItemsOnce(): Promise<void>;
/**
 * 스케줄러 정리 (프로세스 종료 시)
 */
export declare function stopScheduler(): Promise<void>;
