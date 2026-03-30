import { app } from 'electron';
import fs from 'fs';
import path from 'path';

// ============================================
// 로그 관리
// app.getPath('logs')에 로그 파일 저장
// 최대 5MB, 로테이션
// ============================================

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Namespace-aware file + console logger for the Electron main process.
 */
export class Logger {
  private namespace: string;
  private static logDir: string | null = null;
  private static logFile: string | null = null;
  private static minLevel: LogLevel = 'info';

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  static getLogDir(): string {
    if (!Logger.logDir) {
      Logger.logDir = app.getPath('logs');
      if (!fs.existsSync(Logger.logDir)) {
        fs.mkdirSync(Logger.logDir, { recursive: true });
      }
    }
    return Logger.logDir;
  }

  static setLevel(level: LogLevel): void {
    Logger.minLevel = level;
  }

  private getLogFilePath(): string {
    if (!Logger.logFile) {
      const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      Logger.logFile = path.join(Logger.getLogDir(), `${date}.log`);
    }
    return Logger.logFile;
  }

  private rotateLogs(filePath: string): void {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size >= MAX_LOG_SIZE) {
        const rotated = filePath + '.old';
        if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
        fs.renameSync(filePath, rotated);
      }
    } catch {
      // 파일이 없으면 무시
    }
  }

  private write(level: LogLevel, message: string, error?: unknown): void {
    if (LEVELS[level] < LEVELS[Logger.minLevel]) return;

    const timestamp = new Date().toISOString();
    const errorStr = error
      ? ` | ${error instanceof Error ? error.stack ?? error.message : String(error)}`
      : '';
    const line = `[${timestamp}] [${level.toUpperCase()}] [${this.namespace}] ${message}${errorStr}`;

    if (level === 'error' || level === 'warn') {
      console.error(line);
    } else {
      console.log(line);
    }

    try {
      const filePath = this.getLogFilePath();
      this.rotateLogs(filePath);
      fs.appendFileSync(filePath, line + '\n', 'utf8');
    } catch {
      // Ignore write errors to prevent cascading failures
    }
  }

  debug(message: string, error?: unknown): void { this.write('debug', message, error); }
  info(message: string, error?: unknown): void { this.write('info', message, error); }
  warn(message: string, error?: unknown): void { this.write('warn', message, error); }
  error(message: string, error?: unknown): void { this.write('error', message, error); }

  static getRecentLogs(lines: number = 50): string[] {
    try {
      const logDir = Logger.getLogDir();
      const date = new Date().toISOString().slice(0, 10);
      const filePath = path.join(logDir, `${date}.log`);
      if (!fs.existsSync(filePath)) return [];
      const content = fs.readFileSync(filePath, 'utf8');
      const all = content.split('\n').filter(l => l.length > 0);
      return all.slice(-lines);
    } catch {
      return [];
    }
  }
}

// 간편 함수 export (다른 모듈에서 `import { log } from './logger'`로 사용)
const defaultLogger = new Logger('App');

export function log(level: LogLevel, message: string): void {
  defaultLogger[level](message);
}
