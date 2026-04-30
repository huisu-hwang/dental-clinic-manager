/**
 * PM2 설정 파일 — 홈택스 스크래핑 워커
 *
 * 실행: pm2 start ecosystem.config.js
 * 부팅 시 자동 시작: pm2 startup && pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'scraping-worker',
      script: './dist/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1500M',
      env: {
        NODE_ENV: 'production',
      },
      // 빈번한 재시작 방지 — 1분 안에 10회 이상 재시작 시 stopped 상태로 전환
      max_restarts: 10,
      min_uptime: '60s',
      // 로그 위치
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
}
