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

  // ✨ Idle timeout: 10 minutes (increased from 30s to prevent premature disconnection)
  // User reported 10-minute idle still fails with 30s setting
  idleTimeoutMillis: 600000, // 10 minutes

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
 * User-requested implementation: Always check connection BEFORE query execution
 *
 * Flow:
 * 1. Check connection status with SELECT 1
 * 2. If connection is broken, retry connection (up to 3 times)
 * 3. Once connection is verified, execute actual query
 * 4. If query fails, retry (up to 3 times)
 *
 * @param text - SQL query string
 * @param params - Query parameters
 * @returns Query result
 *
 * Features:
 * - **Proactive connection check** (not reactive)
 * - Verifies connection before every query
 * - Automatic reconnection with exponential backoff
 * - Double-layer retry: connection + query
 * - Detailed logging for debugging
 * - Transparent to calling code (same API)
 *
 * This approach prevents timeout errors by ensuring connection is alive
 * BEFORE attempting the actual query.
 */
async function queryWithReconnect(text: string, params?: any[]): Promise<any> {
  const MAX_CONNECTION_RETRIES = 3;
  const MAX_QUERY_RETRIES = 3;

  // ⭐ Step 1: ALWAYS check connection status BEFORE query
  let connectionVerified = false;

  for (let attempt = 0; attempt < MAX_CONNECTION_RETRIES; attempt++) {
    try {
      // Ping database to verify connection is alive
      await pool.query('SELECT 1');
      connectionVerified = true;

      if (attempt > 0) {
        console.log(`[DB] ✅ Connection restored (attempt ${attempt + 1}/${MAX_CONNECTION_RETRIES})`);
      }

      break; // Connection OK, proceed to query

    } catch (error: any) {
      console.error(`[DB] Connection check failed (attempt ${attempt + 1}/${MAX_CONNECTION_RETRIES}):`, {
        message: error.message,
        code: error.code,
      });

      // If not last attempt, wait and retry
      if (attempt < MAX_CONNECTION_RETRIES - 1) {
        const delayMs = 1000 * (attempt + 1); // 1s, 2s, 3s
        console.log(`[DB] Waiting ${delayMs}ms before reconnection...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        // All connection attempts failed
        throw new Error(`Database connection failed after ${MAX_CONNECTION_RETRIES} attempts: ${error.message}`);
      }
    }
  }

  if (!connectionVerified) {
    throw new Error('Failed to verify database connection');
  }

  // ⭐ Step 2: Execute actual query (connection is now verified)
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_QUERY_RETRIES; attempt++) {
    try {
      const result = await pool.query(text, params);

      if (attempt > 0) {
        console.log(`[DB] ✅ Query successful after retry (attempt ${attempt + 1}/${MAX_QUERY_RETRIES})`);
      }

      return result;

    } catch (error: any) {
      lastError = error;
      console.error(`[DB] Query execution failed (attempt ${attempt + 1}/${MAX_QUERY_RETRIES}):`, {
        message: error.message,
        code: error.code,
        query: text.substring(0, 100), // First 100 chars of query
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

      // Only retry connection errors
      if (!isConnectionError || attempt === MAX_QUERY_RETRIES - 1) {
        throw error;
      }

      // Exponential backoff before retry
      const delayMs = 1000 * (attempt + 1);
      console.log(`[DB] Waiting ${delayMs}ms before query retry...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

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
