import { getAllPatients, getUpdatedPatients, patientToSyncData } from './db';
import { syncPatients } from './api-client';
import { getDentwebConfig, getDentwebState, setDentwebState } from '../config-store';
import { log } from '../logger';

// ============================================
// 덴트웹 동기화 서비스
// dentweb-bridge-agent/src/sync-service.ts 에서 이식
// state는 JSON 파일 대신 electron-store 사용
// ============================================

let isSyncing = false;

// 동기화 실행
export async function runSync(): Promise<{ success: boolean; error?: string }> {
  if (isSyncing) {
    log('warn', '[Dentweb/Sync] Sync already in progress, skipping...');
    return { success: false, error: 'already in progress' };
  }

  isSyncing = true;
  const startTime = Date.now();

  try {
    const cfg = getDentwebConfig();
    const state = getDentwebState();
    const lastSyncDate: Date | null = state.lastSyncDate ? new Date(state.lastSyncDate) : null;

    let patients;
    let syncType: 'full' | 'incremental';

    if (!lastSyncDate || cfg.syncType === 'full') {
      syncType = 'full';
      log('info', '[Dentweb/Sync] Starting full sync...');
      patients = await getAllPatients();
    } else {
      syncType = 'incremental';
      log('info', `[Dentweb/Sync] Starting incremental sync (since ${lastSyncDate.toISOString()})...`);
      patients = await getUpdatedPatients(lastSyncDate);
    }

    log('info', `[Dentweb/Sync] Found ${patients.length} patients to sync`);

    if (patients.length === 0) {
      log('info', '[Dentweb/Sync] No patients to sync, skipping API call');
      setDentwebState({
        lastSyncDate: new Date().toISOString(),
        lastSyncStatus: 'success',
        consecutiveErrors: 0,
      });
      return { success: true };
    }

    const syncData = patients.map(patientToSyncData);
    const result = await syncPatients(syncData, syncType);

    if (result.success) {
      const duration = Date.now() - startTime;
      log(
        'info',
        `[Dentweb/Sync] Sync completed successfully in ${duration}ms — total: ${result.total_records}, new: ${result.new_records}, updated: ${result.updated_records}`
      );
      setDentwebState({
        lastSyncDate: new Date().toISOString(),
        lastSyncStatus: 'success',
        lastSyncPatientCount: result.total_records,
        consecutiveErrors: 0,
        totalSyncs: state.totalSyncs + 1,
      });
      return { success: true };
    } else {
      log('error', `[Dentweb/Sync] Sync failed: ${result.error || 'unknown'}`);
      setDentwebState({
        lastSyncStatus: 'error',
        consecutiveErrors: state.consecutiveErrors + 1,
      });
      return { success: false, error: result.error };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log('error', `[Dentweb/Sync] Sync error: ${msg}`);
    const state = getDentwebState();
    setDentwebState({
      lastSyncStatus: 'error',
      consecutiveErrors: state.consecutiveErrors + 1,
    });
    return { success: false, error: msg };
  } finally {
    isSyncing = false;
  }
}

// 동기화 진행 중 여부
export function isSyncInProgress(): boolean {
  return isSyncing;
}
