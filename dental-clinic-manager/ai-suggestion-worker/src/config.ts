import 'dotenv/config';

export interface WorkerConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  anthropicApiKey: string;
  repoPath: string;
  worktreeRoot: string;
  githubToken: string;
  maxBuildRetries: number;
  taskTimeoutMs: number;
  claudeModel: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`[config] 필수 환경변수 누락: ${name}`);
  }
  return value.trim();
}

function optionalNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`[config] 환경변수 ${name}는 양수여야 합니다 (got: ${raw})`);
  }
  return parsed;
}

export function loadConfig(): WorkerConfig {
  const cfg: WorkerConfig = {
    supabaseUrl: requireEnv('SUPABASE_URL'),
    supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    anthropicApiKey: requireEnv('ANTHROPIC_API_KEY'),
    repoPath: requireEnv('REPO_PATH'),
    worktreeRoot: requireEnv('WORKTREE_ROOT'),
    githubToken: requireEnv('GITHUB_TOKEN'),
    maxBuildRetries: optionalNumber('MAX_BUILD_RETRIES', 3),
    taskTimeoutMs: optionalNumber('TASK_TIMEOUT_MS', 1_800_000),
    claudeModel: process.env.CLAUDE_MODEL?.trim() || 'claude-opus-4-5',
  };

  // REPO_PATH, WORKTREE_ROOT 경로 기본 sanity: 절대경로만 허용
  if (!cfg.repoPath.startsWith('/')) {
    throw new Error(`[config] REPO_PATH는 절대경로여야 합니다 (got: ${cfg.repoPath})`);
  }
  if (!cfg.worktreeRoot.startsWith('/')) {
    throw new Error(`[config] WORKTREE_ROOT는 절대경로여야 합니다 (got: ${cfg.worktreeRoot})`);
  }

  return cfg;
}

let cached: WorkerConfig | null = null;
export function getConfig(): WorkerConfig {
  if (!cached) cached = loadConfig();
  return cached;
}
