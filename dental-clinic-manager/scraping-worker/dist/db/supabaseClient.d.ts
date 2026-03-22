import { SupabaseClient } from '@supabase/supabase-js';
export declare function getSupabaseClient(): SupabaseClient;
/** Supabase 연결 테스트 */
export declare function testConnection(): Promise<boolean>;
/** 워커 heartbeat 등록/업데이트 */
export declare function registerWorker(): Promise<void>;
/** 워커 heartbeat 업데이트. stop_requested=true이면 true 반환 */
export declare function updateHeartbeat(status?: 'idle' | 'busy', currentJobId?: string): Promise<boolean>;
/** 워커 상태를 offline으로 변경 */
export declare function deregisterWorker(): Promise<void>;
//# sourceMappingURL=supabaseClient.d.ts.map