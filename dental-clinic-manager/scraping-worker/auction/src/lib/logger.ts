import { mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import 'dotenv/config'

const dir = process.env.LOG_DIR ?? './logs'
mkdirSync(dir, { recursive: true })

type Level = 'info' | 'warn' | 'error' | 'debug'

function fileForToday(): string {
  const today = new Date().toISOString().slice(0, 10)
  return join(dir, `auction-${today}.log`)
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }) + '\n'
  process.stdout.write(line)
  appendFileSync(fileForToday(), line)
}

export const log = {
  info:  (m: string, meta?: Record<string, unknown>) => emit('info', m, meta),
  warn:  (m: string, meta?: Record<string, unknown>) => emit('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit('error', m, meta),
  debug: (m: string, meta?: Record<string, unknown>) => process.env.DEBUG && emit('debug', m, meta),
}
