import Anthropic from '@anthropic-ai/sdk';
import { execa } from 'execa';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getConfig } from './config.js';
import { updateProgress, type CommunityPost, type AiSuggestionProgressStep } from './supabase.js';

export interface ClaudeRunInput {
  worktreePath: string;
  post: CommunityPost;
  taskId: string;
  /** 빌드 실패 등 후속 수정 요청용 추가 지시문 (옵션) */
  followUpInstruction?: string;
}

export interface ClaudeRunResult {
  summary: string;
  modifiedFiles: string[];
  stoppedReason: 'end_turn' | 'max_iterations' | 'tool_error' | 'unable_to_implement';
  transcript: string;
}

const MAX_ITERATIONS = 100;
const MAX_OUTPUT_TOKENS = 8192;

// run_bash 화이트리스트: 일부는 prefix match로 판정
const BASH_WHITELIST_PREFIX = [
  'git status',
  'git diff',
  'git add',
  'git log',
  'git show',
  'npm run build',
  'npm run lint',
  'npm run typecheck',
  'node --version',
];
const BASH_WHITELIST_EXACT = ['ls', 'pwd', 'node --version'];

function isBashAllowed(cmd: string): boolean {
  const trimmed = cmd.trim();
  if (!trimmed) return false;
  // 위험 문자 차단 (세미콜론, 파이프, 백틱, $() 등)
  if (/[;&|`$<>]/.test(trimmed)) return false;
  if (BASH_WHITELIST_EXACT.includes(trimmed)) return true;
  // ls, cat <file>, pwd 같은 단순 read-only 허용
  const firstToken = trimmed.split(/\s+/)[0];
  if (['ls', 'cat', 'pwd'].includes(firstToken)) return true;
  return BASH_WHITELIST_PREFIX.some((p) => trimmed === p || trimmed.startsWith(p + ' '));
}

/** worktree 밖 경로 접근 차단 */
function resolveSafePath(worktree: string, rel: string): string {
  // 절대경로 거부
  if (path.isAbsolute(rel)) {
    throw new Error(`경로는 상대경로여야 합니다: ${rel}`);
  }
  const resolved = path.resolve(worktree, rel);
  const normalizedRoot = path.resolve(worktree) + path.sep;
  if (!resolved.startsWith(normalizedRoot) && resolved !== path.resolve(worktree)) {
    throw new Error(`worktree 외부 경로 접근 금지: ${rel}`);
  }
  return resolved;
}

// Anthropic tools 스키마
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: '현재 worktree 내의 파일 내용을 읽습니다. path는 worktree 루트로부터의 상대경로여야 합니다.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'worktree 루트로부터의 상대경로' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: '파일을 생성하거나 덮어씁니다. 기존 파일을 수정할 때는 edit_file이 더 안전합니다.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'worktree 루트로부터의 상대경로' },
        content: { type: 'string', description: '파일에 쓸 전체 내용' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description:
      '기존 파일에서 old_string을 찾아 new_string으로 교체합니다. old_string은 파일 내에서 유일해야 합니다.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'grep',
    description: 'ripgrep 기반 검색. 패턴/경로/글롭으로 파일 내용을 탐색합니다.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string', description: '(선택) worktree 내 서브경로' },
        glob: { type: 'string', description: '(선택) 파일 글롭. 예: **/*.ts' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'glob',
    description: '파일 글롭 매칭. 예: src/**/*.tsx',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'list_dir',
    description: '디렉토리 내용 리스트.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'worktree 루트로부터의 상대경로 (기본: .)' },
      },
    },
  },
  {
    name: 'run_bash',
    description:
      '제한된 bash 명령 실행. 허용 명령: git status/diff/add/log/show, npm run build/lint/typecheck, ls, cat, pwd, node --version. 다른 명령은 거부됩니다. 파이프/세미콜론/리다이렉트 금지.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
      },
      required: ['command'],
    },
  },
  {
    name: 'report_done',
    description:
      '작업 완료 시 호출. 변경 요약(마크다운)과 수정한 파일 목록을 넘깁니다. 빌드가 통과했다는 검증을 마친 뒤에 호출하세요.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '변경 요약 (마크다운)' },
        modified_files: {
          type: 'array',
          items: { type: 'string' },
          description: '수정/생성한 파일들의 상대경로 목록',
        },
      },
      required: ['summary', 'modified_files'],
    },
  },
  {
    name: 'report_unable',
    description:
      '제안이 불명확하거나 구현이 불가능할 때 호출. 이유를 명확히 작성하세요.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
      required: ['reason'],
    },
  },
];

interface ToolExecResult {
  content: string;
  isError?: boolean;
}

async function execTool(
  name: string,
  input: Record<string, unknown>,
  worktree: string
): Promise<ToolExecResult> {
  try {
    switch (name) {
      case 'read_file': {
        const p = resolveSafePath(worktree, String(input.path));
        const content = await fs.readFile(p, 'utf8');
        // 너무 큰 파일은 잘라서 반환
        if (content.length > 100_000) {
          return { content: content.slice(0, 100_000) + '\n\n[...truncated...]' };
        }
        return { content };
      }
      case 'write_file': {
        const p = resolveSafePath(worktree, String(input.path));
        const content = String(input.content ?? '');
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, content, 'utf8');
        return { content: `OK: wrote ${input.path} (${content.length} bytes)` };
      }
      case 'edit_file': {
        const p = resolveSafePath(worktree, String(input.path));
        const oldStr = String(input.old_string ?? '');
        const newStr = String(input.new_string ?? '');
        if (!oldStr) {
          return { content: 'Error: old_string이 비어 있습니다', isError: true };
        }
        const original = await fs.readFile(p, 'utf8');
        const firstIdx = original.indexOf(oldStr);
        if (firstIdx === -1) {
          return { content: `Error: old_string을 찾을 수 없음: ${input.path}`, isError: true };
        }
        const lastIdx = original.lastIndexOf(oldStr);
        if (firstIdx !== lastIdx) {
          return {
            content: `Error: old_string이 파일 내에 여러 번 등장 (${input.path}). 더 큰 컨텍스트 포함 필요.`,
            isError: true,
          };
        }
        const updated = original.replace(oldStr, newStr);
        await fs.writeFile(p, updated, 'utf8');
        return { content: `OK: edited ${input.path}` };
      }
      case 'grep': {
        const pattern = String(input.pattern ?? '');
        const subPath = input.path ? resolveSafePath(worktree, String(input.path)) : worktree;
        const glob = input.glob ? String(input.glob) : undefined;
        const args = ['--line-number', '--max-count', '200', '--color', 'never', pattern];
        if (glob) args.push('--glob', glob);
        args.push(subPath);
        try {
          const res = await execa('rg', args, { cwd: worktree, reject: false });
          if (res.exitCode === 0) {
            const out = res.stdout.length > 30_000 ? res.stdout.slice(0, 30_000) + '\n[...truncated]' : res.stdout;
            return { content: out || '(no matches)' };
          } else if (res.exitCode === 1) {
            return { content: '(no matches)' };
          } else {
            return { content: `grep 실패: ${res.stderr}`, isError: true };
          }
        } catch (err) {
          return { content: `grep 오류: ${(err as Error).message}`, isError: true };
        }
      }
      case 'glob': {
        const pattern = String(input.pattern ?? '');
        // ls + rg의 --files 조합으로 대체: rg --files -g pattern
        const res = await execa('rg', ['--files', '-g', pattern], { cwd: worktree, reject: false });
        if (res.exitCode === 0 || res.exitCode === 1) {
          const lines = res.stdout.split('\n').filter(Boolean).slice(0, 500);
          return { content: lines.length ? lines.join('\n') : '(no matches)' };
        }
        return { content: `glob 실패: ${res.stderr}`, isError: true };
      }
      case 'list_dir': {
        const rel = input.path ? String(input.path) : '.';
        const p = resolveSafePath(worktree, rel);
        const entries = await fs.readdir(p, { withFileTypes: true });
        const formatted = entries
          .slice(0, 500)
          .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
          .join('\n');
        return { content: formatted || '(empty)' };
      }
      case 'run_bash': {
        const cmd = String(input.command ?? '');
        if (!isBashAllowed(cmd)) {
          return {
            content: `Forbidden command: ${cmd}\n허용 명령: git status/diff/add/log/show, npm run build/lint/typecheck, ls, cat, pwd, node --version`,
            isError: true,
          };
        }
        const [firstToken, ...rest] = cmd.split(/\s+/);
        try {
          const res = await execa(firstToken, rest, { cwd: worktree, reject: false, timeout: 600_000 });
          const combined = [res.stdout, res.stderr].filter(Boolean).join('\n');
          const clipped = combined.length > 30_000 ? combined.slice(-30_000) : combined;
          if (res.exitCode === 0) {
            return { content: clipped || '(no output)' };
          }
          return { content: `[exit ${res.exitCode}]\n${clipped}`, isError: res.exitCode !== 0 };
        } catch (err) {
          return { content: `run_bash 오류: ${(err as Error).message}`, isError: true };
        }
      }
      default:
        return { content: `Unknown tool: ${name}`, isError: true };
    }
  } catch (err) {
    return { content: `Tool error: ${(err as Error).message}`, isError: true };
  }
}

function buildSystemPrompt(): string {
  return `당신은 하얀치과 업무 대시보드의 코드를 수정하는 자동화 엔지니어입니다.
현재 git worktree에서만 작업하세요 (모든 도구의 path는 worktree 상대경로).
목표: 자유게시판의 제안사항을 코드로 구현하고 \`npm run build\`를 통과시키세요.

## 최상위 지시사항 (절대 준수)

1. **오류/실패 시 멈추지 말고 해결한 뒤 계속 진행**. 빌드/타입 에러가 발생해도 스스로 원인을 파악하고 수정하세요.
2. **기존 기능 보호 (최우선)**: 정상 작동하는 기존 기능은 최소한으로만 변경. 관련 없는 코드/스타일/동작은 절대 변경 금지. 수정 범위를 최소화하세요.
3. **근본 원인 해결**: 임시 방편 금지. 문제의 근본 원인을 찾아 해결.
4. **CLAUDE.md 규칙 준수**: 프로젝트 루트의 CLAUDE.md 개발 원칙을 반드시 따르세요.

## 작업 규칙

- 수정 전 반드시 관련 파일들을 \`read_file\`로 읽고 구조를 파악한 뒤 수정하세요.
- \`grep\`/\`glob\`으로 의존성·사용처를 먼저 조사하세요.
- **DB 스키마 변경이 필요하면 SQL을 실행하지 말고 \`supabase/migrations/{날짜}_{slug}.sql\` 파일만 생성**하세요. 요약에 "⚠️ DB 마이그레이션 필요" 명시.
- **파괴적 작업 금지**: DROP TABLE, DELETE/UPDATE without WHERE, rm -rf, 파일 대량 삭제 절대 금지.
- **외부 네트워크 호출 금지**: curl, wget, fetch 외부 URL 금지.
- **Bash 명령은 화이트리스트**만 사용 가능: git status/diff/add/log/show, npm run build/lint/typecheck, ls, cat, pwd, node --version. 다른 명령은 거부됩니다.
- 작업 완료 조건: \`run_bash("npm run build")\`가 exit 0으로 통과해야 함. 통과 후 \`report_done\`을 호출하세요.
- 제안이 명확하지 않거나 구현이 불가능하면 \`report_unable\`을 호출하세요.

## 권장 작업 흐름

1. \`list_dir\`, \`glob\`, \`grep\`으로 코드베이스 파악 (특히 CLAUDE.md, src/ 구조)
2. 관련 파일 \`read_file\`로 숙지
3. \`write_file\` 또는 \`edit_file\`로 최소 침습적 수정
4. \`run_bash("git diff")\`로 변경 검토
5. \`run_bash("npm run build")\`로 빌드 확인. 실패 시 에러 로그 분석 후 수정 반복.
6. 빌드 성공 후 \`report_done\` 호출.

간결하게 행동하고, 이유 있는 결정을 하세요. 과도한 리팩토링이나 범위 확장은 금지입니다.`;
}

function buildUserPrompt(input: ClaudeRunInput): string {
  const { post, worktreePath: wt, followUpInstruction } = input;
  const parts = [
    `worktree 경로: ${wt}`,
    '',
    '## 제안 게시글',
    `제목: ${post.title}`,
    '',
    '내용:',
    post.content || '(내용 없음)',
  ];
  if (followUpInstruction) {
    parts.push('', '## 추가 지시사항', followUpInstruction);
  }
  parts.push('', '위 제안을 코드로 구현한 뒤 빌드를 통과시키고 report_done을 호출하세요.');
  return parts.join('\n');
}

/**
 * Claude Agent SDK(Anthropic SDK + tool loop)로 코드 수정 수행.
 */
export async function runClaude(input: ClaudeRunInput): Promise<ClaudeRunResult> {
  const cfg = getConfig();
  const anthropic = new Anthropic({ apiKey: cfg.anthropicApiKey });

  const system = buildSystemPrompt();
  const userMsg = buildUserPrompt(input);

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMsg }];

  let iterations = 0;
  const transcriptParts: string[] = [];
  let finalSummary = '';
  let finalModifiedFiles: string[] = [];
  let stoppedReason: ClaudeRunResult['stoppedReason'] = 'max_iterations';
  let currentFile: string | undefined;

  // 빌드 재시도 호출이면 rebuilding 유지, 그 외엔 analyzing으로 진행
  const baseStep: AiSuggestionProgressStep = input.followUpInstruction ? 'rebuilding' : 'analyzing';

  while (iterations < MAX_ITERATIONS) {
    iterations += 1;
    console.log(`[claudeRunner] iteration ${iterations}/${MAX_ITERATIONS}`);
    await updateProgress(input.taskId, baseStep, {
      iteration: iterations,
      maxIterations: MAX_ITERATIONS,
      currentFile,
    });

    let response: Anthropic.Message;
    try {
      response = await anthropic.messages.create({
        model: cfg.claudeModel,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        tools: TOOLS,
        messages,
      });
    } catch (err) {
      console.error('[claudeRunner] Anthropic API 오류:', err);
      throw new Error(`Claude API 실패: ${(err as Error).message}`);
    }

    // assistant 메시지를 messages에 추가
    messages.push({ role: 'assistant', content: response.content });

    // 텍스트 블록 수집 (transcript)
    for (const block of response.content) {
      if (block.type === 'text') {
        transcriptParts.push(block.text);
      }
    }

    // stop_reason 체크
    if (response.stop_reason === 'end_turn') {
      // tool_use 없이 끝남 → 모델이 그냥 종료. UNABLE_TO_IMPLEMENT 텍스트 있으면 감지.
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      if (text.includes('UNABLE_TO_IMPLEMENT')) {
        stoppedReason = 'unable_to_implement';
        finalSummary = text;
        break;
      }
      // 그냥 텍스트로만 끝난 경우 → 종료하되 요약 없음
      stoppedReason = 'end_turn';
      finalSummary = text || '(요약 없음)';
      break;
    }

    if (response.stop_reason !== 'tool_use') {
      console.warn('[claudeRunner] 예상치 못한 stop_reason:', response.stop_reason);
      stoppedReason = 'end_turn';
      break;
    }

    // tool_use 블록들 처리
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );
    if (toolUseBlocks.length === 0) {
      console.warn('[claudeRunner] stop_reason=tool_use이지만 tool_use 블록 없음');
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let shouldBreak = false;

    for (const tu of toolUseBlocks) {
      // 종료 신호 도구
      if (tu.name === 'report_done') {
        const rawInput = (tu.input || {}) as { summary?: string; modified_files?: string[] };
        finalSummary = rawInput.summary || '(요약 없음)';
        finalModifiedFiles = Array.isArray(rawInput.modified_files) ? rawInput.modified_files : [];
        stoppedReason = 'end_turn';
        shouldBreak = true;
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: 'OK: report_done 접수',
        });
        continue;
      }
      if (tu.name === 'report_unable') {
        const rawInput = (tu.input || {}) as { reason?: string };
        finalSummary = `UNABLE_TO_IMPLEMENT: ${rawInput.reason || '(사유 미제공)'}`;
        stoppedReason = 'unable_to_implement';
        shouldBreak = true;
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: 'OK: report_unable 접수',
        });
        continue;
      }

      // 파일 수정 도구면 currentFile 갱신 (UI 실시간 표시용)
      if ((tu.name === 'write_file' || tu.name === 'edit_file') && typeof (tu.input as { path?: unknown })?.path === 'string') {
        currentFile = String((tu.input as { path: string }).path);
      }

      const result = await execTool(
        tu.name,
        (tu.input || {}) as Record<string, unknown>,
        input.worktreePath
      );
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: result.content,
        is_error: result.isError,
      });
    }

    messages.push({ role: 'user', content: toolResults });

    if (shouldBreak) break;
  }

  if (iterations >= MAX_ITERATIONS) {
    stoppedReason = 'max_iterations';
  }

  const transcript = transcriptParts.join('\n\n---\n\n');

  return {
    summary: finalSummary || '(요약 없음)',
    modifiedFiles: finalModifiedFiles,
    stoppedReason,
    transcript,
  };
}
