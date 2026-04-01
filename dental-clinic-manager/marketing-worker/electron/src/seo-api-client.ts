import { getConfig } from './config-store';

// ============================================
// SEO 분석 API 클라이언트
// ============================================

export interface SeoJob {
  id: string;
  job_type: 'keyword_analysis' | 'competitor_compare';
  status: string;
  params: {
    keyword: string;
    myPostUrl?: string;
    clinicId?: string;
  };
  retry_count: number;
  max_retries: number;
}

export class SeoApiClient {
  private dashboardUrl: string;
  private apiKey: string;

  constructor() {
    const cfg = getConfig();
    this.dashboardUrl = cfg.dashboardUrl;
    this.apiKey = cfg.workerApiKey;
  }

  private async request(path: string, options?: RequestInit) {
    const url = `${this.dashboardUrl}/api/marketing/worker-api/seo${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`SEO API error: ${res.status}`);
    return res.json();
  }

  async fetchPendingJob(): Promise<SeoJob | null> {
    const data = await this.request('/jobs');
    return data.job || null;
  }

  async updateJobStatus(jobId: string, status: 'completed' | 'failed', details?: object): Promise<void> {
    await this.request(`/jobs/${jobId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, ...details }),
    });
  }

  async saveData(payload: object): Promise<void> {
    await this.request('/data', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async sendHeartbeat(workerId: string, status: string): Promise<{ stop_requested: boolean }> {
    return this.request('/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ worker_id: workerId, status }),
    });
  }
}
