export interface ScheduledItem {
    id: string;
    title: string;
    keyword: string | null;
    publish_date: string;
    publish_time: string;
    generated_content: string | null;
    generated_images: {
        path: string;
        prompt: string;
        fileName?: string;
    }[] | null;
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
    };
    nextItem: ScheduledItem | null;
}
export declare class WorkerApiClient {
    private baseUrl;
    private apiKey;
    constructor(baseUrl: string, apiKey: string);
    private request;
    /** 제어 신호 + 발행 대상 조회 (combined poll) */
    poll(): Promise<PollResult>;
    /** 워커/supervisor 상태 업데이트 */
    updateControl(params: {
        watchdog_online?: boolean;
        worker_running?: boolean;
        clear_start_requested?: boolean;
        clear_stop_requested?: boolean;
    }): Promise<void>;
    /** 제어 행 초기화 (supervisor 시작 시) */
    initControl(): Promise<void>;
    /** 캘린더 아이템 상태 업데이트 */
    updateItemStatus(itemId: string, status: string, options?: {
        fail_reason?: string;
        published_urls?: Record<string, string>;
    }): Promise<void>;
    /** 플랫폼 설정 조회 (네이버 블로그 인증 정보 등) */
    getPlatformSettings(clinicId: string, platform: string): Promise<PlatformConfig | null>;
    /** 발행 로그 기록 + 키워드 이력 */
    logPublish(params: {
        item_id: string;
        platform: string;
        status: string;
        published_url?: string;
        error_message?: string;
        duration_seconds?: number;
        keyword?: string;
        clinic_id?: string;
    }): Promise<void>;
}
