import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
const COOKIE_PATH = path.join(import.meta.dirname, 'naver-cookies.json');
async function testNaverBlog() {
    console.log('[Test] 네이버 블로그 테스트 (keyboard.type 방식)');
    const browser = await chromium.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    try {
        // 자동화 감지 우회
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
        // 1. 로그인 페이지
        await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        // 2. keyboard.type() - 한 글자씩 타이핑 (가장 인간적인 방식)
        console.log('[Test] ID 입력 중...');
        await page.click('#id');
        await page.waitForTimeout(300);
        await page.keyboard.type('Whitedc0902@gmail.com', { delay: 50 });
        await page.waitForTimeout(500);
        console.log('[Test] PW 입력 중...');
        await page.click('#pw');
        await page.waitForTimeout(300);
        await page.keyboard.type('gkdisclrhk0902@', { delay: 50 });
        await page.waitForTimeout(500);
        // 입력 확인 스크린샷
        await page.screenshot({ path: '/tmp/naver-typed.png' });
        // 로그인 클릭
        await page.locator('button[type="submit"].btn_login').click();
        console.log('[Test] 로그인 버튼 클릭');
        // 결과 대기
        await page.waitForTimeout(5000);
        const afterUrl = page.url();
        console.log(`[Test] URL: ${afterUrl}`);
        await page.screenshot({ path: '/tmp/naver-login-result3.png' });
        // 로그인 성공 체크
        if (!afterUrl.includes('nidlogin') && !afterUrl.includes('login')) {
            console.log('[Test] ✅ 로그인 성공!');
            await saveCookiesAndTestBlog(context, page);
        }
        else {
            const html = await page.content();
            if (html.includes('비밀번호가 잘못')) {
                console.log('[Test] ❌ 비밀번호 불일치. 계정 정보를 확인해주세요.');
            }
            else if (html.includes('자동입력 방지') || html.includes('captcha')) {
                console.log('[Test] ⚠️ 캡차 감지. 브라우저에서 직접 풀어주세요 (120초 대기)...');
                await waitForLoginSuccess(page, 120);
                if (!page.url().includes('login')) {
                    console.log('[Test] ✅ 로그인 성공 (수동 캡차 해결)!');
                    await saveCookiesAndTestBlog(context, page);
                }
            }
            else if (html.includes('새로운 환경') || html.includes('기기')) {
                console.log('[Test] ⚠️ 기기 인증 필요. 브라우저에서 직접 인증해주세요 (120초 대기)...');
                await waitForLoginSuccess(page, 120);
                if (!page.url().includes('login')) {
                    console.log('[Test] ✅ 로그인 성공 (기기 인증 완료)!');
                    await saveCookiesAndTestBlog(context, page);
                }
            }
            else {
                console.log('[Test] ❌ 로그인 실패 (원인 불명)');
                // 수동 로그인 대기
                console.log('[Test] 브라우저에서 직접 로그인해주세요 (120초 대기)...');
                await waitForLoginSuccess(page, 120);
                if (!page.url().includes('login')) {
                    console.log('[Test] ✅ 로그인 성공 (수동)!');
                    await saveCookiesAndTestBlog(context, page);
                }
            }
        }
        await page.waitForTimeout(3000);
    }
    catch (error) {
        console.error('[Test] 오류:', error);
        await page.screenshot({ path: '/tmp/naver-error-final.png' });
    }
    finally {
        await browser.close();
        console.log('[Test] 종료');
    }
}
async function waitForLoginSuccess(page, timeoutSec) {
    for (let i = 0; i < timeoutSec / 2; i++) {
        await page.waitForTimeout(2000);
        const url = page.url();
        if (!url.includes('nidlogin') && !url.includes('login')) {
            return;
        }
    }
}
async function saveCookiesAndTestBlog(context, page) {
    // 쿠키 저장
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
    console.log(`[Test] 쿠키 저장: ${COOKIE_PATH} (${cookies.length}개)`);
    // 블로그 접근
    await page.goto('https://blog.naver.com/MyBlog.naver', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const blogUrl = page.url();
    console.log(`[Test] 블로그 URL: ${blogUrl}`);
    const blogIdMatch = blogUrl.match(/blog\.naver\.com\/([^/?#]+)/);
    const blogId = blogIdMatch?.[1];
    if (blogId && blogId !== 'MyBlog.naver') {
        console.log(`[Test] ✅ 블로그 ID: ${blogId}`);
        // 에디터
        await page.goto(`https://blog.naver.com/${blogId}/postwrite`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(5000);
        await page.screenshot({ path: '/tmp/naver-editor-final.png' });
        if (page.url().includes('postwrite')) {
            console.log('[Test] ✅ 에디터 진입 성공!');
            console.log(`[Test] 블로그 ID: ${blogId}`);
        }
    }
    else {
        console.log('[Test] ⚠️ 블로그 접근 실패');
        await page.screenshot({ path: '/tmp/naver-blog-result.png' });
    }
}
testNaverBlog().catch(console.error);
