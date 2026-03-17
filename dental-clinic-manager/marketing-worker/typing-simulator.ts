import type { Page, FrameLocator } from 'playwright';
import { CONFIG } from './config.js';
import { randomDelay, randomMs } from './utils/delay.js';

// ============================================
// 타이핑 시뮬레이터
// 네이버 에디터에 사람처럼 타이핑하여 봇 감지 회피
//
// 핵심 원칙:
// - 복사 붙여넣기(Ctrl+V) 절대 금지
// - 한 글자씩 타이핑 (10~50ms 랜덤 딜레이)
// - 문단 사이 1~3초 휴식
// - 모든 동작 전환에 랜덤 대기
// - 고정 딜레이 금지 → 반드시 랜덤 범위
// ============================================

const { delays } = CONFIG;

/**
 * 한 글자씩 사람처럼 타이핑
 * - 글자마다 10~50ms 랜덤 딜레이
 * - 2,000자 기준 약 1~2분 소요
 */
export async function humanType(page: Page, text: string): Promise<void> {
  for (const char of text) {
    await page.keyboard.type(char, { delay: 0 });
    const charDelay = randomMs(delays.charType);
    await new Promise((resolve) => setTimeout(resolve, charDelay));
  }
}

/**
 * 셀렉터를 클릭 후 타이핑
 */
export async function humanTypeInto(
  page: Page,
  selector: string,
  text: string
): Promise<void> {
  await page.click(selector);
  await randomDelay(delays.titleToBody);
  await humanType(page, text);
}

/**
 * 문단 단위로 타이핑 (문단 사이 1~3초 휴식)
 * - 각 문단 후 Enter 키 입력
 * - 사람이 생각하는 시간을 시뮬레이션
 */
export async function typeParagraphs(
  page: Page,
  paragraphs: string[]
): Promise<void> {
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    if (!para) continue;

    await humanType(page, para);

    // 마지막 문단이 아니면 줄바꿈 + 문단 간 휴식
    if (i < paragraphs.length - 1) {
      await page.keyboard.press('Enter');
      await randomDelay(delays.paragraph);
    }
  }
}

/**
 * 네이버 에디터 본문에 글 입력
 * - 본문을 문단으로 분리
 * - [IMAGE: ...] 마커 위치에서 이미지 삽입 콜백 실행
 */
export async function typeBodyContent(
  page: Page,
  body: string,
  onImageMarker?: (prompt: string) => Promise<void>
): Promise<void> {
  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // [IMAGE: ...] 마커 감지
    const imageMatch = line.match(/^\[IMAGE:\s*(.+?)\]$/);
    if (imageMatch && onImageMarker) {
      await randomDelay(delays.paragraph);
      await onImageMarker(imageMatch[1]);
      await randomDelay(delays.imageUpload);
      continue;
    }

    // 빈 줄은 Enter만
    if (!line) {
      await page.keyboard.press('Enter');
      await randomDelay({ min: 200, max: 500 });
      continue;
    }

    // 소제목 (##, ### 등) 처리
    if (line.startsWith('#')) {
      const headingText = line.replace(/^#+\s*/, '');
      await humanType(page, headingText);
      await page.keyboard.press('Enter');
      await randomDelay(delays.paragraph);
      continue;
    }

    // 일반 텍스트
    await humanType(page, line);
    await page.keyboard.press('Enter');

    // 문단 끝에서 사고 시간 시뮬레이션
    if (line.endsWith('.') || line.endsWith('!') || line.endsWith('?') || line.endsWith('~')) {
      await randomDelay(delays.paragraph);
    } else {
      await randomDelay({ min: 300, max: 800 });
    }
  }
}

/**
 * 네이버 에디터 iframe으로 전환
 * - iframe 전환 시 1.5~3.5초 대기 필수
 * - 빠르면 버튼 클릭 실패
 */
export async function switchToEditorFrame(page: Page): Promise<FrameLocator> {
  await randomDelay(delays.iframeSwitch);
  const frame = page.frameLocator('iframe.se-frame-content');
  return frame;
}

/**
 * 메인 프레임으로 복귀
 */
export async function switchToMainFrame(page: Page): Promise<void> {
  await randomDelay(delays.iframeSwitch);
  // Playwright에서는 page 자체가 메인 프레임이므로 별도 전환 불필요
  // 대기 시간만 확보
}

/**
 * 페이지 로딩 후 안정화 대기
 */
export async function waitForPageStable(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await randomDelay(delays.pageLoad);
}

/**
 * 팝업 닫기 (임시저장 알림 등)
 */
export async function handlePopups(page: Page): Promise<void> {
  try {
    // 임시저장 복원 팝업
    const restorePopup = page.locator('button:has-text("아니오"), button:has-text("닫기")');
    if (await restorePopup.isVisible({ timeout: 2000 })) {
      await restorePopup.click();
      await randomDelay(delays.popupHandle);
    }
  } catch {
    // 팝업이 없으면 무시
  }
}

/**
 * 해시태그 입력
 * - 각 태그마다 짧은 딜레이
 */
export async function typeHashtags(
  page: Page,
  hashtags: string[]
): Promise<void> {
  for (const tag of hashtags) {
    const tagText = tag.startsWith('#') ? tag : `#${tag}`;
    await humanType(page, tagText);
    await page.keyboard.press('Enter');
    await randomDelay({ min: 300, max: 800 });
  }
}
