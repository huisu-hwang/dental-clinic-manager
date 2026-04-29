// 자동 감사 문자 발송 크론
// Vercel Cron schedule: "0 0 * * *" → 매일 KST 09:00 (UTC 00:00) 실행
// 각 클리닉의 referral_settings.auto_thanks_enabled = true인 곳을 대상으로
// 미발송 + (referred_at + auto_thanks_after_days <= today) 인 소개 건에 일괄 발송
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

const ALIGO_API_URL = 'https://apis.aligo.in'

interface ReferralRow {
  id: string
  clinic_id: string
  referrer_dentweb_patient_id: string
  referee_dentweb_patient_id: string
  referred_at: string
  referrer: { id: string; patient_name: string; phone_number: string | null } | null
  referee: { patient_name: string } | null
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  if (!isVercelCron) {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret.trim()}`) {
      return new NextResponse('Unauthorized', { status: 401 })
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ success: false, error: 'Supabase configuration missing' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const today = new Date().toISOString().slice(0, 10)
  const summary = { totalSent: 0, totalFailed: 0, clinicsProcessed: 0, errors: [] as string[] }

  const { data: settings, error: setErr } = await supabase
    .from('referral_settings')
    .select('clinic_id, auto_thanks_enabled, auto_thanks_after_days, thanks_template_id, clinic:clinics(name)')
    .eq('auto_thanks_enabled', true)
  if (setErr) return NextResponse.json({ success: false, error: setErr.message }, { status: 500 })

  type SettingRow = {
    clinic_id: string
    auto_thanks_enabled: boolean
    auto_thanks_after_days: number
    thanks_template_id: string | null
    clinic: { name: string } | { name: string }[] | null
  }

  for (const s of ((settings ?? []) as unknown as SettingRow[])) {
    summary.clinicsProcessed++
    const clinicRel = Array.isArray(s.clinic) ? s.clinic[0] : s.clinic
    const clinicName = clinicRel?.name ?? '저희 병원'
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - (s.auto_thanks_after_days ?? 0))
    const cutoffStr = cutoffDate.toISOString().slice(0, 10)

    const { data: aligo } = await supabase
      .from('aligo_settings')
      .select('api_key, user_id, sender_number')
      .eq('clinic_id', s.clinic_id)
      .single()
    if (!aligo?.api_key || !aligo.user_id || !aligo.sender_number) {
      summary.errors.push(`${clinicName}: aligo 미설정`)
      continue
    }

    let templateContent = `안녕하세요, ${clinicName}입니다. {{환자명}}님 덕분에 {{소개받은신환명}}님을 모실 수 있게 되어 진심으로 감사드립니다.`
    if (s.thanks_template_id) {
      const { data: t } = await supabase.from('recall_sms_templates').select('content').eq('id', s.thanks_template_id).single()
      if (t?.content) templateContent = t.content
    } else {
      const { data: t } = await supabase
        .from('recall_sms_templates')
        .select('content')
        .eq('clinic_id', s.clinic_id)
        .eq('name', '소개 감사 인사')
        .eq('is_active', true)
        .maybeSingle()
      if (t?.content) templateContent = t.content
    }

    const { data: pending } = await supabase
      .from('patient_referrals')
      .select(`
        id, clinic_id, referrer_dentweb_patient_id, referee_dentweb_patient_id, referred_at,
        referrer:dentweb_patients!patient_referrals_referrer_dentweb_patient_id_fkey (id, patient_name, phone_number),
        referee:dentweb_patients!patient_referrals_referee_dentweb_patient_id_fkey (patient_name)
      `)
      .eq('clinic_id', s.clinic_id)
      .is('thanks_sms_sent_at', null)
      .lte('referred_at', cutoffStr)
      .limit(50)

    for (const r of (pending ?? []) as unknown as ReferralRow[]) {
      if (!r.referrer?.phone_number) continue
      const message = templateContent
        .replace(/\{\{환자명\}\}/g, r.referrer.patient_name)
        .replace(/\{\{소개받은신환명\}\}/g, r.referee?.patient_name ?? '신환')
        .replace(/\{\{병원명\}\}/g, clinicName)

      const byteSize = new Blob([message]).size
      const msgType = byteSize > 90 ? 'LMS' : 'SMS'

      const fd = new FormData()
      fd.append('key', aligo.api_key)
      fd.append('user_id', aligo.user_id)
      fd.append('sender', aligo.sender_number)
      fd.append('receiver', r.referrer.phone_number)
      fd.append('msg', message)
      fd.append('msg_type', msgType)
      if (msgType === 'LMS') fd.append('title', '소개 감사 인사')

      try {
        const res = await fetch(`${ALIGO_API_URL}/send/`, { method: 'POST', body: fd })
        const json = await res.json()
        const ok = json.result_code === '1'
        await supabase.from('referral_sms_logs').insert({
          clinic_id: s.clinic_id,
          referral_id: r.id,
          recipient_dentweb_patient_id: r.referrer.id,
          phone_number: r.referrer.phone_number,
          message_content: message,
          message_type: msgType,
          status: ok ? 'sent' : 'failed',
          aligo_msg_id: json.msg_id ?? null,
          error_message: ok ? null : json.message,
        })
        if (ok) {
          await supabase.from('patient_referrals').update({ thanks_sms_sent_at: new Date().toISOString() }).eq('id', r.id)
          summary.totalSent++
        } else {
          summary.totalFailed++
          summary.errors.push(`${clinicName}: ${r.referrer.patient_name} - ${json.message}`)
        }
      } catch (e) {
        summary.totalFailed++
        summary.errors.push(`${clinicName}: ${r.referrer.patient_name} - ${(e as Error).message}`)
      }
    }
  }

  return NextResponse.json({ success: true, executedAt: today, ...summary })
}
