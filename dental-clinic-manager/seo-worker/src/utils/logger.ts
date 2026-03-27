import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.logLevel,
  transport: {
    target: 'pino/file',
    options: { destination: 1 },
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    worker: config.worker.id,
  },
});

export function createChildLogger(module: string) {
  return logger.child({ module });
}
