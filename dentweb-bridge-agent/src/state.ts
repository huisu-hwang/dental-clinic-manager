import fs from 'fs'
import path from 'path'
import { logger } from './logger'

const STATE_FILE = path.resolve(__dirname, '../data/sync-state.json')
const STATE_DIR = path.dirname(STATE_FILE)

interface SyncState {
  lastSyncDate: string | null
  lastSyncStatus: 'success' | 'error' | null
  lastSyncPatientCount: number
  consecutiveErrors: number
  totalSyncs: number
}

const defaultState: SyncState = {
  lastSyncDate: null,
  lastSyncStatus: null,
  lastSyncPatientCount: 0,
  consecutiveErrors: 0,
  totalSyncs: 0,
}

export function loadState(): SyncState {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true })
    }
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8')
      return { ...defaultState, ...JSON.parse(raw) }
    }
  } catch (error) {
    logger.warn('상태 파일 로드 실패, 기본값 사용', error)
  }
  return { ...defaultState }
}

export function saveState(state: SyncState): void {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true })
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')
  } catch (error) {
    logger.warn('상태 파일 저장 실패', error)
  }
}
