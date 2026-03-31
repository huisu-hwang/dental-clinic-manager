import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
// 1순위: 자기 디렉토리의 .env.local (유저 PC 독립 실행)
// 2순위: 부모 디렉토리의 .env.local (서버 실행 호환)
const localEnv = resolve(__dirname, '.env.local');
const parentEnv = resolve(__dirname, '..', '.env.local');
if (existsSync(localEnv)) {
    dotenv.config({ path: localEnv });
}
else {
    dotenv.config({ path: parentEnv });
}
// ============================================
// 마케팅 워커 설정
// ============================================
export const CONFIG = {
    // 대시보드 API (유저 PC 독립 실행 시 사용)
    api: {
        dashboardUrl: process.env.DASHBOARD_API_URL || '',
        workerApiKey: process.env.WORKER_API_KEY || '',
    },
    // Supabase (서버 직접 실행 시 폴백, 없어도 동작)
    supabase: {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },
    // 네이버 블로그 (API를 통해 조회하므로 비워둬도 됨)
    naver: {
        blogId: process.env.NAVER_BLOG_ID || '',
        loginCookie: process.env.NAVER_LOGIN_COOKIE || '',
    },
    // 발행 규칙
    publishing: {
        maxPostsPerDay: 3,
        minIntervalMinutes: 30,
        snsDelayMinutes: 30,
    },
    // 타이핑 시뮬레이션 딜레이 (ms)
    delays: {
        charType: { min: 10, max: 50 }, // 글자당
        paragraph: { min: 1000, max: 3000 }, // 문단 사이
        pageLoad: { min: 2000, max: 3000 }, // 페이지 로딩 후
        popupHandle: { min: 1000, max: 2000 }, // 팝업 처리 후
        templateApply: { min: 2000, max: 3000 }, // 템플릿 적용 후
        titleToBody: { min: 1500, max: 2500 }, // 제목→본문 이동
        imageUpload: { min: 2000, max: 4000 }, // 이미지 업로드 후
        beforeSave: { min: 1500, max: 3500 }, // 저장 전
        afterSave: { min: 3000, max: 5000 }, // 저장 완료 후
        iframeSwitch: { min: 1500, max: 3500 }, // iframe 전환
    },
    // 워커
    worker: {
        port: parseInt(process.env.MARKETING_WORKER_PORT || '4001', 10),
        cronInterval: '*/5 * * * *', // 매 5분
    },
};
/**
 * API 모드 여부 (대시보드 API를 통해 동작)
 * DASHBOARD_API_URL과 WORKER_API_KEY가 설정되어 있으면 API 모드
 */
export function isApiMode() {
    return !!(CONFIG.api.dashboardUrl && CONFIG.api.workerApiKey);
}
