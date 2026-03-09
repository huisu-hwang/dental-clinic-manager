import { getAllPatients, getUpdatedPatients, patientToSyncData } from './dentweb-db'
import { syncPatients } from './api-client'
import { config } from './config'
import { logger } from './logger'
import { loadState, saveState } from './state'

let isSyncing = false
const state = loadState()

// 상태 파일에서 마지막 동기화 날짜 복원
let lastSyncDate: Date | null = state.lastSyncDate ? new Date(state.lastSyncDate) : null

if (lastSyncDate) {
  logger.info(`이전 동기화 상태 복원: ${lastSyncDate.toISOString()} (총 ${state.totalSyncs}회 동기화)`)
}

// 동기화 실행
export async function runSync(): Promise<void> {
  if (isSyncing) {
    logger.warn('Sync already in progress, skipping...')
    return
  }

  isSyncing = true
  const startTime = Date.now()

  try {
    let patients
    let syncType: 'full' | 'incremental'

    if (!lastSyncDate || config.sync.syncType === 'full') {
      syncType = 'full'
      logger.info('Starting full sync...')
      patients = await getAllPatients()
    } else {
      syncType = 'incremental'
      logger.info(`Starting incremental sync (since ${lastSyncDate.toISOString()})...`)
      patients = await getUpdatedPatients(lastSyncDate)
    }

    logger.info(`Found ${patients.length} patients to sync`)

    if (patients.length === 0) {
      logger.info('No patients to sync, skipping API call')
      lastSyncDate = new Date()
      state.lastSyncDate = lastSyncDate.toISOString()
      state.lastSyncStatus = 'success'
      state.consecutiveErrors = 0
      saveState(state)
      return
    }

    const syncData = patients.map(patientToSyncData)
    const result = await syncPatients(syncData, syncType)

    if (result.success) {
      lastSyncDate = new Date()
      const duration = Date.now() - startTime
      logger.info(`Sync completed successfully in ${duration}ms`, {
        total: result.total_records,
        new: result.new_records,
        updated: result.updated_records,
      })
      state.lastSyncDate = lastSyncDate.toISOString()
      state.lastSyncStatus = 'success'
      state.lastSyncPatientCount = result.total_records
      state.consecutiveErrors = 0
      state.totalSyncs++
      saveState(state)
    } else {
      logger.error('Sync failed', { error: result.error })
      state.lastSyncStatus = 'error'
      state.consecutiveErrors++
      saveState(state)
    }

  } catch (error) {
    logger.error('Sync error', error)
    state.lastSyncStatus = 'error'
    state.consecutiveErrors++
    saveState(state)
  } finally {
    isSyncing = false
  }
}

// 동기화 상태
export function getSyncStatus() {
  return {
    isSyncing,
    lastSyncDate,
    consecutiveErrors: state.consecutiveErrors,
    totalSyncs: state.totalSyncs,
  }
}
