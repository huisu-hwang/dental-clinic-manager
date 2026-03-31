// ============================================
// 대시보드 스크래핑 API 클라이언트
// ============================================

export interface ScrapingJob {
  id: string;
  clinic_id: string;
  data_types: string[];
  date_from: string;
  date_to: string;
  priority: number;
  retry_count: number;
  max_retries: number;
}

export interface HometaxCredentials {
  hometax_user_id: string;
  password: string;
  resident_number?: string;
  session_data?: { cookies: any[] };
}

export interface ScrapedDataPayload {
  job_id: string;
  clinic_id: string;
  data_type: string;
  date_from: string;
  date_to: string;
  raw_data: any[];
  record_count: number;
}

export class ScrapingApiClient {
  constructor(private dashboardUrl: string, private apiKey: string) {}

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.dashboardUrl}${path}`, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new Error(`API ${method} ${path} failed: HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  // Job 폴링 - GET /api/marketing/worker-api/scraping/jobs
  async fetchPendingJob(): Promise<ScrapingJob | null> {
    const data = await this.request<{ job: ScrapingJob | null }>(
      'GET',
      '/api/marketing/worker-api/scraping/jobs'
    );
    return data.job ?? null;
  }

  // Job 상태 업데이트 - POST /api/marketing/worker-api/scraping/jobs/{id}/status
  async updateJobStatus(
    jobId: string,
    status: 'completed' | 'failed',
    details?: { error_message?: string; result_summary?: object }
  ): Promise<void> {
    await this.request<unknown>(
      'POST',
      `/api/marketing/worker-api/scraping/jobs/${jobId}/status`,
      { status, ...details }
    );
  }

  // 인증정보 조회 - GET /api/marketing/worker-api/scraping/credentials/{clinicId}
  async getCredentials(clinicId: string): Promise<HometaxCredentials> {
    const data = await this.request<{ credentials: HometaxCredentials }>(
      'GET',
      `/api/marketing/worker-api/scraping/credentials/${clinicId}`
    );
    return data.credentials;
  }

  // 데이터 저장 - POST /api/marketing/worker-api/scraping/data
  async saveScrapedData(data: ScrapedDataPayload): Promise<void> {
    await this.request<unknown>('POST', '/api/marketing/worker-api/scraping/data', data);
  }

  // Heartbeat - POST /api/marketing/worker-api/scraping/heartbeat
  async sendHeartbeat(
    workerId: string,
    status: string,
    currentJobId?: string
  ): Promise<{ stop_requested: boolean }> {
    return this.request<{ stop_requested: boolean }>(
      'POST',
      '/api/marketing/worker-api/scraping/heartbeat',
      { worker_id: workerId, status, current_job_id: currentJobId }
    );
  }
}
