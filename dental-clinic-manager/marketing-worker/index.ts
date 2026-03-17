import { CONFIG } from './config.js';
import { startScheduler, stopScheduler } from './scheduler.js';

// ============================================
// 마케팅 워커 엔트리포인트
// cron 스케줄러로 승인된 글 자동 발행
// ============================================

async function main() {
  console.log('='.repeat(50));
  console.log('[MarketingWorker] 시작');
  console.log(`[MarketingWorker] 포트: ${CONFIG.worker.port}`);
  console.log(`[MarketingWorker] 블로그 ID: ${CONFIG.naver.blogId || '미설정'}`);
  console.log(`[MarketingWorker] 스케줄: ${CONFIG.worker.cronInterval}`);
  console.log(`[MarketingWorker] 하루 최대: ${CONFIG.publishing.maxPostsPerDay}건`);
  console.log('='.repeat(50));

  // 스케줄러 시작
  startScheduler();

  // 프로세스 종료 처리
  process.on('SIGINT', async () => {
    console.log('\n[MarketingWorker] 종료 중...');
    await stopScheduler();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await stopScheduler();
    process.exit(0);
  });
}

main().catch(console.error);
