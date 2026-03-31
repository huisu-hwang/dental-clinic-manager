// ============================================
// 마케팅 워커 API 클라이언트
// 대시보드 API를 통해 DB 작업을 수행 (Supabase 직접 접속 불필요)
// ============================================
export class WorkerApiClient {
    baseUrl;
    apiKey;
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }
    async request(path, options) {
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
    async poll() {
        return this.request('/poll');
    }
    /** 워커/supervisor 상태 업데이트 */
    async updateControl(params) {
        await this.request('/control', {
            method: 'PATCH',
            body: JSON.stringify(params),
        });
    }
    /** 제어 행 초기화 (supervisor 시작 시) */
    async initControl() {
        await this.request('/init', { method: 'POST', body: '{}' });
    }
    /** 캘린더 아이템 상태 업데이트 */
    async updateItemStatus(itemId, status, options) {
        await this.request(`/items/${itemId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status, ...options }),
        });
    }
    /** 플랫폼 설정 조회 (네이버 블로그 인증 정보 등) */
    async getPlatformSettings(clinicId, platform) {
        const result = await this.request(`/platform-settings?clinic_id=${clinicId}&platform=${platform}`);
        return result.config;
    }
    /** 발행 로그 기록 + 키워드 이력 */
    async logPublish(params) {
        await this.request('/publish-log', {
            method: 'POST',
            body: JSON.stringify(params),
        });
    }
}
