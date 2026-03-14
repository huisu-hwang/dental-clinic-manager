import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { createChildLogger } from '../utils/logger.js';
const log = createChildLogger('supabase');
let client = null;
export function getSupabaseClient() {
    if (!client) {
        client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
        log.info('Supabase 클라이언트 초기화 완료');
    }
    return client;
}
/** Supabase 연결 테스트 */
export async function testConnection() {
    try {
        const supabase = getSupabaseClient();
        const { error } = await supabase
            .from('scraping_workers')
            .select('id')
            .limit(1);
        if (error) {
            log.error({ error }, 'Supabase 연결 테스트 실패');
            return false;
        }
        log.info('Supabase 연결 테스트 성공');
        return true;
    }
    catch (err) {
        log.error({ err }, 'Supabase 연결 테스트 예외');
        return false;
    }
}
/** 워커 heartbeat 등록/업데이트 */
export async function registerWorker() {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('scraping_workers')
        .upsert({
        id: config.worker.id,
        hostname: (await import('os')).hostname(),
        status: 'idle',
        last_heartbeat: new Date().toISOString(),
        started_at: new Date().toISOString(),
        metadata: {
            node_version: process.version,
            platform: process.platform,
            arch: process.arch,
        },
    }, { onConflict: 'id' });
    if (error) {
        log.error({ error }, '워커 등록 실패');
        throw error;
    }
    log.info({ workerId: config.worker.id }, '워커 등록 완료');
}
/** 워커 heartbeat 업데이트 */
export async function updateHeartbeat(status = 'idle', currentJobId) {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('scraping_workers')
        .update({
        status,
        current_job_id: currentJobId || null,
        last_heartbeat: new Date().toISOString(),
    })
        .eq('id', config.worker.id);
    if (error) {
        log.warn({ error }, 'heartbeat 업데이트 실패');
    }
}
/** 워커 상태를 offline으로 변경 */
export async function deregisterWorker() {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('scraping_workers')
        .update({
        status: 'offline',
        current_job_id: null,
        last_heartbeat: new Date().toISOString(),
    })
        .eq('id', config.worker.id);
    if (error) {
        log.warn({ error }, '워커 해제 실패');
    }
    else {
        log.info('워커 상태 offline으로 변경');
    }
}
//# sourceMappingURL=supabaseClient.js.map