export interface ProcessedImage {
    platform: string;
    filePath: string;
    fileName: string;
    width: number;
    height: number;
}
declare const PLATFORM_SPECS: {
    readonly naverBlog: {
        readonly width: 860;
        readonly height: null;
        readonly label: "네이버 블로그";
    };
    readonly instagramSquare: {
        readonly width: 1080;
        readonly height: 1080;
        readonly label: "인스타 1:1";
    };
    readonly instagramPortrait: {
        readonly width: 1080;
        readonly height: 1350;
        readonly label: "인스타 4:5";
    };
    readonly facebook: {
        readonly width: 1200;
        readonly height: 630;
        readonly label: "페이스북 OG";
    };
    readonly threads: {
        readonly width: 1080;
        readonly height: 1080;
        readonly label: "쓰레드 1:1";
    };
};
type PlatformSpec = keyof typeof PLATFORM_SPECS;
/**
 * 원본 이미지를 플랫폼별 규격으로 변환
 */
export declare function processImageForPlatforms(inputPath: string, fileName: string, platforms: PlatformSpec[]): Promise<ProcessedImage[]>;
/**
 * 임상 사진 환자 얼굴 영역 모자이크 처리
 * (간단 구현: 상단 1/3 영역 블러)
 */
export declare function anonymizePhoto(inputPath: string): Promise<string>;
/**
 * 병원 로고 워터마크 삽입
 */
export declare function addWatermark(inputPath: string, logoPath: string): Promise<string>;
/**
 * 밝기/대비 자동 보정 (임상 사진용)
 */
export declare function autoCorrectPhoto(inputPath: string): Promise<string>;
export {};
