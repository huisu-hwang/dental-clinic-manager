#!/usr/bin/env bun
/**
 * ai-suggestion-channel — 자유게시판 제안을 Claude Code 세션에 푸시하는 MCP 채널 서버
 *
 * 흐름:
 *   Supabase ai_suggestion_tasks INSERT
 *     → Supabase Database Webhook (POST to Hookdeck)
 *     → Hookdeck CLI 터널
 *     → 이 서버 (localhost:8788)
 *     → mcp.notification('notifications/claude/channel') → Claude Code 세션
 *
 * Claude가 <channel source="suggestion-inbox" ...>제안 본문</channel> 태그로 이벤트를 받음.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createClient } from '@supabase/supabase-js';

// ---- 환경변수 ----
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const CHANNEL_PORT = Number(process.env.CHANNEL_PORT ?? 8788);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[channel] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---- MCP 서버 초기화 (Claude Code Channel 등록) ----
const mcp = new Server(
  { name: 'suggestion-inbox', version: '0.2.0' },
  {
    capabilities: {
      experimental: { 'claude/channel': {} },
      tools: {},
    },
    instructions: [
      '자유게시판 "제안" 카테고리에 대한 관리자 승인 알림이',
      '<channel source="suggestion-inbox" task_id="..." post_id="..." title="...">{내용}</channel>',
      '형식으로 도착합니다. 승인 버튼이 이미 눌린 상태이므로 추가 확인 없이 즉시 구현에 착수합니다.',
      '',
      '워크플로우 요약:',
      '- 작업은 feat/suggestion-{task_id} 브랜치(=develop에서 분기)에서 진행',
      '- 빌드 통과하면 develop으로 자동 머지·푸시 (별도 PR 리뷰 단계 없음)',
      '- 그 후 develop → main 통합 PR을 생성/갱신 (열려 있으면 새로 만들지 않고 자동 누적). 머지는 사람이 수동으로 진행.',
      '',
      '[신규 구현] meta.kind 가 비어있거나 "task"인 일반 메시지:',
      '1. update_suggestion_task(task_id=<태그의 task_id>, status="running", progress_step="analyzing") 호출.',
      '2. 사용자에게 "🔔 새 제안 구현 시작: {title}" 한 줄 요약과 내용을 간결히 출력 후 바로 착수.',
      '3. /Users/hhs/Project/dental-clinic-manager/dental-clinic-manager 에서 CLAUDE.md 원칙대로 작업: git fetch origin develop → git checkout -b feat/suggestion-{task_id} origin/develop 으로 분기, 관련 파일을 먼저 읽고 최소 침습적으로 수정, npm run build 통과까지 확인. 빌드 실패 시 최대 3회 재시도.',
      '4. feat 브랜치에 커밋(`feat: <제목>` 형식) → git push origin feat/suggestion-{task_id}.',
      '5. **develop 자동 통합**: git checkout develop && git pull --rebase origin develop && git merge --no-ff feat/suggestion-{task_id} -m "Merge feat/suggestion-{task_id}: <제목>" && git push origin develop. 충돌 시 develop 우선으로 해결한 뒤 다시 푸시까지 완료.',
      '6. **develop → main 통합 PR 생성/갱신**: gh pr list --base main --head develop --state open --json number,url --limit 1 로 기존 PR 확인. 없으면 gh pr create --base main --head develop --title "release: develop → main (누적 변경 통합)" --body "..." 로 신규 생성. 있으면 그 URL을 그대로 사용 (새 커밋이 PR에 자동 누적됨).',
      '7. update_suggestion_task(task_id, status="completed", pr_url=<develop→main PR URL>, pr_number=..., commit_sha=<develop의 머지 커밋 SHA>, branch_name="develop", worker_log=<한 줄 요약>) 호출.',
      '8. 사용자에게 "✅ {title} 구현 완료 → develop 푸시 + main 통합 PR 갱신" 출력.',
      '9. 단계 전환마다 update_suggestion_task(task_id, progress_step) 호출 권장 (editing/building/committing/pushing/creating_pr).',
      '10. 중간에 구현 불가·빌드 3회 실패·기타 오류로 중단 시 update_suggestion_task(task_id, status="failed", error_message=<사유>) 후 사용자에게 보고.',
      '',
      '[Follow-up 추가 수정] meta.kind="followup" 으로 도착하는 메시지 (마스터의 댓글 기반):',
      '- 본문 상단에 "작업 브랜치" 정보가 포함됨. 그 브랜치를 그대로 활용해 추가 수정 후 develop에 다시 머지·푸시.',
      '1. update_suggestion_task(task_id, status="running", progress_step="editing") 호출.',
      '2. git fetch origin develop && git checkout {작업 브랜치} && git pull --rebase origin develop (develop의 최신 상태 흡수).',
      '3. 마스터 추가 요청에 따라 최소 침습적 수정 → npm run build 통과 확인 → 커밋 "fixup: <짧은 설명>" 으로 동일 브랜치에 커밋·푸시.',
      '4. **develop 재통합**: git checkout develop && git pull --rebase origin develop && git merge --no-ff {작업 브랜치} && git push origin develop.',
      '5. **develop → main PR 갱신 확인**: 이미 열려 있으면 그 PR에 새 커밋이 자동 반영 (별도 작업 불필요). 닫혀 있거나 없으면 신규 생성(상기 6번과 동일 명령).',
      '6. update_suggestion_task(task_id, status="completed", pr_url=<develop→main PR>, commit_sha=<새 머지 SHA>, worker_log="follow-up: <요약>") 호출.',
      '7. 사용자에게 "🔁 follow-up 적용 완료: {요약} → develop 푸시 + main 통합 PR 갱신" 출력.',
      '8. follow-up 도중 빌드 실패 시 update_suggestion_task(task_id, status="failed", error_message=<사유>).',
      '',
      '예외: 제안 내용이 명백한 스팸·테스트·무의미(예: "테스트", "hi", "아무거나") 이거나 도덕적·법적으로 문제되는 내용이면 구현하지 말고 update_suggestion_task(status="cancelled", error_message="<사유>") 호출 후 중단.',
      '',
      '이 채널은 two-way이지만 응답은 update_suggestion_task tool 호출로만 이뤄집니다. 코드 작업은 Claude Code의 일반 툴(Edit/Write/Bash)을 사용하세요.',
    ].join('\n'),
  }
);

// ---- Supabase UPDATE 헬퍼 (tool 구현) ----
type UpdateSuggestionTaskArgs = {
  task_id: string;
  status?: 'running' | 'completed' | 'failed' | 'cancelled';
  progress_step?:
    | 'initializing'
    | 'creating_worktree'
    | 'analyzing'
    | 'editing'
    | 'building'
    | 'rebuilding'
    | 'committing'
    | 'pushing'
    | 'creating_pr';
  pr_url?: string;
  pr_number?: number;
  commit_sha?: string;
  branch_name?: string;
  error_message?: string;
  worker_log?: string;
};

async function updateSuggestionTask(args: UpdateSuggestionTaskArgs): Promise<string> {
  if (!args.task_id) throw new Error('task_id 필수');

  const patch: Record<string, unknown> = {};
  if (args.status) {
    patch.status = args.status;
    if (args.status === 'running' && !args['started_at' as keyof UpdateSuggestionTaskArgs]) {
      patch.started_at = new Date().toISOString();
    }
    if (['completed', 'failed', 'cancelled'].includes(args.status)) {
      patch.completed_at = new Date().toISOString();
      // 종료 시 progress_detail/step 클리어
      patch.progress_step = null;
      patch.progress_detail = null;
    }
  }
  if (args.progress_step !== undefined) patch.progress_step = args.progress_step;
  if (args.pr_url !== undefined) patch.pr_url = args.pr_url;
  if (args.pr_number !== undefined) patch.pr_number = args.pr_number;
  if (args.commit_sha !== undefined) patch.commit_sha = args.commit_sha;
  if (args.branch_name !== undefined) patch.branch_name = args.branch_name;
  if (args.error_message !== undefined) patch.error_message = args.error_message?.slice(0, 4000);
  if (args.worker_log !== undefined) patch.worker_log = args.worker_log?.slice(-20000);

  if (Object.keys(patch).length === 0) {
    return 'no-op: 업데이트할 필드 없음';
  }

  const { data, error } = await supabase
    .from('ai_suggestion_tasks')
    .update(patch)
    .eq('id', args.task_id)
    .select('id, status, progress_step')
    .maybeSingle();

  if (error) throw new Error(`Supabase UPDATE 실패: ${error.message}`);
  if (!data) throw new Error(`task_id ${args.task_id}에 해당하는 행 없음`);

  return `OK task=${data.id} status=${data.status ?? '-'} step=${data.progress_step ?? '-'}`;
}

// ---- MCP tool 등록 ----
mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'update_suggestion_task',
      description:
        'AI 제안 태스크의 진행 상태를 웹앱 대시보드에 반영합니다. 작업 시작(running)·중간(progress_step)·완료(completed+pr_url)·실패(failed+error_message)·취소(cancelled) 시 호출.',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: '<channel ... task_id="..."> 의 값 그대로' },
          status: {
            type: 'string',
            enum: ['running', 'completed', 'failed', 'cancelled'],
            description: '작업 상태',
          },
          progress_step: {
            type: 'string',
            enum: [
              'initializing',
              'creating_worktree',
              'analyzing',
              'editing',
              'building',
              'rebuilding',
              'committing',
              'pushing',
              'creating_pr',
            ],
            description: '현재 수행 중인 세부 단계 (선택)',
          },
          pr_url: { type: 'string', description: '생성된 PR URL (completed 시 권장)' },
          pr_number: { type: 'number', description: 'PR 번호 (completed 시 권장)' },
          commit_sha: { type: 'string', description: '대표 커밋 SHA (completed 시 권장)' },
          branch_name: { type: 'string', description: '작업한 브랜치명' },
          error_message: { type: 'string', description: '실패 사유 (failed 시)' },
          worker_log: { type: 'string', description: '작업 요약 (마크다운 허용, 20KB까지 보존)' },
        },
        required: ['task_id'],
      },
    },
  ],
}));

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === 'update_suggestion_task') {
    const args = (req.params.arguments ?? {}) as UpdateSuggestionTaskArgs;
    try {
      const result = await updateSuggestionTask(args);
      // 종료 상태 진입 시 큐 drain (다음 pending이 있으면 자동 push)
      if (args.status && ['completed', 'failed', 'cancelled'].includes(args.status)) {
        setTimeout(() => {
          pushNextPendingIfIdle().catch((e) =>
            console.error('[channel] 큐 drain 오류:', (e as Error).message)
          );
        }, 200);
      }
      return { content: [{ type: 'text', text: result }] };
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[channel] update_suggestion_task 실패:', msg);
      return {
        content: [{ type: 'text', text: `Error: ${msg}` }],
        isError: true,
      };
    }
  }
  throw new Error(`Unknown tool: ${req.params.name}`);
});

// ---- Supabase에서 post 상세 조회 ----
async function loadPost(postId: string): Promise<{ title: string; content: string } | null> {
  const { data, error } = await supabase
    .from('community_posts')
    .select('title, content')
    .eq('id', postId)
    .maybeSingle();
  if (error) {
    console.error('[channel] community_posts 조회 실패:', error.message);
    return null;
  }
  if (!data) return null;
  return { title: String(data.title ?? ''), content: String(data.content ?? '') };
}

// ---- 큐 헬퍼: stale reap, single-flight, drain ----
async function reapStaleRunning(): Promise<number> {
  // 채널 서버 재기동 시점에 status='running'인 task는 좀비로 간주.
  // Claude 세션과 MCP 서버는 1:1로 묶여 있으므로 서버가 새로 뜨면 직전 진행분은 모두 인터럽트.
  const { data, error } = await supabase
    .from('ai_suggestion_tasks')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      progress_step: null,
      progress_detail: null,
      error_message: '채널 서버 재기동으로 인터럽트됐습니다. 다시 시도하세요.',
    })
    .eq('status', 'running')
    .select('id');
  if (error) {
    console.error('[channel] reapStaleRunning 실패:', error.message);
    return 0;
  }
  const count = data?.length ?? 0;
  if (count > 0) console.error(`[channel] ⚠ 좀비 running task ${count}개 → failed 처리`);
  return count;
}

async function hasRunningTask(): Promise<boolean> {
  const { count, error } = await supabase
    .from('ai_suggestion_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'running');
  if (error) {
    console.error('[channel] hasRunningTask 실패:', error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

async function pickOldestPending(): Promise<{ id: string; post_id: string } | null> {
  const { data, error } = await supabase
    .from('ai_suggestion_tasks')
    .select('id, post_id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[channel] pickOldestPending 실패:', error.message);
    return null;
  }
  return data ? { id: String(data.id), post_id: String(data.post_id) } : null;
}

async function pushTaskToChannel(taskId: string, postId: string): Promise<boolean> {
  const post = await loadPost(postId);
  if (!post) {
    console.error(`[channel] post ${postId} 조회 실패 — push 스킵`);
    return false;
  }
  const title = post.title.slice(0, 120);
  const body = post.content.slice(0, 4000);
  try {
    await mcp.notification({
      method: 'notifications/claude/channel',
      params: {
        content: body,
        meta: { task_id: taskId, post_id: postId, title },
      },
    });
    console.error(`[channel] ✓ 알림 전송: task=${taskId} title="${title}"`);
    return true;
  } catch (err) {
    console.error('[channel] mcp.notification 실패:', (err as Error).message);
    return false;
  }
}

async function pushNextPendingIfIdle(): Promise<void> {
  if (await hasRunningTask()) {
    console.error('[channel] 다른 task 진행 중 — 큐 대기');
    return;
  }
  const next = await pickOldestPending();
  if (!next) {
    console.error('[channel] 큐 비어 있음 — 대기 종료');
    return;
  }
  console.error(`[channel] 큐 drain: task=${next.id} push 시도`);
  await pushTaskToChannel(next.id, next.post_id);
}

// ---- Webhook payload 파싱 ----
interface SupabaseWebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE' | 'FOLLOWUP';
  table: string;
  schema: string;
  record?: {
    id?: string;
    post_id?: string;
    status?: string;
    // FOLLOWUP 전용
    content?: string;
    task_id?: string;
    task_status?: string;
    branch_name?: string;
    pr_url?: string;
    pr_number?: number;
    post_title?: string;
    [k: string]: unknown;
  };
  old_record?: unknown;
}

// ---- follow-up 알림 push: 마스터 댓글을 기존 PR/브랜치 컨텍스트로 채널에 전달 ----
async function pushFollowupToChannel(record: NonNullable<SupabaseWebhookPayload['record']>): Promise<boolean> {
  const taskId = String(record.task_id ?? '');
  const postId = String(record.post_id ?? '');
  const branch = record.branch_name ? String(record.branch_name) : '';
  const prUrl = record.pr_url ? String(record.pr_url) : '';
  const prNumber = typeof record.pr_number === 'number' ? record.pr_number : null;
  const postTitle = record.post_title ? String(record.post_title) : '';
  const content = String(record.content ?? '').slice(0, 4000);

  if (!taskId || !postId || !content) {
    console.error('[channel] follow-up payload 필수 필드 누락');
    return false;
  }

  // 기존 task의 작업 결과(브랜치/PR)를 컨텍스트로 전달.
  // Claude는 instructions의 follow-up 분기를 따라 기존 브랜치를 checkout 후 추가 커밋.
  const body = [
    `[follow-up 요청 — 기존 PR에 추가 수정]`,
    branch ? `- 작업 브랜치: ${branch}` : '',
    prUrl ? `- 기존 PR: ${prUrl}${prNumber ? ` (#${prNumber})` : ''}` : '',
    `- 원본 task_id: ${taskId}`,
    '',
    `[마스터 추가 요청]`,
    content,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    await mcp.notification({
      method: 'notifications/claude/channel',
      params: {
        content: body,
        meta: {
          task_id: taskId,
          post_id: postId,
          title: postTitle ? `[follow-up] ${postTitle}` : '[follow-up]',
          kind: 'followup',
          branch_name: branch,
          pr_url: prUrl,
        },
      },
    });
    console.error(`[channel] ✓ follow-up 전송: task=${taskId} branch=${branch}`);
    return true;
  } catch (err) {
    console.error('[channel] follow-up notification 실패:', (err as Error).message);
    return false;
  }
}

// ---- MCP stdio 연결 ----
await mcp.connect(new StdioServerTransport());
console.error(`[channel] MCP stdio 연결 완료`);

// ---- HTTP 리스너 ----
Bun.serve({
  port: CHANNEL_PORT,
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (req.method === 'GET' && url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }

    if (req.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }

    // Secret 검증 (설정돼 있을 때만)
    if (WEBHOOK_SECRET) {
      const got = req.headers.get('x-webhook-secret') ?? req.headers.get('X-Webhook-Secret');
      if (got !== WEBHOOK_SECRET) {
        console.error('[channel] webhook secret mismatch');
        return new Response('forbidden', { status: 403 });
      }
    }

    let payload: SupabaseWebhookPayload;
    try {
      payload = (await req.json()) as SupabaseWebhookPayload;
    } catch (err) {
      console.error('[channel] JSON parse 실패:', (err as Error).message);
      return new Response('invalid json', { status: 400 });
    }

    // FOLLOWUP: 마스터 댓글 기반 follow-up — 단일 비행 게이트는 적용하지 않음
    // (이미 종료된 task의 PR에 코멘트로 들어온 추가 요청이므로 즉시 처리)
    if (payload.type === 'FOLLOWUP' && payload.table === 'community_comments') {
      const record = payload.record;
      if (!record) {
        return new Response('invalid record', { status: 400 });
      }
      const ok = await pushFollowupToChannel(record);
      return new Response(ok ? 'ok' : 'notify failed', { status: ok ? 200 : 500 });
    }

    // INSERT 이벤트만 처리 (ai_suggestion_tasks 테이블 기준)
    if (payload.type !== 'INSERT' || payload.table !== 'ai_suggestion_tasks') {
      console.error(`[channel] 무시: type=${payload.type} table=${payload.table}`);
      return new Response('ignored', { status: 200 });
    }

    const record = payload.record;
    if (!record?.post_id || !record?.id) {
      console.error('[channel] payload.record에 post_id/id 누락');
      return new Response('invalid record', { status: 400 });
    }

    // status='pending'만 통지 (승인 시점)
    if (record.status !== 'pending') {
      console.error(`[channel] status='${record.status}' 건너뜀`);
      return new Response('skipped', { status: 200 });
    }

    // single-flight 게이트: 다른 task가 running이면 즉시 push하지 않고 큐에 보존
    if (await hasRunningTask()) {
      console.error(
        `[channel] task=${record.id}: 다른 작업 진행 중 — 큐 대기 (status=pending 유지)`
      );
      return new Response('queued', { status: 200 });
    }

    const ok = await pushTaskToChannel(String(record.id), String(record.post_id));
    if (!ok) return new Response('notify failed', { status: 500 });

    return new Response('ok', { status: 200 });
  },
});

console.error(`[channel] HTTP listener on 127.0.0.1:${CHANNEL_PORT}`);
console.error('[channel] 🔔 Ready — Hookdeck에서 POST 수신 대기 중');

// 부팅 정리: 좀비 running 정리 → 대기 중인 pending 작업 자동 픽업
// Claude Code의 채널 핸들러 등록이 mcp.connect 이후 비동기적으로 완료되므로
// 알림 유실 방지를 위해 충분한 지연(20초) 후 drain 실행.
const STARTUP_DRAIN_DELAY_MS = 20_000;
setTimeout(() => {
  (async () => {
    try {
      await reapStaleRunning();
      await pushNextPendingIfIdle();
    } catch (err) {
      console.error('[channel] startup reap/drain 오류:', (err as Error).message);
    }
  })();
}, STARTUP_DRAIN_DELAY_MS);
console.error(`[channel] startup drain은 ${STARTUP_DRAIN_DELAY_MS / 1000}초 후 실행 예정`);
