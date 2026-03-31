/**
 * PM2 Ecosystem 설정 파일
 *
 * 사용법:
 *   pm2 start ecosystem.config.cjs                        # 워치독만 시작 (기본)
 *   pm2 start ecosystem.config.cjs --only scraping-worker # 워커만 시작 (수동)
 */
module.exports = {
  apps: [
    {
      name: 'scraping-watchdog',
      script: 'npx',
      args: 'tsx src/watchdog.ts',
      cwd: __dirname,
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'scraping-worker',
      script: 'npx',
      args: 'tsx src/index.ts',
      cwd: __dirname,
      interpreter: 'none',
      autorestart: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
