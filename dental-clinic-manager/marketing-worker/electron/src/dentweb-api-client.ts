import { getConfig } from './config-store';
import { log } from './logger';

// ============================================
// DentWeb 동기화 API 클라이언트
// ============================================

export interface DentwebConfig {
  clinic_id: string;
  api_key: string;
  is_active: boolean;
  sync_interval_seconds: number;
}

export interface PatientSyncData {
  dentweb_patient_id: string;
  chart_number?: string;
  patient_name: string;
  phone_number?: string;
  birth_date?: string;
  gender?: string;
  last_visit_date?: string;
  last_treatment_type?: string;
  next_appointment_date?: string;
  registration_date?: string;
  is_active?: boolean;
}

interface SyncResponse {
  success: boolean;
  total_records: number;
  new_records: number;
  updated_records: number;
  error?: string;
}

interface StatusResponse {
  success: boolean;
  data?: {
    is_active: boolean;
    sync_interval_seconds: number;
    last_sync_at: string | null;
    last_sync_status: string | null;
    total_patients: number;
  };
  error?: string;
}

export class DentwebApiClient {
  private dashboardUrl: string;
  private workerApiKey: string;

  constructor() {
    const cfg = getConfig();
    this.dashboardUrl = cfg.dashboardUrl;
    this.workerApiKey = cfg.workerApiKey;
  }

  private async request(url: string, options?: RequestInit) {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`DentWeb API error: ${res.status}`);
    return res.json();
  }

  /** 통합 워커 인증으로 DentWeb 설정 조회 */
  async fetchConfig(): Promise<DentwebConfig | null> {
    try {
      const data = await this.request(
        `${this.dashboardUrl}/api/marketing/worker-api/dentweb/config`,
        {
          headers: {
            Authorization: `Bearer ${this.workerApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return data.config || null;
    } catch (err) {
      log('error', `[DentWeb API] 설정 조회 실패: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  /** DentWeb sync API로 환자 데이터 전송 (500명씩 청크) */
  async syncPatients(
    clinicId: string,
    apiKey: string,
    patients: PatientSyncData[],
    syncType: 'full' | 'incremental',
    agentVersion: string
  ): Promise<SyncResponse> {
    const CHUNK_SIZE = 500;
    let totalNew = 0;
    let totalUpdated = 0;

    try {
      for (let i = 0; i < patients.length; i += CHUNK_SIZE) {
        const chunk = patients.slice(i, i + CHUNK_SIZE);
        const res = await this.request(
          `${this.dashboardUrl}/api/dentweb/sync`,
          {
            method: 'POST',
            body: JSON.stringify({
              clinic_id: clinicId,
              api_key: apiKey,
              sync_type: i === 0 ? syncType : 'incremental',
              patients: chunk,
              agent_version: agentVersion,
            }),
          }
        );

        if (!res.success) {
          return {
            success: false,
            total_records: patients.length,
            new_records: totalNew,
            updated_records: totalUpdated,
            error: res.error || 'Sync failed',
          };
        }

        totalNew += res.new_records || 0;
        totalUpdated += res.updated_records || 0;
        log('info', `[DentWeb API] 청크 ${Math.floor(i / CHUNK_SIZE) + 1} 전송 완료 (${chunk.length}건)`);
      }

      return {
        success: true,
        total_records: patients.length,
        new_records: totalNew,
        updated_records: totalUpdated,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log('error', `[DentWeb API] 동기화 실패: ${msg}`);
      return {
        success: false,
        total_records: patients.length,
        new_records: totalNew,
        updated_records: totalUpdated,
        error: msg,
      };
    }
  }

  /** heartbeat 상태 확인 */
  async checkStatus(clinicId: string, apiKey: string): Promise<StatusResponse> {
    try {
      return await this.request(
        `${this.dashboardUrl}/api/dentweb/status?clinic_id=${clinicId}&api_key=${apiKey}`
      );
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}
