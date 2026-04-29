/**
 * PM2 설정 파일
 *
 * 실행: pm2 start ecosystem.config.js
 * 무중단 배포: pm2 reload <app> --update-env
 */
module.exports = {
  apps: [
    {
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
    },
    {
      name: 'rl-inference',
      cwd: '/Users/hhs/Project/dental-clinic-manager/rl-inference-server',
      script: '.venv/bin/uvicorn',
      args: 'src.main:app --host 127.0.0.1 --port 8001',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      max_memory_restart: '2000M',
      env: {
        PYTHONUNBUFFERED: '1',
      },
    },
  ],
}
