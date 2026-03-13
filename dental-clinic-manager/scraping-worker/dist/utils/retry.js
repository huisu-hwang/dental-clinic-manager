import { createChildLogger } from './logger.js';
const log = createChildLogger('retry');
const DEFAULT_OPTIONS = {
    maxRetries: 3,
    delays: [5000, 15000, 30000],
};
/** 재시도 로직 래퍼 */
export async function withRetry(fn, label, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            if (attempt >= opts.maxRetries) {
                log.error({ attempt, label, error }, '최대 재시도 횟수 초과');
                throw error;
            }
            const delay = opts.delays[Math.min(attempt, opts.delays.length - 1)];
            log.warn({ attempt: attempt + 1, label, delay, error }, '재시도 대기 중');
            opts.onRetry?.(attempt + 1, error);
            await sleep(delay);
        }
    }
    throw new Error(`${label}: unreachable`);
}
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=retry.js.map