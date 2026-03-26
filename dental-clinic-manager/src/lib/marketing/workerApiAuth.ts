import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * 워커 API 인증 헬퍼
 * Authorization: Bearer <worker_api_key> 헤더를 검증
 */
export async function verifyWorkerApiKey(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const apiKey = authHeader.slice(7);
  if (!apiKey) return null;

  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data } = await admin
    .from('marketing_worker_control')
    .select('id, worker_api_key')
    .eq('id', 'main')
    .eq('worker_api_key', apiKey)
    .single();

  if (!data) return null;

  return admin;
}
