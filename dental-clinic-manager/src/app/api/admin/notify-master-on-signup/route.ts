// 신규 회원가입 발생 시 마스터(master_admin)의 휴대폰으로 승인 요청 SMS 를 발송한다.
// SignupForm 가입 성공 직후 fire-and-forget 으로 호출된다.
//
// 정책:
// - 마스터의 핵심 책임은 신규 대표원장(owner) 가입 승인이므로 role='owner' 일 때만 발송.
// - 비-owner 가입은 본인 clinic 의 owner 가 승인하는 흐름이라 마스터에게 알리지 않는다.
// - 알리고 키는 마스터의 clinic 또는 시스템 첫 활성 설정을 사용 (별도 환경 변수 없이 동작).

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { aligoFetch } from '@/lib/aligoFetch'

const ALIGO_API_URL = 'https://apis.aligo.in'

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/[^0-9]/g, '')
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { userId?: string }
    const userId = body.userId
    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database connection not available' }, { status: 500 })
    }

    // 1) 신규 가입자 정보 조회
    const { data: newUser, error: newUserErr } = await supabase
      .from('users')
      .select('id, name, email, role, status, clinic_id, clinic:clinics(name)')
      .eq('id', userId)
      .single()
    if (newUserErr || !newUser) {
      return NextResponse.json({ success: false, error: '신규 가입자 조회 실패' }, { status: 404 })
    }
    if (newUser.status !== 'pending') {
      return NextResponse.json({ success: true, skipped: 'not pending' })
    }
    // owner 가입에만 마스터에게 발송
    if (newUser.role !== 'owner') {
      return NextResponse.json({ success: true, skipped: 'not owner role' })
    }

    // 2) 마스터 사용자 + 전화번호 조회
    const { data: masters } = await supabase
      .from('users')
      .select('id, name, phone, clinic_id')
      .eq('role', 'master_admin')
      .eq('status', 'active')

    const targets = (masters ?? [])
      .map((m) => ({ ...m, phone: normalizePhone(m.phone) }))
      .filter((m) => m.phone.length >= 10)

    if (targets.length === 0) {
      return NextResponse.json({ success: false, error: '전화번호가 등록된 마스터 계정이 없습니다.' }, { status: 400 })
    }

    // 3) 발송용 알리고 설정: 마스터 본인의 clinic → 시스템 첫 활성 설정 순으로 폴백
    let aligo: { api_key: string; user_id: string; sender_number: string } | null = null
    for (const m of targets) {
      if (!m.clinic_id) continue
      const { data } = await supabase
        .from('aligo_settings')
        .select('api_key, user_id, sender_number')
        .eq('clinic_id', m.clinic_id)
        .maybeSingle()
      if (data?.api_key && data?.user_id && data?.sender_number) {
        aligo = data as any
        break
      }
    }
    if (!aligo) {
      const { data } = await supabase
        .from('aligo_settings')
        .select('api_key, user_id, sender_number')
        .not('api_key', 'is', null)
        .not('user_id', 'is', null)
        .not('sender_number', 'is', null)
        .limit(1)
        .maybeSingle()
      if (data?.api_key && data?.user_id && data?.sender_number) aligo = data as any
    }
    if (!aligo) {
      return NextResponse.json({ success: false, error: '알리고 발송 설정을 찾지 못했습니다.' }, { status: 400 })
    }

    // 4) 메시지 구성
    const origin = process.env.NEXT_PUBLIC_SITE_URL || req.headers.get('origin') || req.nextUrl.origin
    const dashboardUrl = `${origin}/master`
    const clinicName = ((newUser as any).clinic?.name as string | undefined) ?? '신규 치과'
    const message =
      `[클리닉매니저] 신규 대표원장 가입 승인 요청\n` +
      `· ${newUser.name} (${newUser.email})\n` +
      `· ${clinicName}\n` +
      `승인하기: ${dashboardUrl}`
    const msgBytes = new Blob([message]).size
    const actualType = msgBytes > 90 ? 'LMS' : 'SMS'
    const title = '신규 가입 승인 요청'

    // 5) 각 마스터에게 발송
    const results: Array<{ userId: string; phone: string; ok: boolean; aligoCode?: string | number; message?: string }> = []
    for (const m of targets) {
      const params = new URLSearchParams()
      params.append('key', aligo.api_key)
      params.append('user_id', aligo.user_id)
      params.append('sender', aligo.sender_number)
      params.append('receiver', m.phone)
      params.append('msg', message)
      params.append('msg_type', actualType)
      if (actualType !== 'SMS') params.append('title', title)
      if (process.env.NODE_ENV === 'development') params.append('testmode_yn', 'Y')

      try {
        const res = await aligoFetch(`${ALIGO_API_URL}/send/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        })
        const json = (await res.json()) as { result_code: string | number; message: string; msg_id?: string | number }
        const codeNum = Number(json.result_code)
        const ok = Number.isFinite(codeNum) && codeNum >= 1
        results.push({ userId: m.id, phone: m.phone, ok, aligoCode: json.result_code, message: json.message })
      } catch (e) {
        results.push({ userId: m.id, phone: m.phone, ok: false, message: e instanceof Error ? e.message : String(e) })
      }
    }

    return NextResponse.json({ success: true, sent: results })
  } catch (e) {
    console.error('[notify-master-on-signup] error:', e)
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'unknown error' }, { status: 500 })
  }
}
