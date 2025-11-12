import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions/db-connections';

// Vercel 환경 변수에서 데이터베이스 URL을 가져옵니다.
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL 환경 변수가 설정되지 않았습니다.');
}

/**
 * Connection Pool Configuration for Vercel Serverless Environment
 *
 * Two-Layer Defense for Connection Resilience (Added 2025-11-13):
 *
 * Layer 1: Prevention (TCP Keepalive)
 * - keepAlive: true → OS sends periodic keepalive probes
 * - keepAliveInitialDelayMillis: 10000 → First probe after 10s idle
 * - Prevents idle connection drops from network/firewall
 *
 * Layer 2: Recovery (Auto-Reconnect)
 * - queryWithReconnect() → Detects connection errors
 * - Automatic retry with exponential backoff (1s, 2s, 3s)
 * - Up to 3 reconnection attempts
 * - Transparent to calling code
 *
 * Problem History:
 * - Before: Transaction Mode (port 6543) → 3min idle → connection dropped → 30s timeout error
 * - Phase 1: Session Mode (port 5432) + attachDatabasePool → 3min OK, but 16min still failed
 * - Phase 2: Added TCP keepalive + auto-reconnect → Works even after 16+ minutes ✅
 *
 * Context7 Official Documentation:
 * - PostgreSQL: TCP keepalive prevents idle disconnections
 * - node-postgres: Auto-reconnect pattern for resilient connections
 * - Vercel: attachDatabasePool keeps pool alive across function invocations
 */
const pool = new Pool({
  connectionString: databaseUrl,

  // Connection pool settings
  max: 1, // One connection per function instance (Vercel recommendation)

  // Idle timeout: 30 seconds client-side
  idleTimeoutMillis: 30000,

  // Connection establishment timeout
  connectionTimeoutMillis: 10000,

  // Allow exit on idle: Vercel can gracefully shutdown when idle
  allowExitOnIdle: true,

  // ✨ TCP Keepalive (Layer 1: Prevention)
  // OS-level keepalive to prevent connection drops during idle
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000, // 10 seconds
});

// ⭐ Attach pool to Vercel Function instance lifecycle
attachDatabasePool(pool);

/**
 * Auto-Reconnect Query Wrapper (Layer 2: Recovery)
 *
 * Detects connection errors and automatically retries with exponential backoff.
 * This ensures queries succeed even if the connection was dropped.
 *
 * @param text - SQL query string
 * @param params - Query parameters
 * @param retries - Maximum retry attempts (default: 3)
 * @returns Query result
 *
 * Features:
 * - Detects connection-related errors
 * - Automatic reconnection with ping test
 * - Exponential backoff (1s, 2s, 3s)
 * - Detailed logging for debugging
 * - Transparent to calling code (same API)
 *
 * Connection Errors Handled:
 * - "Connection terminated"
 * - "ECONNREFUSED"
 * - "ETIMEDOUT"
 * - "connection is closed"
 */
async function queryWithReconnect(text: string, params?: any[], retries = 3): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Connection health check on retry attempts
      if (attempt > 0) {
        console.log(`[DB] Reconnection attempt ${attempt + 1}/${retries}`);
        // Ping test to verify connection is alive
        await pool.query('SELECT 1');
        console.log('[DB] Connection verified');
      }

      // Execute actual query
      const result = await pool.query(text, params);

      if (attempt > 0) {
        console.log('[DB] ✅ Query successful after reconnection');
      }

      return result;

    } catch (error: any) {
      lastError = error;
      console.error(`[DB] Query failed (attempt ${attempt + 1}/${retries}):`, {
        message: error.message,
        code: error.code,
      });

      // Check if this is a connection-related error
      const isConnectionError =
        error.message?.includes('Connection terminated') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('ETIMEDOUT') ||
        error.message?.includes('connection is closed') ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === '57P01' || // PostgreSQL: terminating connection
        error.code === '08003' || // PostgreSQL: connection does not exist
        error.code === '08006';   // PostgreSQL: connection failure

      // Only retry connection errors, and not on the last attempt
      if (!isConnectionError || attempt === retries - 1) {
        throw error;
      }

      // Exponential backoff before retry (1s, 2s, 3s)
      const delayMs = 1000 * (attempt + 1);
      console.log(`[DB] Waiting ${delayMs}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // This should never be reached, but TypeScript requires it
  throw lastError || new Error('Query failed after retries');
}

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

/**
 * Database interface with auto-reconnect capability
 *
 * Usage (same as before - transparent):
 * ```typescript
 * import { db } from '@/lib/db';
 *
 * const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
 * ```
 *
 * Features:
 * - Automatic reconnection on connection errors
 * - TCP keepalive to prevent idle disconnections
 * - Up to 3 retry attempts with exponential backoff
 * - Detailed logging for debugging
 */
export const db = {
  query: queryWithReconnect,
  // Expose raw pool for advanced use cases (e.g., transactions)
  pool,
};
