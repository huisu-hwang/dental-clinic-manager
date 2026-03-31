interface PlatformContent {
    naverBlog?: {
        title: string;
        body: string;
        hashtags?: string[];
        images?: {
            path: string;
            prompt: string;
        }[];
    };
    instagram?: {
        caption: string;
        imageUrls: string[];
    };
    facebook?: {
        message: string;
        link?: string;
    };
    threads?: {
        text: string;
        imageUrl?: string;
        link?: string;
    };
}
interface OrchestratorResult {
    publishedUrls: Record<string, string>;
    errors: Record<string, string>;
    allSuccess: boolean;
}
export declare class PublishOrchestrator {
    private naverPublisher;
    private metaPublisher;
    private threadsPublisher;
    /**
     * 플랫폼별 순차 배포 실행
     * 1. 네이버 블로그 (Playwright, 5~10분)
     * 2. 대기 (snsDelayMinutes)
     * 3. 인스타그램 (Graph API)
     * 4. 페이스북 (Graph API)
     * 5. 쓰레드 (Threads API)
     */
    publishAll(itemId: string, platforms: Record<string, boolean>, content: PlatformContent, snsDelayMinutes?: number): Promise<OrchestratorResult>;
    private initMetaPublisher;
    private initThreadsPublisher;
    private logPublish;
    close(): Promise<void>;
}
export {};
