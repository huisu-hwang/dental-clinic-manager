import { execa, ExecaError } from 'execa';
import { getConfig } from './config.js';
import type { AiSuggestionTask, CommunityPost } from './supabase.js';

export interface PrCreateInput {
  cwd: string;
  branch: string;
  post: CommunityPost;
  task: AiSuggestionTask;
  summary: string;
}

export interface PrCreateResult {
  prUrl: string;
  prNumber: number | null;
}

function buildBody(input: PrCreateInput): string {
  const { post, task, summary } = input;
  const createdAt = task.created_at || new Date().toISOString();

  // Claude 요약에서 "DB 마이그레이션" 혹은 migration 관련 키워드 감지
  const lowered = summary.toLowerCase();
  const migrationMentioned =
    summary.includes('DB 마이그레이션') ||
    summary.includes('마이그레이션 필요') ||
    /supabase\/migrations\//.test(summary) ||
    /\bmigration\b/.test(lowered);

  const migrationWarning = migrationMentioned
    ? `\n### ⚠️ DB 마이그레이션 포함\n\n머지 전 Supabase MCP(\`mcp__supabase__apply_migration\`)로 SQL을 수동 적용해주세요. \`supabase/migrations/\` 디렉토리의 새 파일을 확인하세요.\n`
    : '';

  const postContent = (post.content || '').slice(0, 4000);

  return [
    '## 🤖 AI 자동 구현',
    '',
    `**원 제안**: 자유게시판 게시글 (post_id: \`${post.id}\`)`,
    `**요청자**: master_admin`,
    `**요청 시각**: ${createdAt}`,
    `**태스크 ID**: \`${task.id}\``,
    '',
    '### 제안 내용',
    '',
    postContent,
    '',
    '### 수행 내역',
    '',
    summary.trim() || '(요약 없음)',
    '',
    '### 검증',
    '',
    '- [x] `npm run build` 통과',
    '- [ ] 수동 기능 테스트 필요 (리뷰어)',
    migrationWarning,
    '---',
    '',
    '🤖 Generated with Claude Agent SDK',
  ].join('\n');
}

/**
 * gh CLI로 PR 생성. GITHUB_TOKEN 환경변수가 주입된 상태로 실행.
 */
export async function createPullRequest(input: PrCreateInput): Promise<PrCreateResult> {
  const cfg = getConfig();
  const { cwd, branch, post } = input;

  const title = (post.title || '제안 자동 구현').replace(/\n/g, ' ').slice(0, 80);
  const body = buildBody(input);

  const env = {
    ...process.env,
    GITHUB_TOKEN: cfg.githubToken,
    GH_TOKEN: cfg.githubToken, // gh CLI 양쪽 변수 모두 체크
  };

  // PR 생성
  let prUrl = '';
  try {
    const res = await execa(
      'gh',
      [
        'pr',
        'create',
        '--base',
        'develop',
        '--head',
        branch,
        '--title',
        `feat: ${title}`,
        '--body',
        body,
      ],
      { cwd, env }
    );
    // gh pr create는 stdout에 PR URL을 출력
    prUrl = res.stdout.trim().split('\n').pop() || '';
  } catch (err) {
    const e = err as ExecaError;
    const stderr = e.stderr?.toString() || '';
    // 이미 PR이 있는 경우 URL 조회로 대체
    if (stderr.includes('already exists')) {
      console.warn('[githubOps] PR 이미 존재, 기존 PR URL 조회');
      const res = await execa(
        'gh',
        ['pr', 'view', branch, '--json', 'url,number', '-q', '.url'],
        { cwd, env }
      );
      prUrl = res.stdout.trim();
    } else {
      throw new Error(`gh pr create 실패: ${stderr || e.message}`);
    }
  }

  // PR 번호 조회
  let prNumber: number | null = null;
  try {
    const res = await execa('gh', ['pr', 'view', branch, '--json', 'number', '-q', '.number'], {
      cwd,
      env,
    });
    const parsed = parseInt(res.stdout.trim(), 10);
    if (Number.isFinite(parsed)) prNumber = parsed;
  } catch (err) {
    console.warn('[githubOps] PR 번호 조회 실패:', (err as Error).message);
  }

  return { prUrl, prNumber };
}
