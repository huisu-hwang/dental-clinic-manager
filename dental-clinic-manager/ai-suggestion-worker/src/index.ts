import { getConfig } from './config.js';
import { getSupabase, listPendingTasks, type AiSuggestionTask } from './supabase.js';
import { runTask } from './taskRunner.js';

// 동시 실행은 1건만 — 큐 기반 직렬 처리
const queue: AiSuggestionTask[] = [];
const queuedIds = new Set<string>();
let processing = false;
let shuttingDown = false;

function enqueue(task: AiSuggestionTask): void {
  if (!task || task.status !== 'pending') return;
  if (queuedIds.has(task.id)) return;
  queuedIds.add(task.id);
  queue.push(task);
  console.log(`[index] 큐에 추가: ${task.id} (큐 길이: ${queue.length})`);
  processNext().catch((err) => console.error('[index] processNext 오류:', err));
}

async function processNext(): Promise<void> {
  if (processing) return;
  if (shuttingDown) return;
  const next = queue.shift();
  if (!next) return;

  processing = true;
  try {
    await runTask(next);
  } catch (err) {
    console.error('[index] runTask 예외:', err);
  } finally {
    queuedIds.delete(next.id);
    processing = false;
  }

  // 다음 태스크 처리
  if (!shuttingDown && queue.length > 0) {
    // 다음 이벤트 루프 tick에서 처리
    setImmediate(() => {
      processNext().catch((err) => console.error('[index] processNext 오류:', err));
    });
  }
}

async function recoverPendingTasks(): Promise<void> {
  console.log('[index] 기동 시 pending 태스크 복구 조회...');
  try {
    const pending = await listPendingTasks();
    if (pending.length === 0) {
      console.log('[index] pending 태스크 없음');
      return;
    }
    console.log(`[index] ${pending.length}개의 pending 태스크 발견, 큐에 추가`);
    for (const t of pending) {
      enqueue(t);
    }
  } catch (err) {
    console.error('[index] pending 복구 실패:', err);
  }
}

function subscribeRealtime(): void {
  const supabase = getSupabase();
  const channel = supabase
    .channel('ai_suggestion_tasks_changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ai_suggestion_tasks' },
      (payload) => {
        const row = payload.new as AiSuggestionTask;
        console.log(`[index] INSERT 이벤트: ${row.id} status=${row.status}`);
        if (row.status === 'pending') enqueue(row);
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'ai_suggestion_tasks' },
      (payload) => {
        const row = payload.new as AiSuggestionTask;
        const oldRow = payload.old as Partial<AiSuggestionTask>;
        // 외부에서 실패/취소한 태스크를 pending으로 되돌린 경우 재시도
        if (row.status === 'pending' && oldRow.status !== 'pending') {
          console.log(`[index] UPDATE → pending 이벤트: ${row.id}`);
          enqueue(row);
        }
      }
    )
    .subscribe((status) => {
      console.log(`[index] Realtime 구독 상태: ${status}`);
    });

  // 정리 핸들러에서 접근할 수 있도록 global에 저장
  (globalThis as unknown as { __aiSuggestionChannel?: unknown }).__aiSuggestionChannel = channel;
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[index] ${signal} 수신, graceful shutdown 시작...`);
  shuttingDown = true;

  try {
    const channel = (globalThis as unknown as { __aiSuggestionChannel?: { unsubscribe: () => Promise<unknown> } })
      .__aiSuggestionChannel;
    if (channel) {
      await channel.unsubscribe();
    }
  } catch (err) {
    console.warn('[index] 채널 unsubscribe 실패:', err);
  }

  // 진행 중 태스크는 완료될 때까지 대기 (최대 60초)
  const start = Date.now();
  while (processing && Date.now() - start < 60_000) {
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('[index] shutdown 완료');
  process.exit(0);
}

async function main(): Promise<void> {
  console.log('🤖 AI Suggestion Worker starting...');

  // 환경변수 검증 (실패 시 즉시 종료)
  try {
    const cfg = getConfig();
    console.log('[index] 설정 로드 완료');
    console.log(`  - SUPABASE_URL: ${cfg.supabaseUrl}`);
    console.log(`  - REPO_PATH: ${cfg.repoPath}`);
    console.log(`  - WORKTREE_ROOT: ${cfg.worktreeRoot}`);
    console.log(`  - CLAUDE_MODEL: ${cfg.claudeModel}`);
    console.log(`  - MAX_BUILD_RETRIES: ${cfg.maxBuildRetries}`);
    console.log(`  - TASK_TIMEOUT_MS: ${cfg.taskTimeoutMs}`);
  } catch (err) {
    console.error('❌ 설정 로드 실패:', (err as Error).message);
    process.exit(1);
  }

  // Supabase client 초기화 (내부 getSupabase 호출)
  getSupabase();

  // Realtime 구독
  subscribeRealtime();

  // 기동 직후 pending 복구
  await recoverPendingTasks();

  // 시그널 핸들러
  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((err) => {
      console.error('[index] shutdown 실패:', err);
      process.exit(1);
    });
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((err) => {
      console.error('[index] shutdown 실패:', err);
      process.exit(1);
    });
  });

  console.log('[index] ✅ Worker ready — 이벤트 대기 중...');
}

main().catch((err) => {
  console.error('❌ Worker 실행 실패:', err);
  process.exit(1);
});
