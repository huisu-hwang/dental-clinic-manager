import { getConfig } from './config.js';
import {
  claimTask,
  getPostById,
  getTaskById,
  updateTask,
  type AiSuggestionTask,
} from './supabase.js';
import {
  commitAndPush,
  createWorktree,
  getBranchName,
  hasChanges,
  removeWorktree,
  verifyBuild,
} from './gitOps.js';
import { runClaude } from './claudeRunner.js';
import { createPullRequest } from './githubOps.js';

const WORKER_LOG_MAX = 20_000;

function trimLog(s: string): string {
  if (!s) return '';
  if (s.length <= WORKER_LOG_MAX) return s;
  return s.slice(-WORKER_LOG_MAX);
}

/**
 * Promise를 타임아웃과 함께 실행.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`[timeout] ${label} (${ms}ms 초과)`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * 주기적으로 status='cancelled' 체크. cancelled 감지 시 AbortSignal 발동.
 */
function startCancellationWatcher(
  taskId: string,
  onCancel: () => void,
  intervalMs = 10_000
): () => void {
  let stopped = false;
  const timer = setInterval(async () => {
    if (stopped) return;
    try {
      const t = await getTaskById(taskId);
      if (t?.status === 'cancelled') {
        console.warn(`[taskRunner] 태스크 ${taskId} cancelled 감지`);
        onCancel();
      }
    } catch (err) {
      console.warn('[taskRunner] 취소 감시 중 오류:', (err as Error).message);
    }
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/**
 * 단일 태스크를 처음부터 끝까지 수행.
 * @returns 성공 여부
 */
export async function runTask(task: AiSuggestionTask): Promise<boolean> {
  const cfg = getConfig();
  const taskId = task.id;
  const branch = getBranchName(taskId);

  console.log(`\n========== [taskRunner] 태스크 시작: ${taskId} ==========`);

  // 1. pending → running 원자 전환
  const claimed = await claimTask(taskId, branch);
  if (!claimed) {
    console.log(`[taskRunner] 태스크 ${taskId} 이미 다른 프로세스에서 처리 중, 스킵`);
    return false;
  }

  // 취소 감시 준비
  let cancelled = false;
  const stopWatcher = startCancellationWatcher(taskId, () => {
    cancelled = true;
  });

  const checkCancelled = () => {
    if (cancelled) {
      throw new Error('태스크가 cancelled 상태로 전환됨');
    }
  };

  const wtPath = `${cfg.worktreeRoot}/suggestion-${taskId}`;
  let success = false;

  try {
    await withTimeout(
      (async () => {
        // 2. 원 게시글 조회
        const post = await getPostById(claimed.post_id);
        if (!post) {
          throw new Error(`원 게시글을 찾을 수 없음 (post_id=${claimed.post_id})`);
        }
        checkCancelled();

        // 3. worktree 생성
        await createWorktree(taskId);
        checkCancelled();

        // 4. Claude에게 구현 위임
        console.log('[taskRunner] Claude 코드 수정 시작...');
        const claudeResult = await runClaude({
          worktreePath: wtPath,
          post,
          taskId,
        });
        checkCancelled();

        if (claudeResult.stoppedReason === 'unable_to_implement') {
          throw new Error(`Claude 구현 불가: ${claudeResult.summary}`);
        }
        if (claudeResult.stoppedReason === 'max_iterations') {
          throw new Error('Claude 최대 반복 횟수 초과 (완료하지 못함)');
        }

        // 변경사항이 없으면 실패로 처리
        if (!(await hasChanges(wtPath))) {
          throw new Error('변경사항 없음 — Claude가 파일을 수정하지 않았습니다.');
        }

        // 5. 빌드 검증 (실패 시 Claude에게 재수정 요청)
        console.log('[taskRunner] 빌드 검증 시작...');
        const buildResult = await verifyBuild(
          wtPath,
          cfg.maxBuildRetries,
          async (attempt, _stdout, stderr) => {
            checkCancelled();
            console.log(`[taskRunner] 빌드 실패 → Claude에게 수정 요청 (시도 ${attempt})`);
            const errSnippet = stderr.slice(-4000);
            const followUp = `이전 시도에서 \`npm run build\`가 실패했습니다. 아래 에러 로그를 참고하여 빌드가 통과하도록 수정해주세요.\n\n\`\`\`\n${errSnippet}\n\`\`\``;
            const retry = await runClaude({
              worktreePath: wtPath,
              post,
              taskId,
              followUpInstruction: followUp,
            });
            if (retry.stoppedReason === 'unable_to_implement') {
              throw new Error(`Claude 구현 불가(빌드 수정): ${retry.summary}`);
            }
            // 요약 머지
            claudeResult.summary = `${claudeResult.summary}\n\n### 빌드 수정 (시도 ${attempt})\n${retry.summary}`;
          }
        );
        checkCancelled();

        if (!buildResult.ok) {
          throw new Error(
            `빌드 실패 (${buildResult.attempts}회 시도):\n${buildResult.lastStderr.slice(-2000)}`
          );
        }

        // 6. commit + push
        console.log('[taskRunner] commit & push...');
        const commitResult = await commitAndPush(wtPath, post, taskId, claudeResult.summary);
        if (!commitResult) {
          throw new Error('커밋할 변경사항이 없습니다.');
        }
        checkCancelled();

        // 7. PR 생성
        console.log('[taskRunner] PR 생성...');
        const prResult = await createPullRequest({
          cwd: wtPath,
          branch: commitResult.branchName,
          post,
          task: claimed,
          summary: claudeResult.summary,
        });
        checkCancelled();

        // 8. 성공 업데이트
        await updateTask(taskId, {
          status: 'completed',
          pr_url: prResult.prUrl,
          pr_number: prResult.prNumber,
          commit_sha: commitResult.commitSha,
          completed_at: new Date().toISOString(),
          worker_log: trimLog(claudeResult.summary),
        });

        success = true;
        console.log(
          `[taskRunner] ✅ 태스크 ${taskId} 완료 — PR: ${prResult.prUrl} (#${prResult.prNumber ?? '?'})`
        );
      })(),
      cfg.taskTimeoutMs,
      `task ${taskId}`
    );
  } catch (err) {
    const msg = (err as Error).message || String(err);
    console.error(`[taskRunner] ❌ 태스크 ${taskId} 실패:`, msg);
    try {
      await updateTask(taskId, {
        status: cancelled ? 'cancelled' : 'failed',
        error_message: msg.slice(0, 4000),
        completed_at: new Date().toISOString(),
      });
    } catch (updateErr) {
      console.error('[taskRunner] 상태 업데이트 실패:', updateErr);
    }
  } finally {
    stopWatcher();
    // worktree 정리
    try {
      await removeWorktree(taskId, success);
    } catch (err) {
      console.warn('[taskRunner] worktree 정리 실패:', (err as Error).message);
    }
    console.log(`========== [taskRunner] 태스크 종료: ${taskId} (success=${success}) ==========\n`);
  }

  return success;
}
