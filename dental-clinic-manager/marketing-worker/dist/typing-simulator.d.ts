import type { Page } from 'playwright';
/**
 * 한 글자씩 사람처럼 타이핑
 */
export declare function humanType(page: Page, text: string): Promise<void>;
/**
 * 셀렉터를 클릭 후 타이핑
 */
export declare function humanTypeInto(page: Page, selector: string, text: string): Promise<void>;
/**
 * 네이버 에디터 본문에 글 입력
 * - [IMAGE: ...] 마커 위치에서 이미지 삽입 콜백 실행
 * - ## 소제목은 onHeading 콜백으로 스타일 전환 후 입력
 */
export declare function typeBodyContent(page: Page, body: string, onImageMarker?: (prompt: string) => Promise<void>, onHeading?: (text: string) => Promise<void>): Promise<void>;
/**
 * 페이지 로딩 후 안정화 대기
 */
export declare function waitForPageStable(page: Page): Promise<void>;
/**
 * 임시저장 복원 팝업 닫기 → 새 글 작성
 */
export declare function handleDraftPopup(page: Page): Promise<void>;
/**
 * 해시태그 입력 (발행 패널에서)
 */
export declare function typeHashtags(page: Page, hashtags: string[]): Promise<void>;
