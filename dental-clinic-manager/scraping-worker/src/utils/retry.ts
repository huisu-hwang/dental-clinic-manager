import { createChildLogger } from './logger.js';

const log = createChildLogger('retry');

export interface RetryOptions {
  maxRetries: number;
  delays: number[];        // 재시도 간 대기 시간 (ms)
  onRetry?: (attempt: number, error: unknown) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  delays: [5000, 15000, 30000],
};

/** 재시도 로직 래퍼 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
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

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
