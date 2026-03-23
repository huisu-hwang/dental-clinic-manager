/**
 * 홈택스 스크래핑 워커 감시자 (Watchdog)
 *
 * 역할:
 *  - Mac mini에서 pm2로 상시 실행 (pm2 start --name scraping-watchdog -- npm run watchdog)
 *  - DB worker_control 테이블을 10초마다 폴링
 *  - start_requested = true 감지 시 → 워커 프로세스 자동 시작
 *  - 워커 프로세스 상태를 DB에 주기적으로 기록 (watchdog_online, worker_running)
 */
export {};
//# sourceMappingURL=watchdog.d.ts.map