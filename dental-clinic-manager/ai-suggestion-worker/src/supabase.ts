import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from './config.js';

export interface AiSuggestionTask {
  id: string;
  post_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  branch_name?: string | null;
  pr_url?: string | null;
  pr_number?: number | null;
  commit_sha?: string | null;
  worker_log?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  requested_by?: string | null;
}

export interface CommunityPost {
  id: string;
  title: string;
  content: string;
  author_id?: string | null;
  created_at?: string;
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const cfg = getConfig();
  client = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
}

export async function getTaskById(taskId: string): Promise<AiSuggestionTask | null> {
  const { data, error } = await getSupabase()
    .from('ai_suggestion_tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();
  if (error) {
    console.error('[supabase] getTaskById error:', error);
    throw error;
  }
  return (data as AiSuggestionTask) || null;
}

export async function getPostById(postId: string): Promise<CommunityPost | null> {
  const { data, error } = await getSupabase()
    .from('community_posts')
    .select('id, title, content, author_id, created_at')
    .eq('id', postId)
    .maybeSingle();
  if (error) {
    console.error('[supabase] getPostById error:', error);
    throw error;
  }
  return (data as CommunityPost) || null;
}

export type TaskPatch = Partial<
  Pick<
    AiSuggestionTask,
    | 'status'
    | 'branch_name'
    | 'pr_url'
    | 'pr_number'
    | 'commit_sha'
    | 'worker_log'
    | 'error_message'
    | 'started_at'
    | 'completed_at'
  >
>;

export async function updateTask(taskId: string, patch: TaskPatch): Promise<AiSuggestionTask | null> {
  const { data, error } = await getSupabase()
    .from('ai_suggestion_tasks')
    .update(patch)
    .eq('id', taskId)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[supabase] updateTask error:', error);
    throw error;
  }
  return (data as AiSuggestionTask) || null;
}

/**
 * pending → running 전환을 원자적으로 수행 (경쟁 조건 방지).
 * 이미 다른 워커가 잡아갔으면 null 반환.
 */
export async function claimTask(taskId: string, branchName: string): Promise<AiSuggestionTask | null> {
  const { data, error } = await getSupabase()
    .from('ai_suggestion_tasks')
    .update({
      status: 'running',
      branch_name: branchName,
      started_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('status', 'pending')
    .select()
    .maybeSingle();
  if (error) {
    console.error('[supabase] claimTask error:', error);
    throw error;
  }
  return (data as AiSuggestionTask) || null;
}

export async function listPendingTasks(): Promise<AiSuggestionTask[]> {
  const { data, error } = await getSupabase()
    .from('ai_suggestion_tasks')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[supabase] listPendingTasks error:', error);
    throw error;
  }
  return (data as AiSuggestionTask[]) || [];
}
