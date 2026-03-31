// ============================================
// 마케팅 워커 API 클라이언트
// 대시보드 API를 통해 DB 작업을 수행 (Supabase 직접 접속 불필요)
// ============================================

export interface ScheduledItem {
  id: string;
  title: string;
  keyword: string | null;
  publish_date: string;
  publish_time: string;
  generated_content: string | null;
  generated_images: { path: string; prompt: string; fileName?: string }[] | null;
  platforms: Record<string, boolean>;
  clinic_id: string;
}

export interface PlatformConfig {
  blogId?: string;
  naverId?: string;
  naverPassword?: string;
  loginCookie?: string;
}

export interface PollResult {
  control: {
    start_requested: boolean;
    stop_requested: boolean;
    headless: boolean;
  };
  nextItem: ScheduledItem | null;
}

export class WorkerApiClient {
  constructor(
    private baseUrl: string,
    private apiKey: string
  ) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}/api/marketing/worker-api${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${text}`);
    }

    return res.json();
  }

  /** 제어 신호 + 발행 대상 조회 (combined poll) */
  async poll(): Promise<PollResult> {
    return this.request('/poll');
  }

  /** 워커/supervisor 상태 업데이트 */
  async updateControl(params: {
    watchdog_online?: boolean;
    worker_running?: boolean;
    clear_start_requested?: boolean;
    clear_stop_requested?: boolean;
  }): Promise<void> {
    await this.request('/control', {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
  }

  /** 제어 행 초기화 (supervisor 시작 시) */
  async initControl(): Promise<void> {
    await this.request('/init', { method: 'POST', body: '{}' });
  }

  /** 캘린더 아이템 상태 업데이트 */
  async updateItemStatus(
    itemId: string,
    status: string,
    options?: { fail_reason?: string; published_urls?: Record<string, string> }
  ): Promise<void> {
    await this.request(`/items/${itemId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...options }),
    });
  }

  /** 플랫폼 설정 조회 (네이버 블로그 인증 정보 등) */
  async getPlatformSettings(clinicId: string, platform: string): Promise<PlatformConfig | null> {
    const result = await this.request<{ config: PlatformConfig | null }>(
      `/platform-settings?clinic_id=${clinicId}&platform=${platform}`
    );
    return result.config;
  }

  /** 발행 로그 기록 + 키워드 이력 */
  async logPublish(params: {
    item_id: string;
    platform: string;
    status: string;
    published_url?: string;
    error_message?: string;
    duration_seconds?: number;
    keyword?: string;
    clinic_id?: string;
  }): Promise<void> {
    await this.request('/publish-log', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // ============================================
  // 스크래핑 워커 API (API Mode 통신용)
  // ============================================

  // 워커 등록
  async registerScrapingWorker(params: {
    workerId: string;
    hostname: string;
    metadata: unknown;
  }): Promise<void> {
    await this.request('/scraping/register', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // 하트비트
  async sendScrapingHeartbeat(workerId: string, status: string, currentJobId?: string | null): Promise<{ stop_requested: boolean }> {
    return this.request<{ stop_requested: boolean }>('/scraping/heartbeat', {
      method: 'PATCH',
      body: JSON.stringify({ workerId, status, currentJobId }),
    });
  }

  // 워커 등록 해제
  async deregisterScrapingWorker(workerId: string): Promise<void> {
    await this.request('/scraping/deregister', {
      method: 'POST',
      body: JSON.stringify({ workerId }),
    });
  }

  // Job 취득
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async acquireScrapingJob(workerId: string): Promise<any> {
    const res = await this.request<{ job: any }>('/scraping/jobs/acquire', {
      method: 'POST',
      body: JSON.stringify({ workerId }),
    });
    return res.job;
  }

  // Job 완료/실패 보고
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async reportScrapingJobResult(
    jobId: string,
    params: {
      status: 'completed' | 'failed';
      resultSummary?: Record<string, unknown>;
      errorMessage?: string;
      errorDetails?: unknown;
    }
  ): Promise<void> {
    await this.request(`/scraping/jobs/${jobId}/result`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // 새로운 Job 일괄 등록 (스케줄러 용)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async createScrapingJobs(jobs: any[]): Promise<number> {
    const res = await this.request<{ count: number }>('/scraping/jobs/create', {
      method: 'POST',
      body: JSON.stringify({ jobs }),
    });
    return res.count;
  }

  // 홈택스 자격증명 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getHometaxCredentials(clinicId?: string): Promise<any[]> {
    const url = clinicId ? `/scraping/credentials?clinicId=${clinicId}` : '/scraping/credentials';
    const res = await this.request<{ credentials: any[] }>(url, { method: 'GET' });
    return res.credentials || [];
  }

  // 홈택스 세션/로그인 상태 업데이트
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async updateHometaxCredentials(clinicId: string, updateData: Record<string, any>): Promise<void> {
    await this.request('/scraping/credentials/update', {
      method: 'PATCH',
      body: JSON.stringify({ clinicId, updateData }),
    });
  }

  // 홈택스 스크래핑 Raw 데이터 저장
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async saveRawData(clinicId: string, result: any): Promise<void> {
    await this.request('/scraping/data/raw', {
      method: 'POST',
      body: JSON.stringify({ clinicId, result }),
    });
  }

  // 알림 보내기 (시스템/앱)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async insertNotification(notification: any): Promise<void> {
    await this.request('/scraping/notifications', {
      method: 'POST',
      body: JSON.stringify({ notification }),
    });
  }

  // Job 진행상태 메시지 업데이트
  async updateJobProgress(jobId: string, progressMessage: string): Promise<void> {
    await this.request(`/scraping/jobs/${jobId}/progress`, {
      method: 'PATCH',
      body: JSON.stringify({ progressMessage }),
    });
  }

  // 동기화 로그 기록
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async insertSyncLog(logSync: any): Promise<void> {
    await this.request('/scraping/sync-logs', {
      method: 'POST',
      body: JSON.stringify({ log: logSync }),
    });
  }
}
