export interface DelayRange {
    min: number;
    max: number;
}
/**
 * min~max 범위의 랜덤 밀리초를 반환
 */
export declare function randomMs(range: DelayRange): number;
/**
 * min~max 범위의 랜덤 시간만큼 대기
 */
export declare function randomDelay(range: DelayRange): Promise<void>;
/**
 * 고정 시간 대기 (특수한 경우에만 사용)
 */
export declare function sleep(ms: number): Promise<void>;
