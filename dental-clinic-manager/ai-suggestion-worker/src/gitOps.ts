import { execa, ExecaError } from 'execa';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getConfig } from './config.js';
import type { CommunityPost } from './supabase.js';

export interface WorktreeInfo {
  taskId: string;
  branchName: string;
  worktreePath: string;
}

export interface BuildResult {
  ok: boolean;
  attempts: number;
  lastStdout: string;
  lastStderr: string;
}

export type BuildRetryCallback = (
  attempt: number,
  stdout: string,
  stderr: string
) => Promise<void>;

function branchName(taskId: string): string {
  return `feat/suggestion-${taskId}`;
}

function worktreePath(taskId: string): string {
  const { worktreeRoot } = getConfig();
  return path.join(worktreeRoot, `suggestion-${taskId}`);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function runGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execa('git', args, { cwd, env: { ...process.env, LANG: 'en_US.UTF-8' } });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (err) {
    const e = err as ExecaError;
    throw new Error(`git ${args.join(' ')} 실패: ${e.stderr || e.message}`);
  }
}

/**
 * origin/develop 기준으로 깨끗한 worktree 생성.
 * 브랜치가 이미 있으면 강제로 재생성.
 */
export async function createWorktree(taskId: string): Promise<WorktreeInfo> {
  const cfg = getConfig();
  const branch = branchName(taskId);
  const wtPath = worktreePath(taskId);

  await ensureDir(cfg.worktreeRoot);

  // 이미 같은 경로에 worktree가 있으면 먼저 제거 시도
  if (await exists(wtPath)) {
    console.log(`[gitOps] 기존 worktree 감지, 제거: ${wtPath}`);
    try {
      await runGit(cfg.repoPath, ['worktree', 'remove', '--force', wtPath]);
    } catch (err) {
      console.warn('[gitOps] worktree remove 실패 (계속 진행):', (err as Error).message);
      // 잔해가 남아있으면 디렉토리 강제 제거
      await fs.rm(wtPath, { recursive: true, force: true });
    }
  }

  // develop 최신화
  await runGit(cfg.repoPath, ['fetch', 'origin', 'develop']);

  // 브랜치가 이미 존재하는지 확인
  let branchExists = false;
  try {
    await runGit(cfg.repoPath, ['rev-parse', '--verify', `refs/heads/${branch}`]);
    branchExists = true;
  } catch {
    branchExists = false;
  }

  if (branchExists) {
    // 기존 브랜치를 origin/develop으로 재설정
    await runGit(cfg.repoPath, ['branch', '-f', branch, 'origin/develop']);
    await runGit(cfg.repoPath, ['worktree', 'add', wtPath, branch]);
  } else {
    await runGit(cfg.repoPath, ['worktree', 'add', wtPath, '-b', branch, 'origin/develop']);
  }

  console.log(`[gitOps] worktree 생성 완료: ${wtPath} (branch: ${branch})`);
  return { taskId, branchName: branch, worktreePath: wtPath };
}

/**
 * 현재 worktree에 어떤 변경이든 있는지 확인.
 */
export async function hasChanges(cwd: string): Promise<boolean> {
  try {
    const result = await execa('git', ['status', '--porcelain'], { cwd });
    return result.stdout.trim().length > 0;
  } catch (err) {
    console.error('[gitOps] hasChanges 실패:', err);
    return false;
  }
}

/**
 * npm run build 실행. 실패 시 maxRetries 횟수만큼 onRetry 콜백으로 Claude에게 수정 요청.
 * onRetry가 호출된 뒤 다시 빌드 시도.
 */
export async function verifyBuild(
  cwd: string,
  maxRetries: number,
  onRetry: BuildRetryCallback
): Promise<BuildResult> {
  let attempts = 0;
  let lastStdout = '';
  let lastStderr = '';

  // node_modules가 없으면 설치 (npm ci 선호, 실패 시 npm install)
  const nodeModulesExists = await exists(path.join(cwd, 'node_modules'));
  if (!nodeModulesExists) {
    console.log('[gitOps] node_modules 없음, npm ci 실행...');
    try {
      await execa('npm', ['ci', '--prefer-offline', '--no-audit'], { cwd, stdio: 'inherit' });
    } catch (err) {
      console.warn('[gitOps] npm ci 실패, npm install 재시도:', (err as Error).message);
      await execa('npm', ['install', '--prefer-offline', '--no-audit'], { cwd, stdio: 'inherit' });
    }
  }

  for (;;) {
    attempts += 1;
    console.log(`[gitOps] npm run build 시도 ${attempts}/${maxRetries + 1}...`);
    try {
      const res = await execa('npm', ['run', 'build'], {
        cwd,
        env: { ...process.env, CI: 'true' },
        // 빌드 로그는 캡처해서 Claude에게 전달
      });
      lastStdout = res.stdout;
      lastStderr = res.stderr;
      console.log(`[gitOps] 빌드 성공 (시도 ${attempts}회)`);
      return { ok: true, attempts, lastStdout, lastStderr };
    } catch (err) {
      const e = err as ExecaError;
      lastStdout = e.stdout?.toString() || '';
      lastStderr = e.stderr?.toString() || '';
      console.warn(`[gitOps] 빌드 실패 (시도 ${attempts}):`, lastStderr.slice(-500));

      if (attempts > maxRetries) {
        return { ok: false, attempts, lastStdout, lastStderr };
      }

      // Claude에게 수정 요청
      await onRetry(attempts, lastStdout, lastStderr);
    }
  }
}

export interface CommitResult {
  commitSha: string;
  branchName: string;
}

/**
 * git add -A → commit → push.
 * 변경사항이 없으면 null 반환.
 */
export async function commitAndPush(
  cwd: string,
  post: CommunityPost,
  taskId: string,
  summary: string
): Promise<CommitResult | null> {
  const branch = branchName(taskId);

  // 변경사항 확인
  if (!(await hasChanges(cwd))) {
    console.log('[gitOps] 변경사항 없음, 커밋 스킵');
    return null;
  }

  await runGit(cwd, ['add', '-A']);

  const title = post.title?.trim() || '제안 자동 구현';
  const safeTitle = title.replace(/\n/g, ' ').slice(0, 70);
  const commitMessage = [
    `feat(suggestion): ${safeTitle}`,
    '',
    summary.trim(),
    '',
    `원 제안: post_id=${post.id}`,
    '자동 생성 by ai-suggestion-worker',
    '',
    '🤖 Generated with Claude Agent SDK',
  ].join('\n');

  // commit
  try {
    await execa('git', ['commit', '-m', commitMessage], { cwd });
  } catch (err) {
    const e = err as ExecaError;
    throw new Error(`git commit 실패: ${e.stderr || e.message}`);
  }

  // sha 조회
  const { stdout: sha } = await execa('git', ['rev-parse', 'HEAD'], { cwd });

  // push (신규 브랜치이므로 -u)
  try {
    await execa('git', ['push', '-u', 'origin', branch], { cwd });
  } catch (err) {
    const e = err as ExecaError;
    // 이미 원격에 브랜치가 있는 경우 강제 푸시 (동일 task id → 같은 브랜치 재사용 방지)
    const stderr = e.stderr?.toString() || '';
    if (stderr.includes('rejected') || stderr.includes('non-fast-forward')) {
      console.warn('[gitOps] push rejected, force-with-lease 재시도');
      await execa('git', ['push', '--force-with-lease', '-u', 'origin', branch], { cwd });
    } else {
      throw new Error(`git push 실패: ${stderr || e.message}`);
    }
  }

  return { commitSha: sha.trim(), branchName: branch };
}

/**
 * worktree 제거. 성공 시 worktree 디렉토리 삭제, 실패 시 failed/ 디렉토리로 이동 (디버깅용).
 */
export async function removeWorktree(taskId: string, success: boolean): Promise<void> {
  const cfg = getConfig();
  const wtPath = worktreePath(taskId);

  if (!(await exists(wtPath))) return;

  if (success) {
    try {
      await runGit(cfg.repoPath, ['worktree', 'remove', '--force', wtPath]);
      console.log(`[gitOps] worktree 제거 완료: ${wtPath}`);
    } catch (err) {
      console.warn('[gitOps] worktree remove 실패:', (err as Error).message);
      await fs.rm(wtPath, { recursive: true, force: true });
    }
  } else {
    const failedDir = path.join(cfg.worktreeRoot, 'failed');
    await ensureDir(failedDir);
    const destName = `suggestion-${taskId}-${Date.now()}`;
    const dest = path.join(failedDir, destName);
    try {
      // git worktree metadata 연결 먼저 해제
      await runGit(cfg.repoPath, ['worktree', 'remove', '--force', wtPath]).catch(() => {
        /* ignore */
      });
      // 이미 제거됐다면 move 불필요
      if (await exists(wtPath)) {
        await fs.rename(wtPath, dest);
        console.log(`[gitOps] 실패한 worktree 보존: ${dest}`);
      }
    } catch (err) {
      console.warn('[gitOps] 실패 worktree 이동 실패:', (err as Error).message);
    }
  }
}

export function getWorktreePath(taskId: string): string {
  return worktreePath(taskId);
}

export function getBranchName(taskId: string): string {
  return branchName(taskId);
}
