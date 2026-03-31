interface PublishResult {
    success: boolean;
    blogUrl?: string;
    error?: string;
    durationSeconds: number;
}
interface BlogPostData {
    title: string;
    body: string;
    category?: string;
    hashtags?: string[];
    images?: {
        path: string;
        prompt: string;
    }[];
}
interface NaverBlogConfig {
    blogId: string;
    naverId?: string;
    naverPassword?: string;
    loginCookie?: string;
}
export declare class NaverBlogPublisher {
    private browser;
    private context;
    private blogConfig;
    /**
     * 브라우저 인스턴스 시작
     */
    init(config?: NaverBlogConfig): Promise<void>;
    close(): Promise<void>;
    /**
     * 블로그 글 발행
     */
    publish(postData: BlogPostData): Promise<PublishResult>;
    /**
     * 에디터 진입 (로그인 + 임시저장 팝업 처리)
     */
    private navigateToEditor;
    /**
     * [FIX #1] ID/PW 로그인 + 비밀번호 오류 감지
     */
    private performLogin;
    private selectCategory;
    /**
     * [FIX #3] 제목만 제목란에 입력
     */
    private typeTitle;
    /**
     * [FIX #3, #4, #6] 본문 입력 (본문 영역에 정확히 입력 + 이미지 + 소제목)
     */
    private typeBody;
    /**
     * [FIX #6] "본문" 드롭다운 → "소제목" 선택
     */
    private applyHeadingStyle;
    private restoreBodyStyle;
    /**
     * [FIX #4] 이미지 삽입 - fileChooser 이벤트 가로채기 방식
     * 사진 버튼 클릭 시 발생하는 파일 선택 다이얼로그를 Playwright가 직접 처리
     */
    private insertImage;
    /**
     * [FIX #5] 발행: 상단 발행 → 태그 입력 → 패널 내 최종 발행
     */
    private clickPublish;
}
export {};
