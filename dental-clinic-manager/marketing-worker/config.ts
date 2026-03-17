import dotenv from 'dotenv';
dotenv.config({ path: '../.env.local' });

// ============================================
// 마케팅 워커 설정
// ============================================

export const CONFIG = {
  // Supabase
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  // 네이버 블로그
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
    charType: { min: 10, max: 50 },        // 글자당
    paragraph: { min: 1000, max: 3000 },   // 문단 사이
    pageLoad: { min: 2000, max: 3000 },    // 페이지 로딩 후
    popupHandle: { min: 1000, max: 2000 }, // 팝업 처리 후
    templateApply: { min: 2000, max: 3000 }, // 템플릿 적용 후
    titleToBody: { min: 1500, max: 2500 }, // 제목→본문 이동
    imageUpload: { min: 2000, max: 4000 }, // 이미지 업로드 후
    beforeSave: { min: 1500, max: 3500 },  // 저장 전
    afterSave: { min: 3000, max: 5000 },   // 저장 완료 후
    iframeSwitch: { min: 1500, max: 3500 }, // iframe 전환
  },

  // 워커
  worker: {
    port: parseInt(process.env.MARKETING_WORKER_PORT || '3001', 10),
    cronInterval: '*/5 * * * *', // 매 5분
  },
} as const;
