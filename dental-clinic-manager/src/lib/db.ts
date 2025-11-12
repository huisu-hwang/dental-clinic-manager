import { Pool } from 'pg';

// Vercel 환경 변수에서 데이터베이스 URL을 가져옵니다.
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL 환경 변수가 설정되지 않았습니다.');
}

/**
 * Connection Pool Configuration for Serverless Environment
 *
 * Important:
 * - Using Transaction Mode (port 6543) with PgBouncer
 * - Optimized for Vercel serverless functions
 * - Each function instance maintains minimal connections
 */
const pool = new Pool({
  connectionString: databaseUrl,
  // Serverless optimization: minimize connections per instance
  max: 1, // Maximum 1 connection per serverless function instance
  // Disable client-side idle timeout (PgBouncer handles this)
  idleTimeoutMillis: 0,
  // Connection establishment timeout
  connectionTimeoutMillis: 10000, // 10 seconds
});

// Monitor pool events for debugging
pool.on('error', (err) => {
  console.error('[DB Pool] Unexpected error on idle client:', err);
});

pool.on('connect', () => {
  console.log('[DB Pool] New client connected');
});

pool.on('remove', () => {
  console.log('[DB Pool] Client removed from pool');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[DB Pool] SIGTERM received, closing pool...');
  await pool.end();
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
};
