/**
 * PM2 설정 파일
 *
 * 실행: pm2 start ecosystem.config.js
 * 무중단 배포: pm2 reload trading-worker --update-env
 */
module.exports = {
  apps: [{
    name: 'trading-worker',
    script: './dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      // 환경변수는 .env 또는 PM2 ecosystem에서 설정
      // SUPABASE_URL: '',
      // SUPABASE_SERVICE_ROLE_KEY: '',
      // ENCRYPTION_KEY: '',
      // TELEGRAM_BOT_TOKEN: '',
      // WORKER_SECRET_KEY: '',
    },
  }],
}
