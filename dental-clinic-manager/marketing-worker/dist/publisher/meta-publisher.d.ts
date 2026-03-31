interface MetaConfig {
    accessToken: string;
    instagramAccountId: string;
    facebookPageId: string;
}
interface PublishResult {
    success: boolean;
    postId?: string;
    postUrl?: string;
    error?: string;
}
export declare class MetaPublisher {
    private config;
    constructor(config: MetaConfig);
    /**
     * 인스타그램 단일 이미지 포스트
     */
    publishInstagramSingle(imageUrl: string, caption: string): Promise<PublishResult>;
    /**
     * 인스타그램 캐러셀 포스트
     */
    publishInstagramCarousel(imageUrls: string[], caption: string): Promise<PublishResult>;
    /**
     * 페이스북 페이지 포스트 (텍스트 + 링크)
     */
    publishFacebook(message: string, link?: string): Promise<PublishResult>;
}
export {};
