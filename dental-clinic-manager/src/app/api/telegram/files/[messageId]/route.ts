/**
 * 텔레그램 첨부파일 서버 프록시
 *
 *   GET /api/telegram/files/[messageId]
 *
 * 동기:
 *  - 텔레그램 봇 파일은 file_id → getFile → file_path 흐름이며, file_path 는
 *    1시간 후 만료된다. 기존 코드(supabase webhook)는 만료 후에도 죽은 URL 을
 *    DB 에 보관해 클릭 시 Telegram 이 `{"ok":false,"error_code":404}` 응답을
 *    그대로 사용자에게 노출하고 있었다.
 *  - 또한 그 URL 에는 BOT_TOKEN 이 포함되어 DB / 브라우저에 노출되는 보안 사고
 *    도 동반되어 있어, 토큰은 서버에만 두고 사용자에게는 우리 라우트만 보이도록 한다.
 *
 * 동작:
 *  - messageId(telegram_messages.id)로 file_id 조회
 *  - 사용자 권한 확인: 해당 그룹의 멤버 / owner / master_admin / 또는 그룹
 *    visibility 가 public_read 이상이어야 다운로드 허용 (private + 비멤버 거부)
 *  - getFile 호출 → file_path 수신 → telegram CDN 에서 파일을 fetch → 그대로 stream
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await context.params
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ error: 'DB error' }, { status: 500 })

  // 1) 메시지 + 그룹 정보 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: msg } = await (supabase as any)
    .from('telegram_messages')
    .select('id, telegram_group_id, file_id, file_name, file_mime_type, file_size')
    .eq('id', messageId)
    .maybeSingle()
  if (!msg || !msg.file_id) {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: group } = await (supabase as any)
    .from('telegram_groups')
    .select('id, visibility, created_by')
    .eq('id', msg.telegram_group_id)
    .maybeSingle()
  if (!group) {
    return NextResponse.json({ error: '그룹을 찾을 수 없습니다' }, { status: 404 })
  }

  // 2) 권한 확인
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }
  let allowed = false
  // master_admin
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: u } = await (supabase as any).from('users').select('role').eq('id', user.id).maybeSingle()
  if (u?.role === 'master_admin') allowed = true
  // owner
  if (!allowed && group.created_by === user.id) allowed = true
  // 멤버
  if (!allowed) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: m } = await (supabase as any)
      .from('telegram_group_members')
      .select('id')
      .eq('telegram_group_id', group.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (m) allowed = true
  }
  // public_read 이상이면 비멤버도 허용
  if (!allowed && (group.visibility === 'public_read' || group.visibility === 'public_full')) {
    allowed = true
  }
  if (!allowed) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  // 3) Telegram getFile → file_path
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN 미설정' }, { status: 500 })
  }
  const getFileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(msg.file_id)}`)
  const getFileJson = await getFileRes.json() as { ok: boolean; result?: { file_path: string }; description?: string }
  if (!getFileJson.ok || !getFileJson.result?.file_path) {
    console.error('[telegram-files] getFile failed:', getFileJson)
    return NextResponse.json({ error: 'Telegram getFile 실패' }, { status: 502 })
  }

  // 4) 실제 파일 stream
  const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${getFileJson.result.file_path}`)
  if (!fileRes.ok || !fileRes.body) {
    return NextResponse.json({ error: 'Telegram 파일 다운로드 실패' }, { status: 502 })
  }

  const headers = new Headers()
  const contentType = fileRes.headers.get('content-type') || msg.file_mime_type || 'application/octet-stream'
  headers.set('Content-Type', contentType)
  const contentLength = fileRes.headers.get('content-length') || (msg.file_size ? String(msg.file_size) : '')
  if (contentLength) headers.set('Content-Length', contentLength)
  if (msg.file_name) {
    const safe = encodeURIComponent(msg.file_name)
    headers.set('Content-Disposition', `inline; filename*=UTF-8''${safe}`)
  }
  // 캐싱 정책 — 1시간 (file_path 와 동일 한도)
  headers.set('Cache-Control', 'private, max-age=3600')

  return new Response(fileRes.body, { status: 200, headers })
}
