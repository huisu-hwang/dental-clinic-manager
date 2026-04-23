// pm2 설정 — Mac mini에서 `pm2 start ecosystem.config.cjs`로 기동
module.exports = {
  apps: [
    {
      name: 'ai-suggestion-worker',
      script: 'npx',
      args: 'tsx src/index.ts',
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      merge_logs: true,
      time: true,
      kill_timeout: 90_000, // 진행 중 태스크가 graceful shutdown 할 시간 확보
    },
  ],
};
