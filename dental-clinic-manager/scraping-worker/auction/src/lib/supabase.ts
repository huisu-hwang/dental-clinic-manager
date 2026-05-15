import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import 'dotenv/config'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')

// HTTP keep-alive 연결이 장시간 idle 후 죽는 문제가 있어
// 클라이언트를 재생성할 수 있도록 builder 를 export.
export function createSupabaseClient(): SupabaseClient {
  return createClient(url!, key!, { auth: { persistSession: false } })
}

export const supabase = createSupabaseClient()
