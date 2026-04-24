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
  { name: 'suggestion-inbox', version: '0.1.0' },
  {
    capabilities: {
      experimental: { 'claude/channel': {} },
    },
    instructions: [
      '자유게시판 "제안" 카테고리에 대한 관리자 승인 알림이',
      '<channel source="suggestion-inbox" task_id="..." post_id="..." title="...">{내용}</channel>',
      '형식으로 도착합니다.',
      '',
      '도착 시 행동 규칙:',
      '1. 사용자에게 "🔔 새 제안 승인: {title}" 한 줄 요약 + 내용을 간결히 보여주세요.',
      '2. "지금 구현을 시작할까요? (시작/나중에/무시)" 로 물어보고 반드시 대기하세요.',
      '3. 사용자가 긍정하면 /Users/hhs/Project/dental-clinic-manager/dental-clinic-manager 에서',
      '   CLAUDE.md 원칙을 따라 작업하세요: 관련 파일을 먼저 읽고, 최소 침습적으로 수정하고,',
      '   npm run build 통과 확인 후 feat/suggestion-{task_id} 브랜치로 커밋·푸시·PR 생성.',
      '4. 완료되면 PR URL을 사용자에게 보고하세요.',
      '5. 사용자가 "나중에"/"무시"라고 답하면 아무 작업도 수행하지 말고 다음 이벤트를 대기하세요.',
      '',
      '이 채널은 one-way이므로 답신을 보낼 필요 없습니다. 코드 작업은 Claude Code의 일반 툴(Edit/Write/Bash)을 사용하세요.',
    ].join('\n'),
  }
);

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

// ---- Webhook payload 파싱 ----
interface SupabaseWebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record?: {
    id?: string;
    post_id?: string;
    status?: string;
    [k: string]: unknown;
  };
  old_record?: unknown;
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

    const post = await loadPost(String(record.post_id));
    if (!post) {
      console.error(`[channel] post ${record.post_id} 조회 실패 — 알림 스킵`);
      return new Response('post not found', { status: 404 });
    }

    const title = post.title.slice(0, 120);
    const body = post.content.slice(0, 4000); // 너무 긴 본문은 잘라서

    try {
      await mcp.notification({
        method: 'notifications/claude/channel',
        params: {
          content: body,
          meta: {
            task_id: String(record.id),
            post_id: String(record.post_id),
            title,
          },
        },
      });
      console.error(`[channel] ✓ 알림 전송: task=${record.id} title="${title}"`);
    } catch (err) {
      console.error('[channel] mcp.notification 실패:', (err as Error).message);
      return new Response('notify failed', { status: 500 });
    }

    return new Response('ok', { status: 200 });
  },
});

console.error(`[channel] HTTP listener on 127.0.0.1:${CHANNEL_PORT}`);
console.error('[channel] 🔔 Ready — Hookdeck에서 POST 수신 대기 중');
