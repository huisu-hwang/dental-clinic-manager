import type { Page } from 'playwright';
import { CONFIG } from './config.js';
import { randomDelay, randomMs } from './utils/delay.js';

// ============================================
// 타이핑 시뮬레이터
// 네이버 에디터에 사람처럼 타이핑하여 봇 감지 회피
// ============================================

const { delays } = CONFIG;

/**
 * 한 글자씩 사람처럼 타이핑
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
 * 네이버 에디터 본문에 글 입력
 * - [IMAGE: ...] 마커 위치에서 이미지 삽입 콜백 실행
 * - ## 소제목은 onHeading 콜백으로 스타일 전환 후 입력
 */
export async function typeBodyContent(
  page: Page,
  body: string,
  onImageMarker?: (prompt: string) => Promise<void>,
  onHeading?: (text: string) => Promise<void>
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
      if (onHeading) {
        await onHeading(headingText);
      } else {
        await humanType(page, headingText);
        await page.keyboard.press('Enter');
      }
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
 * 페이지 로딩 후 안정화 대기
 */
export async function waitForPageStable(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => {});
  await randomDelay(delays.pageLoad);
}

/**
 * 임시저장 복원 팝업 닫기 → 새 글 작성
 */
export async function handleDraftPopup(page: Page): Promise<void> {
  try {
    const popup = page.locator('.se-popup-alert-confirm');
    if (await popup.isVisible({ timeout: 3000 })) {
      console.log('[NaverBlog] 임시저장 복원 팝업 감지');
      // "아니오" 또는 취소 버튼 클릭
      const cancelBtn = popup.locator('button:has-text("아니오"), button:has-text("취소"), button.se-popup-button-cancel').first();
      if (await cancelBtn.isVisible({ timeout: 2000 })) {
        await cancelBtn.click();
        console.log('[NaverBlog] 임시저장 복원 거부 → 새 글 작성');
        await randomDelay(delays.popupHandle);
      }
    }
  } catch {
    // 팝업이 없으면 무시
  }

  // 도움말 패널 닫기
  try {
    const helpClose = page.locator('.se-help-panel-close-button, button.se-help-close-button').first();
    if (await helpClose.isVisible({ timeout: 1000 })) {
      await helpClose.click();
      await randomDelay({ min: 300, max: 600 });
    }
  } catch {
    // 무시
  }
}

/**
 * 해시태그 입력 (발행 패널에서)
 */
export async function typeHashtags(
  page: Page,
  hashtags: string[]
): Promise<void> {
  for (const tag of hashtags) {
    const tagText = tag.startsWith('#') ? tag.slice(1) : tag;
    await humanType(page, tagText);
    await page.keyboard.press('Enter');
    await randomDelay({ min: 300, max: 800 });
  }
}
