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
}
