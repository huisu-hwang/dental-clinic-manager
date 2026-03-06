import { getAllPatients, getUpdatedPatients, patientToSyncData } from './dentweb-db'
import { syncPatients } from './api-client'
import { config } from './config'
import { logger } from './logger'

let lastSyncDate: Date | null = null
let isSyncing = false

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
      // 전체 동기화
      syncType = 'full'
      logger.info('Starting full sync...')
      patients = await getAllPatients()
    } else {
      // 증분 동기화
      syncType = 'incremental'
      logger.info(`Starting incremental sync (since ${lastSyncDate.toISOString()})...`)
      patients = await getUpdatedPatients(lastSyncDate)
    }

    logger.info(`Found ${patients.length} patients to sync`)

    if (patients.length === 0) {
      logger.info('No patients to sync, skipping API call')
      lastSyncDate = new Date()
      return
    }

    // 동기화용 데이터로 변환
    const syncData = patients.map(patientToSyncData)

    // API로 전송
    const result = await syncPatients(syncData, syncType)

    if (result.success) {
      lastSyncDate = new Date()
      const duration = Date.now() - startTime
      logger.info(`Sync completed successfully in ${duration}ms`, {
        total: result.total_records,
        new: result.new_records,
        updated: result.updated_records,
      })
    } else {
      logger.error('Sync failed', { error: result.error })
    }

  } catch (error) {
    logger.error('Sync error', error)
  } finally {
    isSyncing = false
  }
}

// 동기화 상태
export function getSyncStatus() {
  return {
    isSyncing,
    lastSyncDate,
  }
}
