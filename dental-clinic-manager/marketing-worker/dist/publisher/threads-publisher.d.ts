interface ThreadsConfig {
    accessToken: string;
    userId: string;
}
interface PublishResult {
    success: boolean;
    postId?: string;
    postUrl?: string;
    error?: string;
}
export declare class ThreadsPublisher {
    private config;
    constructor(config: ThreadsConfig);
    /**
     * 텍스트 포스트 발행
     */
    publishText(text: string, link?: string): Promise<PublishResult>;
    /**
     * 이미지 + 텍스트 포스트 발행
     */
    publishWithImage(text: string, imageUrl: string, link?: string): Promise<PublishResult>;
}
export {};
