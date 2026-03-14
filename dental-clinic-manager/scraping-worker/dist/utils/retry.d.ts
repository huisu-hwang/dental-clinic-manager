export interface RetryOptions {
    maxRetries: number;
    delays: number[];
    onRetry?: (attempt: number, error: unknown) => void;
}
/** 재시도 로직 래퍼 */
export declare function withRetry<T>(fn: () => Promise<T>, label: string, options?: Partial<RetryOptions>): Promise<T>;
export declare function sleep(ms: number): Promise<void>;
//# sourceMappingURL=retry.d.ts.map